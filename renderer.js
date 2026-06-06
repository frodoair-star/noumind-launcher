/* uNeuro — renderer.js
   Vanilla JS, работает в Electron renderer process.
   window.electronAPI предоставляется preload.js
*/

// ─────────────────────────────────────────
// СОСТОЯНИЕ
// ─────────────────────────────────────────
const GATEWAY = 'http://217.160.49.222:8002';
const NODE_URL = 'http://localhost:9002';

// ── Баланс из localStorage (приветственный бонус +10 при первом запуске) ──
function loadBalance() {
  if (!localStorage.getItem('balance_initialized')) {
    localStorage.setItem('balance_initialized', 'true');
    localStorage.setItem('balance', '10');
    return 10;
  }
  return parseFloat(localStorage.getItem('balance') || '0');
}
function saveBalance(v) { localStorage.setItem('balance', String(v)); }

let state = {
  view:          'dash',
  nodeOn:        false,
  balance:       loadBalance(),
  deltaToday:    0,
  spentToday:    0,
  requestsToday: 0,
  sessionEarned: 0,
  uptimeSec:     0,
  startedAt:     null,
  selectedMode:  'balanced',
  thinking:      false,
  hardware:      {},
  settings: { loadPercent: 40, layerStart: 11, intensity: 'Баланс', autostart: true, sleepMode: false, yieldChat: true },
  load:          { cpu: 6, gpu: 3, ram: 22, net: 4 },
  // chat
  threads:       [],
  activeId:      null,
  messages:      {},
};

function fmt(n, d = 2) {
  return (n || 0).toLocaleString('ru-RU', { minimumFractionDigits: d, maximumFractionDigits: d });
}
function el(id) { return document.getElementById(id); }

// ─────────────────────────────────────────
// I18N — интернационализация (ru / en / de)
// ─────────────────────────────────────────
const I18N = {
  ru: {
    'nav.dashboard':'Кабинет','nav.chat':'Чат с ИИ','sidebar.newChat':'Новый запрос','sidebar.history':'История',
    'balance.label':'Баланс · NEU','dash.welcome':'С возвращением, исследователь.','dash.balanceTokens':'Баланс токенов',
    'dash.minedToday':'Сегодня добыто','dash.spent':'Потрачено','dash.requests':'Запросов','dash.miningNode':'Узел добычи',
    'dash.miningSpeed':'Скорость добычи','dash.sessionMined':'Намайнено за сессию','dash.topology':'Топология сети',
    'dash.mining7d':'Добыча · 7 дней','dash.peakToday':'сегодня — пик ↗',
    'chat.help':'Чем помочь сегодня?','chat.eachReq':'КАЖДЫЙ ЗАПРОС ОПЛАЧИВАЕТСЯ ТОКЕНАМИ ν · МОДЕЛЬ: uNeuro-Core',
    'composer.autoPay':'оплата спишется автоматически из баланса узла →','composer.balance':'баланс','composer.placeholder':'Опишите задачу для ИИ…',
    'modal.loadTitle':'Нагрузка на систему','modal.currentLoad':'Текущая нагрузка','meter.cpu':'Процессор','meter.gpu':'Видеоядро',
    'meter.ram':'Память','meter.net':'Сеть','modal.limits':'Лимиты ресурсов','modal.systemLoad':'Нагрузка на систему','modal.estimate':'Оценка',
    'est.layers':'Слои','est.income':'Доход','est.speed':'Скорость','modal.intensity':'Интенсивность добычи',
    'intensity.eco':'Эконом','intensity.balance':'Баланс','intensity.max':'Максимум','modal.nodeBehavior':'Поведение узла',
    'beh.autostart':'Запускать узел при старте системы','beh.autostartSub':'АВТОЗАПУСК ФОНОВОЙ ДОБЫЧИ',
    'beh.night':'Максимальная нагрузка пока сплю','beh.nightSub':'23:00–7:00 · НОЧНОЙ РЕЖИМ',
    'beh.yield':'Снижать нагрузку во время запросов к ИИ','beh.yieldSub':'ПРИОРИТЕТ ОТЗЫВЧИВОСТИ ЧАТА',
    'btn.close':'Закрыть','btn.apply':'Применить настройки','onboarding.welcome':'Добро пожаловать в uNeuro',
    'onboarding.subtitle':'Настраиваю твой узел сети. Это займёт пару минут.',
    'node.active':'Узел активен','node.stopped':'Узел остановлен','node.starting':'Запускаю…',
    'badge.active':'активен','badge.stopped':'остановлен','badge.starting':'запускаю…',
    'main.dashTitle':'Личный кабинет','main.dashSub':'УПРАВЛЕНИЕ УЗЛОМ И ТОКЕНАМИ','main.chatTitle':'Диалог с ИИ',
    'main.chatSub':'МОДЕЛЬ: uNeuro-Core · РАСПРЕДЕЛЁННЫЙ ИНФЕРЕНС',
    'title.active':'uNeuro · узел активен · добыча идёт','title.idle':'uNeuro · узел в простое',
    'mode.fast':'⚡ Быстро — 10 ν','mode.balanced':'⚖️ Баланс — 4 ν','mode.economy':'🐢 Экономно — 1 ν',
    'update.downloading':'Доступно обновление — скачиваю...','update.ready':'Обновление готово','update.install':'Установить и перезапустить',
  },
  en: {
    'nav.dashboard':'Dashboard','nav.chat':'AI Chat','sidebar.newChat':'New request','sidebar.history':'History',
    'balance.label':'Balance · NEU','dash.welcome':'Welcome back, researcher.','dash.balanceTokens':'Token balance',
    'dash.minedToday':'Mined today','dash.spent':'Spent','dash.requests':'Requests','dash.miningNode':'Mining node',
    'dash.miningSpeed':'Mining speed','dash.sessionMined':'Mined this session','dash.topology':'Network topology',
    'dash.mining7d':'Mining · 7 days','dash.peakToday':'today — peak ↗',
    'chat.help':'How can I help today?','chat.eachReq':'EACH REQUEST IS PAID IN ν TOKENS · MODEL: uNeuro-Core',
    'composer.autoPay':'payment is deducted automatically from the node balance →','composer.balance':'balance','composer.placeholder':'Describe a task for the AI…',
    'modal.loadTitle':'System load','modal.currentLoad':'Current load','meter.cpu':'Processor','meter.gpu':'GPU',
    'meter.ram':'Memory','meter.net':'Network','modal.limits':'Resource limits','modal.systemLoad':'System load','modal.estimate':'Estimate',
    'est.layers':'Layers','est.income':'Income','est.speed':'Speed','modal.intensity':'Mining intensity',
    'intensity.eco':'Eco','intensity.balance':'Balance','intensity.max':'Maximum','modal.nodeBehavior':'Node behavior',
    'beh.autostart':'Launch node at system startup','beh.autostartSub':'AUTOSTART BACKGROUND MINING',
    'beh.night':'Maximum load while I sleep','beh.nightSub':'23:00–7:00 · NIGHT MODE',
    'beh.yield':'Reduce load during AI requests','beh.yieldSub':'CHAT RESPONSIVENESS PRIORITY',
    'btn.close':'Close','btn.apply':'Apply settings','onboarding.welcome':'Welcome to uNeuro',
    'onboarding.subtitle':'Setting up your network node. This will take a couple of minutes.',
    'node.active':'Node active','node.stopped':'Node stopped','node.starting':'Starting…',
    'badge.active':'active','badge.stopped':'stopped','badge.starting':'starting…',
    'main.dashTitle':'Dashboard','main.dashSub':'NODE & TOKEN MANAGEMENT','main.chatTitle':'AI Dialogue',
    'main.chatSub':'MODEL: uNeuro-Core · DISTRIBUTED INFERENCE',
    'title.active':'uNeuro · node active · mining','title.idle':'uNeuro · node idle',
    'mode.fast':'⚡ Fast — 10 ν','mode.balanced':'⚖️ Balanced — 4 ν','mode.economy':'🐢 Economy — 1 ν',
    'update.downloading':'Update available — downloading...','update.ready':'Update ready','update.install':'Install and restart',
  },
  de: {
    'nav.dashboard':'Übersicht','nav.chat':'KI-Chat','sidebar.newChat':'Neue Anfrage','sidebar.history':'Verlauf',
    'balance.label':'Guthaben · NEU','dash.welcome':'Willkommen zurück, Forscher.','dash.balanceTokens':'Token-Guthaben',
    'dash.minedToday':'Heute geschürft','dash.spent':'Ausgegeben','dash.requests':'Anfragen','dash.miningNode':'Mining-Knoten',
    'dash.miningSpeed':'Mining-Geschwindigkeit','dash.sessionMined':'Diese Sitzung geschürft','dash.topology':'Netzwerk-Topologie',
    'dash.mining7d':'Mining · 7 Tage','dash.peakToday':'heute — Spitze ↗',
    'chat.help':'Wie kann ich heute helfen?','chat.eachReq':'JEDE ANFRAGE WIRD IN ν-TOKEN BEZAHLT · MODELL: uNeuro-Core',
    'composer.autoPay':'Die Zahlung wird automatisch vom Knoten-Guthaben abgezogen →','composer.balance':'Guthaben','composer.placeholder':'Beschreibe eine Aufgabe für die KI…',
    'modal.loadTitle':'Systemlast','modal.currentLoad':'Aktuelle Last','meter.cpu':'Prozessor','meter.gpu':'Grafikkern',
    'meter.ram':'Speicher','meter.net':'Netzwerk','modal.limits':'Ressourcenlimits','modal.systemLoad':'Systemlast','modal.estimate':'Schätzung',
    'est.layers':'Schichten','est.income':'Einkommen','est.speed':'Geschw.','modal.intensity':'Mining-Intensität',
    'intensity.eco':'Sparsam','intensity.balance':'Balance','intensity.max':'Maximum','modal.nodeBehavior':'Knoten-Verhalten',
    'beh.autostart':'Knoten beim Systemstart starten','beh.autostartSub':'HINTERGRUND-MINING AUTOSTART',
    'beh.night':'Maximale Last, während ich schlafe','beh.nightSub':'23:00–7:00 · NACHTMODUS',
    'beh.yield':'Last bei KI-Anfragen reduzieren','beh.yieldSub':'CHAT-REAKTIONSPRIORITÄT',
    'btn.close':'Schließen','btn.apply':'Einstellungen anwenden','onboarding.welcome':'Willkommen bei uNeuro',
    'onboarding.subtitle':'Dein Netzwerkknoten wird eingerichtet. Das dauert ein paar Minuten.',
    'node.active':'Knoten aktiv','node.stopped':'Knoten gestoppt','node.starting':'Starte…',
    'badge.active':'aktiv','badge.stopped':'gestoppt','badge.starting':'startet…',
    'main.dashTitle':'Übersicht','main.dashSub':'KNOTEN- & TOKEN-VERWALTUNG','main.chatTitle':'KI-Dialog',
    'main.chatSub':'MODELL: uNeuro-Core · VERTEILTE INFERENZ',
    'title.active':'uNeuro · Knoten aktiv · Mining läuft','title.idle':'uNeuro · Knoten im Leerlauf',
    'mode.fast':'⚡ Schnell — 10 ν','mode.balanced':'⚖️ Balance — 4 ν','mode.economy':'🐢 Sparsam — 1 ν',
    'update.downloading':'Update verfügbar — wird geladen...','update.ready':'Update bereit','update.install':'Installieren und neu starten',
  },
};

