const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const os = require('os');

const DATA_DIR = path.join(os.tmpdir(), 'taskmanager-data');
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

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let body = req.body;
  if (!body && typeof req.on === 'function') {
    body = await new Promise((resolve, reject) => {
      let data = '';
      req.on('data', (chunk) => { data += chunk; });
      req.on('end', () => {
        try {
          resolve(data ? JSON.parse(data) : {});
        } catch (e) {
          resolve({});
        }
      });
      req.on('error', reject);
    });
  }
  body = body || {};

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
  if (!m) {
    return res.status(500).json({ error: 'Manager not configured' });
  }
  const hash = hashPassword(password);
  if (m.email.toLowerCase() !== email.toLowerCase() || m.passwordHash !== hash) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }
  res.status(200).json({
    ok: true,
    user: { id: 'm1', name: m.name || 'Manager', email: m.email, role: 'manager' },
  });
};
