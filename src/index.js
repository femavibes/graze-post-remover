import WebSocket from 'ws';
import { decodeFirst } from '@atcute/cbor';
import { readFileSync, writeFileSync } from 'fs';
import chokidar from 'chokidar';
import { AtpAgent } from '@atproto/api';
import { config } from './config.js';
import { removePostFromGraze } from './graze.js';

let cursor = 0;
let lastOzoneEventId = 0;

// Load cursor from file
try {
  const cursorData = readFileSync(config.CURSOR_FILEPATH, 'utf8').trim();
  cursor = parseInt(cursorData) || 0;
  console.log(`Loaded cursor: ${cursor}`);
} catch (e) {
  console.log('Starting with cursor 0, error:', e.message);
}

// Load Ozone cursor
try {
  const ozoneData = readFileSync('ozone_cursor.txt', 'utf8').trim();
  lastOzoneEventId = parseInt(ozoneData) || 0;
  console.log(`Loaded Ozone cursor: ${lastOzoneEventId}`);
} catch (e) {
  console.log('Starting with Ozone cursor 0, error:', e.message);
}



// Save cursors periodically
setInterval(() => {
  writeFileSync(config.CURSOR_FILEPATH, cursor.toString());
  writeFileSync('ozone_cursor.txt', lastOzoneEventId.toString());
}, 1000);

// Watch .env file for changes and reload config
chokidar.watch('.env').on('change', async () => {
  console.log('[CONFIG] .env file changed, reloading configuration...');
  try {
    // Re-import config with cache busting
    const timestamp = Date.now();
    const { config: newConfig } = await import(`./config.js?t=${timestamp}`);
    Object.assign(config, newConfig);
    console.log('[CONFIG] Configuration reloaded successfully');
    console.log('[CONFIG] Active labels:', Object.keys(config.GRAZE_REMOVAL_LABELS));
  } catch (error) {
    console.error('[CONFIG] Failed to reload configuration:', error.message);
  }
});

function connectWebSocket() {
  const url = `${config.LABELER_SOCKET_URL.replace('?cursor=0', '')}?cursor=${cursor}`;
  console.log(`Connecting to: ${url}`);
  
  const ws = new WebSocket(url);
  
  ws.on('open', () => {
    console.log('Connected to label stream');
  });
  
  ws.on('message', async (data) => {
    try {
      const [header, remainder] = decodeFirst(data);
      const [body, remainder2] = decodeFirst(remainder);
      
      if (remainder2.length > 0) {
        console.warn('Excess bytes in message, skipping');
        return;
      }
      
      if (header.op === 1 && header.t === '#labels') {
        cursor = body.seq;
        
        for (const label of body.labels) {
          await handleLabel(label);
        }
      }
    } catch (error) {
      console.error('Error processing message:', error);
    }
  });
  
  ws.on('close', () => {
    console.log('WebSocket closed, reconnecting in 5s...');
    setTimeout(connectWebSocket, 5000);
  });
  
  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });
}

async function handleLabel(label) {
  // Only process post labels (AT-URIs), skip account labels (DIDs)
  if (!label.uri.startsWith('at://')) {
    return;
  }
  
  // Skip label removals
  if (label.neg) {
    return;
  }
  
  const feedIds = config.GRAZE_REMOVAL_LABELS[label.val];
  if (!feedIds) {
    return;
  }
  
  console.log(`Processing label "${label.val}" for post: ${label.uri}`);
  
  try {
    await removePostFromGraze(label.uri, feedIds);
    console.log(`Successfully processed removal for ${label.uri}`);
  } catch (error) {
    console.error(`Failed to remove post ${label.uri}:`, error.message);
  }
}

// Start both monitoring systems
connectWebSocket();

// Start Ozone monitoring if configured
console.log('[OZONE] Checking Ozone configuration...');
console.log('[OZONE] OZONE_URL:', config.OZONE_URL ? 'SET' : 'MISSING');
console.log('[OZONE] BSKY_HANDLE:', config.BSKY_HANDLE ? 'SET' : 'MISSING');
console.log('[OZONE] LABELER_DID:', config.LABELER_DID ? 'SET' : 'MISSING');

