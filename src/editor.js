// 編集画面：再生コントロール、ミニタイムライン＋全体波形、（フェーズ4以降）ブロックレーン
import Sortable from '../node_modules/sortablejs/modular/sortable.complete.esm.js';
import { esc, fmtTime, easeInOut, promptDialog, newId, pipsHtml } from './ui.js';
import { stockColumnsHtml, filterChips, bindStock, editTrick } from './stock.js';
import { openPopover, closePopover, renderPopover, placePopover, popoverCardId } from './popover.js';
import { updateSlot } from './update.js';
import { icon } from './icons.js';
import { maxLevel } from './list.js';
import { isSaved, save } from './store.js';
import { splitAt, moveBoundary, removeBoundary, MIN_LEN } from './blocks.js';

const RATES = [0.5, 0.6, 0.7, 0.8, 0.9, 1.0];
const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

// 編集中の状態（画面を作り直しても残るもの）
const ed = {
  project: null, peaks: null, audio: null, trickMap: new Map(),
  cur: 0,          // 現在のブロック番号
  loop: false,     // ブロックループ
  rate: 1,
  raf: 0,
  played: 0,       // 波形で「再生済み」に塗った本数
  seeking: false,  // シークバーをドラッグ中
  laneScroll: 0,   // レーンの横スクロール位置
  manualUntil: 0,  // この時刻までは自動スクロールしない
  hold: false,     // ポップオーバー表示中・ドラッグ中は自動スクロールしない
  scrollRaf: 0,
  // 区切りモード
  split: false,
  sel: null,       // 選択中の区切り k（blocks[k].start）。区切りが無ければ null
  splitLoop: false,// 区切りの前後をループ
  splitMsg: '',    // 区切れなかったときの案内
  flash: false,    // 区切りを打った直後の演出
  zoomPath: '',    // 拡大波形の SVG パス（プロジェクトごとに 1 回だけ作る）
  prevShift: null, // 拡大波形の直前の位置（作り直しても 80ms で動かすため）
};
let refs = {};     // 毎フレーム更新する要素

// 時刻 t を含むブロックの番号。
// 再生位置を境界ちょうどに設定しても、読み出すとごくわずかに手前になることがあるので 5ms の余裕を持たせる
export function blockAt(blocks, t) {
  const i = blocks.findIndex((b) => t < b.end - 0.005);
  return i === -1 ? blocks.length - 1 : i;
}

// app.js の state（stock・projects・settings）と、画面を作り直す関数を受け取る
export async function openEditor(project, state, render) {
  closeEditor();
  ed.project = project;
  ed.state = state;
  ed.render = render;
  ed.peaks = await window.api.read(`projects/${project.id}/peaks.json`);
  ed.audio = new Audio((await window.api.projectUrl(project.id)) + encodeURIComponent(project.audioFile));
  ed.audio.preservesPitch = true;
  ed.audio.playbackRate = ed.rate;
  ed.audio.addEventListener('play', syncPlayIcon);
  ed.audio.addEventListener('pause', syncPlayIcon);
  ed.audio.addEventListener('ended', () => {
    if (ed.split && ed.splitLoop && ed.sel) seek(loopStart(), true);
    else if (!ed.split && ed.loop) seek(ed.project.blocks[ed.cur].start, true);
  });
  ed.cur = 0;
  ed.laneScroll = 0;
  ed.manualUntil = 0;
  resetHistory();
  Object.assign(ed, { split: false, sel: null, splitLoop: false, splitMsg: '', flash: false, prevShift: null });
  // 拡大波形：0.05 秒ごとのピークを 1 本ずつ、中央揃えの縦棒にする（x の単位は「本」、y は 0〜100）
  ed.zoomPath = (ed.peaks?.fine ?? []).map((v, i) => {
    const h = Math.max(1, v * 46);
    return `M${i + 0.15} ${(50 - h).toFixed(1)}h.7v${(2 * h).toFixed(1)}h-.7z`;
  }).join('');
  const tick = () => { update(); ed.raf = requestAnimationFrame(tick); };
  ed.raf = requestAnimationFrame(tick);
}

export function closeEditor() {
  closePopover(true);
  cancelAnimationFrame(ed.raf);
  if (ed.audio) { ed.audio.pause(); ed.audio.removeAttribute('src'); ed.audio.load(); }
  ed.audio = null;
}

export function togglePlay() {
  if (!ed.audio) return;
  ed.audio.paused ? ed.audio.play() : ed.audio.pause();
}

