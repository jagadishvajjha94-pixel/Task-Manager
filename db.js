/**
 * SQLite database for long-term storage of tasks, columns, upcoming tasks, and notifications.
 * All task-related data is stored in the database.
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DATA_DIR = path.join(__dirname, 'data');
const DB_PATH = path.join(DATA_DIR, 'tasks.db');

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

let db = null;

function getDb() {
  if (db) return db;
  ensureDataDir();
  db = new Database(DB_PATH);
  initSchema(db);
  return db;
}

function initSchema(database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS columns (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      column_id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      urgency TEXT DEFAULT 'medium',
      assignee_name TEXT,
      assigned_by_id TEXT,
      assigned_by_name TEXT,
      assigned_at TEXT,
      created_at TEXT,
      FOREIGN KEY (column_id) REFERENCES columns(id)
    );

    CREATE TABLE IF NOT EXISTS upcoming_tasks (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      urgency TEXT DEFAULT 'medium',
      created_at TEXT
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      message TEXT NOT NULL,
      task_title TEXT,
      assignee_name TEXT,
      assigned_by_name TEXT,
      created_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_tasks_column ON tasks(column_id);
  `);

  const row = database.prepare('SELECT COUNT(*) as c FROM columns').get();
  if (row.c === 0) {
    database.prepare(
      `INSERT INTO columns (id, title, sort_order) VALUES (?, ?, ?)`
    ).run('todo', 'To Do', 0);
    database.prepare(
      `INSERT INTO columns (id, title, sort_order) VALUES (?, ?, ?)`
    ).run('progress', 'In Progress', 1);
    database.prepare(
      `INSERT INTO columns (id, title, sort_order) VALUES (?, ?, ?)`
    ).run('done', 'Done', 2);
  }
}

function boardFromDb() {
  const database = getDb();

  const columns = database.prepare(
    'SELECT id, title, sort_order FROM columns ORDER BY sort_order'
  ).all();

  const tasksByColumn = {};
  const tasks = database.prepare(
    'SELECT id, column_id, title, description, urgency, assignee_name, assigned_by_id, assigned_by_name, assigned_at FROM tasks'
  ).all();

  tasks.forEach((t) => {
    if (!tasksByColumn[t.column_id]) tasksByColumn[t.column_id] = [];
    tasksByColumn[t.column_id].push({
      id: t.id,
      title: t.title,
      description: t.description || '',
      urgency: t.urgency || 'medium',
      assigneeName: t.assignee_name || undefined,
      assignedById: t.assigned_by_id || undefined,
      assignedByName: t.assigned_by_name || undefined,
      assignedAt: t.assigned_at || undefined,
    });
  });

  const boardColumns = columns.map((col) => ({
    id: col.id,
    title: col.title,
    cards: tasksByColumn[col.id] || [],
  }));

  const upcomingRows = database.prepare(
    'SELECT id, title, description, urgency FROM upcoming_tasks'
  ).all();
  const upcomingTasks = upcomingRows.map((r) => ({
    id: r.id,
    title: r.title,
    description: r.description || '',
    urgency: r.urgency || 'medium',
  }));

  const notifRows = database.prepare(
    'SELECT id, message, task_title, assignee_name, assigned_by_name, created_at FROM notifications ORDER BY created_at DESC LIMIT 100'
  ).all();
  const notifications = notifRows.map((r) => ({
    id: r.id,
    message: r.message,
    taskTitle: r.task_title,
    assigneeName: r.assignee_name,
    assignedByName: r.assigned_by_name,
    at: r.created_at,
  }));

  return {
    columns: boardColumns,
    upcomingTasks,
    notifications,
    users: [],
  };
}

function saveBoardToDb(board) {
  if (!board || typeof board !== 'object') return;
  const database = getDb();

  const run = database.transaction(() => {
    database.prepare('DELETE FROM tasks').run();
    database.prepare('DELETE FROM upcoming_tasks').run();
    database.prepare('DELETE FROM notifications').run();

    const insertTask = database.prepare(
      `INSERT INTO tasks (id, column_id, title, description, urgency, assignee_name, assigned_by_id, assigned_by_name, assigned_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );

    (board.columns || []).forEach((col) => {
      (col.cards || []).forEach((card) => {
        insertTask.run(
          card.id,
          col.id,
          card.title || '',
          card.description || '',
          card.urgency || 'medium',
          card.assigneeName || null,
          card.assignedById || null,
          card.assignedByName || null,
          card.assignedAt || null
        );
      });
    });

    const insertUpcoming = database.prepare(
      `INSERT INTO upcoming_tasks (id, title, description, urgency) VALUES (?, ?, ?, ?)`
    );
    (board.upcomingTasks || []).forEach((t) => {
      insertUpcoming.run(t.id, t.title || '', t.description || '', t.urgency || 'medium');
    });

    const insertNotif = database.prepare(
      `INSERT INTO notifications (id, message, task_title, assignee_name, assigned_by_name, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    );
    (board.notifications || []).forEach((n) => {
      insertNotif.run(
        n.id,
        n.message || '',
        n.taskTitle || null,
        n.assigneeName || null,
        n.assignedByName || null,
        n.at || new Date().toISOString()
      );
    });
  });

  run();
}

function closeDb() {
  if (db) {
    db.close();
    db = null;
  }
}

module.exports = {
  getDb,
  boardFromDb,
  saveBoardToDb,
  closeDb,
  DB_PATH,
};
