# 🛠 Development Guide для Noümind Launcher

Руководство для разработчиков и контрибьюторов.

## Setup для разработки

### 1. Клонируем репозиторий
```bash
git clone https://github.com/yourusername/noumind-launcher.git
cd noumind-launcher
```

### 2. Установим зависимости
```bash
npm install

# Для разработки (опционально)
npm install --save-dev devtool
```

### 3. Запустим в dev режиме
```bash
npm run dev
# или
npm start
```

## Структура проекта

```
noumind-launcher/
├── main.js              # Electron main process (управление окном, IPC, Python)
├── preload.js           # IPC безопасность (contextBridge)
├── index.html           # UI структура
├── renderer.js          # UI логика (чат, метрики, управление)
├── config.js            # Конфигурация (Gateway URL, параметры)
├── package.json         # npm конфигурация
├── README.md            # Пользовательская документация
├── QUICKSTART.md        # Быстрый старт
├── DEVELOPMENT.md       # Этот файл
├── API-EXAMPLES.md      # Примеры API
└── scripts/
    └── check-requirements.sh  # Проверка требований
```

## Основные компоненты

### 1. main.js - Electron Main Process

**Задачи:**
- Создание и управление окном приложения
- Запуск/остановка Python процесса (node_gguf.py)
- IPC коммуникация с renderer процессом
- Обработка событий приложения

**Ключевые функции:**
```javascript
createWindow()         // Создание окна
startNodeProcess()     // Запуск Python узла
stopNodeProcess()      // Остановка Python узла
```

**IPC обработчики:**
- `toggle-node` - включение/выключение узла
- `get-node-status` - статус узла
- `check-model` - проверка наличия модели
- `close-window`, `minimize-window`, `maximize-window` - управление окном

### 2. renderer.js - Renderer Process

**Задачи:**
- Отправка сообщений на Gateway
- Обновление UI метрик
- Слушание IPC событий
- Управление сессией пользователя

**Ключевые функции:**
```javascript
sendMessage()          // Отправка сообщения в чат
sendFeedback()         // Отправка feedback (COM)
updateNodeMetrics()    // Обновление метрик узла
addMessage()           // Добавление сообщения в UI
```

### 3. index.html - UI

**Структура:**
- Titlebar (40px высота)
- Контейнер 2 колонки:
  - Левая (60%) - чат
  - Правая (40%) - панель узла

**Элементы:**
```html
.chat-messages     - Область сообщений
.chat-input        - Input для сообщений
.message           - Сообщение в чате
.node-toggle       - Toggle для узла
.metrics-grid      - Сетка метрик
.progress-bar      - Прогресс загрузки
```

## Изменение основных компонентов

### Изменить Gateway URL

**config.js:**
```javascript
module.exports = {
  gateway: {
    url: 'http://your-server:8000'
  }
}
```

Или в **renderer.js:**
```javascript
const GATEWAY_URL = 'http://your-server:8000';
```

### Изменить дизайн

**index.html:**
```css
body {
  background-color: #34507e;  /* Фон */
}

.message.user .message-content {
  background: #d98a6a;        /* Цвет сообщения пользователя */
}
```

### Добавить новую метрику

**renderer.js:**
```javascript
// 1. Добавить HTML элемент
// <div class="metric-card">
//   <div class="metric-value" id="newMetric">0</div>
//   <div class="metric-label">NEW METRIC</div>
// </div>

// 2. Обновить updateMetricsDisplay()
function updateMetricsDisplay() {
  const newMetricEl = document.getElementById('newMetric');
  newMetricEl.textContent = someValue;
}
```

## Тестирование

### Unit tests (опционально)

```bash
npm install --save-dev jest

# Запуск тестов
npm test
```

**Пример теста (test/renderer.test.js):**
```javascript
describe('Renderer Functions', () => {
  test('addMessage should add message to DOM', () => {
    // Mock DOM
    const mockMessages = [];
    
    // Test
    // addMessage('user', 'Hello');
    // expect(mockMessages.length).toBe(1);
  });
});
```

### Manual testing

```bash
# 1. Запустить приложение
npm start

# 2. Открыть DevTools (Cmd+Option+I на macOS)
# 3. Проверить консоль на ошибки
# 4. Отправить тестовое сообщение
# 5. Проверить метрики обновились
# 6. Toggle узел OFF/ON
```

## Отладка

### DevTools

```javascript
// В main.js - раскомментировать:
mainWindow.webContents.openDevTools();

// Или открыть: Cmd+Option+I (macOS) / F12 (Windows/Linux)
```

### Логирование

**main.js:**
```javascript
console.log('[Main]', 'Message');
```

**renderer.js:**
```javascript
console.log('[Renderer]', 'Message');
```

**Python узел:**
Выводит логи в stdout, которые ловятся main.js

### Проверка Python процесса

```bash
# Список процессов
ps aux | grep python3

# Логи процесса
cat /tmp/node-a.log

# Запуск вручную для тестирования
python3 ~/noumind/node_gguf.py --layers 0-7 --port 9001
```

## Интеграция с Gateway

### Локальный Gateway для тестирования

```bash
# На машине для разработки
git clone https://github.com/noumind/noumind-gateway.git
cd noumind-gateway
python3 gateway_gguf.py
```

Затем обновить URL в **config.js**:
```javascript
gateway: {
  url: 'http://localhost:8000'
}
```

### Тестирование API

```bash
# Проверить Gateway
curl http://localhost:8000/health

# Отправить тестовое сообщение
curl -X POST http://localhost:8000/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "Hi", "max_tokens": 50}'

# Получить узлы
curl http://localhost:8000/nodes
```

