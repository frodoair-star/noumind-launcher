/**
 * Configuration для Noümind Launcher
 * Отредактируйте значения если нужно подключиться к другому Gateway
 */

module.exports = {
  // Gateway конфигурация
  gateway: {
    // Адрес основного Gateway (для chat и feedback)
    url: 'http://87.106.255.55:8000',

    // Список запасных Gateway (если основной недоступен)
    fallbacks: [
      'http://localhost:8000',
      'http://127.0.0.1:8000'
    ],

    // Timeout для запросов (мс)
    timeout: 30000,

    // Автоматическое переподключение
    autoReconnect: true,
    reconnectInterval: 5000
  },

  // Локальный узел
  node: {
    // Адрес локального узла
    apiUrl: 'http://localhost:9001',

    // Скрипт узла
    scriptPath: '~/noumind/node_gguf.py',

    // Параметры запуска
    layers: '0-7',
    port: 9001,
    name: 'node-a',

    // Проверка здоровья узла
    healthCheckInterval: 5000,
    healthCheckTimeout: 5000
  },

  // UI конфигурация
  ui: {
    // Размер окна (px)
    windowWidth: 1100,
    windowHeight: 700,

    // Обновление метрик
    metricsUpdateInterval: 5000,

    // Обновление COMPUTE токенов
    computeTokenInterval: 10000,
    computeTokenValue: 1.0,

    // Прокрутка сообщений
    autoScroll: true,

    // Максимальная длина сообщения
    maxMessageLength: 500
  },

  // Чат конфигурация
  chat: {
    // Максимальное количество токенов в ответе
    maxTokens: 100,

    // Температура генерации
    temperature: 0.7,

    // Top-p семплирование
    topP: 0.9
  },

  // Сессия
  session: {
    // Сохранять историю чата
    persistChat: true,

    // Файл для сохранения истории
    chatHistoryFile: '~/.noumind/chat-history.json'
  },

  // Логирование
  logging: {
    // Уровень логирования: 'debug', 'info', 'warn', 'error'
    level: 'info',

    // Сохранять логи в файл
    toFile: false,

    // Файл логов
    logFile: '~/.noumind/launcher.log'
  },

  // EFCT параметры (отправляются в feedback)
  efct: {
    // Testing Effect (обучение)
    learningRate: 0.1,

    // Zeno Effect (замораживание)
    freezingThreshold: 0.8,

    // Автоматический feedback
    autoFeedback: true,

    // Диапазон feedback сигнала
    feedbackMin: -1.0,
    feedbackMax: 1.0
  },

  // Feature flags
  features: {
    // Включить автоматический запуск узла
    autoStartNode: true,

    // Включить COM feedback
    enableCOMFeedback: true,

    // Включить специализацию узла
    trackSpecialization: true,

    // Показывать debug информацию
    showDebugInfo: false
  }
};
