// src/server.js — Final Omega v3.1: Cerebro (VPS)
// Autenticação, heartbeat WebSocket, SSE protegido
require('dotenv').config();
const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const cors = require('cors');
const { WebSocketServer } = require('ws');

const extractionRoutes = require('./routes/extraction');

let whatsappBot = null;
try { whatsappBot = require('./whatsapp/bot'); } catch(e) {
  console.log('  WhatsApp Bot: modulo nao carregado (' + e.message + ')');
}

const app = express();
const server = http.createServer(app);

// ═══ AUTENTICAÇÃO ═══
const AUTH_TOKEN = process.env.AUTH_TOKEN || '';
const sessions = new Map();

if (!AUTH_TOKEN) console.error('\n  ⚠️  AUTH_TOKEN nao definido no .env!\n');

setInterval(() => {
  const now = Date.now();
  for (const [id, ts] of sessions) {
    if (now - ts > 86400000) sessions.delete(id);
  }
}, 3600000);

function parseCookies(str) {
  const c = {};
  if (!str) return c;
  str.split(';').forEach(p => { const [k,...v] = p.trim().split('='); if(k) c[k.trim()] = decodeURIComponent(v.join('=')); });
  return c;
}

function isAuthed(req) {
  if (!AUTH_TOKEN) return true;
  const cookies = parseCookies(req.headers.cookie);
  const sid = cookies.omega_sid || '';
  if (sid && sessions.has(sid)) return true;
  // Aceita AUTH_TOKEN direto via header (pro bot WhatsApp)
  const headerToken = req.headers['x-session'] || '';
  if (headerToken === AUTH_TOKEN) return true;
  return false;
}

function authGuard(req, res, next) {
  if (isAuthed(req)) return next();
  res.status(401).json({ error: 'Nao autenticado' });
}

// ═══ MIDDLEWARE ═══
app.use(cors());
app.use(express.json({ limit: '50mb' }));
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10485760 } });

// ── Auth routes (públicas) ──
app.post('/api/auth/login', (req, res) => {
  const { token } = req.body;
  if (!AUTH_TOKEN || token === AUTH_TOKEN) {
    const sid = crypto.randomBytes(32).toString('hex');
    sessions.set(sid, Date.now());
    res.setHeader('Set-Cookie', 'omega_sid=' + sid + '; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400');
    return res.json({ success: true });
  }
  res.status(403).json({ error: 'Senha incorreta' });
});

app.get('/api/auth/check', (req, res) => { res.json({ authed: isAuthed(req) }); });

app.post('/api/auth/logout', (req, res) => {
  const cookies = parseCookies(req.headers.cookie);
  if (cookies.omega_sid) sessions.delete(cookies.omega_sid);
  res.setHeader('Set-Cookie', 'omega_sid=; Path=/; Max-Age=0');
  res.json({ success: true });
});

