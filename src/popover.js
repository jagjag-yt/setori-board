// カード編集ポップオーバー。カードの直下に矢印付きで開く（下に収まらなければ上へ反転）
import { esc, pipsHtml } from './ui.js';
import { icon } from './icons.js';

// pop = { el, cardId, picking, ctx }
// ctx: find(id) → { card, block } | null, tricks() → 技の配列, commit() 変更を記録して保存,
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
      <button class="trick-opt lv${x.level} ${x.id === card.trickId ? 'on' : ''}" data-pop="set" data-id="${x.id}">${pipsHtml(x.level)}<span>${esc(x.name)}</span></button>`).join('')}
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
      <p class="pop-note">技名・難易度の変更は全プロジェクトに反映 · <button class="link" data-pop="stock-edit">技ストックで編集</button></p>
    </div>
    <div class="pop-sec pop-row">
      <div class="pop-label">個数</div>
      <div class="stepper">
        <button class="btn icon" data-pop="dec" aria-label="1 個減らす">−</button>
        <span class="num">${card.count}</span>
        <button class="btn icon" data-pop="inc" aria-label="1 個増やす">+</button>
      </div>
    </div>
    <div class="pop-sec">
      <label class="pop-label" for="pop-memo">メモ <span class="sub">このカードだけ</span></label>
      <textarea id="pop-memo" class="input" rows="3" placeholder="腕を大きく見せる">${esc(card.memo)}</textarea>
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
  else if (act === 'inc' || act === 'dec') {
    const n = Math.min(9, Math.max(1, card.count + (act === 'inc' ? 1 : -1)));
    if (n === card.count) return;
    card.count = n;
    ctx.commit();
  }
  else if (act === 'stock-edit') { await ctx.editTrick(card.trickId); }
  else if (act === 'delete') { const id = pop.cardId; closePopover(); ctx.remove(id); return; }
  renderPopover();
  // 押したボタンにフォーカスを戻す（キーボードで続けて押せるように）
  pop?.el.querySelector(`[data-pop="${act}"]`)?.focus();
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
