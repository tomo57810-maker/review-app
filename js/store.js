// データの意味づけ層(種別ツリー・項目・復習スケジュール)
import * as db from './db.js';

export const state = { cats: [], items: [] };

export const uid = () =>
  crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2);

export async function reload() {
  [state.cats, state.items] = await Promise.all([db.getAll('cats'), db.getAll('items')]);
}

/* ---------- 種別ツリー ---------- */
const collator = new Intl.Collator('ja', { numeric: true });
export const catById = (id) => state.cats.find((c) => c.id === id);

export function children(pid) {
  return state.cats
    .filter((c) => (c.parentId || null) === (pid || null))
    .sort((a, b) => collator.compare(a.name, b.name));
}

export function pathOf(id) {
  const out = [];
  const seen = new Set();
  let c = catById(id);
  while (c && !seen.has(c.id)) {
    seen.add(c.id);
    out.unshift(c);
    c = c.parentId ? catById(c.parentId) : null;
  }
  return out;
}

export const label = (id) => pathOf(id).map((c) => c.name).join(' › ') || '(未分類)';

export function flat() {
  const out = [];
  (function walk(pid, depth) {
    for (const c of children(pid)) {
      out.push({ id: c.id, label: label(c.id), depth });
      walk(c.id, depth + 1);
    }
  })(null, 0);
  return out;
}

export function descIds(id) {
  const out = [id];
  for (const c of children(id)) out.push(...descIds(c.id));
  return out;
}

export function countItems(catId) {
  const ids = new Set(descIds(catId));
  return state.items.filter((i) => ids.has(i.catId)).length;
}

export async function ensurePath(parts, parentId = null) {
  let pid = parentId;
  for (const name of parts) {
    let c = state.cats.find((x) => (x.parentId || null) === (pid || null) && x.name === name);
    if (!c) {
      c = { id: uid(), name, parentId: pid || null };
      await db.put('cats', c);
      state.cats.push(c);
    }
    pid = c.id;
  }
  return pid;
}

export async function saveCat(c) {
  await db.put('cats', c);
}

export async function removeCat(id) {
  await db.del('cats', id);
  state.cats = state.cats.filter((c) => c.id !== id);
}

/* ---------- 項目 ---------- */
export function newItem(fields) {
  return {
    id: uid(), catId: null, question: '', answer: '', note: '',
    imageIds: [], fileIds: [], links: [],
    created: Date.now(), updated: Date.now(), box: 0, due: 0, reviews: 0,
    ...fields,
  };
}

export async function saveItem(it) {
  it.updated = Date.now();
  await db.put('items', it);
  const i = state.items.findIndex((x) => x.id === it.id);
  if (i >= 0) state.items[i] = it;
  else state.items.push(it);
  return it;
}

export async function removeItem(it) {
  for (const b of [...it.imageIds, ...it.fileIds]) await db.del('blobs', b);
  await db.del('items', it.id);
  state.items = state.items.filter((x) => x.id !== it.id);
}

/* ---------- 添付(Blob) ---------- */
export async function saveBlob(file) {
  const id = uid();
  await db.put('blobs', { id, name: file.name || 'image.png', type: file.type, blob: file });
  return id;
}
export const getBlob = (id) => db.get('blobs', id);
export const dropBlob = (id) => db.del('blobs', id);

/* ---------- 復習スケジュール(ライトナー式) ---------- */
export const INTERVALS = [0, 1, 3, 7, 14, 30, 60]; // box(習熟レベル)ごとの次回までの日数
const DAY = 864e5;

export async function grade(it, res) {
  if (res === 'ok') {
    it.box = Math.min(it.box + 1, INTERVALS.length - 1);
    it.due = Date.now() + INTERVALS[it.box] * DAY;
  } else if (res === 'meh') {
    it.due = Date.now() + DAY;
  } else {
    it.box = 0;
    it.due = Date.now();
  }
  it.reviews++;
  it.last = res;
  return saveItem(it);
}
