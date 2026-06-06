# 🚀 Установка Noümind Launcher

Полная пошаговая инструкция по установке и первому запуску.

## ✅ Проверка требований

Перед началом убедитесь что установлены:

```bash
# Проверить Node.js
node --version    # Должно быть v16.0.0 или выше
npm --version     # Должно быть v7.0.0 или выше

# Проверить Python
python3 --version # Должно быть Python 3.8 или выше
```

Если чего-то нет, установите:
- **Node.js**: https://nodejs.org/ (выберите LTS версию)
- **Python**: https://python.org

## 📥 Шаг 1: Получить код

### Вариант А: Git (рекомендуется)
```bash
git clone https://github.com/yourusername/noumind-launcher.git
cd noumind-launcher
```

### Вариант Б: Скачать ZIP
1. Откройте GitHub репозиторий
2. Нажмите "Code" → "Download ZIP"
3. Распакуйте в удобное место
4. Откройте терминал в папке

## 📦 Шаг 2: Установить зависимости

```bash
npm install
```

Это установит Electron и другие зависимости (~180MB).

⏱ Время: 2-5 минут на первый раз

## 📂 Шаг 3: Подготовить Python узел

Убедитесь что есть файлы в директории `~/noumind/`:

```bash
# Проверить
ls -la ~/noumind/

# Должны быть:
# -rw-r--r--  node_gguf.py    (скрипт)
# -rw-r--r--  model.gguf      (600MB)
# -rw-r--r--  efct_com.py     (другие файлы)
```

### Если файлов нет, скопируйте с VPS:

```bash
# Создать директорию
mkdir -p ~/noumind

# Скопировать модель (600MB - долго!)
scp root@87.106.255.55:/home/noumind/pipeline/tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf ~/noumind/model.gguf

# Скопировать скрипты
scp root@87.106.255.55:/home/noumind/pipeline/node_gguf.py ~/noumind/
scp root@87.106.255.55:/home/noumind/pipeline/efct_com.py ~/noumind/
scp root@87.106.255.55:/home/noumind/pipeline/*.py ~/noumind/
```

⏱ Время: 5-20 минут (зависит от интернета)

## 🐍 Шаг 4: Установить Python зависимости

```bash
python3 -m pip install --upgrade pip

# Основные пакеты
python3 -m pip install torch transformers numpy psutil

# Для Gateway поддержки
python3 -m pip install fastapi uvicorn httpx

# Проверить
python3 -c "import torch, transformers; print('✓ OK')"
```

⏱ Время: 2-5 минут

## ✔️ Шаг 5: Проверить готовность

Используйте встроенный скрипт:

```bash
./scripts/check-requirements.sh
```

**Вывод должен быть:**
```
✓ Node.js
✓ npm
✓ Python 3
✓ package.json
✓ main.js
✓ index.html
✓ node_gguf.py
✓ model.gguf
✓ PyTorch
✓ Transformers
✓ Gateway доступен (87.106.255.55:8000)
✓ Все требования выполнены!
```

## 🚀 Шаг 6: Первый запуск

```bash
npm start
```

Приложение запустится. Вы должны увидеть:

1. Окно Electron (1100x700)
2. Левая панель - чат
3. Правая панель - узел
4. Прогресс загрузки модели
5. Статус: "Загружаю модель..."

⏱ Время: 10-15 секунд

## 💬 Шаг 7: Первое сообщение

1. **Дождитесь** пока модель полностью загрузится
   - Прогресс-бар будет 100%
   - Статус изменится на "Активен" (зелёный)

2. **Напишите** сообщение в чат
   ```
   "What is machine learning?"
   ```

3. **Отправьте** (Enter или кнопка отправки)

4. **Дождитесь** ответа
   - На первый запрос может потребоваться 15-30 сек
   - Последующие запросы будут быстрее (5-10 сек)

5. **Смотрите** метрики обновляться
   - COMPUTE Токены: +1 каждые 10 сек
   - Токены/сек: скорость ответа
   - Сессий: количество вопросов

## ✅ Готово!

Теперь вы можете:
- 💬 Писать сообщения в чат
- 🎛 Управлять узлом (toggle ON/OFF)
- 📊 Смотреть метрики в реальном времени
- 🔄 Отправлять feedback (автоматически)

## 🆘 Если что-то не работает

Проверьте документацию:
1. **Первый раз?** → Читайте QUICKSTART.md
2. **Проблема с установкой?** → Смотрите Troubleshooting ниже
3. **Разработка?** → Смотрите DEVELOPMENT.md
4. **API интеграция?** → Смотрите API-EXAMPLES.md

## 🔧 Troubleshooting

### npm install не работает
```bash
# Очистить кэш
npm cache clean --force

# Переустановить
rm -rf node_modules package-lock.json
npm install
```

### Python модули не устанавливаются
```bash
# Обновить pip
python3 -m pip install --upgrade pip

# Установить по одному
python3 -m pip install torch
python3 -m pip install transformers
python3 -m pip install fastapi
```

### "Gateway недоступен"
```bash
# Проверить соединение
curl http://87.106.255.55:8000/health

# Если не работает - запустить локальный Gateway
python3 ~/noumind/gateway_gguf.py

# Обновить config.js
# gateway.url = 'http://localhost:8000'
```

### "Model.gguf не найден"
```bash
# Проверить путь
ls -lah ~/noumind/model.gguf

# Если нет - скопировать заново
scp root@87.106.255.55:/home/noumind/pipeline/*.gguf ~/noumind/
```

### Приложение не запускается
```bash
# Открыть DevTools
# Cmd+Option+I (macOS) или F12 (Windows/Linux)

# Проверить консоль на ошибки
# Может потребоваться переустановка Electron:
npm install electron --save
```

### Python процесс не запускается
```bash
# Проверить что Python установлен
which python3
python3 --version

# Запустить узел вручную для диагностики
python3 ~/noumind/node_gguf.py --layers 0-7 --port 9001

# Проверить логи
cat /tmp/node-a.log
```

## 📚 Следующие шаги

После успешной установки:

1. **Запустите приложение** несколько раз
2. **Отправьте 5+ сообщений** для обучения узла
3. **Проверьте метрики** - должны расти
4. **Дайте feedback** - система делает это автоматически
5. **Смотрите специализацию** узла (curl endpoint)

## 📞 Поддержка

Если возникли проблемы:
1. Проверьте этот файл (раздел Troubleshooting)
2. Прочитайте README.md
3. Смотрите логи консоли (DevTools)
4. Создайте Issue на GitHub

## ✨ Успешная установка!

```
⚛ Noümind Launcher готов к использованию!

Статус системы:
✓ Electron запущен
✓ Python узел загружен
✓ Gateway подключен
✓ Можно писать сообщения!
```

**Happy chatting! 🚀**
