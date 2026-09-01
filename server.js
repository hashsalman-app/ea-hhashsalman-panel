const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const SECRET = process.env.JWT_SECRET || 'hashsalman-secret-2026';
const DB = process.env.DB_PATH || '/tmp/db.json';
const RESEND_API_KEY = process.env.RESEND_API_KEY || '';

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── DATABASE ──────────────────────────────────────────
function getDB() {
  if (!fs.existsSync(DB)) {
    const dir = path.dirname(DB);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const init = {
      admin: { username: 'admin', password: bcrypt.hashSync('HasH@@143', 10) },
      bots: [],
      masterBots: [],
      signal: { type: 'NORMAL', time: null },
      logs: []
    };
    fs.writeFileSync(DB, JSON.stringify(init));
    return init;
  }
  try {
    return JSON.parse(fs.readFileSync(DB));
  } catch(e) {
    return { admin: { username: 'admin', password: bcrypt.hashSync('HasH@@143', 10) }, bots: [], masterBots: [], signal: { type: 'NORMAL', time: null }, logs: [] };
  }
}

function saveDB(d) {
  try {
    const dir = path.dirname(DB);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(DB, JSON.stringify(d));
  } catch(e) { console.error('DB save error:', e); }
}

function log(db, action, name, account) {
  db.logs.unshift({ time: new Date().toISOString(), action, name: name || '', account: account || '' });
  if (db.logs.length > 500) db.logs = db.logs.slice(0, 500);
}

// ── EMAIL ─────────────────────────────────────────────
async function sendEmail(to, subject, html) {
  if (!RESEND_API_KEY || !to) return;
  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + RESEND_API_KEY },
      body: JSON.stringify({ from: 'alerts@hashsalman.com', to: [to], subject, html })
    });
  } catch(e) { console.error('Email error:', e); }
}

