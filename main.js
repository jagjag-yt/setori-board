// メインプロセス：ウィンドウを作り、ファイル保存を担当する
const { app, BrowserWindow, ipcMain, Menu, nativeTheme } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { pathToFileURL } = require('url');
const { autoUpdater } = require('electron-updater');

const DATA = path.resolve(app.getPath('userData'));

// 画面側から渡された相対パスを userData 内の絶対パスにする（外へ出るパスは拒否）
function resolveData(rel) {
  const p = path.resolve(DATA, rel);
  if (!p.startsWith(DATA + path.sep)) throw new Error('不正なパス: ' + rel);
  return p;
}

function readJSON(rel) {
  try {
    return JSON.parse(fs.readFileSync(resolveData(rel), 'utf8'));
  } catch (e) {
    if (e.code === 'ENOENT') return null;
    throw e;
  }
}

// 一時ファイルに書いてからリネーム（途中で落ちても元のファイルは壊れない）
function writeJSON(rel, data) {
  const p = resolveData(rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const tmp = p + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, p);
}

const newId = (prefix) => prefix + '_' + crypto.randomUUID().slice(0, 8);
const AUDIO_EXT = ['.mp3', '.m4a', '.wav', '.ogg'];

// プロジェクトフォルダのパス（id の形を確かめてから）
function projectDir(id) {
  if (!/^p_[\w-]+$/.test(id)) throw new Error('不正な id: ' + id);
  return resolveData(path.join('projects', id));
}

ipcMain.handle('projects:list', () => {
  const dir = path.join(DATA, 'projects');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).flatMap((id) => {
    try { return [readJSON(`projects/${id}/project.json`)].filter(Boolean); } catch { return []; }
  });
});

ipcMain.handle('projects:create', (_e, { srcPath, name, duration, peaks }) => {
  const ext = path.extname(srcPath).toLowerCase();
  if (!AUDIO_EXT.includes(ext)) throw new Error('対応していない形式: ' + ext);
  const id = newId('p');
  const dir = projectDir(id);
  fs.mkdirSync(dir, { recursive: true });
  fs.copyFileSync(srcPath, path.join(dir, 'audio' + ext));
  writeJSON(`projects/${id}/peaks.json`, peaks);
  const project = {
    id, name,
    audioFile: 'audio' + ext,
    originalFileName: path.basename(srcPath),
    duration,
    updatedAt: new Date().toISOString(),
    // 最初は曲全体で 1 ブロック
    blocks: [{ id: newId('b'), name: 'ブロック 1', start: 0, end: duration, cards: [] }],
  };
  writeJSON(`projects/${id}/project.json`, project);
  return project;
});

ipcMain.handle('projects:duplicate', (_e, id) => {
  const nid = newId('p');
  fs.cpSync(projectDir(id), projectDir(nid), { recursive: true });
  const p = readJSON(`projects/${nid}/project.json`);
  Object.assign(p, { id: nid, name: p.name + ' のコピー', updatedAt: new Date().toISOString() });
  writeJSON(`projects/${nid}/project.json`, p);
  return p;
});

// プロジェクトフォルダの file:// URL（音声の再生に使う）
ipcMain.handle('projects:url', (_e, id) => pathToFileURL(projectDir(id)).href + '/');

ipcMain.handle('projects:delete', (_e, id) => fs.rmSync(projectDir(id), { recursive: true, force: true }));

// 右クリックメニュー（OS 標準）。選ばれた項目の id を返す。何も選ばなければ null
ipcMain.handle('menu:popup', (e, items) => new Promise((resolve) => {
  const menu = Menu.buildFromTemplate(items.map(([id, label]) => ({ label, click: () => resolve(id) })));
  menu.popup({ window: BrowserWindow.fromWebContents(e.sender), callback: () => setTimeout(() => resolve(null)) });
}));

// OS 標準の部品（右クリックメニュー等）の明暗をアプリのテーマに合わせる
ipcMain.on('theme:set', (_e, theme) => { nativeTheme.themeSource = theme; });

ipcMain.handle('store:read', (_e, rel) => readJSON(rel));
ipcMain.handle('store:write', (_e, rel, data) => writeJSON(rel, data));
// 終了直前の書き込み用（同期）
ipcMain.on('store:writeSync', (e, rel, data) => {
  try { writeJSON(rel, data); e.returnValue = true; } catch { e.returnValue = false; }
});

// ===== 自動アップデート（GitHub Releases）=====
// 起動時に確認し、新しい版があれば画面にボタンを出す。ダウンロードと再起動は利用者がボタンで行う
autoUpdater.autoDownload = false;
ipcMain.handle('update:download', () => autoUpdater.downloadUpdate());
ipcMain.on('update:install', () => autoUpdater.quitAndInstall());
ipcMain.on('app:version', (e) => { e.returnValue = app.getVersion(); });

function setupUpdater(win) {
  if (!app.isPackaged) return; // 開発中（npm start）は確認しない
  const send = (s) => { if (!win.isDestroyed()) win.webContents.send('update:status', s); };
  autoUpdater.on('update-available', (info) => send({ state: 'available', version: info.version }));
  autoUpdater.on('download-progress', (p) => send({ state: 'downloading', percent: Math.round(p.percent) }));
  autoUpdater.on('update-downloaded', () => send({ state: 'ready' }));
  autoUpdater.on('error', () => send({ state: 'error' }));
  // 画面の読み込みが終わってから確認する（オフラインなどで失敗しても、そのまま使える）
  win.webContents.once('did-finish-load', () => autoUpdater.checkForUpdates().catch(() => {}));
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1600,
    height: 960,
    minWidth: 1280,
    minHeight: 720,
    backgroundColor: '#161513',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  setupUpdater(win);
  win.loadFile(path.join(__dirname, 'src', 'index.html'));
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
