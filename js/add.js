// 登録・編集画面
import { h, onLeave, toast, go } from './util.js';
import * as S from './store.js';

async function takeShare() {
  if (!('caches' in window)) return null;
  const c = await caches.open('share-inbox');
  const base = document.baseURI;
  const m = await c.match(new URL('__share/meta', base));
  if (!m) return null;
  const meta = await m.json();
  const files = [];
  for (let i = 0; i < meta.files; i++) {
    const r = await c.match(new URL('__share/file-' + i, base));
    if (r) {
      const name = decodeURIComponent(r.headers.get('x-name') || 'shared-' + i);
      files.push(new File([await r.blob()], name, { type: r.headers.get('content-type') || '' }));
    }
  }
  await caches.delete('share-inbox');
  return { ...meta, files };
}

export async function addView(root, params) {
  const editing = params.id ? S.state.items.find((i) => i.id === params.id) : null;
  const last = localStorage.getItem('lastCat');
  const draft = {
    catId: editing ? editing.catId : S.catById(last) ? last : null,
    question: editing?.question || '',
    answer: editing?.answer || '',
    note: editing?.note || '',
    images: [], // {id|null, blob, name}
    files: [],
    links: editing ? editing.links.map((l) => ({ ...l })) : [],
  };
  if (editing) {
    for (const id of editing.imageIds) { const b = await S.getBlob(id); if (b) draft.images.push({ id, blob: b.blob, name: b.name }); }
    for (const id of editing.fileIds) { const b = await S.getBlob(id); if (b) draft.files.push({ id, blob: b.blob, name: b.name }); }
  }
  if (params.text) draft.answer = params.text;
  if (params.src) draft.links.push({ url: params.src, title: '' });
  if (params.share) {
    const sh = await takeShare();
    if (sh) {
      draft.answer = sh.text || sh.title || '';
      if (sh.url) draft.links.push({ url: sh.url, title: sh.title || '' });
      sh.files.forEach((f) => draft.images.push({ id: null, blob: f, name: f.name }));
      toast('共有された内容を取り込みました');
    }
  }

  /* --- 種別プルダウン --- */
  const catSel = h('select', { id: 'cat', onchange: () => (draft.catId = catSel.value || null) });
  function fillCats() {
    catSel.replaceChildren(
      h('option', { value: '' }, '(未分類)'),
      ...S.flat().map((c) => h('option', { value: c.id }, '　'.repeat(c.depth) + (c.depth ? '└ ' : '') + c.label.split(' › ').pop()))
    );
    catSel.value = draft.catId || '';
  }
  fillCats();

  const newCatInput = h('input', { type: 'text', placeholder: '例: 機械/給排水衛生/給水(/で階層を区切る)' });
  async function addCat(underSelected) {
    const parts = newCatInput.value.split(/[\/／>＞→›]/).map((s) => s.trim()).filter(Boolean);
    if (!parts.length) return;
    draft.catId = await S.ensurePath(parts, underSelected ? draft.catId : null);
    newCatInput.value = '';
    newCatPanel.hidden = true;
    fillCats();
  }
  const newCatPanel = h('div', { class: 'panel', hidden: true },
    newCatInput,
    h('div', { class: 'row' },
      h('button', { type: 'button', class: 'btn', onclick: () => addCat(true) }, '選択中の種別の下に追加'),
      h('button', { type: 'button', class: 'btn', onclick: () => addCat(false) }, '最上位に追加'))
  );

  /* --- 入力欄 --- */
  const answerEl = h('textarea', { rows: 4, placeholder: '覚えたいことを入力、またはコピペ', oninput: () => (draft.answer = answerEl.value) });
  answerEl.value = draft.answer;
  const questionEl = h('input', { type: 'text', placeholder: '質問(空欄でもOK)', oninput: () => (draft.question = questionEl.value) });
  questionEl.value = draft.question;
  const noteEl = h('textarea', { rows: 2, placeholder: '出典・補足など(任意)', oninput: () => (draft.note = noteEl.value) });
  noteEl.value = draft.note;

  /* --- 画像 --- */
  const thumbs = h('div', { class: 'att' });
  function renderThumbs() {
    thumbs.replaceChildren(
      ...draft.images.map((im, i) => {
        const u = URL.createObjectURL(im.blob);
        return h('div', { class: 'thumbwrap' },
          h('img', { class: 'thumb', src: u, alt: '', onload: () => URL.revokeObjectURL(u) }),
          h('button', { type: 'button', class: 'x', onclick: () => { draft.images.splice(i, 1); renderThumbs(); } }, '×'));
      })
    );
  }
  renderThumbs();
  const addImages = (files) => {
    const imgs = [...files].filter((f) => f.type.startsWith('image/'));
    imgs.forEach((f) => draft.images.push({ id: null, blob: f, name: f.name }));
    if (imgs.length) renderThumbs();
    return imgs.length;
  };
  const imgInput = h('input', { type: 'file', accept: 'image/*', multiple: true, hidden: true, onchange: () => { addImages(imgInput.files); imgInput.value = ''; } });
  const dropzone = h('div', { class: 'drop', tabindex: 0, onclick: () => imgInput.click() }, '画像・スクショ: クリック/タップで選択、または貼り付け(Ctrl+V)・ドロップ');
  dropzone.addEventListener('dragover', (e) => e.preventDefault());
  dropzone.addEventListener('drop', (e) => { e.preventDefault(); addImages(e.dataTransfer.files); });
  const onPaste = (e) => {
    const files = [...(e.clipboardData?.files || [])];
    if (files.length && addImages(files)) { e.preventDefault(); toast('画像を貼り付けました'); }
  };
  document.addEventListener('paste', onPaste);
  onLeave(() => document.removeEventListener('paste', onPaste));

  /* --- 資料ファイル --- */
  const fileList = h('div', { class: 'att' });
  function renderFiles() {
    fileList.replaceChildren(...draft.files.map((f, i) =>
      h('span', { class: 'chip' }, '📎 ' + f.name, h('button', { type: 'button', class: 'x inline', onclick: () => { draft.files.splice(i, 1); renderFiles(); } }, '×'))));
  }
  renderFiles();
  const fileInput = h('input', { type: 'file', multiple: true, hidden: true, onchange: () => {
    [...fileInput.files].forEach((f) => draft.files.push({ id: null, blob: f, name: f.name }));
    fileInput.value = '';
    renderFiles();
  } });

  /* --- リンク --- */
  const linkBox = h('div', {});
  function renderLinks() {
    linkBox.replaceChildren(...draft.links.map((l, i) => {
      const u = h('input', { type: 'url', placeholder: 'https://...', oninput: () => (l.url = u.value) });
      u.value = l.url;
      const t = h('input', { type: 'text', placeholder: '表示名(任意)', oninput: () => (l.title = t.value) });
      t.value = l.title || '';
      return h('div', { class: 'row link' }, u, t, h('button', { type: 'button', class: 'x inline', onclick: () => { draft.links.splice(i, 1); renderLinks(); } }, '×'));
    }));
  }
  renderLinks();

  /* --- 保存 --- */
  async function save(next) {
    if (!draft.question.trim() && !draft.answer.trim() && !draft.images.length) {
      toast('ひと言まとめ・質問・画像のいずれかを入力してください');
      return;
    }
    const it = editing || S.newItem({});
    const oldIds = [...it.imageIds, ...it.fileIds];
    const keep = async (list) => {
      const ids = [];
      for (const x of list) { if (!x.id) x.id = await S.saveBlob(x.blob); ids.push(x.id); }
      return ids;
    };
    it.imageIds = await keep(draft.images);
    it.fileIds = await keep(draft.files);
    for (const id of oldIds) if (![...it.imageIds, ...it.fileIds].includes(id)) await S.dropBlob(id);
    it.catId = draft.catId;
    it.question = draft.question.trim();
    it.answer = draft.answer.trim();
    it.note = draft.note.trim();
    it.links = draft.links.filter((l) => l.url.trim()).map((l) => ({ url: l.url.trim(), title: (l.title || '').trim() }));
    await S.saveItem(it);
    if (draft.catId) localStorage.setItem('lastCat', draft.catId);
    if (next && !editing) {
      Object.assign(draft, { question: '', answer: '', note: '', images: [], files: [], links: [] });
      answerEl.value = questionEl.value = noteEl.value = '';
      renderThumbs(); renderFiles(); renderLinks();
      toast('登録しました。続けて入力できます');
      answerEl.focus();
    } else {
      toast(editing ? '更新しました' : '登録しました');
      go('#/study' + (draft.catId ? '?cat=' + draft.catId : ''));
    }
  }

  async function remove() {
    if (!confirm('この項目を削除しますか?')) return;
    await S.removeItem(editing);
    toast('削除しました');
    go('#/study' + (editing.catId ? '?cat=' + editing.catId : ''));
  }

  root.append(
    h('h2', {}, editing ? '項目を編集' : '登録'),
    h('label', {}, '種別'),
    h('div', { class: 'row' }, catSel, h('button', { type: 'button', class: 'btn', onclick: () => (newCatPanel.hidden = !newCatPanel.hidden) }, '＋種別')),
    newCatPanel,
    h('label', {}, 'ひと言まとめ(覚えたいこと)'),
    answerEl,
    h('label', {}, '質問'),
    questionEl,
    h('label', {}, 'メモ'),
    noteEl,
    h('label', {}, '画像・スクショ'),
    dropzone, imgInput, thumbs,
    h('label', {}, '関連資料(ファイル)'),
    h('div', { class: 'row' }, h('button', { type: 'button', class: 'btn', onclick: () => fileInput.click() }, '＋ファイルを選ぶ')),
    fileInput, fileList,
    h('label', {}, '関連リンク(URL)'),
    linkBox,
    h('button', { type: 'button', class: 'btn', onclick: () => { draft.links.push({ url: '', title: '' }); renderLinks(); } }, '＋リンクを追加'),
    h('div', { class: 'actions' },
      h('button', { type: 'button', class: 'btn primary', onclick: () => save(false) }, '保存'),
      editing
        ? h('button', { type: 'button', class: 'btn danger', onclick: remove }, '削除')
        : h('button', { type: 'button', class: 'btn', onclick: () => save(true) }, '保存して次へ'))
  );
  if (!editing) answerEl.focus();
}