if (config.OZONE_URL && config.BSKY_HANDLE && config.LABELER_DID) {
  console.log('[OZONE] All configuration present, starting Ozone monitoring...');
  startOzoneMonitoring();
} else {
  console.log('[OZONE] Ozone monitoring disabled - missing configuration');
  console.log('[OZONE] Required: OZONE_URL, BSKY_HANDLE, LABELER_DID');
}

async function startOzoneMonitoring() {
  console.log('[OZONE] Initializing Ozone monitoring...');
  console.log('[OZONE] Service URL: https://bsky.social');
  console.log('[OZONE] Handle:', config.BSKY_HANDLE);
  console.log('[OZONE] Polling interval:', config.OZONE_POLLING_SECONDS, 'seconds');
  
  const agent = new AtpAgent({ service: 'https://bsky.social' });
  
  try {
    console.log('[OZONE] Attempting login...');
    await agent.login({
      identifier: config.BSKY_HANDLE,
      password: config.BSKY_APP_PASSWORD,
    });
    console.log('[OZONE] ✅ Authenticated with Ozone successfully');
    
    // Start polling
    console.log('[OZONE] Starting polling every', config.OZONE_POLLING_SECONDS, 'seconds');
    setInterval(async () => {
      await pollOzoneEvents(agent);
    }, config.OZONE_POLLING_SECONDS * 1000);
    
    // Initial poll
    console.log('[OZONE] Running initial poll...');
    await pollOzoneEvents(agent);
  } catch (error) {
    console.error('[OZONE] ❌ Failed to authenticate with Ozone:', error.message);
    console.error('[OZONE] Full error:', error);
  }
}

async function pollOzoneEvents(agent) {
  try {
    console.log('[OZONE] Polling events from cursor:', lastOzoneEventId);
    const response = await agent.tools.ozone.moderation.queryEvents(
      {},
      {
        headers: {
          'atproto-proxy': `${config.LABELER_DID}#atproto_labeler`,
        },
      }
    );
    
    const events = response.data.events;
    console.log('[OZONE] Found', events.length, 'total events');
    
    let processedCount = 0;
    for (const event of events) {
      if (event.id > lastOzoneEventId) {
        console.log('[OZONE] Checking event ID:', event.id, 'type:', event.event.$type);
        if (event.event.$type === 'tools.ozone.moderation.defs#modEventAcknowledge' &&
            event.event.comment?.includes('AUTO_REMOVE_REQUEST')) {
          console.log('[OZONE] ✅ Found removal request:', event.event.comment);
          await handleOzoneRemovalEvent(event);
          processedCount++;
        }
        lastOzoneEventId = event.id;
      }
    }
    
    if (processedCount > 0) {
      console.log('[OZONE] Processed', processedCount, 'removal requests');
    } else {
      console.log('[OZONE] No new removal requests found');
    }
  } catch (error) {
    console.error('[OZONE] ❌ Error polling Ozone events:', error.message);
    console.error('[OZONE] Full error:', error);
  }
}

async function handleOzoneRemovalEvent(event) {
  console.log('[OZONE] Processing removal event:', event.id);
  console.log('[OZONE] Subject type:', event.subject.$type);
  console.log('[OZONE] Comment:', event.event.comment);
  
  if (event.subject.$type !== 'com.atproto.repo.strongRef') {
    console.log('[OZONE] ⚠️ Skipping non-post removal event');
    return;
  }
  
  const postUri = event.subject.uri;
  console.log(`[OZONE] 🛡️ Processing Ozone removal request for post: ${postUri}`);
  
  try {
    await removePostFromGraze(postUri, ['all']);
    console.log(`[OZONE] ✅ Successfully processed Ozone removal for ${postUri}`);
  } catch (error) {
    console.error(`[OZONE] ❌ Failed to remove post ${postUri} via Ozone:`, error.message);
  }
}