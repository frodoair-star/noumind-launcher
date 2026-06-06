#!/bin/bash

# Скрипт для загрузки файлов с VPS
# Используется auto-setup.js при первом запуске

set -e

NOUMIND_DIR="$HOME/noumind"
VPS_HOST="root@87.106.255.55"
VPS_PATH="/home/noumind/pipeline"

# Создаем директорию
mkdir -p "$NOUMIND_DIR"

echo "📥 Загружаю файлы с VPS..."

# Функция для загрузки файла
download_file() {
  local filename="$1"
  local target="$NOUMIND_DIR/$filename"

  if [ -f "$target" ]; then
    echo "✓ $filename уже загружен"
    return 0
  fi

  echo "⏳ Загружаю $filename..."
  if scp -o ConnectTimeout=5 -o StrictHostKeyChecking=no "$VPS_HOST:$VPS_PATH/$filename" "$target" 2>/dev/null; then
    echo "✓ $filename загружен"
    return 0
  else
    echo "✗ Ошибка загрузки $filename"
    return 1
  fi
}

# Загружаем необходимые файлы
download_file "node_gguf.py" || true
download_file "gguf_inference_fallback.py" || true
download_file "gguf_inference.py" || true
download_file "efct_com.py" || true

# Загружаем модель в фоне если нужна
if [ ! -f "$NOUMIND_DIR/model.gguf" ]; then
  echo "⏳ Загружаю модель (600MB) в фоне..."
  (scp -o ConnectTimeout=5 -o StrictHostKeyChecking=no "$VPS_HOST:$VPS_PATH/tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf" "$NOUMIND_DIR/model.gguf" 2>/dev/null && echo "✓ Модель загружена") &
fi

echo ""
echo "✅ Файлы загружены! Запускаю приложение..."