function seek(t, play = false) {
  const a = ed.audio;
  t = Math.min(Math.max(0, t), ed.project.duration);
  a.currentTime = t;
  ed.cur = blockAt(ed.project.blocks, t);
  if (play) a.play();
  update();
}

// ===== 描画 =====
export function editorView(dark) {
  const p = ed.project;
  ed.trickMap = new Map(ed.state.stock.tricks.map((t) => [t.id, t])); // 技の変更をすぐ反映するため毎回作る
  const b = p.blocks[ed.cur];
  const dur = p.duration;
  const pct = (t) => (t / dur) * 100;

  // 上段：ブロック区間（最高難易度の色で塗る）
  const segs = p.blocks.map((bk, i) => {
    const lv = maxLevel(bk, ed.trickMap);
    return `<button class="tl-seg ${lv ? 'lv' + lv : 'lv0'} ${i === ed.cur ? 'now' : ''}" data-act="block-play" data-i="${i}"
      title="${esc(bk.name)} の頭から再生" style="left:${pct(bk.start)}%;width:${pct(bk.end - bk.start)}%"><span>${esc(bk.name)}</span></button>`;
  }).join('');
  // 下段：全体波形とブロック境界
  const bars = (ed.peaks?.overview ?? []).map((v) => `<i style="height:${Math.max(4, v * 100)}%"></i>`).join('');
  const bounds = p.blocks.slice(1).map((bk) => `<div class="tl-bound" style="left:${pct(bk.start)}%"></div>`).join('');

  return `
    <header class="titlebar">
      <button class="btn ghost" data-act="back">${icon('chevronLeft')}一覧へ戻る</button>
      <span class="pj-name">${esc(p.name)}</span><span class="sub">${esc(p.originalFileName)}</span>
      <span class="spacer"></span>
      ${updateSlot()}
      <span class="save-status sub" id="save-status">${saveStatusHtml(isSaved())}</span>
      <button class="btn icon" data-act="theme" aria-label="テーマ切替">${icon(dark ? 'sun' : 'moon')}</button>
    </header>
    <section class="transport">
      <button class="play" data-act="play" aria-label="再生／一時停止"></button>
      <div class="clock num"><span id="t-now">${fmtTime(0, 1)}</span><span class="dur"> / ${fmtTime(dur, 1)}</span></div>
      ${ed.rate < 1 ? `<span class="pill num">${ed.rate.toFixed(1)}×</span>` : ''}
      <div class="vsep"></div>
      <div class="cur-block"><span class="cur-no num" id="cur-no"></span><span class="cur-name" id="cur-name"></span></div>
      <span class="spacer"></span>
      ${ed.split ? `
      <button class="btn toggle ${ed.splitLoop ? 'on' : ''}" data-act="split-loop" aria-pressed="${ed.splitLoop}">${icon('repeat')}区切りの前後をループ</button>
      <button class="btn primary" data-act="cut">${icon('scissors')}ここで区切る<kbd>M</kbd></button>
      <button class="btn" data-act="split-done">${icon('check')}完了</button>` : `
      <button class="btn toggle ${ed.loop ? 'on' : ''}" data-act="loop" aria-pressed="${ed.loop}">${icon('repeat')}ブロックループ</button>
      <div class="rates" role="group" aria-label="再生速度">
        ${RATES.map((r) => `<button class="${r === ed.rate ? 'on' : ''}" data-act="rate" data-rate="${r}">${r.toFixed(1)}</button>`).join('')}
      </div>
      <button class="btn" data-act="split">${icon('scissors')}区切りモード</button>`}
    </section>
    <section class="timeline">
      <div class="tl-inner">
        <div class="tl-blocks">${segs}</div>
        <div class="tl-wave">
          <div class="tl-cur" id="tl-cur" style="left:${pct(b.start)}%;width:${pct(b.end - b.start)}%"></div>
          <div class="tl-bars" id="tl-bars">${bars}</div>
          ${bounds}
          <input type="range" class="seek" id="seek" min="0" max="${dur}" step="0.01" value="0" aria-label="再生位置">
        </div>
        <div class="playhead" id="playhead"></div>
      </div>
    </section>
    ${ed.split ? splitHtml() : `<main class="lane" id="lane">${p.blocks.map(blockHtml).join('')}</main>${drawerHtml()}`}`;
}

