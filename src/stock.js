// 技ストック（全プロジェクト共通）：表示、追加・編集・削除、検索
import { esc, openModal, confirmDialog, newId, pipsHtml, LEVEL_NAMES } from './ui.js';
import { icon } from './icons.js';
import { save } from './store.js';

// 技の個数。null ＝ 個数を設定しない技。個数を決める前に登録した技（count が無い）は 3
export const DEFAULT_COUNT = 3;
export const trickCount = (t) => (t.count === undefined ? DEFAULT_COUNT : t.count);
// 表示用の「 (3)」（半角）。個数を設定しない技は空
export const countLabel = (t) => (trickCount(t) == null ? '' : ` (${trickCount(t)})`);

// 難易度ごとの 5 列。チップはドラッグでブロックへ配置できる（ドラッグの設定は editor.js）
export function stockColumnsHtml(stock, query = '') {
  if (!stock.tricks.length) {
    return '<p class="stock-empty">［＋ 技を追加］で技を登録しましょう。登録した技は、ブロックへドラッグして配置できます。</p>';
  }
  const q = query.trim().toLowerCase();
  return `<div class="stock-cols">${[1, 2, 3, 4, 5].map((lv) => {
    const tricks = stock.tricks.filter((t) => t.level === lv);
    const chips = tricks.map((t) => `
      <div class="chip lv${lv} ${q && !t.name.toLowerCase().includes(q) ? 'hidden' : ''}" data-trick="${t.id}" data-name="${esc(t.name)}"
        title="ドラッグでブロックへ配置／ダブルクリックで編集">${icon('grip')}<span>${esc(t.name)}${countLabel(t)}</span></div>`).join('');
    return `
      <div class="stock-col lv${lv}">
        <div class="col-head">${pipsHtml(lv)}<span>Lv.${lv}</span><span class="sub">${LEVEL_NAMES[lv]}</span><span class="col-count num">${tricks.length}</span></div>
        <div class="chips" data-level="${lv}">${chips}</div>
      </div>`;
  }).join('')}</div>`;
}

// 検索：チップを作り直さずに表示／非表示だけ切り替える（入力欄のフォーカスを保つため）
export function filterChips(root, query) {
  const q = query.trim().toLowerCase();
  for (const chip of root.querySelectorAll('.chip')) {
    chip.classList.toggle('hidden', !!q && !chip.dataset.name.toLowerCase().includes(q)); // 個数 "(3)" は検索に含めない
  }
}

// 技の追加・編集ダイアログ。{ name, level, count } かキャンセルなら null を返す
function trickDialog(stock, trick) {
  return new Promise((resolve) => {
    let level = trick?.level ?? 1;
    const count0 = trick ? trickCount(trick) : DEFAULT_COUNT; // null なら「個数を設定しない」
    const m = openModal(`
      <h2>${trick ? '技を編集' : '技を追加'}</h2>
      <div class="field"><label for="tk-name">技名</label><input id="tk-name" class="input" value="${esc(trick?.name ?? '')}" placeholder="ミルズメス" autofocus></div>
      <div class="field"><label>難易度</label>
        <div class="lv-pick">${[1, 2, 3, 4, 5].map((lv) =>
          `<button class="lv-opt lv${lv}" data-lv="${lv}" aria-pressed="${lv === level}">${pipsHtml(lv)}<span>Lv.${lv} ${LEVEL_NAMES[lv]}</span></button>`).join('')}
        </div></div>
      <div class="field tk-count">
        <label class="switch"><input type="checkbox" id="tk-has-count" ${count0 == null ? '' : 'checked'}><span class="switch-track" aria-hidden="true"></span>個数を設定する</label>
        <div class="stepper" ${count0 == null ? 'hidden' : ''}>
          <button class="btn icon" data-step="-1" aria-label="1 個減らす">−</button>
          <input id="tk-count" class="input num" type="number" min="1" max="9" step="1" value="${count0 ?? DEFAULT_COUNT}" aria-label="個数">
          <button class="btn icon" data-step="1" aria-label="1 個増やす">+</button>
        </div></div>
      ${trick ? '<p class="sub">技名・難易度・個数の変更は、全プロジェクトのカードに反映されます。</p>' : ''}
      <p class="err"></p>
      <div class="actions"><button class="btn" data-act="cancel">キャンセル</button>
      <button class="btn primary" data-act="ok">${trick ? '保存' : '追加'}</button></div>`,
      { width: 520, onClose: () => resolve(null) });
    const name = m.el.querySelector('#tk-name');
    const countInput = m.el.querySelector('#tk-count');
    const hasCount = m.el.querySelector('#tk-has-count');
    const err = m.el.querySelector('.err');
    name.select();
    hasCount.addEventListener('change', () => {
      m.el.querySelector('.tk-count .stepper').hidden = !hasCount.checked;
      err.textContent = '';
    });
    const ok = () => {
      const v = name.value.trim();
      const count = hasCount.checked ? Number(countInput.value) : null;
      if (!v) { err.textContent = '技名を入力してください'; return; }
      if (count !== null && (!Number.isInteger(count) || count < 1 || count > 9)) {
        err.textContent = '個数は 1〜9 の数字で入力してください';
        countInput.focus();
        return;
      }
      // 同じ技名でも個数が違えば別の技として登録できる（「個数なし」も 1 つの値として比べる）
      if (stock.tricks.some((t) => t !== trick && t.name === v && trickCount(t) === count)) {
        err.textContent = '同じ技名・個数の技がすでにあります';
        return;
      }
      resolve({ name: v, level, count });
      m.close();
    };
    m.el.addEventListener('click', (e) => {
      const opt = e.target.closest('.lv-opt');
      if (opt) {
        level = Number(opt.dataset.lv);
        m.el.querySelectorAll('.lv-opt').forEach((b) => b.setAttribute('aria-pressed', b === opt));
      }
      const step = e.target.closest('[data-step]');
      if (step) {
        const n = Number(countInput.value) || DEFAULT_COUNT;
        countInput.value = Math.min(9, Math.max(1, Math.round(n) + Number(step.dataset.step)));
        err.textContent = '';
      }
      if (e.target.closest('[data-act=ok]')) ok();
    });
    for (const input of [name, countInput]) {
      input.addEventListener('input', () => { err.textContent = ''; });
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') ok(); });
    }
  });
}

