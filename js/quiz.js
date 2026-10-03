// 小テスト: 質問を見て思い出し → 答えを見る → 自己採点(○△×)。結果で次回の出題時期が変わる。
import { h, shuffle } from './util.js';
import * as S from './store.js';
import { attachmentsEl } from './cards.js';

const MODES = [
  ['due', '復習の時期が来たもの(新規含む)'],
  ['weak', '苦手・未習得(レベル0〜1)'],
  ['all', 'すべて'],
];

export async function quizView(root, params) {
  const opt = { cat: params.cat || '', mode: 'due', count: '10' };

  function pool() {
    const ids = opt.cat ? new Set(S.descIds(opt.cat)) : null;
    let a = S.state.items.filter((i) => !ids || ids.has(i.catId));
    if (opt.mode === 'due') a = a.filter((i) => i.due <= Date.now());
    else if (opt.mode === 'weak') a = a.filter((i) => i.box <= 1);
    return a;
  }

  function setup() {
    const catSel = h('select', { onchange: () => { opt.cat = catSel.value; refresh(); } },
      h('option', { value: '' }, 'すべての種別'),
      ...S.flat().map((c) => h('option', { value: c.id }, '　'.repeat(c.depth) + c.label.split(' › ').pop())));
    catSel.value = opt.cat;
    const modeSel = h('select', { onchange: () => { opt.mode = modeSel.value; refresh(); } },
      ...MODES.map(([v, t]) => h('option', { value: v }, t)));
    modeSel.value = opt.mode;
    const countSel = h('select', { onchange: () => { opt.count = countSel.value; refresh(); } },
      ...[['5', '5問'], ['10', '10問'], ['20', '20問'], ['0', '全部']].map(([v, t]) => h('option', { value: v }, t)));
    countSel.value = opt.count;
    const info = h('p', { class: 'hint' });
    const start = h('button', { class: 'btn primary', onclick: () => run(shuffle(pool()).slice(0, opt.count === '0' ? undefined : +opt.count)) }, 'スタート');
    function refresh() {
      const n = pool().length;
      info.textContent = `対象: ${n}問`;
      start.disabled = n === 0;
    }
    refresh();
    root.replaceChildren(
      h('h2', {}, '小テスト'),
      h('label', {}, '範囲(選んだ種別の下の階層を含む)'), catSel,
      h('label', {}, '出題'), modeSel,
      h('label', {}, '問題数'), countSel,
      info,
      h('div', { class: 'actions' }, start));
  }

  function run(queue) {
    const results = [];
    let idx = 0;

    function show() {
      if (idx >= queue.length) return summary();
      const it = queue[idx];
      const ans = h('div', { class: 'answerbox', hidden: true },
        h('div', { class: 'a shown' }, it.answer || '(ひと言まとめなし)'),
        it.note ? h('p', { class: 'note' }, it.note) : null,
        attachmentsEl(it),
        h('div', { class: 'grade' },
          h('button', { class: 'btn ok', onclick: () => next(it, 'ok') }, '○ できた'),
          h('button', { class: 'btn meh', onclick: () => next(it, 'meh') }, '△ あやしい'),
          h('button', { class: 'btn ng', onclick: () => next(it, 'ng') }, '× できない')));
      const reveal = h('button', { class: 'btn primary', onclick: () => { ans.hidden = false; reveal.hidden = true; } }, '答えを見る');
      root.replaceChildren(
        h('div', { class: 'row between' }, h('strong', {}, `${idx + 1} / ${queue.length}`), h('button', { class: 'btn', onclick: () => (idx = queue.length, show()) }, '終了')),
        h('div', { class: 'card big' },
          h('div', { class: 'path' }, S.label(it.catId)),
          h('div', { class: 'q' }, it.question || `「${S.label(it.catId)}」で覚えたことを思い出そう`)),
        reveal, ans);
    }

    async function next(it, res) {
      await S.grade(it, res);
      results.push([it, res]);
      idx++;
      show();
    }

    function summary() {
      const cnt = (r) => results.filter((x) => x[1] === r).length;
      const miss = results.filter((x) => x[1] !== 'ok').map((x) => x[0]);
      root.replaceChildren(
        h('h2', {}, '結果'),
        h('p', { class: 'score' }, `○ ${cnt('ok')} / △ ${cnt('meh')} / × ${cnt('ng')}(${results.length}問)`),
        ...results.filter((x) => x[1] !== 'ok').map(([it, r]) =>
          h('div', { class: 'card' }, h('div', { class: 'q' }, (r === 'ng' ? '× ' : '△ ') + (it.question || S.label(it.catId))), h('div', { class: 'a shown' }, it.answer))),
        h('div', { class: 'actions' },
          miss.length ? h('button', { class: 'btn primary', onclick: () => run(shuffle(miss)) }, '間違えたものをもう一度') : null,
          h('button', { class: 'btn', onclick: setup }, '設定に戻る')));
    }

    show();
  }

  setup();
}
