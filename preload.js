const { contextBridge, ipcRenderer } = require('electron');

// Предоставляем безопасный API для renderer процесса
contextBridge.exposeInMainWorld('electronAPI', {
  // Node управление
  toggleNode: (shouldStart) => ipcRenderer.send('toggle-node', shouldStart),
  getNodeStatus: () => ipcRenderer.invoke('get-node-status'),
  checkFiles: () => ipcRenderer.invoke('check-files'),

  // Окно управление
  closeWindow: () => ipcRenderer.send('close-window'),
  minimizeWindow: () => ipcRenderer.send('minimize-window'),
  maximizeWindow: () => ipcRenderer.send('maximize-window'),
  quitApp: () => ipcRenderer.send('quit-app'),

  // Слушатели событий
  onNodeStatus: (callback) => {
    ipcRenderer.on('node-status', (event, data) => callback(data));
  },
  onNodeLog: (callback) => {
    ipcRenderer.on('node-log', (event, data) => callback(data));
  },
  onSetupRequired: (callback) => {
    ipcRenderer.on('setup-required', (event, data) => callback(data));
  },
  onSetupProgress: (callback) => {
    ipcRenderer.on('setup-progress', (event, data) => callback(data));
  },

  chat: (message, sessionId) => ipcRenderer.invoke('chat', { message, sessionId }),
  getWorkerStats: () => ipcRenderer.invoke('get-worker-stats'),
  registerNode: () => ipcRenderer.invoke('register-node'),

  onNodeRegistered: (callback) => {
    ipcRenderer.on('node-registered', (event, data) => callback(data));
  },

  // Настройки и железо
  onHardwareInfo: (cb) => ipcRenderer.on('hardware-info', (e, d) => cb(d)),
  onAutoLoad:     (cb) => ipcRenderer.on('auto-load',     (e, d) => cb(d)),
  onLoadChanged:  (cb) => ipcRenderer.on('load-changed',  (e, d) => cb(d)),
  saveSettings:   (s)  => ipcRenderer.send('save-settings', s),
  setSleepMode:   (en) => ipcRenderer.send('sleep-mode', en),

  // Автообновление
  onUpdateAvailable:  (cb) => ipcRenderer.on('update-available',  (e, d) => cb(d)),
  onUpdateDownloaded: (cb) => ipcRenderer.on('update-downloaded', (e, d) => cb(d)),
  installUpdate:      ()   => ipcRenderer.send('install-update'),

  // Онбординг (первый запуск)
  onFirstRunStart:    (cb) => ipcRenderer.on('first-run-start',    (e, d) => cb(d)),
  onFirstRunProgress: (cb) => ipcRenderer.on('first-run-progress', (e, d) => cb(d)),
  onFirstRunDone:     (cb) => ipcRenderer.on('first-run-done',     (e, d) => cb(d)),

  // Узел упал / ошибка watchdog
  onNodeError:   (cb) => ipcRenderer.on('node-error',   (e, d) => cb(d)),
  onNodeStopped: (cb) => ipcRenderer.on('node-stopped', (e, d) => cb(d)),

  // Удаление слушателей
  removeAllListeners: () => {
    ipcRenderer.removeAllListeners('node-status');
    ipcRenderer.removeAllListeners('node-log');
    ipcRenderer.removeAllListeners('setup-required');
    ipcRenderer.removeAllListeners('setup-progress');
    ipcRenderer.removeAllListeners('node-registered');
    ipcRenderer.removeAllListeners('hardware-info');
    ipcRenderer.removeAllListeners('auto-load');
    ipcRenderer.removeAllListeners('load-changed');
    ipcRenderer.removeAllListeners('update-available');
    ipcRenderer.removeAllListeners('update-downloaded');
    ipcRenderer.removeAllListeners('first-run-start');
    ipcRenderer.removeAllListeners('first-run-progress');
    ipcRenderer.removeAllListeners('first-run-done');
    ipcRenderer.removeAllListeners('node-error');
    ipcRenderer.removeAllListeners('node-stopped');
  }
});
