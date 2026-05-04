const store = require('../_store');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const backend = store.getStoreBackend();
    const manager = await store.getManager();
    const employees = await store.getEmployees();
    res.status(200).json({
      backend,
      hasManager: !!(manager && manager.email),
      employeeCount: Array.isArray(employees) ? employees.length : 0,
      hint:
        backend === 'file'
          ? 'Connect Upstash Redis to this Vercel project (Storage) and redeploy so login persists.'
          : null
    });
  } catch (e) {
    res.status(500).json({ error: 'Store check failed', backend: store.getStoreBackend() });
  }
};
