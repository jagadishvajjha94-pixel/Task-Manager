const crypto = require('crypto');
const store = require('../../_store');

const SALT = 'taskmanager-salt-v1';

function hashPassword(password) {
  return crypto.pbkdf2Sync(password, SALT, 100000, 64, 'sha512').toString('hex');
}

async function seedManagerIfNeeded() {
  let m = await store.getManager();
  if (!m || !m.email) {
    m = {
      email: 'manager@company.com',
      name: 'Manager',
      passwordHash: hashPassword('Manager@123')
    };
    await store.setManager(m);
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

  const email = typeof body.email === 'string' ? body.email.trim() : '';
  const password = body.password != null ? String(body.password) : '';
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required' });
  }

  let m = await store.getManager();
  if (!m || !m.email) {
    await seedManagerIfNeeded();
    m = await store.getManager();
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
    user: { id: 'm1', name: m.name || 'Manager', email: m.email, role: 'manager', canCreateAndAssign: true }
  });
};
