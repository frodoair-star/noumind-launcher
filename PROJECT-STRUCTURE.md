# 📁 Noümind Launcher - Структура проекта

Полная структура и описание всех файлов Electron приложения для Noümind.

## 📦 Иерархия файлов

```
noumind-launcher/
├── 📄 package.json              ← npm конфигурация (зависимости, скрипты)
├── 📄 main.js                   ← Electron main process (управление окном, Python)
├── 📄 preload.js                ← IPC безопасность (contextBridge)
├── 📄 index.html                ← UI структура (HTML)
├── 📄 renderer.js               ← Логика UI (JavaScript)
├── 📄 config.js                 ← Конфигурация приложения
│
├── 📚 Документация:
│   ├── README.md                ← Основная документация
│   ├── QUICKSTART.md            ← Быстрый старт (5 минут)
│   ├── DEVELOPMENT.md           ← Гайд для разработчиков
│   ├── API-EXAMPLES.md          ← Примеры API вызовов
│   └── PROJECT-STRUCTURE.md     ← Этот файл
│
├── 📁 scripts/
│   └── check-requirements.sh    ← Скрипт проверки зависимостей
│
├── 📝 .gitignore                ← Git ignore файл
│
└── 📁 node_modules/             ← npm зависимости (создаётся после npm install)
    └── electron/
    └── ...
```

## 📋 Описание каждого файла

### 🔴 Основные файлы приложения

#### 1. **package.json** (311 bytes)
```json
{
  "name": "noumind",
  "version": "0.1.0",
  "main": "main.js",
  "scripts": {
    "start": "electron ."
  },
  "dependencies": {
    "electron": "^28.0.0"
  }
}
```

**Назначение:** npm конфигурация
- Определяет название и версию приложения
- Указывает entry point (main.js)
- Содержит скрипты запуска
- Список зависимостей (только Electron)

---

#### 2. **main.js** (5.5 KB, 200+ строк)
```javascript
// Структура:
- Создание окна (createWindow)
- Запуск Python узла (startNodeProcess)
- Остановка узла (stopNodeProcess)
- IPC обработчики (toggle-node, get-node-status, etc)
- Жизненный цикл Electron (app.on)
```

**Назначение:** Electron main процесс
- Управление окном приложения
- Запуск/остановка Python процесса
- IPC коммуникация с renderer
- Обработка событий приложения

**Ключевые функции:**
- `createWindow()` - создание окна 1100x700
- `startNodeProcess()` - запуск node_gguf.py
- `stopNodeProcess()` - остановка процесса
- IPC handlers для UI управления

---

#### 3. **preload.js** (1.1 KB)
```javascript
// Безопасное предоставление API для renderer
contextBridge.exposeInMainWorld('electronAPI', {
  toggleNode,
  getNodeStatus,
  checkModel,
  closeWindow,
  onNodeStatus,
  onNodeLog,
  ...
})
```

**Назначение:** IPC безопасность
- Изолирует main процесс от renderer
- Предоставляет контролируемый API
- Защищает от XSS атак

**API методы:**
- `toggleNode(bool)` - включение/выключение узла
- `getNodeStatus()` - получить статус
- `checkModel()` - проверить модель
- `onNodeStatus(callback)` - слушатель событий

---

#### 4. **index.html** (12 KB, 450+ строк)
```html
<!-- Структура: -->
<div class="titlebar">...</div>     <!-- Кастомный titlebar -->
<div class="container">
  <div class="chat-section">...     <!-- 60% чат -->
  <div class="node-section">...     <!-- 40% панель узла -->
</div>
```

**Назначение:** UI структура
- HTML разметка интерфейса
- Встроенные CSS стили
- Дизайн по спецификации

**Основные элементы:**
- `.titlebar` - кастомная панель заголовка (40px)
- `.chat-section` - левая панель (60%)
  - `.chat-messages` - область сообщений
  - `.chat-input` - input для сообщений
- `.node-section` - правая панель (40%)
  - `.node-toggle` - toggle для узла
  - `.metrics-grid` - сетка метрик
  - `.progress-bar` - прогресс загрузки

**Цветовая схема:**
```css
background: #34507e          /* Тёмно-синий */
accent: #d98a6a              /* Тёплый оранжевый */
text: #eef2f8                /* Светлый */
```

---

#### 5. **renderer.js** (8.8 KB, 300+ строк)
```javascript
// Структура:
- Инициализация при загрузке
- Gateway интеграция (HTTP запросы)
- IPC слушатели
- Обновление метрик
- Управление чатом
```

**Назначение:** Логика UI (renderer процесс)
- Отправка сообщений на Gateway
- Обновление метрик в реальном времени
- Управление toggle узла
- Добавление сообщений в чат

**Ключевые функции:**
- `sendMessage()` - отправка на Gateway
- `addMessage()` - добавление в UI
- `sendFeedback()` - отправка COM feedback
- `updateNodeMetrics()` - обновление метрик каждые 5 сек
- `incrementComputeTokens()` - +1 токен каждые 10 сек

