// Excel / CSV の取り込み(SheetJS を使うときだけ読み込む)
import { h, toast } from './util.js';
import * as S from './store.js';

const XLSX_URL = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';

async function loadXLSX() {
  if (window.XLSX) return;
  await new Promise((res, rej) => {
    const s = h('script', { src: XLSX_URL, onload: res, onerror: () => rej(new Error('Excel読込ライブラリを取得できません(オンライン接続が必要です)')) });
    document.head.append(s);
  });
}

async function readRows(file) {
  await loadXLSX();
  let wb;
  if (/\.(csv|tsv|txt)$/i.test(file.name)) {
    const buf = await file.arrayBuffer();
    let text = new TextDecoder('utf-8').decode(buf);
    if (text.includes('�')) text = new TextDecoder('shift_jis').decode(buf); // Excel保存のCSV対策
    wb = XLSX.read(text, { type: 'string' });
  } else {
    wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
  }
  return wb;
}

const colName = (i) => {
  let s = '';
  for (i++; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + ((i - 1) % 26)) + s;
  return s;
};

function guess(header) {
  const find = (re) => header.findIndex((x) => re.test(String(x)));
  return {
    cat: header.map((x, i) => (/種別|分類|カテゴリ|階層|大項目|中項目|小項目/.test(x) ? i : -1)).filter((i) => i >= 0),
    q: find(/質問|問題/),
    a: find(/まとめ|答え|回答|覚えたい|ひと言|一言/),
    note: find(/メモ|備考|補足/),
    url: find(/URL|リンク/i),
  };
}

export function importPanel() {
  const out = h('div', {});
  const fileInput = h('input', { type: 'file', accept: '.xlsx,.xlsm,.xls,.csv,.tsv', onchange: async () => {
    const f = fileInput.files[0];
    if (!f) return;
    try {
      const wb = await readRows(f);
      showSheet(wb);
    } catch (e) {
      out.replaceChildren(h('p', { class: 'error' }, String(e.message || e)));
    }
    fileInput.value = '';
  } });

  function showSheet(wb) {
    const sheetSel = h('select', { onchange: () => mapping(wb, sheetSel.value) }, ...wb.SheetNames.map((n) => h('option', { value: n }, n)));
    out.replaceChildren(wb.SheetNames.length > 1 ? h('label', {}, 'シート') : null, wb.SheetNames.length > 1 ? sheetSel : null, h('div', { id: 'map' }));
    mapping(wb, wb.SheetNames[0]);
  }

  function mapping(wb, sheetName) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: '' }).filter((r) => r.some((c) => String(c).trim()));
    const area = out.querySelector('#map');
    if (!rows.length) { area.replaceChildren(h('p', { class: 'hint' }, 'データがありません')); return; }
    const width = Math.max(...rows.map((r) => r.length));
    let hasHeader = true;
    let map = guess(rows[0].map(String));
    const catCols = new Set(map.cat);

    const headerBox = h('input', { type: 'checkbox', checked: true, onchange: () => { hasHeader = headerBox.checked; if (hasHeader) map = { ...guess(rows[0].map(String)), cat: [...catCols] }; render(); } });
    const colLabel = (i) => colName(i) + '列' + (hasHeader && rows[0][i] !== '' ? ': ' + String(rows[0][i]).slice(0, 12) : '');
    const colSel = (key) => {
      const s = h('select', { onchange: () => { map[key] = +s.value; render(); } },
        h('option', { value: -1 }, '(使わない)'), ...Array.from({ length: width }, (_, i) => h('option', { value: i }, colLabel(i))));
      s.value = map[key];
      return s;
    };
    const fallback = h('select', {}, h('option', { value: '' }, '(未分類)'), ...S.flat().map((c) => h('option', { value: c.id }, c.label)));
    const preview = h('div', { class: 'preview' });
    const info = h('p', { class: 'hint' });

    const dataRows = () => (hasHeader ? rows.slice(1) : rows);
    const cell = (r, i) => (i >= 0 && r[i] != null ? String(r[i]).trim() : '');

    function render() {
      const ok = dataRows().filter((r) => cell(r, map.q) || cell(r, map.a));
      info.textContent = `取り込み対象: ${ok.length}行(質問・ひと言まとめがどちらも空の行は除きます)`;
      preview.replaceChildren(h('table', {},
        h('tr', {}, ...['種別', '質問', 'ひと言まとめ'].map((t) => h('th', {}, t))),
        ...ok.slice(0, 5).map((r) => h('tr', {},
          h('td', {}, [...catCols].map((c) => cell(r, c)).filter(Boolean).join(' / ')),
          h('td', {}, cell(r, map.q)), h('td', {}, cell(r, map.a))))));
    }

    const catChecks = h('div', { class: 'row wrap' }, ...Array.from({ length: width }, (_, i) =>
      h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: catCols.has(i), onchange: (e) => { e.target.checked ? catCols.add(i) : catCols.delete(i); render(); } }), colLabel(i))));

    async function run() {
      let added = 0, skipped = 0;
      for (const r of dataRows()) {
        const q = cell(r, map.q), a = cell(r, map.a);
        if (!q && !a) continue;
        const parts = [...catCols].sort((x, y) => x - y).flatMap((c) => cell(r, c).split(/[\/／>＞→›]/).map((s) => s.trim()).filter(Boolean));
        const catId = parts.length ? await S.ensurePath(parts) : fallback.value || null;
        if (S.state.items.some((i) => i.catId === catId && i.question === q && i.answer === a)) { skipped++; continue; }
        const links = cell(r, map.url).split(/\s+/).filter((u) => /^https?:\/\//.test(u)).map((u) => ({ url: u, title: '' }));
        await S.saveItem(S.newItem({ catId, question: q, answer: a, note: cell(r, map.note), links }));
        added++;
      }
      toast(`${added}件を取り込みました` + (skipped ? `(重複${skipped}件はスキップ)` : ''));
      out.replaceChildren(h('p', {}, `${added}件を取り込みました` + (skipped ? `(重複${skipped}件はスキップ)` : '')));
    }

    area.replaceChildren(
      h('label', { class: 'check' }, headerBox, '1行目は見出し'),
      h('label', {}, '種別にする列(複数選ぶと左から順に階層になります。セル内の「/」でも階層を分けられます)'), catChecks,
      h('label', {}, '種別が空の行の保存先'), fallback,
      h('label', {}, '質問の列'), colSel('q'),
      h('label', {}, 'ひと言まとめの列'), colSel('a'),
      h('label', {}, 'メモの列'), colSel('note'),
      h('label', {}, 'URLの列'), colSel('url'),
      info, preview,
      h('div', { class: 'actions' }, h('button', { class: 'btn primary', onclick: run }, '取り込む')));
    render();
  }

  return h('div', {}, fileInput, h('p', { class: 'hint' }, 'Excelのセルに貼った画像は取り込めません(文字のみ)。'), out);
}