let currentLang = localStorage.getItem('lang') || 'ru';
function t(key) { return (I18N[currentLang] && I18N[currentLang][key]) || (I18N.ru[key]) || key; }

function applyLanguage(lang) {
  currentLang = (I18N[lang] ? lang : 'ru');
  localStorage.setItem('lang', currentLang);
  document.documentElement.lang = currentLang;

  // Статические элементы
  document.querySelectorAll('[data-i18n]').forEach(elm => {
    const k = elm.getAttribute('data-i18n');
    if (I18N[currentLang][k]) elm.textContent = I18N[currentLang][k];
  });
  document.querySelectorAll('[data-i18n-ph]').forEach(elm => {
    const k = elm.getAttribute('data-i18n-ph');
    if (I18N[currentLang][k]) elm.placeholder = I18N[currentLang][k];
  });

  // Кнопки режимов чата
  if (el('modeFast'))     el('modeFast').textContent     = t('mode.fast');
  if (el('modeBalanced')) el('modeBalanced').textContent = t('mode.balanced');
  if (el('modeEconomy'))  el('modeEconomy').textContent  = t('mode.economy');

  // Селектор языка
  if (el('langSelect')) el('langSelect').value = currentLang;

  // Перерисовываем динамические строки
  if (typeof setView === 'function') setView(state.view);
  if (typeof updateNodeUI === 'function') updateNodeUI(state.nodeOn ? 'on' : 'off');
}

function setLanguage(lang) { applyLanguage(lang); }

function pickLanguage(lang) {
  applyLanguage(lang);
  localStorage.setItem('lang_chosen', 'true');
  if (el('langPicker')) el('langPicker').style.display = 'none';
}

// ─────────────────────────────────────────
// TITLEBAR BUTTONS
// ─────────────────────────────────────────
el('btnClose').addEventListener('click', () => window.electronAPI.closeWindow());
el('btnMin').addEventListener('click',   () => window.electronAPI.minimizeWindow());
el('btnMax').addEventListener('click',   () => window.electronAPI.maximizeWindow());

