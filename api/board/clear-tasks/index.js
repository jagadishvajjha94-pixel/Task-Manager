const store = require('../../_store');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-User-Role, X-User-Id');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const role = (req.headers['x-user-role'] || '').toLowerCase();
  if (role !== 'manager') {
    return res.status(403).json({ error: 'Only managers can clear the task database.' });
  }

  const board = await store.getBoard();
  const data = board || {
    columns: [],
    departments: [],
    notifications: [],
    users: [],
    upcomingTasks: [],
    recurringTasks: [],
    employeeProfiles: {}
  };
  if (!Array.isArray(data.columns)) data.columns = [];
  if (!Array.isArray(data.departments)) data.departments = [];
  if (typeof data.employeeProfiles !== 'object') data.employeeProfiles = {};
  if (typeof data.employeeAccuracyHistory !== 'object') data.employeeAccuracyHistory = {};
  if (!Array.isArray(data.users)) data.users = [];

  data.columns = data.columns.map(col => ({
    id: col.id || (col.title && col.title.toLowerCase().replace(/\s+/g, '-')) || 'col',
    title: col.title || 'Column',
    cards: []
  }));
  if (data.columns.length === 0) {
    data.columns = [
      { id: 'todo', title: 'To Do', cards: [] },
      { id: 'progress', title: 'In Progress', cards: [] },
      { id: 'done', title: 'Done', cards: [] }
    ];
  }
  data.upcomingTasks = [];
  data.notifications = [];
  data.recurringTasks = [];

  await store.setBoard(data);
  return res.status(200).json({ ok: true });
};