// 技ストックのドロワー（下部）
function drawerHtml() {
  const open = ed.state.settings.stockOpen !== false;
  return `
    <section class="drawer ${open ? 'open' : ''}" id="drawer">
      <div class="drawer-head">
        <button class="drawer-title" data-act="stock-toggle">${icon('layers')}技ストック</button>
        <span class="sub">全プロジェクト共通 · ${ed.state.stock.tricks.length}技 · ブロックへドラッグして配置</span>
        <span class="spacer"></span>
        <input class="input search" id="stock-q" placeholder="技を検索" aria-label="技を検索" value="${esc(ed.stockQuery ?? '')}">
        <button class="btn" data-act="trick-add">${icon('plus')}技を追加</button>
        <button class="btn icon drawer-toggle" data-act="stock-toggle" aria-label="技ストックを開く／閉じる">${icon('chevronDown')}</button>
      </div>
      <div class="drawer-body">${stockColumnsHtml(ed.state.stock, ed.stockQuery)}</div>
    </section>`;
}

// ===== 区切りモードの画面 =====
function splitHtml() {
  const p = ed.project, dur = p.duration, bs = p.blocks, k = ed.sel;
  const pct = (t) => (t / dur) * 100;
  const B = k ? bs[k].start : 0;

  let zoom;
  if (k) {
    // 1 秒ごとのラベル
    const labels = Array.from({ length: Math.floor(dur) + 1 }, (_, s) =>
      `<span class="zoom-label num" style="left:${pct(s)}%">${fmtTime(s)}</span>`).join('');
    // 選択中以外の区切りも薄く表示する
    const others = bs.slice(1).map((b, j) => j + 1 === k ? '' : `<i class="zoom-bound" style="left:${pct(b.start)}%"></i>`).join('');
    zoom = `
      <div class="zoom-layer" id="zoom-layer" style="width:${(dur / 10) * 100}%;transform:${zoomShift(B)}">
        <svg class="zoom-wave" viewBox="0 0 ${ed.peaks?.fine.length ?? 1} 100" preserveAspectRatio="none"><path d="${ed.zoomPath}"/></svg>
        <div class="zoom-ticks half" style="--period:${50 / dur}%"></div>
        <div class="zoom-ticks full" style="--period:${100 / dur}%"></div>
        ${labels}${others}
        <i class="zoom-head" id="zoom-head"></i>
      </div>
      <div class="zoom-center ${ed.flash ? 'flash' : ''}"><span class="num">${fmtTime(B, 1)}</span></div>
      <span class="zoom-side left">← ${esc(bs[k - 1].name)}</span>
      <span class="zoom-side right">${esc(bs[k].name)} →</span>`;
  } else {
    zoom = '<p class="zoom-empty">まだ区切りがありません。曲を流しながら M キー（または［ここで区切る］）で区切りを打ちます。</p>';
  }

  const rows = bs.slice(1).map((b, j) => {
    const n = j + 1;
    return `<tr class="${n === k ? 'sel' : ''}" data-act="bound-sel" data-k="${n}">
      <td class="num">${n}</td><td class="num">${fmtTime(b.start, 1)}</td>
      <td>${esc(bs[n - 1].name)}</td><td>${esc(b.name)}</td>
      <td class="num">${(b.start - bs[n - 1].start).toFixed(1)}秒</td></tr>`;
  }).join('');

  return `
    <main class="split-view">
      <div class="banner ${ed.splitMsg ? 'warn' : ''}">${ed.splitMsg ? esc(ed.splitMsg)
        : '曲を流しながら、区切りたい瞬間に M（または［ここで区切る］）。打った区切りは下で ±0.1 秒ずつ調整できます。'}</div>
      <div class="zoom ${ed.flash ? 'flash' : ''}" id="zoom">${zoom}</div>
      <div class="nudge" ${k ? '' : 'hidden'}>
        <button class="btn num" data-act="nudge" data-d="-1">−1.0</button>
        <button class="btn num" data-act="nudge" data-d="-0.1">−0.1</button>
        <span class="nudge-time num">${fmtTime(B, 1)}</span>
        <button class="btn num" data-act="nudge" data-d="0.1">+0.1</button>
        <button class="btn num" data-act="nudge" data-d="1">+1.0</button>
        <span class="spacer"></span>
        <button class="btn danger" data-act="bound-del">この区切りを削除</button>
      </div>
      <div class="bounds-wrap">
        <table class="bounds">
          <thead><tr><th>#</th><th>時刻</th><th>前のブロック</th><th>次のブロック</th><th>前ブロックの長さ</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <div class="key-hints">
        <span><kbd>Space</kbd>再生／停止</span><span><kbd>M</kbd>ここで区切る</span>
        <span><kbd>←</kbd><kbd>→</kbd>±0.1秒</span><span><kbd>Shift</kbd>+<kbd>←</kbd><kbd>→</kbd>±1秒</span>
        <span><kbd>↑</kbd><kbd>↓</kbd>区切りを選択</span><span><kbd>Delete</kbd>区切りを削除</span><span><kbd>Esc</kbd>完了</span>
      </div>
    </main>`;
}

