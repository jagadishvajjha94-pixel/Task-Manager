const crypto = require('crypto');
const store = require('../../../_store');

const SALT = 'taskmanager-salt-v1';

function hashPassword(password) {
  return crypto.pbkdf2Sync(password, SALT, 100000, 64, 'sha512').toString('hex');
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

  const emailStr = typeof body.email === 'string' ? body.email.trim() : '';
  const passwordStr = body.password != null ? String(body.password) : '';
  const nameStr = typeof body.name === 'string' ? body.name.trim() : '';
  const canCreateAndAssign = !!body.canCreateAndAssign;

  if (!emailStr) {
    return res.status(400).json({ error: 'Employee email required' });
  }
  if (!passwordStr || passwordStr.length < 6) {
    return res.status(400).json({ error: 'Password required (min 6 characters)' });
  }

  const employees = await store.getEmployees();
  const existing = employees.find(e => (e.email || '').toLowerCase() === emailStr.toLowerCase());
  if (existing) {
    return res.status(400).json({ error: 'An employee with this email already has a login' });
  }

  const id = 'emp_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9);
  employees.push({
    id,
    email: emailStr.toLowerCase(),
    name: nameStr || emailStr.split('@')[0] || 'Employee',
    passwordHash: hashPassword(passwordStr),
    canCreateAndAssign,
    createdAt: new Date().toISOString()
  });
  await store.setEmployees(employees);

  res.status(200).json({
    ok: true,
    employee: {
      id,
      email: emailStr,
      name: nameStr || emailStr.split('@')[0],
      canCreateAndAssign
    }
  });
};
