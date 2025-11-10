import dotenv from 'dotenv';
dotenv.config();

function parseRemovalLabels(labelsString) {
  if (!labelsString) return {};
  
  const labels = {};
  labelsString.split(',').forEach(item => {
    const [label, ...feedIds] = item.trim().split(':');
    if (label && feedIds.length > 0) {
      const feeds = feedIds.join(':').split(',').map(f => f.trim());
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
  GRAZE_SESSION_COOKIE: process.env.GRAZE_SESSION_COOKIE
};