const store = require('../_store');

const STATUS_TIMEOUT_MS = 8000;

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))
  ]);
}

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
    const payload = await withTimeout(
      (async () => {
        const backend = store.getStoreBackend();
        const manager = await store.getManager();
        const employees = await store.getEmployees();
        return { backend, manager, employees };
      })(),
      STATUS_TIMEOUT_MS
    );
    res.status(200).json({
      backend: payload.backend,
      hasManager: !!(payload.manager && payload.manager.email),
      employeeCount: Array.isArray(payload.employees) ? payload.employees.length : 0,
      hint:
        payload.backend === 'file'
          ? 'Connect Upstash Redis (REST: UPSTASH_* or KV_REST_*) to this Vercel project. On Vercel, REDIS_URL (TCP) is skipped to avoid gateway timeouts; remove it if you only use Upstash.'
          : null
    });
  } catch (e) {
    if (e && e.message === 'timeout') {
      return res.status(503).json({
        error: 'Store check timed out',
        backend: store.getStoreBackend(),
        hint:
          'If REDIS_URL is set on Vercel, TCP Redis connect can hang. Remove REDIS_URL or add Upstash REST (UPSTASH_REDIS_REST_URL + TOKEN) and redeploy.'
      });
    }
    res.status(500).json({ error: 'Store check failed', backend: store.getStoreBackend() });
  }
};
