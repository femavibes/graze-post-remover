import dotenv from 'dotenv';
dotenv.config();

function parseRemovalLabels(labelsString) {
  if (!labelsString) return {};
  
  const labels = {};
  // Split by label pairs first (comma followed by word and colon)
  const labelPairs = labelsString.split(/,(?=\w+:)/);
  
  labelPairs.forEach(pair => {
    const colonIndex = pair.indexOf(':');
    if (colonIndex === -1) return;
    
    const label = pair.substring(0, colonIndex).trim();
    const feedsString = pair.substring(colonIndex + 1).trim();
    
    if (label && feedsString) {
      const feeds = feedsString.split(',').map(f => f.trim()).filter(f => f);
      labels[label] = feeds;
    }
  });
  
  return labels;
}

export const config = {
  LABELER_SOCKET_URL: process.env.LABELER_SOCKET_URL,
  CURSOR_FILEPATH: process.env.CURSOR_FILEPATH || 'cursor.txt',
  LOG_LEVEL: process.env.LOG_LEVEL || 'INFO',
  GRAZE_REMOVAL_LABELS: parseRemovalLabels(process.env.GRAZE_REMOVAL_LABELS),
  BSKY_HANDLE: process.env.BSKY_HANDLE,
  BSKY_APP_PASSWORD: process.env.BSKY_APP_PASSWORD,
  GRAZE_SESSION_COOKIE: process.env.GRAZE_SESSION_COOKIE,
  OZONE_URL: process.env.OZONE_URL,
  LABELER_DID: process.env.LABELER_DID,
  OZONE_POLLING_SECONDS: parseInt(process.env.OZONE_POLLING_SECONDS) || 30
};