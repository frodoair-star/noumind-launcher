# 🔌 API Examples для Noümind Launcher

Примеры вызовов API для интеграции и тестирования.

## Gateway API (http://87.106.255.55:8000)

### 1. Проверка статуса Gateway

```bash
curl http://87.106.255.55:8000/health
```

**Ответ:**
```json
{
  "status": "ok",
  "nodes_registered": 2,
  "timestamp": "2026-06-02T15:58:52.333374"
}
```

---

### 2. Получить список зарегистрированных узлов

```bash
curl http://87.106.255.55:8000/nodes
```

**Ответ:**
```json
{
  "nodes": [
    {
      "name": "node-a",
      "host": "localhost",
      "api_port": 9001,
      "socket_port": 9101,
      "layer_start": 0,
      "layer_end": 10,
      "is_first": true,
      "is_last": false,
      "status": "online"
    },
    {
      "name": "node-c",
      "host": "localhost",
      "api_port": 9005,
      "socket_port": 9105,
      "layer_start": 11,
      "layer_end": 21,
      "is_first": false,
      "is_last": true,
      "status": "online"
    }
  ],
  "total": 2,
  "active": 2
}
```

---

### 3. Отправить сообщение в чат

```bash
curl -X POST "http://87.106.255.55:8000/chat" \
  -H "Content-Type: application/json" \
  -d '{
    "message": "What is machine learning?",
    "max_tokens": 100,
    "session_id": "session-123"
  }'
```

**Ответ:**
```json
{
  "response": "Machine learning is a subset of artificial intelligence that enables systems to learn from data...",
  "node": "node-a",
  "metadata": {
    "node": "node-a",
    "model": "TinyLlama/TinyLlama-1.1B-Chat-v1.0",
    "device": "cpu",
    "dtype": "bfloat16",
    "inference_count": 3,
    "elapsed_sec": 16.16,
    "tokens_generated": 35,
    "throughput_tok_s": 2.1654317121843443,
    "com_feedback": 0.909,
    "ram_mb": 2861
  },
  "gateway_session": "session-123",
  "first_node": "node-a"
}
```

---

### 4. Отправить feedback (COM обучение)

```bash
curl -X POST "http://87.106.255.55:8000/feedback/session-123?signal=0.8&query_type=general"
```

**Ответ:**
```json
{
  "status": "broadcast_complete",
  "session_id": "session-123",
  "signal": 0.8,
  "results": {
    "node-a": "ok",
    "node-c": "ok"
  }
}
```

**Параметры feedback:**
- `signal`: -1.0 (плохо) до +1.0 (хорошо)
  - -1.0: Очень неправильный ответ
  - -0.5: Неправильный ответ
  - 0.0: Нейтральный ответ
  - +0.5: Хороший ответ
  - +1.0: Отличный ответ
- `query_type`: Тип вопроса для отслеживания специализации
  - `general`: Общие вопросы
  - `math`: Математические задачи
  - `code`: Программирование
  - `creative`: Творческие задачи

---

### 5. Получить анализ специализации узла

```bash
curl http://87.106.255.55:8000/specialization
```

**Ответ:**
```json
{
  "node-a": {
    "specialized": true,
    "dominant_type": "general",
    "dominance_ratio": 0.8214120048241953,
    "all_types": {
      "general": 0.8214120048241953,
      "failed_queries": 0.17858799517580476
    },
    "total_inferences": 3
  },
  "node-c": {
    "specialized": false,
    "dominant_type": null,
    "dominance_ratio": 0,
    "all_types": {},
    "total_inferences": 0
  }
}
```

---

## Local Node API (http://localhost:9001)

### 1. Проверка здоровья узла

```bash
curl http://localhost:9001/health
```

**Ответ:**
```json
{
  "name": "node-a",
  "model": "TinyLlama/TinyLlama-1.1B-Chat-v1.0",
  "device": "cpu",
  "dtype": "bfloat16",
  "ram_mb": 2862,
  "inference_count": 3,
  "sessions_active": 0,
  "efct_gates": 22,
  "status": "ready"
}
```

---

### 2. Прямой запрос к узлу (без Gateway)

```bash
curl -X POST "http://localhost:9001/chat" \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Hello!",
    "max_tokens": 50
  }'
```

**Ответ:**
```json
{
  "response": "Hello! How can I help you today?",
  "node": "node-a",
  "metadata": {
    "node": "node-a",
    "inference_count": 1,
    "elapsed_sec": 8.5,
    "tokens_generated": 10,
    "throughput_tok_s": 1.18,
    "com_feedback": 0.75,
    "ram_mb": 2900
  }
}
```

---

### 3. Сохранить EFCT gates

```bash
curl -X POST http://localhost:9001/save-gates
```

**Ответ:**
```json
{
  "status": "ok",
  "gates_saved": 22
}
```

---

### 4. Получить анализ специализации узла

```bash
curl http://localhost:9001/specialization
```

**Ответ:**
```json
{
  "specialized": true,
  "dominant_type": "general",
  "dominance_ratio": 0.8214120048241953,
  "all_types": {
    "general": 0.8214120048241953,
    "failed_queries": 0.17858799517580476
  },
  "total_inferences": 3,
  "all_scores": {
    "general": 101.18857142857146,
    "failed_queries": 22.0
  }
}
```

---

## JavaScript примеры (для использования в Electron)

### Отправить сообщение

```javascript
async function sendMessage(message) {
  const response = await fetch('http://87.106.255.55:8000/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: message,
      max_tokens: 100,
      session_id: 'session-123'
    })
  });

  const data = await response.json();
  console.log('Response:', data.response);
  console.log('Feedback:', data.metadata.com_feedback);

  return data;
}
```

