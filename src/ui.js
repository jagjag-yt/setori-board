// 画面の共通部品：文字の安全な埋め込み、時刻表示、ダイアログ

// 名前などを HTML に埋め込むときは必ず通す（< などで画面が壊れないように）
export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

// 新しい id（例 "c_1a2b3c4d"）
export const newId = (prefix) => prefix + '_' + crypto.randomUUID().slice(0, 8);

export const LEVEL_NAMES = ['', '白', '緑', '青', '紫', '橙'];

// 段階バー（5 本、塗りの本数＝難易度）。色を見なくても難易度の順序が読めるようにするため
export const pipsHtml = (lv) =>
  `<span class="pips" aria-label="Lv.${lv} ${LEVEL_NAMES[lv]}">${[1, 2, 3, 4, 5].map((n) => `<i class="${n <= lv ? 'f' : ''}"></i>`).join('')}</span>`;

// 秒 → "m:ss"（digits=1 なら "m:ss.s"）
export function fmtTime(sec, digits = 0) {
  const t = Math.max(0, sec);
  const m = Math.floor(t / 60);
  const s = (t - m * 60).toFixed(digits).padStart(digits ? digits + 3 : 2, '0');
  return `${m}:${s}`;
}

// CSS の cubic-bezier と同じ緩急を返す関数を作る（rAF で自前アニメするとき用）
export function bezier(x1, y1, x2, y2) {
  const at = (t, a, b) => 3 * a * t * (1 - t) ** 2 + 3 * b * t * t * (1 - t) + t ** 3;
  return (x) => {
    let lo = 0, hi = 1;
    for (let i = 0; i < 20; i++) { const m = (lo + hi) / 2; at(m, x1, x2) < x ? (lo = m) : (hi = m); }
    return at((lo + hi) / 2, y1, y2);
  };
}
export const easeInOut = bezier(0.4, 0, 0.2, 1);

// ダイアログを開く。[data-act=cancel]・Esc・close() で閉じ、そのとき onClose が呼ばれる
export function openModal(html, { width = 480, onClose } = {}) {
  const scrim = document.createElement('div');
  scrim.className = 'scrim';
  scrim.innerHTML = `<div class="dialog" role="dialog" aria-modal="true" style="width:${width}px">${html}</div>`;
  document.body.append(scrim);
  const close = () => { if (scrim.isConnected) { scrim.remove(); onClose?.(); } };
  scrim.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  scrim.addEventListener('click', (e) => { if (e.target.closest('[data-act=cancel]')) close(); });
  (scrim.querySelector('[autofocus]') || scrim.querySelector('button')).focus();
  return { el: scrim.firstElementChild, close };
}

// はい／いいえの確認。true / false を返す（Promise は最初の resolve だけが有効）
export function confirmDialog(title, bodyHtml, okLabel, danger = false) {
  return new Promise((resolve) => {
    const m = openModal(`
      <h2>${esc(title)}</h2><p class="dialog-body">${bodyHtml}</p>
      <div class="actions"><button class="btn" data-act="cancel">キャンセル</button>
      <button class="btn ${danger ? 'danger' : 'primary'}" data-act="ok" autofocus>${esc(okLabel)}</button></div>`,
      { onClose: () => resolve(false) });
    m.el.querySelector('[data-act=ok]').onclick = () => { resolve(true); m.close(); };
  });
}

// 1 行入力。入力された文字列か、キャンセルなら null を返す
export function promptDialog(title, value, okLabel = '変更') {
  return new Promise((resolve) => {
    const m = openModal(`
      <h2>${esc(title)}</h2>
      <input class="input" value="${esc(value)}" autofocus>
      <p class="err"></p>
      <div class="actions"><button class="btn" data-act="cancel">キャンセル</button>
      <button class="btn primary" data-act="ok">${esc(okLabel)}</button></div>`,
      { onClose: () => resolve(null) });
    const input = m.el.querySelector('input');
    const err = m.el.querySelector('.err');
    input.select();
    const ok = () => {
      const v = input.value.trim();
      if (!v) { err.textContent = '名前を入力してください'; return; }
      resolve(v); m.close();
    };
    m.el.querySelector('[data-act=ok]').onclick = ok;
    input.addEventListener('input', () => { err.textContent = ''; });
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') ok(); });
  });
}
