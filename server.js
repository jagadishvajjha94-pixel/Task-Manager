const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const https = require('https');

const app = express();
const PORT = process.env.PORT || 3000;
const os = require('os');
const DATA_DIR = process.env.VERCEL ? path.join(os.tmpdir(), 'taskmanager-data') : path.join(__dirname, 'data');
const BOARD_FILE = path.join(DATA_DIR, 'board.json');
const MANAGER_FILE = path.join(DATA_DIR, 'manager.json');
const EMPLOYEES_FILE = path.join(DATA_DIR, 'employees.json');
const SALT = process.env.PASSWORD_SALT || 'taskmanager-salt-v1';

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function hashPassword(password) {
  return crypto.pbkdf2Sync(password, SALT, 100000, 64, 'sha512').toString('hex');
}

function readManager() {
  ensureDataDir();
  if (fs.existsSync(MANAGER_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(MANAGER_FILE, 'utf8'));
    } catch (e) {
      return null;
    }
  }
  return null;
}

function writeManager(data) {
  ensureDataDir();
  fs.writeFileSync(MANAGER_FILE, JSON.stringify(data, null, 2), 'utf8');
}

function seedManagerIfNeeded() {
  let m = readManager();
  if (!m || !m.email) {
    m = {
      email: 'manager@company.com',
      name: 'Manager',
      passwordHash: hashPassword('Manager@123')
    };
    writeManager(m);
  }
  return m;
}

seedManagerIfNeeded();

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

function writeEmployees(employees) {
  ensureDataDir();
  fs.writeFileSync(EMPLOYEES_FILE, JSON.stringify(employees, null, 2), 'utf8');
}

function readBoard() {
  ensureDataDir();
  if (fs.existsSync(BOARD_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(BOARD_FILE, 'utf8'));
    } catch (e) {
      return null;
    }
  }
  return null;
}

function writeBoard(data) {
  ensureDataDir();
  fs.writeFileSync(BOARD_FILE, JSON.stringify(data, null, 2), 'utf8');
}

// Real-time sync: all connected clients receive updates (board or employees)
const syncClients = new Set();
function broadcastSync(event) {
  const payload = `data: ${event}\n\n`;
  syncClients.forEach(res => {
    try {
      res.write(payload);
    } catch (err) {
      syncClients.delete(res);
    }
  });
}

app.use(express.json({ limit: '1mb' }));
app.use((req, res, next) => {
  const allowedOrigin = process.env.CORS_ORIGIN || req.headers.origin || '*';
  res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-User-Role, X-User-Id, X-Can-Edit-Board');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});
app.use('/assets', express.static(path.join(__dirname, 'assets')));
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'html', 'index.html'));
});
app.use(express.static(path.join(__dirname, 'html')));

app.post('/api/auth/manager/login', (req, res) => {
  const body = req.body || {};
  const email = typeof body.email === 'string' ? body.email.trim() : '';
  const password = (body.password != null ? String(body.password) : '').trim();
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required' });
  }
  let m = readManager();
  if (!m || !m.email) {
    seedManagerIfNeeded();
    m = readManager();
  }
  if (!m) return res.status(500).json({ error: 'Manager not configured' });
  const hash = hashPassword(password);
  if (m.email.toLowerCase() !== email.toLowerCase() || m.passwordHash !== hash) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }
  res.json({
    ok: true,
    user: { id: 'm1', name: m.name || 'Manager', email: m.email, role: 'manager', canCreateAndAssign: true }
  });
});

