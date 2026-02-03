const path = require('path');
const fs = require('fs');
const os = require('os');

const DATA_DIR = path.join(os.tmpdir(), 'taskmanager-data');
const EMPLOYEES_FILE = path.join(DATA_DIR, 'employees.json');

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function readEmployees() {
  ensureDataDir();
  if (fs.existsSync(EMPLOYEES_FILE)) {
    try {
      const data = JSON.parse(fs.readFileSync(EMPLOYEES_FILE, 'utf8'));
      return Array.isArray(data) ? data : [];
    } catch (e) {
      return [];
    }
  }
  return [];
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

  const employees = readEmployees();
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
