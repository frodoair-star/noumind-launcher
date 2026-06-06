#!/usr/bin/env node

/**
 * Автоматическая загрузка файлов Noümind при первом запуске
 * Использует SSH для скачивания с VPS
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const NOUMIND_DIR = path.join(os.homedir(), 'noumind');
const SCRIPT_PATH = path.join(__dirname, 'scripts', 'setup-files.sh');

function checkFileExists(filename) {
  return fs.existsSync(path.join(NOUMIND_DIR, filename));
}

function allFilesExist() {
  const requiredFiles = [
    'node_gguf.py',
    'gguf_inference_fallback.py',
    'efct_com.py'
  ];

  return requiredFiles.every(f => checkFileExists(f));
}

function runSetup() {
  try {
    // Создаем директорию если её нет
    if (!fs.existsSync(NOUMIND_DIR)) {
      fs.mkdirSync(NOUMIND_DIR, { recursive: true });
    }

    // Проверяем есть ли уже все файлы
    if (allFilesExist()) {
      console.log('[Setup] ✓ Все файлы присутствуют\n');
      return true;
    }

    console.log('[Setup] Загружаю файлы с VPS...\n');

    // Проверяем доступность SSH
    try {
      execSync('which ssh > /dev/null', { stdio: 'pipe' });
      execSync('which scp > /dev/null', { stdio: 'pipe' });
    } catch (err) {
      console.error('[Setup] ✗ SSH не установлен на этой машине');
      console.error('[Setup] Скачивание файлов невозможно.');
      console.log('\n[Setup] Но не волнуйтесь! Приложение будет работать через Gateway.\n');
      return false;
    }

    // Запускаем bash скрипт загрузки
    try {
      execSync(`bash "${SCRIPT_PATH}"`, {
        stdio: 'inherit',
        timeout: 300000 // 5 минут timeout
      });
    } catch (err) {
      console.error('\n[Setup] ⚠️  Ошибка при загрузке файлов:', err.message);
      console.log('[Setup] Приложение может работать через Gateway (удаленные узлы).\n');
      return false;
    }

    // Проверяем что критичные файлы загружены
    if (allFilesExist()) {
      console.log('\n[Setup] ✓ Setup завершен успешно!\n');
      return true;
    } else {
      console.log('\n[Setup] ⚠️  Некоторые файлы не загружены.');
      console.log('[Setup] Приложение будет работать через Gateway.\n');
      return false;
    }

  } catch (err) {
    console.error('[Setup] Ошибка:', err.message);
    return false;
  }
}

// Запуск если вызван напрямую
if (require.main === module) {
  const success = runSetup();
  process.exit(success ? 0 : 0); // Выходим успешно даже если файлы не загружены (будет работать Gateway)
}

module.exports = { runSetup, checkFileExists, allFilesExist };