// ─────────────────────────────────────────
// VIEW SWITCHING
// ─────────────────────────────────────────
function setView(v) {
  state.view = v;
  el('viewDash').style.display = v === 'dash' ? 'block' : 'none';
  el('viewChat').style.display = v === 'chat' ? 'flex'  : 'none';
  // Переинициализируем canvas когда он становится видимым
  if (v === 'dash') setTimeout(() => { initTopoCanvas(); }, 50);
  el('navDash').classList.toggle('active', v === 'dash');
  el('navChat').classList.toggle('active', v === 'chat');
  el('mainTitle').textContent = v === 'dash' ? t('main.dashTitle') : t('main.chatTitle');
  el('mainSub').textContent   = v === 'dash' ? t('main.dashSub') : t('main.chatSub');
  // swap head button icon
  el('headBtn').innerHTML = v === 'dash'
    ? `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="1.6"/><line x1="12" y1="12" x2="16.5" y2="8.5"/></svg>`
    : `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><rect x="3.5" y="3.5" width="7" height="7"/><rect x="13.5" y="3.5" width="7" height="7"/><rect x="3.5" y="13.5" width="7" height="7"/><rect x="13.5" y="13.5" width="7" height="7"/></svg>`;
}
function headBtnClick() {
  if (state.view === 'dash') openLoad(); else setView('dash');
}

// ─────────────────────────────────────────
// NODE TOGGLE
// ─────────────────────────────────────────
function toggleNode() {
  const shouldStart = !state.nodeOn;
  window.electronAPI.toggleNode(shouldStart);
  if (shouldStart) updateNodeUI('loading');
}

function updateNodeUI(status) {
  const on = status === 'on';
  state.nodeOn = on;

  // titlebar dot
  el('titleDot').className = 'dot' + (on ? '' : ' off');
  el('titleText').textContent = on ? t('title.active') : t('title.idle');

  // sidebar mini
  el('nodeMini').classList.toggle('on', on);
  el('nodeMiniText').textContent = on ? t('node.active') : (status === 'loading' ? t('node.starting') : t('node.stopped'));

  // brand glyph center color
  const brandC = el('brandCenter');
  if (brandC) {
    brandC.style.fill = on ? 'var(--sanguine-wash)' : 'var(--panel)';
    brandC.style.stroke = on ? 'var(--sanguine)' : 'var(--blue-deep)';
  }

  // dashboard badge + button
  const badge = el('nodeBadge');
  if (badge) {
    badge.className = 'badge' + (on ? ' on' : '');
    el('nodeBadgeText').textContent = on ? t('badge.active') : (status === 'loading' ? t('badge.starting') : t('badge.stopped'));
  }
  const btn = el('dashToggleBtn');
  if (btn) {
    btn.className = 'btn' + (on ? ' stop' : '');
    const stopIcon = `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><rect x="6" y="6" width="12" height="12" rx="1.5"/></svg>`;
    const playIcon = `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><line x1="12" y1="3.5" x2="12" y2="12"/><path d="M7 6.5a8 8 0 1 0 10 0"/></svg>`;
    const btnLabel = on
      ? ({ ru:'Остановить узел', en:'Stop node', de:'Knoten stoppen' }[currentLang] || 'Stop node')
      : ({ ru:'Запустить узел',  en:'Start node', de:'Knoten starten' }[currentLang] || 'Start node');
    btn.innerHTML = (on ? stopIcon : playIcon) + ' ' + btnLabel;
  }
  el('nodeOffMsg').style.display   = on ? 'none' : 'block';
  el('nodeLiveGrid').style.display = on ? 'grid' : 'none';
  el('netStatus').textContent      = on ? '● передача данных' : '○ ожидание';
  el('netStatus').style.color      = on ? 'var(--sanguine)' : 'var(--ink-faint)';
  el('modalNodeId').textContent    = on ? 'РЕЖИМ ДОБЫЧИ АКТИВЕН' : 'ПРОСТОЙ';

  // network schematic self-node
  const selfNode = document.querySelector('.net-node.self');
  if (selfNode) selfNode.classList.toggle('on', on);

  if (on && !state.startedAt) {
    state.startedAt   = Date.now();
    state.uptimeSec   = 0;
    state.sessionEarned = 0;
    sessionStart      = Date.now();   // сброс таймера для скорости добычи
  }
  if (!on) { state.startedAt = null; }
}

// ─────────────────────────────────────────
// UPTIME & MINING TICK
// ─────────────────────────────────────────
setInterval(() => {
  if (!state.nodeOn) return;
  state.uptimeSec++;
  const h = Math.floor(state.uptimeSec / 3600);
  const m = Math.floor((state.uptimeSec % 3600) / 60);
  const s = Math.floor(state.uptimeSec % 60);
  const pad = n => String(n).padStart(2, '0');
  el('dashUptime').textContent = `↑ ${pad(h)}:${pad(m)}:${pad(s)}`;

  // accrue tokens
  const INTENSITY = { 'Эконом': 0.55, 'Баланс': 1, 'Максимум': 1.7 };
  const mult = INTENSITY[state.settings.intensity] || 1;
  const pct  = state.settings.loadPercent / 100;
  const perSec = 0.9 * mult * pct / 60;
  state.balance       += perSec;
  state.sessionEarned += perSec;
  state.deltaToday    += perSec;
  updateBalanceDisplay();

  // live grid — tasks_done берётся из EFCT polling, mining speed считается реально
  if (el('liveSession')) el('liveSession').innerHTML = `+${fmt(state.sessionEarned)} <small>ν</small>`;
  // liveContrib и liveMining обновляются в updateEfctStats()
}, 1000);

// ─────────────────────────────────────────
// РЕАЛЬНЫЕ МЕТРИКИ — опрашиваем /metrics у ноды
// ─────────────────────────────────────────
let _prevNetMB = null;
let _prevNetTs = null;
setInterval(async () => {
  try {
    const m = await fetch(`${NODE_URL}/metrics`, { signal: AbortSignal.timeout(1500) }).then(r => r.json());

    // Сеть: MB/s → процент (5 MB/s = 100%)
    const netNow = (m.net_sent_mb || 0) + (m.net_recv_mb || 0);
    const tsNow  = Date.now();
    let netPct = state.load.net;
    if (_prevNetMB !== null && _prevNetTs !== null) {
      const dtSec  = (tsNow - _prevNetTs) / 1000;
      const mbps   = Math.abs(netNow - _prevNetMB) / Math.max(dtSec, 0.1);
      netPct = Math.min(95, mbps * 20);  // 5 MB/s → 100%
    }
    _prevNetMB = netNow;
    _prevNetTs = tsNow;

    // GPU: на Apple M1/MPS оцениваем через inference_active + cpu
    const gpuEst = m.inference_active
      ? Math.min(95, (m.cpu || 0) * 1.15)
      : Math.min(30, (m.cpu || 0) * 0.3);

    state.load = {
      cpu: m.cpu        ?? state.load.cpu,
      ram: m.ram_percent ?? state.load.ram,
      gpu: gpuEst,
      net: netPct,
    };
    updateMeters();
  } catch {
    // Нода недоступна — не обновляем
  }
}, 2000);

function updateMeters() {
  const set = (id, trackId, v) => {
    const pctEl = el(id); if (pctEl) pctEl.textContent = Math.round(v) + '%';
    const fill = el(id + 'Fill'); if (fill) fill.style.width = v + '%';
    const track = el(trackId);
    if (track) track.className = 'track' + (v > 80 ? ' hot' : '');
  };
  set('mCpu', 'mCpuTrack', state.load.cpu);
  set('mGpu', 'mGpuTrack', state.load.gpu);
  if (el('mRam'))    el('mRam').textContent    = Math.round(state.load.ram) + '%';
  if (el('mRamFill'))el('mRamFill').style.width = state.load.ram + '%';
  if (el('mNet'))    el('mNet').textContent    = Math.round(state.load.net) + '%';
  if (el('mNetFill'))el('mNetFill').style.width = state.load.net + '%';
}

