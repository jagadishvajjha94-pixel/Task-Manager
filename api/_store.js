/**
 * File-based store for local and serverless usage.
 * Loads .env.development.local / .env.local when present (e.g. after vercel env pull).
 */
const path = require('path');
const fs = require('fs');
const os = require('os');

(function loadEnv() {
  try {
    const dotenv = require('dotenv');
    const root = path.resolve(__dirname, '..', '..');
    dotenv.config({ path: path.join(root, '.env.development.local') });
    dotenv.config({ path: path.join(root, '.env.local') });
    dotenv.config({ path: path.join(root, '.env') });
  } catch (_) {}
})();

const DATA_DIR = path.join(os.tmpdir(), 'taskmanager-data');

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

async function getEmployees() {
  ensureDataDir();
  const file = path.join(DATA_DIR, 'employees.json');
  if (fs.existsSync(file)) {
    try {
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      return Array.isArray(data) ? data : [];
    } catch (e) {
      return [];
    }
  }
  return [];
}

async function setEmployees(arr) {
  ensureDataDir();
  fs.writeFileSync(path.join(DATA_DIR, 'employees.json'), JSON.stringify(arr || [], null, 2), 'utf8');
}

async function getManager() {
  ensureDataDir();
  const file = path.join(DATA_DIR, 'manager.json');
  if (fs.existsSync(file)) {
    try {
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (e) {
      return null;
    }
  }
  return null;
}

async function setManager(data) {
  ensureDataDir();
  fs.writeFileSync(path.join(DATA_DIR, 'manager.json'), JSON.stringify(data, null, 2), 'utf8');
}

async function getBoard() {
  ensureDataDir();
  const file = path.join(DATA_DIR, 'board.json');
  if (fs.existsSync(file)) {
    try {
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (e) {
      return null;
    }
  }
  return null;
}

async function setBoard(data) {
  ensureDataDir();
  fs.writeFileSync(path.join(DATA_DIR, 'board.json'), JSON.stringify(data, null, 2), 'utf8');
}

function getStoreBackend() {
  return 'file';
}

module.exports = {
  getEmployees,
  setEmployees,
  getManager,
  setManager,
  getBoard,
  setBoard,
  getStoreBackend
};
