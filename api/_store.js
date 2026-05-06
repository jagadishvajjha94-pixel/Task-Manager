/**
 * Shared store: Upstash Redis (REST), TCP Redis via REDIS_URL, or filesystem fallback (/tmp).
 * On Vercel, use REST (UPSTASH_* or KV_REST_*); TCP often hangs unless ALLOW_VERCEL_TCP_REDIS=1.
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

function getEnv(name) {
  const raw = (process.env.REDIS_ENV_PREFIX || '').trim();
  if (!raw) return process.env[name];
  const prefix = raw.endsWith('_') ? raw : raw + '_';
  return process.env[prefix + name] || process.env[name];
}

const redisUrl = process.env.REDIS_URL;
const isVercel = !!process.env.VERCEL;
const allowTcpRedisOnVercel = process.env.ALLOW_VERCEL_TCP_REDIS === '1';

function ensureUpstash() {
  if (upstashRedis) return upstashRedis;
  const url = (getEnv('UPSTASH_REDIS_REST_URL') || getEnv('KV_REST_API_URL') || '').trim();
  const token = (getEnv('UPSTASH_REDIS_REST_TOKEN') || getEnv('KV_REST_API_TOKEN') || '').trim();
  if (url && token) {
    try {
      const { Redis } = require('@upstash/redis');
      upstashRedis = new Redis({ url, token });
      return upstashRedis;
    } catch (_) {
      upstashRedis = null;
    }
  }
  return null;
}

(function initUpstash() {
  ensureUpstash();
})();

async function getNodeRedisClient() {
  if (isVercel && !allowTcpRedisOnVercel) {
    return null;
  }
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
  } catch (_) {
    return null;
  }
}

async function redisGet(key) {
  const redis = upstashRedis || ensureUpstash();
  if (redis) {
    try {
      const raw = await redis.get(key);
      return raw == null ? null : typeof raw === 'string' ? raw : JSON.stringify(raw);
    } catch (_) {
      return null;
    }
  }
  try {
    const client = await getNodeRedisClient();
    if (client) {
      return await client.get(key);
    }
  } catch (_) {}
  return null;
}

/** Returns false if nothing was written (e.g. TCP blocked on Vercel). */
async function writeToRedis(key, value) {
  const str = typeof value === 'string' ? value : JSON.stringify(value);
  const redis = upstashRedis || ensureUpstash();
  if (redis) {
    try {
      await redis.set(key, str);
      return true;
    } catch (_) {
      return false;
    }
  }
  try {
    const client = await getNodeRedisClient();
    if (client) {
      await client.set(key, str);
      return true;
    }
  } catch (_) {}
  return false;
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
    } catch (_) {
      return [];
    }
  }
  ensureDataDir();
  const file = path.join(DATA_DIR, 'employees.json');
  if (fs.existsSync(file)) {
    try {
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      return Array.isArray(data) ? data : [];
    } catch (_) {
      return [];
    }
  }
  return [];
}

async function setEmployees(arr) {
  if (await writeToRedis(KEYS.employees, arr || [])) return;
  ensureDataDir();
  fs.writeFileSync(path.join(DATA_DIR, 'employees.json'), JSON.stringify(arr || [], null, 2), 'utf8');
}

async function getManager() {
  const raw = await redisGet(KEYS.manager);
  if (raw != null) {
    try {
      return typeof raw === 'string' ? JSON.parse(raw) : raw;
    } catch (_) {
      return null;
    }
  }
  ensureDataDir();
  const file = path.join(DATA_DIR, 'manager.json');
  if (fs.existsSync(file)) {
    try {
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (_) {
      return null;
    }
  }
  return null;
}

async function setManager(data) {
  if (await writeToRedis(KEYS.manager, data)) return;
  ensureDataDir();
  fs.writeFileSync(path.join(DATA_DIR, 'manager.json'), JSON.stringify(data, null, 2), 'utf8');
}

async function getBoard() {
  const raw = await redisGet(KEYS.board);
  if (raw != null) {
    try {
      return typeof raw === 'string' ? JSON.parse(raw) : raw;
    } catch (_) {
      return null;
    }
  }
  ensureDataDir();
  const file = path.join(DATA_DIR, 'board.json');
  if (fs.existsSync(file)) {
    try {
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (_) {
      return null;
    }
  }
  return null;
}

async function setBoard(data) {
  if (await writeToRedis(KEYS.board, data)) return;
  ensureDataDir();
  fs.writeFileSync(path.join(DATA_DIR, 'board.json'), JSON.stringify(data, null, 2), 'utf8');
}

function getStoreBackend() {
  if (upstashRedis || ensureUpstash()) return 'upstash';
  if (redisUrl) {
    if (isVercel && !allowTcpRedisOnVercel) return 'file';
    return 'redis';
  }
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
