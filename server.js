const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const SECRET = process.env.JWT_SECRET || 'hashsalman-secret-2026';
const DB = process.env.DB_PATH || '/tmp/db.json';
const RESEND_KEY = process.env.RESEND_API_KEY || '';

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── DB ────────────────────────────────────────────────
function getDB() {
  if (!fs.existsSync(DB)) {
    const dir = path.dirname(DB);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const init = {
      admin: { username: 'admin', password: bcrypt.hashSync('HasH@@143', 10) },
      bots: [], masterBots: [],
      signal: { type: 'NORMAL', time: null }, logs: []
    };
    fs.writeFileSync(DB, JSON.stringify(init));
    return init;
  }
  try { return JSON.parse(fs.readFileSync(DB)); }
  catch(e) { return { admin: { username:'admin', password: bcrypt.hashSync('HasH@@143',10) }, bots:[], masterBots:[], signal:{type:'NORMAL',time:null}, logs:[] }; }
}
function saveDB(d) {
  try {
    const dir = path.dirname(DB);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(DB, JSON.stringify(d));
  } catch(e) { console.error('DB save error:', e); }
}
function log(db, action, name, account) {
  db.logs.unshift({ time: new Date().toISOString(), action, name: name||'', account: account||'' });
  if (db.logs.length > 500) db.logs = db.logs.slice(0, 500);
}

// ── EMAIL ─────────────────────────────────────────────
async function sendEmail(to, subject, html) {
  if (!RESEND_KEY || !to) return;
  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + RESEND_KEY },
      body: JSON.stringify({ from: 'Trade Master HS <noreply@hashsalman.com>', to: [to], subject, html })
    });
  } catch(e) { console.error('Email error:', e); }
}

