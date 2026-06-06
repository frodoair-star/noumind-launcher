#!/bin/bash

# Проверка требований для Noümind Launcher

echo "🔍 Проверка требований для Noümind Launcher..."
echo ""

# Цвета
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Счетчики
passed=0
failed=0

# Функция для проверки команды
check_command() {
  local cmd=$1
  local name=$2

  if command -v $cmd &> /dev/null; then
    echo -e "${GREEN}✓${NC} $name"
    ((passed++))
  else
    echo -e "${RED}✗${NC} $name - НЕ УСТАНОВЛЕНА"
    ((failed++))
  fi
}

# Функция для проверки файла
check_file() {
  local file=$1
  local name=$2

  if [ -f "$file" ]; then
    echo -e "${GREEN}✓${NC} $name"
    ((passed++))
  else
    echo -e "${RED}✗${NC} $name - НЕ НАЙДЕН"
    ((failed++))
  fi
}

# Функция для проверки директории
check_dir() {
  local dir=$1
  local name=$2

  if [ -d "$dir" ]; then
    echo -e "${GREEN}✓${NC} $name"
    ((passed++))
  else
    echo -e "${YELLOW}⚠${NC} $name - НЕ СУЩЕСТВУЕТ (будет создана)"
  fi
}

echo "📦 Программы:"
check_command "node" "Node.js"
check_command "npm" "npm"
check_command "python3" "Python 3"
check_command "git" "Git"

echo ""
echo "📁 Файлы проекта:"
check_file "package.json" "package.json"
check_file "main.js" "main.js"
check_file "index.html" "index.html"
check_file "renderer.js" "renderer.js"
check_file "preload.js" "preload.js"

echo ""
echo "📂 Директории:"
check_dir "$HOME/noumind" "~/noumind"
check_file "$HOME/noumind/node_gguf.py" "node_gguf.py"
check_file "$HOME/noumind/model.gguf" "model.gguf (600MB)"

echo ""
echo "🐍 Python модули:"

# Проверим Python модули
python3 -c "import torch" 2>/dev/null && {
  echo -e "${GREEN}✓${NC} PyTorch" && ((passed++))
} || {
  echo -e "${YELLOW}⚠${NC} PyTorch - рекомендуется: pip3 install torch"
}

python3 -c "import transformers" 2>/dev/null && {
  echo -e "${GREEN}✓${NC} Transformers" && ((passed++))
} || {
  echo -e "${YELLOW}⚠${NC} Transformers - рекомендуется: pip3 install transformers"
}

python3 -c "import numpy" 2>/dev/null && {
  echo -e "${GREEN}✓${NC} NumPy" && ((passed++))
} || {
  echo -e "${YELLOW}⚠${NC} NumPy - рекомендуется: pip3 install numpy"
}

python3 -c "import fastapi" 2>/dev/null && {
  echo -e "${GREEN}✓${NC} FastAPI" && ((passed++))
} || {
  echo -e "${YELLOW}⚠${NC} FastAPI - рекомендуется: pip3 install fastapi uvicorn"
}

echo ""
echo "🔗 Сетевые соединения:"

# Проверим подключение к Gateway
timeout 2 curl -s http://87.106.255.55:8000/health > /dev/null 2>&1 && {
  echo -e "${GREEN}✓${NC} Gateway доступен (87.106.255.55:8000)" && ((passed++))
} || {
  echo -e "${YELLOW}⚠${NC} Gateway недоступен - проверьте интернет"
}

# Проверим локальный порт
timeout 1 curl -s http://localhost:9001/health > /dev/null 2>&1 && {
  echo -e "${GREEN}✓${NC} Локальный узел (localhost:9001)" && ((passed++))
} || {
  echo -e "${YELLOW}⚠${NC} Локальный узел не запущен (это нормально при первом старте)"
}

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "Проверено: ${GREEN}$passed✓${NC}"
echo -e "Ошибок: ${RED}$failed✗${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [ $failed -eq 0 ]; then
  echo ""
  echo -e "${GREEN}✓ Все требования выполнены!${NC}"
  echo ""
  echo "Можно запустить приложение:"
  echo "  npm start"
  exit 0
else
  echo ""
  echo -e "${YELLOW}⚠ Установите недостающие компоненты и попробуйте снова${NC}"
  echo ""
  echo "Установка Node.js: https://nodejs.org/"
  echo "Установка Python 3: https://python.org/"
  exit 1
fi
