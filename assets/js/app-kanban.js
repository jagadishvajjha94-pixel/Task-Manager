'use strict';

(function () {
  const API_BASE =
    typeof window !== 'undefined' && (window.location.protocol === 'http:' || window.location.protocol === 'https:')
      ? window.location.origin
      : '';

  /** Build headers for API calls: role validation for backend enforcement. */
  function apiHeaders(extra) {
    const u = getCurrentUser();
    const role = (u && u.role) === 'manager' ? 'manager' : 'employee';
    const h = { 'Content-Type': 'application/json', 'X-User-Role': role };
    if (u && u.id) h['X-User-Id'] = String(u.id);
    return extra ? { ...h, ...extra } : h;
  }

  const defaultDepartments = ['Training dept.', 'Placement dept.', 'H.R. dept.'];

  /** Empty board for real-time use: no mock data. */
  function getEmptyBoard() {
    return {
      columns: [
        { id: 'todo', title: 'To Do', cards: [] },
        { id: 'progress', title: 'In Progress', cards: [] },
        { id: 'done', title: 'Done', cards: [] }
      ],
      departments: defaultDepartments.slice(),
      upcomingTasks: [],
      notifications: [],
      users: [],
      recurringTasks: [],
      employeeProfiles: {}
    };
  }

  const emptyBoard = getEmptyBoard();

  let board = {
    columns: [],
    departments: [],
    upcomingTasks: [],
    notifications: [],
    users: [],
    recurringTasks: [],
    employeeProfiles: {}
  };
  let searchQuery = '';
  let tasksTabSearchQuery = '';
  let lastRecurringCheckDate = '';
  let cachedEmployeeLogins = [];

  function getEmployeeProfile(name) {
    if (!board.employeeProfiles) board.employeeProfiles = {};
    const key = (name || '').trim().toLowerCase();
    const profiles = board.employeeProfiles;
    const exact = profiles[key];
    if (exact) return exact;
    const found = Object.keys(profiles).find(k => k.toLowerCase() === key);
    return found ? profiles[found] : null;
  }

  function setEmployeeProfile(name, data) {
    if (!board.employeeProfiles) board.employeeProfiles = {};
    const key = (name || '').trim();
    if (!key) return;
    const lowerKey = key.toLowerCase();
    board.employeeProfiles[lowerKey] = { ...(board.employeeProfiles[lowerKey] || {}), ...data };
  }

  function getCurrentUser() {
    try {
      const saved = localStorage.getItem('kanban-current-user');
      if (saved) {
        const u = JSON.parse(saved);
        if (u && u.id && u.role) return u;
      }
    } catch (_) {}
    return null;
  }

  function setCurrentUser(user) {
    localStorage.setItem('kanban-current-user', JSON.stringify(user));
  }

  function isManager() {
    const u = getCurrentUser();
    return u && u.role === 'manager';
  }

  function canCreateAndAssign() {
    const u = getCurrentUser();
    if (!u) return false;
    if (u.role === 'manager') return true;
    return u.role === 'employee' && u.canCreateAndAssign === true;
  }

  function getEmployees() {
    return (board.users || []).filter(u => u.role === 'employee');
  }

  function uid() {
    return 'id_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9);
  }

  let serverReachable = false;

  function addNotification() {
    // Notifications removed from application
  }

  function escapeHtml(s) {
    if (!s) return '';
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }

  async function loadBoard() {
    try {
      const res = await fetch(API_BASE + '/api/board', { headers: apiHeaders() });
      if (!res.ok) throw new Error('Server returned ' + res.status);
      const data = await res.json();
      serverReachable = true;
      hideConnectionBanner();
      if (data && (data.columns || data.upcomingTasks)) {
        board = data;
        if (!Array.isArray(board.columns)) board.columns = [];
        if (!Array.isArray(board.departments)) board.departments = defaultDepartments.slice();
        if (!Array.isArray(board.upcomingTasks)) board.upcomingTasks = [];
        if (!Array.isArray(board.notifications)) board.notifications = [];
        if (!Array.isArray(board.users)) board.users = [];
        if (!Array.isArray(board.recurringTasks)) board.recurringTasks = [];
        if (typeof board.employeeProfiles !== 'object') board.employeeProfiles = {};
        board.columns.forEach(col => {
          (col.cards || []).forEach(card => {
            if (!card.urgency) card.urgency = 'medium';
          });
        });
      } else {
        board = JSON.parse(JSON.stringify(emptyBoard));
      }
    } catch (e) {
      serverReachable = false;
      const stored = localStorage.getItem('kanban-board');
      if (stored) {
        try {
          board = JSON.parse(stored);
          if (!Array.isArray(board.columns)) board.columns = [];
          if (!Array.isArray(board.departments)) board.departments = defaultDepartments.slice();
          if (!Array.isArray(board.upcomingTasks)) board.upcomingTasks = [];
          if (!Array.isArray(board.notifications)) board.notifications = [];
          if (!Array.isArray(board.users)) board.users = [];
          if (!Array.isArray(board.recurringTasks)) board.recurringTasks = [];
          if (typeof board.employeeProfiles !== 'object') board.employeeProfiles = {};
          (board.columns || []).forEach(col => {
            (col.cards || []).forEach(card => {
              if (!card.urgency) card.urgency = 'medium';
            });
          });
        } catch (_) {
          board = JSON.parse(JSON.stringify(emptyBoard));
        }
      } else {
        board = JSON.parse(JSON.stringify(emptyBoard));
      }
      showConnectionBanner();
    }
    const recurringAdded = generateRecurringTasksForToday();
    if (recurringAdded) {
      await saveBoard();
    }
    try {
      render();
      renderTasksTab();
      renderManagerTab();
      renderNotifications();
      updateRoleUI();
    } catch (renderErr) {
      console.error('Render error:', renderErr);
      const container = document.getElementById('kanban-board');
      if (container) {
        container.innerHTML =
          '<p class="text-muted py-5">Could not load board. <button type="button" class="btn btn-sm btn-outline-primary ms-2" id="kanban-retry-render">Retry</button> or <a href="#" id="kanban-back-login">return to login</a>.</p>';
        document.getElementById('kanban-retry-render')?.addEventListener('click', () => loadBoard());
        document.getElementById('kanban-back-login')?.addEventListener('click', e => {
          e.preventDefault();
          localStorage.removeItem('kanban-current-user');
          showLoginPage();
        });
      }
    }
  }

  function getDepartments() {
    return Array.isArray(board.departments) && board.departments.length
      ? board.departments
      : defaultDepartments.slice();
  }

  function renderEmployeeAccuracyTable() {
    const accuracyTbody = document.getElementById('manager-accuracy-tbody');
    if (!accuracyTbody) return;
    const stats = computeEmployeeStats();
    const namesFromBoard = Object.keys(stats);
    const namesFromLogins = (cachedEmployeeLogins || []).map(e => (e.name || e.email || '').trim()).filter(Boolean);
    const allNames = [...new Set([...namesFromBoard, ...namesFromLogins])].sort();
    if (allNames.length === 0) {
      accuracyTbody.innerHTML =
        '<tr><td colspan="5" class="text-muted text-center">No employees yet. Create employee logins above or assign tasks.</td></tr>';
      return;
    }
    accuracyTbody.innerHTML = allNames
      .map(name => {
        const s = stats[name] || { assigned: 0, completed: 0, onTime: 0 };
        const pct = s.assigned > 0 ? Math.round((s.completed / s.assigned) * 100) : 0;
        return `<tr>
            <td class="employee-name-link" data-employee="${escapeHtml(name)}" style="cursor:pointer;color:var(--bs-primary);" title="Click to view performance">${escapeHtml(name)}</td>
            <td>${s.assigned}</td>
            <td>${s.completed}</td>
            <td>${s.onTime}</td>
            <td class="d-flex align-items-center gap-2">
              <span class="accuracy-click-wrap" data-employee="${escapeHtml(name)}" style="cursor:pointer;display:inline-flex;align-items:center;gap:0.5rem;padding:0.25rem 0.5rem;border-radius:6px;transition:background 0.15s;" title="Click to view performance">
                <span class="accuracy-circle-wrap" style="width:24px;height:24px">
                  <svg viewBox="0 0 36 36" width="24" height="24" style="transform:rotate(-90deg)">
                    <path fill="none" stroke="rgba(0,0,0,.08)" stroke-width="3" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"/>
                    <path fill="none" stroke="var(--bs-success)" stroke-width="3" stroke-linecap="round" pathLength="100" stroke-dasharray="${pct} 100" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"/>
                  </svg>
                </span>
                <strong>${pct}%</strong>
              </span>
            </td>
          </tr>`;
      })
      .join('');
    accuracyTbody.querySelectorAll('.employee-name-link, .accuracy-click-wrap').forEach(el => {
      el.addEventListener('click', () => {
        const empName = el.dataset.employee;
        if (empName) openEmployeeModal(empName);
      });
    });
  }

  function loadAndRenderEmployeeLogins() {
    const tbody = document.getElementById('employee-logins-tbody');
    const emptyEl = document.getElementById('employee-logins-empty');
    if (!tbody) return;
    fetch(API_BASE + '/api/auth/employees', { headers: apiHeaders() })
      .then(res => (res.ok ? res.json() : []))
      .then(employees => {
        cachedEmployeeLogins = Array.isArray(employees) ? employees : [];
        if (cachedEmployeeLogins.length === 0) {
          tbody.innerHTML = '';
          if (emptyEl) {
            emptyEl.style.display = 'block';
            emptyEl.textContent = 'No employee logins yet. Create one above.';
          }
          renderEmployeeAccuracyTable();
          return;
        }
        if (emptyEl) emptyEl.style.display = 'none';
        tbody.innerHTML = cachedEmployeeLogins
          .map(
            e =>
              `<tr data-employee-id="${escapeHtml(e.id)}"><td>${escapeHtml(e.email || '')}</td><td>${escapeHtml(e.name || '')}</td><td><div class="form-check form-switch mb-0 d-inline-block"><input class="form-check-input emp-can-create-assign-toggle" type="checkbox" data-employee-id="${escapeHtml(e.id)}" title="Can create & assign tasks (applies to this employee only)" ${e.canCreateAndAssign ? ' checked' : ''} /><label class="form-check-label small ms-1" for="">${e.canCreateAndAssign ? 'Can create & assign' : 'View & update only'}</label></div></td><td><button type="button" class="btn btn-sm btn-outline-primary edit-employee-login-btn me-1" data-employee-id="${escapeHtml(e.id)}" title="Edit this login"><i class="bx bx-edit"></i> Edit</button><button type="button" class="btn btn-sm btn-outline-danger remove-employee-login-btn" data-employee-id="${escapeHtml(e.id)}" title="Remove this login">Remove</button></td></tr>`
          )
          .join('');
        tbody.querySelectorAll('.emp-can-create-assign-toggle').forEach(toggle => {
          toggle.addEventListener('change', () => {
            const id = toggle.getAttribute('data-employee-id');
            if (!id) return;
            const canCreateAndAssign = !!toggle.checked;
            fetch(API_BASE + '/api/auth/manager/update-employee-login', {
              method: 'PUT',
              headers: apiHeaders(),
              body: JSON.stringify({ id, canCreateAndAssign })
            })
              .then(res => (res.ok ? res.json() : res.json().then(d => Promise.reject(d))))
              .then(() => loadAndRenderEmployeeLogins())
              .catch(err => alert(err && err.error ? err.error : 'Failed to update.'));
          });
        });
        tbody.querySelectorAll('.edit-employee-login-btn').forEach(btn => {
          btn.addEventListener('click', () => {
            const id = btn.getAttribute('data-employee-id');
            if (!id) return;
            const emp = cachedEmployeeLogins.find(e => e.id === id);
            if (!emp) return;
            const modal = document.getElementById('edit-employee-login-modal');
            const idEl = document.getElementById('edit-emp-id');
            const emailEl = document.getElementById('edit-emp-email');
            const nameEl = document.getElementById('edit-emp-name');
            const passwordEl = document.getElementById('edit-emp-password');
            const canEl = document.getElementById('edit-emp-can-create-assign');
            if (idEl) idEl.value = emp.id;
            if (emailEl) emailEl.value = emp.email || '';
            if (nameEl) nameEl.value = emp.name || '';
            if (passwordEl) passwordEl.value = '';
            if (canEl) canEl.checked = !!emp.canCreateAndAssign;
            if (modal && typeof bootstrap !== 'undefined') {
              const bsModal = new bootstrap.Modal(modal);
              bsModal.show();
            }
          });
        });
        tbody.querySelectorAll('.remove-employee-login-btn').forEach(btn => {
          btn.addEventListener('click', () => {
            const id = btn.getAttribute('data-employee-id');
            if (!id) return;
            if (!confirm('Remove this employee login? They will no longer be able to sign in.')) return;
            fetch(API_BASE + '/api/auth/manager/remove-employee-login', {
              method: 'POST',
              headers: apiHeaders(),
              body: JSON.stringify({ id })
            })
              .then(res => (res.ok ? Promise.resolve() : res.json().then(d => Promise.reject(d))))
              .then(() => loadAndRenderEmployeeLogins())
              .catch(err => alert(err && err.error ? err.error : 'Failed to remove employee login.'));
          });
        });
        renderEmployeeAccuracyTable();
      })
      .catch(() => {
        tbody.innerHTML = '';
        if (emptyEl) {
          emptyEl.style.display = 'block';
          emptyEl.textContent = 'Could not load employee logins.';
        }
      });
  }

  function renderManagerTab() {
    const deptsList = document.getElementById('manager-depts-list');
    const recurringList = document.getElementById('recurring-tasks-list');
    if (!deptsList) return;
    const depts = getDepartments();
    deptsList.innerHTML = depts.map(d => `<li class="list-group-item">${escapeHtml(d)}</li>`).join('');
    renderEmployeeAccuracyTable();
    if (isManager()) loadAndRenderEmployeeLogins();
    if (recurringList) {
      const recurring = board.recurringTasks || [];
      if (recurring.length === 0) {
        recurringList.innerHTML =
          '<p class="text-muted mb-0">No recurring tasks yet. Create one by enabling "Recurring Task" when adding a task and choose Daily, Weekly, or Monthly.</p>';
      } else {
        recurringList.innerHTML = recurring
          .map(rt => {
            const assigneeNames = (rt.assignees || []).join(', ');
            const activeClass = rt.active ? 'bg-success' : 'bg-secondary';
            const statusText = rt.active ? 'Active' : 'Paused';
            const freq = (rt.frequency || 'daily').toLowerCase();
            const freqLabel = freq === 'weekly' ? 'Weekly' : freq === 'monthly' ? 'Monthly' : 'Daily';
            const freqBadgeClass =
              freq === 'weekly' ? 'bg-label-warning' : freq === 'monthly' ? 'bg-label-info' : 'bg-label-primary';
            return `
            <div class="d-flex align-items-center justify-content-between border rounded p-3 mb-2 recurring-task-item" data-recurring-id="${escapeHtml(rt.id)}">
              <div class="flex-grow-1">
                <div class="d-flex align-items-center gap-2 mb-1">
                  <strong>${escapeHtml(rt.title)}</strong>
                  <span class="badge ${activeClass}">${statusText}</span>
                  <span class="badge ${freqBadgeClass}">${freqLabel}</span>
                  ${rt.department ? `<span class="badge bg-label-secondary">${escapeHtml(rt.department)}</span>` : ''}
                </div>
                <div class="small text-muted">
                  <i class="bx bx-user me-1"></i>Assigned to: ${escapeHtml(assigneeNames || 'No one')}
                </div>
                ${rt.description ? `<div class="small text-muted mt-1">${escapeHtml(rt.description)}</div>` : ''}
              </div>
              <div class="d-flex align-items-center gap-2">
                <div class="form-check form-switch mb-0">
                  <input class="form-check-input recurring-toggle" type="checkbox" data-recurring-id="${escapeHtml(rt.id)}" ${rt.active ? 'checked' : ''} title="Toggle active/paused">
                </div>
                <button type="button" class="btn btn-sm btn-outline-danger delete-recurring-btn" data-recurring-id="${escapeHtml(rt.id)}" title="Delete recurring task">
                  <i class="bx bx-trash"></i>
                </button>
              </div>
            </div>
          `;
          })
          .join('');
        recurringList.querySelectorAll('.recurring-toggle').forEach(toggle => {
          toggle.addEventListener('change', e => {
            const id = e.target.dataset.recurringId;
            const rt = (board.recurringTasks || []).find(r => r.id === id);
            if (rt) {
              rt.active = e.target.checked;
              saveBoard();
              renderManagerTab();
            }
          });
        });
        recurringList.querySelectorAll('.delete-recurring-btn').forEach(btn => {
          btn.addEventListener('click', e => {
            const id = btn.dataset.recurringId;
            if (confirm('Delete this recurring task? This will not delete already generated tasks.')) {
              board.recurringTasks = (board.recurringTasks || []).filter(r => r.id !== id);
              saveBoard();
              renderManagerTab();
            }
          });
        });
      }
    }
  }

  function showConnectionBanner() {
    let el = document.getElementById('connection-banner');
    if (el) return;
    el = document.createElement('div');
    el.id = 'connection-banner';
    el.className = 'alert alert-warning alert-dismissible fade show mb-0 rounded-0';
    el.setAttribute('role', 'alert');
    el.innerHTML =
      '<strong>Server not running.</strong> Data is saved in this browser only. <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>';
    document.body.insertBefore(el, document.body.firstChild);
  }

  function hideConnectionBanner() {
    const el = document.getElementById('connection-banner');
    if (el) el.remove();
  }

  async function saveBoard() {
    try {
      const res = await fetch(API_BASE + '/api/board', {
        method: 'PUT',
        headers: apiHeaders(),
        body: JSON.stringify(board)
      });
      if (!res.ok) throw new Error('Server returned ' + res.status);
      serverReachable = true;
      hideConnectionBanner();
    } catch (e) {
      localStorage.setItem('kanban-board', JSON.stringify(board));
      if (!document.getElementById('connection-banner')) showConnectionBanner();
    }
  }

  function getAssigneesList(card) {
    if (card.assignees && Array.isArray(card.assignees) && card.assignees.length > 0) {
      return card.assignees.map(a => (typeof a === 'string' ? a : (a && a.name) || '')).filter(Boolean);
    }
    if (card.assigneeName) return [card.assigneeName];
    return [];
  }

  function getAllEmployeeNames() {
    const namesSet = new Set();
    (board.upcomingTasks || []).forEach(task => {
      getAssigneesList(task).forEach(name => namesSet.add(name));
    });
    (board.columns || []).forEach(col => {
      (col.cards || []).forEach(card => {
        getAssigneesList(card).forEach(name => namesSet.add(name));
      });
    });
    (cachedEmployeeLogins || []).forEach(e => {
      const n = (e.name || e.email || '').trim();
      if (n) namesSet.add(n);
    });
    return Array.from(namesSet).sort();
  }

  function assigneeBlock(name) {
    if (!name || !name.trim()) return '';
    const initial = name.trim().charAt(0).toUpperCase();
    return `<span class="assignee-with-name"><span class="assignee-initial" title="${escapeHtml(name.trim())}">${escapeHtml(initial)}</span><span class="assignee-name">${escapeHtml(name.trim())}</span></span>`;
  }

  function assigneesInitialsOnly(names) {
    if (!names || names.length === 0) return '';
    return `<span class="assignee-initials-wrap">${names
      .map(n => {
        const empName = (n || '').trim();
        if (!empName) return '';
        const initial = empName.charAt(0).toUpperCase();
        return `<span class="assignee-clickable assignee-with-name" data-employee-name="${escapeHtml(empName)}" title="Click to view ${escapeHtml(empName)}'s performance"><span class="assignee-initial">${escapeHtml(initial)}</span><span class="assignee-name">${escapeHtml(empName)}</span></span>`;
      })
      .join('')}</span>`;
  }

  function formatDeadlineTimer(deadlineIso, completedAt, isDoneColumn) {
    if (!deadlineIso) return '';
    const deadline = new Date(deadlineIso);
    const now = new Date();
    if (completedAt) {
      const completed = new Date(completedAt);
      const onTime = completed <= deadline;
      return onTime ? 'Completed on time' : 'Completed late';
    }
    if (isDoneColumn) return 'Completed';
    if (now > deadline) {
      const mins = Math.floor((now - deadline) / 60000);
      if (mins < 60) return 'Overdue by ' + mins + ' min';
      const hours = Math.floor(mins / 60);
      if (hours < 24) return 'Overdue by ' + hours + ' hr';
      return 'Overdue by ' + Math.floor(hours / 24) + ' days';
    }
    const mins = Math.floor((deadline - now) / 60000);
    if (mins < 60) return 'Due in ' + mins + ' min';
    const hours = Math.floor(mins / 60);
    if (hours < 24) return 'Due in ' + hours + ' hr';
    return 'Due in ' + Math.floor(hours / 24) + ' days';
  }

  /** Due-time progress: 0 = no time left, 100 = full time remaining. Used for circular indicator. */
  function getDueTimeProgressPercent(deadlineIso, completedAt, isDone, assignedAtIso) {
    if (!deadlineIso || isDone) return 100;
    const deadline = new Date(deadlineIso).getTime();
    const now = Date.now();
    if (now >= deadline) return 0;
    const start = assignedAtIso ? new Date(assignedAtIso).getTime() : now;
    const total = Math.max(deadline - start, 1);
    const remaining = deadline - now;
    return Math.min(100, Math.max(0, Math.round((remaining / total) * 100)));
  }

  /** Digital clock style countdown for circular timer: "1d 02:30", "02:45", "00:05", or "Over 1d". */
  function formatDeadlineDigital(deadlineIso, completedAt, isDone) {
    if (!deadlineIso) return '—';
    const deadline = new Date(deadlineIso);
    const now = new Date();
    if (completedAt) {
      const completed = new Date(completedAt);
      return completed <= deadline ? 'On time' : 'Late';
    }
    if (isDone) return 'Done';
    const pad2 = n => String(n).padStart(2, '0');
    if (now >= deadline) {
      const ms = now - deadline;
      const mins = Math.floor(ms / 60000);
      if (mins < 60) return 'Over ' + mins + 'm';
      const hours = Math.floor(mins / 60);
      if (hours < 24) return 'Over ' + hours + 'h';
      const days = Math.floor(hours / 24);
      const h = hours % 24;
      const m = mins % 60;
      return 'Over ' + days + 'd ' + pad2(h) + ':' + pad2(m);
    }
    const ms = deadline - now;
    const mins = Math.floor(ms / 60000);
    const hours = Math.floor(mins / 60);
    const days = Math.floor(hours / 24);
    const h = hours % 24;
    const m = mins % 60;
    if (days > 0) return days + 'd ' + pad2(h) + ':' + pad2(m);
    if (hours > 0) return pad2(h) + ':' + pad2(m);
    return '00:' + pad2(mins);
  }

  function getTodayDateKey() {
    const n = new Date();
    return (
      n.getFullYear() + '-' + String(n.getMonth() + 1).padStart(2, '0') + '-' + String(n.getDate()).padStart(2, '0')
    );
  }

  function shouldRunRecurringToday(template) {
    const freq = (template.frequency || 'daily').toLowerCase();
    const now = new Date();
    if (freq === 'daily') return true;
    if (freq === 'weekly') {
      const dayOfWeek =
        template.dayOfWeek !== undefined
          ? template.dayOfWeek
          : template.createdAt
            ? new Date(template.createdAt).getDay()
            : 0;
      return now.getDay() === dayOfWeek;
    }
    if (freq === 'monthly') {
      const dayOfMonth =
        template.dayOfMonth !== undefined
          ? template.dayOfMonth
          : template.createdAt
            ? new Date(template.createdAt).getDate()
            : 1;
      const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      const runDay = Math.min(dayOfMonth, lastDay);
      return now.getDate() === runDay;
    }
    return true;
  }

  function generateRecurringTasksForToday() {
    const todayKey = getTodayDateKey();
    if (lastRecurringCheckDate === todayKey) return false;
    lastRecurringCheckDate = todayKey;

    if (!board.recurringTasks || board.recurringTasks.length === 0) return false;

    const todoCol =
      (board.columns || []).find(c => (c.id || '').toString().toLowerCase() === 'todo') || (board.columns || [])[0];
    if (!todoCol) return false;

    let tasksAdded = false;
    board.recurringTasks.forEach(template => {
      if (!template.active) return;
      if (!shouldRunRecurringToday(template)) return;
      const assignees = template.assignees || [];
      if (assignees.length === 0) return;

      const existingToday = (todoCol.cards || []).find(
        card => card.recurringTemplateId === template.id && card.assignedAt && card.assignedAt.slice(0, 10) === todayKey
      );
      if (existingToday) return;

      const now = new Date();
      const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
      const newCard = {
        id: 'card_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
        title: template.title,
        description: template.description || '',
        urgency: template.urgency || 'medium',
        department: template.department || '',
        assignees: assignees.slice(),
        assignedAt: now.toISOString(),
        deadline: endOfDay.toISOString(),
        assignedByName: 'Auto (Recurring)',
        recurringTemplateId: template.id,
        isRecurringTask: true,
        recurringFrequency: template.frequency || 'daily',
        link: template.link || undefined,
        linkType: template.linkType || undefined
      };
      if (!todoCol.cards) todoCol.cards = [];
      todoCol.cards.push(newCard);
      tasksAdded = true;
    });

    return tasksAdded;
  }

  function addDaysToDateKey(dateKey, days) {
    const d = new Date(dateKey + 'T12:00:00');
    d.setDate(d.getDate() + days);
    return (
      d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
    );
  }

  function formatDateForLabel(dateKey) {
    const d = new Date(dateKey + 'T12:00:00');
    return d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' });
  }

  function getUrgencyOrder(urgency) {
    const u = (urgency || 'medium').toLowerCase();
    if (u === 'high') return 0;
    if (u === 'low') return 2;
    return 1;
  }

  function sortCardsByPriority(cards) {
    return cards.slice().sort((a, b) => {
      const doneA = isCardDone(a) ? 1 : 0;
      const doneB = isCardDone(b) ? 1 : 0;
      if (doneA !== doneB) return doneA - doneB;
      const orderA = getUrgencyOrder(a.urgency);
      const orderB = getUrgencyOrder(b.urgency);
      if (orderA !== orderB) return orderA - orderB;
      return (a._originalDateKey || '').localeCompare(b._originalDateKey || '');
    });
  }

  function getTasksByDate() {
    const allCards = [];
    (board.columns || []).forEach(col => {
      (col.cards || []).forEach(card => {
        const c = { ...card, _columnId: col.id };
        allCards.push(c);
      });
    });

    const todayKey = getTodayDateKey();
    const fallbackDate = todayKey;

    const byDate = {};

    allCards.forEach(card => {
      const assignedAt = card.assignedAt || card.createdAt || '';
      const assignedDateKey = assignedAt ? assignedAt.slice(0, 10) : fallbackDate;
      const done = isCardDone(card);
      const deadlinePassed = !done && card.deadline && new Date(card.deadline) < new Date();

      let displayDateKey;
      let isRollover = false;
      let originalDateKey = assignedDateKey;

      if (done) {
        displayDateKey = assignedDateKey;
      } else {
        if (assignedDateKey < todayKey) {
          displayDateKey = todayKey;
          isRollover = true;
        } else if (deadlinePassed) {
          displayDateKey = todayKey;
          isRollover = true;
        } else {
          displayDateKey = assignedDateKey;
        }
      }

      if (!byDate[displayDateKey]) byDate[displayDateKey] = [];
      byDate[displayDateKey].push({
        ...card,
        _isRollover: isRollover,
        _originalDateKey: originalDateKey
      });
    });

    return Object.keys(byDate)
      .sort()
      .map(dateKey => {
        const cards = byDate[dateKey];
        cards.sort((a, b) => {
          if (a._isRollover && !b._isRollover) return -1;
          if (!a._isRollover && b._isRollover) return 1;
          if (a._isRollover && b._isRollover) return (a._originalDateKey || '').localeCompare(b._originalDateKey || '');
          return 0;
        });
        return { dateKey, cards };
      });
  }

  function formatDateLabel(dateKey) {
    const todayKey = getTodayDateKey();
    const tomorrowKey = addDaysToDateKey(todayKey, 1);
    if (dateKey === todayKey) return 'Today';
    if (dateKey === tomorrowKey) return 'Tomorrow';
    const d = new Date(dateKey + 'T12:00:00');
    const yesterday = addDaysToDateKey(todayKey, -1);
    if (dateKey === yesterday) return 'Yesterday';
    return formatDateForLabel(dateKey);
  }

  function formatDateLabelWithFullDate(dateKey) {
    const label = formatDateLabel(dateKey);
    const full = formatDateForLabel(dateKey);
    if (label === 'Today' || label === 'Tomorrow' || label === 'Yesterday') return label + ' (' + full + ')';
    return full;
  }

  function getDaysOverdue(originalDateKey) {
    const todayKey = getTodayDateKey();
    if (originalDateKey >= todayKey) return 0;
    const from = new Date(originalDateKey + 'T12:00:00');
    const to = new Date(todayKey + 'T12:00:00');
    return Math.floor((to - from) / (24 * 60 * 60 * 1000));
  }

  function getRolloverLabel(originalDateKey) {
    const yesterdayKey = addDaysToDateKey(getTodayDateKey(), -1);
    const fullDate = formatDateForLabel(originalDateKey);
    const days = getDaysOverdue(originalDateKey);
    const overdueText = days > 0 ? (days === 1 ? '1 day overdue' : days + ' days overdue') : '';
    if (originalDateKey === yesterdayKey) return overdueText ? "Yesterday's task – " + overdueText : "Yesterday's task";
    return overdueText ? 'From ' + fullDate + ' – ' + overdueText : 'From ' + fullDate;
  }

  function formatTaskDate(dateKey) {
    const d = new Date(dateKey + 'T12:00:00');
    return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  }

  function isCardDone(card) {
    return !!(card && card.completedAt);
  }

  /** Single source for task accuracy / performance metrics. Used by Manager tab, accuracy widget, and employee modal. No duplicate recalculation. */
  function computeEmployeeStats() {
    const stats = {};
    (board.columns || []).forEach(col => {
      (col.cards || []).forEach(card => {
        const names = getAssigneesList(card);
        names.forEach(name => {
          const n = (name || '').trim();
          if (!n) return;
          if (!stats[n]) stats[n] = { assigned: 0, completed: 0, onTime: 0 };
          stats[n].assigned += 1;
          if (isCardDone(card)) {
            stats[n].completed += 1;
            if (card.deadline && card.completedAt) {
              if (new Date(card.completedAt) <= new Date(card.deadline)) stats[n].onTime += 1;
            }
          }
        });
      });
    });
    return stats;
  }

  function getEmployeeTasks(employeeName) {
    const tasks = [];
    const nameKey = (employeeName || '').trim().toLowerCase();
    if (!nameKey) return tasks;
    (board.columns || []).forEach(col => {
      (col.cards || []).forEach(card => {
        const names = getAssigneesList(card);
        const has = names.some(n => (n || '').trim().toLowerCase() === nameKey);
        if (has) {
          tasks.push({
            ...card,
            columnTitle: col.title || col.id
          });
        }
      });
    });
    return tasks;
  }

  function getEmployeeCompletionByDay(employeeName) {
    const nameKey = (employeeName || '').trim().toLowerCase();
    if (!nameKey) return { dates: [], dateKeys: [], completions: [], byDate: {} };
    const byDate = {};
    (board.columns || []).forEach(col => {
      (col.cards || []).forEach(card => {
        if (!card.completedAt) return;
        const names = getAssigneesList(card);
        const has = names.some(n => (n || '').trim().toLowerCase() === nameKey);
        if (!has) return;
        const dateKey = card.completedAt.slice(0, 10);
        if (!byDate[dateKey]) byDate[dateKey] = { count: 0, tasks: [] };
        byDate[dateKey].count += 1;
        byDate[dateKey].tasks.push(card.title || 'Task');
      });
    });
    const sortedDates = Object.keys(byDate).sort();
    const todayKey = getTodayDateKey();
    let startDate;
    let endDate = new Date(todayKey + 'T12:00:00');
    if (sortedDates.length > 0) {
      const minDate = sortedDates[0];
      startDate = new Date(minDate + 'T12:00:00');
      const maxDate = sortedDates[sortedDates.length - 1];
      const endFromData = new Date(maxDate + 'T12:00:00');
      if (endFromData > endDate) endDate = endFromData;
    } else {
      startDate = new Date(endDate);
      startDate.setDate(startDate.getDate() - 13);
    }
    const dates = [];
    const dateKeys = [];
    const completions = [];
    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      const dk =
        d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
      dateKeys.push(dk);
      dates.push(d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: '2-digit' }));
      completions.push(byDate[dk] ? byDate[dk].count : 0);
    }
    return { dates, dateKeys, completions, byDate };
  }

  let employeeChartInstance = null;
  let employeeStatsChartInstance = null;

  /** Team accuracy modal: one horizontal progress bar per employee (filled + light unfilled), left card with avatar + name. */
  const TEAM_ACCURACY_FILL_COLORS = [
    '#2563eb',
    '#7c3aed',
    '#db2777',
    '#ea580c',
    '#059669',
    '#0d9488',
    '#0284c7',
    '#c026d3',
    '#ca8a04',
    '#65a30d',
    '#0891b2',
    '#4f46e5'
  ];
  const TEAM_ACCURACY_LEFT_COLORS = [
    '#1e40af',
    '#5b21b6',
    '#9d174d',
    '#c2410c',
    '#047857',
    '#0f766e',
    '#0369a1',
    '#a21caf',
    '#a16207',
    '#4d7c0f',
    '#0e7490',
    '#3730a3'
  ];
  const TEAM_ACCURACY_LIGHT_COLORS = [
    '#93c5fd',
    '#c4b5fd',
    '#f9a8d4',
    '#fdba74',
    '#6ee7b7',
    '#5eead4',
    '#7dd3fc',
    '#f0abfc',
    '#fde047',
    '#bef264',
    '#67e8f9',
    '#a5b4fc'
  ];

  function getInitials(name) {
    if (!name || !name.trim()) return '?';
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
    return name.trim().charAt(0).toUpperCase();
  }

  function openTeamAccuracyModal() {
    const modal = document.getElementById('teamAccuracyModal');
    const summaryEl = document.getElementById('team-accuracy-summary');
    const barsContainer = document.getElementById('team-accuracy-bars');
    const emptyEl = document.getElementById('team-accuracy-empty');
    const hintEl = modal ? modal.querySelector('.team-accuracy-hint') : null;
    if (!modal || !barsContainer) return;
    const stats = computeEmployeeStats();
    const names = Object.keys(stats || {}).filter(n => (n || '').trim());
    const totalAssigned = names.reduce((sum, k) => sum + (stats[k].assigned || 0), 0);
    const totalCompleted = names.reduce((sum, k) => sum + (stats[k].completed || 0), 0);
    const teamPct = totalAssigned > 0 ? Math.round((totalCompleted / totalAssigned) * 100) : 0;
    if (summaryEl) summaryEl.textContent = 'Team accuracy: ' + teamPct + '%';
    if (hintEl) hintEl.style.display = names.length > 0 ? 'block' : 'none';
    barsContainer.innerHTML = '';
    if (emptyEl) {
      emptyEl.classList.toggle('d-none', names.length > 0);
      emptyEl.classList.toggle('d-block', names.length === 0);
    }
    if (names.length === 0) {
      if (typeof bootstrap !== 'undefined') {
        const bsModal = new bootstrap.Modal(modal);
        bsModal.show();
      }
      return;
    }
    const employees = names
      .map(name => {
        const s = stats[name] || {};
        const assigned = s.assigned || 0;
        const completed = s.completed || 0;
        const accuracy = assigned > 0 ? Math.round((completed / assigned) * 100) : 0;
        return { name, assigned, completed, accuracy };
      })
      .filter(e => e.assigned > 0)
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    employees.forEach((emp, idx) => {
      const fillColor = TEAM_ACCURACY_FILL_COLORS[idx % TEAM_ACCURACY_FILL_COLORS.length];
      const leftColor = TEAM_ACCURACY_LEFT_COLORS[idx % TEAM_ACCURACY_LEFT_COLORS.length];
      const lightColor = TEAM_ACCURACY_LIGHT_COLORS[idx % TEAM_ACCURACY_LIGHT_COLORS.length];
      const row = document.createElement('div');
      row.className = 'team-accuracy-row';
      row.title = 'Click to view ' + escapeHtml(emp.name) + "'s performance";
      row.setAttribute('data-employee-name', emp.name);
      const fillPct = Math.min(100, Math.max(0, emp.accuracy));
      const fillMinWidth = fillPct > 0 ? Math.max(fillPct, 10) + '%' : '0';
      row.innerHTML =
        '<div class="team-accuracy-row-left" style="background:' +
        leftColor +
        ';">' +
        '<div class="team-accuracy-row-avatar">' +
        escapeHtml(getInitials(emp.name)) +
        '</div>' +
        '<div class="team-accuracy-row-info">' +
        '<div class="team-accuracy-row-name">' +
        escapeHtml(emp.name) +
        '</div>' +
        '<div class="team-accuracy-row-meta">' +
        emp.completed +
        ' completed / ' +
        emp.assigned +
        ' assigned' +
        '</div>' +
        '</div>' +
        '</div>' +
        '<div class="team-accuracy-row-bar-wrap">' +
        '<div class="team-accuracy-row-fill" style="background:' +
        fillColor +
        ';min-width:' +
        fillMinWidth +
        ';"></div>' +
        '<div class="team-accuracy-row-remain" style="background:' +
        lightColor +
        ';"></div>' +
        '</div>' +
        '<div class="team-accuracy-row-pct-end">' +
        emp.accuracy +
        '%</div>';
      row.addEventListener('click', () => {
        if (typeof bootstrap !== 'undefined' && bootstrap.Modal.getInstance(modal))
          bootstrap.Modal.getInstance(modal).hide();
        openEmployeeModal(emp.name);
      });
      barsContainer.appendChild(row);
    });
    if (typeof bootstrap !== 'undefined') {
      const bsModal = new bootstrap.Modal(modal);
      bsModal.show();
    }
  }

  function openEmployeeModal(employeeName) {
    const modal = document.getElementById('employeeDetailsModal');
    const nameEl = document.getElementById('employee-modal-name');
    const avatarEl = document.getElementById('employee-modal-avatar');
    const profilePicEl = document.getElementById('employee-modal-profile-pic');
    const designationEl = document.getElementById('employee-modal-designation');
    const deptEl = document.getElementById('employee-modal-dept');
    const mobileEl = document.getElementById('employee-modal-mobile');
    const mailEl = document.getElementById('employee-modal-mail');
    const editProfileBtn = document.getElementById('employee-edit-profile-btn');
    const tasksTbody = document.getElementById('employee-tasks-tbody');
    const chartEl = document.getElementById('employeeChart');
    if (!modal || !nameEl) return;

    const name = (employeeName || '').trim();
    const profile = getEmployeeProfile(name);
    const currentUser = getCurrentUser();
    const isOwnProfile =
      currentUser &&
      currentUser.role === 'employee' &&
      (currentUser.name || '').trim().toLowerCase() === name.toLowerCase();

    nameEl.textContent = name || 'Employee';
    if (avatarEl) avatarEl.textContent = name ? name.charAt(0).toUpperCase() : '?';

    if (profilePicEl) {
      if (profile && profile.profilePic) {
        profilePicEl.src = profile.profilePic;
        profilePicEl.classList.remove('d-none');
        if (avatarEl) avatarEl.classList.add('d-none');
      } else {
        profilePicEl.classList.add('d-none');
        if (avatarEl) avatarEl.classList.remove('d-none');
      }
    }
    if (designationEl) designationEl.textContent = profile && profile.designation ? profile.designation : '';
    if (deptEl) deptEl.textContent = profile && profile.department ? profile.department : '';
    if (mobileEl) mobileEl.textContent = profile && profile.mobile ? profile.mobile : '';
    if (mailEl) mailEl.textContent = profile && profile.mail ? profile.mail : '';
    if (editProfileBtn) editProfileBtn.classList.toggle('d-none', !isOwnProfile);

    const stats = computeEmployeeStats();
    const statsKey = Object.keys(stats || {}).find(k => (k || '').trim().toLowerCase() === name.toLowerCase());
    const s = statsKey ? stats[statsKey] : { assigned: 0, completed: 0, onTime: 0 };
    const accuracy = s.assigned > 0 ? Math.round((s.completed / s.assigned) * 100) : 0;
    const completionRate = s.assigned > 0 ? Math.round((s.completed / s.assigned) * 100) : 0;
    const onTimeRate = s.completed > 0 ? Math.round((s.onTime / s.completed) * 100) : 0;
    const assignedRate = Math.min(100, Math.round((s.assigned / 10) * 100));

    const tasks = getEmployeeTasks(name);
    const statsChartEl = document.getElementById('employeeStatsChart');
    if (tasksTbody) {
      if (tasks.length === 0) {
        tasksTbody.innerHTML = '<tr><td colspan="4" class="text-muted text-center py-4">No tasks assigned</td></tr>';
      } else {
        tasksTbody.innerHTML = tasks
          .map(t => {
            const done = isCardDone(t);
            const status = done
              ? '<span class="badge bg-success">Completed</span>'
              : '<span class="badge bg-warning">Pending</span>';
            const urgency = (t.urgency || 'medium').charAt(0).toUpperCase() + (t.urgency || 'medium').slice(1);
            const deadline = t.deadline ? new Date(t.deadline).toLocaleString() : '—';
            return `<tr><td>${escapeHtml(t.title || '')}</td><td>${status}</td><td>${escapeHtml(urgency)}</td><td>${escapeHtml(deadline)}</td></tr>`;
          })
          .join('');
      }
    }

    if (employeeChartInstance) {
      employeeChartInstance.destroy();
      employeeChartInstance = null;
    }
    if (employeeStatsChartInstance) {
      employeeStatsChartInstance.destroy();
      employeeStatsChartInstance = null;
    }
    if (statsChartEl && typeof ApexCharts !== 'undefined') {
      const statsConfig = {
        chart: { type: 'radialBar', height: 280, fontFamily: 'inherit', foreColor: '#0f172a' },
        plotOptions: {
          radialBar: {
            startAngle: -90,
            endAngle: 90,
            hollow: { size: '38%', margin: 4 },
            track: { background: '#e9ecef', strokeWidth: '90%', margin: 2 },
            dataLabels: {
              show: true,
              name: { show: true, fontSize: '13px', fontWeight: 700, offsetY: -2, color: '#0f172a' },
              value: {
                show: true,
                fontSize: '16px',
                fontWeight: 800,
                offsetY: 2,
                formatter: v => v + '%',
                color: '#0f172a'
              },
              total: {
                show: true,
                label: 'Overall',
                fontSize: '12px',
                formatter: () => accuracy + '%',
                color: '#0f172a'
              }
            }
          }
        },
        series: [assignedRate, completionRate, onTimeRate, accuracy],
        labels: ['Assigned', 'Completed', 'On time', 'Accuracy'],
        colors: ['#696cff', '#28c76f', '#00cfe8', '#ff9f43'],
        legend: { show: true, position: 'bottom', fontSize: '12px', labels: { colors: '#0f172a' } },
        tooltip: {
          y: {
            formatter: function (val, opts) {
              const labels = ['Assigned', 'Completed', 'On time', 'Accuracy'];
              const idx = opts.seriesIndex;
              if (idx === 0) return labels[idx] + ': ' + s.assigned + ' task(s) (' + val + '%)';
              if (idx === 1) return labels[idx] + ': ' + s.completed + ' (' + val + '%)';
              if (idx === 2) return labels[idx] + ': ' + s.onTime + ' (' + val + '%)';
              return labels[idx] + ': ' + val + '%';
            }
          }
        }
      };
      employeeStatsChartInstance = new ApexCharts(statsChartEl, statsConfig);
      employeeStatsChartInstance.render();
    }
    if (chartEl && typeof ApexCharts !== 'undefined') {
      const completedTasks = (tasks || []).filter(t => isCardDone(t));
      const completedNames = completedTasks.map(t => t.title || 'Task').slice(0, 8);
      const chartConfig = {
        chart: { type: 'radialBar', height: 180, foreColor: '#0f172a' },
        series: [accuracy],
        colors: s.assigned > 0 ? ['#28c76f'] : ['#e9ecef'],
        plotOptions: {
          radialBar: {
            hollow: { size: '55%', margin: 4 },
            track: { background: '#e9ecef', strokeWidth: '90%', margin: 2 },
            dataLabels: {
              show: true,
              name: {
                show: true,
                fontSize: '11px',
                fontWeight: 700,
                offsetY: -10,
                formatter: () => 'Goal: 100%',
                color: '#0f172a'
              },
              value: {
                show: true,
                fontSize: '24px',
                fontWeight: 800,
                offsetY: 2,
                formatter: v => v + '% achieved',
                color: '#0f172a'
              },
              total: {
                show: true,
                label: 'Tasks',
                fontSize: '11px',
                fontWeight: 700,
                formatter: function () {
                  return s.completed + ' / ' + s.assigned;
                },
                color: '#0f172a'
              }
            }
          }
        },
        labels: ['Tasks'],
        tooltip: {
          custom: function (opts) {
            const taskList =
              completedNames.length > 0
                ? completedNames.map(t => '• ' + escapeHtml(t)).join('<br>') +
                  (completedTasks.length > 8
                    ? '<br><span style="color:#697a8d;font-size:10px">+' + (completedTasks.length - 8) + ' more</span>'
                    : '')
                : 'No tasks completed yet';
            return (
              '<div class="apexcharts-tooltip-title" style="margin-bottom:6px;font-weight:600">Completed tasks</div>' +
              '<div style="font-size:11px;color:#697a8d;max-width:180px;line-height:1.5">' +
              taskList +
              '</div>'
            );
          }
        }
      };
      employeeChartInstance = new ApexCharts(chartEl, chartConfig);
      employeeChartInstance.render();
    }
    const bsModal = new bootstrap.Modal(modal);
    bsModal.show();
  }

  function onEmployeeModalHidden() {
    if (employeeChartInstance) {
      employeeChartInstance.destroy();
      employeeChartInstance = null;
    }
    if (employeeStatsChartInstance) {
      employeeStatsChartInstance.destroy();
      employeeStatsChartInstance = null;
    }
  }

  function openEmployeeProfileModal(employeeName) {
    const modal = document.getElementById('employeeProfileModal');
    const form = document.getElementById('employeeProfileForm');
    const nameInput = document.getElementById('profile-name');
    const deptSelect = document.getElementById('profile-department');
    const designationInput = document.getElementById('profile-designation');
    const mobileInput = document.getElementById('profile-mobile');
    const mailInput = document.getElementById('profile-mail');
    const preview = document.getElementById('profile-pic-preview');
    const placeholder = document.getElementById('profile-pic-placeholder');
    const picInput = document.getElementById('profile-pic-input');
    if (!modal || !form) return;
    const name = (employeeName || '').trim();
    const profile = getEmployeeProfile(name);
    form.dataset.employeeName = name;
    if (nameInput) nameInput.value = name;
    if (designationInput) designationInput.value = profile?.designation || '';
    if (mobileInput) mobileInput.value = profile?.mobile || '';
    if (mailInput) mailInput.value = profile?.mail || '';
    fillDepartmentSelect(deptSelect);
    if (deptSelect) deptSelect.value = profile?.department || '';
    if (profile?.profilePic) {
      if (preview) {
        preview.src = profile.profilePic;
        preview.classList.remove('d-none');
      }
      if (placeholder) placeholder.classList.add('d-none');
    } else {
      if (preview) preview.classList.add('d-none');
      if (placeholder) placeholder.classList.remove('d-none');
    }
    if (picInput) picInput.value = '';
    delete form.dataset.profilePicData;
    new bootstrap.Modal(modal).show();
  }

  function saveEmployeeProfile() {
    const form = document.getElementById('employeeProfileForm');
    const name = form?.dataset?.employeeName?.trim();
    if (!name) return;
    const data = {
      name: document.getElementById('profile-name')?.value?.trim() || name,
      department: document.getElementById('profile-department')?.value?.trim() || '',
      designation: document.getElementById('profile-designation')?.value?.trim() || '',
      mobile: document.getElementById('profile-mobile')?.value?.trim() || '',
      mail: document.getElementById('profile-mail')?.value?.trim() || ''
    };
    if (form.dataset.profilePicData) data.profilePic = form.dataset.profilePicData;
    setEmployeeProfile(name, data);
    saveBoard();
    bootstrap.Modal.getInstance(document.getElementById('employeeProfileModal')).hide();
    openEmployeeModal(name);
    render();
    renderManagerTab();
  }

  function getEmployeePerformanceByPeriod(period) {
    const stats = computeEmployeeStats();
    const names = Object.keys(stats || {}).sort();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tasksByEmployee = {};
    names.forEach(n => {
      tasksByEmployee[n] = getEmployeeTasks(n);
    });

    function filterByPeriod(tasks, periodType) {
      if (!tasks || tasks.length === 0) return [];
      const now = new Date();
      if (periodType === 'day') {
        const dayStart = new Date(now);
        dayStart.setHours(0, 0, 0, 0);
        return tasks.filter(t => {
          const d = t.assignedAt ? new Date(t.assignedAt) : null;
          if (!d) return false;
          return d >= dayStart;
        });
      }
      if (periodType === 'week') {
        const weekStart = new Date(now);
        weekStart.setDate(weekStart.getDate() - weekStart.getDay());
        weekStart.setHours(0, 0, 0, 0);
        return tasks.filter(t => {
          const d = t.assignedAt ? new Date(t.assignedAt) : null;
          if (!d) return false;
          return d >= weekStart;
        });
      }
      if (periodType === 'month') {
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        return tasks.filter(t => {
          const d = t.assignedAt ? new Date(t.assignedAt) : null;
          if (!d) return false;
          return d >= monthStart;
        });
      }
      return tasks;
    }

    const rows = [];
    const periodLabel =
      { day: 'Day-wise', week: 'Week-wise', month: 'Month-wise', overall: 'Overall' }[period] || period;
    rows.push(['Employee Performance Report - ' + periodLabel]);
    rows.push(['Generated: ' + new Date().toLocaleString()]);
    rows.push([]);
    rows.push(['Employee', 'Department', 'Assigned', 'Completed', 'On Time', 'Accuracy %', 'Period']);

    names.forEach(empName => {
      let empTasks = tasksByEmployee[empName] || [];
      if (period !== 'overall') empTasks = filterByPeriod(empTasks, period);
      const assigned = empTasks.length;
      const completed = empTasks.filter(t => isCardDone(t)).length;
      const onTime = empTasks.filter(t => {
        if (!isCardDone(t)) return false;
        const d = t.completedAt ? new Date(t.completedAt) : null;
        const dead = t.deadline ? new Date(t.deadline) : null;
        return !dead || !d || d <= dead;
      }).length;
      const accuracy = assigned > 0 ? Math.round((completed / assigned) * 100) : 0;
      const profile = getEmployeeProfile(empName);
      const dept = profile?.department || '';
      rows.push([empName, dept, assigned, completed, onTime, accuracy + '%', periodLabel]);
    });

    return rows;
  }

  function escapeCsvCell(val) {
    const s = String(val ?? '');
    const needsQuote = /[",\n\r]/.test(s);
    return needsQuote ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  /** Get all task cards from board (same source as Stored data tab). */
  function getAllTaskCards() {
    const cols = board.columns || [];
    const allCards = [];
    cols.forEach(col => (col.cards || []).forEach(card => allCards.push(card)));
    return allCards;
  }

  /** Get YYYY-MM-DD from a card's assignedAt/createdAt. Handles ISO string, timestamp number, or missing. */
  function getCardDateKey(card) {
    const raw = card.assignedAt || card.createdAt;
    if (raw == null) return null;
    if (typeof raw === 'number') {
      const d = new Date(raw);
      if (isNaN(d.getTime())) return null;
      return (
        d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
      );
    }
    const s = String(raw).trim();
    if (!s) return null;
    if (s.length >= 10 && s[4] === '-' && s[7] === '-') return s.slice(0, 10);
    const d = new Date(s);
    if (isNaN(d.getTime())) return null;
    return (
      d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
    );
  }

  /** Build dashboard summary from cards: key metrics, by urgency, by department. */
  function buildDashboardData(allCards) {
    const now = new Date();
    let completed = 0;
    let overdue = 0;
    const urgencyCount = { high: 0, medium: 0, low: 0 };
    const deptCount = {};
    allCards.forEach(card => {
      const done = isCardDone(card);
      if (done) completed += 1;
      if (!done && card.deadline && new Date(card.deadline) < now) overdue += 1;
      const u = (card.urgency || 'medium').toLowerCase();
      if (u === 'high') urgencyCount.high += 1;
      else if (u === 'low') urgencyCount.low += 1;
      else urgencyCount.medium += 1;
      const dept = (card.department || '').trim() || 'Other';
      deptCount[dept] = (deptCount[dept] || 0) + 1;
    });
    const pending = allCards.length - completed;
    const deptRows = Object.keys(deptCount)
      .sort((a, b) => deptCount[b] - deptCount[a])
      .map(d => [d, deptCount[d]]);
    return {
      total: allCards.length,
      completed,
      pending,
      overdue,
      urgencyCount,
      deptRows
    };
  }

  function exportStoredDataToExcel() {
    const allCards = getAllTaskCards();

    const headers = [
      'S.No',
      'ID',
      'Date',
      'Title',
      'Description',
      'Status',
      'Urgency',
      'Department',
      'Deadline',
      'Assigned to',
      'Assigned by',
      'Completed at',
      'Link',
      'Link type',
      'Recurring'
    ];

    const dataRows = [];
    allCards.forEach((card, idx) => {
      const dateRaw = card.assignedAt || card.createdAt;
      const dateStr = dateRaw ? (isNaN(new Date(dateRaw).getTime()) ? '—' : new Date(dateRaw).toLocaleString()) : '—';
      const deadlineStr = card.deadline
        ? isNaN(new Date(card.deadline).getTime())
          ? '—'
          : new Date(card.deadline).toLocaleString()
        : '—';
      const completedStr = card.completedAt
        ? isNaN(new Date(card.completedAt).getTime())
          ? '—'
          : new Date(card.completedAt).toLocaleString()
        : '—';
      const status = isCardDone(card) ? 'Completed' : 'Pending';
      const assigneesStr = getAssigneesList(card).join(', ') || '—';
      dataRows.push([
        idx + 1,
        card.id || '—',
        dateStr,
        card.title || '—',
        card.description ?? '—',
        status,
        card.urgency || 'medium',
        card.department || '—',
        deadlineStr,
        assigneesStr,
        card.assignedByName || '—',
        completedStr,
        card.link || '—',
        card.linkType || '—',
        card.recurringTemplateId ? 'Yes' : '—'
      ]);
    });

    if (typeof XLSX !== 'undefined') {
      const dash = buildDashboardData(allCards);
      const genDate = new Date().toLocaleString();
      const dashboardRows = [
        ['TASK MANAGER - DASHBOARD'],
        [],
        ['Report generated:', genDate],
        [],
        ['KEY METRICS'],
        ['Metric', 'Value'],
        ['Total Tasks', dash.total],
        ['Completed', dash.completed],
        ['Pending', dash.pending],
        ['Overdue', dash.overdue],
        [],
        ['BY URGENCY'],
        ['Urgency', 'Count'],
        ['High', dash.urgencyCount.high],
        ['Medium', dash.urgencyCount.medium],
        ['Low', dash.urgencyCount.low],
        [],
        ['BY DEPARTMENT'],
        ['Department', 'Count']
      ].concat(dash.deptRows);

      const wsDashboard = XLSX.utils.aoa_to_sheet(dashboardRows);
      const wsData = XLSX.utils.aoa_to_sheet([headers].concat(dataRows));

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, wsDashboard, 'Dashboard');
      XLSX.utils.book_append_sheet(wb, wsData, 'Task Data');

      if (!wb.Workbook) wb.Workbook = {};
      if (!wb.Workbook.Views) wb.Workbook.Views = [];
      wb.Workbook.Views[0] = { activeTab: 0 };
      wb.Props = wb.Props || {};
      wb.Props.Application = 'Task Manager';

      const colWidthsDashboard = [{ wch: 22 }, { wch: 12 }];
      wsDashboard['!cols'] = colWidthsDashboard;
      const colWidthsData = headers.map((_, i) => ({ wch: i === 2 || i === 3 ? 28 : i === 4 ? 40 : 14 }));
      wsData['!cols'] = colWidthsData;

      const xlsxBlob = XLSX.write(wb, { bookType: 'xlsx', type: 'array', bookSST: false, cellStyles: false });
      const blob = new Blob([xlsxBlob], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = 'task-manager-export-' + getTodayDateKey() + '.xlsx';
      link.click();
      URL.revokeObjectURL(link.href);
      return;
    }

    const rows = [['TASK DATA EXPORT'], ['Generated: ' + new Date().toLocaleString()], [], headers].concat(dataRows);
    const csv = rows.map(row => row.map(escapeCsvCell).join(',')).join('\r\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'stored-task-data-' + getTodayDateKey() + '.csv';
    link.click();
    URL.revokeObjectURL(link.href);
  }

  /** Returns task cards filtered by period (day = today, week = this week, month = this month, overall = all). Same source as Stored data tab. */
  function getTaskCardsByPeriod(period) {
    const allCards = getAllTaskCards();
    if (!period || period === 'overall') return allCards;
    const today = new Date();
    const todayKey = getTodayDateKey();
    const startOfWeek = new Date(today);
    const dayOfWeek = startOfWeek.getDay();
    const diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    startOfWeek.setDate(today.getDate() - diff);
    const startOfWeekKey =
      startOfWeek.getFullYear() +
      '-' +
      String(startOfWeek.getMonth() + 1).padStart(2, '0') +
      '-' +
      String(startOfWeek.getDate()).padStart(2, '0');
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(endOfWeek.getDate() + 6);
    const endOfWeekKey =
      endOfWeek.getFullYear() +
      '-' +
      String(endOfWeek.getMonth() + 1).padStart(2, '0') +
      '-' +
      String(endOfWeek.getDate()).padStart(2, '0');
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const startOfMonthKey = year + '-' + month + '-01';
    const lastDay = new Date(year, today.getMonth() + 1, 0);
    const endOfMonthKey = year + '-' + month + '-' + String(lastDay.getDate()).padStart(2, '0');
    return allCards.filter(card => {
      const dateKey = getCardDateKey(card);
      if (!dateKey) return false;
      if (period === 'day') return dateKey === todayKey;
      if (period === 'week') return dateKey >= startOfWeekKey && dateKey <= endOfWeekKey;
      if (period === 'month') return dateKey >= startOfMonthKey && dateKey <= endOfMonthKey;
      return true;
    });
  }

  /** Exports task data to Excel (same columns as Stored data tab) filtered by period: day, week, month, or overall. */
  function exportTaskDataToExcel(period) {
    const cards = getTaskCardsByPeriod(period);
    const headers = [
      'S.No',
      'ID',
      'Date',
      'Title',
      'Description',
      'Status',
      'Urgency',
      'Department',
      'Deadline',
      'Assigned to',
      'Assigned by',
      'Completed at',
      'Link',
      'Link type',
      'Recurring'
    ];
    const rows = [];
    const periodLabel =
      period === 'day' ? 'Day-wise' : period === 'week' ? 'Week-wise' : period === 'month' ? 'Month-wise' : 'All tasks';
    rows.push(['TASK DATA EXPORT - ' + periodLabel]);
    rows.push(['Generated: ' + new Date().toLocaleString()]);
    rows.push([]);
    rows.push(headers);
    cards.forEach((card, idx) => {
      const dateRaw = card.assignedAt || card.createdAt;
      const dateStr = dateRaw ? (isNaN(new Date(dateRaw).getTime()) ? '—' : new Date(dateRaw).toLocaleString()) : '—';
      const deadlineStr = card.deadline
        ? isNaN(new Date(card.deadline).getTime())
          ? '—'
          : new Date(card.deadline).toLocaleString()
        : '—';
      const completedStr = card.completedAt
        ? isNaN(new Date(card.completedAt).getTime())
          ? '—'
          : new Date(card.completedAt).toLocaleString()
        : '—';
      const status = isCardDone(card) ? 'Completed' : 'Pending';
      const assigneesStr = getAssigneesList(card).join(', ') || '—';
      rows.push([
        idx + 1,
        card.id || '—',
        dateStr,
        card.title || '—',
        card.description ?? '—',
        status,
        card.urgency || 'medium',
        card.department || '—',
        deadlineStr,
        assigneesStr,
        card.assignedByName || '—',
        completedStr,
        card.link || '—',
        card.linkType || '—',
        card.recurringTemplateId ? 'Yes' : '—'
      ]);
    });
    const csv = rows.map(row => row.map(escapeCsvCell).join(',')).join('\r\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'task-data-' + period + '-' + getTodayDateKey() + '.csv';
    link.click();
    URL.revokeObjectURL(link.href);
  }

  function exportToExcel(period) {
    exportTaskDataToExcel(period);
  }

  let kanbanCalendarMonth = new Date();
  kanbanCalendarMonth.setDate(1);

  function getTasksByDateKey() {
    const byDate = {};
    (board.columns || []).forEach(col => {
      (col.cards || []).forEach(card => {
        const assignedAt = card.assignedAt || card.createdAt || '';
        const dateKey = assignedAt ? assignedAt.slice(0, 10) : '';
        if (!dateKey) return;
        if (!byDate[dateKey]) byDate[dateKey] = [];
        byDate[dateKey].push({ ...card, status: isCardDone(card) ? 'Completed' : 'Pending' });
      });
    });
    return byDate;
  }

  function getTaskLinkType(task) {
    if (!task || !task.link) return '';
    const t = (task.linkType || '').toLowerCase();
    if (t === 'meeting' || t === 'drive' || t === 'document') return t;
    const title = (task.title || '').toLowerCase();
    if (title.includes('meeting')) return 'meeting';
    if (title.includes('drive')) return 'drive';
    if (title.includes('doc')) return 'document';
    return 'document';
  }

  function isSafeLinkUrl(url) {
    if (!url || typeof url !== 'string') return false;
    const u = url.trim();
    return u.startsWith('http://') || u.startsWith('https://');
  }

  function renderKanbanCalendar() {
    const grid = document.getElementById('kanban-calendar');
    const monthEl = document.getElementById('kanban-calendar-month');
    const detailWrap = document.getElementById('kanban-calendar-day-detail');
    const detailTitle = document.getElementById('kanban-day-detail-title');
    const detailBody = document.getElementById('kanban-day-detail-body');
    const hintsWrap = document.getElementById('kanban-calendar-hints');
    if (!grid) return;
    const byDate = getTasksByDateKey();
    const todayKey = getTodayDateKey();
    const year = kanbanCalendarMonth.getFullYear();
    const month = kanbanCalendarMonth.getMonth();
    monthEl.textContent = kanbanCalendarMonth.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startPad = (firstDay.getDay() + 6) % 7;
    const daysInMonth = lastDay.getDate();
    const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

    if (hintsWrap) {
      const next7Keys = [];
      for (let i = 0; i < 7; i++) {
        const d = new Date(todayKey + 'T12:00:00');
        d.setDate(d.getDate() + i);
        next7Keys.push(
          d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
        );
      }
      const upcoming = [];
      next7Keys.forEach(dateKey => {
        (byDate[dateKey] || []).forEach(t => {
          if (!t.link) return;
          const linkType = getTaskLinkType(t);
          const label = linkType === 'meeting' ? 'Meeting' : linkType === 'drive' ? 'Drive' : 'Link';
          const dayLabel =
            dateKey === todayKey ? 'Today' : dateKey === next7Keys[1] ? 'Tomorrow' : formatTaskDate(dateKey);
          upcoming.push({ title: t.title || 'Task', label, dateKey, dayLabel, link: t.link });
        });
      });
      if (upcoming.length > 0) {
        hintsWrap.innerHTML =
          '<div class="cal-hints-title"><i class="bx bx-info-circle me-1"></i>Upcoming meetings &amp; drives</div>' +
          upcoming
            .slice(0, 8)
            .map(u => {
              const badgeClass =
                u.label === 'Meeting'
                  ? 'cal-hint-badge cal-hint-badge-meeting'
                  : u.label === 'Drive'
                    ? 'cal-hint-badge cal-hint-badge-drive'
                    : 'cal-hint-badge';
              return (
                '<div class="cal-hint-item">' +
                '<span class="' +
                badgeClass +
                '">' +
                escapeHtml(u.label) +
                '</span> ' +
                escapeHtml(u.title) +
                ' <span class="cal-hint-day">(' +
                escapeHtml(u.dayLabel) +
                ')</span></div>'
              );
            })
            .join('');
        hintsWrap.classList.remove('d-none');
      } else {
        hintsWrap.innerHTML = '';
        hintsWrap.classList.add('d-none');
      }
    }

    let html = dayNames.map(d => `<div class="cal-day-name">${d}</div>`).join('');
    for (let i = 0; i < startPad; i++) html += '<div class="cal-day"></div>';
    for (let d = 1; d <= daysInMonth; d++) {
      const dateKey = year + '-' + String(month + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
      const tasks = byDate[dateKey] || [];
      const count = tasks.length;
      const hasMeeting = tasks.some(t => t.link && getTaskLinkType(t) === 'meeting');
      const hasDrive = tasks.some(t => t.link && getTaskLinkType(t) === 'drive');
      const hasLink = tasks.some(t => t.link);
      let title = count + ' task(s)';
      if (dateKey === todayKey && (hasMeeting || hasDrive))
        title += ' — ' + (hasMeeting ? 'Meeting today. ' : '') + (hasDrive ? 'Drive today.' : '');
      else if (hasMeeting) title += ' — Meeting';
      else if (hasDrive) title += ' — Drive';
      const icons =
        (hasMeeting
          ? '<span class="cal-icon cal-icon-meeting" title="Meeting with link"><i class="bx bx-video"></i></span>'
          : '') +
        (hasDrive
          ? '<span class="cal-icon cal-icon-drive" title="Drive link"><i class="bx bx-folder"></i></span>'
          : '') +
        (hasLink && !hasMeeting && !hasDrive
          ? '<span class="cal-icon cal-icon-doc" title="Link"><i class="bx bx-link"></i></span>'
          : '');
      html += `<div class="cal-day${count ? ' has-tasks' : ''}${hasMeeting ? ' has-meeting' : ''}${hasDrive ? ' has-drive' : ''}" data-date="${dateKey}" title="${escapeHtml(title)}"><span class="cal-num">${d}</span>${count ? '<span class="cal-count">' + count + '</span>' : ''}${icons}</div>`;
    }
    grid.innerHTML = html;
    grid.querySelectorAll('.cal-day[data-date]').forEach(el => {
      el.addEventListener('click', () => {
        grid.querySelectorAll('.cal-day').forEach(c => c.classList.remove('selected'));
        el.classList.add('selected');
        const dateKey = el.dataset.date;
        const freshByDate = getTasksByDateKey();
        const tasks = freshByDate[dateKey] || [];
        const d = new Date(dateKey + 'T12:00:00');
        detailTitle.textContent =
          'Tasks for ' +
          d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' });
        if (tasks.length === 0) {
          detailBody.innerHTML = '<p class="text-muted mb-0">No tasks assigned this day.</p>';
        } else {
          const hasLinkCol = tasks.some(t => t.link);
          let tableHtml =
            '<table class="table table-sm mb-0"><thead><tr><th>Task</th><th>Assigned to</th><th>Status</th>' +
            (hasLinkCol ? '<th>Link</th>' : '') +
            '</tr></thead><tbody>';
          tasks.forEach(t => {
            const linkType = getTaskLinkType(t);
            const iconClass = linkType === 'meeting' ? 'bx-video' : linkType === 'drive' ? 'bx-folder' : 'bx-link';
            const linkLabel =
              linkType === 'meeting' ? 'Open meeting' : linkType === 'drive' ? 'Open drive' : 'Open link';
            let linkCell = '';
            if (hasLinkCol) {
              if (t.link && isSafeLinkUrl(t.link)) {
                linkCell =
                  '<td><a href="' +
                  escapeHtml(t.link) +
                  '" target="_blank" rel="noopener noreferrer" class="cal-day-link"><i class="bx ' +
                  iconClass +
                  ' me-1"></i>' +
                  escapeHtml(linkLabel) +
                  '</a></td>';
              } else {
                linkCell = '<td class="text-muted">—</td>';
              }
            }
            tableHtml +=
              '<tr><td>' +
              escapeHtml(t.title || '') +
              '</td><td>' +
              escapeHtml(getAssigneesList(t).join(', ') || '—') +
              '</td><td><span class="badge ' +
              (t.status === 'Completed' ? 'bg-success' : 'bg-warning') +
              '">' +
              escapeHtml(t.status) +
              '</span></td>' +
              linkCell +
              '</tr>';
          });
          tableHtml += '</tbody></table>';
          detailBody.innerHTML = tableHtml;
        }
        detailWrap.classList.remove('d-none');
      });
    });
  }

  function render() {
    const container = document.getElementById('kanban-board');
    if (!container) return;
    const manager = canCreateAndAssign();
    const dateGroups = getTasksByDate();

    if (dateGroups.length === 0) {
      container.innerHTML = '<p class="text-muted py-5">No tasks yet. Add tasks from the Tasks tab.</p>';
      const todoCol = (board.columns || []).find(c => (c.id || '').toString().toLowerCase() === 'todo');
      if (manager && todoCol) {
        const addBtn = document.createElement('button');
        addBtn.type = 'button';
        addBtn.className = 'btn btn-sm btn-outline-primary';
        addBtn.dataset.columnId = todoCol.id;
        addBtn.textContent = '+ Add card';
        addBtn.addEventListener('click', onAddCard);
        container.appendChild(addBtn);
      }
      return;
    }

    const todayKey = getTodayDateKey();
    const groupsToRender = [];
    dateGroups.forEach(group => {
      let filteredCards = group.cards;
      if (searchQuery) {
        const lowerQuery = searchQuery.toLowerCase();
        filteredCards = filteredCards.filter(card => {
          const titleMatch = (card.title || '').toLowerCase().includes(lowerQuery);
          const descMatch = (card.description || '').toLowerCase().includes(lowerQuery);
          const assigneeMatch = getAssigneesList(card).some(name => name.toLowerCase().includes(lowerQuery));
          const taskIdMatch = (card.id || '').toLowerCase().includes(lowerQuery);
          return titleMatch || descMatch || assigneeMatch || taskIdMatch;
        });
      }
      if (group.dateKey === todayKey) {
        const rolloverPending = filteredCards.filter(c => !isCardDone(c) && c._isRollover === true);
        const todayRest = filteredCards.filter(c => !c._isRollover || isCardDone(c));
        groupsToRender.push({
          dateKey: group.dateKey,
          label: 'Pending – Rollover to today',
          cards: sortCardsByPriority(rolloverPending),
          isRolloverPart: true
        });
        groupsToRender.push({
          dateKey: group.dateKey,
          label: 'Today (' + formatDateForLabel(todayKey) + ')',
          cards: sortCardsByPriority(todayRest),
          isTodayPart: true
        });
      } else {
        groupsToRender.push({
          dateKey: group.dateKey,
          label: formatDateLabelWithFullDate(group.dateKey),
          cards: sortCardsByPriority(filteredCards)
        });
      }
    });

    function renderColumn(group) {
      const partClass = group.isRolloverPart ? ' kanban-part-rollover' : group.isTodayPart ? ' kanban-part-today' : '';
      return `
      <div class="kanban-column kanban-date-column${partClass}" data-date-key="${group.dateKey}">
        <div class="kanban-column-header">
          <h6 class="mb-0">${escapeHtml(group.label)}</h6>
          <span class="badge bg-label-primary">${group.cards.length}</span>
        </div>
        <div class="kanban-column-cards" data-date-key="${group.dateKey}">
          ${group.cards
            .map(card => {
              const isDone = isCardDone(card);
              const isRollover = card._isRollover === true;
              const urgency = card.urgency || 'medium';
              const urgencyClass = isDone
                ? ''
                : urgency === 'high'
                  ? 'kanban-urgency-high'
                  : urgency === 'low'
                    ? 'kanban-urgency-low'
                    : 'kanban-urgency-medium';
              const doneClass = isDone ? 'kanban-card-done' : '';
              const rolloverClass = isRollover ? 'kanban-card-rollover' : '';
              const rolloverBadge = isRollover
                ? `<span class="rollover-badge"><i class="bx bx-error-circle text-warning"></i> ${escapeHtml(getRolloverLabel(card._originalDateKey || ''))}</span>`
                : '';
              const assignedDateKey = card._originalDateKey || card.assignedAt?.slice(0, 10) || '';
              const taskDateHtml = assignedDateKey
                ? `<span class="task-assigned-date small text-muted"><i class="bx bx-calendar me-1"></i>${escapeHtml(formatTaskDate(assignedDateKey))}</span>`
                : '';
              const assigneeNames = getAssigneesList(card);
              const assigneeHtml = assigneeNames.length > 0 ? assigneesInitialsOnly(assigneeNames) : '';
              const deptHtml = card.department
                ? `<span class="badge bg-label-info me-1 small">${escapeHtml(card.department)}</span>`
                : '';
              const isOverdue = card.deadline && !isDone && new Date(card.deadline) < new Date();
              const countdownTimerText = card.deadline
                ? formatDeadlineTimer(card.deadline, card.completedAt, isDone)
                : 'No deadline';
              const progressPct =
                card.deadline && !isDone && !isOverdue
                  ? getDueTimeProgressPercent(card.deadline, card.completedAt, false, card.assignedAt || card.createdAt)
                  : 100;
              const isCountdownWarning = !isDone && card.deadline && !isOverdue && progressPct <= 50;
              const circR = 28;
              const circC = 2 * Math.PI * circR;
              const circFill = card.deadline && !isDone && !isOverdue ? (progressPct / 100) * circC : circC;
              const digitalText = card.deadline ? formatDeadlineDigital(card.deadline, card.completedAt, isDone) : '—';
              const deadlineHtml = !card.deadline
                ? '<span class="card-deadline card-countdown-timer d-block mt-1">' +
                  escapeHtml('No deadline') +
                  '</span>'
                : isOverdue
                  ? '<span class="card-deadline card-countdown-timer d-block mt-1 overdue">' +
                    escapeHtml(countdownTimerText) +
                    '</span>'
                  : '<div class="card-countdown-circle-wrap mt-1 ' +
                    (isCountdownWarning ? 'card-countdown-warning' : '') +
                    '" title="' +
                    escapeHtml(countdownTimerText) +
                    '">' +
                    '<svg class="card-countdown-circle-svg" viewBox="0 0 64 64" width="64" height="64">' +
                    '<circle class="card-countdown-circle-bg" cx="32" cy="32" r="' +
                    circR +
                    '"/>' +
                    '<circle class="card-countdown-circle-fill" cx="32" cy="32" r="' +
                    circR +
                    '" stroke-dasharray="' +
                    circFill +
                    ' ' +
                    circC +
                    '"/>' +
                    '</svg>' +
                    '<span class="card-countdown-digital">' +
                    escapeHtml(digitalText) +
                    '</span>' +
                    '</div>';
              const assignedByHtml = card.assignedByName
                ? `<span class="card-assigned-by d-block mt-1 small text-muted"><i class="bx bx-user-plus me-1"></i>Assigned by ${escapeHtml(card.assignedByName)}</span>`
                : '';
              const recFreq = (card.recurringFrequency || 'daily').toLowerCase();
              const recLabel = recFreq === 'weekly' ? 'Weekly' : recFreq === 'monthly' ? 'Monthly' : 'Daily';
              const recurringBadge = card.isRecurringTask
                ? '<span class="badge bg-label-secondary me-1 small"><i class="bx bx-refresh me-1"></i>' +
                  recLabel +
                  '</span>'
                : '';
              const completedBadge = isDone
                ? '<span class="task-completed-badge"><i class="bx bx-like"></i> Completed</span>'
                : '';
              const todoCol =
                (board.columns || []).find(c => (c.id || '').toString().toLowerCase() === 'todo') ||
                (board.columns || [])[0];
              const colId = card._columnId || (todoCol ? todoCol.id : 'todo');
              const toggleBtnClass = isDone ? 'kanban-done-toggle-btn done' : 'kanban-done-toggle-btn';
              const toggleIcon = isDone ? 'bx-like' : 'bx-circle';
              const toggleTitle = isDone ? 'Mark as not done' : 'Mark as done';
              const clickTitle = manager ? 'Click to edit' : 'Click to view';
              const showMarkDone = isManager();
              return `
            <div class="card kanban-card kanban-card-clickable ${urgencyClass} ${doneClass} ${rolloverClass} ${isOverdue ? 'kanban-card-overdue' : ''}" data-card-id="${card.id}" data-column-id="${colId}" title="${clickTitle}">
              <div class="card-body py-3 d-flex gap-2 align-items-start">
                ${showMarkDone ? `<button type="button" class="${toggleBtnClass}" data-card-id="${escapeHtml(card.id)}" title="${toggleTitle}" aria-label="${toggleTitle}"><i class="bx ${toggleIcon}"></i></button>` : '<span class="kanban-done-toggle-btn-placeholder" style="width:40px;height:40px;flex-shrink:0;"></span>'}
                <div class="flex-grow-1 min-w-0 kanban-card-main">
                ${rolloverBadge}
                ${taskDateHtml}
                <div class="d-flex justify-content-between align-items-start gap-2">
                  <div class="d-flex align-items-center gap-2 flex-grow-1 min-w-0 flex-wrap">
                    ${recurringBadge}
                    <h6 class="kanban-card-title mb-0 text-truncate">${escapeHtml(card.title)}</h6>
                  </div>
                  <div class="kanban-card-right d-flex align-items-center gap-2 flex-shrink-0">
                    ${assigneeHtml}
                    ${deptHtml}
                  </div>
                </div>
                ${card.description ? `<p class="kanban-card-description card-text small mb-0 mt-1">${escapeHtml(card.description)}</p>` : ''}
                ${deadlineHtml}
                ${assignedByHtml}
                ${completedBadge}
                </div>
              </div>
            </div>
          `;
            })
            .join('')}
        </div>
        ${manager ? `<div class="kanban-add-card-wrap"><button type="button" class="btn btn-sm btn-outline-primary w-100 add-card" data-column-id="${((board.columns || [])[0] && board.columns[0].id) || 'todo'}">+ Add card</button></div>` : ''}
      </div>
    `;
    }

    let boardHtml = '';
    const pendingGroup = groupsToRender.find(g => g.isRolloverPart);
    const todayGroup = groupsToRender.find(g => g.isTodayPart);
    const otherGroups = groupsToRender.filter(g => !g.isRolloverPart && !g.isTodayPart);
    const hasTodayView = pendingGroup !== undefined || todayGroup !== undefined;
    const nonEmptyGroups = groupsToRender.filter(g => g.cards.length > 0);

    if (nonEmptyGroups.length === 0) {
      container.innerHTML = searchQuery
        ? '<p class="text-muted py-5">No tasks found matching your search.</p>'
        : '<p class="text-muted py-5">No tasks yet. Add tasks from the Tasks tab.</p>';
      return;
    }

    if (hasTodayView) {
      // Pending always on top (row 1), Today always below (row 2) – two separate rows
      boardHtml += '<div class="kanban-board-rows">';
      boardHtml +=
        '<div class="kanban-board-row kanban-row-pending">' +
        renderColumn(
          pendingGroup || {
            dateKey: getTodayDateKey(),
            label: 'Pending – Rollover to today',
            cards: [],
            isRolloverPart: true
          }
        ) +
        '</div>';
      boardHtml +=
        '<div class="kanban-board-row kanban-row-today">' +
        renderColumn(
          todayGroup || {
            dateKey: getTodayDateKey(),
            label: 'Today (' + formatDateForLabel(getTodayDateKey()) + ')',
            cards: [],
            isTodayPart: true
          }
        ) +
        '</div>';
      if (otherGroups.length > 0) {
        boardHtml += '<div class="kanban-board-row">';
        otherGroups.forEach(g => {
          boardHtml += renderColumn(g);
        });
        boardHtml += '</div>';
      }
      boardHtml += '</div>';
    } else {
      boardHtml += '<div class="kanban-board-rows"><div class="kanban-board-row">';
      groupsToRender.forEach(g => {
        boardHtml += renderColumn(g);
      });
      boardHtml += '</div></div>';
    }
    container.innerHTML = boardHtml;

    container.querySelectorAll('.kanban-done-toggle-btn').forEach(btn => {
      btn.addEventListener('click', onToggleDone);
    });
    onToggleDone.managerOnly = true;
    if (manager) {
      container.querySelectorAll('.add-card').forEach(btn => btn.addEventListener('click', onAddCard));
    }
    container.querySelectorAll('.kanban-card-clickable').forEach(el => {
      el.addEventListener('click', e => {
        if (e.target.closest('.kanban-done-toggle-btn')) return;
        if (e.target.closest('.assignee-clickable')) return;
        const cardId = el.dataset.cardId;
        if (!cardId) return;
        const col = board.columns.find(c => (c.cards || []).some(card => card.id === cardId));
        if (!col) return;
        const card = col.cards.find(c => c.id === cardId);
        if (!card) return;
        if (manager) openCardModal(card, col.id);
        else openTaskDetailsModal(card);
      });
    });
    container.querySelectorAll('.assignee-clickable').forEach(el => {
      el.addEventListener('click', e => {
        e.preventDefault();
        e.stopPropagation();
        const name = el.dataset.employeeName;
        if (name) openEmployeeModal(name);
      });
    });
    const calBtnWrap = document.getElementById('kanban-calendar-btn-wrap');
    if (calBtnWrap) calBtnWrap.classList.toggle('d-none', !manager);
  }

  async function onToggleDone(e) {
    const btn = e.currentTarget;
    const cardId = btn.dataset.cardId;
    if (!cardId) return;
    const col = (board.columns || []).find(c => (c.cards || []).some(card => card.id === cardId));
    if (!col) return;
    const card = (col.cards || []).find(c => c.id === cardId);
    if (!card) return;
    const currentlyDone = isCardDone(card);
    if (currentlyDone) {
      card.completedAt = undefined;
    } else {
      card.completedAt = new Date().toISOString();
    }
    // Immediately update UI for instant feedback
    render();
    updateAccuracyUI();
    renderManagerTab();
    renderStoredDataView();
    // Save to server (async)
    await saveBoard();
  }

  function onAddCard(e) {
    if (!canCreateAndAssign()) return;
    const columnId = e.currentTarget.dataset.columnId;
    openCardModal(null, columnId);
  }

  function onEditCard(e) {
    e.preventDefault();
    if (!canCreateAndAssign()) return;
    const cardId = e.target.closest('[data-card-id]').dataset.cardId;
    const col = board.columns.find(c => (c.cards || []).some(card => card.id === cardId));
    if (col)
      openCardModal(
        col.cards.find(c => c.id === cardId),
        col.id
      );
  }

  function onDeleteCard(e) {
    e.preventDefault();
    if (!canCreateAndAssign()) return;
    const cardId = e.target.closest('[data-card-id]').dataset.cardId;
    const col = board.columns.find(c => (c.cards || []).some(card => card.id === cardId));
    if (col && confirm('Delete this card?')) {
      col.cards = col.cards.filter(c => c.id !== cardId);
      saveBoard();
      render();
    }
  }

  function onViewCardDetails(e) {
    e.preventDefault();
    const cardId = e.target.closest('[data-card-id]').dataset.cardId || e.target.dataset.cardId;
    if (!cardId) return;
    const col = board.columns.find(c => (c.cards || []).some(card => card.id === cardId));
    if (!col) return;
    const card = col.cards.find(c => c.id === cardId);
    if (!card) return;
    openTaskDetailsModal(card);
  }

  function openTaskDetailsModal(card) {
    const modal = document.getElementById('taskDetailsModal');
    if (!modal) return;
    const titleEl = document.getElementById('detail-title');
    const descEl = document.getElementById('detail-description');
    const urgencyEl = document.getElementById('detail-urgency');
    const deptEl = document.getElementById('detail-department');
    const deadlineEl = document.getElementById('detail-deadline');
    const assigneeEl = document.getElementById('detail-assignee');
    const assignedByEl = document.getElementById('detail-assigned-by');
    if (titleEl) titleEl.textContent = card.title || '—';
    if (descEl) descEl.textContent = card.description || '—';
    if (urgencyEl) {
      const u = card.urgency || 'medium';
      urgencyEl.textContent = u.charAt(0).toUpperCase() + u.slice(1);
    }
    if (deptEl) deptEl.textContent = card.department || '—';
    if (deadlineEl) {
      if (card.deadline) {
        const d = new Date(card.deadline);
        deadlineEl.textContent = d.toLocaleString() + ' (' + formatDeadlineTimer(card.deadline, card.completedAt) + ')';
      } else deadlineEl.textContent = '—';
    }
    const names = getAssigneesList(card);
    if (assigneeEl) {
      assigneeEl.innerHTML = names.length > 0 ? names.map(n => assigneeBlock(n)).join(' ') : '— Unassigned —';
    }
    if (assignedByEl) assignedByEl.textContent = card.assignedByName || '—';
    const bsModal = new bootstrap.Modal(modal);
    bsModal.show();
  }

  function fillDepartmentSelect(selectEl) {
    if (!selectEl) return;
    const current = selectEl.value;
    const depts = getDepartments();
    selectEl.innerHTML =
      '<option value="">— Select department —</option>' +
      depts.map(d => `<option value="${escapeHtml(d)}">${escapeHtml(d)}</option>`).join('');
    if (current && depts.indexOf(current) !== -1) selectEl.value = current;
  }

  function renderAssigneesChips(container, names, onRemove, canRemove) {
    if (!container) return;
    const onlyManagerCanRemove = canRemove === true;
    container.innerHTML = (names || [])
      .map(name => {
        const n = (name || '').trim();
        if (!n) return '';
        const removeBtn = onlyManagerCanRemove
          ? ` <button type="button" class="btn btn-link btn-sm p-0 ms-1 text-danger" data-remove-name="${escapeHtml(n)}" aria-label="Remove">&times;</button>`
          : '';
        return `<span class="assignee-chip" data-name="${escapeHtml(n)}">${escapeHtml(n)}${removeBtn}</span>`;
      })
      .join('');
    container.querySelectorAll('[data-remove-name]').forEach(btn => {
      btn.addEventListener('click', () => {
        if (onRemove) onRemove(btn.dataset.removeName);
      });
    });
  }

  function updateDeadlineDisplay() {
    const input = document.getElementById('cardDeadline');
    const display = document.getElementById('deadline-picker-display');
    if (!display) return;
    const val = input ? input.value.trim() : '';
    if (!val) {
      display.textContent = 'Select date and time';
      return;
    }
    try {
      const d = new Date(val);
      if (isNaN(d.getTime())) {
        display.textContent = 'Select date and time';
        return;
      }
      display.textContent = d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
    } catch (_) {
      display.textContent = 'Select date and time';
    }
  }

  function getAssigneesFromChips() {
    const container = document.getElementById('card-assignees-chips');
    if (!container) return [];
    return [].map
      .call(container.querySelectorAll('.assignee-chip[data-name]'), el => el.dataset.name || '')
      .filter(Boolean);
  }

  function openCardModal(card, columnId) {
    const modal = document.getElementById('cardModal');
    const titleInput = document.getElementById('cardTitle');
    const descInput = document.getElementById('cardDescription');
    const urgencySelect = document.getElementById('cardUrgency');
    const departmentSelect = document.getElementById('cardDepartment');
    const assigneeInput = document.getElementById('cardAssignee');
    const deadlineInput = document.getElementById('cardDeadline');
    const recurringCheckbox = document.getElementById('cardRecurring');
    const recurringGroup = document.getElementById('recurring-task-group');
    const assigneesChips = document.getElementById('card-assignees-chips');
    const departmentGroup = document.getElementById('department-group');
    const assigneeNameGroup = document.getElementById('assignee-name-group');
    const deadlineGroup = document.getElementById('deadline-group');
    const assignedByInfo = document.getElementById('assigned-by-info');
    const assignedByNameEl = document.getElementById('assigned-by-name');
    const form = document.getElementById('cardForm');
    const newDeptWrap = document.getElementById('card-new-dept-wrap');
    if (!modal || !form) return;

    const canEdit = canCreateAndAssign();
    if (departmentGroup) departmentGroup.style.display = canEdit ? 'block' : 'none';
    if (assigneeNameGroup) assigneeNameGroup.style.display = canEdit ? 'block' : 'none';
    if (deadlineGroup) deadlineGroup.style.display = canEdit ? 'block' : 'none';
    if (assignedByInfo) assignedByInfo.style.display = 'none';
    if (newDeptWrap) newDeptWrap.classList.add('d-none');
    if (recurringGroup) recurringGroup.style.display = canEdit && !card ? 'block' : 'none';
    if (recurringCheckbox) recurringCheckbox.checked = false;
    const freqWrap = document.getElementById('recurring-frequency-wrap');
    if (freqWrap) freqWrap.classList.add('d-none');
    const deleteBtn = document.getElementById('card-modal-delete-btn');
    if (deleteBtn) deleteBtn.classList.toggle('d-none', !(canEdit && card));

    fillDepartmentSelect(departmentSelect);

    if (canEdit) loadAndRenderEmployeeLogins();

    const cardAssigneeInput = document.getElementById('cardAssignee');
    if (cardAssigneeInput) {
      cardAssigneeInput.removeAttribute('readonly');
      cardAssigneeInput.removeAttribute('disabled');
    }

    const assigneeNames = card ? getAssigneesList(card) : [];
    const onlyManagerCanRemove = isManager();
    function removeAssignee(name) {
      const list = getAssigneesFromChips().filter(n => n !== name);
      renderAssigneesChips(assigneesChips, list, removeAssignee, onlyManagerCanRemove);
    }
    renderAssigneesChips(assigneesChips, assigneeNames, removeAssignee, onlyManagerCanRemove);

    const linkTypeSelect = document.getElementById('cardLinkType');
    const linkInput = document.getElementById('cardLink');
    if (card) {
      titleInput.value = card.title;
      descInput.value = card.description || '';
      if (urgencySelect) urgencySelect.value = card.urgency || 'medium';
      if (departmentSelect) departmentSelect.value = card.department || '';
      if (assigneeInput) assigneeInput.value = '';
      if (deadlineInput && card.deadline) {
        try {
          const d = new Date(card.deadline);
          deadlineInput.value = d.toISOString().slice(0, 16);
        } catch (_) {
          deadlineInput.value = '';
        }
      } else if (deadlineInput) deadlineInput.value = '';
      updateDeadlineDisplay();
      if (linkTypeSelect) linkTypeSelect.value = card.linkType || '';
      if (linkInput) linkInput.value = card.link || '';
      if (assignedByInfo && assignedByNameEl && card.assignedByName) {
        assignedByNameEl.textContent = card.assignedByName;
        assignedByInfo.style.display = 'block';
      }
      form.dataset.cardId = card.id;
    } else {
      titleInput.value = '';
      descInput.value = '';
      if (urgencySelect) urgencySelect.value = 'medium';
      if (departmentSelect) departmentSelect.value = '';
      if (assigneeInput) assigneeInput.value = '';
      if (deadlineInput) deadlineInput.value = '';
      if (linkTypeSelect) linkTypeSelect.value = '';
      if (linkInput) linkInput.value = '';
      updateDeadlineDisplay();
      delete form.dataset.cardId;
    }
    form.dataset.columnId = columnId;
    form.dataset.isUpcoming = '0';
    const bsModal = new bootstrap.Modal(modal);
    bsModal.show();
  }

  async function saveCardFromModal() {
    if (!isManager()) return;
    const form = document.getElementById('cardForm');
    const titleInput = document.getElementById('cardTitle');
    const descInput = document.getElementById('cardDescription');
    const urgencySelect = document.getElementById('cardUrgency');
    const departmentSelect = document.getElementById('cardDepartment');
    const assigneeInput = document.getElementById('cardAssignee');
    const deadlineInput = document.getElementById('cardDeadline');
    const recurringCheckbox = document.getElementById('cardRecurring');
    if (!form || !titleInput) return;
    const title = titleInput.value.trim();
    if (!title) return;
    const isUpcoming = form.dataset.isUpcoming === '1';
    const predefinedDept = form.dataset.predefinedDept;
    const urgency = urgencySelect ? urgencySelect.value : 'medium';
    let department = departmentSelect ? (departmentSelect.value || '').trim() : '';
    if (predefinedDept) department = predefinedDept;
    const deadlineVal = deadlineInput ? deadlineInput.value : '';
    const deadline = deadlineVal ? new Date(deadlineVal).toISOString() : undefined;
    const linkTypeSelect = document.getElementById('cardLinkType');
    const linkInput = document.getElementById('cardLink');
    const linkType = linkTypeSelect && linkTypeSelect.value ? linkTypeSelect.value.trim() : '';
    const linkUrl = linkInput && linkInput.value ? linkInput.value.trim() : '';
    const currentUser = getCurrentUser();
    const assigneesFromChips = getAssigneesFromChips();
    const newName = assigneeInput ? assigneeInput.value.trim() : '';
    const assigneeNames = newName
      ? assigneesFromChips.indexOf(newName) === -1
        ? assigneesFromChips.concat(newName)
        : assigneesFromChips
      : assigneesFromChips;
    const isRecurring = recurringCheckbox ? recurringCheckbox.checked : false;

    if (isRecurring && assigneeNames.length > 0) {
      if (!board.recurringTasks) board.recurringTasks = [];
      const now = new Date();
      const freqSelect = document.getElementById('cardRecurringFrequency');
      const frequency = (freqSelect?.value || 'daily').toLowerCase();
      const recurringTemplate = {
        id: 'recurring_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
        title,
        description: descInput.value.trim(),
        urgency,
        department: department || undefined,
        assignees: assigneeNames.slice(),
        active: true,
        frequency,
        dayOfWeek: now.getDay(),
        dayOfMonth: now.getDate(),
        createdAt: now.toISOString(),
        createdBy: currentUser ? currentUser.name : 'Manager',
        link: linkUrl || undefined,
        linkType: linkType || undefined
      };
      board.recurringTasks.push(recurringTemplate);
      lastRecurringCheckDate = '';
      const added = generateRecurringTasksForToday();
      bootstrap.Modal.getInstance(document.getElementById('cardModal')).hide();
      await saveBoard();
      render();
      renderManagerTab();
      renderTasksTab();
      renderNotifications();
      updateAccuracyUI();
      return;
    }

    if (isUpcoming) {
      const task = { id: uid(), title, description: descInput.value.trim(), urgency, department, deadline };
      if (!board.upcomingTasks) board.upcomingTasks = [];
      board.upcomingTasks.push(task);
      bootstrap.Modal.getInstance(document.getElementById('cardModal')).hide();
      await saveBoard();
      renderTasksTab();
      return;
    }

    const columnId = form.dataset.columnId;
    const col = board.columns.find(c => c.id === columnId);
    if (!col) return;

    if (form.dataset.cardId) {
      const cardId = form.dataset.cardId;
      const card = col.cards.find(c => c.id === cardId);
      if (card) {
        card.title = title;
        card.description = descInput.value.trim();
        card.urgency = urgency;
        card.department = department || undefined;
        card.deadline = deadline;
        card.link = linkUrl || undefined;
        card.linkType = linkType || undefined;
        card.assignees = assigneeNames.length > 0 ? assigneeNames.slice() : undefined;
        card.assigneeName = assigneeNames[0] || undefined;
        if (assigneeNames.length > 0 && currentUser) {
          card.assignedById = currentUser.id;
          card.assignedByName = currentUser.name;
          card.assignedAt = card.assignedAt || new Date().toISOString();
          addNotification(card.title, assigneeNames.join(', '), currentUser.name);
        } else {
          card.assignedById = card.assignedByName = card.assignedAt = undefined;
        }
        const inUpcoming = (board.upcomingTasks || []).find(t => t.id === cardId);
        if (inUpcoming) {
          inUpcoming.assignees = card.assignees;
          inUpcoming.assigneeName = card.assigneeName;
          inUpcoming.assignedById = card.assignedById;
          inUpcoming.assignedByName = card.assignedByName;
          inUpcoming.assignedAt = card.assignedAt;
          inUpcoming.title = card.title;
          inUpcoming.description = card.description;
          inUpcoming.urgency = card.urgency;
          inUpcoming.department = card.department;
          inUpcoming.deadline = card.deadline;
          inUpcoming.link = card.link;
          inUpcoming.linkType = card.linkType;
        }
      }
    } else {
      const card = {
        id: uid(),
        title,
        description: descInput.value.trim(),
        urgency,
        department: department || undefined,
        deadline,
        link: linkUrl || undefined,
        linkType: linkType || undefined
      };
      card.assignees = assigneeNames.length > 0 ? assigneeNames.slice() : undefined;
      card.assigneeName = assigneeNames[0] || undefined;
      card.assignedAt = new Date().toISOString();
      if (assigneeNames.length > 0 && currentUser) {
        card.assignedById = currentUser.id;
        card.assignedByName = currentUser.name;
        addNotification(card.title, assigneeNames.join(', '), currentUser.name);
      }
      col.cards.push(card);
    }
    bootstrap.Modal.getInstance(document.getElementById('cardModal')).hide();
    await saveBoard();
    render();
    renderManagerTab();
    renderTasksTab();
    renderNotifications();
    updateAccuracyUI();
  }

  function renderTasksTab() {
    const container = document.getElementById('tasks-tab-content');
    const addBtn = document.getElementById('add-upcoming-task');
    const addDeptBtn = document.getElementById('add-dept-tasks-btn');
    if (!container) return;
    const canEdit = canCreateAndAssign();
    if (addBtn) addBtn.style.display = canEdit ? 'inline-flex' : 'none';
    if (addDeptBtn) addDeptBtn.classList.toggle('d-none', !canEdit);

    let tasks = board.upcomingTasks || [];
    if (tasksTabSearchQuery) {
      const q = tasksTabSearchQuery.toLowerCase();
      tasks = tasks.filter(task => {
        const title = (task.title || '').toLowerCase();
        const desc = (task.description || '').toLowerCase();
        const dept = (task.department || '').toLowerCase();
        const assignees = (getAssigneesList(task) || []).join(' ').toLowerCase();
        return title.includes(q) || desc.includes(q) || dept.includes(q) || assignees.includes(q);
      });
    }
    const byDept = {};
    tasks.forEach(task => {
      const dept = (task.department || '').trim() || 'Other';
      if (!byDept[dept]) byDept[dept] = [];
      byDept[dept].push(task);
    });

    const deptOrder = getDepartments().slice();
    Object.keys(byDept).forEach(d => {
      if (d !== 'Other' && deptOrder.indexOf(d) === -1) deptOrder.push(d);
    });
    if (byDept['Other']) deptOrder.push('Other');
    if (deptOrder.length === 0 && tasksTabSearchQuery) {
      container.innerHTML = '<p class="text-muted text-center py-4 mb-0 px-3">No tasks match your search.</p>';
      return;
    }
    if (deptOrder.length === 0 && canEdit) {
      container.innerHTML =
        '<p class="text-muted text-center py-4 mb-0 px-3">No departments yet. Click <strong>Create dept</strong> above to add one, then add tasks.</p>';
      return;
    }
    if (deptOrder.length === 0) {
      container.innerHTML =
        '<p class="text-muted text-center py-4 mb-0 px-3">No tasks yet. Only users with create rights can add and assign tasks.</p>';
      return;
    }

    let html = '';
    deptOrder.forEach(dept => {
      const deptTasks = byDept[dept] || [];
      html += '<div class="tasks-dept-section border-bottom">';
      html += '<div class="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-3">';
      html +=
        '<h6 class="mb-0 d-flex align-items-center"><i class="bx bx-building-house me-2"></i>' +
        escapeHtml(dept) +
        '</h6>';
      if (canEdit) {
        html +=
          '<button type="button" class="btn btn-sm btn-primary add-task-for-dept" data-dept="' +
          escapeHtml(dept) +
          '" title="Add task for ' +
          escapeHtml(dept) +
          '"><i class="bx bx-plus me-1"></i> Add task</button>';
      }
      html += '</div>';
      html +=
        '<div class="table-responsive rounded border"><table class="table table-hover table-align-middle mb-0 tasks-dept-table"><thead><tr><th class="tasks-sno">S.No</th><th>Task</th><th>Description</th><th class="tasks-urgency">Urgency</th><th>Department</th><th>Deadline</th><th>Assigned to</th><th class="tasks-assign-col">Assign to</th></tr></thead><tbody>';
      deptTasks.forEach((task, idx) => {
        const assigneesStr = getAssigneesList(task).join(', ') || '—';
        const deadlineStr = task.deadline ? new Date(task.deadline).toLocaleString() : '—';
        const assignInput = canEdit
          ? `<div class="input-group input-group-sm"><input type="text" class="form-control assign-upcoming-input" data-task-id="${task.id}" data-title="${escapeHtml(task.title).replace(/"/g, '&quot;')}" placeholder="Employee name" /><button type="button" class="btn btn-primary btn-sm assign-upcoming-btn" data-task-id="${task.id}" data-title="${escapeHtml(task.title).replace(/"/g, '&quot;')}">Assign</button></div>`
          : '<span class="text-muted">—</span>';
        html += `<tr data-task-id="${task.id}">
        <td class="tasks-sno">${idx + 1}</td>
        <td class="tasks-title">${escapeHtml(task.title)}</td>
        <td class="tasks-desc">${escapeHtml(task.description || '—')}</td>
        <td class="tasks-urgency"><span class="badge ${task.urgency === 'high' ? 'bg-danger' : task.urgency === 'low' ? 'bg-success' : 'bg-warning'}">${escapeHtml(task.urgency || 'medium')}</span></td>
        <td class="tasks-dept">${escapeHtml(task.department || '—')}</td>
        <td class="tasks-deadline small">${escapeHtml(deadlineStr)}</td>
        <td class="tasks-assignees">${escapeHtml(assigneesStr)}</td>
        <td class="tasks-assign-col">${assignInput}</td>
      </tr>`;
      });
      if (deptTasks.length === 0) {
        html +=
          '<tr><td colspan="8" class="text-muted text-center py-4">No tasks in this department. Click <strong>Add task</strong> above to add one.</td></tr>';
      }
      html += '</tbody></table></div></div>';
    });

    const activeAssignInput =
      document.activeElement &&
      document.activeElement.classList &&
      document.activeElement.classList.contains('assign-upcoming-input')
        ? document.activeElement
        : null;
    const savedTaskId = activeAssignInput ? (activeAssignInput.dataset && activeAssignInput.dataset.taskId) || '' : '';
    const savedValue = activeAssignInput ? activeAssignInput.value || '' : '';

    container.innerHTML = html;

    if (canEdit) {
      loadAndRenderEmployeeLogins();
      container.querySelectorAll('.assign-upcoming-btn').forEach(btn => {
        btn.addEventListener('click', e => {
          const input = e.target.closest('tr').querySelector('.assign-upcoming-input');
          if (input) onAssignUpcoming(input);
        });
      });
      container.querySelectorAll('.add-task-for-dept').forEach(btn => {
        btn.addEventListener('click', e => {
          const dept = e.currentTarget.dataset.dept;
          openUpcomingTaskModal(dept);
        });
      });

      const upcomingDropdown = document.getElementById('upcoming-assignee-dropdown');
      if (upcomingDropdown) {
        const UPCOMING_DROPDOWN_MAX_H = 200;
        function showUpcomingSuggestions(inputEl, query) {
          if (!inputEl) return;
          const q = (query || '').trim().toLowerCase();
          const allEmployees = getAllEmployeeNames();
          const matches =
            q.length === 0
              ? allEmployees
              : allEmployees.filter(name => name.toLowerCase().startsWith(q)).sort((a, b) => a.localeCompare(b));
          if (matches.length > 0) {
            const rect = inputEl.getBoundingClientRect();
            const spaceBelow =
              typeof window !== 'undefined' && window.innerHeight ? window.innerHeight - rect.bottom : 250;
            const showAbove = spaceBelow < UPCOMING_DROPDOWN_MAX_H + 8;
            upcomingDropdown.style.left = rect.left + 'px';
            upcomingDropdown.style.width = Math.max(rect.width, 180) + 'px';
            upcomingDropdown.style.minWidth = '180px';
            if (showAbove) {
              upcomingDropdown.style.top = rect.top - UPCOMING_DROPDOWN_MAX_H - 4 + 'px';
              upcomingDropdown.style.maxHeight = Math.min(rect.top - 8, UPCOMING_DROPDOWN_MAX_H) + 'px';
            } else {
              upcomingDropdown.style.top = rect.bottom + 2 + 'px';
              upcomingDropdown.style.maxHeight = UPCOMING_DROPDOWN_MAX_H + 'px';
            }
            upcomingDropdown.innerHTML = matches
              .map(
                name =>
                  `<div class="dropdown-item upcoming-assignee-option" role="option" data-name="${escapeHtml(name)}" tabindex="-1">${escapeHtml(name)}</div>`
              )
              .join('');
            upcomingDropdown.style.display = 'block';
            upcomingDropdown.classList.add('show');
            upcomingDropdown.querySelectorAll('.upcoming-assignee-option').forEach(opt => {
              opt.addEventListener('mousedown', ev => {
                ev.preventDefault();
                ev.stopPropagation();
                const selectedName = opt.dataset.name;
                if (selectedName && inputEl) {
                  inputEl.value = selectedName;
                  upcomingDropdown.style.display = 'none';
                  upcomingDropdown.classList.remove('show');
                  upcomingDropdown.innerHTML = '';
                }
              });
            });
            setTimeout(() => inputEl.focus(), 0);
          } else {
            upcomingDropdown.style.display = 'none';
            upcomingDropdown.classList.remove('show');
            upcomingDropdown.innerHTML = '';
          }
        }
        container.querySelectorAll('.assign-upcoming-input').forEach(input => {
          input.removeAttribute('readonly');
          input.removeAttribute('disabled');
          input.setAttribute('autocomplete', 'off');
          input.addEventListener('focus', () => showUpcomingSuggestions(input, input.value || ''));
          input.addEventListener('input', e => {
            showUpcomingSuggestions(input, e.target.value || '');
            setTimeout(() => input.focus(), 0);
          });
          input.addEventListener('blur', () => {
            setTimeout(() => {
              upcomingDropdown.style.display = 'none';
              upcomingDropdown.classList.remove('show');
              upcomingDropdown.innerHTML = '';
            }, 220);
          });
        });

        if (savedTaskId) {
          const restored = [].find.call(
            container.querySelectorAll('.assign-upcoming-input'),
            el => (el.dataset && el.dataset.taskId) === savedTaskId
          );
          if (restored) {
            restored.value = savedValue;
            restored.focus();
          }
        }
      }
    }
  }

  function onAssignUpcoming(inputEl) {
    if (!inputEl || typeof inputEl.dataset === 'undefined') return;
    const taskId = inputEl.dataset.taskId;
    const taskTitle = inputEl.dataset.title || 'Task';
    const assigneeName = (inputEl.value || '').trim();
    if (!assigneeName) return;

    const task = (board.upcomingTasks || []).find(t => t.id === taskId);
    if (!task) return;
    const currentUser = getCurrentUser();
    task.assigneeName = assigneeName;
    task.assignees = [assigneeName];
    task.assignedById = currentUser ? currentUser.id : '';
    task.assignedByName = currentUser ? currentUser.name : 'Manager';
    task.assignedAt = task.assignedAt || new Date().toISOString();

    let cardOnBoard = null;
    for (const col of board.columns || []) {
      cardOnBoard = (col.cards || []).find(c => c.id === task.id);
      if (cardOnBoard) break;
    }
    if (cardOnBoard) {
      cardOnBoard.assignees = task.assignees;
      cardOnBoard.assigneeName = task.assigneeName;
      cardOnBoard.assignedById = task.assignedById;
      cardOnBoard.assignedByName = task.assignedByName;
      cardOnBoard.assignedAt = task.assignedAt;
    }
    const todoCol = (board.columns || []).find(c => (c.id || '').toString().toLowerCase() === 'todo');
    if (!cardOnBoard && todoCol) {
      todoCol.cards = todoCol.cards || [];
      todoCol.cards.push(task);
    }

    addNotification(taskTitle, assigneeName, task.assignedByName);
    saveBoard();
    render();
    renderTasksTab();
    renderNotifications();
    inputEl.value = '';
  }

  function renderNotifications() {
    // Notifications removed from application
  }

  /** Accuracy visible to both manager and employee (backend also enforces visibility). */
  function updateAccuracyUI() {
    const widget = document.getElementById('accuracy-widget');
    const circleFill = document.getElementById('accuracy-circle-fill');
    const circleText = document.getElementById('accuracy-circle-text');
    const badge = document.getElementById('accuracy-badge');
    const u = getCurrentUser();
    if (!widget) return;
    widget.classList.remove('d-none');
    if (!u) {
      if (circleFill) circleFill.setAttribute('stroke-dasharray', '0 100');
      if (circleText) circleText.textContent = '—';
      if (badge) badge.textContent = 'accuracy';
      return;
    }
    const stats = computeEmployeeStats();
    if (u.role === 'manager') {
      const names = Object.keys(stats || {});
      const totalAssigned = names.reduce((s, k) => s + (stats[k].assigned || 0), 0);
      const totalCompleted = names.reduce((s, k) => s + (stats[k].completed || 0), 0);
      const pct = totalAssigned > 0 ? Math.round((totalCompleted / totalAssigned) * 100) : 0;
      if (circleFill) circleFill.setAttribute('stroke-dasharray', pct + ' 100');
      if (circleText) circleText.textContent = pct + '%';
      if (badge) badge.textContent = 'team accuracy';
      return;
    }
    const myName = (u.name || '').trim();
    const myKey = Object.keys(stats || {}).find(k => (k || '').trim().toLowerCase() === myName.toLowerCase());
    const my = myKey ? stats[myKey] : null;
    if (!stats || Object.keys(stats).length === 0) {
      if (circleFill) circleFill.setAttribute('stroke-dasharray', '0 100');
      if (circleText) circleText.textContent = '0%';
      if (badge) badge.textContent = 'accuracy';
      return;
    }
    const assigned = my ? my.assigned : 0;
    const completed = my ? my.completed : 0;
    const pct = assigned > 0 ? Math.round((completed / assigned) * 100) : 0;
    if (circleFill) circleFill.setAttribute('stroke-dasharray', pct + ' 100');
    if (circleText) circleText.textContent = pct + '%';
    if (badge) badge.textContent = 'accuracy';
  }

  function updateRoleUI() {
    const label = document.getElementById('current-role-label');
    const u = getCurrentUser();
    let roleText = '';
    if (u) {
      roleText = u.role === 'manager' ? 'Manager' : u.name || 'Employee';
    }
    if (label) label.textContent = roleText;
    const addBtn = document.getElementById('add-upcoming-task');
    if (addBtn) addBtn.style.display = canCreateAndAssign() ? 'inline-flex' : 'none';
    const storedDataMenuItem = document.getElementById('menu-item-stored-data');
    if (storedDataMenuItem) storedDataMenuItem.classList.toggle('d-none', !isManager());
    const managerMenuItem = document.getElementById('menu-item-manager');
    if (managerMenuItem) managerMenuItem.classList.toggle('d-none', !isManager());
    const tasksMenuItem = document.querySelector('.menu-item[data-tab="tasks"]');
    if (tasksMenuItem) tasksMenuItem.classList.toggle('d-none', !(isManager() || canCreateAndAssign()));
    const btnChangePw = document.getElementById('btn-change-password');
    if (btnChangePw) btnChangePw.classList.toggle('d-none', !isManager());
    updateAccuracyUI();
  }

  function switchTab(tabId) {
    if (tabId === 'stored-data' || tabId === 'manager') {
      if (!isManager()) tabId = 'kanban';
    } else if (tabId === 'tasks') {
      if (!isManager() && !canCreateAndAssign()) tabId = 'kanban';
    }
    document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.menu-item').forEach(m => m.classList.remove('active'));
    const pane = document.getElementById(tabId + '-view');
    const menuItem = document.querySelector('.menu-item[data-tab="' + tabId + '"]');
    if (pane) pane.classList.add('active');
    if (menuItem) menuItem.classList.add('active');
    const title = document.getElementById('page-title');
    if (title) {
      if (tabId === 'tasks') title.textContent = 'Tasks (Upcoming)';
      else if (tabId === 'stored-data') title.textContent = 'Stored data';
      else if (tabId === 'manager') title.textContent = 'Manager';
      else title.textContent = 'Kanban Board';
    }
    if (tabId === 'stored-data') renderStoredDataView();
    if (tabId === 'manager') renderManagerTab();
    if (tabId === 'tasks') renderTasksTab();
  }

  function renderStoredDataView() {
    const container = document.getElementById('stored-data-tables');
    if (!container) return;
    if (!isManager()) {
      container.innerHTML = '<p class="text-muted">Stored data is visible only to managers.</p>';
      return;
    }
    const cols = board.columns || [];
    const allCards = [];
    cols.forEach(col => (col.cards || []).forEach(card => allCards.push(card)));
    const upcoming = board.upcomingTasks || [];

    let html = '';

    html += '<h6 class="mb-2">Tasks on board</h6>';
    html +=
      '<div class="mb-2"><input type="text" class="form-control form-control-sm stored-search" id="stored-search-tasks" placeholder="Search task, name, status..." style="max-width: 280px;" /></div>';
    html +=
      '<div class="table-responsive mb-4"><table class="table table-bordered table-sm stored-table" id="stored-tasks-table"><thead><tr><th>S.No</th><th>ID</th><th>Date</th><th>Title</th><th>Description</th><th>Status</th><th>Urgency</th><th>Department</th><th>Deadline</th><th>Assigned to</th><th>Assigned by</th><th>Completed at</th><th>Link</th><th>Link type</th><th>Recurring</th></tr></thead><tbody>';
    allCards.forEach((card, idx) => {
      const dateStr = card.assignedAt ? new Date(card.assignedAt).toLocaleString() : '—';
      const deadlineStr = card.deadline ? new Date(card.deadline).toLocaleString() : '—';
      const completedStr = card.completedAt ? new Date(card.completedAt).toLocaleString() : '—';
      const assigneesStr = getAssigneesList(card).join(', ') || '—';
      const status = isCardDone(card) ? 'Completed' : 'Pending';
      html +=
        '<tr data-search="' +
        escapeHtml(
          (card.title || '') + ' ' + (card.description || '') + ' ' + assigneesStr + ' ' + status
        ).toLowerCase() +
        '">';
      html += '<td>' + (idx + 1) + '</td>';
      html += '<td>' + escapeHtml(card.id || '—') + '</td>';
      html += '<td>' + dateStr + '</td>';
      html += '<td>' + escapeHtml(card.title || '—') + '</td>';
      html +=
        '<td>' +
        escapeHtml((card.description || '—').slice(0, 80)) +
        (card.description && card.description.length > 80 ? '…' : '') +
        '</td>';
      html +=
        '<td><span class="badge ' +
        (status === 'Completed' ? 'bg-success' : 'bg-warning') +
        '">' +
        escapeHtml(status) +
        '</span></td>';
      html += '<td>' + escapeHtml(card.urgency || 'medium') + '</td>';
      html += '<td>' + escapeHtml(card.department || '—') + '</td>';
      html += '<td>' + deadlineStr + '</td>';
      html += '<td>' + escapeHtml(assigneesStr) + '</td>';
      html += '<td>' + escapeHtml(card.assignedByName || '—') + '</td>';
      html += '<td>' + completedStr + '</td>';
      html += '<td>' + escapeHtml(card.link || '—') + '</td>';
      html += '<td>' + escapeHtml(card.linkType || '—') + '</td>';
      html += '<td>' + (card.recurringTemplateId ? 'Yes' : '—') + '</td>';
      html += '</tr>';
    });
    if (allCards.length === 0) html += '<tr><td colspan="15" class="text-muted text-center">No tasks</td></tr>';
    html += '</tbody></table></div>';

    html += '<h6 class="mb-2">Upcoming tasks (not yet assigned)</h6>';
    html +=
      '<div class="mb-2"><input type="text" class="form-control form-control-sm stored-search" id="stored-search-upcoming" placeholder="Search task..." style="max-width: 280px;" /></div>';
    html +=
      '<div class="table-responsive mb-4"><table class="table table-bordered table-sm stored-table" id="stored-upcoming-table"><thead><tr><th>S.No</th><th>Title</th><th>Description</th><th>Urgency</th></tr></thead><tbody>';
    upcoming.forEach((t, idx) => {
      html +=
        '<tr data-search="' +
        escapeHtml((t.title || '') + ' ' + (t.description || '')).toLowerCase() +
        '"><td>' +
        (idx + 1) +
        '</td><td>' +
        escapeHtml(t.title) +
        '</td><td>' +
        escapeHtml((t.description || '').slice(0, 60)) +
        '</td><td>' +
        escapeHtml(t.urgency || 'medium') +
        '</td></tr>';
    });
    if (upcoming.length === 0) html += '<tr><td colspan="4" class="text-muted text-center">No upcoming tasks</td></tr>';
    html += '</tbody></table></div>';

    container.innerHTML = html;

    function filterTable(inputId, tableId) {
      const input = document.getElementById(inputId);
      const table = document.getElementById(tableId);
      if (!input || !table) return;
      input.addEventListener('input', () => {
        const q = (input.value || '').trim().toLowerCase();
        table.querySelectorAll('tbody tr').forEach(tr => {
          const search = tr.dataset.search;
          if (search === undefined) return;
          tr.style.display = !q || search.indexOf(q) !== -1 ? '' : 'none';
        });
      });
    }
    filterTable('stored-search-tasks', 'stored-tasks-table');
    filterTable('stored-search-upcoming', 'stored-upcoming-table');
  }

  function openUpcomingTaskModal(predefinedDept) {
    const modal = document.getElementById('cardModal');
    const titleInput = document.getElementById('cardTitle');
    const descInput = document.getElementById('cardDescription');
    const urgencySelect = document.getElementById('cardUrgency');
    const departmentSelect = document.getElementById('cardDepartment');
    const departmentGroup = document.getElementById('department-group');
    const assigneeGroup = document.getElementById('assignee-group');
    const assigneeNameGroup = document.getElementById('assignee-name-group');
    const deadlineGroup = document.getElementById('deadline-group');
    const deadlineInput = document.getElementById('cardDeadline');
    const assigneesChips = document.getElementById('card-assignees-chips');
    const assignedByInfo = document.getElementById('assigned-by-info');
    const recurringCheckbox = document.getElementById('cardRecurring');
    const recurringGroup = document.getElementById('recurring-task-group');
    const form = document.getElementById('cardForm');
    if (!form) return;
    const canEdit = canCreateAndAssign();
    titleInput.value = '';
    descInput.value = '';
    if (urgencySelect) urgencySelect.value = 'medium';
    fillDepartmentSelect(departmentSelect);
    if (departmentSelect) {
      if (predefinedDept) {
        departmentSelect.value = predefinedDept;
        if (departmentGroup) departmentGroup.style.display = 'none';
      } else {
        departmentSelect.value = '';
        if (departmentGroup) departmentGroup.style.display = 'block';
      }
    }
    if (assigneeGroup) assigneeGroup.style.display = 'block';
    if (assigneeNameGroup) assigneeNameGroup.style.display = canEdit ? 'block' : 'none';
    if (deadlineGroup) deadlineGroup.style.display = 'block';
    if (deadlineInput) deadlineInput.value = '';
    const linkTypeEl = document.getElementById('cardLinkType');
    const linkUrlEl = document.getElementById('cardLink');
    if (linkTypeEl) linkTypeEl.value = '';
    if (linkUrlEl) linkUrlEl.value = '';
    if (assigneesChips) renderAssigneesChips(assigneesChips, [], () => {}, isManager());
    if (assignedByInfo) assignedByInfo.style.display = 'none';
    if (recurringGroup) recurringGroup.style.display = canEdit ? 'block' : 'none';
    if (recurringCheckbox) recurringCheckbox.checked = false;
    const freqWrap = document.getElementById('recurring-frequency-wrap');
    if (freqWrap) freqWrap.classList.add('d-none');
    delete form.dataset.cardId;
    form.dataset.columnId = 'todo';
    form.dataset.isUpcoming = '1';
    if (predefinedDept) form.dataset.predefinedDept = predefinedDept;
    else delete form.dataset.predefinedDept;
    const bsModal = new bootstrap.Modal(modal);
    bsModal.show();
  }

  function showLoginPage() {
    const loginEl = document.getElementById('login-page');
    const appEl = document.getElementById('app-page');
    if (loginEl) loginEl.style.display = 'flex';
    if (appEl) {
      appEl.style.display = 'none';
      appEl.classList.remove('logged-in');
    }
    stopSync();
  }

  function showAppPage() {
    const loginEl = document.getElementById('login-page');
    const appEl = document.getElementById('app-page');
    if (loginEl) loginEl.style.display = 'none';
    if (appEl) {
      appEl.style.display = 'block';
      appEl.classList.add('logged-in');
    }
    startSync();
    startAutoRefresh();
  }

  let syncEventSource = null;
  let syncReconnectTimeout = null;
  const SYNC_RECONNECT_DELAY_MS = 3000;
  const SYNC_RECONNECT_MAX_DELAY_MS = 30000;

  function startSync() {
    const base = API_BASE || window.location.origin || '';
    if (!base || base === 'file://') return;
    if (syncEventSource) return;
    try {
      const url = base + '/api/sync/events';
      syncEventSource = new EventSource(url);
      syncEventSource.onopen = () => {
        if (syncReconnectTimeout) {
          clearTimeout(syncReconnectTimeout);
          syncReconnectTimeout = null;
        }
      };
      syncEventSource.onmessage = event => {
        const data = event && event.data ? String(event.data).trim() : '';
        if (data === 'board-updated') {
          loadBoard().then(() => {
            const cardModal = document.getElementById('cardModal');
            if (cardModal && cardModal.classList.contains('show')) {
              fillDepartmentSelect(document.getElementById('cardDepartment'));
            }
          });
        } else if (data === 'employees-updated') {
          if (typeof loadAndRenderEmployeeLogins === 'function') loadAndRenderEmployeeLogins();
        }
      };
      syncEventSource.onerror = () => {
        if (syncEventSource) {
          syncEventSource.close();
          syncEventSource = null;
        }
        if (!getCurrentUser()) return;
        if (syncReconnectTimeout) return;
        syncReconnectTimeout = setTimeout(() => {
          syncReconnectTimeout = null;
          startSync();
        }, SYNC_RECONNECT_DELAY_MS);
      };
    } catch (e) {
      syncEventSource = null;
      if (getCurrentUser() && !syncReconnectTimeout) {
        syncReconnectTimeout = setTimeout(() => {
          syncReconnectTimeout = null;
          startSync();
        }, SYNC_RECONNECT_DELAY_MS);
      }
    }
  }

  function stopSync() {
    if (syncReconnectTimeout) {
      clearTimeout(syncReconnectTimeout);
      syncReconnectTimeout = null;
    }
    if (syncEventSource) {
      syncEventSource.close();
      syncEventSource = null;
    }
  }

  let autoRefreshInterval = null;

  function startAutoRefresh() {
    if (autoRefreshInterval) return;
    autoRefreshInterval = setInterval(async () => {
      const currentUser = getCurrentUser();
      if (!currentUser) return;
      try {
        const todayKey = getTodayDateKey();
        if (lastRecurringCheckDate !== todayKey) {
          lastRecurringCheckDate = '';
        }
        const oldBoardStr = JSON.stringify(board);
        await loadBoard();
        const newBoardStr = JSON.stringify(board);
        if (oldBoardStr !== newBoardStr) {
          render();
          renderTasksTab();
          renderManagerTab();
          renderStoredDataView();
          updateAccuracyUI();
        }
      } catch (e) {
        console.error('Auto-refresh error:', e);
      }
    }, 5000);
  }

  function stopAutoRefresh() {
    if (autoRefreshInterval) {
      clearInterval(autoRefreshInterval);
      autoRefreshInterval = null;
    }
  }

  function init() {
    const form = document.getElementById('cardForm');
    if (form)
      form.addEventListener('submit', e => {
        e.preventDefault();
        saveCardFromModal();
      });

    document.getElementById('card-modal-delete-btn')?.addEventListener('click', () => {
      const formEl = document.getElementById('cardForm');
      const cardId = formEl?.dataset?.cardId;
      if (!cardId || !confirm('Delete this task?')) return;
      const col = board.columns.find(c => (c.cards || []).some(card => card.id === cardId));
      if (col) {
        col.cards = col.cards.filter(c => c.id !== cardId);
        if (board.upcomingTasks) board.upcomingTasks = board.upcomingTasks.filter(t => t.id !== cardId);
        saveBoard();
        render();
        renderManagerTab();
        renderTasksTab();
        renderNotifications();
        renderStoredDataView();
        updateAccuracyUI();
        bootstrap.Modal.getInstance(document.getElementById('cardModal')).hide();
      }
    });

    document.getElementById('cardRecurring')?.addEventListener('change', e => {
      const wrap = document.getElementById('recurring-frequency-wrap');
      if (wrap) wrap.classList.toggle('d-none', !e.target.checked);
    });

    (function initDeadlinePicker() {
      const trigger = document.getElementById('deadline-picker-trigger');
      const modalEl = document.getElementById('deadlinePickerModal');
      const calGrid = document.getElementById('deadline-cal-grid');
      const calMonthEl = document.getElementById('deadline-cal-month');
      const calPrev = document.getElementById('deadline-cal-prev');
      const calNext = document.getElementById('deadline-cal-next');
      const timeInputEl = document.getElementById('deadline-time-input');
      const okBtn = document.getElementById('deadline-picker-ok');
      const deadlineInput = document.getElementById('cardDeadline');

      let pickerDate = ''; // YYYY-MM-DD
      let pickerCalMonth = new Date();
      pickerCalMonth.setDate(1);
      let pickerHour = 9;
      let pickerMinute = 0;

      function pad2(n) {
        return String(n).padStart(2, '0');
      }

      function openPicker() {
        const val = deadlineInput ? deadlineInput.value.trim() : '';
        const today = new Date();
        const todayKey = today.getFullYear() + '-' + pad2(today.getMonth() + 1) + '-' + pad2(today.getDate());
        if (val) {
          try {
            const d = new Date(val);
            if (!isNaN(d.getTime())) {
              pickerDate = d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
              pickerHour = d.getHours();
              pickerMinute = d.getMinutes();
              pickerCalMonth = new Date(d.getFullYear(), d.getMonth(), 1);
            } else {
              pickerDate = todayKey;
              pickerHour = 9;
              pickerMinute = 0;
              pickerCalMonth = new Date(today.getFullYear(), today.getMonth(), 1);
            }
          } catch (_) {
            pickerDate = todayKey;
            pickerHour = 9;
            pickerMinute = 0;
            pickerCalMonth = new Date(today.getFullYear(), today.getMonth(), 1);
          }
        } else {
          pickerDate = todayKey;
          pickerHour = 9;
          pickerMinute = 0;
          pickerCalMonth = new Date(today.getFullYear(), today.getMonth(), 1);
        }
        if (timeInputEl) timeInputEl.value = pad2(pickerHour) + ':' + pad2(pickerMinute);
        renderDeadlineCal();
        if (modalEl) new bootstrap.Modal(modalEl).show();
      }

      function renderDeadlineCal() {
        if (!calGrid || !calMonthEl) return;
        const y = pickerCalMonth.getFullYear();
        const m = pickerCalMonth.getMonth();
        calMonthEl.textContent = new Date(y, m, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
        const first = new Date(y, m, 1);
        const last = new Date(y, m + 1, 0);
        const startPad = (first.getDay() + 7) % 7;
        const daysInMonth = last.getDate();
        const today = new Date();
        const todayKey = today.getFullYear() + '-' + pad2(today.getMonth() + 1) + '-' + pad2(today.getDate());
        let html = '';
        for (let i = 0; i < startPad; i++) {
          const d = new Date(y, m, 1 - (startPad - i));
          const dateKey = d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
          const isToday = dateKey === todayKey;
          const selected = dateKey === pickerDate;
          html +=
            '<div class="deadline-cal-day other-month' +
            (isToday ? ' today' : '') +
            (selected ? ' selected' : '') +
            '" data-date="' +
            dateKey +
            '">' +
            d.getDate() +
            '</div>';
        }
        for (let d = 1; d <= daysInMonth; d++) {
          const dateKey = y + '-' + pad2(m + 1) + '-' + pad2(d);
          const isToday = dateKey === todayKey;
          const selected = dateKey === pickerDate;
          html +=
            '<div class="deadline-cal-day' +
            (isToday ? ' today' : '') +
            (selected ? ' selected' : '') +
            '" data-date="' +
            dateKey +
            '">' +
            d +
            '</div>';
        }
        const totalCells = startPad + daysInMonth;
        const totalRows = 6;
        const totalSlots = totalRows * 7;
        for (let i = totalCells; i < totalSlots; i++) {
          const d = new Date(y, m, daysInMonth + (i - totalCells + 1));
          const dateKey = d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
          html += '<div class="deadline-cal-day other-month" data-date="' + dateKey + '">' + d.getDate() + '</div>';
        }
        calGrid.innerHTML = html;
        calGrid.querySelectorAll('.deadline-cal-day').forEach(cell => {
          cell.addEventListener('click', () => {
            pickerDate = cell.dataset.date || pickerDate;
            renderDeadlineCal();
          });
        });
      }

      if (trigger) {
        trigger.addEventListener('click', openPicker);
        trigger.addEventListener('keydown', e => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            openPicker();
          }
        });
      }
      if (calPrev)
        calPrev.addEventListener('click', () => {
          pickerCalMonth.setMonth(pickerCalMonth.getMonth() - 1);
          renderDeadlineCal();
        });
      if (calNext)
        calNext.addEventListener('click', () => {
          pickerCalMonth.setMonth(pickerCalMonth.getMonth() + 1);
          renderDeadlineCal();
        });
      if (okBtn && deadlineInput) {
        okBtn.addEventListener('click', () => {
          let h = pickerHour;
          let m = pickerMinute;
          if (timeInputEl && timeInputEl.value) {
            const parts = timeInputEl.value.trim().split(':');
            if (parts.length >= 2) {
              const parsedH = parseInt(parts[0], 10);
              const parsedM = parseInt(parts[1], 10);
              if (!isNaN(parsedH) && parsedH >= 0 && parsedH <= 23) h = parsedH;
              if (!isNaN(parsedM) && parsedM >= 0 && parsedM <= 59) m = parsedM;
            }
          }
          deadlineInput.value = pickerDate + 'T' + pad2(h) + ':' + pad2(m);
          updateDeadlineDisplay();
          if (modalEl) bootstrap.Modal.getInstance(modalEl).hide();
        });
      }
    })();

    const employeeModal = document.getElementById('employeeDetailsModal');
    if (employeeModal) employeeModal.addEventListener('hidden.bs.modal', onEmployeeModalHidden);

    document.querySelectorAll('.tab-link').forEach(a => {
      a.addEventListener('click', e => {
        e.preventDefault();
        const tab = e.currentTarget.closest('.menu-item').dataset.tab;
        if (tab) switchTab(tab);
      });
    });

    const addUpcoming = document.getElementById('add-upcoming-task');
    if (addUpcoming)
      addUpcoming.addEventListener('click', () => {
        if (canCreateAndAssign()) openUpcomingTaskModal();
      });
    const addDeptTasksBtn = document.getElementById('add-dept-tasks-btn');
    const tasksCreateDeptWrap = document.getElementById('tasks-create-dept-wrap');
    const tasksNewDeptName = document.getElementById('tasks-new-dept-name');
    const tasksNewDeptSave = document.getElementById('tasks-new-dept-save');
    const tasksNewDeptCancel = document.getElementById('tasks-new-dept-cancel');
    if (addDeptTasksBtn) {
      addDeptTasksBtn.addEventListener('click', () => {
        if (!canCreateAndAssign()) return;
        if (tasksCreateDeptWrap) tasksCreateDeptWrap.classList.remove('d-none');
        if (tasksNewDeptName) {
          tasksNewDeptName.value = '';
          tasksNewDeptName.focus();
        }
      });
    }
    if (tasksNewDeptCancel) {
      tasksNewDeptCancel.addEventListener('click', () => {
        if (tasksCreateDeptWrap) tasksCreateDeptWrap.classList.add('d-none');
        if (tasksNewDeptName) tasksNewDeptName.value = '';
      });
    }
    if (tasksNewDeptSave) {
      tasksNewDeptSave.addEventListener('click', () => {
        const name = (tasksNewDeptName?.value || '').trim();
        if (!name) return;
        if (!board.departments) board.departments = defaultDepartments.slice();
        if (board.departments.indexOf(name) === -1) board.departments.push(name);
        saveBoard();
        renderManagerTab();
        renderTasksTab();
        fillDepartmentSelect(document.getElementById('cardDepartment'));
        if (tasksCreateDeptWrap) tasksCreateDeptWrap.classList.add('d-none');
        if (tasksNewDeptName) tasksNewDeptName.value = '';
      });
    }

    const refreshStored = document.getElementById('refresh-stored-data');
    if (refreshStored)
      refreshStored.addEventListener('click', () => {
        loadBoard().then(() => renderStoredDataView());
      });

    document.getElementById('employee-edit-profile-btn')?.addEventListener('click', () => {
      const nameEl = document.getElementById('employee-modal-name');
      const name = (nameEl?.textContent || '').trim();
      if (!name) return;
      openEmployeeProfileModal(name);
    });

    document.getElementById('navbar-edit-profile-btn')?.addEventListener('click', () => {
      const u = getCurrentUser();
      if (!u || !u.name) return;
      openEmployeeProfileModal(u.name.trim());
    });

    const profileForm = document.getElementById('employeeProfileForm');
    if (profileForm) {
      profileForm.addEventListener('submit', e => {
        e.preventDefault();
        saveEmployeeProfile();
      });
    }
    const profilePicInput = document.getElementById('profile-pic-input');
    if (profilePicInput && profileForm) {
      profilePicInput.addEventListener('change', e => {
        const file = e.target.files?.[0];
        if (file && file.type.startsWith('image/')) {
          const reader = new FileReader();
          reader.onload = ev => {
            const preview = document.getElementById('profile-pic-preview');
            const placeholder = document.getElementById('profile-pic-placeholder');
            if (preview) {
              preview.src = ev.target.result;
              preview.classList.remove('d-none');
            }
            if (placeholder) placeholder.classList.add('d-none');
            profileForm.dataset.profilePicData = ev.target.result;
          };
          reader.readAsDataURL(file);
        }
      });
    }

    document.getElementById('export-stored-data')?.addEventListener('click', e => {
      e.preventDefault();
      loadBoard().then(() => exportStoredDataToExcel());
    });
    document.getElementById('export-day')?.addEventListener('click', e => {
      e.preventDefault();
      loadBoard().then(() => exportTaskDataToExcel('day'));
    });
    document.getElementById('export-week')?.addEventListener('click', e => {
      e.preventDefault();
      loadBoard().then(() => exportTaskDataToExcel('week'));
    });
    document.getElementById('export-month')?.addEventListener('click', e => {
      e.preventDefault();
      loadBoard().then(() => exportTaskDataToExcel('month'));
    });
    document.getElementById('export-overall')?.addEventListener('click', e => {
      e.preventDefault();
      loadBoard().then(() => exportTaskDataToExcel('overall'));
    });
    const openCalBtn = document.getElementById('open-kanban-calendar-btn');
    if (openCalBtn) {
      openCalBtn.addEventListener('click', () => {
        renderKanbanCalendar();
        const calModal = document.getElementById('kanbanCalendarModal');
        if (calModal) new bootstrap.Modal(calModal).show();
      });
    }

    const globalSearchInput =
      document.getElementById('global-search-input') || document.getElementById('kanban-search-input');
    const globalSearchClear =
      document.getElementById('global-search-clear') || document.getElementById('kanban-search-clear');
    if (globalSearchInput) {
      globalSearchInput.addEventListener('input', e => {
        searchQuery = e.target.value.trim();
        render();
      });
    }
    if (globalSearchClear) {
      globalSearchClear.addEventListener('click', () => {
        searchQuery = '';
        if (globalSearchInput) globalSearchInput.value = '';
        render();
      });
    }

    const tasksTabSearch = document.getElementById('tasks-tab-search');
    if (tasksTabSearch) {
      tasksTabSearch.addEventListener('input', e => {
        tasksTabSearchQuery = e.target.value.trim();
        renderTasksTab();
      });
    }

    const assigneeInput = document.getElementById('cardAssignee');
    const assigneeDropdown = document.getElementById('assignee-dropdown');
    if (assigneeInput && assigneeDropdown) {
      assigneeInput.removeAttribute('readonly');
      assigneeInput.removeAttribute('disabled');
      assigneeInput.setAttribute('autocomplete', 'off');

      const ASSIGNEE_DROPDOWN_MAX_H = 200;
      function showAssigneeSuggestions(query) {
        const q = (query || '').trim().toLowerCase();
        const allEmployees = getAllEmployeeNames();
        const matches =
          q.length === 0
            ? allEmployees
            : allEmployees.filter(name => name.toLowerCase().startsWith(q)).sort((a, b) => a.localeCompare(b));
        if (matches.length > 0) {
          const rect = assigneeInput.getBoundingClientRect();
          const spaceBelow =
            typeof window !== 'undefined' && window.innerHeight ? window.innerHeight - rect.bottom : 250;
          const showAbove = spaceBelow < ASSIGNEE_DROPDOWN_MAX_H + 8;
          assigneeDropdown.classList.toggle('assignee-dropdown-above', showAbove);
          assigneeDropdown.innerHTML = matches
            .map(
              name =>
                `<div class="dropdown-item assignee-option" role="option" data-name="${escapeHtml(name)}" tabindex="-1">${escapeHtml(name)}</div>`
            )
            .join('');
          assigneeDropdown.classList.add('show');
          assigneeDropdown.style.display = 'block';
          assigneeDropdown.querySelectorAll('.assignee-option').forEach(opt => {
            opt.addEventListener('mousedown', ev => {
              ev.preventDefault();
              ev.stopPropagation();
              const selectedName = opt.dataset.name;
              if (selectedName) {
                assigneeInput.value = selectedName;
                assigneeDropdown.classList.remove('show');
                assigneeDropdown.innerHTML = '';
                document.getElementById('card-add-assignee-btn')?.click();
              }
            });
          });
          setTimeout(() => assigneeInput.focus(), 0);
        } else {
          assigneeDropdown.classList.remove('show');
          assigneeDropdown.innerHTML = '';
        }
      }

      assigneeInput.addEventListener('focus', () => {
        showAssigneeSuggestions(assigneeInput.value || '');
      });
      assigneeInput.addEventListener('input', e => {
        const query = (e.target.value || '').trim();
        if (query.length === 0) {
          showAssigneeSuggestions('');
          setTimeout(() => assigneeInput.focus(), 0);
          return;
        }
        showAssigneeSuggestions(query);
        setTimeout(() => assigneeInput.focus(), 0);
      });
      assigneeInput.addEventListener('blur', () => {
        setTimeout(() => {
          assigneeDropdown.classList.remove('show');
          assigneeDropdown.innerHTML = '';
        }, 220);
      });
    }

    document.getElementById('kanban-calendar-prev')?.addEventListener('click', () => {
      kanbanCalendarMonth.setMonth(kanbanCalendarMonth.getMonth() - 1);
      renderKanbanCalendar();
    });
    document.getElementById('kanban-calendar-next')?.addEventListener('click', () => {
      kanbanCalendarMonth.setMonth(kanbanCalendarMonth.getMonth() + 1);
      renderKanbanCalendar();
    });

    const addColumnWrap = document.getElementById('add-column-form-wrap');
    const newColumnTitle = document.getElementById('new-column-title');
    document.getElementById('add-column-btn')?.addEventListener('click', () => {
      if (addColumnWrap) addColumnWrap.classList.remove('d-none');
      if (newColumnTitle) {
        newColumnTitle.value = '';
        newColumnTitle.focus();
      }
    });
    document.getElementById('add-column-cancel')?.addEventListener('click', () => {
      if (addColumnWrap) addColumnWrap.classList.add('d-none');
      if (newColumnTitle) newColumnTitle.value = '';
    });
    document.getElementById('add-column-save')?.addEventListener('click', () => {
      const title = (newColumnTitle?.value || '').trim();
      if (!title) return;
      if (!board.columns) board.columns = [];
      const id = 'col_' + Date.now();
      board.columns.push({ id, title, cards: [] });
      saveBoard();
      render();
      renderManagerTab();
      if (addColumnWrap) addColumnWrap.classList.add('d-none');
      if (newColumnTitle) newColumnTitle.value = '';
    });

    const addDeptWrap = document.getElementById('add-dept-form-wrap');
    const newDeptName = document.getElementById('new-dept-name');
    document.getElementById('add-dept-btn')?.addEventListener('click', () => {
      if (addDeptWrap) addDeptWrap.classList.remove('d-none');
      if (newDeptName) {
        newDeptName.value = '';
        newDeptName.focus();
      }
    });
    document.getElementById('add-dept-cancel')?.addEventListener('click', () => {
      if (addDeptWrap) addDeptWrap.classList.add('d-none');
      if (newDeptName) newDeptName.value = '';
    });
    document.getElementById('add-dept-save')?.addEventListener('click', () => {
      const name = (newDeptName?.value || '').trim();
      if (!name) return;
      if (!board.departments) board.departments = defaultDepartments.slice();
      if (board.departments.indexOf(name) === -1) board.departments.push(name);
      saveBoard();
      renderManagerTab();
      renderTasksTab();
      fillDepartmentSelect(document.getElementById('cardDepartment'));
      if (addDeptWrap) addDeptWrap.classList.add('d-none');
      if (newDeptName) newDeptName.value = '';
    });

    document.getElementById('card-create-dept-btn')?.addEventListener('click', () => {
      const wrap = document.getElementById('card-new-dept-wrap');
      const input = document.getElementById('card-new-dept-name');
      if (wrap) wrap.classList.remove('d-none');
      if (input) {
        input.value = '';
        input.focus();
      }
    });
    document.getElementById('card-new-dept-add')?.addEventListener('click', () => {
      const input = document.getElementById('card-new-dept-name');
      const name = (input?.value || '').trim();
      if (!name) return;
      if (!board.departments) board.departments = defaultDepartments.slice();
      if (board.departments.indexOf(name) === -1) board.departments.push(name);
      saveBoard();
      const sel = document.getElementById('cardDepartment');
      fillDepartmentSelect(sel);
      if (sel) sel.value = name;
      const wrap = document.getElementById('card-new-dept-wrap');
      if (wrap) wrap.classList.add('d-none');
      if (input) input.value = '';
    });

    document.getElementById('card-add-assignee-btn')?.addEventListener('click', () => {
      const input = document.getElementById('cardAssignee');
      const name = (input?.value || '').trim();
      if (!name) return;
      const container = document.getElementById('card-assignees-chips');
      const current = getAssigneesFromChips();
      if (current.indexOf(name) !== -1) return;
      const onlyManagerCanRemove = isManager();
      function removeAssignee(n) {
        const list = getAssigneesFromChips().filter(x => x !== n);
        renderAssigneesChips(container, list, removeAssignee, onlyManagerCanRemove);
      }
      renderAssigneesChips(container, current.concat(name), removeAssignee, onlyManagerCanRemove);
      if (input) input.value = '';
    });

    const btnLogout = document.getElementById('btn-logout');
    if (btnLogout)
      btnLogout.addEventListener('click', () => {
        stopAutoRefresh();
        localStorage.removeItem('kanban-current-user');
        showLoginPage();
      });
    const accuracyWidget = document.getElementById('accuracy-widget');
    if (accuracyWidget) {
      accuracyWidget.addEventListener('click', () => {
        const u = getCurrentUser();
        if (!u) return;
        if (u.role === 'manager') {
          openTeamAccuracyModal();
        } else {
          const name = (u.name || '').trim();
          if (name) openEmployeeModal(name);
        }
      });
    }

    const loginForm = document.getElementById('login-form');
    if (loginForm) {
      loginForm.addEventListener('submit', e => {
        e.preventDefault();
        const email = (document.getElementById('login-email')?.value || '').trim();
        const password = document.getElementById('login-password')?.value || '';
        const roleEl = document.querySelector('input[name="login-role"]:checked');
        const role = roleEl?.value || 'dean';
        if (!email || !password) {
          alert('Please enter email and password.');
          return;
        }
        if (role === 'employee') {
          const url = (API_BASE || window.location.origin || '') + '/api/auth/employee/login';
          fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
          })
            .then(async res => {
              let data = {};
              try {
                const text = await res.text();
                if (text) data = JSON.parse(text);
              } catch (_) {}
              if (res.ok && data.user) {
                setCurrentUser(data.user);
                showAppPage();
                loadBoard();
                updateRoleUI();
              } else {
                alert(data.error || (res.status === 401 ? 'Invalid email or password' : 'Login failed'));
              }
              document.getElementById('login-email').value = '';
              document.getElementById('login-password').value = '';
            })
            .catch(() => {
              alert('Login failed. Check your connection and that the API is available.');
              document.getElementById('login-email').value = '';
              document.getElementById('login-password').value = '';
            });
          return;
        }
        const managerUrl = (API_BASE || window.location.origin || '') + '/api/auth/manager/login';
        const employeeUrl = (API_BASE || window.location.origin || '') + '/api/auth/employee/login';
        fetch(managerUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password })
        })
          .then(async res => {
            let data = {};
            try {
              const text = await res.text();
              if (text) data = JSON.parse(text);
            } catch (_) {}
            if (res.ok && data.user) {
              setCurrentUser(data.user);
              showAppPage();
              loadBoard();
              updateRoleUI();
              document.getElementById('login-email').value = '';
              document.getElementById('login-password').value = '';
              return;
            }
            return fetch(employeeUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ email, password })
            });
          })
          .then(async res => {
            if (res === undefined) return;
            if (!res.ok) {
              if (res.status === 401) {
                alert(
                  'Invalid email or password. If you are an employee without task assignment rights, please select "Employee" and log in from the Employee page.'
                );
              } else {
                let data = {};
                try {
                  const text = await res.text();
                  if (text) data = JSON.parse(text);
                } catch (_) {}
                alert(data.error || 'Login failed.');
              }
              document.getElementById('login-email').value = '';
              document.getElementById('login-password').value = '';
              return;
            }
            let data = {};
            try {
              const text = await res.text();
              if (text) data = JSON.parse(text);
            } catch (_) {}
            if (!data.user) {
              document.getElementById('login-email').value = '';
              document.getElementById('login-password').value = '';
              return;
            }
            if (data.user.canCreateAndAssign) {
              setCurrentUser(data.user);
              showAppPage();
              loadBoard();
              updateRoleUI();
            } else {
              alert(
                'You do not have task assignment rights. Please select "Employee" and log in from the Employee page.'
              );
            }
            document.getElementById('login-email').value = '';
            document.getElementById('login-password').value = '';
          })
          .catch(() => {
            alert('Login failed. Check your connection and that the API is available.');
            document.getElementById('login-email').value = '';
            document.getElementById('login-password').value = '';
          });
      });
    }

    const createEmployeeLoginForm = document.getElementById('create-employee-login-form');
    if (createEmployeeLoginForm) {
      createEmployeeLoginForm.addEventListener('submit', e => {
        e.preventDefault();
        const email = (document.getElementById('emp-login-email')?.value || '').trim();
        const password = document.getElementById('emp-login-password')?.value || '';
        const name = (document.getElementById('emp-login-name')?.value || '').trim();
        const canCreateAndAssign = !!document.getElementById('emp-login-can-create-assign')?.checked;
        if (!email) {
          alert('Employee email is required.');
          return;
        }
        if (!password || password.length < 6) {
          alert('Password must be at least 6 characters.');
          return;
        }
        fetch(API_BASE + '/api/auth/manager/create-employee-login', {
          method: 'POST',
          headers: apiHeaders(),
          body: JSON.stringify({ email, password, name, canCreateAndAssign })
        })
          .then(async res => {
            let data = {};
            try {
              const text = await res.text();
              if (text) data = JSON.parse(text);
            } catch (_) {}
            if (res.ok && data.ok) {
              document.getElementById('emp-login-email').value = '';
              document.getElementById('emp-login-password').value = '';
              document.getElementById('emp-login-name').value = '';
              document.getElementById('emp-login-can-create-assign').checked = false;
              loadAndRenderEmployeeLogins();
              alert('Employee login created. Share the email and password with the employee.');
            } else {
              const msg =
                data.error ||
                (res.status === 404
                  ? 'Create-employee API not found. If deployed on Vercel, ensure api/auth/manager/create-employee-login.js is deployed.'
                  : 'Failed to create employee login.');
              alert(msg);
            }
          })
          .catch(() => alert('Failed to create employee login. Check your connection and that the API is deployed.'));
      });
    }

    const editEmployeeLoginForm = document.getElementById('edit-employee-login-form');
    const editEmployeeLoginModal = document.getElementById('edit-employee-login-modal');
    if (editEmployeeLoginForm && editEmployeeLoginModal) {
      editEmployeeLoginForm.addEventListener('submit', e => {
        e.preventDefault();
        const id = (document.getElementById('edit-emp-id')?.value || '').trim();
        const email = (document.getElementById('edit-emp-email')?.value || '').trim();
        const name = (document.getElementById('edit-emp-name')?.value || '').trim();
        const password = (document.getElementById('edit-emp-password')?.value || '').trim();
        const canCreateAndAssign = !!document.getElementById('edit-emp-can-create-assign')?.checked;
        if (!id) {
          alert('Employee id is missing.');
          return;
        }
        if (!email) {
          alert('Employee email is required.');
          return;
        }
        const body = { id, email, name, canCreateAndAssign };
        if (password.length >= 6) body.password = password;
        fetch(API_BASE + '/api/auth/manager/update-employee-login', {
          method: 'PUT',
          headers: apiHeaders(),
          body: JSON.stringify(body)
        })
          .then(async res => {
            let data = {};
            try {
              const text = await res.text();
              if (text) data = JSON.parse(text);
            } catch (_) {}
            if (res.ok && data.ok) {
              if (typeof bootstrap !== 'undefined' && bootstrap.Modal.getInstance(editEmployeeLoginModal)) {
                bootstrap.Modal.getInstance(editEmployeeLoginModal).hide();
              }
              editEmployeeLoginForm.reset();
              document.getElementById('edit-emp-password').value = '';
              loadAndRenderEmployeeLogins();
              alert('Employee login updated.');
            } else {
              alert(
                data.error ||
                  (res.status === 403
                    ? 'Only managers can update employee logins.'
                    : 'Failed to update employee login.')
              );
            }
          })
          .catch(() => alert('Failed to update employee login. Check your connection and that the API is available.'));
      });
    }

    const changePasswordForm = document.getElementById('change-password-form');
    const changePasswordModal = document.getElementById('changePasswordModal');
    if (changePasswordForm && changePasswordModal) {
      changePasswordForm.addEventListener('submit', e => {
        e.preventDefault();
        const u = getCurrentUser();
        if (!u || u.role !== 'manager' || !u.email) return;
        const currentPassword = document.getElementById('cp-current')?.value;
        const newPassword = document.getElementById('cp-new')?.value;
        const confirmPassword = document.getElementById('cp-confirm')?.value;
        if (newPassword !== confirmPassword) {
          alert('New password and confirm do not match.');
          return;
        }
        if (newPassword.length < 6) {
          alert('New password must be at least 6 characters.');
          return;
        }
        fetch(API_BASE + '/api/auth/manager/change-password', {
          method: 'POST',
          headers: apiHeaders(),
          body: JSON.stringify({
            email: u.email,
            currentPassword,
            newPassword
          })
        })
          .then(async res => {
            let data = {};
            try {
              const text = await res.text();
              if (text) data = JSON.parse(text);
            } catch (_) {}
            if (res.ok && data.ok) {
              bootstrap.Modal.getInstance(changePasswordModal).hide();
              changePasswordForm.reset();
              document.getElementById('cp-email').value = u.email || '';
              alert('Password changed successfully.');
            } else {
              alert(
                data.error ||
                  (res.status === 401
                    ? 'Current password is incorrect.'
                    : 'Failed to change password. Is the server running?')
              );
            }
          })
          .catch(() => alert('Failed to change password. Is the server running?'));
      });
    }

    document.getElementById('btn-change-password')?.addEventListener('click', () => {
      const u = getCurrentUser();
      if (!u || u.role !== 'manager') return;
      document.getElementById('cp-email').value = u.email || '';
      document.getElementById('cp-current').value = '';
      document.getElementById('cp-new').value = '';
      document.getElementById('cp-confirm').value = '';
      const modal = new bootstrap.Modal(document.getElementById('changePasswordModal'));
      modal.show();
    });

    try {
      showLoginPage();
      const user = getCurrentUser();
      if (user && user.id && user.role) {
        showAppPage();
        loadBoard();
        updateRoleUI();
      }
    } catch (err) {
      showLoginPage();
      console.error('Kanban init error:', err);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
