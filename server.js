const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const https = require('https');

const app = express();
const PORT = process.env.PORT || 3000;
const os = require('os');
const DATA_DIR = process.env.VERCEL
  ? path.join(os.tmpdir(), 'taskmanager-data')
  : path.join(__dirname, 'data');
const BOARD_FILE = path.join(DATA_DIR, 'board.json');
const MANAGER_FILE = path.join(DATA_DIR, 'manager.json');
const SALT = 'taskmanager-salt-v1';

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function hashPassword(password) {
  return crypto.pbkdf2Sync(password, SALT, 100000, 64, 'sha512').toString('hex');
}

function readManager() {
  ensureDataDir();
  if (fs.existsSync(MANAGER_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(MANAGER_FILE, 'utf8'));
    } catch (e) {
      return null;
    }
  }
  return null;
}

function writeManager(data) {
  ensureDataDir();
  fs.writeFileSync(MANAGER_FILE, JSON.stringify(data, null, 2), 'utf8');
}

function seedManagerIfNeeded() {
  let m = readManager();
  if (!m || !m.email) {
    m = {
      email: 'manager@company.com',
      name: 'Manager',
      passwordHash: hashPassword('Manager@123'),
    };
    writeManager(m);
  }
  return m;
}

seedManagerIfNeeded();

function readBoard() {
  ensureDataDir();
  if (fs.existsSync(BOARD_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(BOARD_FILE, 'utf8'));
    } catch (e) {
      return null;
    }
  }
  return null;
}

function writeBoard(data) {
  ensureDataDir();
  fs.writeFileSync(BOARD_FILE, JSON.stringify(data, null, 2), 'utf8');
}

app.use(express.json({ limit: '1mb' }));
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});
app.use('/assets', express.static(path.join(__dirname, 'assets')));
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'html', 'index.html'));
});
app.use(express.static(path.join(__dirname, 'html')));

app.post('/api/auth/manager/login', (req, res) => {
  const body = req.body || {};
  const email = typeof body.email === 'string' ? body.email.trim() : '';
  const password = body.password != null ? String(body.password) : '';
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required' });
  }
  let m = readManager();
  if (!m || !m.email) {
    seedManagerIfNeeded();
    m = readManager();
  }
  if (!m) return res.status(500).json({ error: 'Manager not configured' });
  const hash = hashPassword(password);
  if (m.email.toLowerCase() !== email.toLowerCase() || m.passwordHash !== hash) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }
  res.json({
    ok: true,
    user: { id: 'm1', name: m.name || 'Manager', email: m.email, role: 'manager' },
  });
});

app.post('/api/auth/manager/change-password', (req, res) => {
  const { email, currentPassword, newPassword } = req.body || {};
  if (!email || !currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Email, current password, and new password required' });
  }
  const m = readManager();
  if (!m) return res.status(500).json({ error: 'Manager not configured' });
  if (m.email.toLowerCase() !== email.toLowerCase().trim()) {
    return res.status(401).json({ error: 'Invalid email' });
  }
  if (m.passwordHash !== hashPassword(currentPassword)) {
    return res.status(401).json({ error: 'Current password is incorrect' });
  }
  if (newPassword.length < 6) {
    return res.status(400).json({ error: 'New password must be at least 6 characters' });
  }
  m.passwordHash = hashPassword(newPassword);
  if (req.body.name) m.name = req.body.name;
  writeManager(m);
  res.json({ ok: true });
});

function verifyGoogleToken(idToken) {
  return new Promise((resolve, reject) => {
    const url = `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`;
    https.get(url, (resp) => {
      let data = '';
      resp.on('data', (chunk) => { data += chunk; });
      resp.on('end', () => {
        try {
          const payload = JSON.parse(data);
          if (payload.error) return reject(new Error(payload.error));
          resolve(payload);
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

app.post('/api/auth/google', (req, res) => {
  const { credential } = req.body || {};
  if (!credential) {
    return res.status(400).json({ error: 'Google credential required' });
  }
  verifyGoogleToken(credential)
    .then((payload) => {
      const name = payload.name || payload.email?.split('@')[0] || 'Employee';
      const email = payload.email || '';
      res.json({
        ok: true,
        user: {
          id: 'g_' + (payload.sub || email).replace(/\W/g, '_'),
          name,
          email,
          role: 'employee',
        },
      });
    })
    .catch((err) => {
      console.error('Google token verify error:', err);
      res.status(401).json({ error: 'Invalid Google sign-in' });
    });
});

app.get('/api/board', (req, res) => {
  const board = readBoard();
  const data = board || { columns: [], notifications: [], users: [], upcomingTasks: [] };
  if (!Array.isArray(data.notifications)) data.notifications = [];
  if (!Array.isArray(data.users)) data.users = [];
  if (!Array.isArray(data.upcomingTasks)) data.upcomingTasks = [];
  res.json(data);
});

app.put('/api/board', (req, res) => {
  const board = req.body;
  if (board && typeof board === 'object') {
    writeBoard(board);
    res.json({ ok: true });
  } else {
    res.status(400).json({ error: 'Invalid board data' });
  }
});

app.listen(PORT, () => {
  console.log(`Kanban server running at http://localhost:${PORT}`);
  console.log('Open this URL in your browser.');
}).on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use. Try closing other apps or set PORT=3001 npm start`);
  } else {
    console.error('Server error:', err.message);
  }
  process.exit(1);
});
