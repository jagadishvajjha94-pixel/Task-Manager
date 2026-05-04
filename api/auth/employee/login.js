const crypto = require('crypto');
const store = require('../../_store');
const { parseJsonBody } = require('../../_parseBody');

const SALT = process.env.PASSWORD_SALT || 'taskmanager-salt-v1';

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

  const body = await parseJsonBody(req);

  const email = typeof body.email === 'string' ? body.email.trim() : '';
  const password = body.password != null ? String(body.password).trim() : '';

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required' });
  }

  const employees = await store.getEmployees();
  const emp = employees.find(e => (e.email || '').toLowerCase() === email.toLowerCase());
  if (!emp) {
    const backend = store.getStoreBackend();
    const onVercel = !!process.env.VERCEL;
    let hint = '';
    if (backend === 'file' && onVercel) {
      hint =
        ' This deployment is not using shared Redis (each server is separate). Connect Upstash under Vercel → Storage, add UPSTASH_* REST env vars, redeploy, then ask your manager to create your login again.';
    } else if (backend === 'file') {
      hint = ' If you were just added, ask your manager to confirm the account was saved.';
    }
    return res.status(401).json({
      error: 'Invalid email or password' + hint
    });
  }
  const inputHash = hashPassword(password);
  if (emp.passwordHash !== inputHash) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  res.status(200).json({
    ok: true,
    user: {
      id: emp.id,
      name: emp.name || emp.email.split('@')[0],
      email: emp.email,
      role: 'employee',
      canCreateAndAssign: !!emp.canCreateAndAssign
    }
  });
};
