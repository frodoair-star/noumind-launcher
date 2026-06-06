const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, powerMonitor } = require('electron');
const path    = require('path');
const { spawn, execSync } = require('child_process');
const fs      = require('fs');
const os      = require('os');

// electron-updater может отсутствовать в dev/unpacked — не падаем
let autoUpdater = null;
try { autoUpdater = require('electron-updater').autoUpdater; } catch { /* dev mode */ }

// ─────────────────────────────────────────
// PORTABLE PYTHON — скачиваем при первом запуске
// ─────────────────────────────────────────

const PYTHON_URLS = {
  'win32-x64': 'https://github.com/indygreg/python-build-standalone/releases/download/20241016/cpython-3.11.10+20241016-x86_64-pc-windows-msvc-install_only_stripped.tar.gz',
  'win32-arm64': 'https://github.com/indygreg/python-build-standalone/releases/download/20241016/cpython-3.11.10+20241016-aarch64-pc-windows-msvc-install_only_stripped.tar.gz',
  'darwin-arm64': 'https://github.com/indygreg/python-build-standalone/releases/download/20241016/cpython-3.11.10+20241016-aarch64-apple-darwin-install_only_stripped.tar.gz',
  'darwin-x64': 'https://github.com/indygreg/python-build-standalone/releases/download/20241016/cpython-3.11.10+20241016-x86_64-apple-darwin-install_only_stripped.tar.gz'
};

// Глобальные пути — заполняются в setupAndStart()
let globalPythonExe  = null;
let globalScriptPath = null;

// ─────────────────────────────────────────
// ГЛОБАЛЬНОЕ СОСТОЯНИЕ
// ─────────────────────────────────────────

let mainWindow;
let nodeProcess    = null;
let isNodeRunning  = false;
let nodeSettings   = { layerStart: 11, loadPercent: 40 };
let userPreference = 40;
let sleepModeInterval = null;
let detectedHardware  = { totalRAM: 8 };

let tray              = null;
let isUserActive      = true;
let currentLoad       = 40;
let idleCheckInterval = null;

let nodeRestartCount = 0;
const MAX_RESTARTS   = 5;

const NODE_PORT  = 9002;
const MODEL_PATH = path.join(os.homedir(), 'noumind', 'model.gguf');

// ─────────────────────────────────────────
// ОПРЕДЕЛЕНИЕ ЖЕЛЕЗА
// ─────────────────────────────────────────

async function detectHardware() {
  const totalRAM = os.totalmem() / 1024 ** 3;
  const freeRAM  = os.freemem()  / 1024 ** 3;
  const cpuCount = os.cpus().length;
  const cpuModel = os.cpus()[0]?.model || 'Unknown CPU';

  let device = 'cpu';
  const pyExe = globalPythonExe || 'python3';
  try {
    const result = execSync(
      `"${pyExe}" -c "import torch; print('mps' if torch.backends.mps.is_available() else ('cuda' if torch.cuda.is_available() else 'cpu'))"`
    ).toString().trim();
    device = result;
  } catch (_) {}

  return { totalRAM, freeRAM, cpuCount, cpuModel, device };
}

function calcFromPercent(pct) {
  const nodeLayerStart = 11;
  const nodeLayerEnd   = 21;
  const nodeLayerCount = nodeLayerEnd - nodeLayerStart + 1;
  const keptLayers  = Math.max(1, Math.round(nodeLayerCount * pct / 100));
  const layerStart  = nodeLayerEnd - keptLayers + 1;
  const ramUsed     = (keptLayers * 0.1).toFixed(1);
  const computeRate = (pct / 100 * 9 + 1).toFixed(1);
  const speed       = Math.floor(60 - (pct / 100) * 55);
  return { ramUsed, layers: `${layerStart}-21`, layerStart, computeRate, speed };
}

// ─────────────────────────────────────────
// ЗАГРУЗКА ФАЙЛА (с прогрессом + редиректы)
// ─────────────────────────────────────────

