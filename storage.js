/* ============================================================
   storage.js
   ------------------------------------------------------------
   Handles saving and loading your data.

   Strategy (important to understand as a beginner):
   1. We ALWAYS save instantly to the browser's localStorage.
      This means the app feels fast and still works if you're
      offline, and it never loses data even if JSONBin is down.
   2. We ALSO push a copy up to JSONBin.io in the background,
      "debounced" (explained below), so that other devices
      (like your phone's Notion app) can pull the latest copy.
   3. When the app starts, we try to load from JSONBin first
      (the "source of truth" for syncing across devices). If
      that fails (no internet, bad config, etc.) we fall back
      to whatever is in localStorage so you're never stuck.

   WHAT IS "DEBOUNCING"?
   If you drag 5 tasks around in 2 seconds, we don't want to
   fire 5 separate network requests. Debouncing waits until
   you've paused for a bit (800ms) before actually sending the
   save — if another change comes in before that timer finishes,
   we restart the timer. End result: one save, sent shortly
   after you stop making changes.
   ============================================================ */

const LOCAL_STORAGE_KEY = "timeblocker_state_v1";

function isJsonbinConfigured() {
  return (
    JSONBIN_CONFIG.BIN_ID &&
    JSONBIN_CONFIG.ACCESS_KEY &&
    !JSONBIN_CONFIG.BIN_ID.startsWith("PASTE_") &&
    !JSONBIN_CONFIG.ACCESS_KEY.startsWith("PASTE_")
  );
}

function saveToLocalStorage(state) {
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(state));
  } catch (err) {
    console.warn("Could not save to localStorage:", err);
  }
}

function loadFromLocalStorage() {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    console.warn("Could not read from localStorage:", err);
    return null;
  }
}

async function loadFromCloud() {
  if (!isJsonbinConfigured()) return null;
  try {
    const res = await fetch(
      `${JSONBIN_CONFIG.BASE_URL}/${JSONBIN_CONFIG.BIN_ID}/latest`,
      { headers: { "X-Access-Key": JSONBIN_CONFIG.ACCESS_KEY } }
    );
    if (!res.ok) throw new Error(`JSONBin responded ${res.status}`);
    const json = await res.json();
    return json.record || null;
  } catch (err) {
    console.warn("Cloud load failed, will use local data instead:", err);
    return null;
  }
}

async function saveToCloud(state) {
  if (!isJsonbinConfigured()) return;
  try {
    const res = await fetch(`${JSONBIN_CONFIG.BASE_URL}/${JSONBIN_CONFIG.BIN_ID}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "X-Access-Key": JSONBIN_CONFIG.ACCESS_KEY,
      },
      body: JSON.stringify(state),
    });
    if (!res.ok) throw new Error(`JSONBin responded ${res.status}`);
    setSyncStatus("synced");
  } catch (err) {
    console.warn("Cloud save failed (your data is still safe locally):", err);
    setSyncStatus("error");
  }
}

let _saveTimer = null;
function debouncedSaveToCloud(state) {
  setSyncStatus("saving");
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(() => saveToCloud(state), 800);
}

// The very first load when the app opens: prefer the cloud copy
// (so a phone/Notion view picks up changes made elsewhere), but
// never block the app forever if the network is slow/unavailable.
async function loadInitialState() {
  const local = loadFromLocalStorage();
  const cloud = await loadFromCloud();
  if (cloud) {
    saveToLocalStorage(cloud); // keep local cache fresh
    return cloud;
  }
  return local; // null if this is truly the first run
}

// Small text indicator in the header so you can see saving status.
function setSyncStatus(status) {
  const el = document.getElementById("sync-status");
  if (!el) return;
  const map = {
    saving: "⏳ Saving…",
    synced: "✅ Synced",
    error: "⚠️ Saved locally (cloud sync failed)",
    offline: "💾 Local only (add your JSONBin key in config.js)",
  };
  el.textContent = map[status] || "";
}
