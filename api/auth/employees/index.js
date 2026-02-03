const store = require('../../_store');

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

  const employees = await store.getEmployees();
  res.status(200).json(
    employees.map(e => ({
      id: e.id,
      email: e.email,
      name: e.name,
      canCreateAndAssign: !!e.canCreateAndAssign,
      createdAt: e.createdAt
    }))
  );
};
