import { config } from './config.js';
import { getGrazeSessionString, clearSessionString } from './auth.js';

export async function removePostFromGraze(postUri, feedIds) {
  const url = config.GRAZE_REMOVE_ALL_URL;
  
  if (!url) {
    throw new Error('Missing GRAZE_REMOVE_ALL_URL');
  }
  
  for (const feedId of feedIds) {
    await removeFromSingleFeed(postUri, feedId, url);
  }
}

async function removeFromSingleFeed(postUri, feedId, url, retryCount = 0) {
  let sessionString;
  try {
    sessionString = await getGrazeSessionString();
  } catch (error) {
    console.log('Auth failed, using direct session cookie fallback');
    sessionString = config.GRAZE_SESSION_COOKIE;
    if (!sessionString) {
      throw new Error('No session available');
    }
  }
  
  const payload = feedId === 'all' 
    ? { at_uri: postUri }
    : { at_uri: postUri, algo_id: parseInt(feedId) };
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cookie': `session_cookie=${sessionString}`
    },
    body: JSON.stringify(payload)
  });
  
  if (response.status === 200 || response.status === 204) {
    console.log(`Removed post from feed ${feedId}`);
    return;
  }
  
  if (response.status === 401 && retryCount === 0) {
    console.log('Session expired, refreshing auth...');
    clearSessionString();
    return removeFromSingleFeed(postUri, feedId, url, 1);
  }
  
  if (response.status === 401) {
    throw new Error('CRITICAL: Authentication failed after retry');
  }
  
  if (response.status === 404) {
    console.warn(`Post not found in feed ${feedId}: ${postUri}`);
    return;
  }
  
  console.error(`Failed to remove from feed ${feedId}: ${response.status} ${response.statusText}`);
}