// ─────────────────────────────────────────
// BALANCE DISPLAY
// ─────────────────────────────────────────
function updateBalanceDisplay() {
  const b = state.balance;
  const f = fmt(b);
  saveBalance(b);

  if (el('sbBalance'))   el('sbBalance').textContent   = f;
  if (el('sbDelta'))     el('sbDelta').textContent     = `сегодня +${fmt(state.deltaToday)} ν`;
  if (el('dashBalance')) el('dashBalance').textContent = f;
  if (el('dashDelta'))   el('dashDelta').textContent   = `+${fmt(state.deltaToday)} ν`;
  if (el('dashSpent'))   el('dashSpent').textContent   = `−${fmt(state.spentToday, 0)} ν`;
  if (el('dashReqs'))    el('dashReqs').textContent    = state.requestsToday;
  if (el('dashUsd'))     el('dashUsd').textContent     = `≈ ${fmt(b * 0.018, 2)} $`;
  if (el('headBalance')) el('headBalance').textContent = f;
  if (el('composerBal')) el('composerBal').textContent = fmt(b, 0);

  // Баннер и блокировка кнопки при низком балансе
  const banner = el('balanceBanner');
  const sendBtn = el('chatSendBtn');
  if (b < -5) {
    if (banner) { banner.style.display = 'flex'; el('balanceBannerText').textContent = 'Недостаточно NEU — запусти узел для заработка'; }
    if (sendBtn) { sendBtn.disabled = true; sendBtn.title = 'Недостаточно токенов'; }
  } else if (b < 0) {
    if (banner) { banner.style.display = 'flex'; el('balanceBannerText').textContent = 'Пополни баланс или обработай больше запросов'; }
    if (sendBtn) { sendBtn.disabled = false; sendBtn.title = ''; }
  } else {
    if (banner) banner.style.display = 'none';
    if (sendBtn) { sendBtn.disabled = false; sendBtn.title = ''; }
  }
}

// ─────────────────────────────────────────
// CANVAS TOPOLOGY — живая топология сети
// ─────────────────────────────────────────

// Цвета из CSS переменных (blueprint тема)
const C = {
  line:    'oklch(0.640 0.040 246)',
  node:    'oklch(0.560 0.072 250)',
  self:    'oklch(0.585 0.105 38)',
  selfFill:'oklch(0.910 0.030 42)',
  pulse:   '#d98a6a',
  text:    'oklch(0.430 0.072 254)',
  bg:      'oklch(0.920 0.014 244)',
};

// Цвета MoE-категорий
const CATEGORY_COLORS = {
  code:     '#3b82f6',  // синий
  science:  '#10b981',  // зелёный
  history:  '#f59e0b',  // жёлтый
  creative: '#8b5cf6',  // фиолетовый
  general:  '#6b7280',  // серый
};

// Глобальное состояние топологии
let topoCtx    = null;
let topoNodes  = [];   // [{ x, y, id, isSelf, spec }]
let topoAnims  = [];   // активные анимации передачи данных
let netPeers   = 0;    // реальное число пиров
let mySpec     = 'general';  // специализация нашего узла
let expertMap  = {};   // spec → [{id, score, is_fallback}]

function initTopoCanvas() {
  const cvs = el('netCanvas');
  if (!cvs || !(cvs instanceof HTMLCanvasElement)) return;
  const dpr = window.devicePixelRatio || 1;
  const w   = cvs.offsetWidth  || 300;
  const h   = cvs.offsetHeight || 210;
  cvs.width  = w * dpr;
  cvs.height = h * dpr;
  topoCtx = cvs.getContext('2d');
  topoCtx.scale(dpr, dpr);
  buildTopoPeers(w, h, []);
  drawTopo();
}

function buildTopoPeers(w, h, workers) {
  const cx = w * 0.5, cy = h * 0.5;
  const r  = Math.min(w, h) * 0.37;

  // Всегда показываем 6 позиций (реальные + заглушки)
  const slots = 6;
  const wIds  = Object.keys(workers || {}).slice(0, slots);

  topoNodes = [];
  // gateway-node (VPS) — сверху
  topoNodes.push({ x: cx, y: cy - r * 0.7, id: 'VPS', isSelf: false, isGw: true });

  for (let i = 0; i < slots; i++) {
    const angle = (i / slots) * Math.PI * 2 - Math.PI / 2;
    const px = cx + r * Math.cos(angle);
    const py = cy + r * Math.sin(angle);
    const wid = wIds[i] ? wIds[i].slice(-3) : `·${i+1}`;
    topoNodes.push({ x: px, y: py, id: wid, isSelf: i === 0 && wIds[i] });
  }

  // Центральный узел — мы сами (раскрашен по специализации)
  topoNodes.push({ x: cx, y: cy, id: 'узел', isSelf: true, spec: mySpec });
}

function drawTopo() {
  const cvs = el('netCanvas');
  if (!topoCtx || !cvs) return;
  const w = cvs.offsetWidth || 300, h = cvs.offsetHeight || 210;

  topoCtx.clearRect(0, 0, w, h);

  const self = topoNodes.find(n => n.isSelf && n.id === 'узел');
  if (!self) return;

  // Линии от центра ко всем узлам
  topoNodes.forEach(n => {
    if (n === self) return;
    topoCtx.beginPath();
    topoCtx.moveTo(self.x, self.y);
    topoCtx.lineTo(n.x, n.y);
    topoCtx.strokeStyle = n.isGw ? C.self : C.line;
    topoCtx.lineWidth   = n.isGw ? 1.2 : 0.8;
    topoCtx.setLineDash(n.isGw ? [] : [4, 5]);
    topoCtx.stroke();
    topoCtx.setLineDash([]);
  });

  // Узлы
  topoNodes.forEach(n => {
    const isMe  = n.isSelf && n.id === 'узел';
    const r     = isMe ? 11 : n.isGw ? 9 : 7;
    // Цвет нашего узла = специализация (MoE); VPS = sanguine; пиры = серый/синий
    const specColor = isMe ? (CATEGORY_COLORS[n.spec] || C.node) : null;
    const fill = isMe ? (state.nodeOn && specColor ? specColor : 'white') : 'white';
    const str  = isMe ? (state.nodeOn && specColor ? specColor : C.node) : (n.isGw ? C.self : C.node);
    topoCtx.beginPath();
    topoCtx.arc(n.x, n.y, r, 0, Math.PI * 2);
    topoCtx.fillStyle   = fill;
    topoCtx.strokeStyle = str;
    topoCtx.lineWidth   = 1.5;
    topoCtx.fill();
    topoCtx.stroke();

    topoCtx.fillStyle   = C.text;
    topoCtx.font        = '8px "IBM Plex Mono", monospace';
    topoCtx.textAlign   = 'center';
    topoCtx.textBaseline= 'middle';
    topoCtx.fillText(n.id, n.x, n.y);
  });

  // Анимации передачи данных
  const now    = performance.now();
  topoAnims    = topoAnims.filter(a => now - a.start < a.duration);
  topoAnims.forEach(a => {
    const t  = Math.max(0, Math.min(1, (now - a.start) / a.duration));
    const px = a.from.x + (a.to.x - a.from.x) * t;
    const py = a.from.y + (a.to.y - a.from.y) * t;
    const alpha = Math.sin(t * Math.PI);
    topoCtx.beginPath();
    topoCtx.arc(px, py, a.r || 6, 0, Math.PI * 2);
    topoCtx.fillStyle = `rgba(217,138,106,${alpha.toFixed(2)})`;
    topoCtx.shadowBlur = 8;
    topoCtx.shadowColor = C.pulse;
    topoCtx.fill();
    topoCtx.shadowBlur = 0;
  });

  if (topoAnims.length > 0) requestAnimationFrame(drawTopo);
}

