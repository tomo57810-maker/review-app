// 学習画面: 種別の階層をたどって見直す / 検索
import { h, go } from './util.js';
import * as S from './store.js';
import { attachmentsEl, hasAttachments } from './cards.js';

export async function studyView(root, params) {
  const catId = params.cat || null;
  const q = (params.q || '').trim();
  const hideAnswer = localStorage.getItem('hideAnswer') === '1';

  const search = h('input', { type: 'search', placeholder: '全体から検索', onkeydown: (e) => {
    if (e.key === 'Enter') go('#/study?q=' + encodeURIComponent(search.value) + (catId ? '&cat=' + catId : ''));
  } });
  search.value = q;

  const hideBox = h('input', { type: 'checkbox', onchange: () => {
    localStorage.setItem('hideAnswer', hideBox.checked ? '1' : '0');
    list.classList.toggle('hide-answer', hideBox.checked);
  } });
  hideBox.checked = hideAnswer;

  const crumbs = h('div', { class: 'crumbs' },
    h('a', { href: '#/study' }, 'すべて'),
    ...S.pathOf(catId).flatMap((c) => ['›', h('a', { href: '#/study?cat=' + c.id }, c.name)]));

  const list = h('div', { class: 'list' + (hideAnswer ? ' hide-answer' : '') });

  function card(it, showPath) {
    const body = h('div', { class: 'card' },
      showPath ? h('div', { class: 'path' }, S.label(it.catId)) : null,
      h('div', { class: 'q' }, it.question || '(質問なし)'),
      h('div', { class: 'a' }, it.answer || ''),
      h('div', { class: 'meta' }, `レベル ${it.box}`),
      h('a', { class: 'edit', href: '#/add?id=' + it.id }, '編集'));
    if (hasAttachments(it)) {
      body.append(h('details', {}, h('summary', {}, '資料・メモ'), it.note ? h('p', { class: 'note' }, it.note) : null, attachmentsEl(it)));
    }
    const a = body.querySelector('.a');
    a.addEventListener('click', () => a.classList.toggle('shown'));
    return body;
  }

  if (q) {
    const needle = q.toLowerCase();
    const hits = S.state.items.filter((i) =>
      [i.question, i.answer, i.note, ...i.links.map((l) => l.title + ' ' + l.url)].join('\n').toLowerCase().includes(needle));
    list.append(h('p', { class: 'hint' }, `「${q}」の検索結果: ${hits.length}件`), ...hits.map((i) => card(i, true)));
  } else {
    const subs = S.children(catId);
    const direct = S.state.items.filter((i) => (i.catId || null) === catId);
    if (subs.length) {
      list.append(h('div', { class: 'folders' }, ...subs.map((c) =>
        h('a', { class: 'folder', href: '#/study?cat=' + c.id }, '📁 ' + c.name, h('span', { class: 'count' }, S.countItems(c.id))))));
    }
    if (!subs.length && !direct.length) {
      list.append(h('p', { class: 'hint' }, S.state.items.length ? 'この種別にはまだ登録がありません。' : 'まだ何も登録されていません。「登録」タブから追加してください。'));
    }
    list.append(...direct.map((i) => card(i, false)));
  }

  root.append(
    h('h2', {}, '学習'),
    search,
    crumbs,
    h('div', { class: 'row between' },
      h('label', { class: 'check' }, hideBox, '答えを隠す(タップで表示)'),
      h('a', { class: 'btn', href: '#/quiz' + (catId ? '?cat=' + catId : '') }, 'この階層で小テスト')),
    list
  );
}