// Manager creates employee login (email + password + permission)
app.post('/api/auth/manager/create-employee-login', (req, res) => {
  const role = (req.headers['x-user-role'] || '').toLowerCase();
  if (role !== 'manager') {
    return res.status(403).json({ error: 'Only managers can create employee logins.' });
  }
  const { email, password, name, canCreateAndAssign } = req.body || {};
  const emailStr = typeof email === 'string' ? email.trim() : '';
  const passwordStr = password != null ? String(password) : '';
  const nameStr = typeof name === 'string' ? name.trim() : '';
  if (!emailStr) {
    return res.status(400).json({ error: 'Employee email required' });
  }
  if (!passwordStr || passwordStr.length < 6) {
    return res.status(400).json({ error: 'Password required (min 6 characters)' });
  }
  const employees = readEmployees();
  const existing = employees.find(e => (e.email || '').toLowerCase() === emailStr.toLowerCase());
  if (existing) {
    return res.status(400).json({ error: 'An employee with this email already has a login' });
  }
  const id = 'emp_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9);
  employees.push({
    id,
    email: emailStr.toLowerCase(),
    name: nameStr || emailStr.split('@')[0] || 'Employee',
    passwordHash: hashPassword(passwordStr),
    canCreateAndAssign: !!canCreateAndAssign,
    createdAt: new Date().toISOString()
  });
  writeEmployees(employees);
  broadcastSync('employees-updated');
  res.json({
    ok: true,
    employee: { id, email: emailStr, name: nameStr || emailStr.split('@')[0], canCreateAndAssign: !!canCreateAndAssign }
  });
});

// Manager updates an employee login (email, name, password optional, canCreateAndAssign)
app.put('/api/auth/manager/update-employee-login', (req, res) => {
  const role = (req.headers['x-user-role'] || '').toLowerCase();
  if (role !== 'manager') {
    return res.status(403).json({ error: 'Only managers can update employee logins.' });
  }
  const { id, email, name, password, canCreateAndAssign } = req.body || {};
  const idStr = typeof id === 'string' ? id.trim() : '';
  if (!idStr) {
    return res.status(400).json({ error: 'Employee id required' });
  }
  const employees = readEmployees();
  const index = employees.findIndex(e => e.id === idStr);
  if (index === -1) {
    return res.status(404).json({ error: 'Employee login not found' });
  }
  const emp = employees[index];
  const emailStr = typeof email === 'string' ? email.trim() : '';
  if (emailStr) {
    const existing = employees.find(e => e.id !== idStr && (e.email || '').toLowerCase() === emailStr.toLowerCase());
    if (existing) {
      return res.status(400).json({ error: 'Another employee already has this email' });
    }
    emp.email = emailStr.toLowerCase();
  }
  if (typeof name === 'string') emp.name = name.trim() || (emp.email || '').split('@')[0] || 'Employee';
  if (password != null && String(password).trim().length >= 6) {
    emp.passwordHash = hashPassword(String(password));
  }
  if (typeof canCreateAndAssign === 'boolean') emp.canCreateAndAssign = canCreateAndAssign;
  employees[index] = emp;
  writeEmployees(employees);
  broadcastSync('employees-updated');
  res.json({
    ok: true,
    employee: { id: emp.id, email: emp.email, name: emp.name, canCreateAndAssign: !!emp.canCreateAndAssign }
  });
});

// Manager removes an employee login
app.post('/api/auth/manager/remove-employee-login', (req, res) => {
  const role = (req.headers['x-user-role'] || '').toLowerCase();
  if (role !== 'manager') {
    return res.status(403).json({ error: 'Only managers can remove employee logins.' });
  }
  const id = typeof (req.body && req.body.id) === 'string' ? req.body.id.trim() : '';
  if (!id) {
    return res.status(400).json({ error: 'Employee id required' });
  }
  const employees = readEmployees();
  const filtered = employees.filter(e => e.id !== id);
  if (filtered.length === employees.length) {
    return res.status(404).json({ error: 'Employee login not found' });
  }
  writeEmployees(filtered);
  broadcastSync('employees-updated');
  res.json({ ok: true });
});

// List employee logins (manager, or employee with canCreateAndAssign – for assigning tasks).
app.get('/api/auth/employees', (req, res) => {
  const role = (req.headers['x-user-role'] || '').toLowerCase();
  const userId = (req.headers['x-user-id'] || '').trim();
  let allow = false;
  if (role === 'manager') {
    allow = true;
  } else if (role === 'employee' && userId) {
    const employees = readEmployees();
    const emp = employees.find(e => e.id === userId);
    if (emp && emp.canCreateAndAssign) allow = true;
  }
  if (!allow) {
    return res
      .status(403)
      .json({ error: 'Only managers or employees with create/assign rights can list employee logins.' });
  }
  const employees = readEmployees();
  res.json(
    employees.map(e => ({
      id: e.id,
      email: e.email,
      name: e.name,
      canCreateAndAssign: !!e.canCreateAndAssign,
      createdAt: e.createdAt
    }))
  );
});

