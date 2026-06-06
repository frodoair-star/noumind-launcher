const { app, BrowserWindow, ipcMain, dialog, Tray, Menu, nativeImage, powerMonitor } = require('electron');
const path = require('path');
const { spawn, execSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const https = require('https');

// electron-updater может отсутствовать в dev/unpacked — не падаем
let autoUpdater = null;
try { autoUpdater = require('electron-updater').autoUpdater; } catch { /* dev mode */ }

// Находим Python 3.11
function findPython311() {
  const candidates = [
    '/Users/fedorlorenz/.local/bin/python3.11',
    '/usr/local/bin/python3.11',
    '/opt/homebrew/bin/python3.11',
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      console.log('[Main] Python 3.11 найден:', p);
      return p;
    }
  }
  // Fallback — ищем через which
  try { return execSync('which python3.11').toString().trim(); } catch {}
  try { return execSync('which python3').toString().trim(); } catch {}
  return 'python3';
}

const PYTHON_PATH = findPython311();

let mainWindow;
let nodeProcess    = null;
let isNodeRunning  = false;
let nodeSettings   = { layerStart: 11, loadPercent: 40 };
let userPreference = 40;
let sleepModeInterval = null;
let detectedHardware  = { totalRAM: 8 };   // заполняется в detectHardware()

// Трей / фоновый режим
let tray             = null;
let isUserActive     = true;
let currentLoad      = 40;
let idleCheckInterval = null;

// Watchdog автоперезапуска узла
let nodeRestartCount = 0;
const MAX_RESTARTS   = 5;

// Файлы, обязательные при первом запуске (полные пути)
const FIRST_RUN_FILES = [
  path.join(os.homedir(), 'noumind', 'node_pipeline.py'),
  path.join(os.homedir(), 'noumind', 'neuron.py'),
];

// ─────────────────────────────────────────
// ОПРЕДЕЛЕНИЕ ЖЕЛЕЗА
// ─────────────────────────────────────────

async function detectHardware() {
  const totalRAM = os.totalmem() / 1024 ** 3;
  const freeRAM  = os.freemem()  / 1024 ** 3;
  const cpuCount = os.cpus().length;
  const cpuModel = os.cpus()[0]?.model || 'Unknown CPU';

  let device = 'cpu';
  try {
    const result = execSync(
      `${PYTHON_PATH} -c "import torch; print('mps' if torch.backends.mps.is_available() else ('cuda' if torch.cuda.is_available() else 'cpu'))"`
    ).toString().trim();
    device = result;
  } catch (e) {}

  return { totalRAM, freeRAM, cpuCount, cpuModel, device };
}

function calcFromPercent(pct, _totalRAM) {
  // Нода держит слои 11-21. load% → сколько слоёв из этого диапазона.
  const nodeLayerStart = 11;
  const nodeLayerEnd   = 21;
  const nodeLayerCount = nodeLayerEnd - nodeLayerStart + 1; // 11
  const keptLayers = Math.max(1, Math.round(nodeLayerCount * pct / 100));
  const layerStart = nodeLayerEnd - keptLayers + 1;
  const ramUsed    = (keptLayers * 0.1).toFixed(1);        // 100MB/слой
  const computeRate = (pct / 100 * 9 + 1).toFixed(1);
  const speed      = Math.floor(60 - (pct / 100) * 55);
  return { ramUsed, layers: `${layerStart}-21`, layerStart, computeRate, speed };
}

const NOUMIND_DIR = path.join(os.homedir(), 'noumind');
const NODE_SCRIPT = path.join(NOUMIND_DIR, 'node_pipeline.py');
const MODEL_PATH  = path.join(NOUMIND_DIR, 'model.gguf');
const NODE_PORT   = 9002;

// Необходимые файлы
const REQUIRED_FILES = {
  'node_pipeline.py': true,
  'neuron.py': true,
};