function animateDataTransfer() {
  // Если canvas не готов — инициализируем и пробуем через 200мс
  if (!topoCtx) {
    initTopoCanvas();
    setTimeout(animateDataTransfer, 200);
    return;
  }
  const self = topoNodes.find(n => n.isSelf && n.id === 'узел');
  const gw   = topoNodes.find(n => n.isGw);
  if (!self || !gw) { console.log('[Topo] нет узлов для анимации, rebuilding...'); initTopoCanvas(); return; }

  console.log('[Topo] animating... self=', self.x, self.y, 'gw=', gw.x, gw.y);
  // узел → VPS (800ms) затем VPS → узел (800ms)
  topoAnims.push({ from: self, to: gw,   start: performance.now(),       duration: 800, r: 6 });
  topoAnims.push({ from: gw,   to: self, start: performance.now() + 900, duration: 800, r: 6 });
  requestAnimationFrame(drawTopo);
}

// Обновляем топологию из /network каждые 15 сек
async function updateTopology() {
  try {
    const net = await fetch(`${GATEWAY}/network`, { signal: AbortSignal.timeout(5000) }).then(r => r.json());
    netPeers  = net.active_workers || 0;
    expertMap = net.expert_map || {};

    // Находим специализацию НАШЕГО узла (по совпадению hostname)
    mySpec = 'general';
    for (const [spec, nodes] of Object.entries(expertMap)) {
      if (nodes.some(n => (n.id || '').toLowerCase().includes('macbook') || (n.id || '').includes('user'))) {
        mySpec = spec; break;
      }
    }

    // Карта worker→spec для раскраски пиров
    const workerSpecs = {};
    for (const [spec, nodes] of Object.entries(expertMap)) {
      nodes.forEach(n => { workerSpecs[n.id] = spec; });
    }

    if (el('dashSub')) {
      const specLabel = mySpec !== 'general' ? ` · 🎯 ${mySpec}` : '';
      el('dashSub').textContent = `УЗЕЛ · СЕТЬ uNeuro · ${netPeers} пир${netPeers === 1 ? '' : 'ов'}${specLabel}`;
    }

    const cvs = el('netCanvas');
    const w = cvs?.offsetWidth || 300, h = cvs?.offsetHeight || 210;
    buildTopoPeers(w, h, workerSpecs);
    drawTopo();
    renderExpertLegend();

    if (el('netStatus')) {
      el('netStatus').textContent = (net.router_active ? '⚡ MoE Router · ' : '') + (state.nodeOn ? `${netPeers} активных` : 'ожидание');
      el('netStatus').style.color = state.nodeOn ? 'var(--sanguine)' : 'var(--ink-faint)';
    }
  } catch {}
}

// Легенда категорий поверх топологии
function renderExpertLegend() {
  let legend = el('expertLegend');
  if (!legend) {
    const card = el('netCanvas')?.parentElement;
    if (!card) return;
    legend = document.createElement('div');
    legend.id = 'expertLegend';
    legend.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;margin-top:8px;font-family:var(--font-mono);font-size:9px;color:var(--ink-faint);';
    card.appendChild(legend);
  }
  const labels = { code:'🔵 Code', science:'🟢 Science', history:'🟡 History', creative:'🟣 Creative', general:'⚫ General' };
  legend.innerHTML = Object.entries(labels).map(([cat, lbl]) => {
    const count = (expertMap[cat] || []).length;
    const active = count > 0 ? 'opacity:1;font-weight:600;' : 'opacity:0.4;';
    return `<span style="${active}">${lbl}${count ? ` ·${count}` : ''}</span>`;
  }).join('');
}
setInterval(updateTopology, 15000);

// Перестраиваем canvas при изменении размера окна
window.addEventListener('resize', () => { initTopoCanvas(); updateTopology(); });

function buildNet() { initTopoCanvas(); updateTopology(); }

// ─────────────────────────────────────────
// BAR CHART
// ─────────────────────────────────────────
function buildChart() {
  const wrap = el('chartBars');
  if (!wrap) return;
  const tasksDone = parseInt(el('efctTasksDone')?.textContent || '0');
  const todayVal  = Math.min(100, tasksDone * 8 + 20);
  const base = [42, 58, 31, 74, 49, 66];
  const bars = [...base, todayVal];
  const max  = Math.max(...bars);
  const days = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
  wrap.innerHTML = '';
  bars.forEach((b, i) => {
    const bw = document.createElement('div');
    bw.className = 'bar-wrap';
    bw.innerHTML = `
      <div class="bar${i === bars.length - 1 ? ' today' : ''}" style="height:${(b / max * 100)}%"></div>
      <span class="bx">${days[i]}</span>`;
    wrap.appendChild(bw);
  });
}

// ─────────────────────────────────────────
// NODE HEALTH POLLING
// ─────────────────────────────────────────
let lastNodeState = null;
setInterval(async () => {
  try {
    const r = await fetch(`${NODE_URL}/health`);
    if (r.ok) {
      const d = await r.json();
      const isReady = d.status === 'ready' || d.status === 'learning';
      if (isReady !== lastNodeState) {
        lastNodeState = isReady;
        updateNodeUI(isReady ? 'on' : 'off');
      }
    }
  } catch {
    if (lastNodeState !== false) { lastNodeState = false; updateNodeUI('off'); }
  }
}, 1000);

// ─────────────────────────────────────────
// EFCT STATS POLLING
// ─────────────────────────────────────────
let prevTasksDone  = 0;
let sessionStart   = Date.now();   // момент запуска узла (для скорости добычи)

