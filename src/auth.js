/**
 * auth.js — GOBARDHAN Authentication Module
 * Handles local dummy authentication (extendable to real auth later)
 */

const AUTH_KEY = 'gobardhan_auth';

// Credentials stored here (replace with real API call in production)
const VALID_CREDENTIALS = {
  username: 'admin',
  passwords: ['admin123', 'admin1234'],
};

/**
 * Attempt login with username/password
 * @returns {{ success: boolean, error?: string }}
 */
export function login(username, password) {
  const normalizedUsername = (username || '').trim().toLowerCase();
  const normalizedPassword = (password || '').trim();

  if (
    normalizedUsername === VALID_CREDENTIALS.username &&
    VALID_CREDENTIALS.passwords.includes(normalizedPassword)
  ) {
    const session = {
      username: normalizedUsername,
      loginTime: Date.now(),
    };
    sessionStorage.setItem(AUTH_KEY, JSON.stringify(session));
    return { success: true };
  }
  return { success: false, error: 'Invalid username or password.' };
}

/**
 * Logout — clear session
 */
export function logout() {
  sessionStorage.removeItem(AUTH_KEY);
}

/**
 * Check if user is authenticated
 * @returns {boolean}
 */
export function isAuthenticated() {
  try {
    const raw = sessionStorage.getItem(AUTH_KEY);
    if (!raw) return false;
    const session = JSON.parse(raw);
    return !!session?.username;
  } catch {
    return false;
  }
}

/**
 * Get the current session user
 * @returns {object|null}
 */
export function getSession() {
  try {
    const raw = sessionStorage.getItem(AUTH_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