// Создание главного окна
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 700,
    frame: false,
    show: false,  // Скрыть пока не загрузится
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false,  // Разрешаем запросы к localhost
    },
  });

  console.log('[Main] Окно создано, загружаю index.html...');
  mainWindow.loadFile('index.html');

  // Показать окно когда оно готово
  mainWindow.once('ready-to-show', () => {
    console.log('[Main] Окно готово, показываю...');
    mainWindow?.show();

  });

  // Обработка ошибок загрузки
  mainWindow.webContents.on('crashed', () => {
    console.error('[Main] Renderer процесс упал!');
  });

  mainWindow.on('closed', () => {
    console.log('[Main] Окно закрыто');
    mainWindow = null;
  });

  // Закрытие окна (красная кнопка) → сворачиваем в трей, не закрываем приложение
  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
      console.log('[Main] Окно свёрнуто в трей — узел продолжает работать');
    }
  });

  // Отправляем железо + проверяем первый запуск после загрузки страницы
  mainWindow.webContents.on('did-finish-load', async () => {
    const hw = await detectHardware();
    detectedHardware = hw;
    console.log('[Main] Железо:', hw);
    mainWindow?.webContents.send('hardware-info', hw);
    checkFirstRun();
  });
}

// ─────────────────────────────────────────
// ОНБОРДИНГ — первый запуск
// ─────────────────────────────────────────

async function checkFirstRun() {
  const isFirstRun = FIRST_RUN_FILES.some(f => !fs.existsSync(f));
  if (!isFirstRun) return;
  console.log('[Onboarding] Первый запуск — настраиваю узел...');
  mainWindow?.webContents.send('first-run-start');
  await setupFirstRun();
  mainWindow?.webContents.send('first-run-done');
}

async function setupFirstRun() {
  const noumindDir = path.join(os.homedir(), 'noumind');
  if (!fs.existsSync(noumindDir)) fs.mkdirSync(noumindDir, { recursive: true });

  // ⚠️ Замени YOUR_GITHUB_USERNAME на реальный репозиторий с node_pipeline.py и neuron.py
  const BASE_URL = 'https://raw.githubusercontent.com/YOUR_GITHUB_USERNAME/noumind/main/';
  const files = ['node_pipeline.py', 'neuron.py'];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    mainWindow?.webContents.send('first-run-progress', {
      step: `Скачиваю ${file}...`,
      percent: (i / files.length) * 50,
    });
    try {
      const response = await fetch(BASE_URL + file);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const text = await response.text();
      fs.writeFileSync(path.join(noumindDir, file), text);
    } catch (e) {
      mainWindow?.webContents.send('first-run-progress', {
        step: `Не удалось скачать ${file}. Проверь интернет или укажи репозиторий в setupFirstRun().`,
        percent: 0, error: true,
      });
      return;
    }
  }

  mainWindow?.webContents.send('first-run-progress', { step: 'Проверяю Python 3.11...', percent: 60 });
  try {
    execSync(`${PYTHON_PATH} --version`);
  } catch (e) {
    mainWindow?.webContents.send('first-run-progress', {
      step: 'Установи Python 3.11 с python.org и перезапусти приложение',
      percent: 60, error: true,
    });
    return;
  }

  mainWindow?.webContents.send('first-run-progress', { step: 'Устанавливаю зависимости Python (пара минут)...', percent: 70 });
  try {
    execSync(
      `${PYTHON_PATH} -m pip install torch transformers httpx fastapi uvicorn psutil --break-system-packages`,
      { timeout: 300000 }
    );
  } catch (e) {
    console.log('[Onboarding] pip install: часть пакетов могла уже стоять —', e.message);
  }

  mainWindow?.webContents.send('first-run-progress', { step: 'Всё готово!', percent: 100 });
}

// Проверка и создание директории noumind
function ensureNoumindDir() {
  if (!fs.existsSync(NOUMIND_DIR)) {
    console.log('[Main] Создаю директорию:', NOUMIND_DIR);
    fs.mkdirSync(NOUMIND_DIR, { recursive: true });
  }
}

// Скачивание файла с GitHub
function downloadFile(url, filePath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(filePath);
    https.get(url, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`HTTP ${response.statusCode}`));
        return;
      }
      response.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve();
      });
    }).on('error', reject);
  });
}