setInterval(async () => {
  try {
    const r = await fetch(`${NODE_URL}/stats`);
    if (!r.ok) return;
    const d = await r.json();
    const adapt   = d.adaptation    ?? 0;
    const tasks   = d.tasks_done    ?? 0;
    const gates   = d.gates_nonzero ?? 0;
    const base    = d.baseline      ?? 0;
    const tier    = d.tier          ?? 'slow_cpu';
    const growing = tasks > prevTasksDone || d.status === 'learning';
    prevTasksDone = tasks;

    // Реальная скорость добычи: ν заработанных / минут работы
    const minutesOn = state.nodeOn ? Math.max(0.1, (Date.now() - sessionStart) / 60000) : 0;
    const miningSpeed = minutesOn > 0 ? (state.sessionEarned / minutesOn).toFixed(2) : '0.00';

    // Обновляем live-grid (видно только когда узел активен)
    if (el('liveContrib')) el('liveContrib').textContent = tasks;
    if (el('liveMining'))  el('liveMining').innerHTML    = `${miningSpeed} <small>ν/мин</small>`;

    if (el('efctAdaptation'))   el('efctAdaptation').textContent   = adapt.toFixed(6);
    if (el('efctTasksDone'))    el('efctTasksDone').textContent    = tasks;
    if (el('efctGatesNonzero')) el('efctGatesNonzero').textContent = `${gates}/2048`;
    if (el('efctBaseline'))     el('efctBaseline').textContent     = base.toFixed(6);
    if (el('efctStatus')) {
      const labels = { gpu: '🟢 GPU', fast_cpu: '🟡 Fast CPU', slow_cpu: '🔴 CPU' };
      const tl = labels[tier] || tier;
      el('efctStatus').textContent = growing
        ? `🧠 обучаюсь… · ${tl}`
        : (tasks > 0 ? `✓ обучен · ${tl}` : `⏳ ожидание · ${tl}`);
    }
    if (el('dashSub') && netPeers === 0) {
      // Обновляем только если updateTopology ещё не установил значение
      el('dashSub').textContent = `УЗЕЛ · СЕТЬ uNeuro · ожидание данных сети…`;
    }
    buildChart();
  } catch {}
}, 5000);

// ─────────────────────────────────────────
// CHAT
// ─────────────────────────────────────────
function computeCost(text) {
  return Math.min(240, Math.max(8, Math.round(text.trim().length * 0.42 + 6)));
}

function newChat() {
  const id = 'c' + Date.now();
  state.threads.unshift({ id, title: 'Новый запрос', date: 'сейчас', cost: 0 });
  state.messages[id] = [];
  state.activeId = id;
  setView('chat');
  renderHistory();
  renderMessages();
}

function openThread(id) {
  state.activeId = id;
  setView('chat');
  renderMessages();
}

function renderHistory() {
  const hist = el('histList');
  if (!hist) return;
  hist.innerHTML = '';
  state.threads.forEach(t => {
    const item = document.createElement('div');
    item.className = 'hist-item' + (state.view === 'chat' && t.id === state.activeId ? ' active' : '');
    item.innerHTML = `
      <div class="ht">${t.title}</div>
      <div class="hm">
        <span class="hd">${t.date}</span>
        <span class="hcost">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><polyline points="13,3 5,13 11,13 10,21 19,10 13,10 13,3"/></svg>
          ${t.cost} ν
        </span>
      </div>`;
    item.onclick = () => openThread(t.id);
    hist.appendChild(item);
  });
}

function renderMessages() {
  const msgs = state.messages[state.activeId] || [];
  const empty = el('chatEmpty');
  const inner = el('chatMessages');
  if (!inner) return;
  if (msgs.length === 0 && !state.thinking) {
    empty.style.display = 'flex'; inner.style.display = 'none';
  } else {
    empty.style.display = 'none'; inner.style.display = 'flex';
    inner.innerHTML = '';
    msgs.forEach(m => inner.appendChild(buildBubble(m)));
    if (state.thinking) inner.appendChild(buildThinking());
    inner.scrollTop = inner.scrollHeight;
  }
}

