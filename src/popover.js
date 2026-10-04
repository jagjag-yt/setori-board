// カード編集ポップオーバー。カードの直下に矢印付きで開く（下に収まらなければ上へ反転）
import { esc, pipsHtml, fmtTime } from './ui.js';
import { icon } from './icons.js';
import { countLabel } from './stock.js';
import { round1 } from './blocks.js';

// カードの開始時刻がブロックの範囲内か（区切りを動かすと外れることがある）
export const inBlock = (t, block) => t >= block.start - 0.005 && t < block.end - 0.005;

// pop = { el, cardId, picking, ctx }
// 編集できるのは技・開始時刻・メモ。個数は技ストックの値を表示する
// ctx: find(id) → { card, block } | null, tricks() → 技の配列, now() → 今の再生位置, commit() 変更を記録して保存,
//      saveOnly() 記録せず保存（メモ入力中）, remove(id), editTrick(id), onClose()
let pop = null;

export const popoverCardId = () => pop?.cardId ?? null;

export function openPopover(cardId, ctx) {
  closePopover(true);
  const el = document.createElement('div');
  el.className = 'popover';
  el.setAttribute('role', 'dialog');
  document.body.append(el);
  pop = { el, cardId, picking: false, ctx };
  el.addEventListener('click', onClick);
  el.addEventListener('input', (e) => {
    if (e.target.id !== 'pop-memo') return;
    pop.ctx.find(pop.cardId).card.memo = e.target.value;
    pop.ctx.saveOnly(); // 入力のたびに保存（記録は入力欄を離れたとき）
  });
  el.addEventListener('change', (e) => { if (e.target.id === 'pop-memo') pop.ctx.commit(); });
  renderPopover();
  el.querySelector('.trick-btn').focus();
}

export function closePopover(instant = false) {
  if (!pop) return;
  const { el, ctx } = pop;
  pop = null;
  document.querySelectorAll('.card.selected').forEach((c) => c.classList.remove('selected'));
  ctx.onClose();
  if (instant) { el.remove(); return; }
  el.classList.add('closing'); // 100ms で消える
  setTimeout(() => el.remove(), 100);
}

// 中身を作り直して位置を合わせる（画面を作り直した後にも呼ぶ）
export function renderPopover() {
  if (!pop) return;
  const found = pop.ctx.find(pop.cardId);
  if (!found) { closePopover(true); return; }
  const { card, block } = found;
  const tricks = pop.ctx.tricks();
  const t = tricks.find((x) => x.id === card.trickId) ?? { name: '（削除された技）', level: 1 };
  const memoFocused = document.activeElement?.id === 'pop-memo';
  const list = pop.picking ? `
    <div class="trick-list">${[...tricks].sort((a, b) => a.level - b.level).map((x) => `
      <button class="trick-opt lv${x.level} ${x.id === card.trickId ? 'on' : ''}" data-pop="set" data-id="${x.id}">${pipsHtml(x.level)}<span>${esc(x.name)}${countLabel(x)}</span></button>`).join('')}
    </div>` : '';
  pop.el.innerHTML = `
    <i class="pop-arrow"></i>
    <div class="pop-body">
    <div class="pop-head"><span>カードを編集 · <b>${esc(block.name)}</b></span>
      <button class="btn icon ghost" data-pop="close" aria-label="閉じる">${icon('x')}</button></div>
    <div class="pop-sec">
      <div class="pop-label">技</div>
      <button class="trick-btn lv${t.level}" data-pop="pick" aria-expanded="${pop.picking}">${pipsHtml(t.level)}<span>${esc(t.name)}</span>${icon(pop.picking ? 'chevronUp' : 'chevronDown')}</button>
      ${list}
      <p class="pop-note"><button class="link" data-pop="stock-edit">技ストックで編集</button></p>
    </div>
    <div class="pop-sec">
      <div class="pop-label">開始時刻</div>
      <div class="time-row">
        <button class="btn num" data-pop="t" data-d="-1">−1.0</button>
        <button class="btn num" data-pop="t" data-d="-0.1">−0.1</button>
        <span class="time-val num ${card.start == null ? 'unset' : ''}">${card.start == null ? '未設定' : fmtTime(card.start, 1)}</span>
        <button class="btn num" data-pop="t" data-d="0.1">+0.1</button>
        <button class="btn num" data-pop="t" data-d="1">+1.0</button>
      </div>
      <div class="time-actions">
        <button class="btn" data-pop="t-now">今の再生位置にする</button>
        ${card.start == null ? '' : '<button class="link" data-pop="t-clear">解除</button>'}
      </div>
      ${card.start != null && !inBlock(card.start, block) ? '<p class="pop-warn">ブロックの範囲外のため光りません</p>' : ''}
    </div>
    <div class="pop-sec">
      <label class="pop-label" for="pop-memo">メモ</label>
      <textarea id="pop-memo" class="input" rows="3">${esc(card.memo)}</textarea>
    </div>
    <div class="pop-foot">
      <button class="link danger" data-pop="delete">このカードを削除</button>
      <button class="btn primary" data-pop="close">完了</button>
    </div>
    </div>`;
  if (memoFocused) pop.el.querySelector('#pop-memo').focus();
  document.querySelector(`[data-card="${pop.cardId}"]`)?.classList.add('selected');
  placePopover();
}

