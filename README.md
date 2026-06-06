# Noümind Electron Launcher

Полнофункциональный Electron лаунчер для Noümind GGUF inference engine с встроенным чатом, управлением узлом и метриками.

## 🎯 Особенности

- ✅ **Управление узлом** - включение/выключение локального узла с одного клика
- ✅ **Чат интерфейс** - прямое взаимодействие с Gateway
- ✅ **Метрики в реальном времени** - отслеживание производительности узла
- ✅ **Автоматический запуск** - узел запускается автоматически при старте приложения
- ✅ **COM feedback** - автоматическое отправление сигналов обучения
- ✅ **Кастомный design** - тёмный интерфейс с оранжевыми акцентами
- ✅ **IPC коммуникация** - безопасное взаимодействие между процессами

## 📦 Требования

- **Node.js** 16+ (для Electron)
- **Python 3.8+** (для node_gguf.py)
- **Model file** - TinyLlama-1.1B в формате GGUF (~600MB)

## 🚀 Установка и запуск

### 1. Установка зависимостей

```bash
cd noumind-launcher
npm install
```

### 2. Подготовка Python узла

Убедитесь что у вас есть файлы:
- `~/noumind/node_gguf.py` - main скрипт узла
- `~/noumind/model.gguf` - модель (TinyLlama-1.1B Q4_K_M)

Или скопируйте их из VPS:
```bash
mkdir -p ~/noumind
scp root@87.106.255.55:/home/noumind/pipeline/node_gguf.py ~/noumind/
scp root@87.106.255.55:/home/noumind/pipeline/tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf ~/noumind/model.gguf
```

### 3. Запуск приложения

```bash
npm start
```

Приложение запустится и автоматически:
1. Проверит наличие модели
2. Запустит Python процесс узла
3. Покажет прогресс загрузки
4. Подключится к Gateway

## 🎨 Дизайн

### Цветовая схема
- **Фон**: `#34507e` (тёмно-синий)
- **Акцент**: `#d98a6a` (тёплый оранжевый)
- **Текст**: `#eef2f8` (светлый)

### Макет
```
┌─────────────────────────────────────────────────┐
│  ⚛ Noümind                      − □ ✕          │  ← Titlebar
├──────────────────────────────────┬──────────────┤
│                                  │              │
│  uNeuro ✓ Подключено             │  Мой узел   │
│                                  │              │
│  ┌─────────────────────────────┐ │  [○ Toggle] │
│  │ Область сообщений (65%)    │ │              │
│  │ • User messages (справа)   │ │  ▯▯▯▯▯▯▯▯ 50%│
│  │ • AI messages (слева)      │ │              │
│  │                            │ │  Метрики:    │
│  └─────────────────────────────┘ │  ┌──┬──┐   │
│  ┌────────────────┬───────────┐  │  │00│00│   │
│  │ Напиши вопрос  │ ⬆ Отправить │ │  │TK│TK│   │
│  └────────────────┴───────────┘  │  └──┴──┘   │
└──────────────────────────────────┴──────────────┘
  60% (Чат)              40% (Узел)
```

## 🔧 API Integration

### Gateway endpoints (http://87.106.255.55:8000)

```javascript
// Chat endpoint
POST /chat
{
  message: "What is AI?",
  max_tokens: 100,
  session_id: "session-123"
}

// Feedback endpoint
POST /feedback/{session_id}
?signal=0.8&query_type=general

// Health endpoint
GET /health
```

### Local Node endpoints (http://localhost:9001)

```javascript
// Node health
GET /health
{
  name: "node-a",
  ram_mb: 782,
  inference_count: 3,
  efct_gates: 22,
  status: "ready"
}

// Specialization
GET /specialization
```

## 📊 Метрики

Приложение отслеживает:
- **COMPUTE Токены** - виртуальные токены (1 за 10 сек активности)
- **Слои** - 0-7 (первый узел в pipeline)
- **Скорость** - токены в секунду (из последней инференции)
- **Сессии** - количество выполненных инференций