// 拡大波形の位置：区切り B が表示枠の中央に来るようにずらす（層の左端は枠の中央に置いてある）
const zoomShift = (B) => `translateX(${-(B / ed.project.duration) * 100}%)`;

// 区切りの前後ループの開始位置（区切りの 4 秒前）
const loopStart = () => Math.max(0, ed.project.blocks[ed.sel].start - 4);

function cardHtml(c) {
  const t = ed.trickMap.get(c.trickId) ?? { name: '（削除された技）', level: 1 };
  return `
    <div class="card lv${t.level} ${c.id === ed.newCard ? 'card-new' : ''} ${c.id === popoverCardId() ? 'selected' : ''}"
      data-card="${c.id}" data-act="card" tabindex="0" aria-label="${esc(t.name)} ${c.count}個（クリックで編集）">
      <div class="card-top">${pipsHtml(t.level)}<span class="card-count num">${c.count}<small>個</small></span></div>
      <div class="card-name">${esc(t.name)}</div>
      <div class="card-memo">${esc(c.memo)}</div>
    </div>`;
}

function blockHtml(b, i) {
  return `
    <section class="block ${i === ed.cur ? 'now' : ''}">
      <button class="bk-head" data-act="block-play" data-i="${i}" title="クリックで頭から再生／ダブルクリックで名前を変更">
        <span class="bk-no num">${String(i + 1).padStart(2, '0')}</span>
        <span class="bk-title">
          <span class="bk-name">${esc(b.name)}</span>
          <span class="bk-time num">${fmtTime(b.start, 1)} – ${fmtTime(b.end, 1)}<span class="bk-len">${(b.end - b.start).toFixed(1)}秒</span></span>
        </span>
        <span class="bk-hint">${icon('play')}頭から再生</span>
      </button>
      <div class="bk-prog"><i></i></div>
      <div class="cards">${b.cards.length ? b.cards.map(cardHtml).join('') : '<div class="cards-empty">技をここへドラッグ</div>'}</div>
    </section>`;
}

export const saveStatusHtml = (saved) => saved ? `${icon('check')}保存済み` : '保存中…';

// render() のあとに呼ぶ：要素を覚え、イベントを付ける
export function mountEditor() {
  const $ = (id) => document.getElementById(id);
  refs = {
    now: $('t-now'), curNo: $('cur-no'), curName: $('cur-name'), curRange: $('tl-cur'),
    playhead: $('playhead'), seek: $('seek'), play: document.querySelector('.transport .play'),
    bars: $('tl-bars').children, segs: document.querySelectorAll('.tl-seg'),
    lane: $('lane'), blocks: document.querySelectorAll('.block'), progs: document.querySelectorAll('.bk-prog i'),
    zoomHead: $('zoom-head'),
    lastCur: -1,
  };
  ed.played = 0;
  const s = refs.seek;
  s.addEventListener('pointerdown', () => { ed.seeking = true; });
  s.addEventListener('pointerup', () => { ed.seeking = false; });
  s.addEventListener('input', () => seek(Number(s.value)));
  s.addEventListener('change', () => ed.audio.play()); // 波形をクリック（ドラッグ）して離したら、その位置から再生

  if (ed.split) mountSplit();
  else mountLane();
  syncPlayIcon();
  update();
}

function mountSplit() {
  ed.flash = false; // 演出は 1 回だけ
  const layer = document.getElementById('zoom-layer');
  if (layer) {
    // 画面を作り直しても、直前の位置から 80ms で動いて見えるようにする
    const next = layer.style.transform;
    if (ed.prevShift && ed.prevShift !== next) {
      layer.style.transition = 'none';
      layer.style.transform = ed.prevShift;
      layer.getBoundingClientRect(); // ここで一度位置を確定させる
      layer.style.transition = '';
      layer.style.transform = next;
    }
    ed.prevShift = next;
  }
  document.querySelector('.bounds tr.sel')?.scrollIntoView({ block: 'nearest' });
}

