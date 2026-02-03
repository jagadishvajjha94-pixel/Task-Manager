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
      req.on('data', chunk => {
        data += chunk;
      });
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

  const { email, currentPassword, newPassword } = body;
  if (!email || !currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Email, current password, and new password required' });
  }
  const m = readManager();
  if (!m) {
    return res.status(500).json({ error: 'Manager not configured' });
  }
  if (m.email.toLowerCase() !== String(email).trim().toLowerCase()) {
    return res.status(401).json({ error: 'Invalid email' });
  }
  if (m.passwordHash !== hashPassword(currentPassword)) {
    return res.status(401).json({ error: 'Current password is incorrect' });
  }
  if (String(newPassword).length < 6) {
    return res.status(400).json({ error: 'New password must be at least 6 characters' });
  }
  m.passwordHash = hashPassword(newPassword);
  if (body.name) m.name = body.name;
  writeManager(m);
  res.status(200).json({ ok: true });
};