## 🔄 Жизненный цикл узла

### Запуск
```
Приложение → Проверка модели → Запуск Python → Загрузка модели → Готовность
```

### Toggle выключение
```
Toggle OFF → SIGTERM → Узел останавливается → UI обновляется
```

### Автоматические операции
- Каждые 5 сек: обновление метрик (`/health`)
- Каждые 10 сек: +1 COMPUTE токен
- После каждого сообщения: отправка feedback

## 📝 IPC Коммуникация

### Main → Renderer
```javascript
// Статус узла
webContents.send('node-status', {
  status: 'loading' | 'ready' | 'stopped' | 'error',
  message: 'Загружаю модель...',
  isRunning: true
})

// Логи узла
webContents.send('node-log', {
  message: '[Node] Model loaded',
  isError: false
})
```

### Renderer → Main
```javascript
// Toggle узел
electronAPI.toggleNode(true)  // Запустить
electronAPI.toggleNode(false) // Остановить

// Получить статус
await electronAPI.getNodeStatus()

// Проверить модель
await electronAPI.checkModel()
```

## 🛠 Разработка

### Открыть DevTools
Раскомментируйте строку в `main.js`:
```javascript
// mainWindow.webContents.openDevTools();
```

### Логирование
```bash
# Terminal 1 - просмотр Electron логов
npm start

# Terminal 2 - просмотр Python логов
tail -f ~/noumind/node.log
```

## 🐛 Troubleshooting

### Проблема: "node_gguf.py не найден"
**Решение:**
```bash
ls -la ~/noumind/
# Должны быть файлы: node_gguf.py, model.gguf
```

### Проблема: "Нет подключения к Gateway"
**Решение:**
- Проверьте что Gateway запущен на VPS: `curl http://87.106.255.55:8000/health`
- Проверьте интернет соединение
- Измените URL в `renderer.js` если нужно

### Проблема: "RAM: 0MB"
**Решение:**
- Узел должен запуститься и загрузить модель
- Проверьте логи узла в консоли

## 📦 Упаковка приложения

Для создания standalone приложения (опционально):

```bash
npm install --save-dev electron-builder

# Добавьте в package.json:
"build": {
  "appId": "com.noumind.launcher",
  "productName": "Noümind Launcher",
  "files": ["**/*"],
  "win": {
    "target": ["nsis"]
  },
  "mac": {
    "target": ["dmg"]
  }
}

npm run build
```

## 📄 Структура файлов

```
noumind-launcher/
├── package.json          # npm конфигурация
├── main.js              # Electron main process
├── preload.js           # IPC безопасность
├── index.html           # UI
├── renderer.js          # Логика UI
└── README.md            # Документация
```

## 🎓 Как это работает

1. **Main процесс** (main.js):
   - Создает окно и управляет жизненным циклом приложения
   - Запускает Python узел как дочерний процесс
   - Слушает stdout/stderr узла
   - Отправляет события в renderer через IPC

2. **Renderer процесс** (renderer.js):
   - Отображает UI
   - Подключается к Gateway через HTTP
   - Отправляет сообщения и получает ответы
   - Управляет toggle для узла
   - Обновляет метрики в реальном времени

3. **IPC Коммуникация**:
   - Безопасное взаимодействие между процессами через preload.js
   - Main ↔ Renderer события для статуса узла

## 🔐 Безопасность

- ✅ Context isolation включен
- ✅ Node integration отключен
- ✅ Preload скрипт для контролируемого доступа
- ✅ HTTPS для Gateway (рекомендуется)

## 📞 Support

Для вопросов и проблем:
1. Проверьте логи консоли (DevTools)
2. Проверьте статус Gateway
3. Убедитесь что Python окружение готово

---

Made with ❤️ for Noümind