function mountLane() {
  // レーン：作り直してもスクロール位置を保つ。縦ホイールは横スクロールに変える
  const lane = refs.lane;
  lane.scrollLeft = ed.laneScroll;
  lane.addEventListener('scroll', () => { ed.laneScroll = lane.scrollLeft; });
  lane.addEventListener('wheel', (e) => {
    if (e.deltaY && !e.deltaX) { e.preventDefault(); lane.scrollLeft += e.deltaY; }
    manualScroll();
  }, { passive: false });
  // スクロールバーを直接つかんだときも手動スクロール扱い
  lane.addEventListener('pointerdown', (e) => { if (e.target === lane) manualScroll(); });
  ed.newCard = null; // 追加直後の演出は 1 回だけ

  // ドラッグ＆ドロップ（SortableJS）。全ブロックで同じ group にして、ブロック間でも動かせるようにする
  const common = {
    animation: reducedMotion() ? 0 : 200, easing: 'cubic-bezier(.2,0,0,1)',
    forceFallback: true, fallbackTolerance: 4, // 4px 以上動かしたらドラッグ、未満ならクリック
    ghostClass: 'drop-ghost', fallbackClass: 'drag-lift',
    onStart: (evt) => {
      ed.dragging = true; ed.cancelDrag = false;
      holdAutoScroll(true);
      document.body.classList.add('dragging');
      // 元のブロックは幅を固定する（カードが抜けて縮むと、右のブロックがカーソルの下へずれてくるため）。
      // 受け皿で膨らむのは、カーソルを乗せた移動先のブロックだけ
      const src = evt.from.closest('.block');
      if (src) src.style.minWidth = src.offsetWidth + 'px';
    },
    onEnd: dropEnd,
  };
  for (const el of lane.querySelectorAll('.cards')) Sortable.create(el, { ...common, group: 'cards', draggable: '.card' });
  // ストック側：コピーして持ち出すだけ（ストックへは戻せない・並べ替えない）
  for (const el of document.querySelectorAll('#drawer .chips')) {
    Sortable.create(el, { ...common, group: { name: 'cards', pull: 'clone', put: false }, sort: false, draggable: '.chip' });
  }

  const drawer = document.getElementById('drawer');
  const q = document.getElementById('stock-q');
  q.addEventListener('input', () => { ed.stockQuery = q.value; filterChips(drawer, q.value); });
  // 技の削除でカードが消えることがあるので、元に戻すの基準を今の状態に合わせ直す
  bindStock(drawer, ed.state, () => { hist.snap = JSON.stringify(ed.project.blocks); ed.render(); });

  // カード編集ポップオーバーを、作り直したカードの位置に付け直す
  lane.addEventListener('scroll', placePopover);
  renderPopover();
}

// ===== カード編集 =====
const findCard = (id) => {
  for (const block of ed.project.blocks) {
    const card = block.cards.find((c) => c.id === id);
    if (card) return { card, block };
  }
  return null;
};

function removeCard(id) {
  const found = findCard(id);
  if (!found) return;
  found.block.cards = found.block.cards.filter((c) => c !== found.card);
  touch();
  ed.render();
}

function openCard(id) {
  holdAutoScroll(true); // 開いている間は自動スクロールしない（編集中のカードが流れていかないように）
  openPopover(id, {
    find: findCard,
    tricks: () => ed.state.stock.tricks,
    commit: () => { touch(); ed.render(); },
    saveOnly: saveProject,
    remove: removeCard,
    editTrick: async (trickId) => { if (await editTrick(ed.state.stock, trickId)) ed.render(); },
    onClose: () => holdAutoScroll(false),
  });
}

