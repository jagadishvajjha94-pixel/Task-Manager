/**
 * Shared store for Vercel: uses Redis when REDIS_URL or Upstash REST vars are set.
 * Supports: REDIS_URL (redis://...) or UPSTASH_REDIS_REST_URL + token.
 * Otherwise uses /tmp (local dev only).
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
const KEYS = { employees: 'taskmanager:employees', manager: 'taskmanager:manager', board: 'taskmanager:board' };

let upstashRedis = null;
let nodeRedisClient = null;

const redisUrl = process.env.REDIS_URL;
const upstashUrl = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

if (upstashUrl && upstashToken) {
  try {
    const { Redis } = require('@upstash/redis');
    upstashRedis = new Redis({ url: upstashUrl, token: upstashToken });
  } catch (e) {
    upstashRedis = null;
  }
}

async function getNodeRedisClient() {
  if (nodeRedisClient) {
    try {
      if (nodeRedisClient.isOpen) return nodeRedisClient;
    } catch (_) {}
    nodeRedisClient = null;
  }
  if (!redisUrl) return null;
  try {
    const { createClient } = require('redis');
    const client = createClient({ url: redisUrl });
    client.on('error', () => {});
    await client.connect();
    nodeRedisClient = client;
    return client;
  } catch (e) {
    return null;
  }
}

async function redisGet(key) {
  if (upstashRedis) {
    const raw = await upstashRedis.get(key);
    return raw == null ? null : typeof raw === 'string' ? raw : JSON.stringify(raw);
  }
  const client = await getNodeRedisClient();
  if (client) {
    const raw = await client.get(key);
    return raw;
  }
  return null;
}

async function redisSet(key, value) {
  const str = typeof value === 'string' ? value : JSON.stringify(value);
  if (upstashRedis) {
    await upstashRedis.set(key, str);
    return;
  }
  const client = await getNodeRedisClient();
  if (client) await client.set(key, str);
}

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

async function getEmployees() {
  const raw = await redisGet(KEYS.employees);
  if (raw != null) {
    try {
      const arr = typeof raw === 'string' ? JSON.parse(raw) : raw;
      return Array.isArray(arr) ? arr : [];
    } catch (e) {
      return [];
    }
  }
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
  if (upstashRedis || redisUrl) {
    await redisSet(KEYS.employees, arr || []);
    return;
  }
  ensureDataDir();
  fs.writeFileSync(path.join(DATA_DIR, 'employees.json'), JSON.stringify(arr || [], null, 2), 'utf8');
}

async function getManager() {
  const raw = await redisGet(KEYS.manager);
  if (raw != null) {
    try {
      return typeof raw === 'string' ? JSON.parse(raw) : raw;
    } catch (e) {
      return null;
    }
  }
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
  if (upstashRedis || redisUrl) {
    await redisSet(KEYS.manager, data);
    return;
  }
  ensureDataDir();
  fs.writeFileSync(path.join(DATA_DIR, 'manager.json'), JSON.stringify(data, null, 2), 'utf8');
}

async function getBoard() {
  const raw = await redisGet(KEYS.board);
  if (raw != null) {
    try {
      return typeof raw === 'string' ? JSON.parse(raw) : raw;
    } catch (e) {
      return null;
    }
  }
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
  if (upstashRedis || redisUrl) {
    await redisSet(KEYS.board, data);
    return;
  }
  ensureDataDir();
  fs.writeFileSync(path.join(DATA_DIR, 'board.json'), JSON.stringify(data, null, 2), 'utf8');
}

module.exports = {
  getEmployees,
  setEmployees,
  getManager,
  setManager,
  getBoard,
  setBoard
};
