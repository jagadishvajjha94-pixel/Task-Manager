# Where your task data is stored

Right now all task data is stored in a **JSON file** (no separate database).

---

## 1. File on the server

**Path:** `data/board.json` (in your project folder)

- **To Do / In Progress / Done** tasks → inside `columns[].cards`
- **Upcoming tasks** (to assign to employees) → `upcomingTasks` array
- **Assignment history** (who assigned what to whom) → `notifications` array

You can open `data/board.json` in any text editor or in your IDE to see the raw stored data.

---

## 2. View stored data in the app

In the app:

1. Log in (Manager or Employee).
2. In the **sidebar**, click **Stored data**.
3. You’ll see:
   - A short **summary** (number of columns, tasks, upcoming tasks, notifications).
   - The full **JSON** of what’s currently loaded (and what gets saved when you make changes).

Use **Refresh** to reload from the server and update the view.

---

## Summary

| What you want to see | Where to look |
|----------------------|----------------|
| Raw file on disk     | Open `data/board.json` in your editor. |
| Data in the app      | Sidebar → **Stored data** (summary + JSON). |

Data is saved to `data/board.json` whenever you add, edit, move, or assign tasks (when the server is running).
