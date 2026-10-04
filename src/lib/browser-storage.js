/** Larger, durable browser backup. localStorage remains the immediate fallback. */
export function createBrowserBackup(indexedDB = globalThis.indexedDB) {
  if (!indexedDB) return null;
  let connection;
  function open() {
    if (!connection)
      connection = new Promise((resolve, reject) => {
        const request = indexedDB.open("anime-shuffle", 1);
        request.onupgradeneeded = () =>
          request.result.createObjectStore("profiles");
        request.onerror = () => reject(request.error);
        request.onblocked = () =>
          reject(new Error("Browser database is blocked."));
        request.onsuccess = () => {
          const db = request.result;
          db.onversionchange = () => {
            db.close();
            connection = null;
          };
          resolve(db);
        };
      }).catch((error) => {
        connection = null;
        throw error;
      });
    return connection;
  }
  async function transact(key, value, write) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("profiles", write ? "readwrite" : "readonly");
      const store = tx.objectStore("profiles");
      const request = write ? store.put(value, key) : store.get(key);
      tx.oncomplete = () => resolve(request.result);
      tx.onabort = () =>
        reject(tx.error || new Error("Browser save was interrupted."));
      tx.onerror = () => reject(tx.error || request.error);
    });
  }
  return {
    read: (key) => transact(key, undefined, false),
    write: (key, value) => transact(key, value, true),
  };
}

/** Delay access so browsers that deny localStorage can still start with IndexedDB. */
export function browserLocalStorage() {
  return {
    getItem: (key) => globalThis.localStorage.getItem(key),
    setItem: (key, value) => globalThis.localStorage.setItem(key, value),
  };
}
