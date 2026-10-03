// 保存層(IndexedDB)。クラウド同期を足すときは、この層だけを差し替える/拡張する。
const DB_NAME = 'review-app';
let dbp;

function open() {
  if (dbp) return dbp;
  dbp = new Promise((res, rej) => {
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = () => {
      const d = r.result;
      d.createObjectStore('items', { keyPath: 'id' });
      d.createObjectStore('cats', { keyPath: 'id' });
      d.createObjectStore('blobs', { keyPath: 'id' });
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  return dbp;
}

const p = (r) => new Promise((res, rej) => {
  r.onsuccess = () => res(r.result);
  r.onerror = () => rej(r.error);
});
const store = async (name, mode = 'readonly') => (await open()).transaction(name, mode).objectStore(name);

export const getAll = async (n) => p((await store(n)).getAll());
export const get = async (n, id) => p((await store(n)).get(id));
export const put = async (n, v) => { await p((await store(n, 'readwrite')).put(v)); return v; };
export const del = async (n, id) => p((await store(n, 'readwrite')).delete(id));
