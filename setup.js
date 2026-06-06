/**
 * Setup логика для первого запуска Noümind Launcher
 * Автоматически скачивает необходимые файлы
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');
const { execSync } = require('child_process');

const NOUMIND_DIR = path.join(os.homedir(), 'noumind');

// Основные файлы для скачивания
const FILES_TO_DOWNLOAD = {
  'node_gguf.py': {
    size: '~15KB',
    description: 'Python узел'
  },
  'gguf_inference_fallback.py': {
    size: '~8KB',
    description: 'Fallback движок'
  },
  'efct_com.py': {
    size: '~11KB',
    description: 'EFCT+COM механика'
  }
};

// Файл модели (большой)
const MODEL_FILE = {
  'model.gguf': {
    size: '600MB',
    description: 'TinyLlama модель'
  }
};

function ensureDir() {
  if (!fs.existsSync(NOUMIND_DIR)) {
    fs.mkdirSync(NOUMIND_DIR, { recursive: true });
    console.log('[Setup] Директория создана:', NOUMIND_DIR);
  }
}

function checkMissingFiles() {
  const missing = [];

  for (const filename of Object.keys(FILES_TO_DOWNLOAD)) {
    const filePath = path.join(NOUMIND_DIR, filename);
    if (!fs.existsSync(filePath)) {
      missing.push(filename);
    }
  }

  return missing;
}

function downloadFile(url, filePath, onProgress) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(filePath);
    let downloadedBytes = 0;
    let totalBytes = 0;

    https.get(url, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`HTTP ${response.statusCode}`));
        return;
      }

      totalBytes = parseInt(response.headers['content-length'], 10);

      response.on('data', (chunk) => {
        downloadedBytes += chunk.length;
        if (totalBytes > 0) {
          const percent = Math.floor((downloadedBytes / totalBytes) * 100);
          onProgress(percent);
        }
      });

      response.pipe(file);

      file.on('finish', () => {
        file.close();
        resolve();
      });
    }).on('error', (err) => {
      fs.unlink(filePath, () => {}); // Удалить неполный файл
      reject(err);
    });
  });
}

function tryDownloadFromSsh() {
  try {
    console.log('[Setup] Попытка скачать через SSH...');
    ensureDir();

    // Попытка скачать через scp с VPS
    for (const filename of Object.keys(FILES_TO_DOWNLOAD)) {
      const filePath = path.join(NOUMIND_DIR, filename);

      if (!fs.existsSync(filePath)) {
        console.log(`[Setup] Скачиваю ${filename}...`);
        execSync(`scp root@87.106.255.55:/home/noumind/pipeline/${filename} "${filePath}" 2>/dev/null`, {
          stdio: 'pipe'
        });
        console.log(`[Setup] ✓ ${filename} скачан`);
      }
    }

    // Скачиваем модель
    const modelPath = path.join(NOUMIND_DIR, 'model.gguf');
    if (!fs.existsSync(modelPath)) {
      console.log('[Setup] Скачиваю модель (600MB)...');
      execSync(
        `scp root@87.106.255.55:/home/noumind/pipeline/tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf "${modelPath}" 2>/dev/null`,
        { stdio: 'pipe' }
      );
      console.log('[Setup] ✓ Модель скачана');
    }

    return true;
  } catch (err) {
    console.error('[Setup] SSH скачивание не удалось:', err.message);
    return false;
  }
}

function detectSetupNeeded() {
  ensureDir();

  const missing = checkMissingFiles();
  const modelPath = path.join(NOUMIND_DIR, 'model.gguf');
  const modelExists = fs.existsSync(modelPath);

  return {
    needsSetup: missing.length > 0 || !modelExists,
    missingFiles: missing,
    modelExists: modelExists,
    missingCount: missing.length
  };
}

module.exports = {
  ensureDir,
  checkMissingFiles,
  downloadFile,
  tryDownloadFromSsh,
  detectSetupNeeded,
  FILES_TO_DOWNLOAD,
  MODEL_FILE,
  NOUMIND_DIR
};
