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
app.use(express.static(__dirname)); // ✅ Serve logo.png and other static files

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
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + RESEND_KEY
      },
      body: JSON.stringify({
        from: 'Trade Master HS <noreply@hashsalman.com>',
        to: [to],
        subject,
        html
      })
    });
    const data = await res.json();
    console.log('Email sent:', subject, '| to:', to, '| status:', res.status);
    return data;
  } catch(e) { console.error('Email error:', e); }
}

// Email Templates
function emailDisabled(name, daily, weekly, monthly, total) {
  return `
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  body{margin:0;padding:0;background:#f0f4ff;font-family:'Segoe UI',sans-serif}
  .wrap{max-width:520px;margin:30px auto;background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,.08)}
  .header{background:linear-gradient(135deg,#0a2463,#1a56db);padding:28px 24px;text-align:center}
  .logo{font-size:28px;font-weight:900;color:#fbbf24;letter-spacing:1px}
  .tagline{color:#a5f3fc;font-size:12px;margin-top:4px;letter-spacing:2px}
  .body{padding:28px 24px}
  .greeting{font-size:16px;color:#1e293b;margin-bottom:16px}
  .status-box{background:#fee2e2;border:2px solid #fca5a5;border-radius:10px;padding:16px;text-align:center;margin-bottom:20px}
  .status-icon{font-size:32px;margin-bottom:6px}
  .status-text{font-size:16px;font-weight:700;color:#ef4444}
  .pnl-box{background:#eff6ff;border-radius:10px;padding:18px;margin-bottom:20px;border:1px solid #dbeafe}
  .pnl-title{font-size:13px;font-weight:700;color:#1a56db;margin-bottom:12px;text-transform:uppercase;letter-spacing:.5px}
  .pnl-row{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #dbeafe;font-size:14px}
  .pnl-row:last-child{border:none}
  .pnl-label{color:#64748b}
  .pnl-value{font-weight:700;color:#16a34a}
  .pnl-value.neg{color:#ef4444}
  .reactivate-box{background:linear-gradient(135deg,#0a2463,#1a56db);border-radius:10px;padding:20px;text-align:center;margin-bottom:20px}
  .reactivate-text{color:#a5f3fc;font-size:13px;margin-bottom:14px;line-height:1.6}
  .btn{display:inline-block;background:linear-gradient(90deg,#f59e0b,#fbbf24);color:#000;font-weight:800;font-size:14px;padding:12px 28px;border-radius:25px;text-decoration:none}
  .footer{background:#f8fbff;padding:16px 24px;text-align:center;border-top:1px solid #e2e8f0}
  .footer-brand{font-size:13px;font-weight:700;color:#1a56db}
  .footer-sub{font-size:11px;color:#94a3b8;margin-top:4px}
  .wa-link{color:#25d366;font-weight:600;text-decoration:none}
</style>
</head>
<body>
<div class="wrap">
  <div class="header">
    <div class="logo">Trade Master HS</div>
    <div class="tagline">FOCUS • DISCIPLINE • GROWTH</div>
  </div>
  <div class="body">
    <div class="greeting">Hi <strong>${name}</strong>,</div>
    <div class="status-box">
      <div class="status-icon">⏸</div>
      <div class="status-text">Your Bot Has Been Disabled</div>
    </div>
    <div class="pnl-box">
      <div class="pnl-title">📊 Your Performance Summary</div>
      <div class="pnl-row">
        <span class="pnl-label">Today's P/L</span>
        <span class="pnl-value ${parseFloat(daily)<0?'neg':''}">${parseFloat(daily)>=0?'+$':'-$'}${Math.abs(parseFloat(daily)||0).toFixed(2)}</span>
      </div>
      <div class="pnl-row">
        <span class="pnl-label">Weekly P/L</span>
        <span class="pnl-value ${parseFloat(weekly)<0?'neg':''}">${parseFloat(weekly)>=0?'+$':'-$'}${Math.abs(parseFloat(weekly)||0).toFixed(2)}</span>
      </div>
      <div class="pnl-row">
        <span class="pnl-label">Monthly P/L</span>
        <span class="pnl-value ${parseFloat(monthly)<0?'neg':''}">${parseFloat(monthly)>=0?'+$':'-$'}${Math.abs(parseFloat(monthly)||0).toFixed(2)}</span>
      </div>
      <div class="pnl-row">
        <span class="pnl-label">Total P/L</span>
        <span class="pnl-value ${parseFloat(total)<0?'neg':''}">${parseFloat(total)>=0?'+$':'-$'}${Math.abs(parseFloat(total)||0).toFixed(2)}</span>
      </div>
    </div>
    <div class="reactivate-box">
      <div class="reactivate-text">
        Your bot is currently <strong style="color:#fbbf24">DISABLED</strong>.<br>
        To reactivate your bot, login to your VIP Client Portal:
      </div>
      <a href="https://hashsalman.com/client" class="btn">🔗 Login to VIP Portal</a>
    </div>
    <p style="font-size:12px;color:#64748b;text-align:center">
      Need help? Contact us on WhatsApp:<br>
      <a href="https://wa.me/923023464786" class="wa-link">📱 +92 302 3464786</a>
    </p>
  </div>
  <div class="footer">
    <div class="footer-brand">Hash Salman Trading</div>
    <div class="footer-sub">hashsalman.com • XAUUSD Gold Trading</div>
  </div>
</div>
</body>
</html>`;
}

