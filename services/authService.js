const AUTH_STORAGE_KEY = "desktopPlant.mockAuthUser";
const MOCK_USER_ID = "user_001";

export function signIn(email, storage = getStorage()) {
  const normalizedEmail = String(email || "").trim();
  if (!normalizedEmail) {
    throw new Error("请输入 email");
  }

  const user = {
    id: MOCK_USER_ID,
    email: normalizedEmail,
    signedInAt: new Date().toISOString(),
  };
  safeSet(storage, AUTH_STORAGE_KEY, JSON.stringify(user));
  return user;
}

export function signOut(storage = getStorage()) {
  safeRemove(storage, AUTH_STORAGE_KEY);
}

export function getCurrentUser(storage = getStorage()) {
  const raw = safeGet(storage, AUTH_STORAGE_KEY);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw);
    if (parsed?.id && parsed?.email) {
      return parsed;
    }
  } catch (_error) {
    return null;
  }

  return null;
}

export function isLoggedIn(storage = getStorage()) {
  return Boolean(getCurrentUser(storage));
}

function getStorage() {
  return globalThis.window?.localStorage || globalThis.localStorage;
}

function safeGet(storage, key) {
  try {
    return storage?.getItem(key);
  } catch (_error) {
    return null;
  }
}

function safeSet(storage, key, value) {
  try {
    storage?.setItem(key, value);
  } catch (_error) {
    // Demo auth should not break the app if storage is unavailable.
  }
}

function safeRemove(storage, key) {
  try {
    storage?.removeItem(key);
  } catch (_error) {
    // Demo auth should not break the app if storage is unavailable.
  }
}