### Отправить feedback

```javascript
async function sendFeedback(sessionId, signal) {
  const response = await fetch(
    `http://87.106.255.55:8000/feedback/${sessionId}?signal=${signal}&query_type=general`,
    { method: 'POST' }
  );

  const data = await response.json();
  console.log('Feedback sent:', data);
  return data;
}
```

### Получить метрики узла

```javascript
async function getNodeMetrics() {
  const response = await fetch('http://localhost:9001/health');
  const data = await response.json();

  console.log(`RAM: ${data.ram_mb}MB`);
  console.log(`Inferences: ${data.inference_count}`);
  console.log(`EFCT Gates: ${data.efct_gates}`);

  return data;
}
```

---

## Python примеры (для использования в скриптах)

### Отправить сообщение

```python
import requests
import json

def send_message(message):
    url = "http://87.106.255.55:8000/chat"
    
    payload = {
        "message": message,
        "max_tokens": 100,
        "session_id": "session-123"
    }
    
    response = requests.post(url, json=payload)
    data = response.json()
    
    print(f"Response: {data['response']}")
    print(f"Speed: {data['metadata']['throughput_tok_s']:.2f} tok/s")
    
    return data

# Использование
result = send_message("What is AI?")
```

### Отправить feedback

```python
import requests

def send_feedback(session_id, signal, query_type="general"):
    url = f"http://87.106.255.55:8000/feedback/{session_id}"
    
    params = {
        "signal": signal,
        "query_type": query_type
    }
    
    response = requests.post(url, params=params)
    data = response.json()
    
    print(f"Feedback status: {data['status']}")
    return data

# Использование
send_feedback("session-123", 0.8, "general")
```

### Получить специализацию узла

```python
import requests

def get_specialization():
    url = "http://87.106.255.55:8000/specialization"
    
    response = requests.get(url)
    data = response.json()
    
    for node_name, spec in data.items():
        print(f"\n{node_name}:")
        print(f"  Specialized: {spec['specialized']}")
        print(f"  Dominant type: {spec['dominant_type']}")
        print(f"  Total inferences: {spec['total_inferences']}")
    
    return data

# Использование
get_specialization()
```

---

## cURL с переменными окружения

### .env файл

```bash
# .env для скриптов
GATEWAY_URL=http://87.106.255.55:8000
NODE_URL=http://localhost:9001
SESSION_ID=session-$(date +%s)
```

### Использование в скриптах

```bash
#!/bin/bash

source .env

# Отправить сообщение
curl -X POST "$GATEWAY_URL/chat" \
  -H "Content-Type: application/json" \
  -d "{
    \"message\": \"Hello!\",
    \"max_tokens\": 100,
    \"session_id\": \"$SESSION_ID\"
  }"

# Отправить feedback
curl -X POST "$GATEWAY_URL/feedback/$SESSION_ID?signal=0.8&query_type=general"

# Получить специализацию
curl "$GATEWAY_URL/specialization" | python3 -m json.tool
```

---

## Обработка ошибок

### Общие коды ошибок

```
200 OK           - Успешный запрос
400 Bad Request  - Неверный параметр
500 Server Error - Ошибка на сервере
503 Unavailable  - Gateway недоступен
```

### Пример обработки ошибок

```javascript
async function sendMessageSafe(message) {
  try {
    const response = await fetch('http://87.106.255.55:8000/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: message,
        max_tokens: 100,
        session_id: 'session-123'
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    return data;

  } catch (error) {
    console.error('Request failed:', error.message);
    
    // Обработка конкретных ошибок
    if (error.message.includes('503')) {
      console.log('Gateway не доступен, пытаюсь переподключиться...');
    } else if (error.message.includes('timeout')) {
      console.log('Timeout, узел слишком медленный');
    }
    
    return null;
  }
}
```

---

## Интеграция в Electron

### IPC + HTTP

```javascript
// main.js
ipcMain.handle('send-message', async (event, message) => {
  try {
    const response = await fetch('http://87.106.255.55:8000/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: message,
        max_tokens: 100,
        session_id: 'session-' + Date.now()
      })
    });

    const data = await response.json();
    return { success: true, data };

  } catch (error) {
    return { success: false, error: error.message };
  }
});

// renderer.js
const result = await window.electronAPI.ipc.invoke('send-message', 'Hello!');
if (result.success) {
  console.log('AI Response:', result.data.response);
}
```

---

## Тестирование с Postman

### Import URL
```
http://87.106.255.55:8000
```

### Collection запросов
```json
{
  "info": {
    "name": "Noümind API",
    "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
  },
  "item": [
    {
      "name": "Send Message",
      "request": {
        "method": "POST",
        "url": {
          "raw": "http://87.106.255.55:8000/chat",
          "protocol": "http"
        },
        "body": {
          "mode": "raw",
          "raw": "{\"message\": \"What is AI?\", \"max_tokens\": 100}"
        }
      }
    },
    {
      "name": "Send Feedback",
      "request": {
        "method": "POST",
        "url": {
          "raw": "http://87.106.255.55:8000/feedback/session-123?signal=0.8&query_type=general"
        }
      }
    }
  ]
}
```

---

## Performance Tips

- **Batch requests**: Отправляйте несколько сообщений за раз
- **Reuse sessions**: Используйте один session_id для серии вопросов
- **Cache responses**: Кэшируйте часто задаваемые вопросы
- **Async operations**: Используйте async/await для неблокирующих операций

---

## Rate Limiting

Current limits (если установлены):
- Нет текущих ограничений
- Рекомендуется: max 1 сообщение в секунду
- Для batch: max 10 сообщений в минуту

---

**Для полной документации смотрите README.md и QUICKSTART.md**
