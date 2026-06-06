#!/bin/bash
# Полная установка Noümind на новый VPS
# Запуск: bash setup-vps.sh

set -e

echo "============================================"
echo "  Noümind VPS Setup"
echo "============================================"

# 1. Обновляем систему
echo ""
echo "📦 Обновляю систему..."
apt-get update -q && apt-get upgrade -y -q

# 2. Устанавливаем зависимости
echo ""
echo "📦 Устанавливаю Python и зависимости..."
apt-get install -y -q python3 python3-pip python3-venv git curl wget htop screen

# 3. Создаем рабочую директорию
echo ""
echo "📁 Создаю директорию /home/noumind/pipeline..."
mkdir -p /home/noumind/pipeline
cd /home/noumind/pipeline

# 4. Создаем venv
echo ""
echo "🐍 Создаю виртуальное окружение..."
python3 -m venv venv
source venv/bin/activate

# 5. Устанавливаем Python пакеты
echo ""
echo "📦 Устанавливаю PyTorch и transformers..."
pip install --quiet torch --index-url https://download.pytorch.org/whl/cpu
pip install --quiet transformers accelerate fastapi uvicorn httpx numpy psutil

# 6. Копируем файлы со старого VPS
echo ""
echo "📥 Копирую файлы со старого VPS..."
OLD_VPS="root@87.106.255.55"
FILES="gateway_gguf.py node_fallback.py efct_com.py gguf_inference_fallback.py"

for f in $FILES; do
    if scp -o StrictHostKeyChecking=no "$OLD_VPS:/home/noumind/pipeline/$f" . 2>/dev/null; then
        echo "  ✓ $f"
    else
        echo "  ✗ $f (не найден)"
    fi
done

# 7. Скачиваем модель (Meta-Llama или Mistral)
echo ""
echo "🤖 Скачиваю модель LLaMA-3-8B..."
echo "   (это займет ~10 минут, 4.5GB)"

# Используем Mistral-7B-Instruct-v0.3 GGUF (быстрее на CPU)
pip install --quiet huggingface_hub
python3 -c "
from huggingface_hub import hf_hub_download
import os
print('Скачиваю Mistral-7B-Instruct GGUF...')
path = hf_hub_download(
    repo_id='TheBloke/Mistral-7B-Instruct-v0.2-GGUF',
    filename='mistral-7b-instruct-v0.2.Q4_K_M.gguf',
    local_dir='/home/noumind/pipeline'
)
print(f'✓ Модель скачана: {path}')
"

# 8. Создаем systemd сервисы
echo ""
echo "⚙️  Создаю systemd сервисы..."

# Gateway
cat > /etc/systemd/system/noumind-gateway.service << 'EOF'
[Unit]
Description=Noumind Gateway
After=network.target

[Service]
WorkingDirectory=/home/noumind/pipeline
ExecStart=/home/noumind/pipeline/venv/bin/python3 gateway_gguf.py
Restart=always
RestartSec=5
Environment=KMP_DUPLICATE_LIB_OK=TRUE

[Install]
WantedBy=multi-user.target
EOF

# Node-A (первые слои)
cat > /etc/systemd/system/noumind-node-a.service << 'EOF'
[Unit]
Description=Noumind Node A
After=network.target

[Service]
WorkingDirectory=/home/noumind/pipeline
ExecStart=/home/noumind/pipeline/venv/bin/python3 node_fallback.py --name node-a --port 9001
Restart=always
RestartSec=10
Environment=KMP_DUPLICATE_LIB_OK=TRUE

[Install]
WantedBy=multi-user.target
EOF

# Node-B (последние слои)
cat > /etc/systemd/system/noumind-node-b.service << 'EOF'
[Unit]
Description=Noumind Node B
After=network.target

[Service]
WorkingDirectory=/home/noumind/pipeline
ExecStart=/home/noumind/pipeline/venv/bin/python3 node_fallback.py --name node-b --port 9005
Restart=always
RestartSec=10
Environment=KMP_DUPLICATE_LIB_OK=TRUE

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable noumind-gateway noumind-node-a noumind-node-b

echo ""
echo "🚀 Запускаю сервисы..."
systemctl start noumind-node-a noumind-node-b
sleep 30
systemctl start noumind-gateway

echo ""
echo "✅ ГОТОВО! Проверяю статус..."
sleep 5
curl -s http://localhost:8000/health && echo ""
curl -s http://localhost:8000/nodes

echo ""
echo "============================================"
echo "  ✅ Установка завершена!"
echo "  Gateway: http://217.160.49.222:8000"
echo "============================================"
