// プロジェクト一覧と、新規作成ダイアログ
import { esc, fmtTime, openModal } from './ui.js';
import { icon } from './icons.js';
import { computePeaks } from './peaks.js';
import { updateSlot } from './update.js';
import { blockDiff, DIFF_LV } from './blocks.js';

const EXT = ['.mp3', '.m4a', '.wav', '.ogg'];

const fmtDate = (iso) => new Date(iso).toLocaleString('ja-JP', { dateStyle: 'short', timeStyle: 'short' });

export function listView(state) {
  const dark = state.settings.theme === 'dark';
  const projects = [...state.projects].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  const rows = projects.map((p) => {
    // 難易度の流れ：ブロックの長さに比例した区間を、ブロックの難易度の色（安定＝緑、普通＝青、挑戦＝橙）で塗る
    const flow = p.blocks.map((b) =>
      `<span style="flex:${b.end - b.start};background:var(--lv${DIFF_LV[blockDiff(b)]}-pip)"></span>`).join('');
    return `
      <button class="row" data-id="${p.id}">
        <span class="row-name"><span class="name">${esc(p.name)}</span><span class="sub">${esc(p.originalFileName)}</span></span>
        <span class="num">${fmtTime(p.duration)}</span>
        <span class="num">${p.blocks.length}</span>
        <span class="flow">${flow}</span>
        <span class="sub">${fmtDate(p.updatedAt)}</span>
      </button>`;
  }).join('');

  const body = projects.length
    ? `<div class="table">
        <div class="row head"><span>名前</span><span>長さ</span><span>ブロック</span><span>難易度の流れ</span><span>最終更新</span></div>
        ${rows}</div>`
    : `<div class="empty">
        <p>最初の演目を作りましょう。音楽ファイルを選ぶと、曲全体が 1 つのブロックとして用意されます。</p>
        <button class="btn primary" data-act="new">${icon('plus')}新規プロジェクト</button>
      </div>`;

  return `
    <header class="header">
      <div class="logo">setori<span>-</span>board <small class="sub num">v${window.api.version}</small></div>
      ${updateSlot()}
      <button class="btn icon" data-act="theme" title="テーマ切替" aria-label="テーマ切替">${icon(dark ? 'sun' : 'moon')}</button>
      <button class="btn" data-act="stock">${icon('layers')}技ストック</button>
      <button class="btn primary" data-act="new">${icon('plus')}新規プロジェクト</button>
    </header>
    <main class="list-wrap"><div class="list">
      <div class="list-title"><h1>プロジェクト</h1><span class="count">${projects.length}件</span></div>
      ${body}
    </div></main>`;
}

// 作成ダイアログが開いている間、ウィンドウへのドロップはここへ届ける（app.js が参照）
export let dropHandler = null;

// 音声を読み込み、長さと波形ピークを求める
async function analyze(file, onProgress) {
  const ctx = new AudioContext();
  try {
    const audio = await ctx.decodeAudioData(await file.arrayBuffer());
    const channels = Array.from({ length: audio.numberOfChannels }, (_, i) => audio.getChannelData(i));
    const peaks = await computePeaks(channels, audio.sampleRate, onProgress);
    return { duration: audio.duration, peaks };
  } finally {
    ctx.close();
  }
}

// 新規作成ダイアログ。作成したプロジェクトか、キャンセルなら null を返す
export function createDialog(initialFile) {
  return new Promise((resolve) => {
    let file = null, info = null, autoName = '', token = 0, busy = false;
    const m = openModal(`
      <h2>新規プロジェクト</h2>
      <div class="field"><label>音楽ファイル</label><div class="file-box"></div></div>
      <div class="field"><label for="pj-name">名前</label><input id="pj-name" class="input" placeholder="秋公演 ソロ"></div>
      <p class="err"></p>
      <div class="actions"><button class="btn" data-act="cancel">キャンセル</button>
      <button class="btn primary" data-act="ok">作成して開く</button></div>
      <input type="file" accept="${EXT.join(',')}" hidden>`,
      { width: 600, onClose: () => { dropHandler = null; resolve(null); } });

    const box = m.el.querySelector('.file-box');
    const name = m.el.querySelector('#pj-name');
    const err = m.el.querySelector('.err');
    const picker = m.el.querySelector('input[type=file]');
    const pickBtn = (label) => `<button class="btn" data-act="pick">${label}</button>`;

    const showEmpty = () => {
      box.innerHTML = `${pickBtn('ファイルを選択…')}<span class="sub">またはウィンドウにドラッグ＆ドロップ（mp3 / m4a / wav / ogg）</span>`;
    };

    async function select(f) {
      err.textContent = '';
      if (!EXT.includes(f.name.slice(f.name.lastIndexOf('.')).toLowerCase())) {
        err.textContent = 'mp3 / m4a / wav / ogg のファイルを選んでください';
        return;
      }
      file = f; info = null;
      const my = ++token; // 解析中に別のファイルが選ばれたら、古い結果は捨てる
      if (!name.value || name.value === autoName) name.value = autoName = f.name.replace(/\.[^.]+$/, '');
      box.innerHTML = `<span class="file-info"><span class="name">${esc(f.name)}</span><span class="sub">読み込み中…</span></span>`;
      const status = box.querySelector('.sub');
      try {
        const r = await analyze(f, (p) => { if (my === token) status.textContent = `波形を解析中 ${Math.round(p * 100)}%`; });
        if (my !== token) return;
        info = r;
        box.innerHTML = `<span class="file-info"><span class="name">${esc(f.name)}</span>
          <span class="sub num">${fmtTime(r.duration)} · ${(f.size / 1048576).toFixed(1)} MB</span></span>${pickBtn('変更…')}`;
      } catch {
        if (my !== token) return;
        file = null;
        showEmpty();
        err.textContent = 'このファイルは読み込めませんでした。別のファイルを選んでください';
      }
    }

    async function ok() {
      if (busy) return;
      if (!file) { err.textContent = '音楽ファイルを選んでください'; return; }
      if (!info) { err.textContent = '解析が終わるまでお待ちください'; return; }
      if (!name.value.trim()) { err.textContent = '名前を入力してください'; name.focus(); return; }
      busy = true;
      try {
        const p = await window.api.createProject({
          srcPath: window.api.pathOf(file), name: name.value.trim(), duration: info.duration, peaks: info.peaks,
        });
        resolve(p);
        m.close();
      } catch {
        busy = false;
        err.textContent = 'プロジェクトを作れませんでした。もう一度試してください';
      }
    }

    m.el.addEventListener('click', (e) => {
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (act === 'pick') picker.click();
      if (act === 'ok') ok();
    });
    m.el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.target.closest('button')) ok();
    });
    picker.addEventListener('change', () => { if (picker.files[0]) select(picker.files[0]); picker.value = ''; });
    name.addEventListener('input', () => { err.textContent = ''; });

    dropHandler = select;
    showEmpty();
    if (initialFile) select(initialFile);
    else box.querySelector('button').focus();
  });
}