// ── AUTH ──────────────────────────────────────────────
function adminAuth(req, res, next) {
  try {
    const t = req.headers.authorization.split(' ')[1];
    const d = jwt.verify(t, SECRET);
    if (d.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
    next();
  } catch(e) { res.status(401).json({ error: 'Unauthorized' }); }
}
function clientAuth(req, res, next) {
  try {
    const t = req.headers.authorization.split(' ')[1];
    const d = jwt.verify(t, SECRET);
    if (d.role !== 'client') return res.status(403).json({ error: 'Forbidden' });
    req.clientAccount = d.account;
    next();
  } catch(e) { res.status(401).json({ error: 'Unauthorized' }); }
}

// ── ADMIN LOGIN ───────────────────────────────────────
app.post('/api/admin/login', (req, res) => {
  const db = getDB();
  const { username, password } = req.body;
  if (username !== db.admin.username || !bcrypt.compareSync(password, db.admin.password))
    return res.status(401).json({ error: 'Wrong credentials' });
  const token = jwt.sign({ username, role: 'admin' }, SECRET, { expiresIn: '7d' });
  res.json({ token });
});

// ── CLIENT LOGIN ──────────────────────────────────────
app.post('/api/client/login', (req, res) => {
  const db = getDB();
  const { username, password } = req.body;
  const bot = db.bots.find(b => b.account === username);
  if (!bot || !bcrypt.compareSync(password, bot.clientPassword))
    return res.status(401).json({ error: 'Wrong credentials' });
  const token = jwt.sign({ username, role: 'client', account: bot.account }, SECRET, { expiresIn: '7d' });
  res.json({ token, name: bot.name });
});

// ── MASTER BOTS ───────────────────────────────────────
app.get('/api/master/bots', adminAuth, (req, res) => res.json(getDB().masterBots || []));

app.post('/api/master/bots/add', adminAuth, (req, res) => {
  const db = getDB();
  if (!db.masterBots) db.masterBots = [];
  if (db.masterBots.length >= 2) return res.status(400).json({ error: 'Max 2 master bots' });
  const { account, name } = req.body;
  if (!account) return res.status(400).json({ error: 'Account required' });
  if (db.masterBots.find(b => b.account === account)) return res.status(400).json({ error: 'Already exists' });
  db.masterBots.push({ account, name: name || 'Master Bot', addedAt: new Date().toISOString() });
  log(db, 'MASTER_BOT_ADDED', name, account);
  saveDB(db); res.json({ ok: true });
});

app.post('/api/master/bots/remove/:account', adminAuth, (req, res) => {
  const db = getDB();
  if (!db.masterBots) db.masterBots = [];
  db.masterBots = db.masterBots.filter(b => b.account !== req.params.account);
  log(db, 'MASTER_BOT_REMOVED', '', req.params.account);
  saveDB(db); res.json({ ok: true });
});

// ── SIGNAL ────────────────────────────────────────────
app.get('/api/signal', (req, res) => {
  const db = getDB();
  const sig = db.signal || { type: 'NORMAL' };
  if (sig.type === 'CLOSE_NOW' && sig.time) {
    const elapsed = (Date.now() - new Date(sig.time).getTime()) / 1000;
    if (elapsed > 10) { db.signal = { type: 'NORMAL', time: null }; saveDB(db); return res.json({ type: 'NORMAL' }); }
  }
  res.json(sig);
});

app.post('/api/signal/set', adminAuth, (req, res) => {
  const db = getDB();
  db.signal = { type: req.body.type || 'NORMAL', time: new Date().toISOString(), from: 'admin' };
  log(db, 'SIGNAL_' + req.body.type, 'admin', '-');
  saveDB(db); res.json({ ok: true });
});

// ── BOTS CRUD ─────────────────────────────────────────
app.get('/api/bots', adminAuth, (req, res) => res.json(getDB().bots));

app.post('/api/bots/add', adminAuth, async (req, res) => {
  const db = getDB();
  const { name, account, server, expiry, clientPassword, notes, email } = req.body;
  if (!name || !account || !expiry || !clientPassword) return res.status(400).json({ error: 'All fields required' });
  if (db.bots.find(b => b.account === account)) return res.status(400).json({ error: 'Account exists' });
  const bot = {
    id: Date.now(), name, account, server: server || 'MT5Real18', expiry,
    status: 'ACTIVE', lastCheck: null, addedAt: new Date().toISOString(),
    clientPassword: bcrypt.hashSync(clientPassword, 10),
    clientEmail: email || '', notes: notes || '',
    stats: { daily:0, weekly:0, monthly:0, total:0, wins:0, losses:0, balance:0, bot:'', updatedAt:null }
  };
  db.bots.push(bot); log(db, 'BOT_ADDED', name, account); saveDB(db);
  res.json({ ok: true });
});

app.post('/api/bots/edit/:id', adminAuth, (req, res) => {
  const db = getDB();
  const bot = db.bots.find(b => b.id == req.params.id);
  if (!bot) return res.status(404).json({ error: 'Not found' });
  if (req.body.name) bot.name = req.body.name;
  if (req.body.server) bot.server = req.body.server;
  if (req.body.expiry) bot.expiry = req.body.expiry;
  if (req.body.status) bot.status = req.body.status;
  if (req.body.notes !== undefined) bot.notes = req.body.notes;
  if (req.body.email !== undefined) bot.clientEmail = req.body.email;
  if (req.body.clientPassword) bot.clientPassword = bcrypt.hashSync(req.body.clientPassword, 10);
  log(db, 'BOT_EDITED', bot.name, bot.account); saveDB(db); res.json({ ok: true });
});

app.post('/api/bots/activate/:id', adminAuth, (req, res) => {
  const db = getDB();
  const bot = db.bots.find(b => b.id == req.params.id);
  if (!bot) return res.status(404).json({ error: 'Not found' });
  bot.status = 'ACTIVE'; log(db, 'BOT_ACTIVATED', bot.name, bot.account); saveDB(db); res.json({ ok: true });
});

app.post('/api/bots/disable/:id', adminAuth, (req, res) => {
  const db = getDB();
  const bot = db.bots.find(b => b.id == req.params.id);
  if (!bot) return res.status(404).json({ error: 'Not found' });
  bot.status = 'DISABLED'; log(db, 'BOT_DISABLED', bot.name, bot.account); saveDB(db); res.json({ ok: true });
});

app.post('/api/bots/delete/:id', adminAuth, (req, res) => {
  const db = getDB();
  const idx = db.bots.findIndex(b => b.id == req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  const bot = db.bots[idx]; db.bots.splice(idx, 1);
  log(db, 'BOT_DELETED', bot.name, bot.account); saveDB(db); res.json({ ok: true });
});

app.post('/api/bots/disable-all', adminAuth, (req, res) => {
  const db = getDB();
  db.bots.forEach(b => { if (b.status === 'ACTIVE') b.status = 'DISABLED'; });
  db.signal = { type: 'DISABLED', time: new Date().toISOString(), from: 'admin' };
  log(db, 'ALL_DISABLED', 'ALL', '-'); saveDB(db); res.json({ ok: true });
});

app.post('/api/bots/activate-all', adminAuth, (req, res) => {
  const db = getDB();
  db.bots.forEach(b => { if (b.status === 'DISABLED') b.status = 'ACTIVE'; });
  db.signal = { type: 'ACTIVE', time: new Date().toISOString(), from: 'admin' };
  log(db, 'ALL_ACTIVATED', 'ALL', '-'); saveDB(db); res.json({ ok: true });
});

// ── EA LICENSE CHECK ──────────────────────────────────
app.get('/api/check', (req, res) => {
  const account = req.query.account;
  if (!account) return res.json({ status: 'INVALID' });
  const db = getDB();
  const isMaster = db.masterBots && db.masterBots.find(b => b.account === account);
  const bot = db.bots.find(b => b.account === account);
  if (!bot && !isMaster) return res.json({ status: 'NOT_FOUND' });
  if (isMaster) return res.json({ status: 'MASTER', signal: db.signal || { type: 'NORMAL' } });
  bot.lastCheck = new Date().toISOString(); saveDB(db);
  const today = new Date().toISOString().split('T')[0];
  if (bot.expiry < today) { bot.status = 'EXPIRED'; saveDB(db); return res.json({ status: 'EXPIRED' }); }
  if (bot.status !== 'ACTIVE') return res.json({ status: bot.status });
  return res.json({ status: 'ACTIVE', name: bot.name, expiry: bot.expiry, signal: db.signal || { type: 'NORMAL' } });
});

// ── EA STATS ──────────────────────────────────────────
app.get('/api/stats', (req, res) => {
  const { account, daily, weekly, monthly, total, wins, losses, balance, bot, signal } = req.query;
  if (!account) return res.json({ ok: false });
  const db = getDB();
  if (signal && db.masterBots && db.masterBots.find(b => b.account === account)) {
    db.signal = { type: signal, time: new Date().toISOString(), from: account };
    log(db, 'MASTER_SIGNAL_' + signal, '', account); saveDB(db);
    return res.json({ ok: true, role: 'master' });
  }
  const found = db.bots.find(b => b.account === account);
  if (!found) return res.json({ ok: false });
  found.lastCheck = new Date().toISOString();
  found.stats = {
    daily: parseFloat(daily)||0, weekly: parseFloat(weekly)||0,
    monthly: parseFloat(monthly)||0, total: parseFloat(total)||0,
    wins: parseInt(wins)||0, losses: parseInt(losses)||0,
    balance: parseFloat(balance)||0, bot: bot||'',
    updatedAt: new Date().toISOString()
  };
  saveDB(db); res.json({ ok: true });
});

// ── CLIENT APIs ───────────────────────────────────────
app.get('/api/client/bot', clientAuth, (req, res) => {
  const db = getDB();
  const bot = db.bots.find(b => b.account === req.clientAccount);
  if (!bot) return res.status(404).json({ error: 'Not found' });
  const today = new Date().toISOString().split('T')[0];
  if (bot.expiry < today) bot.status = 'EXPIRED';
  res.json({ name: bot.name, account: bot.account, server: bot.server, expiry: bot.expiry, status: bot.status, stats: bot.stats, clientEmail: bot.clientEmail || '' });
});

app.post('/api/client/activate', clientAuth, (req, res) => {
  const db = getDB();
  const bot = db.bots.find(b => b.account === req.clientAccount);
  if (!bot) return res.status(404).json({ error: 'Not found' });
  const today = new Date().toISOString().split('T')[0];
  if (bot.expiry < today) return res.status(403).json({ error: 'License expired' });
  bot.status = 'ACTIVE'; log(db, 'CLIENT_ACTIVATED', bot.name, bot.account); saveDB(db); res.json({ ok: true });
});

app.post('/api/client/disable', clientAuth, (req, res) => {
  const db = getDB();
  const bot = db.bots.find(b => b.account === req.clientAccount);
  if (!bot) return res.status(404).json({ error: 'Not found' });
  bot.status = 'DISABLED'; log(db, 'CLIENT_DISABLED', bot.name, bot.account); saveDB(db); res.json({ ok: true });
});

app.post('/api/client/email', clientAuth, (req, res) => {
  const db = getDB();
  const bot = db.bots.find(b => b.account === req.clientAccount);
  if (!bot) return res.status(404).json({ error: 'Not found' });
  const { email } = req.body;
  if (!email || !email.includes('@')) return res.status(400).json({ error: 'Valid email required' });
  bot.clientEmail = email; saveDB(db); res.json({ ok: true });
});

// ── LEADERBOARD ───────────────────────────────────────
app.get('/api/leaderboard', (req, res) => {
  const db = getDB();
  const lb = db.bots
    .filter(b => b.status === 'ACTIVE' && b.stats && b.stats.updatedAt)
    .map(b => ({ name: b.name, daily: b.stats.daily || 0, monthly: b.stats.monthly || 0, wins: b.stats.wins || 0, losses: b.stats.losses || 0 }))
    .sort((a, b) => b.daily - a.daily);
  res.json(lb);
});

// ── LOGS ─────────────────────────────────────────────
app.get('/api/logs', adminAuth, (req, res) => res.json(getDB().logs.slice(0, 200)));

// ── HEALTH ────────────────────────────────────────────
app.get('/api/health', (req, res) => res.json({ ok: true, db: DB, time: new Date().toISOString() }));

// ── PAGES ─────────────────────────────────────────────
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'home.html')));
app.get('/client', (req, res) => res.sendFile(path.join(__dirname, 'client.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('*', (req, res) => res.redirect('/'));

app.listen(PORT, () => {
  console.log('Hash Salman Panel running on port ' + PORT);
  console.log('DB:', DB);
});