function downloadFile(url, dest, onProgress) {
  return new Promise((resolve, reject) => {
    const follow = (currentUrl) => {
      console.log('[Download] GET:', currentUrl);

      const proto = currentUrl.startsWith('https')
        ? require('https')
        : require('http');

      proto.get(currentUrl, (res) => {
        // Следуем редиректам
        if (res.statusCode === 301 ||
            res.statusCode === 302 ||
            res.statusCode === 303) {
          console.log('[Download] Редирект на:', res.headers.location);
          follow(res.headers.location);
          return;
        }

        if (res.statusCode !== 200) {
          reject(new Error(
            `HTTP ${res.statusCode} for ${currentUrl}`
          ));
          return;
        }

        const total = parseInt(
          res.headers['content-length'] || '0'
        );
        console.log('[Download] Размер:', total, 'bytes');

        let downloaded = 0;
        const file = fs.createWriteStream(dest);

        res.on('data', (chunk) => {
          file.write(chunk);
          downloaded += chunk.length;
          if (total > 0 && onProgress) {
            onProgress(Math.round(
              downloaded / total * 100
            ));
          }
        });

        res.on('end', () => {
          file.end();
          console.log('[Download] Завершено:', dest);
          resolve();
        });

        res.on('error', reject);
      }).on('error', reject);
    };

    follow(url);
  });
}

// ─────────────────────────────────────────
// РАСПАКОВКА TAR.GZ
// ─────────────────────────────────────────

async function extractTar(tarPath, destDir) {
  if (process.platform === 'win32') {
    const tar = require('tar');
    await tar.extract({ file: tarPath, cwd: destDir });
  } else {
    execSync(`tar -xzf "${tarPath}" -C "${destDir}"`, { maxBuffer: 1024 * 1024 * 200 });
  }
}

// ─────────────────────────────────────────
// ENSURE PYTHON — portable, без системного
// ─────────────────────────────────────────

async function ensurePython() {
  const userData = app.getPath('userData');
  console.log('[Python] userData path:', userData);
  console.log('[Python] platform:', process.platform, process.arch);

  mainWindow?.webContents.send('node-log', `Путь данных: ${userData}`);
  mainWindow?.webContents.send('node-log', `Платформа: ${process.platform} ${process.arch}`);

  const pythonDir = path.join(userData, 'python');
  const pythonExe = process.platform === 'win32'
    ? path.join(pythonDir, 'python', 'python.exe')
    : path.join(pythonDir, 'python', 'bin', 'python3.11');

  console.log('[Python] pythonExe path:', pythonExe);
  console.log('[Python] exists:', fs.existsSync(pythonExe));

  mainWindow?.webContents.send('node-log', `Python путь: ${pythonExe}`);
  mainWindow?.webContents.send('node-log', `Python существует: ${fs.existsSync(pythonExe)}`);

  if (fs.existsSync(pythonExe)) {
    console.log('[Python] Уже установлен:', pythonExe);
    mainWindow?.webContents.send('node-log', '✓ Python найден');
    return pythonExe;
  }

  const key = `${process.platform}-${process.arch}`;
  const url = PYTHON_URLS[key];
  if (!url) {
    console.error('[Python] Неподдерживаемая платформа:', key);
    mainWindow?.webContents.send('node-log', `❌ Платформа не поддерживается: ${key}`);
    return null;
  }

  console.log('[Python] Скачиваю с:', url);
  mainWindow?.webContents.send('node-log', 'Устанавливаю Python 3.11 (первый запуск)...');
  mainWindow?.webContents.send('first-run-progress', {
    step: 'Скачиваю Python 3.11...', percent: 10,
  });

  try {
    fs.mkdirSync(pythonDir, { recursive: true });
    console.log('[Python] Папка создана:', pythonDir);
  } catch (e) {
    console.error('[Python] Ошибка создания папки:', e.message);
    throw e;
  }

  const tarPath = path.join(pythonDir, 'python.tar.gz');
  console.log('[Python] Скачиваю в:', tarPath);

  await downloadFile(url, tarPath, (progress) => {
    mainWindow?.webContents.send('first-run-progress', {
      step: `Скачиваю Python... ${progress}%`,
      percent: 10 + progress * 0.3,
    });
  });

  console.log('[Python] Скачано, распаковываю...');
  mainWindow?.webContents.send('first-run-progress', {
    step: 'Распаковываю Python...', percent: 45,
  });

  await extractTar(tarPath, pythonDir);
  console.log('[Python] Распаковано');

  try { fs.unlinkSync(tarPath); } catch (_) {}

  console.log('[Python] Установлен:', pythonExe);
  mainWindow?.webContents.send('node-log', '✓ Python установлен');
  return pythonExe;
}

