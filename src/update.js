// 自動アップデートのボタン（一覧のヘッダーと編集画面のタイトルバーに出す）
import { icon } from './icons.js';

let st = null; // null（何もない）| { state: 'available' | 'downloading' | 'ready' | 'error', ... }

export const updateSlot = () => '<span id="update-slot"></span>';

// ボタンを今の状態で描く。画面を作り直したあとにも呼ぶ
export function paintUpdate() {
  const slot = document.getElementById('update-slot');
  if (!slot) return;
  if (!st) { slot.innerHTML = ''; return; }
  const [label, act] = {
    available: [`${icon('download')}アップデート v${st.version}`, 'download'],
    downloading: [`ダウンロード中 ${st.percent ?? 0}%`, ''],
    ready: [`${icon('refresh')}再起動して更新`, 'install'],
    error: ['更新に失敗しました。もう一度試す', 'download'],
  }[st.state];
  slot.innerHTML = `<button class="btn update ${st.state}" ${act ? `data-update="${act}"` : 'aria-disabled="true"'}>${label}</button>`;
}

window.api.onUpdate((s) => {
  if (s.state === 'error' && !st) return; // 起動時の確認の失敗（オフラインなど）は知らせない
  st = s;
  paintUpdate();
});

document.addEventListener('click', (e) => {
  const act = e.target.closest('[data-update]')?.dataset.update;
  if (act === 'download') {
    st = { state: 'downloading', percent: 0 };
    paintUpdate();
    window.api.downloadUpdate().catch(() => { st = { state: 'error' }; paintUpdate(); });
  } else if (act === 'install') {
    window.api.installUpdate(); // 保存していない変更は、閉じる直前に書き込まれる（store.js）
  }
});
