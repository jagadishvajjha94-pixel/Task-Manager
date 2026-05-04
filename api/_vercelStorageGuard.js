const store = require('./_store');

/**
 * On Vercel, /tmp is not shared between invocations. Block employee-account writes
 * until Upstash/KV REST is connected (getStoreBackend() !== 'file').
 * @returns {boolean} true if request was ended with 503
 */
function blockIfEphemeralVercelStorage(res) {
  if (!process.env.VERCEL) return false;
  if (store.getStoreBackend() !== 'file') return false;
  res.status(503).json({
    error:
      'Employee logins need shared storage on Vercel. Connect Upstash Redis (Project → Storage), add UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN to Production, remove REDIS_URL if you see timeouts, redeploy, then confirm /api/store-status shows "backend":"upstash". Until then, new employees will not be able to sign in from other instances.'
  });
  return true;
}

module.exports = { blockIfEphemeralVercelStorage };