// ─────────────────────────────────────────
// ENSURE DEPENDENCIES
// ─────────────────────────────────────────

async function ensureDependencies(pythonExe) {
  mainWindow?.webContents.send('first-run-progress', {
    step: 'Устанавливаю зависимости...', percent: 50,
  });

  const deps = [
    'fastapi',
    'uvicorn',
    'httpx',
    'psutil',
    'transformers',
    'torch --index-url https://download.pytorch.org/whl/cpu',
  ];

  for (let i = 0; i < deps.length; i++) {
    const dep     = deps[i];
    const depName = dep.split(' ')[0];

    mainWindow?.webContents.send('first-run-progress', {
      step: `Устанавливаю ${depName}...`,
      percent: 50 + (i / deps.length) * 30,
    });

    try {
      execSync(`"${pythonExe}" -m pip install ${dep} --quiet`, { timeout: 300000 });
      console.log(`[Deps] ${depName} установлен`);
    } catch (e) {
      console.error(`[Deps] Ошибка ${depName}:`, e.message);
    }
  }

  mainWindow?.webContents.send('first-run-progress', {
    step: 'Зависимости готовы', percent: 80,
  });
}

// ─────────────────────────────────────────
// ENSURE NODE SCRIPTS (скачиваем из GitHub)
// ─────────────────────────────────────────

async function ensureNodeScript() {
  const appData    = app.getPath('userData');
  const noumindDir = path.join(appData, 'noumind');
  fs.mkdirSync(noumindDir, { recursive: true });

  const BASE_URL = 'https://raw.githubusercontent.com/frodoair-star/noumind/main/';
  const files    = ['node_pipeline.py', 'neuron.py'];

  for (const file of files) {
    const filePath = path.join(noumindDir, file);
    mainWindow?.webContents.send('first-run-progress', {
      step: `Скачиваю ${file}...`, percent: 82,
    });
    try {
      await downloadFile(BASE_URL + file, filePath, null);
      console.log(`[Scripts] ${file} скачан`);
    } catch (e) {
      console.error(`[Scripts] Ошибка ${file}:`, e.message);
    }
  }

  return {
    scriptPath:  path.join(noumindDir, 'node_pipeline.py'),
    noumindDir,
  };
}

// ─────────────────────────────────────────
// ГЛАВНЫЙ FLOW — setupAndStart (ПРОСТОЙ)
// ─────────────────────────────────────────