function emailActivated(name, daily, weekly, monthly, total) {
  return `
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  body{margin:0;padding:0;background:#f0f4ff;font-family:'Segoe UI',sans-serif}
  .wrap{max-width:520px;margin:30px auto;background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,.08)}
  .header{background:linear-gradient(135deg,#0a2463,#1a56db);padding:28px 24px;text-align:center}
  .logo{font-size:28px;font-weight:900;color:#fbbf24;letter-spacing:1px}
  .tagline{color:#a5f3fc;font-size:12px;margin-top:4px;letter-spacing:2px}
  .body{padding:28px 24px}
  .greeting{font-size:16px;color:#1e293b;margin-bottom:16px}
  .status-box{background:#dcfce7;border:2px solid #86efac;border-radius:10px;padding:16px;text-align:center;margin-bottom:20px}
  .status-icon{font-size:32px;margin-bottom:6px}
  .status-text{font-size:16px;font-weight:700;color:#16a34a}
  .pnl-box{background:#eff6ff;border-radius:10px;padding:18px;margin-bottom:20px;border:1px solid #dbeafe}
  .pnl-title{font-size:13px;font-weight:700;color:#1a56db;margin-bottom:12px;text-transform:uppercase;letter-spacing:.5px}
  .pnl-row{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #dbeafe;font-size:14px}
  .pnl-row:last-child{border:none}
  .pnl-label{color:#64748b}
  .pnl-value{font-weight:700;color:#16a34a}
  .pnl-value.neg{color:#ef4444}
  .portal-box{background:linear-gradient(135deg,#0a2463,#1a56db);border-radius:10px;padding:20px;text-align:center;margin-bottom:20px}
  .portal-text{color:#a5f3fc;font-size:13px;margin-bottom:14px;line-height:1.6}
  .btn{display:inline-block;background:linear-gradient(90deg,#f59e0b,#fbbf24);color:#000;font-weight:800;font-size:14px;padding:12px 28px;border-radius:25px;text-decoration:none}
  .footer{background:#f8fbff;padding:16px 24px;text-align:center;border-top:1px solid #e2e8f0}
  .footer-brand{font-size:13px;font-weight:700;color:#1a56db}
  .footer-sub{font-size:11px;color:#94a3b8;margin-top:4px}
  .wa-link{color:#25d366;font-weight:600;text-decoration:none}
</style>
</head>
<body>
<div class="wrap">
  <div class="header">
    <div class="logo">Trade Master HS</div>
    <div class="tagline">FOCUS • DISCIPLINE • GROWTH</div>
  </div>
  <div class="body">
    <div class="greeting">Hi <strong>${name}</strong>,</div>
    <div class="status-box">
      <div class="status-icon">✅</div>
      <div class="status-text">Your Bot Has Been Activated!</div>
    </div>
    <div class="pnl-box">
      <div class="pnl-title">📊 Your Performance Summary</div>
      <div class="pnl-row">
        <span class="pnl-label">Today's P/L</span>
        <span class="pnl-value ${parseFloat(daily)<0?'neg':''}">${parseFloat(daily)>=0?'+$':'-$'}${Math.abs(parseFloat(daily)||0).toFixed(2)}</span>
      </div>
      <div class="pnl-row">
        <span class="pnl-label">Weekly P/L</span>
        <span class="pnl-value ${parseFloat(weekly)<0?'neg':''}">${parseFloat(weekly)>=0?'+$':'-$'}${Math.abs(parseFloat(weekly)||0).toFixed(2)}</span>
      </div>
      <div class="pnl-row">
        <span class="pnl-label">Monthly P/L</span>
        <span class="pnl-value ${parseFloat(monthly)<0?'neg':''}">${parseFloat(monthly)>=0?'+$':'-$'}${Math.abs(parseFloat(monthly)||0).toFixed(2)}</span>
      </div>
      <div class="pnl-row">
        <span class="pnl-label">Total P/L</span>
        <span class="pnl-value ${parseFloat(total)<0?'neg':''}">${parseFloat(total)>=0?'+$':'-$'}${Math.abs(parseFloat(total)||0).toFixed(2)}</span>
      </div>
    </div>
    <div class="portal-box">
      <div class="portal-text">
        Your bot is now <strong style="color:#4ade80">ACTIVE</strong> and trading!<br>
        Track your performance on your VIP Client Portal:
      </div>
      <a href="https://hashsalman.com/client" class="btn">🔗 View My Dashboard</a>
    </div>
    <p style="font-size:12px;color:#64748b;text-align:center">
      Need help? Contact us on WhatsApp:<br>
      <a href="https://wa.me/923023464786" class="wa-link">📱 +92 302 3464786</a>
    </p>
  </div>
  <div class="footer">
    <div class="footer-brand">Hash Salman Trading</div>
    <div class="footer-sub">hashsalman.com • XAUUSD Gold Trading</div>
  </div>
</div>
</body>
</html>`;
}

