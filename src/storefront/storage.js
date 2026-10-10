// Saved outfits for this browser. Storage can be missing or throw (private mode,
// some webviews), so every access is guarded and the feature hides itself.

const MAX_SAVED = 20;

export function createStore(key, storage = globalThis.localStorage) {
  const read = () => {
    try {
      const list = JSON.parse(storage.getItem(key) || '[]');
      return Array.isArray(list) ? list : [];
    } catch {
      return [];
    }
  };
  const write = (list) => {
    try {
      storage.setItem(key, JSON.stringify(list));
      return true;
    } catch {
      return false;
    }
  };

  let available = false;
  try {
    storage.setItem(`${key}:probe`, '1');
    storage.removeItem(`${key}:probe`);
    available = true;
  } catch {}

  return {
    available,
    list: read,
    /** Saving an identical outfit again moves it to the front instead of duplicating it. */
    save(code) {
      const list = read().filter((o) => o.code !== code);
      list.unshift({ code, savedAt: Date.now() });
      return write(list.slice(0, MAX_SAVED));
    },
    remove(code) {
      return write(read().filter((o) => o.code !== code));
    },
  };
}
