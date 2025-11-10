import { config } from './config.js';
import { loadSession, saveSession, clearSession } from './session.js';

let sessionString = null;
let authPromise = null;

export async function getGrazeSessionString() {
  if (sessionString) {
    return sessionString;
  }
  
  if (authPromise) {
    return authPromise;
  }
  
  // Try to load from persistent storage
  sessionString = loadSession();
  if (sessionString) {
    console.log('Using cached Graze session');
    return sessionString;
  }
  
  authPromise = authenticateWithGraze();
  sessionString = await authPromise;
  authPromise = null;
  return sessionString;
}

async function authenticateWithGraze() {
  
  if (!config.BSKY_HANDLE || !config.BSKY_APP_PASSWORD) {
    throw new Error('Missing BSKY_HANDLE or BSKY_APP_PASSWORD');
  }
  
  // Login to Graze using correct endpoint and payload format
  const response = await fetch('https://api.graze.social/app/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      username: config.BSKY_HANDLE,
      password: config.BSKY_APP_PASSWORD,
      service_domain: ''
    })
  });
  
  if (!response.ok) {
    throw new Error(`Graze auth failed: ${response.status} ${response.statusText}`);
  }
  
  // Extract session_cookie from Set-Cookie header
  const setCookieHeader = response.headers.get('set-cookie');
  if (setCookieHeader) {
    const match = setCookieHeader.match(/session_cookie=([^;]+)/);
    if (match) {
      sessionString = match[1];
      saveSession(sessionString);
      console.log('Successfully authenticated with Graze');
      return sessionString;
    }
  }
  
  throw new Error('Failed to extract session_cookie from Graze auth response');
}

export function clearSessionString() {
  sessionString = null;
  authPromise = null;
  clearSession();
}