// カードの位置に合わせて置き直す（レーンをスクロールしたときにも呼ぶ）
export function placePopover() {
  if (!pop) return;
  const anchor = document.querySelector(`[data-card="${pop.cardId}"]`);
  if (!anchor) { closePopover(true); return; }
  const r = anchor.getBoundingClientRect();
  const el = pop.el, body = el.querySelector('.pop-body');
  body.style.maxHeight = ''; // いったん本来の高さで測る
  const w = el.offsetWidth, h = el.offsetHeight;
  const cx = r.left + r.width / 2;
  const left = Math.min(Math.max(8, cx - w / 2), innerWidth - w - 8);
  // 下に収まれば下。収まらなければ上、上下どちらにも収まらなければ広い方に開いて中身をスクロールさせる
  const spaceBelow = innerHeight - r.bottom - 18, spaceAbove = r.top - 18;
  const below = h <= spaceBelow || (h > spaceAbove && spaceBelow >= spaceAbove);
  const room = below ? spaceBelow : spaceAbove;
  if (h > room) body.style.maxHeight = `${room - (h - body.offsetHeight)}px`;
  el.style.left = `${left}px`;
  el.style.top = `${below ? r.bottom + 10 : r.top - 10 - Math.min(h, room)}px`;
  el.classList.toggle('above', !below);
  el.querySelector('.pop-arrow').style.left = `${cx - left}px`;
}

async function onClick(e) {
  const act = e.target.closest('[data-pop]')?.dataset.pop;
  if (!act || !pop) return;
  const { ctx } = pop;
  const { card } = ctx.find(pop.cardId);
  if (act === 'close') { closePopover(); return; }
  if (act === 'pick') pop.picking = !pop.picking;
  else if (act === 'set') { card.trickId = e.target.closest('[data-id]').dataset.id; pop.picking = false; ctx.commit(); }
  else if (act === 't' || act === 't-now') {
    // 開始時刻：ブロックの範囲内・0.1 秒単位にそろえる。未設定から ± したときはブロックの頭を基準にする
    const { block } = ctx.find(pop.cardId);
    const base = act === 't-now' ? ctx.now() : (card.start ?? block.start) + Number(e.target.closest('[data-d]').dataset.d);
    const v = round1(Math.min(block.end - 0.1, Math.max(block.start, base)));
    if (v === card.start) return;
    card.start = v;
    ctx.commit();
  }
  else if (act === 't-clear') { delete card.start; ctx.commit(); }
  else if (act === 'stock-edit') { await ctx.editTrick(card.trickId); }
  else if (act === 'delete') { const id = pop.cardId; closePopover(); ctx.remove(id); return; }
  renderPopover();
  // 押したボタンにフォーカスを戻す（キーボードで続けて押せるように）
  const d = e.target.closest('[data-d]')?.dataset.d;
  pop?.el.querySelector(`[data-pop="${act}"]${d ? `[data-d="${d}"]` : ''}`)?.focus();
}

// 外側をクリックしたら閉じる。カードのクリックは editor.js 側で「別のカードを開く」になる
document.addEventListener('pointerdown', (e) => {
  if (!pop || pop.el.contains(e.target) || e.target.closest('.scrim')) return;
  if (e.target.closest(`[data-card="${pop.cardId}"]`)) return;
  closePopover();
}, true);

document.addEventListener('keydown', (e) => {
  if (pop && e.key === 'Escape' && !document.querySelector('.scrim')) { e.preventDefault(); closePopover(); }
});