async function setupAndStart() {
  const send = (msg, pct) => {
    console.log('[Setup]', msg);
    try {
      mainWindow.webContents.send('first-run-progress', {
        step: msg, percent: pct || 0
      });
      mainWindow.webContents.send('node-log', msg);
    } catch (e) {}
  };

  mainWindow.webContents.send('first-run-start');
  send('Запуск...', 5);

  // Ищем Python в системе
  const pythonCandidates = process.platform === 'win32'
    ? ['python', 'python3', 'py',
       'C:\\Python311\\python.exe',
       'C:\\Python310\\python.exe',
       'C:\\Python39\\python.exe',
       path.join(os.homedir(), 'AppData', 'Local',
         'Programs', 'Python', 'Python311', 'python.exe'),
       path.join(os.homedir(), 'AppData', 'Local',
         'Programs', 'Python', 'Python310', 'python.exe')]
    : ['python3.11', 'python3', 'python',
       '/usr/local/bin/python3.11',
       '/usr/bin/python3'];

  let pythonPath = null;
  for (const p of pythonCandidates) {
    try {
      const ver = execSync(`"${p}" --version 2>&1`,
        { timeout: 5000 }).toString().trim();
      send(`✓ Python найден: ${ver}`, 20);
      pythonPath = p;
      break;
    } catch (e) {}
  }

  if (!pythonPath) {
    send('✗ Python не найден!', 0);
    send('Установи Python с python.org', 0);

    // Открываем браузер с инструкцией
    const { shell } = require('electron');
    shell.openExternal('https://www.python.org/downloads/');

    mainWindow.webContents.send('show-install-python');
    return;
  }

  globalPythonExe = pythonPath;

  // Создаём папку
  const noumindDir = path.join(os.homedir(), 'noumind');
  fs.mkdirSync(noumindDir, { recursive: true });
  send(`✓ Папка: ${noumindDir}`, 30);

  // Скачиваем скрипты
  const files = ['node_pipeline.py', 'neuron.py'];
  const BASE = 'https://raw.githubusercontent.com/' +
    'frodoair-star/noumind/main/';

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const dest = path.join(noumindDir, file);

    if (!fs.existsSync(dest)) {
      send(`Скачиваю ${file}...`, 40 + i * 10);
      try {
        await downloadFile(BASE + file, dest, null);
        send(`✓ ${file}`, 50 + i * 10);
      } catch (e) {
        send(`✗ Ошибка: ${file}: ${e.message}`, 0);
      }
    } else {
      send(`✓ ${file} уже есть`, 50 + i * 10);
    }
  }

  // Устанавливаем зависимости
  send('Проверяю зависимости...', 65);
  const deps = ['fastapi', 'uvicorn', 'httpx', 'psutil'];

  for (const dep of deps) {
    try {
      execSync(`"${pythonPath}" -c "import ${dep}"`,
        { timeout: 10000 });
      send(`✓ ${dep}`, 70);
    } catch (e) {
      send(`Устанавливаю ${dep}...`, 70);
      try {
        execSync(
          `"${pythonPath}" -m pip install ${dep} -q`,
          { timeout: 120000 }
        );
        send(`✓ ${dep} установлен`, 75);
      } catch (e2) {
        send(`⚠ ${dep}: ${e2.message}`, 75);
      }
    }
  }

  // torch отдельно — большой пакет
  send('Проверяю torch...', 80);
  try {
    execSync(`"${pythonPath}" -c "import torch"`,
      { timeout: 10000 });
    send('✓ torch', 85);
  } catch (e) {
    send('Устанавливаю torch (большой файл ~200MB)...', 80);
    try {
      execSync(
        `"${pythonPath}" -m pip install torch --index-url https://download.pytorch.org/whl/cpu -q`,
        { timeout: 600000 }
      );
      send('✓ torch установлен', 85);
    } catch (e2) {
      send(`⚠ torch: ${e2.message}`, 85);
    }
  }

  globalScriptPath = path.join(noumindDir, 'node_pipeline.py');

  send('Запускаю узел...', 95);
  await startNodeProcess();

  send('✓ Готово!', 100);
  setTimeout(() => {
    mainWindow.webContents.send('first-run-done');
  }, 1000);
}

// ─────────────────────────────────────────
// СОЗДАНИЕ ОКНА
// ─────────────────────────────────────────

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 700,
    frame: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false,
    },
  });

  console.log('[Main] Окно создано, загружаю index.html...');
  mainWindow.loadFile('index.html');

  mainWindow.once('ready-to-show', () => {
    console.log('[Main] Окно готово, показываю...');
    mainWindow?.show();
  });

  mainWindow.webContents.on('crashed', () => {
    console.error('[Main] Renderer процесс упал!');
  });

  mainWindow.on('closed', () => {
    console.log('[Main] Окно закрыто');
    mainWindow = null;
  });

  // Закрытие красной кнопкой → сворачиваем в трей
  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
      console.log('[Main] Окно свёрнуто в трей — узел продолжает работать');
    }
  });

  // После загрузки страницы: железо → полный setup
  mainWindow.webContents.on('did-finish-load', async () => {
    const hw = await detectHardware();
    detectedHardware = hw;
    console.log('[Main] Железо:', hw);
    mainWindow?.webContents.send('hardware-info', hw);
    setupAndStart();   // <— заменяет старый checkFirstRun
  });
}

// ─────────────────────────────────────────
// УБИТЬ ПРОЦЕСС НА ПОРТУ
// ─────────────────────────────────────────

