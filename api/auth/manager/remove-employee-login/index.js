const store = require('../../../_store');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-User-Role, X-User-Id');

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

  const role = (req.headers['x-user-role'] || '').toLowerCase();
  if (role !== 'manager') {
    return res.status(403).json({ error: 'Only managers can remove employee logins.' });
  }

  const id = typeof body.id === 'string' ? body.id.trim() : '';
  if (!id) {
    return res.status(400).json({ error: 'Employee id required' });
  }

  const employees = await store.getEmployees();
  const filtered = employees.filter(e => e.id !== id);
  if (filtered.length === employees.length) {
    return res.status(404).json({ error: 'Employee login not found' });
  }

  await store.setEmployees(filtered);
  res.status(200).json({ ok: true });
};