export async function addTrick(stock) {
  const r = await trickDialog(stock);
  if (!r) return false;
  stock.tricks.push({ id: newId('t'), ...r });
  save('stock.json', stock);
  return true;
}

export async function editTrick(stock, id) {
  const t = stock.tricks.find((x) => x.id === id);
  const r = await trickDialog(stock, t);
  if (!r) return false;
  Object.assign(t, r);
  save('stock.json', stock);
  return true;
}

// 削除。使われていれば枚数を示して確認し、そのカードも全プロジェクトから消す
export async function deleteTrick(stock, projects, id) {
  const t = stock.tricks.find((x) => x.id === id);
  const used = projects.map((p) => p.blocks.reduce((n, b) => n + b.cards.filter((c) => c.trickId === id).length, 0));
  const total = used.reduce((a, b) => a + b, 0);
  const where = used.filter(Boolean).length;
  const ok = await confirmDialog('技を削除',
    `「${esc(t.name)}${countLabel(t)}」を技ストックから削除します。` +
    (total ? `<br><strong class="warn-text">${where} つのプロジェクトで、${total} 枚のカードに使われています。削除するとそのカードも消えます。</strong>` : ''),
    '削除', true);
  if (!ok) return false;
  stock.tricks = stock.tricks.filter((x) => x !== t);
  save('stock.json', stock);
  projects.forEach((p, i) => {
    if (!used[i]) return;
    for (const b of p.blocks) b.cards = b.cards.filter((c) => c.trickId !== id);
    p.updatedAt = new Date().toISOString();
    save(`projects/${p.id}/project.json`, p);
  });
  return true;
}

// ストック表示部分（ドロワー／ダイアログ）にイベントを付ける。変更があったら onChange() を呼ぶ
export function bindStock(root, state, onChange) {
  root.addEventListener('click', async (e) => {
    if (e.target.closest('[data-act=trick-add]') && await addTrick(state.stock)) onChange();
  });
  root.addEventListener('dblclick', async (e) => {
    const chip = e.target.closest('.chip');
    if (chip && await editTrick(state.stock, chip.dataset.trick)) onChange();
  });
  root.addEventListener('contextmenu', async (e) => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    const act = await window.api.menu([['edit', '編集'], ['del', '削除']]);
    const id = chip.dataset.trick;
    if (act === 'edit' ? await editTrick(state.stock, id) : act === 'del' && await deleteTrick(state.stock, state.projects, id)) onChange();
  });
}

// 一覧画面の［技ストック］：ダイアログで表示・編集する
export function stockDialog(state, onChange) {
  const m = openModal(`
    <div class="stock-dialog-head"><h2>技ストック</h2><span class="sub">全プロジェクト共通 · <span id="sd-count">${state.stock.tricks.length}</span>技</span>
      <span class="spacer"></span>
      <input class="input search" id="sd-q" placeholder="技を検索" aria-label="技を検索">
      <button class="btn" data-act="trick-add">${icon('plus')}技を追加</button>
      <button class="btn icon" data-act="cancel" aria-label="閉じる">${icon('x')}</button></div>
    <div class="stock-dialog-body" id="sd-body">${stockColumnsHtml(state.stock)}</div>`, { width: 1100 });
  const q = m.el.querySelector('#sd-q');
  const refresh = () => {
    m.el.querySelector('#sd-body').innerHTML = stockColumnsHtml(state.stock, q.value);
    m.el.querySelector('#sd-count').textContent = state.stock.tricks.length;
    onChange();
  };
  q.addEventListener('input', () => filterChips(m.el, q.value));
  bindStock(m.el, state, refresh);
}