function emailWelcome(name, account, password) {
  return `
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  body{margin:0;padding:0;background:#f0f4ff;font-family:'Segoe UI',sans-serif}
  .wrap{max-width:520px;margin:30px auto;background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,.08)}
  .header{background:linear-gradient(135deg,#0a2463,#1a56db);padding:28px 24px;text-align:center}
  .logo{font-size:28px;font-weight:900;color:#fbbf24;letter-spacing:1px}
  .tagline{color:#a5f3fc;font-size:12px;margin-top:4px;letter-spacing:2px}
  .body{padding:28px 24px}
  .greeting{font-size:16px;color:#1e293b;margin-bottom:16px}
  .welcome-box{background:linear-gradient(135deg,#0a2463,#1a56db);border-radius:10px;padding:20px;text-align:center;margin-bottom:20px}
  .welcome-icon{font-size:40px;margin-bottom:8px}
  .welcome-text{color:#fff;font-size:18px;font-weight:800}
  .welcome-sub{color:#a5f3fc;font-size:12px;margin-top:4px}
  .creds-box{background:#eff6ff;border-radius:10px;padding:18px;margin-bottom:20px;border:1px solid #dbeafe}
  .creds-title{font-size:13px;font-weight:700;color:#1a56db;margin-bottom:12px;text-transform:uppercase;letter-spacing:.5px}
  .cred-row{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #dbeafe;font-size:14px}
  .cred-row:last-child{border:none}
  .cred-label{color:#64748b}
  .cred-value{font-weight:700;color:#1e293b;font-family:monospace}
  .portal-box{text-align:center;margin-bottom:20px}
  .btn{display:inline-block;background:linear-gradient(90deg,#f59e0b,#fbbf24);color:#000;font-weight:800;font-size:14px;padding:12px 28px;border-radius:25px;text-decoration:none}
  .footer{background:#f8fbff;padding:16px 24px;text-align:center;border-top:1px solid #e2e8f0}
  .footer-brand{font-size:13px;font-weight:700;color:#1a56db}
  .footer-sub{font-size:11px;color:#94a3b8;margin-top:4px}
  .wa-link{color:#25d366;font-weight:600;text-decoration:none}
</style>
</head>
<body>
<div class="wrap">
  <div class="header">
    <div class="logo">Trade Master HS</div>
    <div class="tagline">FOCUS • DISCIPLINE • GROWTH</div>
  </div>
  <div class="body">
    <div class="greeting">Welcome <strong>${name}</strong>! 🎉</div>
    <div class="welcome-box">
      <div class="welcome-icon">🏆</div>
      <div class="welcome-text">You're Now a VIP Client!</div>
      <div class="welcome-sub">Hash Legend Bot is Active on Your Account</div>
    </div>
    <div class="creds-box">
      <div class="creds-title">🔐 Your VIP Portal Login</div>
      <div class="cred-row">
        <span class="cred-label">Portal URL</span>
        <span class="cred-value">hashsalman.com/client</span>
      </div>
      <div class="cred-row">
        <span class="cred-label">Account #</span>
        <span class="cred-value">${account}</span>
      </div>
      <div class="cred-row">
        <span class="cred-label">Password</span>
        <span class="cred-value">${password}</span>
      </div>
    </div>
    <div class="portal-box">
      <a href="https://hashsalman.com/client" class="btn">🔗 Login to VIP Portal</a>
    </div>
    <p style="font-size:12px;color:#64748b;text-align:center;line-height:1.6">
      Your bot is now running 24/7 on XAUUSD (Gold).<br>
      Track your daily, weekly & monthly profits anytime.<br><br>
      Need help? WhatsApp us:<br>
      <a href="https://wa.me/923023464786" class="wa-link">📱 +92 302 3464786</a>
    </p>
  </div>
  <div class="footer">
    <div class="footer-brand">Hash Salman Trading</div>
    <div class="footer-sub">hashsalman.com • XAUUSD Gold Trading</div>
  </div>
</div>
</body>
</html>`;
}