// Employee login with email + password
app.post('/api/auth/employee/login', (req, res) => {
  const body = req.body || {};
  const email = typeof body.email === 'string' ? body.email.trim() : '';
  const password = body.password != null ? String(body.password) : '';
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required' });
  }
  const employees = readEmployees();
  const emp = employees.find(e => (e.email || '').toLowerCase() === email.toLowerCase());
  if (!emp || emp.passwordHash !== hashPassword(password)) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }
  res.json({
    ok: true,
    user: {
      id: emp.id,
      name: emp.name || emp.email.split('@')[0],
      email: emp.email,
      role: 'employee',
      canCreateAndAssign: !!emp.canCreateAndAssign
    }
  });
});

app.post('/api/auth/manager/change-password', (req, res) => {
  const role = (req.headers['x-user-role'] || '').toLowerCase();
  if (role !== 'manager') {
    return res.status(403).json({ error: 'Only managers can change manager password.' });
  }
  const { email, currentPassword, newPassword } = req.body || {};
  if (!email || !currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Email, current password, and new password required' });
  }
  const m = readManager();
  if (!m) return res.status(500).json({ error: 'Manager not configured' });
  if (m.email.toLowerCase() !== String(email).trim().toLowerCase()) {
    return res.status(401).json({ error: 'Invalid email' });
  }
  if (m.passwordHash !== hashPassword(currentPassword)) {
    return res.status(401).json({ error: 'Current password is incorrect' });
  }
  if (String(newPassword).length < 6) {
    return res.status(400).json({ error: 'New password must be at least 6 characters' });
  }
  m.passwordHash = hashPassword(String(newPassword));
  if (req.body.name) m.name = req.body.name;
  writeManager(m);
  broadcastSync('employees-updated');
  res.json({ ok: true });
});

function verifyGoogleToken(idToken) {
  return new Promise((resolve, reject) => {
    const url = `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`;
    https
      .get(url, resp => {
        let data = '';
        resp.on('data', chunk => {
          data += chunk;
        });
        resp.on('end', () => {
          try {
            const payload = JSON.parse(data);
            if (payload.error) return reject(new Error(payload.error));
            resolve(payload);
          } catch (e) {
            reject(e);
          }
        });
      })
      .on('error', reject);
  });
}

app.post('/api/auth/google', (req, res) => {
  const { credential } = req.body || {};
  if (!credential) {
    return res.status(400).json({ error: 'Google credential required' });
  }
      verifyGoogleToken(credential)
    .then(payload => {
      const clientId = process.env.GOOGLE_CLIENT_ID;
      if (clientId && payload.aud !== clientId) {
        return res.status(401).json({ error: 'Invalid Google sign-in' });
      }
      const name = payload.name || payload.email?.split('@')[0] || 'Employee';
      const email = payload.email || '';
      res.json({
        ok: true,
        user: {
          id: 'g_' + (payload.sub || email).replace(/\W/g, '_'),
          name,
          email,
          role: 'employee'
        }
      });
    })
    .catch(err => {
      console.error('Google token verify error:', err);
      res.status(401).json({ error: 'Invalid Google sign-in' });
    });
});

// Role-based board: employees get filtered data (no upcomingTasks, minimal notifications).
// Client must send X-User-Role: manager | employee and optionally X-User-Id for employee.
app.get('/api/board', (req, res) => {
  const board = readBoard();
  const data = board || { columns: [], notifications: [], users: [], upcomingTasks: [] };
  if (!Array.isArray(data.notifications)) data.notifications = [];
  if (!Array.isArray(data.users)) data.users = [];
  if (!Array.isArray(data.upcomingTasks)) data.upcomingTasks = [];

  const role = (req.headers['x-user-role'] || '').toLowerCase();
  const userId = (req.headers['x-user-id'] || '').trim();
  const canEditBoard = (req.headers['x-can-edit-board'] || '').toLowerCase() === 'true';

  if (role === 'employee' && !canEditBoard) {
    // Employees without create rights: no upcoming tasks, minimal notifications.
    data.upcomingTasks = [];
    const essential = (data.notifications || []).slice(0, 10);
    data.notifications = essential;
  }

  res.json(data);
});

