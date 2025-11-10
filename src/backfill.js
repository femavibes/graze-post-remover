import WebSocket from 'ws';
import { decodeFirst } from '@atcute/cbor';
import { readFileSync } from 'fs';
import { config } from './config.js';
import { removePostFromGraze } from './graze.js';

const [labelName, backfillAmount] = process.argv.slice(2);

if (!labelName) {
  console.log('Usage: npm run backfill <labelname> [amount]');
  console.log('Examples:');
  console.log('  npm run backfill spam-remove 100    # Backfill last 100 events');
  console.log('  npm run backfill harassment-remove  # Backfill last 1000 events (default)');
  console.log('  npm run backfill nsfw-remove all    # Backfill from cursor 0');
  process.exit(1);
}

// Determine start cursor
let startCursor = 0;
if (backfillAmount === 'all') {
  startCursor = 0;
} else if (backfillAmount) {
  // Get current cursor and subtract backfill amount
  try {
    const currentCursor = parseInt(readFileSync('cursor.txt', 'utf8').trim()) || 0;
    startCursor = Math.max(0, currentCursor - parseInt(backfillAmount));
  } catch (e) {
    startCursor = 0;
  }
} else {
  // Default: backfill last 1000 events
  try {
    const currentCursor = parseInt(readFileSync('cursor.txt', 'utf8').trim()) || 0;
    startCursor = Math.max(0, currentCursor - 1000);
  } catch (e) {
    startCursor = 0;
  }
}

console.log(`[BACKFILL] Starting backfill for "${labelName}" from cursor ${startCursor}`);

const url = `${config.LABELER_SOCKET_URL.replace('?cursor=0', '')}?cursor=${startCursor}`;
const ws = new WebSocket(url);

let processedCount = 0;
let currentCursor = startCursor;

ws.on('open', () => {
  console.log(`[BACKFILL] Connected to label stream`);
});

ws.on('message', async (data) => {
  try {
    const [header, remainder] = decodeFirst(data);
    const [body, remainder2] = decodeFirst(remainder);
    
    if (remainder2.length > 0) {
      return;
    }
    
    if (header.op === 1 && header.t === '#labels') {
      currentCursor = body.seq;
      
      for (const label of body.labels) {
        await handleBackfillLabel(label);
      }
    }
  } catch (error) {
    console.error('[BACKFILL] Error processing message:', error);
  }
});

ws.on('close', () => {
  console.log(`[BACKFILL] Completed! Processed ${processedCount} "${labelName}" labels`);
  process.exit(0);
});

ws.on('error', (error) => {
  console.error('[BACKFILL] WebSocket error:', error);
  process.exit(1);
});

async function handleBackfillLabel(label) {
  // Only process post labels for the specific label we're backfilling
  if (!label.uri.startsWith('at://') || label.neg || label.val !== labelName) {
    return;
  }
  
  const feedIds = config.GRAZE_REMOVAL_LABELS[label.val];
  if (!feedIds) {
    console.log(`[BACKFILL] Label "${labelName}" not configured in GRAZE_REMOVAL_LABELS`);
    return;
  }
  
  console.log(`[BACKFILL] Processing "${label.val}" for post: ${label.uri}`);
  
  try {
    await removePostFromGraze(label.uri, feedIds);
    processedCount++;
    console.log(`[BACKFILL] Successfully processed removal for ${label.uri}`);
  } catch (error) {
    console.error(`[BACKFILL] Failed to remove post ${label.uri}:`, error.message);
  }
}