function emailExpired(name, daily, weekly, monthly, total) {
  return `
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  body{margin:0;padding:0;background:#f0f4ff;font-family:'Segoe UI',sans-serif}
  .wrap{max-width:520px;margin:30px auto;background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,.08)}
  .header{background:linear-gradient(135deg,#0a2463,#1a56db);padding:28px 24px;text-align:center}
  .logo{font-size:28px;font-weight:900;color:#fbbf24;letter-spacing:1px}
  .tagline{color:#a5f3fc;font-size:12px;margin-top:4px;letter-spacing:2px}
  .body{padding:28px 24px}
  .greeting{font-size:16px;color:#1e293b;margin-bottom:16px}
  .status-box{background:#fff7ed;border:2px solid #fed7aa;border-radius:10px;padding:16px;text-align:center;margin-bottom:20px}
  .status-icon{font-size:32px;margin-bottom:6px}
  .status-text{font-size:16px;font-weight:700;color:#c2410c}
  .pnl-box{background:#eff6ff;border-radius:10px;padding:18px;margin-bottom:20px;border:1px solid #dbeafe}
  .pnl-title{font-size:13px;font-weight:700;color:#1a56db;margin-bottom:12px;text-transform:uppercase;letter-spacing:.5px}
  .pnl-row{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #dbeafe;font-size:14px}
  .pnl-row:last-child{border:none}
  .pnl-label{color:#64748b}
  .pnl-value{font-weight:700;color:#16a34a}
  .pnl-value.neg{color:#ef4444}
  .renew-box{background:linear-gradient(135deg,#0a2463,#1a56db);border-radius:10px;padding:20px;text-align:center;margin-bottom:20px}
  .renew-text{color:#a5f3fc;font-size:13px;margin-bottom:14px;line-height:1.6}
  .btn{display:inline-block;background:linear-gradient(90deg,#f59e0b,#fbbf24);color:#000;font-weight:800;font-size:14px;padding:12px 28px;border-radius:25px;text-decoration:none}
  .footer{background:#f8fbff;padding:16px 24px;text-align:center;border-top:1px solid #e2e8f0}
  .footer-brand{font-size:13px;font-weight:700;color:#1a56db}
  .footer-sub{font-size:11px;color:#94a3b8;margin-top:4px}
  .wa-link{color:#25d366;font-weight:600;text-decoration:none}
</style>
</head>
<body>
<div class="wrap">
  <div class="header">
    <div class="logo">Trade Master HS</div>
    <div class="tagline">FOCUS • DISCIPLINE • GROWTH</div>
  </div>
  <div class="body">
    <div class="greeting">Hi <strong>${name}</strong>,</div>
    <div class="status-box">
      <div class="status-icon">⚠️</div>
      <div class="status-text">Your License Has Expired</div>
    </div>
    <div class="pnl-box">
      <div class="pnl-title">📊 Your Final Performance Summary</div>
      <div class="pnl-row">
        <span class="pnl-label">Today's P/L</span>
        <span class="pnl-value ${parseFloat(daily)<0?'neg':''}">${parseFloat(daily)>=0?'+$':'-$'}${Math.abs(parseFloat(daily)||0).toFixed(2)}</span>
      </div>
      <div class="pnl-row">
        <span class="pnl-label">Weekly P/L</span>
        <span class="pnl-value ${parseFloat(weekly)<0?'neg':''}">${parseFloat(weekly)>=0?'+$':'-$'}${Math.abs(parseFloat(weekly)||0).toFixed(2)}</span>
      </div>
      <div class="pnl-row">
        <span class="pnl-label">Monthly P/L</span>
        <span class="pnl-value ${parseFloat(monthly)<0?'neg':''}">${parseFloat(monthly)>=0?'+$':'-$'}${Math.abs(parseFloat(monthly)||0).toFixed(2)}</span>
      </div>
      <div class="pnl-row">
        <span class="pnl-label">Total P/L</span>
        <span class="pnl-value ${parseFloat(total)<0?'neg':''}">${parseFloat(total)>=0?'+$':'-$'}${Math.abs(parseFloat(total)||0).toFixed(2)}</span>
      </div>
    </div>
    <div class="renew-box">
      <div class="renew-text">
        Your Hash Legend license has <strong style="color:#fbbf24">EXPIRED</strong>.<br>
        Contact Hash Salman to renew and continue trading:
      </div>
      <a href="https://wa.me/923023464786" class="btn">📱 Renew Now on WhatsApp</a>
    </div>
  </div>
  <div class="footer">
    <div class="footer-brand">Hash Salman Trading</div>
    <div class="footer-sub">hashsalman.com • XAUUSD Gold Trading</div>
  </div>
</div>
</body>
</html>`;
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
  // Welcome email
  if (email) {
    await sendEmail(email, '🏆 Welcome to Trade Master HS — Your Bot is Active!', emailWelcome(name, account, clientPassword));
  }
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

app.post('/api/bots/activate/:id', adminAuth, async (req, res) => {
  const db = getDB();
  const bot = db.bots.find(b => b.id == req.params.id);
  if (!bot) return res.status(404).json({ error: 'Not found' });
  bot.status = 'ACTIVE'; log(db, 'BOT_ACTIVATED', bot.name, bot.account); saveDB(db);
  // Activation email
  if (bot.clientEmail) {
    const s = bot.stats || {};
    await sendEmail(bot.clientEmail, '✅ Your Hash Legend Bot is Now Active!',
      emailActivated(bot.name, s.daily||0, s.weekly||0, s.monthly||0, s.total||0));
  }
  res.json({ ok: true });
});

app.post('/api/bots/disable/:id', adminAuth, async (req, res) => {
  const db = getDB();
  const bot = db.bots.find(b => b.id == req.params.id);
  if (!bot) return res.status(404).json({ error: 'Not found' });
  bot.status = 'DISABLED'; log(db, 'BOT_DISABLED', bot.name, bot.account); saveDB(db);
  // Disable email
  if (bot.clientEmail) {
    const s = bot.stats || {};
    await sendEmail(bot.clientEmail, '⏸ Your Hash Legend Bot Has Been Disabled',
      emailDisabled(bot.name, s.daily||0, s.weekly||0, s.monthly||0, s.total||0));
  }
  res.json({ ok: true });
});

app.post('/api/bots/delete/:id', adminAuth, (req, res) => {
  const db = getDB();
  const idx = db.bots.findIndex(b => b.id == req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  const bot = db.bots[idx]; db.bots.splice(idx, 1);
  log(db, 'BOT_DELETED', bot.name, bot.account); saveDB(db); res.json({ ok: true });
});

app.post('/api/bots/disable-all', adminAuth, async (req, res) => {
  const db = getDB();
  const promises = [];
  db.bots.forEach(b => {
    if (b.status === 'ACTIVE') {
      b.status = 'DISABLED';
      if (b.clientEmail) {
        const s = b.stats || {};
        promises.push(sendEmail(b.clientEmail, '⏸ Your Hash Legend Bot Has Been Disabled',
          emailDisabled(b.name, s.daily||0, s.weekly||0, s.monthly||0, s.total||0)));
      }
    }
  });
  db.signal = { type: 'DISABLED', time: new Date().toISOString(), from: 'admin' };
  log(db, 'ALL_DISABLED', 'ALL', '-'); saveDB(db);
  await Promise.all(promises);
  res.json({ ok: true });
});

app.post('/api/bots/activate-all', adminAuth, async (req, res) => {
  const db = getDB();
  const promises = [];
  db.bots.forEach(b => {
    if (b.status === 'DISABLED') {
      b.status = 'ACTIVE';
      if (b.clientEmail) {
        const s = b.stats || {};
        promises.push(sendEmail(b.clientEmail, '✅ Your Hash Legend Bot is Now Active!',
          emailActivated(b.name, s.daily||0, s.weekly||0, s.monthly||0, s.total||0)));
      }
    }
  });
  db.signal = { type: 'ACTIVE', time: new Date().toISOString(), from: 'admin' };
  log(db, 'ALL_ACTIVATED', 'ALL', '-'); saveDB(db);
  await Promise.all(promises);
  res.json({ ok: true });
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
  if (bot.expiry < today) {
    if (bot.status !== 'EXPIRED') {
      bot.status = 'EXPIRED'; saveDB(db);
      if (bot.clientEmail) {
        const s = bot.stats || {};
        sendEmail(bot.clientEmail, '⚠️ Your Hash Legend License Has Expired',
          emailExpired(bot.name, s.daily||0, s.weekly||0, s.monthly||0, s.total||0));
      }
    }
    return res.json({ status: 'EXPIRED' });
  }
  if (bot.status !== 'ACTIVE') return res.json({ status: bot.status });
  
  // ✅ FIX: CLOSE_NOW signal — send once then immediately reset to NORMAL
  const sig = db.signal || { type: 'NORMAL' };
  if (sig.type === 'CLOSE_NOW') {
    db.signal = { type: 'NORMAL', time: null };
    saveDB(db);
    return res.json({ status: 'ACTIVE', name: bot.name, expiry: bot.expiry, signal: { type: 'CLOSE_NOW' } });
  }
  
  return res.json({ status: 'ACTIVE', name: bot.name, expiry: bot.expiry, signal: sig });
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
  const prevTotal = found.stats ? (found.stats.total || 0) : 0;
  const newTotal = parseFloat(total)||0;
  
  found.stats = {
    daily: parseFloat(daily)||0, weekly: parseFloat(weekly)||0,
    monthly: parseFloat(monthly)||0, total: newTotal,
    wins: parseInt(wins)||0, losses: parseInt(losses)||0,
    balance: parseFloat(balance)||0, bot: bot||'',
    updatedAt: new Date().toISOString()
  };
  
  // ✅ Cumulative lifetime profit — never resets
  if (!db.cumulativeProfit) db.cumulativeProfit = {};
  db.cumulativeProfit[found.account] = newTotal;
  
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

app.post('/api/client/activate', clientAuth, async (req, res) => {
  const db = getDB();
  const bot = db.bots.find(b => b.account === req.clientAccount);
  if (!bot) return res.status(404).json({ error: 'Not found' });
  const today = new Date().toISOString().split('T')[0];
  if (bot.expiry < today) return res.status(403).json({ error: 'License expired' });
  bot.status = 'ACTIVE'; log(db, 'CLIENT_ACTIVATED', bot.name, bot.account); saveDB(db);
  // Activation email
  if (bot.clientEmail) {
    const s = bot.stats || {};
    await sendEmail(bot.clientEmail, '✅ Your Hash Legend Bot is Now Active!',
      emailActivated(bot.name, s.daily||0, s.weekly||0, s.monthly||0, s.total||0));
  }
  res.json({ ok: true });
});

app.post('/api/client/disable', clientAuth, async (req, res) => {
  const db = getDB();
  const bot = db.bots.find(b => b.account === req.clientAccount);
  if (!bot) return res.status(404).json({ error: 'Not found' });
  bot.status = 'DISABLED'; log(db, 'CLIENT_DISABLED', bot.name, bot.account); saveDB(db);
  // Disable email
  if (bot.clientEmail) {
    const s = bot.stats || {};
    await sendEmail(bot.clientEmail, '⏸ Your Hash Legend Bot Has Been Disabled',
      emailDisabled(bot.name, s.daily||0, s.weekly||0, s.monthly||0, s.total||0));
  }
  res.json({ ok: true });
});

app.post('/api/client/email', clientAuth, (req, res) => {
  const db = getDB();
  const bot = db.bots.find(b => b.account === req.clientAccount);
  if (!bot) return res.status(404).json({ error: 'Not found' });
  const { email } = req.body;
  if (!email || !email.includes('@')) return res.status(400).json({ error: 'Valid email required' });
  bot.clientEmail = email; saveDB(db); res.json({ ok: true });
});

// ── TOTAL PROFIT ─────────────────────────────────────
app.get('/api/total-profit', (req, res) => {
  const db = getDB();
  // ✅ Only count POSITIVE profits — losing trades ignored
  let total = 0;
  if (db.cumulativeProfit) {
    Object.values(db.cumulativeProfit).forEach(v => {
      const val = parseFloat(v) || 0;
      if (val > 0) total += val; // Only positive
    });
  }
  // Also from current stats if not in cumulative yet
  if (db.bots) {
    db.bots.forEach(b => {
      if (b.stats && b.stats.total && !db.cumulativeProfit?.[b.account]) {
        const val = parseFloat(b.stats.total) || 0;
        if (val > 0) total += val; // Only positive
      }
    });
  }
  res.json({ total: parseFloat(total.toFixed(2)), clients: db.bots ? db.bots.length : 0 });
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
app.get('/api/health', (req, res) => res.json({ ok: true, db: DB, time: new Date().toISOString(), email: RESEND_KEY ? 'configured' : 'not configured' }));

// ── PAGES ─────────────────────────────────────────────
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'home.html')));
app.get('/client', (req, res) => res.sendFile(path.join(__dirname, 'client.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('*', (req, res) => res.redirect('/'));

app.listen(PORT, () => {
  console.log('Hash Salman Panel running on port ' + PORT);
  console.log('DB:', DB);
  console.log('Email:', RESEND_KEY ? 'Resend configured ✅' : 'No email key ❌');
});