function killPortProcess(port) {
  return new Promise((resolve) => {
    const { exec } = require('child_process');
    console.log(`[Main] Очищаю порт ${port}...`);
    exec(`lsof -ti :${port} | xargs -r kill -9 2>/dev/null || true`, () => {
      setTimeout(resolve, 500);
    });
  });
}

// ─────────────────────────────────────────
// ЗАПУСК PYTHON УЗЛА
// ─────────────────────────────────────────

async function startNodeProcess() {
  if (isNodeRunning || nodeProcess) {
    console.log('[Main] Node уже запущен');
    return;
  }

  const pythonExe  = globalPythonExe;
  const scriptPath = globalScriptPath;

  if (!pythonExe || !scriptPath || !fs.existsSync(scriptPath)) {
    console.error('[Main] Python или скрипт не готовы — пропускаю запуск');
    mainWindow?.webContents.send('node-status', {
      status: 'unavailable',
      message: 'Идёт установка. Подождите...',
      isRunning: false,
    });
    return;
  }

  await killPortProcess(NODE_PORT);
  console.log('[Main] Запускаю node_pipeline.py...');

  const env = Object.assign({}, process.env, {
    KMP_DUPLICATE_LIB_OK: 'TRUE',
    OMP_NUM_THREADS:      '4',
    PYTHONUNBUFFERED:     '1',
  });

  const workerId   = `user-${os.hostname()}`;
  const noumindDir = path.dirname(scriptPath);
  console.log(`[Main] Python: ${pythonExe}, worker: ${workerId}, layer-start: ${nodeSettings.layerStart}, load-pct: ${nodeSettings.loadPercent}`);

  nodeProcess = spawn(pythonExe, [
    scriptPath,
    '--worker-id',   workerId,
    '--gateway',     'http://217.160.49.222:8002',
    '--port',        String(NODE_PORT),
    '--layer-start', String(nodeSettings.layerStart),
    '--load-pct',    String(nodeSettings.loadPercent),
  ], {
    cwd: noumindDir,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: false,
    env,
  });

  isNodeRunning = true;
  console.log(`[Main] Node PID: ${nodeProcess.pid}`);

  let modelLoadedSent = false;

  // Проверяем готовность через HTTP каждую секунду
  const readinessCheckInterval = setInterval(async () => {
    if (modelLoadedSent) { clearInterval(readinessCheckInterval); return; }
    try {
      const response = await fetch('http://localhost:9002/health');
      if (response.ok) {
        const data = await response.json();
        if (data.status === 'ready') {
          modelLoadedSent = true;
          nodeRestartCount = 0;
          clearInterval(readinessCheckInterval);
          console.log('[Main] ✓✓✓ HTTP: узел ГОТОВ!');
          mainWindow?.webContents.send('node-status', {
            status: 'ready', message: '✓ Узел активен', isRunning: true,
          });
          registerNodeInGateway(NODE_PORT);
        }
      }
    } catch (_) {}
  }, 1000);

  // Резервная проверка по stdout
  const checkReady = (msg) => {
    if (!modelLoadedSent && (
      msg.includes('✓ Model loaded')  ||
      msg.includes('Model loaded')    ||
      msg.includes('EFCT phase gates') ||
      msg.includes('Ready to serve')
    )) {
      modelLoadedSent = true;
      clearInterval(readinessCheckInterval);
      console.log('[Main] ✓✓✓ Stdout: узел готов!');
      mainWindow?.webContents.send('node-status', {
        status: 'ready', message: '✓ Узел активен', isRunning: true,
      });
    }
  };

  nodeProcess.stdout?.on('data', (data) => {
    const msg = data.toString();
    console.log('[Node]', msg.trim());
    mainWindow?.webContents.send('node-log', { message: msg.trim() });
    checkReady(msg);
  });

  nodeProcess.stderr?.on('data', (data) => {
    const msg = data.toString();
    console.error('[Node ERR]', msg.trim());
    mainWindow?.webContents.send('node-log', { message: msg.trim(), isError: true });
    checkReady(msg);
  });

  nodeProcess.on('close', (code) => {
    console.log(`[Main] Node завершён (код: ${code})`);
    isNodeRunning = false;
    nodeProcess   = null;
    clearInterval(readinessCheckInterval);
    mainWindow?.webContents.send('node-status', {
      status: 'stopped', message: 'Узел выключен', isRunning: false,
    });

    // Watchdog — автоперезапуск при аварийном падении
    if (code !== 0 && code !== null && !app.isQuitting) {
      if (nodeRestartCount >= MAX_RESTARTS) {
        console.error(`[Watchdog] Узел упал ${MAX_RESTARTS} раз — сдаюсь`);
        mainWindow?.webContents.send('node-error', 'Узел не запускается. Перезапусти приложение.');
        return;
      }
      nodeRestartCount++;
      console.log(`[Watchdog] Перезапуск ${nodeRestartCount}/${MAX_RESTARTS} через 5 сек...`);
      setTimeout(() => startNodeProcess(), 5000);
    }
  });

  nodeProcess.on('error', (err) => {
    console.error('[Main] Ошибка запуска Node:', err);
    isNodeRunning = false;
    nodeProcess   = null;
    mainWindow?.webContents.send('node-status', {
      status: 'error', message: `Ошибка: ${err.message}`, isRunning: false,
    });
  });

  mainWindow?.webContents.send('node-status', {
    status: 'loading', message: 'Загружаю модель...', isRunning: true,
  });
}

