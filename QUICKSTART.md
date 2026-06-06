# 🚀 Быстрый старт Noümind Launcher

## За 5 минут до первого сообщения

### Шаг 1: Скачайте Electron зависимости
```bash
cd noumind-launcher
npm install
```
⏱ ~2 минуты (первый раз)

### Шаг 2: Скопируйте модель на свой компьютер
```bash
mkdir -p ~/noumind

# Скачайте model.gguf с VPS (600MB)
scp root@87.106.255.55:/home/noumind/pipeline/tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf ~/noumind/model.gguf

# Скопируйте node_gguf.py и другие файлы
scp root@87.106.255.55:/home/noumind/pipeline/node_gguf.py ~/noumind/
scp root@87.106.255.55:/home/noumind/pipeline/efct_com.py ~/noumind/
```
⏱ ~5-10 минут (зависит от интернета)

### Шаг 3: Запустите приложение
```bash
npm start
```
⏱ ~1 минута

### Шаг 4: Напишите сообщение
1. Обождите пока загрузится модель (прогресс-бар справа)
2. Напишите вопрос в чат
3. Отправьте сообщение
4. Получите ответ от AI!

---

## ✅ Что должно произойти

```
[UI] Noümind Launcher запущена
      ↓
[Python] node_gguf.py стартует
      ↓
[UI] Прогресс-бар: "Загружаю модель..."
      ↓
[Python] Model loaded ✓
      ↓
[UI] Статус: "Активен" ✓ (зелёный)
      ↓
[Ready] Можно писать сообщения
```

---

## 🔧 Если что-то не работает

### Проблема 1: "npm: command not found"
```bash
# Установите Node.js с https://nodejs.org/
# Выберите LTS версию
# Перезагрузитесь
```

### Проблема 2: "python3: command not found"
```bash
# На macOS:
brew install python3

# На Linux:
sudo apt install python3

# На Windows:
# Скачайте с https://python.org
```

### Проблема 3: Нет подключения к Gateway
```bash
# Проверьте что Gateway запущен на VPS:
curl http://87.106.255.55:8000/health

# Если не работает, отредактируйте config.js:
module.exports = {
  gateway: {
    url: 'http://localhost:8000'  // Используйте локальный
  }
}
```

### Проблема 4: "model.gguf не найден"
```bash
# Проверьте путь:
ls -la ~/noumind/model.gguf

# Должно быть:
# -rw-r--r--  1 user  staff  638M Jun  2 15:59 model.gguf

# Если нет, скопируйте заново или создайте пустой файл для тестирования
```

### Проблема 5: Python process не запускается
```bash
# Проверьте зависимости Python:
python3 -m pip install --upgrade pip
python3 -m pip install torch transformers numpy

# Запустите узел вручную для тестирования:
python3 ~/noumind/node_gguf.py --layers 0-7 --port 9001
```

---

## 🎯 Тестирование без полной системы

### Минимальный тест (без узла)
```bash
npm start
# Приложение запустится даже если узла нет
# Вы можете видеть UI и отправлять сообщения на Gateway
```

### Тестирование только UI
```bash
# Отредактируйте main.js, закомментируйте startNodeProcess:
// startNodeProcess(); // ← Закомментируйте

npm start
# Только UI будет работать, без локального узла
```

### Тестирование Gateway
```bash
# Проверьте что Gateway запущен и узлы зарегистрированы:
curl http://87.106.255.55:8000/nodes | python3 -m json.tool

# Должно быть:
# {
#   "nodes": [
#     {"name": "node-a", "status": "online"},
#     {"name": "node-c", "status": "online"}
#   ],
#   "total": 2
# }
```

---

## 📊 Ожидаемые метрики при работе

```
Узел Активен ✓
▯▯▯▯▯▯▯▯ 100%  ← Модель загружена

COMPUTE Токены:  5.00  ← Увеличивается на 1 каждые 10 сек
Слои:            0-7
Токены/сек:      2.1   ← Скорость инференции
Сессий:          3     ← Количество сообщений

Скачано 600MB из 600MB  ← Model size
```

---

## 🎓 Как использовать

### Простой чат
```
User: What is machine learning?
AI:   Machine learning is a subset of artificial intelligence...
```

### Вопросы про систему
```
User: How fast are you?
AI:   Current throughput is 2.16 tokens/second...
```

### Получение feedback
После каждого ответа система автоматически:
1. Оценивает качество ответа (COM metric)
2. Отправляет feedback на узел (-0.5 до +1.0)
3. Узел обновляет EFCT phase gates
4. Улучшает будущие ответы

---

## 🔄 Обновление и синхронизация

### Обновить код приложения
```bash
git pull origin main
npm install
npm start
```

### Обновить модель с VPS
```bash
rm ~/noumind/model.gguf
scp root@87.106.255.55:/home/noumind/pipeline/*.gguf ~/noumind/
```

### Очистить кэш
```bash
rm -rf node_modules package-lock.json
npm install
```

---

## 📝 Полезные команды

```bash
# Просмотр логов Node.js
npm start -- --verbose

# Запуск узла отдельно для тестирования
python3 ~/noumind/node_gguf.py --port 9001 --name node-a

# Проверка соединения с Gateway
curl -I http://87.106.255.55:8000/health

# Список процессов Python
ps aux | grep python3

# Убить зависший процесс
pkill -f node_gguf.py
```

---

## 🎯 Следующие шаги

1. ✅ Запустите приложение
2. ✅ Отправьте 5 сообщений для обучения узла
3. ✅ Проверьте метрики (should have inference_count=5)
4. ✅ Дайте feedback (система делает это автоматически)
5. ✅ Проверьте что узел учится (specialization меняется)

---

## 💡 Tips & Tricks

- **Горячие клавиши**: 
  - `Enter` - отправить сообщение
  - `Shift+Enter` - новая строка в сообщении
  - `Cmd/Ctrl+W` - закрыть окно

- **Сокращение времени загрузки**:
  - Модель загружается один раз при первом запуске
  - Следующие запуски будут быстрее (10-15 сек)

- **Экономия памяти**:
  - Toggle OFF остановит узел и освободит 800MB RAM
  - Toggle ON снова запустит узел (загрузка займет 15 сек)

- **Диагностика**:
  - Откройте DevTools: Cmd+Option+I (macOS) или F12 (Linux/Windows)
  - Проверьте Console для ошибок и логов

---

## 🆘 Если ничего не помогает

1. Закройте приложение
2. Очистите процессы:
   ```bash
   pkill -f "electron|node_gguf|python3"
   ```
3. Проверьте интернет соединение
4. Перезагрузитесь
5. Запустите заново

**Всё равно не работает?** Проверьте документацию в README.md

---

## 🎉 Готово!

Вы теперь можете использовать Noümind локально с полнофункциональным UI!

**Дальнейшее развитие:**
- Сохранение истории чатов
- Экспорт результатов
- Интеграция с облаком
- Кастомизация моделей

Приятного использования! 🚀