function buildBubble(m) {
  const wrap = document.createElement('div');
  wrap.className = 'msg ' + m.role;
  if (m.role === 'user') {
    wrap.innerHTML = `
      <div class="body">
        <div class="who"><span class="msg-cost">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><polyline points="13,3 5,13 11,13 10,21 19,10 13,10 13,3"/></svg>
          −${m.cost} ν</span> вы
        </div>
        <div class="bubble">${escHtml(m.text)}</div>
      </div>`;
  } else {
    const tokInfo = m.streaming ? '' : `<span style="color:var(--ink-faint)">· ${m.tokensOut || 0} ток. вывода</span>`;
    const cursor  = m.streaming ? '<span class="typing-cursor"></span>' : '';
    const paras   = (m.text || '').split('\n\n').map(p =>
      `<p>${escHtml(p).replace(/`([^`]+)`/g, '<code>$1</code>')}</p>`
    ).join('');
    wrap.innerHTML = `
      <div class="ava">
        <svg width="18" height="18" viewBox="0 0 40 40">
          <circle cx="20" cy="20" r="18.5" fill="var(--panel)" stroke="var(--ink)" stroke-width="1"/>
          <line x1="20" y1="20" x2="20" y2="8" stroke="var(--line)" stroke-width="1"/>
          <line x1="20" y1="20" x2="30.4" y2="26" stroke="var(--line)" stroke-width="1"/>
          <line x1="20" y1="20" x2="9.6" y2="26" stroke="var(--line)" stroke-width="1"/>
          <circle cx="20" cy="8" r="3" fill="var(--blue-wash)" stroke="var(--blue)" stroke-width="1.3"/>
          <circle cx="30.4" cy="26" r="3" fill="var(--blue-wash)" stroke="var(--blue)" stroke-width="1.3"/>
          <circle cx="9.6" cy="26" r="3" fill="var(--blue-wash)" stroke="var(--blue)" stroke-width="1.3"/>
          <circle cx="20" cy="20" r="4.2" fill="var(--sanguine-wash)" stroke="var(--sanguine)" stroke-width="1.5"/>
        </svg>
      </div>
      <div class="body">
        <div class="who">uNeuro · ядро ${tokInfo}</div>
        <div class="bubble">${paras}${cursor}</div>
      </div>`;
    if (m.computeCost) {
      const meta = document.createElement('div');
      meta.style.cssText = 'font-family:var(--font-mono);font-size:10px;color:var(--ink-faint);margin-top:4px;padding-left:45px;';
      meta.textContent = `Стоимость: ${m.computeCost} COMPUTE · ${m.tierLabel || ''} · ${m.priority || ''}`;
      wrap.appendChild(meta);
    }
  }
  return wrap;
}

function buildThinking() {
  const wrap = document.createElement('div');
  wrap.className = 'msg assistant';
  wrap.innerHTML = `
    <div class="ava">
      <svg width="18" height="18" viewBox="0 0 40 40">
        <circle cx="20" cy="20" r="18.5" fill="var(--panel)" stroke="var(--ink)" stroke-width="1"/>
        <circle cx="20" cy="20" r="4.2" fill="var(--sanguine-wash)" stroke="var(--sanguine)" stroke-width="1.5"/>
      </svg>
    </div>
    <div class="body">
      <div class="who">uNeuro · ядро</div>
      <div class="thinking-wrap">
        <div class="compass"><span class="pivot"></span></div>
        <span class="thinking-tt">чертит ответ<span class="e">…</span></span>
      </div>
    </div>`;
  return wrap;
}

function escHtml(s) {
  return (s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// send message
async function sendMessage() {
  const textarea = el('chatInput');
  const text = textarea?.value.trim();
  if (!text || state.thinking) return;

  const cost = computeCost(text);
  state.balance -= cost; state.spentToday += cost; state.requestsToday++;
  updateBalanceDisplay();

  if (!state.activeId) newChat();

  // update thread title
  const t = state.threads.find(x => x.id === state.activeId);
  if (t) { t.title = text.length > 42 ? text.slice(0,42)+'…' : text; t.cost += cost; t.date = 'сейчас'; }

  state.messages[state.activeId] = state.messages[state.activeId] || [];
  state.messages[state.activeId].push({ role: 'user', text, cost });
  textarea.value = '';
  textarea.style.height = 'auto';
  if (el('estCost')) el('estCost').textContent = '—';

  state.thinking = true;
  renderMessages();
  renderHistory();
  animateDataTransfer(); // живая анимация в топологии

  let streamOk = false;

  // ── СТРИМИНГ через SSE ──────────────────────────────────
  try {
    const sseUrl = `${GATEWAY}/chat/stream?message=${encodeURIComponent(text)}&session_id=s${Date.now()}&priority=${state.selectedMode}`;
    const resp = await fetch(sseUrl, { signal: AbortSignal.timeout(130000) });

    if (resp.ok && resp.body) {
      state.thinking = false;
      // Добавляем пустой пузырь — будем заполнять по мере токенов
      state.messages[state.activeId].push({ role: 'assistant', text: '', streaming: true, tokensOut: 0 });
      renderMessages();

      const reader  = resp.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      let accumulated = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const raw = line.slice(6);
          if (raw === '[DONE]') { streamOk = true; break; }
          if (!raw) continue;
          // Обратно декодируем экранированные \n
          const token = raw.replace(/\\n/g, '\n');
          accumulated += token;

          // Обновляем последний пузырь напрямую (без полного re-render)
          const msgs = state.messages[state.activeId];
          if (msgs.length) msgs[msgs.length - 1].text = accumulated;

          const inner = el('chatMessages');
          const bubbles = inner?.querySelectorAll('.msg.assistant .bubble');
          const lastBubble = bubbles?.[bubbles.length - 1];
          if (lastBubble) {
            lastBubble.innerHTML = escHtml(accumulated).replace(/\n/g, '<br>') + '<span class="typing-cursor"></span>';
          }
          el('chatThread')?.scrollTo({ top: el('chatThread').scrollHeight, behavior: 'smooth' });
        }
        if (streamOk) break;
      }

      // Финализируем пузырь
      const msgs = state.messages[state.activeId];
      if (msgs.length) {
        const last = msgs[msgs.length - 1];
        last.text      = accumulated || '(пустой ответ модели)';
        last.streaming = false;
        last.tokensOut = Math.round(accumulated.length / 3.4);
      }
      renderMessages();
      streamOk = true;
    }
  } catch (e) {
    console.log('[Stream] ошибка, fallback на /chat:', e.message);
    state.thinking = false;
  }

  // ── FALLBACK: обычный /chat ──────────────────────────────
  if (!streamOk) {
    state.thinking = true;
    renderMessages();
    try {
      const url = `${GATEWAY}/chat?message=${encodeURIComponent(text)}&session_id=s${Date.now()}&priority=${state.selectedMode}`;
      const resp = await fetch(url, { method: 'POST', signal: AbortSignal.timeout(130000) });
      const data = await resp.json();
      if (data.error) throw new Error(data.error);
      const reply = (data.response ?? data.text ?? '').trim() || '(пустой ответ модели)';
      state.thinking = false;
      state.messages[state.activeId].push({
        role: 'assistant', text: reply,
        tokensOut: Math.round(reply.length / 3.4),
        streaming: false,
        computeCost: data.compute_cost,
        tierLabel: ({ gpu:'🟢 GPU', fast_cpu:'🟡 Fast CPU', slow_cpu:'🔴 CPU' }[data.tier] || ''),
        priority: state.selectedMode,
      });
    } catch (e) {
      state.thinking = false;
      state.messages[state.activeId].push({ role: 'assistant', text: `Ошибка: ${e.message}`, tokensOut: 0, streaming: false });
    }
  }

  renderMessages();
  renderHistory();
}

function pickSuggest(btn) {
  const text = btn.querySelector('.st').textContent;
  el('chatInput').value = text;
  el('chatInput').focus();
  updateEstCost();
}

function updateEstCost() {
  const text = el('chatInput')?.value || '';
  if (el('estCost')) el('estCost').textContent = text.trim() ? `~${computeCost(text)} ν` : '—';
}

el('chatSendBtn')?.addEventListener('click', sendMessage);
el('chatInput')?.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
});
el('chatInput')?.addEventListener('input', () => {
  const ta = el('chatInput');
  ta.style.height = 'auto';
  ta.style.height = Math.min(160, ta.scrollHeight) + 'px';
  updateEstCost();
});

// mode buttons
document.querySelectorAll('.mode-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    state.selectedMode = btn.dataset.mode;
    document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  });
});

// ─────────────────────────────────────────
// SETTINGS MODAL
// ─────────────────────────────────────────
function openLoad() { el('loadOverlay').classList.add('open'); }
function closeLoad() { el('loadOverlay').classList.remove('open'); }

function updateSlider(pct) {
  const totalRAM = state.hardware.totalRAM || 8;
  // Нода всегда держит слои 11-21 (Gateway фиксированно держит 0-10).
  // load% определяет сколько слоёв ноды загружать:
  //   100% → слои 11-21 (все 11 слоёв ноды)
  //    50% → слои 16-21 (6 слоёв, экономим RAM)
  //    10% → слои 20-21 (2 слоя, минимум)
  const nodeLayerStart = 11;
  const nodeLayerEnd   = 21;
  const nodeLayerCount = nodeLayerEnd - nodeLayerStart + 1; // 11
  const keptLayers = Math.max(1, Math.round(nodeLayerCount * pct / 100));
  const layerStart = nodeLayerEnd - keptLayers + 1;        // 11..21

  const ramPerLayer = 0.1;  // ~100MB на слой TinyLlama bfloat16
  const ramUsed     = (keptLayers * ramPerLayer).toFixed(1);
  const compute     = (pct / 100 * 9 + 1).toFixed(1);
  const speed       = Math.floor(60 - (pct / 100) * 55);

  if (el('sliderVal'))  el('sliderVal').textContent  = Math.round(pct) + '%';
  if (el('s-ram'))      el('s-ram').textContent      = `~${ramUsed} GB`;
  if (el('s-layers'))   el('s-layers').textContent   = `${layerStart}–21`;
  if (el('s-compute'))  el('s-compute').textContent  = `~${compute} COMPUTE`;
  if (el('s-speed'))    el('s-speed').textContent    = `~${speed} сек`;
  state.settings.loadPercent = Math.round(pct);
  state.settings.layerStart  = layerStart;
}

el('load-slider')?.addEventListener('input', e => updateSlider(parseInt(e.target.value)));

function setIntensity(val) {
  state.settings.intensity = val;
  ['Эконом','Баланс','Максимум'].forEach(k => {
    const id = { 'Эконом':'iEco', 'Баланс':'iBal', 'Максимум':'iMax' }[k];
    el(id)?.classList.toggle('active', k === val);
  });
}

const switches = { autostart: true, sleepMode: false, yieldChat: true };
function toggleSwitch(key) {
  switches[key] = !switches[key];
  state.settings[key] = switches[key];
  const ids = { autostart:'swAutostart', sleepMode:'swSleepMode', yieldChat:'swYieldChat' };
  el(ids[key])?.classList.toggle('on', switches[key]);
}

// Загружаем настройки при открытии панели
function openSettings() {
  const gateway = localStorage.getItem('gateway') ||
    'http://217.160.49.222:8002';
  const workerId = localStorage.getItem('worker_id') || '';
  const useGpu = localStorage.getItem('use_gpu') !== 'false';
  const autostart = localStorage.getItem('autostart') !== 'false';

  if (el('settings-gateway')) el('settings-gateway').value = gateway;
  if (el('settings-worker-id')) el('settings-worker-id').value = workerId;
  if (el('settings-use-gpu')) el('settings-use-gpu').checked = useGpu;
  if (el('settings-autostart')) el('settings-autostart').checked = autostart;

  if (el('load-modal')) el('load-modal').style.display = 'flex';
  if (el('load-overlay')) el('load-overlay').style.display = 'block';
}

// Сохраняем все настройки
function saveSettings() {
  const gateway = (el('settings-gateway')?.value || '').trim();
  const workerId = (el('settings-worker-id')?.value || '').trim();
  const useGpu = el('settings-use-gpu')?.checked || true;
  const autostart = el('settings-autostart')?.checked || true;
  const loadPct = parseInt(el('load-slider')?.value || 40);

  localStorage.setItem('gateway', gateway);
  localStorage.setItem('worker_id', workerId);
  localStorage.setItem('use_gpu', useGpu);
  localStorage.setItem('autostart', autostart);

  window.electronAPI.saveSettings({
    loadPercent: loadPct,
    layerStart: state.settings.layerStart,
    sleepMode: state.settings.sleepMode,
    gateway: gateway,
    workerId: workerId,
    useGpu: useGpu,
    autostart: autostart
  });

  closeLoad();
}

// Переустановить зависимости
function reinstallNode() {
  if (confirm('Переустановить все зависимости? Займёт несколько минут.')) {
    closeLoad();
    window.electronAPI.reinstallDeps();
  }
}

// Сбросить EFCT gates
function resetGates() {
  if (confirm('Сбросить EFCT gates? Узел начнёт обучение заново.')) {
    window.electronAPI.resetGates();
    alert('Gates сброшены. Перезапусти узел.');
  }
}

function applySettings() {
  saveSettings();
}

// ─────────────────────────────────────────
// HARDWARE INFO
// ─────────────────────────────────────────
window.electronAPI.onHardwareInfo(hw => {
  state.hardware = hw;
  const devLabel = hw.device === 'mps' ? 'Apple MPS' : hw.device === 'cuda' ? 'CUDA GPU' : 'CPU';
  if (el('hw-info')) {
    el('hw-info').innerHTML =
      `${hw.totalRAM.toFixed(1)} GB RAM &nbsp;·&nbsp; ${devLabel} &nbsp;·&nbsp; ${hw.cpuCount} ядер &nbsp;·&nbsp; ${hw.cpuModel || ''}`;
  }
  updateSlider(state.settings.loadPercent);
});

window.electronAPI.onAutoLoad(pct => {
  if (el('load-slider')) el('load-slider').value = pct;
  updateSlider(pct);
});

// ─────────────────────────────────────────
// ELECTRON IPC LISTENERS
// ─────────────────────────────────────────
window.electronAPI.onNodeStatus?.(data => {
  if (data.isRunning && data.status === 'ready') updateNodeUI('on');
  else if (!data.isRunning) updateNodeUI('off');
});

// ─────────────────────────────────────────
// INIT
// ─────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  // Язык: первый запуск → показываем выбор, иначе применяем сохранённый
  if (!localStorage.getItem('lang_chosen')) {
    // Авто-детект по системному языку как дефолт в пикере
    const sys = (navigator.language || 'en').slice(0, 2);
    currentLang = ['ru', 'en', 'de'].includes(sys) ? sys : 'en';
    if (el('langPicker')) el('langPicker').style.display = 'flex';
  }
  applyLanguage(currentLang);

  setView('dash');
  setTimeout(() => { buildNet(); updateTopology(); }, 100);
  buildChart();
  updateBalanceDisplay();
  renderHistory();
  updateSlider(state.settings.loadPercent);
});

// ─────────────────────────────────────────
// АВТООБНОВЛЕНИЕ
// ─────────────────────────────────────────
window.electronAPI.onUpdateAvailable?.(() => {
  const b = el('update-banner');
  if (b) { b.style.display = 'flex'; b.querySelector('span').textContent = t('update.downloading'); }
});
window.electronAPI.onUpdateDownloaded?.(() => {
  const b = el('update-banner');
  if (b) {
    b.style.display = 'flex';
    b.innerHTML = `<span>${t('update.ready')}</span>
      <button onclick="window.electronAPI.installUpdate()" style="
        background:white;color:#d98a6a;border:none;border-radius:6px;
        padding:4px 12px;font-size:12px;font-weight:600;cursor:pointer;
      ">${t('update.install')}</button>`;
  }
});