// ドロップしたとき：画面上の並びをそのままデータに写す
function dropEnd(evt) {
  ed.dragging = false;
  ed.justDragged = true; // 離した直後のクリックで編集が開かないように
  setTimeout(() => { ed.justDragged = false; });
  holdAutoScroll(false);
  document.body.classList.remove('dragging');
  // レーンの外で離したら取り消し
  const pt = evt.originalEvent;
  const r = refs.lane.getBoundingClientRect();
  const outside = pt?.clientX !== undefined && (pt.clientX < r.left || pt.clientX > r.right || pt.clientY < r.top || pt.clientY > r.bottom);
  if (ed.cancelDrag || (outside && evt.from !== evt.to)) {
    // 元のデータで描き直す＝元の位置に戻る。そのとき、置こうとしていた位置から 240ms で戻って見せる
    const id = evt.item.dataset.card;
    const from = id && evt.item.getBoundingClientRect();
    ed.render();
    const el = id && document.querySelector(`[data-card="${id}"]`);
    if (el && !reducedMotion()) {
      const to = el.getBoundingClientRect();
      el.animate([{ transform: `translate(${from.left - to.left}px, ${from.top - to.top}px)` }, { transform: 'none' }],
        { duration: 240, easing: 'cubic-bezier(.4,0,.2,1)' });
    }
    return;
  }
  if (evt.from === evt.to && evt.oldIndex === evt.newIndex) return;

  const p = ed.project;
  const byId = new Map(p.blocks.flatMap((b) => b.cards).map((c) => [c.id, c]));
  refs.lane.querySelectorAll('.cards').forEach((el, i) => {
    p.blocks[i].cards = [...el.querySelectorAll(':scope > .card, :scope > .chip')].map((n) => {
      if (n.dataset.card) return byId.get(n.dataset.card);
      const c = { id: newId('c'), trickId: n.dataset.trick, count: 3, memo: '' }; // ストックから新しく配置
      ed.newCard = c.id;
      return c;
    });
  });
  touch();
  ed.render();
}

// ドラッグ中の Esc：取り消して元の位置へ戻す
function cancelDrag() {
  ed.cancelDrag = true;
  document.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
}

// ===== 自動横スクロール =====
// 手動でスクロールしたら 3 秒間は自動スクロールしない
function manualScroll() {
  ed.manualUntil = performance.now() + 3000;
  cancelAnimationFrame(ed.scrollRaf);
}

// 自動スクロールを止めておく理由（ポップオーバー表示中・ドラッグ中）。フェーズ6・7で使う
export const holdAutoScroll = (on) => { ed.hold = on; if (on) cancelAnimationFrame(ed.scrollRaf); };

// 現在ブロックの左端を、レーン左から 24px の位置へ 420ms で動かす
function autoScroll(force = false) {
  const lane = refs.lane, el = refs.blocks[ed.cur];
  if (!lane || !el || ed.hold) return;
  if (!force && performance.now() < ed.manualUntil) return;
  if (force) ed.manualUntil = 0;
  const from = lane.scrollLeft;
  const to = Math.max(0, Math.min(el.offsetLeft - 24, lane.scrollWidth - lane.clientWidth));
  if (Math.abs(to - from) < 1) return;
  if (reducedMotion()) { lane.scrollLeft = to; return; } // 動きを減らす設定ではすぐ移動
  const t0 = performance.now();
  cancelAnimationFrame(ed.scrollRaf);
  const step = (now) => {
    const k = Math.min(1, (now - t0) / 420);
    lane.scrollLeft = from + (to - from) * easeInOut(k);
    if (k < 1) ed.scrollRaf = requestAnimationFrame(step);
  };
  ed.scrollRaf = requestAnimationFrame(step);
}

function syncPlayIcon() {
  if (refs.play) refs.play.innerHTML = icon(ed.audio?.paused === false ? 'pause' : 'play');
}

