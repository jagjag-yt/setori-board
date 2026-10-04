// 保存まわり：変更のたびに呼んでよい。500ms まとめてから書き込む
const pending = new Map(); // パス → { data, timer }
let writing = 0;

// 「保存中…／保存済み」表示用。状態が変わるたびに呼ばれる
export let onSaveStatus = () => {};
export const setSaveStatusListener = (fn) => { onSaveStatus = fn; };
export const isSaved = () => pending.size === 0 && writing === 0;

export function save(rel, data) {
  const p = pending.get(rel);
  if (p) clearTimeout(p.timer);
  const timer = setTimeout(async () => {
    pending.delete(rel);
    writing++;
    try { await window.api.write(rel, data); } finally { writing--; onSaveStatus(isSaved()); }
  }, 500);
  pending.set(rel, { data, timer });
  onSaveStatus(false);
}

export const load = (rel) => window.api.read(rel);

// まだ書いていない保存を取り消す（削除したプロジェクトが書き戻されないように）
export function cancelSave(rel) {
  clearTimeout(pending.get(rel)?.timer);
  pending.delete(rel);
}

// ウィンドウを閉じる直前に、まだ書いていないものを同期で書き切る
window.addEventListener('beforeunload', () => {
  for (const [rel, { data, timer }] of pending) {
    clearTimeout(timer);
    window.api.writeSync(rel, data);
  }
  pending.clear();
});