// Проверка и загрузка необходимых файлов
async function ensureFilesExist() {
  ensureNoumindDir();

  const missingFiles = [];
  for (const [filename] of Object.entries(REQUIRED_FILES)) {
    const filePath = path.join(NOUMIND_DIR, filename);
    if (!fs.existsSync(filePath)) {
      missingFiles.push(filename);
    }
  }

  if (missingFiles.length > 0) {
    console.log('[Main] Отсутствуют файлы:', missingFiles);
    mainWindow?.webContents.send('setup-required', {
      status: 'downloading',
      message: `Загружаю необходимые файлы (${missingFiles.length})...`,
      files: missingFiles
    });

    // Пытаемся скачать файлы
    let downloaded = 0;
    for (const filename of missingFiles) {
      try {
        const filePath = path.join(NOUMIND_DIR, filename);
        const url = REQUIRED_FILES[filename];
        console.log(`[Main] Скачиваю ${filename}...`);

        await downloadFile(url, filePath);
        downloaded++;

        mainWindow?.webContents.send('setup-progress', {
          downloaded,
          total: missingFiles.length,
          currentFile: filename
        });
      } catch (err) {
        console.error(`[Main] Ошибка загрузки ${filename}:`, err.message);
        // Продолжаем, может быть файл не нужен
      }
    }

    if (downloaded === missingFiles.length) {
      mainWindow?.webContents.send('setup-required', {
        status: 'ready',
        message: 'Файлы загружены!',
        downloaded: true
      });
    } else {
      mainWindow?.webContents.send('setup-required', {
        status: 'partial',
        message: `Загружено ${downloaded}/${missingFiles.length} файлов. Используйте Gateway.`,
        downloaded: downloaded > 0
      });
    }
  } else {
    console.log('[Main] Все файлы присутствуют');
    mainWindow?.webContents.send('setup-required', {
      status: 'ready',
      message: 'Все файлы готовы',
      downloaded: true
    });
  }
}

// Функция для очистки занятого порта
function killPortProcess(port) {
  return new Promise((resolve) => {
    const { exec } = require('child_process');
    console.log(`[Main] Пытаюсь очистить порт ${port}...`);
    exec(`lsof -ti :${port} | xargs -r kill -9 2>/dev/null || true`, (err) => {
      setTimeout(resolve, 500);  // Даем время процессу завершиться
    });
  });
}

// Перезапуск с новыми параметрами
async function restartNodeProcess(layerStart, loadPercent) {
  nodeSettings = { layerStart, loadPercent };
  console.log(`[Main] Перезапускаю node с layer-start=${layerStart} load-pct=${loadPercent}`);
  stopNodeProcess();
  await new Promise(r => setTimeout(r, 1500));
  await startNodeProcess();
}

