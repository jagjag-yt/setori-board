// 画面側に公開する API（ここに書いたものだけが画面から使える）
const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('api', {
  read: (rel) => ipcRenderer.invoke('store:read', rel),
  write: (rel, data) => ipcRenderer.invoke('store:write', rel, data),
  writeSync: (rel, data) => ipcRenderer.sendSync('store:writeSync', rel, data),
  listProjects: () => ipcRenderer.invoke('projects:list'),
  createProject: (args) => ipcRenderer.invoke('projects:create', args),
  duplicateProject: (id) => ipcRenderer.invoke('projects:duplicate', id),
  deleteProject: (id) => ipcRenderer.invoke('projects:delete', id),
  projectUrl: (id) => ipcRenderer.invoke('projects:url', id),
  menu: (items) => ipcRenderer.invoke('menu:popup', items),
  setTheme: (theme) => ipcRenderer.send('theme:set', theme),
  pathOf: (file) => webUtils.getPathForFile(file), // ドロップ/選択したファイルの実際の場所
  // 自動アップデート
  version: ipcRenderer.sendSync('app:version'),
  onUpdate: (cb) => ipcRenderer.on('update:status', (_e, s) => cb(s)),
  downloadUpdate: () => ipcRenderer.invoke('update:download'),
  installUpdate: () => ipcRenderer.send('update:install'),
});
