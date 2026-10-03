// 管理画面: 種別の整理 / Excel取込 / バックアップ / クイック登録のしかけ
import { h, toast, download } from './util.js';
import * as S from './store.js';
import * as db from './db.js';
import { importPanel } from './importer.js';

const toDataURL = (blob) => new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(blob); });

async function exportAll() {
  const [items, cats, blobs] = await Promise.all([db.getAll('items'), db.getAll('cats'), db.getAll('blobs')]);
  const bl = [];
  for (const b of blobs) bl.push({ id: b.id, name: b.name, type: b.type, data: await toDataURL(b.blob) });
  const json = JSON.stringify({ app: 'review-app', version: 1, exported: new Date().toISOString(), items, cats, blobs: bl });
  const d = new Date();
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  download(new Blob([json], { type: 'application/json' }), `見直しアプリ_バックアップ_${stamp}.json`);
}

async function importAll(file) {
  const data = JSON.parse(await file.text());
  if (data.app !== 'review-app') throw new Error('このアプリのバックアップではありません');
  for (const c of data.cats) await db.put('cats', c);
  for (const b of data.blobs) await db.put('blobs', { id: b.id, name: b.name, type: b.type, blob: await (await fetch(b.data)).blob() });
  for (const i of data.items) await db.put('items', i);
  await S.reload();
  return data.items.length;
}

export async function manageView(root) {
  const catBox = h('div', {});

  function renderCats() {
    const rows = S.flat();
    catBox.replaceChildren(
      rows.length ? null : h('p', { class: 'hint' }, '種別はまだありません。「登録」画面の「＋種別」から作れます。'),
      ...rows.map((c) => {
        const cat = S.catById(c.id);
        const n = S.state.items.filter((i) => i.catId === c.id).length;
        const row = h('div', { class: 'catrow', style: `padding-left:${c.depth * 18}px` });
        const normal = () => row.replaceChildren(
          h('span', { class: 'name' }, cat.name, h('span', { class: 'count' }, n)),
          h('button', { class: 'btn small', onclick: rename }, '名前'),
          h('button', { class: 'btn small', onclick: move }, '移動'),
          h('button', { class: 'btn small danger', onclick: remove }, '削除'));
        async function rename() {
          const name = prompt('新しい名前', cat.name);
          if (!name || !name.trim()) return;
          cat.name = name.trim();
          await S.saveCat(cat);
          renderCats();
        }
        function move() {
          const banned = new Set(S.descIds(cat.id));
          const sel = h('select', {}, h('option', { value: '' }, '(最上位)'),
            ...S.flat().filter((x) => !banned.has(x.id)).map((x) => h('option', { value: x.id }, x.label)));
          sel.value = cat.parentId || '';
          row.replaceChildren(h('span', { class: 'name' }, cat.name + ' の移動先:'), sel,
            h('button', { class: 'btn small primary', onclick: async () => { cat.parentId = sel.value || null; await S.saveCat(cat); renderCats(); } }, '決定'),
            h('button', { class: 'btn small', onclick: normal }, 'やめる'));
        }
        async function remove() {
          if (S.children(cat.id).length || n) { toast('中身(下位の種別・項目)があるので削除できません'); return; }
          if (!confirm(`「${cat.name}」を削除しますか?`)) return;
          await S.removeCat(cat.id);
          renderCats();
        }
        normal();
        return row;
      }));
  }
  renderCats();

  const backupIn = h('input', { type: 'file', accept: '.json', hidden: true, onchange: async () => {
    try {
      const n = await importAll(backupIn.files[0]);
      toast(`${n}件を取り込みました`);
      renderCats();
    } catch (e) { toast(String(e.message || e)); }
    backupIn.value = '';
  } });

  const appUrl = location.href.split('#')[0];
  const bookmarklet = `javascript:(()=>{window.open('${appUrl}#/add?text='+encodeURIComponent(String(getSelection()))+'&src='+encodeURIComponent(location.href),'review','width=480,height=760')})()`;

  root.append(
    h('h2', {}, '管理'),
    h('p', { class: 'hint' }, `登録数: ${S.state.items.length}件 / 種別: ${S.state.cats.length}件`),

    h('h3', {}, '種別の整理'), catBox,

    h('h3', {}, 'Excel / CSV から取り込み'), importPanel(),

    h('h3', {}, 'バックアップ'),
    h('p', { class: 'hint' }, '今はデータがこの端末のブラウザ内だけにあります。定期的に書き出しておくと安心です。別の端末へ移すときにも使えます。'),
    h('div', { class: 'row' },
      h('button', { class: 'btn', onclick: exportAll }, '書き出し(JSON)'),
      h('button', { class: 'btn', onclick: () => backupIn.click() }, '取り込み(JSON)')),
    backupIn,

    h('h3', {}, 'PCから素早く登録する'),
    h('p', { class: 'hint' }, '下のリンクをブックマークバーにドラッグして登録します。Webページで文字を選んでからクリックすると、選択した文字とページURLが入った小さな登録ウィンドウが開きます。'),
    h('a', { class: 'btn', href: bookmarklet, onclick: (e) => { e.preventDefault(); toast('ブックマークバーへドラッグしてください'); } }, '📌 見直しに登録'),

    h('h3', {}, 'スマホから素早く登録する'),
    h('p', { class: 'hint' }, 'Chrome(Android)でこのアプリを「ホーム画面に追加」すると、他のアプリの「共有」メニューにこのアプリが出ます。文章やスクショを共有すると登録画面が開きます。iPhoneの共有メニューは非対応です。')
  );
}