// Запуск Python узла (если файлы есть)
async function startNodeProcess() {
  if (isNodeRunning || nodeProcess) {
    console.log('[Main] Node уже запущен');
    return;
  }

  // Проверяем что файл существует
  if (!fs.existsSync(NODE_SCRIPT)) {
    console.error('[Main] node_pipeline.py не найден. Пропускаю запуск локального узла.');
    mainWindow?.webContents.send('node-status', {
      status: 'unavailable',
      message: 'Локальный узел недоступен. Используйте Gateway.',
      isRunning: false
    });
    return;
  }

  // Убиваем старый процесс на порту
  await killPortProcess(NODE_PORT);

  console.log('[Main] Запускаю node_pipeline.py...');

  // Переменные окружения для обхода OpenMP проблемы на macOS
  const env = Object.assign({}, process.env);
  env.KMP_DUPLICATE_LIB_OK = 'TRUE';
  env.OMP_NUM_THREADS = '4';

  const workerId = `user-${os.hostname()}`;
  console.log(`[Main] Python: ${PYTHON_PATH}, worker-id: ${workerId}, layer-start: ${nodeSettings.layerStart}, load-pct: ${nodeSettings.loadPercent}`);
  nodeProcess = spawn(PYTHON_PATH, [
    path.join(os.homedir(), 'noumind', 'node_pipeline.py'),
    '--worker-id',   workerId,
    '--gateway',     'http://217.160.49.222:8002',
    '--port',        String(NODE_PORT),
    '--layer-start', String(nodeSettings.layerStart),
    '--load-pct',    String(nodeSettings.loadPercent),
  ], {
    cwd: NOUMIND_DIR,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: false,
    env: env
  });

  isNodeRunning = true;

  console.log(`[Main] Node процесс запущен (PID: ${nodeProcess.pid})`);

  let modelLoadedSent = false;  // Флаг чтобы не отправить дважды

  // Проверяем готовность узла периодически через HTTP
  const readinessCheckInterval = setInterval(async () => {
    if (modelLoadedSent) {
      clearInterval(readinessCheckInterval);
      return;
    }

    try {
      const response = await fetch('http://localhost:9002/health');
      if (response.ok) {
        const data = await response.json();
        if (data.status === 'ready') {
          modelLoadedSent = true;
          nodeRestartCount = 0;   // успешный старт — сбрасываем watchdog
          clearInterval(readinessCheckInterval);
          console.log('[Main] ✓✓✓ HTTP проверка: узел ГОТОВ! Отправляю сообщение в renderer...');
          mainWindow?.webContents.send('node-status', {
            status: 'ready',
            message: '✓ Узел активен',
            isRunning: true
          });
          console.log('[Main] ✓ Сообщение о готовности отправлено в renderer');
        }
      }
    } catch (err) {
      // Узел еще не доступен
    }
  }, 1000);  // Проверяем каждую секунду

  // Обработчик для stdout (как резервный)
  const checkNodeReady = (message) => {
    if ((message.includes('✓ Model loaded') ||
         message.includes('Model loaded') ||
         message.includes('EFCT phase gates') ||
         message.includes('Ready to serve')) && !modelLoadedSent) {
      modelLoadedSent = true;
      clearInterval(readinessCheckInterval);
      console.log('[Main] ✓✓✓ Stdout check: узел готов! Отправляю сообщение в renderer...');
      mainWindow?.webContents.send('node-status', {
        status: 'ready',
        message: '✓ Узел активен',
        isRunning: true
      });
      console.log('[Main] ✓ Сообщение о готовности отправлено в renderer');
    }
  };

  nodeProcess.stdout?.on('data', (data) => {
    const message = data.toString();
    console.log('[Node]', message.trim());
    mainWindow?.webContents.send('node-log', { message: message.trim() });
    checkNodeReady(message);
  });

  nodeProcess.stderr?.on('data', (data) => {
    const message = data.toString();
    console.error('[Node ERROR]', message.trim());
    mainWindow?.webContents.send('node-log', {
      message: message.trim(),
      isError: true
    });
    checkNodeReady(message);  // Проверяем и stderr
  });

  nodeProcess.on('close', (code) => {
    console.log(`[Main] Node процесс завершен (код: ${code})`);
    isNodeRunning = false;
    nodeProcess = null;
    mainWindow?.webContents.send('node-status', {
      status: 'stopped',
      message: 'Узел выключен',
      isRunning: false
    });

    // Watchdog: перезапуск при аварийном падении (не при ручной остановке/выходе)
    if (code !== 0 && code !== null && !app.isQuitting) {
      if (nodeRestartCount >= MAX_RESTARTS) {
        console.error(`[Watchdog] Узел упал ${MAX_RESTARTS} раз — сдаюсь`);
        mainWindow?.webContents.send('node-error', 'Узел не запускается. Перезапусти приложение.');
        return;
      }
      nodeRestartCount++;
      console.log(`[Watchdog] Узел упал (код ${code}). Перезапуск ${nodeRestartCount}/${MAX_RESTARTS} через 5 сек...`);
      setTimeout(() => startNodeProcess(), 5000);
    }
  });

  nodeProcess.on('error', (err) => {
    console.error('[Main] Ошибка запуска Node:', err);
    isNodeRunning = false;
    nodeProcess = null;
    mainWindow?.webContents.send('node-status', {
      status: 'error',
      message: `Ошибка: ${err.message}`,
      isRunning: false
    });
  });

  mainWindow?.webContents.send('node-status', {
    status: 'loading',
    message: 'Загружаю модель...',
    isRunning: true
  });
}