**Gateway интеграция:**
```javascript
const GATEWAY_URL = 'http://87.106.255.55:8000'
const NODE_API_URL = 'http://localhost:9001'
```

---

#### 6. **config.js** (3.1 KB)
```javascript
module.exports = {
  gateway: { ... },     // Gateway конфигурация
  node: { ... },        // Локальный узел
  ui: { ... },          // UI параметры
  chat: { ... },        // Чат конфигурация
  efct: { ... },        // EFCT параметры
  features: { ... }     // Feature flags
}
```

**Назначение:** Центральная конфигурация
- Gateway URL и fallbacks
- Параметры узла
- UI интервалы обновления
- EFCT параметры
- Feature flags

**Основные параметры:**
```javascript
gateway.url = 'http://87.106.255.55:8000'
node.apiUrl = 'http://localhost:9001'
ui.metricsUpdateInterval = 5000        // 5 сек
ui.computeTokenInterval = 10000        // 10 сек
```

---

### 📚 Документация

#### **README.md** (9.4 KB)
Полная пользовательская документация
- Описание функций
- Требования и установка
- API интеграция
- Troubleshooting
- Поддержка

#### **QUICKSTART.md** (8.0 KB)
Быстрый старт за 5 минут
- 3 простых шага установки
- Что должно произойти
- Решение частых проблем
- Полезные команды

#### **DEVELOPMENT.md** (12 KB)
Гайд для разработчиков
- Setup для разработки
- Архитектура компонентов
- Как добавлять функции
- Тестирование и отладка
- Performance оптимизация

#### **API-EXAMPLES.md** (12 KB)
Примеры API вызовов
- cURL примеры
- JavaScript примеры
- Python примеры
- Обработка ошибок
- Integrация в Electron

#### **PROJECT-STRUCTURE.md** (этот файл)
Описание структуры проекта
- Иерархия файлов
- Описание каждого файла
- Зависимости
- Как всё работает вместе

---

### 🔧 Скрипты

#### **scripts/check-requirements.sh** (4.1 KB)
Скрипт для проверки требований
```bash
#!/bin/bash
# Проверяет:
- Node.js, npm, Python
- Файлы проекта
- Python модули
- Сетевые соединения
```

**Использование:**
```bash
./scripts/check-requirements.sh
```

**Вывод:**
```
✓ Node.js
✓ npm
✓ Python 3
⚠ Gateway недоступен
```

---

### 📝 Конфигурация

#### **.gitignore**
```
node_modules/
dist/
.DS_Store
*.log
.env
```

---

## 🔗 Зависимости

### Runtime зависимости
```json
{
  "dependencies": {
    "electron": "^28.0.0"  // 180MB+ (бинарь Chromium)
  }
}
```

### Системные требования
```
- Node.js 16+ (для npm)
- Python 3.8+ (для узла)
- Chromium/Electron runtime (~180MB)
```

### Python модули (для node_gguf.py)
```
torch
transformers
fastapi
uvicorn
numpy
psutil
```

---

## 🚀 Жизненный цикл приложения

### Запуск
```
1. npm start
   ↓
2. main.js создает окно
   ↓
3. index.html загружается в renderer
   ↓
4. renderer.js инициализируется
   ↓
5. main.js запускает node_gguf.py
   ↓
6. Python узел загружает модель
   ↓
7. UI показывает прогресс
   ↓
8. Готово! Можно писать сообщения
```

### Отправка сообщения
```
Пользователь напишет сообщение
   ↓
renderer.js отправляет POST /chat на Gateway
   ↓
Gateway маршрутизирует на node-a
   ↓
Узел выполняет inference
   ↓
Gateway отправляет ответ back в renderer
   ↓
renderer.js добавляет ответ в UI
   ↓
renderer.js отправляет feedback на Gateway
   ↓
Узел обновляет EFCT gates на основе feedback
```

### Завершение
```
Пользователь закрывает окно
   ↓
main.js получает close event
   ↓
main.js отправляет SIGTERM на Python процесс
   ↓
Python процесс завершается
   ↓
app.quit()
```

---

## 📊 Размеры и производительность

### Размер приложения
```
main.js           ~5.5 KB
preload.js        ~1.1 KB
index.html       ~12 KB (с CSS)
renderer.js      ~8.8 KB
config.js        ~3.1 KB
───────────────────────
Код:            ~30 KB

node_modules/   ~180 MB (Electron)
───────────────────────
Итого:          ~180 MB
```

### Memory usage
```
Electron process:    ~100 MB
Node.js engine:       ~50 MB
Python process:     ~800 MB (когда узел запущен)
───────────────────────────
Итого:             ~950 MB (с узлом включенным)
                    ~150 MB (без узла)
```

### Время загрузки
```
npm install:     ~2 минуты (первый раз)
app startup:     ~1-2 секунды
model loading:   ~10-15 секунд
first inference: ~8-16 секунд
```

---

## 🔄 Как компоненты работают вместе