// 毎フレーム：時刻・再生ヘッド・波形の塗り・現在ブロックを更新（変わった所だけ触る）
function update() {
  if (!ed.audio || !refs.now) return;
  const p = ed.project;
  let t = ed.audio.currentTime;
  if (ed.split) {
    // 区切りの前後ループ：区切りの 4 秒前〜3 秒後を繰り返す
    if (ed.splitLoop && ed.sel && !ed.seeking) {
      const B = p.blocks[ed.sel].start;
      if (t >= B + 3 || t < loopStart() - 0.05) ed.audio.currentTime = t = loopStart();
    }
    ed.cur = blockAt(p.blocks, t);
    if (refs.zoomHead) refs.zoomHead.style.left = `${(t / p.duration) * 100}%`;
  } else if (ed.loop) {
    // ブロックループ中は現在ブロックを固定し、終わりに来たら頭へ戻す（ブロックの移動はシークでだけ起きる）
    if (!ed.seeking && t >= p.blocks[ed.cur].end) ed.audio.currentTime = t = p.blocks[ed.cur].start;
  } else {
    ed.cur = blockAt(p.blocks, t);
  }
  const ratio = t / p.duration;

  refs.now.textContent = fmtTime(t, 1);
  refs.playhead.style.left = `${ratio * 100}%`;
  if (!ed.seeking) refs.seek.value = t;

  const n = Math.floor(ratio * refs.bars.length);
  if (n !== ed.played) {
    const [a, b] = n > ed.played ? [ed.played, n] : [n, ed.played];
    for (let i = a; i < b; i++) refs.bars[i].classList.toggle('p', i < n);
    ed.played = n;
  }

  // 現在ブロックの進行バー（CSS transition は付けず、毎フレーム直接書く）
  const cb = p.blocks[ed.cur];
  const prog = Math.min(1, Math.max(0, (t - cb.start) / (cb.end - cb.start)));
  if (refs.progs[ed.cur]) refs.progs[ed.cur].style.transform = `scaleX(${prog})`;

  if (ed.cur !== refs.lastCur) {
    const b = p.blocks[ed.cur];
    const first = refs.lastCur === -1; // 画面を作った直後は自動スクロールしない
    for (const list of [refs.segs, refs.blocks]) {
      list[refs.lastCur]?.classList.remove('now');
      list[ed.cur]?.classList.add('now');
    }
    if (refs.progs[refs.lastCur]) refs.progs[refs.lastCur].style.transform = 'scaleX(0)';
    refs.curNo.textContent = String(ed.cur + 1).padStart(2, '0');
    refs.curName.textContent = b.name;
    refs.curRange.style.left = `${(b.start / p.duration) * 100}%`;
    refs.curRange.style.width = `${((b.end - b.start) / p.duration) * 100}%`;
    refs.lastCur = ed.cur;
    if (!first && refs.lane) autoScroll();
  }
}

// 編集画面のボタン操作。画面の作り直しが必要なら true を返す
export function editorAction(act, el) {
  if (act === 'play') togglePlay();
  else if (act === 'loop') { ed.loop = !ed.loop; return true; }
  else if (act === 'rate') {
    ed.rate = Number(el.dataset.rate);
    ed.audio.playbackRate = ed.rate;
    return true;
  }
  else if (act === 'block-play') {
    // ブロックの見出し／タイムライン上段の区間をクリック：そのブロックの頭から再生し、
    // 手動スクロール扱いを解除してスクロール
    seek(ed.project.blocks[Number(el.dataset.i)].start, true);
    if (refs.lane) autoScroll(true);
  }
  else if (act === 'card') { if (!ed.justDragged) openCard(el.dataset.card); }
  else if (act === 'stock-toggle') {
    // 作り直さずにクラスだけ切り替える（高さのアニメーションを見せるため）
    const open = document.getElementById('drawer').classList.toggle('open');
    ed.state.settings.stockOpen = open;
    save('settings.json', ed.state.settings);
  }
  else if (act === 'split') { closePopover(true); enterSplit(); return true; }
  else if (act === 'split-done') { exitSplit(); return true; }
  else if (act === 'cut') return cut();
  else if (act === 'split-loop') {
    ed.splitLoop = !ed.splitLoop;
    if (ed.splitLoop && ed.sel) seek(loopStart());
    return true;
  }
  else if (act === 'nudge') return nudge(Number(el.dataset.d));
  else if (act === 'bound-del') return deleteBoundary();
  else if (act === 'bound-sel') { ed.sel = Number(el.dataset.k); ed.splitMsg = ''; return true; }
  return false;
}

// ===== 区切りモードの操作 =====
function enterSplit() {
  const bs = ed.project.blocks, t = ed.audio.currentTime;
  // 今の再生位置にいちばん近い区切りを選んでおく
  ed.sel = null;
  for (let k = 1; k < bs.length; k++) {
    if (ed.sel === null || Math.abs(bs[k].start - t) < Math.abs(bs[ed.sel].start - t)) ed.sel = k;
  }
  Object.assign(ed, { split: true, splitLoop: false, splitMsg: '', prevShift: null });
}

function exitSplit() {
  Object.assign(ed, { split: false, splitLoop: false, splitMsg: '' });
}

// 今の再生位置で区切る
function cut() {
  const k = splitAt(ed.project.blocks, ed.audio.currentTime, newId('b'));
  if (k === null) {
    ed.splitMsg = `ここでは区切れません。ブロックの長さは ${MIN_LEN} 秒以上必要です。`;
  } else {
    Object.assign(ed, { sel: k, splitMsg: '', flash: true });
    ed.cur = blockAt(ed.project.blocks, ed.audio.currentTime);
    touch();
  }
  return true;
}