// Остановка Python узла
function stopNodeProcess() {
  if (!nodeProcess || !isNodeRunning) {
    console.log('[Main] Node не запущен');
    return;
  }

  console.log('[Main] Останавливаю node_pipeline.py...');
  isNodeRunning = false;

  try {
    nodeProcess.kill('SIGKILL');
    nodeProcess = null;
  } catch (err) {
    // Пробуем через pid напрямую
    try {
      process.kill(nodeProcess.pid, 'SIGKILL');
    } catch (e) {}
    nodeProcess = null;
  }

  // Убиваем порт на всякий случай
  const { exec } = require('child_process');
  exec(`lsof -ti :${NODE_PORT} | xargs -r kill -9 2>/dev/null || true`);

  mainWindow?.webContents.send('node-status', {
    status: 'stopped',
    message: 'Узел выключен',
    isRunning: false
  });
}

// ─────────────────────────────────────────
// ТРЕЙ — фоновый режим
// ─────────────────────────────────────────
function createTray() {
  if (tray) return;
  const icon = nativeImage.createFromDataURL(
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAAAdgAAAHYBTnsmCAAAABl0RVh0U29mdHdhcmUAd3d3Lmlua3NjYXBlLm9yZ5vuPBoAAADMSURBVDiNY/j//z8DJZhh1ACqDGBhYGBg+P//PxMDA8N/BgYGhv8MDAz/GRgY/jMwMPxnYGD4z8DA8J+BgeE/AwPDfwYGhv8MDAwMo0YQYQALAwMDw////xn+MzAwMDAwMDAwYGBg+M/AwPCfgYHhPwMDw38GBob/DAwM/xkYGP4zMDAwjBpBhAEsDAwMDL9//2b4z8DAwMDAwMDAgIGB4T8DA8N/BgaG/wwMDP8ZGBj+MzAw/GdgYBg1gggDWBgYGBh+//7NAADBwhGujjW4ZQAAAABJRU5ErkJggg=='
  );
  tray = new Tray(icon);

  const menu = Menu.buildFromTemplate([
    { label: 'uNeuro — Узел активен', enabled: false },
    { type: 'separator' },
    { label: 'Открыть', click: () => { mainWindow?.show(); mainWindow?.focus(); } },
    { label: 'Остановить узел', click: () => { stopNodeProcess(); mainWindow?.webContents.send('node-stopped'); } },
    { type: 'separator' },
    { label: 'Выйти', click: () => { app.isQuitting = true; app.quit(); } },
  ]);
  tray.setContextMenu(menu);
  tray.setToolTip('uNeuro · Узел активен · Добыча идёт');

  tray.on('click', () => {
    if (mainWindow?.isVisible()) mainWindow.hide();
    else { mainWindow?.show(); mainWindow?.focus(); }
  });
  console.log('[Tray] Иконка в трее создана');
}

// ─────────────────────────────────────────
// УМНАЯ НАГРУЗКА — динамически, БЕЗ перезапуска узла
// ─────────────────────────────────────────
async function setNodeLoadDynamic(percent) {
  try {
    await fetch(`http://localhost:${NODE_PORT}/load/set?percent=${Math.round(percent)}`, { method: 'POST' });
    console.log(`[Smart Load] Нагрузка → ${Math.round(percent)}%`);
    mainWindow?.webContents.send('load-changed', { percent: Math.round(percent) });
  } catch (e) {
    console.log('[Smart Load] Узел не отвечает (ещё грузится?)');
  }
}