## Выполнение распространенных задач

### Добавить новую кнопку в UI

**1. index.html:**
```html
<button class="button" id="newBtn">New Button</button>
```

**2. index.html (CSS):**
```css
.button {
  padding: 10px 16px;
  background: #d98a6a;
  border: none;
  border-radius: 6px;
  color: white;
  cursor: pointer;
}

.button:hover {
  background: #e5a47e;
}
```

**3. renderer.js:**
```javascript
document.getElementById('newBtn').addEventListener('click', () => {
  console.log('Button clicked!');
  // Логика здесь
});
```

### Добавить новый IPC обработчик

**1. main.js:**
```javascript
ipcMain.on('my-event', (event, data) => {
  console.log('Event received:', data);
  // Логика здесь
  mainWindow?.webContents.send('my-response', { status: 'ok' });
});
```

**2. preload.js:**
```javascript
contextBridge.exposeInMainWorld('electronAPI', {
  myEvent: (data) => ipcRenderer.send('my-event', data),
  onMyResponse: (callback) => {
    ipcRenderer.on('my-response', (event, data) => callback(data));
  }
});
```

**3. renderer.js:**
```javascript
window.electronAPI.myEvent({ foo: 'bar' });
window.electronAPI.onMyResponse((data) => {
  console.log('Response:', data);
});
```

### Изменить параметры запуска узла

**main.js - startNodeProcess():**
```javascript
nodeProcess = spawn('python3', [
  NODE_SCRIPT,
  '--layers', '0-7',    // ← Изменить здесь
  '--port', '9001',     // ← Или здесь
  '--name', 'node-a'    // ← Или здесь
]);
```

## Performance optimization

### Запрещение перерисовок UI

```javascript
// Плохо - перерисовывает при каждом обновлении
function addMessage(sender, text) {
  const el = document.createElement('div');
  // ...
  chatMessages.appendChild(el);
  chatMessages.scrollTop = chatMessages.scrollHeight;  // Дорого!
}

// Хорошо - используем requestAnimationFrame
function addMessage(sender, text) {
  const el = document.createElement('div');
  // ...
  chatMessages.appendChild(el);
  
  requestAnimationFrame(() => {
    chatMessages.scrollTop = chatMessages.scrollHeight;
  });
}
```

### Уменьшение частоты обновлений

```javascript
// Обновляем метрики каждые 5 сек, а не каждую сек
setInterval(updateNodeMetrics, 5000); // 5000ms

// Группируем обновления
const updates = [];
for (let i = 0; i < 10; i++) {
  updates.push(fetchMetric(i));
}
Promise.all(updates).then(results => {
  // Обновить UI один раз с все результатов
  updateAllMetrics(results);
});
```

## Build и Deploy

### Сборка для macOS

```bash
npm install --save-dev electron-builder

# package.json
"build": {
  "appId": "com.noumind.launcher",
  "mac": {
    "target": ["dmg", "zip"],
    "category": "public.app-category.utilities"
  }
}

npm run build
```

### Сборка для Windows

```bash
# package.json
"build": {
  "win": {
    "target": ["nsis", "portable"]
  }
}

npm run build
```

### Подпись кода (опционально)

```bash
# macOS
npm install --save-dev electron-notarize

# Используйте в electron-builder конфиге
"afterSign": "scripts/notarize.js"
```

## CI/CD Integration

### GitHub Actions пример

```yaml
name: Build

on: [push, pull_request]

jobs:
  build:
    runs-on: ${{ matrix.os }}
    strategy:
      matrix:
        os: [ubuntu-latest, macos-latest, windows-latest]
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
        with:
          node-version: '16'
      - run: npm install
      - run: npm test
      - run: npm run build
```

## Отправка изменений

### Git workflow

```bash
# 1. Создать feature branch
git checkout -b feature/my-feature

# 2. Сделать изменения
# ... edit files ...

# 3. Commit
git add .
git commit -m "feat: add my feature"

# 4. Push
git push origin feature/my-feature

# 5. Создать Pull Request на GitHub
```

### Commit message формат

```
feat: добавить новую функцию
fix: исправить баг
docs: обновить документацию
style: форматирование кода
refactor: рефакторинг без изменения функцетности
test: добавить тесты
chore: обновление зависимостей
```

## Полезные ссылки

- [Electron Documentation](https://www.electronjs.org/docs)
- [Node.js API](https://nodejs.org/api/)
- [Fetch API](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API)
- [IPC with Electron](https://www.electronjs.org/docs/latest/tutorial/ipc)

## Troubleshooting разработки

### Problem: "Cannot find module 'electron'"
```bash
npm install
```

### Problem: "Python процесс не запускается"
```bash
# Проверьте:
which python3
python3 --version
ls ~/noumind/node_gguf.py
```

### Problem: "Gateway недоступен"
```bash
# Запустить локальный Gateway для тестирования
python3 ~/noumind/gateway_gguf.py
```

### Problem: Изменения не отражаются в UI
```javascript
// Убедитесь что изменяете DOM, а не javascript объект
// Плохо:
data.message = 'new';  // Только меняет объект

// Хорошо:
element.textContent = 'new';  // Меняет DOM
```

## Получение помощи

1. Проверить логи консоли (DevTools)
2. Проверить документацию в README.md
3. Создать Issue на GitHub с описанием проблемы
4. Обсудить в Discord сообществе

---

**Happy coding! 🚀**
