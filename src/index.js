import WebSocket from 'ws';
import { decodeFirst } from '@atcute/cbor';
import { readFileSync, writeFileSync } from 'fs';
import chokidar from 'chokidar';
import { config } from './config.js';
import { removePostFromGraze } from './graze.js';

let cursor = 0;

// Load cursor from file
try {
  const cursorData = readFileSync(config.CURSOR_FILEPATH, 'utf8').trim();
  cursor = parseInt(cursorData) || 0;
  console.log(`Loaded cursor: ${cursor}`);
} catch (e) {
  console.log('Starting with cursor 0, error:', e.message);
}



// Save cursor periodically
setInterval(() => {
  writeFileSync(config.CURSOR_FILEPATH, cursor.toString());
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

connectWebSocket();