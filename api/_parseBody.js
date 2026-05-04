/**
 * Normalize JSON request bodies on Vercel/serverless: body may be an object,
 * a string, a Buffer, or only available on the raw stream.
 */
async function parseJsonBody(req) {
  let b = req.body;

  if (Buffer.isBuffer(b)) {
    try {
      b = JSON.parse(b.toString('utf8') || '{}');
    } catch (_) {
      b = {};
    }
    return b && typeof b === 'object' ? b : {};
  }
  if (typeof b === 'string') {
    try {
      return b.trim() ? JSON.parse(b) : {};
    } catch (_) {
      return {};
    }
  }
  if (b != null && typeof b === 'object') {
    return b;
  }

  if (typeof req.on !== 'function') {
    return {};
  }

  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => {
      data += chunk.toString();
    });
    req.on('end', () => {
      try {
        resolve(data.trim() ? JSON.parse(data) : {});
      } catch (_) {
        resolve({});
      }
    });
    req.on('error', reject);
  });
}

module.exports = { parseJsonBody };