// ─────────────────────────────────────────
// АВТООБНОВЛЕНИЕ
// ─────────────────────────────────────────
function setupAutoUpdater() {
  if (!autoUpdater) { console.log('[Updater] electron-updater недоступен (dev режим)'); return; }
  try {
    autoUpdater.checkForUpdatesAndNotify();
    setInterval(() => autoUpdater.checkForUpdatesAndNotify(), 30 * 60 * 1000);

    autoUpdater.on('update-available', () => {
      console.log('[Updater] Доступно обновление');
      mainWindow?.webContents.send('update-available');
    });
    autoUpdater.on('update-downloaded', () => {
      console.log('[Updater] Обновление скачано');
      mainWindow?.webContents.send('update-downloaded');
    });
    autoUpdater.on('error', (err) => console.log('[Updater] Ошибка:', err?.message));
  } catch (e) {
    console.log('[Updater] Не настроен (нужен GitHub repo + подпись):', e.message);
  }
}

ipcMain.on('install-update', () => {
  if (autoUpdater) { app.isQuitting = true; autoUpdater.quitAndInstall(); }
});

// IPC обработчики
ipcMain.on('toggle-node', async (event, shouldStart) => {
  console.log('[Main] Получено сообщение toggle-node:', shouldStart);
  console.log('[Main] Текущее состояние узла - isNodeRunning:', isNodeRunning, 'nodeProcess:', nodeProcess ? 'exists' : 'null');

  if (shouldStart) {
    console.log('[Main] Пользователь нажал ВКЛЮЧИТЬ узел');
    await startNodeProcess();
  } else {
    console.log('[Main] Пользователь нажал ВЫКЛЮЧИТЬ узел');
    stopNodeProcess();
  }
});

ipcMain.handle('get-node-status', async () => {
  return {
    isRunning: isNodeRunning,
    status: isNodeRunning ? 'ready' : 'stopped'
  };
});