// ── Servir páginas ──
app.get('/login', (req, res) => { res.sendFile(path.join(__dirname, '..', 'public', 'login.html')); });
app.get('/', (req, res) => {
  if (!isAuthed(req)) return res.redirect('/login');
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// Protege rotas
app.use((req, res, next) => {
  if (req.path === '/login.html' || req.path === '/login' || req.path === '/manifest.json') return next();
  if (req.path.startsWith('/api/auth/')) return next();
  if (req.path.startsWith('/api/')) return authGuard(req, res, next);
  if (req.path === '/index.html' && !isAuthed(req)) return res.redirect('/login');
  next();
});

app.use(express.static(path.join(__dirname, '..', 'public')));

// ═══ WEBSOCKET — com heartbeat 30s ═══
const wss = new WebSocketServer({ server, path: '/ws' });
const devices = new Map();
const browserClients = new Set();
const WS_PING_INTERVAL = 30000;

setInterval(() => {
  for (const [id, dev] of devices) {
    if (dev._alive === false) {
      dev.ws.terminate();
      devices.delete(id);
      broadcastToFrontend({ event: 'device_disconnected', deviceId: id });
      console.log('  [WS] Heartbeat timeout: ' + id);
      continue;
    }
    dev._alive = false;
    try { dev.ws.ping(); } catch {}
  }
}, WS_PING_INTERVAL);

wss.on('connection', (ws, req) => {
  const url = new URL(req.url, 'http://localhost');
  const wsToken = url.searchParams.get('token') || '';

  if (AUTH_TOKEN && wsToken !== AUTH_TOKEN) {
    const cookies = parseCookies(req.headers.cookie);
    if (!cookies.omega_sid || !sessions.has(cookies.omega_sid)) {
      ws.close(4001, 'Nao autenticado');
      return;
    }
  }

  let deviceId = null;

  ws.on('pong', () => {
    if (deviceId && devices.has(deviceId)) devices.get(deviceId)._alive = true;
  });

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    if (msg.type === 'register') {
      deviceId = msg.deviceId || ('device_' + Date.now());
      devices.set(deviceId, { ws, name: msg.name || deviceId, status: 'idle', connectedAt: new Date().toISOString(), currentTask: null, _alive: true });
      ws.send(JSON.stringify({ type: 'registered', deviceId }));
      broadcastToFrontend({ event: 'device_connected', deviceId, name: msg.name || deviceId });
      console.log('  [WS] Conectado: ' + (msg.name || deviceId));
      // Tenta enviar tarefa da fila
      setTimeout(() => tryDequeueFor(deviceId), 1000);
      return;
    }

    if (msg.type === 'status' && deviceId) {
      const dev = devices.get(deviceId);
      if (dev) dev.status = msg.status || 'idle';
      broadcastToFrontend({ event: 'device_status', deviceId, ...msg });
      if (whatsappBot) {
        if (msg.status === 'error' || msg.status === 'error_critical') whatsappBot.sendError(msg.message || 'Erro', msg.step || '').catch(() => {});
        if (msg.status === 'done') whatsappBot.sendToGroup('✅ ' + (msg.message || 'Concluido!')).catch(() => {});
      }
      return;
    }

    if (msg.type === 'task_result' && deviceId) {
      broadcastToFrontend({ event: 'task_result', deviceId, ...msg });
    }
  });

  ws.on('close', () => {
    if (deviceId) { devices.delete(deviceId); broadcastToFrontend({ event: 'device_disconnected', deviceId }); console.log('  [WS] Desconectado: ' + deviceId); }
  });
  ws.on('error', () => { if (deviceId) devices.delete(deviceId); });
});

// ═══ FILA DE TAREFAS (retry quando dispositivo reconecta) ═══
const taskQueue = []; // { task, createdAt, attempts }
const QUEUE_MAX_AGE = 10 * 60 * 1000; // 10 min de vida max
const QUEUE_MAX_ATTEMPTS = 3;

function tryDequeueFor(deviceId) {
  if (taskQueue.length === 0) return;
  const dev = devices.get(deviceId);
  if (!dev || dev.status !== 'idle') return;

  // Limpa tarefas expiradas
  const now = Date.now();
  while (taskQueue.length > 0 && now - taskQueue[0].createdAt > QUEUE_MAX_AGE) {
    const expired = taskQueue.shift();
    broadcastToFrontend({ event: 'task_expired', taskId: expired.taskId, reason: 'Expirou na fila' });
  }

  if (taskQueue.length === 0) return;

  const item = taskQueue.shift();
  item.attempts++;
  const taskId = item.taskId;
  try {
    dev.ws.send(JSON.stringify({ type: 'task', taskId, ...item.task }));
    dev.status = 'running';
    dev.currentTask = taskId;
    broadcastToFrontend({ event: 'task_dequeued', deviceId, taskId, attempt: item.attempts });
    console.log('  [QUEUE] Tarefa ' + taskId + ' enviada (tentativa ' + item.attempts + ')');
  } catch (err) {
    // Falhou — recoloca na fila se não excedeu tentativas
    if (item.attempts < QUEUE_MAX_ATTEMPTS) {
      taskQueue.unshift(item);
    } else {
      broadcastToFrontend({ event: 'task_failed', taskId, reason: 'Max tentativas excedidas' });
    }
  }
}

function broadcastToFrontend(data) {
  const msg = 'data: ' + JSON.stringify(data) + '\n\n';
  for (const res of browserClients) { try { res.write(msg); } catch { browserClients.delete(res); } }
}

// ═══ API ═══
app.get('/api/status/stream', authGuard, (req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  browserClients.add(res);
  req.on('close', () => browserClients.delete(res));
});

app.get('/api/devices', authGuard, (req, res) => {
  const list = [];
  for (const [id, dev] of devices) list.push({ id, name: dev.name, status: dev.status, connectedAt: dev.connectedAt, currentTask: dev.currentTask });
  res.json({ success: true, devices: list });
});

