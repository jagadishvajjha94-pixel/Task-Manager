const crypto = require('crypto');
const store = require('../../../_store');

const SALT = 'taskmanager-salt-v1';

function hashPassword(password) {
  return crypto.pbkdf2Sync(password, SALT, 100000, 64, 'sha512').toString('hex');
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-User-Role, X-User-Id');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'PUT') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const role = (req.headers['x-user-role'] || '').toLowerCase();
  if (role !== 'manager') {
    return res.status(403).json({ error: 'Only managers can update employee logins.' });
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

  const idStr = typeof body.id === 'string' ? body.id.trim() : '';
  if (!idStr) {
    return res.status(400).json({ error: 'Employee id required' });
  }

  const employees = await store.getEmployees();
  const index = employees.findIndex(e => e.id === idStr);
  if (index === -1) {
    return res.status(404).json({ error: 'Employee login not found' });
  }

  const emp = employees[index];
  const emailStr = typeof body.email === 'string' ? body.email.trim() : '';
  if (emailStr) {
    const existing = employees.find(e => e.id !== idStr && (e.email || '').toLowerCase() === emailStr.toLowerCase());
    if (existing) {
      return res.status(400).json({ error: 'Another employee already has this email' });
    }
    emp.email = emailStr.toLowerCase();
  }
  if (typeof body.name === 'string') {
    emp.name = body.name.trim() || (emp.email || '').split('@')[0] || 'Employee';
  }
  if (body.password != null && String(body.password).trim().length >= 6) {
    emp.passwordHash = hashPassword(String(body.password));
  }
  if (typeof body.canCreateAndAssign === 'boolean') {
    emp.canCreateAndAssign = body.canCreateAndAssign;
  }

  employees[index] = emp;
  await store.setEmployees(employees);

  res.status(200).json({
    ok: true,
    employee: { id: emp.id, email: emp.email, name: emp.name, canCreateAndAssign: !!emp.canCreateAndAssign }
  });
};