ipcMain.handle('chat', async (event, { message, sessionId, priority = 'balanced' }) => {
  const GATEWAY_URL = 'http://217.160.49.222:8002';
  try {
    const url = `${GATEWAY_URL}/chat?message=${encodeURIComponent(message)}&session_id=${sessionId}&priority=${priority}`;
    const response = await fetch(url, { method: 'POST' });
    const text = await response.text();
    const data = JSON.parse(text);
    return { success: true, data };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('get-worker-stats', async () => {
  const GATEWAY_URL = 'http://217.160.49.222:8000';
  try {
    // Берём и /health и /workers одновременно
    const [healthRes, workersRes] = await Promise.all([
      fetch(`${GATEWAY_URL}/health`),
      fetch(`${GATEWAY_URL}/workers`)
    ]);
    const health  = await healthRes.json();
    const workers = await workersRes.json();

    // Ищем наш узел по имени хоста
    const myName = `user-${os.hostname().replace(/[^a-zA-Z0-9]/g, '-').toLowerCase().slice(0, 12)}`;
    let myTasksDone = 0;
    let myTokens    = 0;
    for (const [wid, stats] of Object.entries(workers.workers || {})) {
      if (wid.startsWith(myName)) {
        myTasksDone = Math.max(myTasksDone, stats.tasks_done || 0);
        myTokens    = Math.max(myTokens,    stats.tokens_earned || 0);
      }
    }

    return {
      success: true,
      data: {
        workers_active: health.workers_active || 0,
        queue_size:     health.queue_size     || 0,
        my_tasks_done:  myTasksDone,
        my_tokens:      myTokens,
        total_workers:  workers.total || 0,
      }
    };
  } catch (err) {
    return { success: false };
  }
});

ipcMain.handle('register-node', async () => {
  const success = await registerNodeInGateway(9999);
  return { success };
});

ipcMain.handle('check-files', async () => {
  ensureNoumindDir();

  const status = {
    nodeScript: fs.existsSync(NODE_SCRIPT),
    model: fs.existsSync(MODEL_PATH),
    allPresent: fs.existsSync(NODE_SCRIPT) && fs.existsSync(MODEL_PATH)
  };

  return status;
});

ipcMain.on('save-settings', async (event, settings) => {
  console.log('[Main] Сохраняю настройки:', settings);
  userPreference = settings.loadPercent;
  currentLoad    = settings.loadPercent;
  // Применяем нагрузку динамически (без перезапуска) — модель не перезагружается
  await setNodeLoadDynamic(settings.loadPercent);
  // Передаём yield_chat флаг живой ноде (узел уже работает — без ожидания)
  try {
    await fetch(`http://localhost:${NODE_PORT}/settings/yield_chat?enabled=${!!settings.yieldChat}`, { method: 'POST' });
    console.log(`[Main] yield_chat=${settings.yieldChat} передан ноде`);
  } catch (e) { /* нода ещё грузится */ }
});

ipcMain.on('sleep-mode', (event, enabled) => {
  if (sleepModeInterval) {
    clearInterval(sleepModeInterval);
    sleepModeInterval = null;
  }
  if (!enabled) return;

  console.log('[Main] Ночной режим включён');

  const applyNightLoad = async (isNight) => {
    const pct = isNight ? 100 : userPreference;
    currentLoad = pct;
    mainWindow?.webContents.send('auto-load', pct);
    console.log(`[Night] ${isNight ? 'ночь' : 'день'} → нагрузка ${pct}% (без перезапуска)`);
    await setNodeLoadDynamic(pct);   // динамически, без перезагрузки модели
  };

  const hour0    = new Date().getHours();
  const isNight0 = hour0 < 7 || hour0 >= 23;
  applyNightLoad(isNight0);

  let lastNight = isNight0;
  sleepModeInterval = setInterval(async () => {
    const h       = new Date().getHours();
    const isNight = h < 7 || h >= 23;
    if (isNight !== lastNight) {
      lastNight = isNight;
      await applyNightLoad(isNight);
    }
  }, 60000);
});

ipcMain.on('quit-app', () => {
  if (nodeProcess && isNodeRunning) {
    stopNodeProcess();
  }
  app.quit();
});

ipcMain.on('close-window', () => {
  if (nodeProcess && isNodeRunning) {
    stopNodeProcess();
  }
  mainWindow?.close();
});

ipcMain.on('minimize-window', () => {
  mainWindow?.minimize();
});

ipcMain.on('maximize-window', () => {
  if (mainWindow?.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow?.maximize();
  }
});

// Функция для проверки готовности узла через HTTP
async function checkNodeReady() {
  try {
    const response = await fetch('http://localhost:9002/health');
    if (response.ok) {
      const data = await response.json();
      return data.status === 'ready';
    }
  } catch (err) {
    // Узел не доступен
  }
  return false;
}

// Получаем внешний IP машины пользователя
async function getPublicIP() {
  try {
    const r = await fetch('https://api.ipify.org?format=json');
    const d = await r.json();
    return d.ip;
  } catch (err) {
    return null;
  }
}

// Регистрация узла в Gateway
async function registerNodeInGateway(nodePort) {
  const GATEWAY_URL = 'http://217.160.49.222:8000';

  // Генерируем уникальное имя узла на основе hostname
  const os = require('os');
  const nodeName = `user-${os.hostname().replace(/[^a-zA-Z0-9]/g, '-').toLowerCase().slice(0, 12)}`;

  // Получаем внешний IP
  const publicIP = await getPublicIP();
  if (!publicIP) {
    console.log('[Main] Не удалось получить внешний IP, регистрация пропущена');
    return false;
  }

  console.log(`[Main] Регистрирую узел "${nodeName}" (${publicIP}:${nodePort}) в Gateway...`);

  try {
    const params = new URLSearchParams({
      name: nodeName,
      host: publicIP,
      api_port: nodePort,
      socket_port: nodePort + 100,
      layer_start: 0,
      layer_end: 21,
      is_first: true,
      is_last: true,
      model_type: 'gguf'
    });

    const r = await fetch(`${GATEWAY_URL}/register?${params}`, { method: 'POST' });
    const data = await r.json();
    console.log(`[Main] ✓ Узел зарегистрирован в Gateway:`, data);

    // Сообщаем renderer об успешной регистрации
    mainWindow?.webContents.send('node-registered', { name: nodeName, ip: publicIP });
    return true;
  } catch (err) {
    console.error('[Main] Ошибка регистрации в Gateway:', err.message);
    return false;
  }
}

// Жизненный цикл Electron
app.on('ready', async () => {
  console.log('[Main] Приложение готово');
  createWindow();

  // Трей + автообновление
  createTray();
  setupAutoUpdater();

  // Автозапуск при старте системы (сразу в трей)
  if (app.isPackaged) {
    app.setLoginItemSettings({ openAtLogin: true, openAsHidden: true });
    console.log('[Main] Автозапуск при входе включён');
  }

  // ── Умная нагрузка: сон/пробуждение системы ──
  powerMonitor.on('suspend',  () => { console.log('[Smart Load] Система спит → 100%'); isUserActive = false; setNodeLoadDynamic(100); });
  powerMonitor.on('resume',   () => { console.log('[Smart Load] Система проснулась → норма'); isUserActive = true; setNodeLoadDynamic(currentLoad); });

  // ── Умная нагрузка: idle-таймер (без перезапуска узла) ──
  idleCheckInterval = setInterval(() => {
    const idle = powerMonitor.getSystemIdleTime();   // секунды
    if (idle > 300) {
      if (!isUserActive) return;           // уже в boost-режиме
      isUserActive = false;
      const boost = Math.min(100, currentLoad * 1.5);
      setNodeLoadDynamic(boost);
      console.log(`[Smart Load] Пользователь неактивен ${idle}s → нагрузка ${Math.round(boost)}%`);
    } else {
      if (isUserActive) return;            // уже в обычном режиме
      isUserActive = true;
      setNodeLoadDynamic(currentLoad);
      console.log(`[Smart Load] Пользователь активен → нагрузка ${currentLoad}%`);
    }
  }, 30000);

  // Подготовка файлов
  await ensureFilesExist();

  // Проверяем есть ли узел уже запущен
  const nodeAlreadyRunning = await checkNodeReady();

  if (nodeAlreadyRunning) {
    console.log('[Main] ✓ Узел уже работает!');
    isNodeRunning = true;
  }

  // Автоматический запуск узла если он доступен
  if (fs.existsSync(NODE_SCRIPT) && !nodeAlreadyRunning) {
    console.log('[Main] Файлы готовы, запускаю узел...');
    await startNodeProcess();
  } else if (!fs.existsSync(NODE_SCRIPT)) {
    console.log('[Main] node_pipeline.py не найден, работаем через Gateway');
    mainWindow?.webContents.send('node-status', {
      status: 'unavailable',
      message: 'Локальный узел недоступен',
      isRunning: false
    });
  }

  // Мониторим готовность узла и регистрируем в Gateway
  console.log('[Main] ✓ Начинаю мониторинг готовности узла...');
  let readySent = false;
  const readyCheckInterval = setInterval(async () => {
    if (readySent) {
      clearInterval(readyCheckInterval);
      return;
    }

    try {
      const response = await fetch('http://localhost:9002/health');
      if (response.ok) {
        const data = await response.json();
        if (data.status === 'ready') {
          readySent = true;
          clearInterval(readyCheckInterval);
          console.log('[Main] ✓✓✓ УЗЕЛ ГОТОВ!');
          mainWindow?.webContents.send('node-status', {
            status: 'ready',
            message: '✓ Узел активен',
            isRunning: true
          });

          // Регистрируем узел в Gateway
          registerNodeInGateway(NODE_PORT);
        }
      }
    } catch (err) {
      // Узел еще не доступен
    }
  }, 500);
});

app.on('window-all-closed', () => {
  // НЕ закрываем приложение — оно живёт в трее, узел продолжает работать.
  // Реальный выход только через трей-меню «Выйти» (выставляет app.isQuitting).
  if (app.isQuitting && nodeProcess && isNodeRunning) {
    stopNodeProcess();
  }
});

app.on('activate', () => {
  if (mainWindow === null) createWindow();
  else { mainWindow.show(); mainWindow.focus(); }
});

app.on('before-quit', () => {
  app.isQuitting = true;
  if (idleCheckInterval) clearInterval(idleCheckInterval);
  if (nodeProcess && isNodeRunning) stopNodeProcess();
});