app.post('/api/task/send', authGuard, (req, res) => {
  const { deviceId, task } = req.body;
  let targetId = deviceId;
  if (!targetId) { for (const [id, dev] of devices) { if (dev.status === 'idle') { targetId = id; break; } } }

  // Se não tem dispositivo disponível, enfileira
  if (!targetId || !devices.has(targetId)) {
    const taskId = 'task_' + Date.now();
    taskQueue.push({ task, taskId, createdAt: Date.now(), attempts: 0 });
    broadcastToFrontend({ event: 'task_queued', taskId, queueSize: taskQueue.length });
    return res.json({ success: true, queued: true, taskId, message: 'Sem dispositivo. Tarefa na fila (' + taskQueue.length + '). Sera enviada quando reconectar.' });
  }

  const dev = devices.get(targetId);
  if (dev.status === 'running') {
    const taskId = 'task_' + Date.now();
    taskQueue.push({ task, taskId, createdAt: Date.now(), attempts: 0 });
    broadcastToFrontend({ event: 'task_queued', taskId, queueSize: taskQueue.length });
    return res.json({ success: true, queued: true, taskId, message: 'Dispositivo ocupado. Na fila.' });
  }

  const taskId = 'task_' + Date.now();
  try {
    dev.ws.send(JSON.stringify({ type: 'task', taskId, ...task }));
    dev.status = 'running'; dev.currentTask = taskId;
    broadcastToFrontend({ event: 'task_sent', deviceId: targetId, taskId, task: task.modo });
    res.json({ success: true, taskId, deviceId: targetId });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('/api/task/queue', authGuard, (req, res) => {
  res.json({ success: true, queue: taskQueue.map(i => ({ taskId: i.taskId, modo: i.task.modo, attempts: i.attempts, age: Date.now() - i.createdAt })), size: taskQueue.length });
});

app.post('/api/task/stop', authGuard, (req, res) => {
  const { deviceId } = req.body;
  const dev = deviceId ? devices.get(deviceId) : null;
  if (!dev) return res.status(404).json({ error: 'Dispositivo nao encontrado' });
  try { dev.ws.send(JSON.stringify({ type: 'stop' })); dev.status = 'idle'; dev.currentTask = null; res.json({ success: true }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.use('/api/extract', authGuard, upload.single('document'), extractionRoutes);

// ═══ HISTÓRICO ═══
const HIST_DIR = path.join(__dirname, '..', 'data', 'historico');
const IMPORT_DIR = path.join(__dirname, '..', 'data', 'imports');
if (!fs.existsSync(HIST_DIR)) fs.mkdirSync(HIST_DIR, { recursive: true });
if (!fs.existsSync(IMPORT_DIR)) fs.mkdirSync(IMPORT_DIR, { recursive: true });

app.post('/api/historico/salvar', authGuard, (req, res) => {
  const { tipo, documento, dados } = req.body;
  const id = Date.now().toString();
  fs.writeFileSync(path.join(HIST_DIR, id + '.json'), JSON.stringify({ id, tipo, documento, dados, created_at: new Date().toISOString() }, null, 2));
  res.json({ success: true, id });
});

app.get('/api/historico/listar', authGuard, (req, res) => {
  const files = fs.readdirSync(HIST_DIR).filter(f => f.endsWith('.json'));
  const items = []; const TTL = 604800000;
  for (const file of files) {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(HIST_DIR, file), 'utf8'));
      if (Date.now() - new Date(data.created_at).getTime() > TTL) { fs.unlinkSync(path.join(HIST_DIR, file)); continue; }
      items.push({ id: data.id, tipo: data.tipo, documento: data.documento, created_at: data.created_at });
    } catch {}
  }
  items.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  res.json({ success: true, items });
});

app.get('/api/historico/:id', authGuard, (req, res) => {
  const file = path.join(HIST_DIR, req.params.id + '.json');
  if (!fs.existsSync(file)) return res.status(404).json({ error: 'Nao encontrado' });
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  res.json({ success: true, data: data.dados, tipo: data.tipo, documento: data.documento });
});

app.get('/api/import/:code', authGuard, (req, res) => {
  const file = path.join(IMPORT_DIR, req.params.code.toUpperCase() + '.json');
  if (!fs.existsSync(file)) return res.status(404).json({ success: false, error: 'Codigo nao encontrado' });
  res.json({ success: true, data: JSON.parse(fs.readFileSync(file, 'utf8')) });
});

app.get('*', (req, res) => {
  if (!isAuthed(req)) return res.redirect('/login');
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log('\n  Final Omega v3.1');
  console.log('  HTTP: http://0.0.0.0:' + PORT);
  console.log('  WS: ws://0.0.0.0:' + PORT + '/ws');
  console.log('  Auth: ' + (AUTH_TOKEN ? 'ATIVO' : '⚠️ SEM PROTEÇÃO'));
  console.log('  Heartbeat: 30s\n');
  if (whatsappBot && process.env.WHATSAPP_GROUP_NAME) whatsappBot.startBot();
  else console.log('  WhatsApp Bot: desativado\n');
});
app.set('whatsappBot', whatsappBot);
