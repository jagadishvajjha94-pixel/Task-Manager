const store = require('./_store');

const DEFAULT_COLUMNS = [
  { id: 'todo', title: 'To Do', cards: [] },
  { id: 'progress', title: 'In Progress', cards: [] },
  { id: 'done', title: 'Done', cards: [] }
];

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-User-Role, X-User-Id, X-Can-Edit-Board');

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
    if (!Array.isArray(data.columns)) data.columns = [];
    if (data.columns.length === 0) {
      data.columns = DEFAULT_COLUMNS.map(c => ({ ...c, cards: [] }));
    }
    return res.status(200).json(data);
  }

  if (req.method === 'PUT') {
    const role = (req.headers['x-user-role'] || '').toLowerCase();
    const canEditBoard = (req.headers['x-can-edit-board'] || '').toLowerCase() === 'true';
    const allowed = role === 'manager' || (role === 'employee' && canEditBoard);
    if (!allowed) {
      return res.status(403).json({ error: 'Only managers or employees with create & assign rights can update the board.' });
    }
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
      if (!Array.isArray(board.columns)) board.columns = [];
      if (board.columns.length === 0) {
        board.columns = DEFAULT_COLUMNS.map(c => ({ ...c, cards: [] }));
      }
      await store.setBoard(board);
      return res.status(200).json({ ok: true });
    }
    return res.status(400).json({ error: 'Invalid board data' });
  }

  res.setHeader('Allow', 'GET, PUT, OPTIONS');
  return res.status(405).json({ error: 'Method not allowed' });
};