```
                    ┌─────────────────┐
                    │  index.html     │
                    │  (UI разметка)  │
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │  renderer.js    │
                    │  (UI логика)    │
                    └────────┬────────┘
                             │
                    ┌────────▼────────────────┐
                    │  preload.js             │
                    │  (IPC API,безопасность) │
                    └────────┬────────────────┘
                             │
                    ┌────────▼────────┐
                    │  main.js        │
                    │  (Управление)   │
                    └────────┬────────┘
                             │
             ┌───────────────┼──────────────┐
             │               │              │
    ┌────────▼─────┐  ┌──────▼────┐  ┌────▼──────────┐
    │ node_gguf.py │  │  Gateway   │  │  Окно Electron│
    │  (Локальный  │  │  (удаленный)  │  │  (Chromium)  │
    │   узел)      │  │  (87.106..) │  │  (1100x700)  │
    └──────────────┘  └────────────┘  └──────────────┘
```

### Data flow - Отправка сообщения

```
                    User
                     │
                     ▼
          ┌──────────────────┐
          │   index.html     │
          │  (Chat Input)    │
          └────────┬─────────┘
                   │
                   ▼
          ┌──────────────────┐
          │  renderer.js     │
          │ (sendMessage)    │
          └────────┬─────────┘
                   │
                   ▼
          ┌──────────────────┐
          │   HTTP POST      │
          │ /chat endpoint   │
          └────────┬─────────┘
                   │
    ┌──────────────┴──────────────┐
    │                             │
    ▼                             ▼
 Gateway                      Local Node
 (87.106)                    (localhost)
    │                             │
    └──────────────┬──────────────┘
                   │
                   ▼
          ┌──────────────────┐
          │   inference()    │
          │  (LLM response)  │
          └────────┬─────────┘
                   │
                   ▼
          ┌──────────────────┐
          │  Gateway         │
          │  (routing)       │
          └────────┬─────────┘
                   │
                   ▼
          ┌──────────────────┐
          │  renderer.js     │
          │  (addMessage)    │
          └────────┬─────────┘
                   │
                   ▼
          ┌──────────────────┐
          │   index.html     │
          │  (Chat Display)  │
          └────────┬─────────┘
                   │
                   ▼
                  User
```

---

## 📖 Быстрая навигация по файлам

| Нужно сделать | Файл | Функция |
|---|---|---|
| Изменить UI дизайн | `index.html` | CSS стили |
| Добавить новую кнопку | `index.html` | `<button>` элемент |
| Изменить логику чата | `renderer.js` | `sendMessage()` |
| Изменить Gateway URL | `config.js` | `gateway.url` |
| Запустить/остановить узел | `main.js` | `startNodeProcess()` |
| Добавить IPC обработчик | `main.js` | `ipcMain.on()` |
| Безопасный API в UI | `preload.js` | `contextBridge` |
| Документация | `README.md` | - |
| Быстрый старт | `QUICKSTART.md` | - |
| Примеры API | `API-EXAMPLES.md` | - |

---

## 🎯 Точки интеграции

### 1. Gateway интеграция (HTTP)
**Файл:** `renderer.js`
```javascript
const GATEWAY_URL = 'http://87.106.255.55:8000'
POST /chat, /feedback, GET /specialization
```

### 2. Локальный узел (HTTP)
**Файл:** `main.js` + `renderer.js`
```javascript
const NODE_API_URL = 'http://localhost:9001'
GET /health, POST /save-gates
```

### 3. Python процесс (IPC)
**Файлы:** `main.js` + `preload.js` + `renderer.js`
```javascript
spawn('python3', ['node_gguf.py', ...])
ipcMain.send('node-status', data)
```

### 4. Electron окно (Native)
**Файл:** `main.js`
```javascript
BrowserWindow({ ... })
app.on('ready'), app.on('quit')
```

---

## 🛠 Модификация для расширенного функционала

### Добавить поддержку нескольких узлов
**Модифицировать:**
- `config.js` - добавить массив узлов
- `renderer.js` - toggle для каждого узла
- `main.js` - управление несколькими процессами

### Добавить сохранение истории чатов
**Модифицировать:**
- `renderer.js` - сохранение в localStorage
- `config.js` - путь к файлу истории
- `index.html` - UI для загрузки истории

### Добавить темы оформления
**Модифицировать:**
- `index.html` - CSS переменные
- `renderer.js` - переключение тем
- `config.js` - параметры тем

---

## 📝 Версионирование

```
v0.1.0 - Initial release
├── Базовая структура Electron
├── Чат интеграция с Gateway
├── Управление узлом
└── Метрики отслеживание

v0.2.0 (планируется)
├── Сохранение истории чатов
├── Темы оформления
└── Advanced метрики

v0.3.0 (планируется)
├── Поддержка нескольких узлов
├── Специализация обучения
└── Export результатов
```

---

## ✅ Готово к использованию!

Все файлы созданы и готовы к:
1. ✅ Установке зависимостей: `npm install`
2. ✅ Запуску приложения: `npm start`
3. ✅ Разработке: см. DEVELOPMENT.md
4. ✅ Развертыванию: см. README.md

**Начните с QUICKSTART.md за 5 минут!** 🚀
