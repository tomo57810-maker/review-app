import { h, revokeAll, runLeave } from './util.js';
import * as S from './store.js';
import { addView } from './add.js';
import { studyView } from './study.js';
import { quizView } from './quiz.js';
import { manageView } from './manage.js';

const routes = { add: addView, study: studyView, quiz: quizView, manage: manageView };
const root = document.getElementById('view');

async function render() {
  runLeave();
  revokeAll();
  const [path, qs = ''] = location.hash.slice(2).split('?');
  const name = routes[path] ? path : 'study';
  document.querySelectorAll('#tabs a').forEach((a) => a.classList.toggle('on', a.dataset.tab === name));
  root.replaceChildren();
  try {
    await routes[name](root, Object.fromEntries(new URLSearchParams(qs)));
  } catch (e) {
    root.append(h('pre', { class: 'error' }, String(e.stack || e)));
  }
  window.scrollTo(0, 0);
}

await S.reload();
window.addEventListener('hashchange', render);
if (!location.hash) location.hash = '#/study';
else render();

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
navigator.storage?.persist?.().catch(() => {});