// ─────────────────────────────────────────
// ОНБОРДИНГ (первый запуск)
// ─────────────────────────────────────────
window.electronAPI.onFirstRunStart?.(() => {
  const o = el('onboarding'); if (o) o.style.display = 'flex';
});
window.electronAPI.onFirstRunProgress?.((data) => {
  if (el('onboarding-step')) el('onboarding-step').textContent = data.step;
  if (el('onboarding-bar'))  el('onboarding-bar').style.width  = (data.percent || 0) + '%';
  if (data.error && el('onboarding-error')) {
    el('onboarding-error').style.display = 'block';
    el('onboarding-error').textContent = data.step;
  }
});
window.electronAPI.onFirstRunDone?.(() => {
  const o = el('onboarding'); if (o) o.style.display = 'none';
});

// Python не найден — показываем экран установки
window.electronAPI.onShowInstallPython?.(() => {
  const onboarding = el('onboarding'); if (onboarding) onboarding.style.display = 'none';
  const screen = el('install-python-screen'); if (screen) screen.style.display = 'flex';
});

// Узел упал (watchdog исчерпал попытки)
window.electronAPI.onNodeError?.((msg) => {
  if (el('balanceBanner')) {
    el('balanceBanner').style.display = 'flex';
    el('balanceBannerText').textContent = msg;
  }
});

// Smart-load изменил нагрузку — обновляем слайдер в UI
window.electronAPI.onLoadChanged?.((data) => {
  if (data?.percent != null) {
    state.settings.loadPercent = data.percent;
    if (el('load-slider')) el('load-slider').value = data.percent;
    if (el('sliderVal'))   el('sliderVal').textContent = data.percent + '%';
  }
});

// cleanup
window.addEventListener('beforeunload', () => {
  try { window.electronAPI.removeAllListeners(); } catch {}
});

console.log('[uNeuro] renderer loaded');