// Server-Sent Events: clients subscribe here and get instant updates when board or employees change
const SYNC_HEARTBEAT_MS = 25000;
app.get('/api/sync/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();
  syncClients.add(res);
  const heartbeat = setInterval(() => {
    try {
      res.write(': heartbeat\n\n');
    } catch (err) {
      clearInterval(heartbeat);
      syncClients.delete(res);
    }
  }, SYNC_HEARTBEAT_MS);
  req.on('close', () => {
    clearInterval(heartbeat);
    syncClients.delete(res);
  });
});

// Clear task database: manager only. Removes all tasks, comments, notifications, recurring templates.
// Keeps: logins (manager.json, employees.json), departments, users, employeeProfiles (accuracy).
app.post('/api/board/clear-tasks', (req, res) => {
  const role = (req.headers['x-user-role'] || '').toLowerCase();
  if (role !== 'manager') {
    return res.status(403).json({ error: 'Only managers can clear the task database.' });
  }
  const data = readBoard();
  const board = data || { columns: [], departments: [], notifications: [], users: [], upcomingTasks: [], recurringTasks: [], employeeProfiles: {} };
  if (!Array.isArray(board.columns)) board.columns = [];
  if (!Array.isArray(board.departments)) board.departments = [];
  if (typeof board.employeeProfiles !== 'object') board.employeeProfiles = {};
  if (!Array.isArray(board.users)) board.users = [];
  // Keep column structure; empty cards (tasks + comments go with cards)
  board.columns = board.columns.map(col => ({
    id: col.id || col.title?.toLowerCase().replace(/\s+/g, '-') || 'col',
    title: col.title || 'Column',
    cards: []
  }));
  if (board.columns.length === 0) {
    board.columns = [
      { id: 'todo', title: 'To Do', cards: [] },
      { id: 'progress', title: 'In Progress', cards: [] },
      { id: 'done', title: 'Done', cards: [] }
    ];
  }
  board.upcomingTasks = [];
  board.notifications = [];
  board.recurringTasks = [];
  writeBoard(board);
  broadcastSync('board-updated');
  res.json({ ok: true });
});

// Managers and employees with "can create & assign" can update the board.
app.put('/api/board', (req, res) => {
  const role = (req.headers['x-user-role'] || '').toLowerCase();
  const canEditBoard = (req.headers['x-can-edit-board'] || '').toLowerCase() === 'true';
  const allowed = role === 'manager' || (role === 'employee' && canEditBoard);
  if (!allowed) {
    return res.status(403).json({ error: 'Only managers or employees with create & assign rights can update the board.' });
  }
  const board = req.body;
  if (board && typeof board === 'object') {
    if (!Array.isArray(board.columns)) board.columns = [];
    if (!Array.isArray(board.departments)) board.departments = [];
    if (!Array.isArray(board.notifications)) board.notifications = [];
    if (!Array.isArray(board.upcomingTasks)) board.upcomingTasks = [];
    if (!Array.isArray(board.users)) board.users = [];
    if (!Array.isArray(board.recurringTasks)) board.recurringTasks = [];
    if (typeof board.employeeProfiles !== 'object') board.employeeProfiles = {};
    writeBoard(board);
    broadcastSync('board-updated');
    res.json({ ok: true });
  } else {
    res.status(400).json({ error: 'Invalid board data' });
  }
});

app
  .listen(PORT, () => {
    console.log(`Kanban server running at http://localhost:${PORT}`);
    console.log('Open this URL in your browser.');
  })
  .on('error', err => {
    if (err.code === 'EADDRINUSE') {
      console.error(`Port ${PORT} is already in use. Try closing other apps or set PORT=3001 npm start`);
    } else {
      console.error('Server error:', err.message);
    }
    process.exit(1);
  });
