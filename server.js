const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const SECRET = 'hashsalman-secret-2026';
const DB = '/tmp/db.json';

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── DB ──────────────────────────────────────────────
function getDB() {
  if (!fs.existsSync(DB)) {
    const init = {
      admin: { username: 'admin', password: bcrypt.hashSync('admin123', 10) },
      bots: [],
      logs: []
    };
    fs.writeFileSync(DB, JSON.stringify(init));
    return init;
  }
  return JSON.parse(fs.readFileSync(DB));
}
function saveDB(d) { fs.writeFileSync(DB, JSON.stringify(d)); }
function log(db, action, name, account) {
  db.logs.unshift({ time: new Date().toISOString(), action, name, account });
  if (db.logs.length > 300) db.logs = db.logs.slice(0, 300);
}

// ── AUTH ─────────────────────────────────────────────
function auth(req, res, next) {
  try {
    const t = req.headers.authorization.split(' ')[1];
    jwt.verify(t, SECRET);
    next();
  } catch(e) { res.status(401).json({ error: 'Unauthorized' }); }
}

app.post('/api/login', function(req, res) {
  const db = getDB();
  const { username, password } = req.body;
  if (username !== db.admin.username || !bcrypt.compareSync(password, db.admin.password)) {
    return res.status(401).json({ error: 'Wrong credentials' });
  }
  const token = jwt.sign({ username }, SECRET, { expiresIn: '7d' });
  res.json({ token });
});

// ── BOTS ─────────────────────────────────────────────
app.get('/api/bots', auth, function(req, res) {
  res.json(getDB().bots);
});

app.post('/api/bots/add', auth, function(req, res) {
  const db = getDB();
  const { name, account, server, expiry } = req.body;
  if (!name || !account || !expiry) return res.status(400).json({ error: 'Name, Account, Expiry required' });
  if (db.bots.find(function(b) { return b.account === account; })) {
    return res.status(400).json({ error: 'Account already exists' });
  }
  const bot = { id: Date.now(), name, account, server: server || 'MT5Real18', expiry, status: 'ACTIVE', lastCheck: null, addedAt: new Date().toISOString() };
  db.bots.push(bot);
  log(db, 'BOT_ADDED', name, account);
  saveDB(db);
  res.json({ ok: true });
});

app.post('/api/bots/activate/:id', auth, function(req, res) {
  const db = getDB();
  const bot = db.bots.find(function(b) { return b.id == req.params.id; });
  if (!bot) return res.status(404).json({ error: 'Not found' });
  bot.status = 'ACTIVE';
  log(db, 'BOT_ACTIVATED', bot.name, bot.account);
  saveDB(db);
  res.json({ ok: true });
});

app.post('/api/bots/disable/:id', auth, function(req, res) {
  const db = getDB();
  const bot = db.bots.find(function(b) { return b.id == req.params.id; });
  if (!bot) return res.status(404).json({ error: 'Not found' });
  bot.status = 'DISABLED';
  log(db, 'BOT_DISABLED', bot.name, bot.account);
  saveDB(db);
  res.json({ ok: true });
});

app.post('/api/bots/delete/:id', auth, function(req, res) {
  const db = getDB();
  const idx = db.bots.findIndex(function(b) { return b.id == req.params.id; });
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  const bot = db.bots[idx];
  db.bots.splice(idx, 1);
  log(db, 'BOT_DELETED', bot.name, bot.account);
  saveDB(db);
  res.json({ ok: true });
});

app.post('/api/bots/edit/:id', auth, function(req, res) {
  const db = getDB();
  const bot = db.bots.find(function(b) { return b.id == req.params.id; });
  if (!bot) return res.status(404).json({ error: 'Not found' });
  if (req.body.name) bot.name = req.body.name;
  if (req.body.server) bot.server = req.body.server;
  if (req.body.expiry) bot.expiry = req.body.expiry;
  if (req.body.status) bot.status = req.body.status;
  log(db, 'BOT_EDITED', bot.name, bot.account);
  saveDB(db);
  res.json({ ok: true });
});

// CLOSE ALL BOTS IN ONE CLICK
app.post('/api/bots/disable-all', auth, function(req, res) {
  const db = getDB();
  db.bots.forEach(function(b) { b.status = 'DISABLED'; });
  log(db, 'ALL_BOTS_DISABLED', 'ALL', '-');
  saveDB(db);
  res.json({ ok: true });
});

// EA LICENSE CHECK - MT5 bot calls this
app.get('/api/check', function(req, res) {
  const account = req.query.account;
  if (!account) return res.json({ status: 'INVALID' });
  const db = getDB();
  const bot = db.bots.find(function(b) { return b.account === account; });
  if (!bot) return res.json({ status: 'NOT_FOUND' });
  bot.lastCheck = new Date().toISOString();
  saveDB(db);
  const today = new Date().toISOString().split('T')[0];
  if (bot.expiry < today) { bot.status = 'EXPIRED'; saveDB(db); return res.json({ status: 'EXPIRED' }); }
  if (bot.status !== 'ACTIVE') return res.json({ status: bot.status });
  return res.json({ status: 'ACTIVE', name: bot.name, expiry: bot.expiry });
});

app.get('/api/logs', auth, function(req, res) {
  res.json(getDB().logs.slice(0, 100));
});

// ── FRONTEND ──────────────────────────────────────────
app.get('*', function(req, res) {
  res.sendFile(__dirname + '/index.html');
});

app.listen(PORT, function() {
  console.log('Panel running on port ' + PORT);
});
