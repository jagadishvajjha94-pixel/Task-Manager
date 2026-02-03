const store = require('./_store');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'GET') {
    const board = await store.getBoard();
    const data = board || { columns: [], notifications: [], users: [], upcomingTasks: [], departments: [] };
    if (!Array.isArray(data.notifications)) data.notifications = [];
    if (!Array.isArray(data.users)) data.users = [];
    if (!Array.isArray(data.upcomingTasks)) data.upcomingTasks = [];
    if (!Array.isArray(data.departments)) data.departments = [];
    return res.status(200).json(data);
  }

  if (req.method === 'PUT') {
    let board = req.body;
    if (!board && typeof req.on === 'function') {
      board = await new Promise((resolve, reject) => {
        let data = '';
        req.on('data', chunk => {
          data += chunk;
        });
        req.on('end', () => {
          try {
            resolve(data ? JSON.parse(data) : null);
          } catch (e) {
            resolve(null);
          }
        });
        req.on('error', reject);
      });
    }
    if (board && typeof board === 'object') {
      await store.setBoard(board);
      return res.status(200).json({ ok: true });
    }
    return res.status(400).json({ error: 'Invalid board data' });
  }

  res.setHeader('Allow', 'GET, PUT, OPTIONS');
  return res.status(405).json({ error: 'Method not allowed' });
};