function buildEmail(botName, account, status, stats) {
  const s = stats || {};
  const daily = parseFloat(s.daily) || 0;
  const balance = parseFloat(s.balance) || 0;
  const wins = parseInt(s.wins) || 0;
  const losses = parseInt(s.losses) || 0;
  const isDisabled = status === 'DISABLED';
  const color = isDisabled ? '#dc2626' : '#16a34a';
  const statusText = isDisabled ? 'Disabled' : 'Activated';
  const icon = isDisabled ? '⏸' : '▶';
  return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f8fafc;font-family:Segoe UI,sans-serif">
<div style="max-width:500px;margin:0 auto;padding:20px">
  <div style="background:#0a2463;padding:20px;border-radius:12px 12px 0 0;text-align:center">
    <h1 style="margin:0;color:#fff;font-size:20px">Trade Master HS</h1>
  </div>
  <div style="background:#fff;padding:24px;border-radius:0 0 12px 12px;border:1px solid #e2e8f0">
    <div style="background:${isDisabled?'#fef2f2':'#f0fdf4'};border:1px solid ${color};border-radius:10px;padding:14px;text-align:center;margin-bottom:20px">
      <p style="margin:0;font-size:18px;font-weight:700;color:${color}">${icon} Bot ${statusText}</p>
    </div>
    <table style="width:100%;border-collapse:collapse">
      <tr style="border-bottom:1px solid #f1f5f9"><td style="padding:10px 0;font-size:13px;color:#64748b">Account</td><td style="padding:10px 0;font-size:13px;font-weight:600;text-align:right">#${account}</td></tr>
      <tr style="border-bottom:1px solid #f1f5f9"><td style="padding:10px 0;font-size:13px;color:#64748b">Today P/L</td><td style="padding:10px 0;font-size:13px;font-weight:700;color:${daily>=0?'#16a34a':'#dc2626'};text-align:right">${daily>=0?'+':''}$${Math.abs(daily).toFixed(2)}</td></tr>
      <tr><td style="padding:10px 0;font-size:13px;color:#64748b">Balance</td><td style="padding:10px 0;font-size:13px;text-align:right">$${balance.toFixed(2)}</td></tr>
    </table>
    <p style="text-align:center;margin-top:16px;font-size:13px;color:#64748b">WhatsApp: <b>+923023464786</b></p>
    <p style="text-align:center"><a href="https://hashsalman.com/client" style="background:#0a2463;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;font-size:13px">hashsalman.com/client</a></p>
  </div>
</div></body></html>`;
}

// ── AUTH ──────────────────────────────────────────────
function adminAuth(req, res, next) {
  try {
    const t = req.headers.authorization.split(' ')[1];
    const decoded = jwt.verify(t, SECRET);
    if (decoded.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
    next();
  } catch(e) { res.status(401).json({ error: 'Unauthorized' }); }
}

function clientAuth(req, res, next) {
  try {
    const t = req.headers.authorization.split(' ')[1];
    const decoded = jwt.verify(t, SECRET);
    if (decoded.role !== 'client') return res.status(403).json({ error: 'Forbidden' });
    req.clientAccount = decoded.account;
    next();
  } catch(e) { res.status(401).json({ error: 'Unauthorized' }); }
}

// ── ADMIN LOGIN ───────────────────────────────────────
app.post('/api/admin/login', function(req, res) {
  const db = getDB();
  const { username, password } = req.body;
  if (username !== db.admin.username || !bcrypt.compareSync(password, db.admin.password)) {
    return res.status(401).json({ error: 'Wrong credentials' });
  }
  const token = jwt.sign({ username, role: 'admin' }, SECRET, { expiresIn: '7d' });
  res.json({ token });
});

// ── CLIENT LOGIN ──────────────────────────────────────
app.post('/api/client/login', function(req, res) {
  const db = getDB();
  const { username, password } = req.body;
  const bot = db.bots.find(function(b) { return b.account === username; });
  if (!bot || !bcrypt.compareSync(password, bot.clientPassword)) {
    return res.status(401).json({ error: 'Wrong credentials' });
  }
  const token = jwt.sign({ username, role: 'client', account: bot.account }, SECRET, { expiresIn: '7d' });
  res.json({ token, name: bot.name });
});

// ── MASTER BOTS ───────────────────────────────────────
app.get('/api/master/bots', adminAuth, function(req, res) {
  res.json(getDB().masterBots || []);
});

app.post('/api/master/bots/add', adminAuth, function(req, res) {
  const db = getDB();
  if (!db.masterBots) db.masterBots = [];
  if (db.masterBots.length >= 2) return res.status(400).json({ error: 'Max 2 master bots allowed' });
  const { account, name } = req.body;
  if (!account) return res.status(400).json({ error: 'Account required' });
  if (db.masterBots.find(function(b) { return b.account === account; })) {
    return res.status(400).json({ error: 'Already exists' });
  }
  db.masterBots.push({ account, name: name || 'Master Bot', addedAt: new Date().toISOString() });
  log(db, 'MASTER_BOT_ADDED', name, account);
  saveDB(db);
  res.json({ ok: true });
});

app.post('/api/master/bots/remove/:account', adminAuth, function(req, res) {
  const db = getDB();
  if (!db.masterBots) db.masterBots = [];
  db.masterBots = db.masterBots.filter(function(b) { return b.account !== req.params.account; });
  log(db, 'MASTER_BOT_REMOVED', '', req.params.account);
  saveDB(db);
  res.json({ ok: true });
});

// ── SIGNAL ────────────────────────────────────────────
app.get('/api/signal', function(req, res) {
  const db = getDB();
  const sig = db.signal || { type: 'NORMAL' };
  if (sig.type === 'CLOSE_NOW' && sig.time) {
    const elapsed = (Date.now() - new Date(sig.time).getTime()) / 1000;
    if (elapsed > 10) {
      db.signal = { type: 'NORMAL', time: null };
      saveDB(db);
      return res.json({ type: 'NORMAL' });
    }
  }
  res.json(sig);
});

app.post('/api/signal/set', adminAuth, function(req, res) {
  const db = getDB();
  const { type } = req.body;
  db.signal = { type: type || 'NORMAL', time: new Date().toISOString(), from: 'admin' };
  log(db, 'ADMIN_SIGNAL_' + type, 'admin', '-');
  saveDB(db);
  res.json({ ok: true });
});

// ── ADMIN BOTS CRUD ───────────────────────────────────
app.get('/api/bots', adminAuth, function(req, res) {
  res.json(getDB().bots);
});

app.post('/api/bots/add', adminAuth, function(req, res) {
  const db = getDB();
  const { name, account, server, expiry, clientPassword, notes } = req.body;
  if (!name || !account || !expiry || !clientPassword) {
    return res.status(400).json({ error: 'All fields required' });
  }
  if (db.bots.find(function(b) { return b.account === account; })) {
    return res.status(400).json({ error: 'Account already exists' });
  }
  const bot = {
    id: Date.now(), name, account,
    server: server || 'MT5Real18',
    expiry, status: 'ACTIVE',
    lastCheck: null, addedAt: new Date().toISOString(),
    clientUsername: account,
    clientPassword: bcrypt.hashSync(clientPassword, 10),
    clientEmail: null,
    notes: notes || '',
    stats: { daily: 0, weekly: 0, monthly: 0, total: 0, wins: 0, losses: 0, balance: 0, bot: '', updatedAt: null }
  };
  db.bots.push(bot);
  log(db, 'BOT_ADDED', name, account);
  saveDB(db);
  res.json({ ok: true });
});

app.post('/api/bots/edit/:id', adminAuth, function(req, res) {
  const db = getDB();
  const bot = db.bots.find(function(b) { return b.id == req.params.id; });
  if (!bot) return res.status(404).json({ error: 'Not found' });
  if (req.body.name) bot.name = req.body.name;
  if (req.body.server) bot.server = req.body.server;
  if (req.body.expiry) bot.expiry = req.body.expiry;
  if (req.body.status) bot.status = req.body.status;
  if (req.body.notes !== undefined) bot.notes = req.body.notes;
  if (req.body.clientPassword) bot.clientPassword = bcrypt.hashSync(req.body.clientPassword, 10);
  log(db, 'BOT_EDITED', bot.name, bot.account);
  saveDB(db);
  res.json({ ok: true });
});

app.post('/api/bots/activate/:id', adminAuth, function(req, res) {
  const db = getDB();
  const bot = db.bots.find(function(b) { return b.id == req.params.id; });
  if (!bot) return res.status(404).json({ error: 'Not found' });
  const wasDisabled = bot.status !== 'ACTIVE';
  bot.status = 'ACTIVE';
  log(db, 'BOT_ACTIVATED', bot.name, bot.account);
  saveDB(db);
  if (wasDisabled && bot.clientEmail) {
    sendEmail(bot.clientEmail, 'Your Trade Master HS Bot is Active!', buildEmail(bot.name, bot.account, 'ACTIVE', bot.stats));
  }
  res.json({ ok: true });
});

app.post('/api/bots/disable/:id', adminAuth, function(req, res) {
  const db = getDB();
  const bot = db.bots.find(function(b) { return b.id == req.params.id; });
  if (!bot) return res.status(404).json({ error: 'Not found' });
  bot.status = 'DISABLED';
  log(db, 'BOT_DISABLED', bot.name, bot.account);
  saveDB(db);
  if (bot.clientEmail) {
    sendEmail(bot.clientEmail, 'Your Trade Master HS Bot has been paused', buildEmail(bot.name, bot.account, 'DISABLED', bot.stats));
  }
  res.json({ ok: true });
});

app.post('/api/bots/delete/:id', adminAuth, function(req, res) {
  const db = getDB();
  const idx = db.bots.findIndex(function(b) { return b.id == req.params.id; });
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  const bot = db.bots[idx];
  db.bots.splice(idx, 1);
  log(db, 'BOT_DELETED', bot.name, bot.account);
  saveDB(db);
  res.json({ ok: true });
});

app.post('/api/bots/disable-all', adminAuth, function(req, res) {
  const db = getDB();
  db.bots.forEach(function(b) {
    if (b.status === 'ACTIVE') {
      b.status = 'DISABLED';
      if (b.clientEmail) sendEmail(b.clientEmail, 'Bot paused', buildEmail(b.name, b.account, 'DISABLED', b.stats));
    }
  });
  db.signal = { type: 'DISABLED', time: new Date().toISOString(), from: 'admin' };
  log(db, 'ALL_BOTS_DISABLED', 'ALL', '-');
  saveDB(db);
  res.json({ ok: true });
});

app.post('/api/bots/activate-all', adminAuth, function(req, res) {
  const db = getDB();
  db.bots.forEach(function(b) {
    if (b.status === 'DISABLED') {
      b.status = 'ACTIVE';
      if (b.clientEmail) sendEmail(b.clientEmail, 'Bot activated', buildEmail(b.name, b.account, 'ACTIVE', b.stats));
    }
  });
  db.signal = { type: 'ACTIVE', time: new Date().toISOString(), from: 'admin' };
  log(db, 'ALL_BOTS_ACTIVATED', 'ALL', '-');
  saveDB(db);
  res.json({ ok: true });
});

// ── EA LICENSE CHECK ──────────────────────────────────
app.get('/api/check', function(req, res) {
  const account = req.query.account;
  if (!account) return res.json({ status: 'INVALID' });
  const db = getDB();
  const isMaster = db.masterBots && db.masterBots.find(function(b) { return b.account === account; });
  const bot = db.bots.find(function(b) { return b.account === account; });
  if (!bot && !isMaster) return res.json({ status: 'NOT_FOUND' });
  if (isMaster) return res.json({ status: 'MASTER', signal: db.signal || { type: 'NORMAL' } });
  bot.lastCheck = new Date().toISOString();
  saveDB(db);
  const today = new Date().toISOString().split('T')[0];
  if (bot.expiry < today) { bot.status = 'EXPIRED'; saveDB(db); return res.json({ status: 'EXPIRED' }); }
  if (bot.status !== 'ACTIVE') return res.json({ status: bot.status });
  const sig = db.signal || { type: 'NORMAL' };
  return res.json({ status: 'ACTIVE', name: bot.name, expiry: bot.expiry, signal: sig });
});

// ── EA STATS ──────────────────────────────────────────
app.get('/api/stats', function(req, res) {
  const { account, daily, weekly, monthly, total, wins, losses, balance, bot, signal } = req.query;
  if (!account) return res.json({ ok: false });
  const db = getDB();
  if (signal && db.masterBots && db.masterBots.find(function(b) { return b.account === account; })) {
    db.signal = { type: signal, time: new Date().toISOString(), from: account };
    log(db, 'MASTER_SIGNAL_' + signal, '', account);
    saveDB(db);
    return res.json({ ok: true, role: 'master' });
  }
  const found = db.bots.find(function(b) { return b.account === account; });
  if (!found) return res.json({ ok: false });
  found.lastCheck = new Date().toISOString();
  found.stats = {
    daily: parseFloat(daily) || 0, weekly: parseFloat(weekly) || 0,
    monthly: parseFloat(monthly) || 0, total: parseFloat(total) || 0,
    wins: parseInt(wins) || 0, losses: parseInt(losses) || 0,
    balance: parseFloat(balance) || 0, bot: bot || '',
    updatedAt: new Date().toISOString()
  };
  saveDB(db);
  res.json({ ok: true });
});

// ── CLIENT APIs ───────────────────────────────────────
app.get('/api/client/bot', clientAuth, function(req, res) {
  const db = getDB();
  const bot = db.bots.find(function(b) { return b.account === req.clientAccount; });
  if (!bot) return res.status(404).json({ error: 'Not found' });
  const today = new Date().toISOString().split('T')[0];
  if (bot.expiry < today) bot.status = 'EXPIRED';
  res.json({ name: bot.name, account: bot.account, server: bot.server, expiry: bot.expiry, status: bot.status, stats: bot.stats, clientEmail: bot.clientEmail || '' });
});

app.post('/api/client/activate', clientAuth, function(req, res) {
  const db = getDB();
  const bot = db.bots.find(function(b) { return b.account === req.clientAccount; });
  if (!bot) return res.status(404).json({ error: 'Not found' });
  const today = new Date().toISOString().split('T')[0];
  if (bot.expiry < today) return res.status(403).json({ error: 'License expired' });
  bot.status = 'ACTIVE';
  log(db, 'CLIENT_ACTIVATED', bot.name, bot.account);
  saveDB(db);
  res.json({ ok: true });
});

app.post('/api/client/disable', clientAuth, function(req, res) {
  const db = getDB();
  const bot = db.bots.find(function(b) { return b.account === req.clientAccount; });
  if (!bot) return res.status(404).json({ error: 'Not found' });
  bot.status = 'DISABLED';
  log(db, 'CLIENT_DISABLED', bot.name, bot.account);
  saveDB(db);
  res.json({ ok: true });
});

app.post('/api/client/email', clientAuth, function(req, res) {
  const db = getDB();
  const bot = db.bots.find(function(b) { return b.account === req.clientAccount; });
  if (!bot) return res.status(404).json({ error: 'Not found' });
  const { email } = req.body;
  if (!email || !email.includes('@')) return res.status(400).json({ error: 'Valid email required' });
  bot.clientEmail = email;
  saveDB(db);
  res.json({ ok: true });
});

// ── LEADERBOARD ───────────────────────────────────────
app.get('/api/leaderboard', function(req, res) {
  const db = getDB();
  const lb = db.bots.map(function(b) {
    return { name: b.name, daily: b.stats ? b.stats.daily : 0, monthly: b.stats ? b.stats.monthly : 0 };
  });
  res.json(lb);
});

// ── LOGS ─────────────────────────────────────────────
app.get('/api/logs', adminAuth, function(req, res) {
  res.json(getDB().logs.slice(0, 200));
});

// ── HEALTH ────────────────────────────────────────────
app.get('/api/health', function(req, res) {
  res.json({ ok: true, db: DB, time: new Date().toISOString() });
});

// ── PAGES ─────────────────────────────────────────────
app.get('/admin', function(req, res) { res.sendFile(path.join(__dirname, 'index.html')); });
app.get('/client', function(req, res) { res.sendFile(path.join(__dirname, 'client.html')); });
app.get('/', function(req, res) { res.redirect('/client'); });
app.get('*', function(req, res) { res.redirect('/client'); });

app.listen(PORT, function() {
  console.log('Hash Salman Panel running on port ' + PORT);
});