// ─────────────────────────────────────────
// ОСТАНОВКА PYTHON УЗЛА
// ─────────────────────────────────────────

function stopNodeProcess() {
  if (!nodeProcess || !isNodeRunning) {
    console.log('[Main] Node не запущен');
    return;
  }
  console.log('[Main] Останавливаю node_pipeline.py...');
  isNodeRunning = false;
  try {
    nodeProcess.kill('SIGKILL');
  } catch (_) {
    try { process.kill(nodeProcess.pid, 'SIGKILL'); } catch (_2) {}
  }
  nodeProcess = null;

  const { exec } = require('child_process');
  exec(`lsof -ti :${NODE_PORT} | xargs -r kill -9 2>/dev/null || true`);

  mainWindow?.webContents.send('node-status', {
    status: 'stopped', message: 'Узел выключен', isRunning: false,
  });
}

// ─────────────────────────────────────────
// ПЕРЕЗАПУСК С НОВЫМИ ПАРАМЕТРАМИ
// ─────────────────────────────────────────

async function restartNodeProcess(layerStart, loadPercent) {
  nodeSettings = { layerStart, loadPercent };
  console.log(`[Main] Перезапускаю node layer-start=${layerStart} load-pct=${loadPercent}`);
  stopNodeProcess();
  await new Promise(r => setTimeout(r, 1500));
  await startNodeProcess();
}

// ─────────────────────────────────────────
// ТРЕЙ
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
    { label: 'Открыть',         click: () => { mainWindow?.show(); mainWindow?.focus(); } },
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
// УМНАЯ НАГРУЗКА — динамически, без перезапуска
// ─────────────────────────────────────────

async function setNodeLoadDynamic(percent) {
  try {
    await fetch(`http://localhost:${NODE_PORT}/load/set?percent=${Math.round(percent)}`, { method: 'POST' });
    console.log(`[Smart Load] Нагрузка → ${Math.round(percent)}%`);
    mainWindow?.webContents.send('load-changed', { percent: Math.round(percent) });
  } catch (_) {
    console.log('[Smart Load] Узел не отвечает (ещё грузится?)');
  }
}

// ─────────────────────────────────────────
// АВТООБНОВЛЕНИЕ
// ─────────────────────────────────────────

function setupAutoUpdater() {
  if (!autoUpdater) { console.log('[Updater] electron-updater недоступен (dev)'); return; }
  try {
    autoUpdater.checkForUpdatesAndNotify();
    setInterval(() => autoUpdater.checkForUpdatesAndNotify(), 30 * 60 * 1000);
    autoUpdater.on('update-available',  () => mainWindow?.webContents.send('update-available'));
    autoUpdater.on('update-downloaded', () => mainWindow?.webContents.send('update-downloaded'));
    autoUpdater.on('error', (err) => console.log('[Updater] Ошибка:', err?.message));
  } catch (e) {
    console.log('[Updater] Не настроен:', e.message);
  }
}

ipcMain.on('install-update', () => {
  if (autoUpdater) { app.isQuitting = true; autoUpdater.quitAndInstall(); }
});

