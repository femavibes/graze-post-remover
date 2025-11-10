import { readFileSync, writeFileSync } from 'fs';

const SESSION_FILE = 'graze_session.json';

export function saveSession(sessionCookie) {
  const sessionData = {
    cookie: sessionCookie,
    timestamp: Date.now()
  };
  writeFileSync(SESSION_FILE, JSON.stringify(sessionData));
}

export function loadSession() {
  try {
    const data = JSON.parse(readFileSync(SESSION_FILE, 'utf8'));
    const age = Date.now() - data.timestamp;
    
    // Session expires after 24 hours
    if (age > 24 * 60 * 60 * 1000) {
      return null;
    }
    
    return data.cookie;
  } catch (e) {
    return null;
  }
}

export function clearSession() {
  try {
    writeFileSync(SESSION_FILE, '{}');
  } catch (e) {
    // Ignore errors
  }
}