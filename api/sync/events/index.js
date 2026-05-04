/**
 * SSE endpoint for Vercel. Keeps connection alive with heartbeats.
 * (Broadcasting board-updated from PUT /api/board would require Redis pub/sub; for now this avoids 404.)
 */
const HEARTBEAT_MS = 20000;

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).end();
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  if (res.flushHeaders) res.flushHeaders();

  const send = data => {
    try {
      res.write(typeof data === 'string' ? data : data + '\n\n');
      if (res.flush) res.flush();
    } catch (_) {}
  };

  const heartbeat = setInterval(() => {
    send(': heartbeat');
  }, HEARTBEAT_MS);

  req.on('close', () => {
    clearInterval(heartbeat);
  });

  // Send initial comment so client sees connection opened
  send(': ok');
};