// ─────────────────────────────────────────
// IPC ОБРАБОТЧИКИ
// ─────────────────────────────────────────

ipcMain.on('toggle-node', async (event, shouldStart) => {
  console.log('[Main] toggle-node:', shouldStart);
  if (shouldStart) await startNodeProcess();
  else stopNodeProcess();
});

ipcMain.handle('get-node-status', async () => ({
  isRunning: isNodeRunning,
  status:    isNodeRunning ? 'ready' : 'stopped',
}));

ipcMain.handle('chat', async (event, { message, sessionId, priority = 'balanced' }) => {
  const GATEWAY_URL = 'http://217.160.49.222:8002';
  try {
    const url      = `${GATEWAY_URL}/chat?message=${encodeURIComponent(message)}&session_id=${sessionId}&priority=${priority}`;
    const response = await fetch(url, { method: 'POST' });
    const data     = await response.json();
    return { success: true, data };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('get-worker-stats', async () => {
  const GATEWAY_URL = 'http://217.160.49.222:8000';
  try {
    const [healthRes, workersRes] = await Promise.all([
      fetch(`${GATEWAY_URL}/health`),
      fetch(`${GATEWAY_URL}/workers`),
    ]);
    const health  = await healthRes.json();
    const workers = await workersRes.json();

    const myName = `user-${os.hostname().replace(/[^a-zA-Z0-9]/g, '-').toLowerCase().slice(0, 12)}`;
    let myTasksDone = 0, myTokens = 0;
    for (const [wid, stats] of Object.entries(workers.workers || {})) {
      if (wid.startsWith(myName)) {
        myTasksDone = Math.max(myTasksDone, stats.tasks_done    || 0);
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
      },
    };
  } catch (_) {
    return { success: false };
  }
});

ipcMain.handle('register-node', async () => {
  const success = await registerNodeInGateway(9999);
  return { success };
});

ipcMain.handle('check-files', async () => {
  const scriptPath = globalScriptPath || '';
  return {
    nodeScript: fs.existsSync(scriptPath),
    model:      fs.existsSync(MODEL_PATH),
    allPresent: fs.existsSync(scriptPath) && fs.existsSync(MODEL_PATH),
  };
});

ipcMain.on('save-settings', async (event, settings) => {
  console.log('[Main] Сохраняю настройки:', settings);
  userPreference = settings.loadPercent;
  currentLoad    = settings.loadPercent;
  await setNodeLoadDynamic(settings.loadPercent);
  try {
    await fetch(
      `http://localhost:${NODE_PORT}/settings/yield_chat?enabled=${!!settings.yieldChat}`,
      { method: 'POST' }
    );
  } catch (_) {}
});

ipcMain.on('sleep-mode', (event, enabled) => {
  if (sleepModeInterval) { clearInterval(sleepModeInterval); sleepModeInterval = null; }
  if (!enabled) return;
  console.log('[Main] Ночной режим включён');

  const applyNightLoad = async (isNight) => {
    const pct = isNight ? 100 : userPreference;
    currentLoad = pct;
    mainWindow?.webContents.send('auto-load', pct);
    await setNodeLoadDynamic(pct);
    console.log(`[Night] ${isNight ? 'ночь' : 'день'} → ${pct}%`);
  };

  const h0      = new Date().getHours();
  const night0  = h0 < 7 || h0 >= 23;
  applyNightLoad(night0);
  let lastNight = night0;

  sleepModeInterval = setInterval(async () => {
    const h     = new Date().getHours();
    const night = h < 7 || h >= 23;
    if (night !== lastNight) { lastNight = night; await applyNightLoad(night); }
  }, 60000);
});

ipcMain.on('quit-app',        () => { if (nodeProcess && isNodeRunning) stopNodeProcess(); app.quit(); });
ipcMain.on('close-window',    () => { if (nodeProcess && isNodeRunning) stopNodeProcess(); mainWindow?.close(); });
ipcMain.on('minimize-window', () => mainWindow?.minimize());
ipcMain.on('maximize-window', () => {
  if (mainWindow?.isMaximized()) mainWindow.unmaximize();
  else mainWindow?.maximize();
});

// ─────────────────────────────────────────
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ─────────────────────────────────────────

async function getPublicIP() {
  try {
    const r = await fetch('https://api.ipify.org?format=json');
    const d = await r.json();
    return d.ip;
  } catch (_) { return null; }
}

async function registerNodeInGateway(nodePort) {
  const GATEWAY_URL = 'http://217.160.49.222:8000';
  const nodeName    = `user-${os.hostname().replace(/[^a-zA-Z0-9]/g, '-').toLowerCase().slice(0, 12)}`;
  const publicIP    = await getPublicIP();
  if (!publicIP) { console.log('[Main] Нет внешнего IP, регистрация пропущена'); return false; }

  console.log(`[Main] Регистрирую "${nodeName}" (${publicIP}:${nodePort})...`);
  try {
    const params = new URLSearchParams({
      name: nodeName, host: publicIP, api_port: nodePort,
      socket_port: nodePort + 100, layer_start: 0, layer_end: 21,
      is_first: true, is_last: true, model_type: 'gguf',
    });
    const r    = await fetch(`${GATEWAY_URL}/register?${params}`, { method: 'POST' });
    const data = await r.json();
    console.log('[Main] ✓ Зарегистрирован:', data);
    mainWindow?.webContents.send('node-registered', { name: nodeName, ip: publicIP });
    return true;
  } catch (err) {
    console.error('[Main] Ошибка регистрации:', err.message);
    return false;
  }
}

// ─────────────────────────────────────────
// ЖИЗНЕННЫЙ ЦИКЛ ELECTRON
// ─────────────────────────────────────────

app.whenReady().then(async () => {
  console.log('[Main] Приложение готово');
  createWindow();
  createTray();
  setupAutoUpdater();

  if (app.isPackaged) {
    app.setLoginItemSettings({ openAtLogin: true, openAsHidden: true });
    console.log('[Main] Автозапуск при входе включён');
  }

  // Умная нагрузка: сон / пробуждение
  powerMonitor.on('suspend', () => {
    console.log('[Smart Load] Система спит → 100%');
    isUserActive = false;
    setNodeLoadDynamic(100);
  });
  powerMonitor.on('resume', () => {
    console.log('[Smart Load] Система проснулась → норма');
    isUserActive = true;
    setNodeLoadDynamic(currentLoad);
  });

  // Умная нагрузка: idle-таймер
  idleCheckInterval = setInterval(() => {
    const idle = powerMonitor.getSystemIdleTime();
    if (idle > 300) {
      if (!isUserActive) return;
      isUserActive = false;
      const boost = Math.min(100, currentLoad * 1.5);
      setNodeLoadDynamic(boost);
      console.log(`[Smart Load] Неактивен ${idle}s → ${Math.round(boost)}%`);
    } else {
      if (isUserActive) return;
      isUserActive = true;
      setNodeLoadDynamic(currentLoad);
      console.log(`[Smart Load] Активен → ${currentLoad}%`);
    }
  }, 30000);

  // Ждём пока окно полностью загрузится
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.webContents.once('did-finish-load', () => {
    console.log('[Main] DOM ready, starting setup in 3s...');
    console.log('[Main] userData:', app.getPath('userData'));
    console.log('[Main] platform:', process.platform);

    setTimeout(async () => {
      console.log('[Main] Starting setupAndStart...');
      try {
        await setupAndStart();
      } catch (e) {
        console.error('[Main] FATAL:', e.message, e.stack);
        mainWindow.webContents.send('node-log',
          '💥 КРИТИЧЕСКАЯ ОШИБКА: ' + e.message);
      }
    }, 3000);
  });
});

app.on('window-all-closed', () => {
  // Живём в трее — не закрываемся
  if (app.isQuitting && nodeProcess && isNodeRunning) stopNodeProcess();
});

app.on('activate', () => {
  if (mainWindow === null) createWindow();
  else { mainWindow.show(); mainWindow.focus(); }
});

app.on('before-quit', () => {
  app.isQuitting = true;
  if (idleCheckInterval) clearInterval(idleCheckInterval);
  if (sleepModeInterval) clearInterval(sleepModeInterval);
  if (nodeProcess && isNodeRunning) stopNodeProcess();
});
