// 項目の添付(画像・資料・リンク)の表示を、学習画面と小テストで共有する
import { h, blobUrl } from './util.js';
import * as S from './store.js';

export function attachmentsEl(it) {
  const box = h('div', { class: 'att' });
  for (const id of it.imageIds) {
    const img = h('img', { class: 'thumb', alt: '' });
    box.append(img);
    S.getBlob(id).then((b) => {
      if (!b) return;
      const u = blobUrl(b.blob);
      img.src = u;
      img.onclick = () => window.open(u, '_blank');
    });
  }
  for (const id of it.fileIds) {
    const a = h('a', { class: 'chip', href: '#' }, '📎 ');
    box.append(a);
    S.getBlob(id).then((b) => {
      if (!b) return;
      a.append(b.name);
      a.href = blobUrl(b.blob);
      a.download = b.name;
    });
  }
  for (const l of it.links) {
    box.append(h('a', { class: 'chip', href: l.url, target: '_blank', rel: 'noopener' }, '🔗 ' + (l.title || l.url)));
  }
  return box;
}

export function hasAttachments(it) {
  return it.imageIds.length || it.fileIds.length || it.links.length || it.note;
}
