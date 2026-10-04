// 画面全体：state を持ち、render() で DOM を作り直す
import { save, load, cancelSave, setSaveStatusListener } from './store.js';
import { esc, confirmDialog, promptDialog } from './ui.js';
import { listView, createDialog, dropHandler } from './list.js';
import { stockDialog } from './stock.js';
import { paintUpdate } from './update.js';
import { openEditor, closeEditor, editorView, mountEditor, editorAction, editorDblClick, editorKey, togglePlay, saveStatusHtml } from './editor.js';

const state = {
  settings: { theme: 'dark' },
  stock: { tricks: [] },
  projects: [],
  screen: 'list',   // 'list' | 'editor'
  project: null,    // 編集中のプロジェクト
};

const $app = document.getElementById('app');
const projectPath = (p) => `projects/${p.id}/project.json`;

function applyTheme() {
  document.documentElement.dataset.theme = state.settings.theme;
  window.api.setTheme(state.settings.theme);
}

function toggleTheme() {
  state.settings.theme = state.settings.theme === 'dark' ? 'light' : 'dark';
  applyTheme();
  save('settings.json', state.settings);
  render();
}

function render() {
  if (state.screen === 'editor') {
    $app.innerHTML = editorView(state.settings.theme === 'dark');
    mountEditor();
  } else {
    $app.innerHTML = listView(state);
  }
  paintUpdate();
}

async function openProject(p) {
  await openEditor(p, state, render);
  state.project = p;
  state.screen = 'editor';
  render();
}

async function newProject(file) {
  const p = await createDialog(file);
  if (!p) return;
  state.projects.push(p);
  openProject(p);
}

// 一覧の行の右クリックメニュー
async function projectMenu(p) {
  const act = await window.api.menu([['rename', '名前を変更'], ['dup', '複製'], ['del', '削除']]);
  if (act === 'rename') {
    const name = await promptDialog('名前を変更', p.name);
    if (!name) return;
    p.name = name;
    p.updatedAt = new Date().toISOString();
    save(projectPath(p), p);
  } else if (act === 'dup') {
    state.projects.push(await window.api.duplicateProject(p.id));
  } else if (act === 'del') {
    const ok = await confirmDialog('プロジェクトを削除',
      `「${esc(p.name)}」を削除します。コピーした音楽ファイルも消え、元に戻せません。`, '削除', true);
    if (!ok) return;
    cancelSave(projectPath(p));
    await window.api.deleteProject(p.id);
    state.projects = state.projects.filter((x) => x !== p);
  }
  render();
}

// クリックはまとめて受ける（data-act で振り分け）
$app.addEventListener('click', (e) => {
  const act = e.target.closest('[data-act]')?.dataset.act;
  if (act === 'theme') toggleTheme();
  else if (act === 'new') newProject();
  else if (act === 'stock' && state.screen === 'list') stockDialog(state, render);
  else if (act === 'back') { closeEditor(); state.screen = 'list'; render(); }
  else if (state.screen === 'editor') { if (act && editorAction(act, e.target.closest('[data-act]'))) render(); }
  else {
    const row = e.target.closest('.row[data-id]');
    if (row) openProject(state.projects.find((p) => p.id === row.dataset.id));
  }
});

// キー操作（文字入力中やダイアログ表示中は反応させない）
const typing = (e) => e.target.closest('input:not([type=range]), textarea, [contenteditable]') || document.querySelector('.scrim');
window.addEventListener('keydown', (e) => {
  if (state.screen !== 'editor' || typing(e)) return;
  if (e.code === 'Space') {
    e.preventDefault(); // フォーカス中のボタンが押されたり、画面がスクロールしたりしないように
    if (!e.repeat) togglePlay();
  } else if (editorKey(e)) {
    render();
  }
});
window.addEventListener('keyup', (e) => {
  if (state.screen === 'editor' && e.code === 'Space' && !typing(e)) e.preventDefault();
});

setSaveStatusListener((saved) => {
  const el = document.getElementById('save-status');
  if (el) el.innerHTML = saveStatusHtml(saved);
});

$app.addEventListener('dblclick', async (e) => {
  if (state.screen === 'editor' && await editorDblClick(e)) render();
});

$app.addEventListener('contextmenu', (e) => {
  const row = e.target.closest('.row[data-id]');
  if (row) projectMenu(state.projects.find((p) => p.id === row.dataset.id));
});

// ファイルをウィンドウに落とすと、作成ダイアログへ（落とさないと Electron がファイルを開いてしまう）
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => {
  e.preventDefault();
  const f = e.dataTransfer.files[0];
  if (!f) return;
  if (dropHandler) dropHandler(f);
  else if (state.screen === 'list') newProject(f);
});

// 起動時の読み込み
state.settings = { ...state.settings, ...(await load('settings.json')) };
state.stock = (await load('stock.json')) ?? state.stock;
state.projects = await window.api.listProjects();
applyTheme();
render();