function nudge(d) {
  if (!ed.sel) return false;
  moveBoundary(ed.project.blocks, ed.sel, ed.project.blocks[ed.sel].start + d);
  ed.splitMsg = '';
  touch();
  return true;
}

function deleteBoundary() {
  if (!ed.sel) return false;
  ed.sel = removeBoundary(ed.project.blocks, ed.sel);
  ed.cur = blockAt(ed.project.blocks, ed.audio.currentTime);
  ed.splitMsg = '';
  touch();
  return true;
}

// キー操作（Space は app.js 側）。画面の作り直しが必要なら true を返す
export function editorKey(e) {
  if (ed.dragging && e.key === 'Escape') { cancelDrag(); return false; }
  // 元に戻す／やり直し（区切りモードでも同じ）
  if (e.ctrlKey && !e.altKey) {
    const k = e.key.toLowerCase();
    if (k === 'z' && !e.shiftKey) { e.preventDefault(); return undo(); }
    if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); return redo(); }
  }
  if (!ed.split) {
    if (e.key === 'Delete' && popoverCardId()) {
      const id = popoverCardId();
      closePopover();
      removeCard(id); // 確認なし（Ctrl+Z で戻せる）
    } else if (e.key === 'Enter' && e.target.closest?.('.card')) {
      openCard(e.target.closest('.card').dataset.card);
    }
    return false;
  }
  const n = ed.project.blocks.length;
  switch (e.key) {
    case 'm': case 'M':
      e.preventDefault();
      return e.repeat ? false : cut();
    case 'ArrowLeft': case 'ArrowRight':
      e.preventDefault();
      return nudge((e.key === 'ArrowLeft' ? -1 : 1) * (e.shiftKey ? 1 : 0.1));
    case 'ArrowUp': case 'ArrowDown':
      e.preventDefault();
      if (!ed.sel) return false;
      ed.sel = Math.min(n - 1, Math.max(1, ed.sel + (e.key === 'ArrowUp' ? -1 : 1)));
      ed.splitMsg = '';
      return true;
    case 'Delete':
      e.preventDefault();
      return deleteBoundary();
    case 'Escape':
      exitSplit();
      return true;
  }
  return false;
}

// 見出しのダブルクリックでブロック名を変更。変更したら true
export async function editorDblClick(e) {
  const head = e.target.closest('.bk-head');
  if (!head) return false;
  const b = ed.project.blocks[Number(head.dataset.i)];
  ed.audio.pause(); // ダブルクリックの 1 回目のクリックで再生が始まるので止める
  const name = await promptDialog('ブロック名を変更', b.name);
  if (!name) return false;
  b.name = name;
  touch();
  return true;
}

// ===== 元に戻す／やり直し =====
// 変更のたびに、変更前のブロック全体を JSON 文字列で積んでおく（曲 1 本ぶんなら十分小さい）
const HISTORY_MAX = 100;
const hist = { undo: [], redo: [], snap: '' }; // snap ＝ 最後に記録した状態

function resetHistory() {
  Object.assign(hist, { undo: [], redo: [], snap: JSON.stringify(ed.project.blocks) });
}

// プロジェクトを変更したときに呼ぶ：元に戻せるよう記録し、更新日時を付けて保存
function touch() {
  const now = JSON.stringify(ed.project.blocks);
  if (now !== hist.snap) {
    hist.undo.push(hist.snap);
    if (hist.undo.length > HISTORY_MAX) hist.undo.shift();
    hist.redo = [];
    hist.snap = now;
  }
  saveProject();
}

function saveProject() {
  ed.project.updatedAt = new Date().toISOString();
  save(`projects/${ed.project.id}/project.json`, ed.project);
}

function undo() {
  touch(); // 記録していない変更（入力中のメモなど）があれば先に記録する
  if (!hist.undo.length) return false;
  hist.redo.push(hist.snap);
  return restore(hist.undo.pop());
}

function redo() {
  if (!hist.redo.length) return false;
  hist.undo.push(hist.snap);
  return restore(hist.redo.pop());
}

function restore(snap) {
  closePopover(true);
  ed.project.blocks = JSON.parse(snap);
  hist.snap = snap;
  const n = ed.project.blocks.length;
  if (ed.sel !== null) ed.sel = n > 1 ? Math.min(ed.sel, n - 1) : null;
  ed.cur = blockAt(ed.project.blocks, ed.audio.currentTime);
  saveProject();
  return true;
}
