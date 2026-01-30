'use strict';

(function () {
  const API_BASE = (typeof window !== 'undefined' && (window.location.protocol === 'http:' || window.location.protocol === 'https:')) ? window.location.origin : '';

  const defaultUsers = [
    { id: 'm1', name: 'Sarah', role: 'manager' },
    { id: 'e1', name: 'Alice', role: 'employee' },
    { id: 'e2', name: 'Bob', role: 'employee' },
    { id: 'e3', name: 'Charlie', role: 'employee' }
  ];

  const defaultBoard = {
    columns: [
      { id: 'todo', title: 'To Do', cards: [{ id: 'c1', title: 'Sample task', description: 'Add your description', urgency: 'medium' }] },
      { id: 'progress', title: 'In Progress', cards: [{ id: 'c2', title: 'In progress task', description: '', urgency: 'high' }] },
      { id: 'done', title: 'Done', cards: [{ id: 'c3', title: 'Completed task', description: '', urgency: 'low' }] }
    ],
    upcomingTasks: [],
    notifications: [],
    users: []
  };

  let board = { columns: [], upcomingTasks: [], notifications: [], users: [] };
  let draggedCard = null;
  let draggedFromColumn = null;

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

  function getEmployees() {
    return (board.users || []).filter((u) => u.role === 'employee');
  }

  function uid() {
    return 'id_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9);
  }

  let serverReachable = false;

  function addNotification(taskTitle, assigneeName, assignedByName) {
    if (!board.notifications) board.notifications = [];
    const msg = assignedByName + ' assigned "' + (taskTitle || '') + '" to ' + assigneeName;
    board.notifications.unshift({
      id: uid(),
      message: msg,
      taskTitle,
      assigneeName,
      assignedByName,
      at: new Date().toISOString()
    });
    const maxNotifs = 50;
    if (board.notifications.length > maxNotifs) board.notifications = board.notifications.slice(0, maxNotifs);
  }

  function escapeHtml(s) {
    if (!s) return '';
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }

  async function loadBoard() {
    try {
      const res = await fetch(API_BASE + '/api/board');
      const data = await res.json();
      serverReachable = true;
      hideConnectionBanner();
      if (data && (data.columns || data.upcomingTasks)) {
        board = data;
        if (!Array.isArray(board.columns)) board.columns = [];
        if (!Array.isArray(board.upcomingTasks)) board.upcomingTasks = [];
        if (!Array.isArray(board.notifications)) board.notifications = [];
        if (!Array.isArray(board.users)) board.users = [];
        board.columns.forEach((col) => {
          (col.cards || []).forEach((card) => {
            if (!card.urgency) card.urgency = 'medium';
          });
        });
      } else {
        board = JSON.parse(JSON.stringify(defaultBoard));
      }
    } catch (e) {
      serverReachable = false;
      const stored = localStorage.getItem('kanban-board');
      if (stored) {
        try {
          board = JSON.parse(stored);
          if (!Array.isArray(board.upcomingTasks)) board.upcomingTasks = [];
          if (!Array.isArray(board.notifications)) board.notifications = [];
          if (!Array.isArray(board.users)) board.users = [];
          board.columns.forEach((col) => {
            (col.cards || []).forEach((card) => {
              if (!card.urgency) card.urgency = 'medium';
            });
          });
        } catch (_) {
          board = JSON.parse(JSON.stringify(defaultBoard));
        }
      } else {
        board = JSON.parse(JSON.stringify(defaultBoard));
      }
      showConnectionBanner();
    }
    render();
    renderTasksTab();
    renderNotifications();
    updateRoleUI();
  }

  function showConnectionBanner() {
    let el = document.getElementById('connection-banner');
    if (el) return;
    el = document.createElement('div');
    el.id = 'connection-banner';
    el.className = 'alert alert-warning alert-dismissible fade show mb-0 rounded-0';
    el.setAttribute('role', 'alert');
    el.innerHTML = '<strong>Server not running.</strong> Data is saved in this browser only. <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>';
    document.body.insertBefore(el, document.body.firstChild);
  }

  function hideConnectionBanner() {
    const el = document.getElementById('connection-banner');
    if (el) el.remove();
  }

  async function saveBoard() {
    try {
      await fetch(API_BASE + '/api/board', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(board)
      });
      serverReachable = true;
      hideConnectionBanner();
    } catch (e) {
      localStorage.setItem('kanban-board', JSON.stringify(board));
      if (!document.getElementById('connection-banner')) showConnectionBanner();
    }
  }

  function assigneeBlock(name) {
    if (!name || !name.trim()) return '';
    const initial = name.trim().charAt(0).toUpperCase();
    return `<span class="assignee-with-name"><span class="assignee-initial" title="Assigned to">${escapeHtml(initial)}</span><span class="assignee-name">${escapeHtml(name.trim())}</span></span>`;
  }

  function render() {
    const container = document.getElementById('kanban-board');
    if (!container) return;
    const manager = isManager();
    container.innerHTML = board.columns
      .map(
        (col) => `
      <div class="kanban-column" data-column-id="${col.id}" data-column-index="${board.columns.indexOf(col)}">
        <div class="kanban-column-header">
          <h6 class="mb-0">${escapeHtml(col.title)}</h6>
          <span class="badge bg-label-primary">${(col.cards || []).length}</span>
        </div>
        <div class="kanban-column-cards" data-column-id="${col.id}">
          ${(col.cards || [])
            .map(
              (card) => {
                const isDone = col.id === 'done';
                const urgency = card.urgency || 'medium';
                const urgencyClass = isDone ? '' : (urgency === 'high' ? 'kanban-urgency-high' : urgency === 'low' ? 'kanban-urgency-low' : 'kanban-urgency-medium');
                const doneClass = isDone ? 'kanban-card-done' : '';
                const assigneeHtml = card.assigneeName ? assigneeBlock(card.assigneeName) : '';
                const actions = manager
                  ? `<div class="dropdown">
                    <button class="btn btn-sm btn-icon btn-text-secondary rounded-pill dropdown-toggle hide-arrow" data-bs-toggle="dropdown"><i class="bx bx-dots-vertical-rounded"></i></button>
                    <ul class="dropdown-menu dropdown-menu-end">
                      <li><a class="dropdown-item edit-card" href="#" data-card-id="${card.id}">Edit</a></li>
                      <li><a class="dropdown-item delete-card" href="#" data-card-id="${card.id}">Delete</a></li>
                    </ul>
                  </div>`
                  : `<div class="dropdown">
                    <button class="btn btn-sm btn-icon btn-text-secondary rounded-pill dropdown-toggle hide-arrow" data-bs-toggle="dropdown" title="View task"><i class="bx bx-dots-vertical-rounded"></i></button>
                    <ul class="dropdown-menu dropdown-menu-end">
                      <li><a class="dropdown-item view-card-details" href="#" data-card-id="${card.id}">View details</a></li>
                    </ul>
                  </div>`;
                const completedBadge = isDone ? '<span class="task-completed-badge"><i class="bx bx-like"></i> Completed</span>' : '';
                return `
            <div class="card kanban-card ${urgencyClass} ${doneClass}" draggable="true" data-card-id="${card.id}" data-column-id="${col.id}" title="Drag to move between columns">
              <div class="card-body py-3 d-flex gap-2">
                <div class="kanban-drag-handle"><i class="bx bx-dots-vertical-rounded"></i></div>
                <div class="flex-grow-1 min-w-0">
                <div class="d-flex justify-content-between align-items-start gap-2">
                  <div class="d-flex align-items-center gap-2 flex-grow-1 min-w-0">
                    ${assigneeHtml}
                    <h6 class="card-title mb-0 text-truncate">${escapeHtml(card.title)}</h6>
                  </div>
                  ${actions}
                </div>
                ${card.description ? `<p class="card-text small text-body-secondary mb-0 mt-1">${escapeHtml(card.description)}</p>` : ''}
                ${completedBadge}
                </div>
              </div>
            </div>
          `;
              }
            )
            .join('')}
        </div>
        ${manager ? `<button type="button" class="btn btn-sm btn-outline-primary w-100 mt-2 add-card" data-column-id="${col.id}">+ Add card</button>` : ''}
      </div>
    `
      )
      .join('');

    container.querySelectorAll('.kanban-card').forEach((el) => {
      el.addEventListener('dragstart', onDragStart);
      el.addEventListener('dragend', onDragEnd);
      el.addEventListener('dragover', onColumnDragOver);
      el.addEventListener('drop', onColumnDrop);
      el.addEventListener('dragleave', onColumnDragLeave);
    });
    container.querySelectorAll('.kanban-column-cards').forEach((el) => {
      el.addEventListener('dragover', onColumnDragOver);
      el.addEventListener('drop', onColumnDrop);
      el.addEventListener('dragleave', onColumnDragLeave);
    });
    if (manager) {
      container.querySelectorAll('.add-card').forEach((btn) => btn.addEventListener('click', onAddCard));
    }
    container.querySelectorAll('.edit-card').forEach((a) => a.addEventListener('click', onEditCard));
    container.querySelectorAll('.delete-card').forEach((a) => a.addEventListener('click', onDeleteCard));
    container.querySelectorAll('.view-card-details').forEach((a) => a.addEventListener('click', onViewCardDetails));
  }

  function onDragStart(e) {
    if (e.target.closest('button, [data-bs-toggle="dropdown"], .dropdown-menu')) {
      e.preventDefault();
      return;
    }
    draggedCard = e.currentTarget;
    const columnEl = draggedCard.closest('.kanban-column-cards');
    if (!columnEl) return;
    draggedFromColumn = columnEl.dataset.columnId;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', draggedCard.dataset.cardId || '');
    e.dataTransfer.dropEffect = 'move';
    draggedCard.classList.add('kanban-dragging');
  }

  function onDragEnd() {
    const card = draggedCard;
    draggedCard = null;
    draggedFromColumn = null;
    if (card) card.classList.remove('kanban-dragging');
    document.querySelectorAll('.kanban-column-cards').forEach((el) => el.classList.remove('kanban-drag-over'));
  }

  function getDropColumnEl(el) {
    return el.classList && el.classList.contains('kanban-column-cards') ? el : (el.closest && el.closest('.kanban-column-cards'));
  }

  function onColumnDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const colEl = getDropColumnEl(e.currentTarget);
    if (colEl) colEl.classList.add('kanban-drag-over');
  }

  function onColumnDragLeave(e) {
    const colEl = getDropColumnEl(e.currentTarget);
    if (colEl && !colEl.contains(e.relatedTarget)) colEl.classList.remove('kanban-drag-over');
  }

  function onColumnDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    const colEl = getDropColumnEl(e.currentTarget);
    if (colEl) colEl.classList.remove('kanban-drag-over');
    const toColumnId = colEl ? colEl.dataset.columnId : null;
    const cardId = e.dataTransfer.getData('text/plain');
    if (!cardId || !draggedFromColumn || !toColumnId) return;

    const fromCol = board.columns.find((c) => c.id === draggedFromColumn);
    const toCol = board.columns.find((c) => c.id === toColumnId);
    if (!fromCol || !toCol || fromCol.id === toCol.id) return;

    if (!fromCol.cards) fromCol.cards = [];
    if (!toCol.cards) toCol.cards = [];
    const cardIndex = fromCol.cards.findIndex((c) => c.id === cardId);
    if (cardIndex === -1) return;
    const [card] = fromCol.cards.splice(cardIndex, 1);
    toCol.cards.push(card);
    saveBoard();
    render();
  }

  function onAddCard(e) {
    if (!isManager()) return;
    const columnId = e.currentTarget.dataset.columnId;
    openCardModal(null, columnId);
  }

  function onEditCard(e) {
    e.preventDefault();
    if (!isManager()) return;
    const cardId = e.target.closest('[data-card-id]').dataset.cardId;
    const col = board.columns.find((c) => (c.cards || []).some((card) => card.id === cardId));
    if (col) openCardModal(col.cards.find((c) => c.id === cardId), col.id);
  }

  function onDeleteCard(e) {
    e.preventDefault();
    if (!isManager()) return;
    const cardId = e.target.closest('[data-card-id]').dataset.cardId;
    const col = board.columns.find((c) => (c.cards || []).some((card) => card.id === cardId));
    if (col && confirm('Delete this card?')) {
      col.cards = col.cards.filter((c) => c.id !== cardId);
      saveBoard();
      render();
    }
  }

  function onViewCardDetails(e) {
    e.preventDefault();
    const cardId = e.target.closest('[data-card-id]').dataset.cardId || e.target.dataset.cardId;
    if (!cardId) return;
    const col = board.columns.find((c) => (c.cards || []).some((card) => card.id === cardId));
    if (!col) return;
    const card = col.cards.find((c) => c.id === cardId);
    if (!card) return;
    openTaskDetailsModal(card);
  }

  function openTaskDetailsModal(card) {
    const modal = document.getElementById('taskDetailsModal');
    if (!modal) return;
    const titleEl = document.getElementById('detail-title');
    const descEl = document.getElementById('detail-description');
    const urgencyEl = document.getElementById('detail-urgency');
    const assigneeEl = document.getElementById('detail-assignee');
    const assignedByEl = document.getElementById('detail-assigned-by');
    if (titleEl) titleEl.textContent = card.title || '—';
    if (descEl) descEl.textContent = card.description || '—';
    if (urgencyEl) {
      const u = (card.urgency || 'medium');
      urgencyEl.textContent = u.charAt(0).toUpperCase() + u.slice(1);
    }
    if (assigneeEl) {
      assigneeEl.innerHTML = card.assigneeName ? assigneeBlock(card.assigneeName) : '— Unassigned —';
    }
    if (assignedByEl) assignedByEl.textContent = card.assignedByName || '—';
    const bsModal = new bootstrap.Modal(modal);
    bsModal.show();
  }

  function openCardModal(card, columnId) {
    const modal = document.getElementById('cardModal');
    const titleInput = document.getElementById('cardTitle');
    const descInput = document.getElementById('cardDescription');
    const urgencySelect = document.getElementById('cardUrgency');
    const assigneeInput = document.getElementById('cardAssignee');
    const assigneeGroup = document.getElementById('assignee-group');
    const assignedByInfo = document.getElementById('assigned-by-info');
    const assignedByNameEl = document.getElementById('assigned-by-name');
    const form = document.getElementById('cardForm');
    if (!modal || !form) return;

    const manager = isManager();
    if (assigneeGroup) assigneeGroup.style.display = manager ? 'block' : 'none';
    if (assignedByInfo) assignedByInfo.style.display = 'none';

    if (card) {
      titleInput.value = card.title;
      descInput.value = card.description || '';
      if (urgencySelect) urgencySelect.value = card.urgency || 'medium';
      if (assigneeInput) assigneeInput.value = card.assigneeName || '';
      if (assignedByInfo && assignedByNameEl && card.assignedByName) {
        assignedByNameEl.textContent = card.assignedByName;
        assignedByInfo.style.display = 'block';
      }
      form.dataset.cardId = card.id;
    } else {
      titleInput.value = '';
      descInput.value = '';
      if (urgencySelect) urgencySelect.value = 'medium';
      if (assigneeInput) assigneeInput.value = '';
      delete form.dataset.cardId;
    }
    form.dataset.columnId = columnId;
    form.dataset.isUpcoming = '0';
    const bsModal = new bootstrap.Modal(modal);
    bsModal.show();
  }

  function saveCardFromModal() {
    const form = document.getElementById('cardForm');
    const titleInput = document.getElementById('cardTitle');
    const descInput = document.getElementById('cardDescription');
    const urgencySelect = document.getElementById('cardUrgency');
    const assigneeInput = document.getElementById('cardAssignee');
    if (!form || !titleInput) return;
    const title = titleInput.value.trim();
    if (!title) return;
    const isUpcoming = form.dataset.isUpcoming === '1';
    const urgency = urgencySelect ? urgencySelect.value : 'medium';
    const currentUser = getCurrentUser();
    const assigneeName = assigneeInput ? assigneeInput.value.trim() : '';

    if (isUpcoming) {
      const task = { id: uid(), title, description: descInput.value.trim(), urgency };
      if (!board.upcomingTasks) board.upcomingTasks = [];
      board.upcomingTasks.push(task);
      bootstrap.Modal.getInstance(document.getElementById('cardModal')).hide();
      saveBoard();
      renderTasksTab();
      return;
    }

    const columnId = form.dataset.columnId;
    const col = board.columns.find((c) => c.id === columnId);
    if (!col) return;

    if (form.dataset.cardId) {
      const card = col.cards.find((c) => c.id === form.dataset.cardId);
      if (card) {
        const prevAssignee = card.assigneeName;
        card.title = title;
        card.description = descInput.value.trim();
        card.urgency = urgency;
        if (assigneeName && currentUser) {
          card.assigneeName = assigneeName;
          card.assignedById = currentUser.id;
          card.assignedByName = currentUser.name;
          card.assignedAt = new Date().toISOString();
          if (prevAssignee !== assigneeName) addNotification(card.title, assigneeName, currentUser.name);
        } else {
          card.assigneeId = card.assigneeName = card.assignedById = card.assignedByName = card.assignedAt = undefined;
        }
      }
    } else {
      const card = { id: uid(), title, description: descInput.value.trim(), urgency };
      if (assigneeName && currentUser) {
        card.assigneeName = assigneeName;
        card.assignedById = currentUser.id;
        card.assignedByName = currentUser.name;
        card.assignedAt = new Date().toISOString();
        addNotification(card.title, assigneeName, currentUser.name);
      }
      col.cards.push(card);
    }
    bootstrap.Modal.getInstance(document.getElementById('cardModal')).hide();
    saveBoard();
    render();
    renderNotifications();
  }

  function renderTasksTab() {
    const tbody = document.getElementById('upcoming-tasks-tbody');
    const addBtn = document.getElementById('add-upcoming-task');
    if (!tbody) return;
    const manager = isManager();
    if (addBtn) addBtn.style.display = manager ? 'inline-flex' : 'none';

    const tasks = board.upcomingTasks || [];
    if (tasks.length === 0) {
      tbody.innerHTML = '<tr><td colspan="3" class="text-muted text-center py-4">No upcoming tasks. Only the manager can add and assign tasks.</td></tr>';
      return;
    }

    tbody.innerHTML = tasks
      .map(
        (task) => `
      <tr data-task-id="${task.id}">
        <td>
          <strong>${escapeHtml(task.title)}</strong>
          ${task.description ? `<br><span class="text-muted small">${escapeHtml(task.description)}</span>` : ''}
        </td>
        <td><span class="badge ${task.urgency === 'high' ? 'bg-danger' : task.urgency === 'low' ? 'bg-success' : 'bg-warning'}">${escapeHtml(task.urgency || 'medium')}</span></td>
        <td class="task-row-assign">
          ${manager ? `<div class="input-group input-group-sm"><input type="text" class="form-control assign-upcoming-input" data-task-id="${task.id}" data-title="${escapeHtml(task.title).replace(/"/g, '&quot;')}" placeholder="Employee name" /><button type="button" class="btn btn-primary btn-sm assign-upcoming-btn" data-task-id="${task.id}" data-title="${escapeHtml(task.title).replace(/"/g, '&quot;')}">Assign</button></div>` : '<span class="text-muted">—</span>'}
        </td>
      </tr>
    `
      )
      .join('');

    if (manager) {
      tbody.querySelectorAll('.assign-upcoming-btn').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          const input = e.target.closest('tr').querySelector('.assign-upcoming-input');
          if (input) onAssignUpcoming(input);
        });
      });
    }
  }

  function onAssignUpcoming(inputEl) {
    if (!inputEl || typeof inputEl.dataset === 'undefined') return;
    const taskId = inputEl.dataset.taskId;
    const taskTitle = inputEl.dataset.title || 'Task';
    const assigneeName = (inputEl.value || '').trim();
    if (!assigneeName) return;

    const taskIndex = (board.upcomingTasks || []).findIndex((t) => t.id === taskId);
    if (taskIndex === -1) return;
    const [task] = board.upcomingTasks.splice(taskIndex, 1);
    const currentUser = getCurrentUser();
    task.assigneeName = assigneeName;
    task.assignedById = currentUser ? currentUser.id : '';
    task.assignedByName = currentUser ? currentUser.name : 'Manager';
    task.assignedAt = new Date().toISOString();

    const todoCol = board.columns.find((c) => c.id === 'todo');
    if (todoCol) todoCol.cards = todoCol.cards || [];
    todoCol.cards.push(task);

    addNotification(taskTitle, assigneeName, task.assignedByName);
    saveBoard();
    render();
    renderTasksTab();
    renderNotifications();
    inputEl.value = '';
  }

  function renderNotifications() {
    const placeholder = document.getElementById('notifications-placeholder');
    const list = document.getElementById('notifications-list');
    const badge = document.getElementById('notif-badge');
    if (!list) return;

    const notifs = (board.notifications || []).slice(0, 20);
    const items = list.querySelectorAll('li:not(.dropdown-header):not(.dropdown-divider)');
    items.forEach((el) => {
      if (el.id !== 'notifications-placeholder') el.remove();
    });

    if (placeholder) placeholder.style.display = notifs.length ? 'none' : '';

    notifs.forEach((n) => {
      const li = document.createElement('li');
      li.className = 'notification-item';
      const span = document.createElement('span');
      span.className = 'text-body';
      span.textContent = n.message || '';
      li.appendChild(span);
      if (placeholder && placeholder.parentNode) list.insertBefore(li, placeholder);
      else list.appendChild(li);
    });

    if (badge) {
      if (notifs.length > 0) {
        badge.textContent = notifs.length > 9 ? '9+' : notifs.length;
        badge.classList.remove('d-none');
      } else {
        badge.classList.add('d-none');
      }
    }
  }

  function updateRoleUI() {
    const label = document.getElementById('current-role-label');
    const u = getCurrentUser();
    if (label) label.textContent = u ? (u.name + ' (' + (u.role === 'manager' ? 'Manager' : 'Employee') + ')') : '';
    const addBtn = document.getElementById('add-upcoming-task');
    if (addBtn) addBtn.style.display = isManager() ? 'inline-flex' : 'none';
    const storedDataMenuItem = document.getElementById('menu-item-stored-data');
    if (storedDataMenuItem) storedDataMenuItem.classList.toggle('d-none', !isManager());
    const btnChangePw = document.getElementById('btn-change-password');
    if (btnChangePw) btnChangePw.classList.toggle('d-none', !isManager());
  }

  function switchTab(tabId) {
    if (tabId === 'stored-data' && !isManager()) {
      tabId = 'kanban';
    }
    document.querySelectorAll('.tab-pane').forEach((p) => p.classList.remove('active'));
    document.querySelectorAll('.menu-item').forEach((m) => m.classList.remove('active'));
    const pane = document.getElementById(tabId + '-view');
    const menuItem = document.querySelector('.menu-item[data-tab="' + tabId + '"]');
    if (pane) pane.classList.add('active');
    if (menuItem) menuItem.classList.add('active');
    const title = document.getElementById('page-title');
    if (title) {
      if (tabId === 'tasks') title.textContent = 'Tasks (Upcoming)';
      else if (tabId === 'stored-data') title.textContent = 'Stored data';
      else title.textContent = 'Kanban Board';
    }
    if (tabId === 'stored-data') renderStoredDataView();
  }

  function renderStoredDataView() {
    const container = document.getElementById('stored-data-tables');
    if (!container) return;
    if (!isManager()) {
      container.innerHTML = '<p class="text-muted">Stored data is visible only to managers.</p>';
      return;
    }
    const cols = board.columns || [];
    const upcoming = board.upcomingTasks || [];
    const notifs = board.notifications || [];

    let html = '';

    html += '<h6 class="mb-2">Tasks on board</h6>';
    html += '<div class="table-responsive mb-4"><table class="table table-bordered table-sm"><thead><tr><th>Column</th><th>Title</th><th>Description</th><th>Urgency</th><th>Assigned to</th><th>Assigned by</th><th>Assigned at</th></tr></thead><tbody>';
    cols.forEach((col) => {
      (col.cards || []).forEach((card) => {
        const assignedAt = card.assignedAt ? new Date(card.assignedAt).toLocaleString() : '—';
        html += '<tr>';
        html += '<td>' + escapeHtml(col.title) + '</td>';
        html += '<td>' + escapeHtml(card.title) + '</td>';
        html += '<td>' + escapeHtml((card.description || '').slice(0, 80)) + (card.description && card.description.length > 80 ? '…' : '') + '</td>';
        html += '<td>' + escapeHtml(card.urgency || 'medium') + '</td>';
        html += '<td>' + escapeHtml(card.assigneeName || '—') + '</td>';
        html += '<td>' + escapeHtml(card.assignedByName || '—') + '</td>';
        html += '<td>' + assignedAt + '</td>';
        html += '</tr>';
      });
    });
    if (cols.every((c) => !(c.cards && c.cards.length))) html += '<tr><td colspan="7" class="text-muted text-center">No tasks</td></tr>';
    html += '</tbody></table></div>';

    html += '<h6 class="mb-2">Upcoming tasks (not yet assigned)</h6>';
    html += '<div class="table-responsive mb-4"><table class="table table-bordered table-sm"><thead><tr><th>Title</th><th>Description</th><th>Urgency</th></tr></thead><tbody>';
    upcoming.forEach((t) => {
      html += '<tr><td>' + escapeHtml(t.title) + '</td><td>' + escapeHtml((t.description || '').slice(0, 60)) + '</td><td>' + escapeHtml(t.urgency || 'medium') + '</td></tr>';
    });
    if (upcoming.length === 0) html += '<tr><td colspan="3" class="text-muted text-center">No upcoming tasks</td></tr>';
    html += '</tbody></table></div>';

    html += '<h6 class="mb-2">Assignment history (who assigned what to whom)</h6>';
    html += '<div class="table-responsive"><table class="table table-bordered table-sm"><thead><tr><th>Message</th><th>Date</th></tr></thead><tbody>';
    notifs.forEach((n) => {
      const at = n.at ? new Date(n.at).toLocaleString() : '—';
      html += '<tr><td>' + escapeHtml(n.message || '') + '</td><td>' + at + '</td></tr>';
    });
    if (notifs.length === 0) html += '<tr><td colspan="2" class="text-muted text-center">No notifications yet</td></tr>';
    html += '</tbody></table></div>';

    container.innerHTML = html;
  }

  function openUpcomingTaskModal() {
    const modal = document.getElementById('cardModal');
    const titleInput = document.getElementById('cardTitle');
    const descInput = document.getElementById('cardDescription');
    const urgencySelect = document.getElementById('cardUrgency');
    const assigneeGroup = document.getElementById('assignee-group');
    const assignedByInfo = document.getElementById('assigned-by-info');
    const form = document.getElementById('cardForm');
    if (!form) return;
    titleInput.value = '';
    descInput.value = '';
    if (urgencySelect) urgencySelect.value = 'medium';
    if (assigneeGroup) assigneeGroup.style.display = 'none';
    if (assignedByInfo) assignedByInfo.style.display = 'none';
    delete form.dataset.cardId;
    form.dataset.columnId = 'todo';
    form.dataset.isUpcoming = '1';
    const bsModal = new bootstrap.Modal(modal);
    bsModal.show();
  }

  function showLoginPage() {
    const loginEl = document.getElementById('login-page');
    const appEl = document.getElementById('app-page');
    if (loginEl) loginEl.style.display = 'flex';
    if (appEl) { appEl.style.display = 'none'; appEl.classList.remove('logged-in'); }
  }

  function showAppPage() {
    const loginEl = document.getElementById('login-page');
    const appEl = document.getElementById('app-page');
    if (loginEl) loginEl.style.display = 'none';
    if (appEl) { appEl.style.display = 'block'; appEl.classList.add('logged-in'); }
  }

  function init() {
    const form = document.getElementById('cardForm');
    if (form) form.addEventListener('submit', (e) => { e.preventDefault(); saveCardFromModal(); });

    document.querySelectorAll('.tab-link').forEach((a) => {
      a.addEventListener('click', (e) => {
        e.preventDefault();
        const tab = e.currentTarget.closest('.menu-item').dataset.tab;
        if (tab) switchTab(tab);
      });
    });

    const addUpcoming = document.getElementById('add-upcoming-task');
    if (addUpcoming) addUpcoming.addEventListener('click', () => { if (isManager()) openUpcomingTaskModal(); });

    const refreshStored = document.getElementById('refresh-stored-data');
    if (refreshStored) refreshStored.addEventListener('click', () => { loadBoard().then(() => renderStoredDataView()); });

    const btnLogout = document.getElementById('btn-logout');
    if (btnLogout) btnLogout.addEventListener('click', () => {
      localStorage.removeItem('kanban-current-user');
      showLoginPage();
    });

    const managerLoginForm = document.getElementById('manager-login-form');
    if (managerLoginForm) {
      managerLoginForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const emailEl = document.getElementById('manager-email');
        const passwordEl = document.getElementById('manager-password');
        const email = emailEl?.value?.trim() || '';
        const password = passwordEl?.value || '';
        if (!email || !password) {
          alert('Please enter email and password.');
          return;
        }
        const url = (API_BASE || window.location.origin || '') + '/api/auth/manager/login';
        fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password }),
        })
          .then(async (res) => {
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
          })
          .catch(() => alert('Login failed. Open the app from the server (e.g. http://localhost:3000).'));
      });
    }

    const employeeLoginForm = document.getElementById('employee-login-form');
    if (employeeLoginForm) {
      employeeLoginForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const nameInput = document.getElementById('employee-name');
        const name = nameInput?.value?.trim() || '';
        if (!name) {
          alert('Please enter your name.');
          return;
        }
        setCurrentUser({
          id: 'e_' + Date.now(),
          name: name,
          role: 'employee',
        });
        showAppPage();
        loadBoard();
        updateRoleUI();
      });
    }

    const changePasswordForm = document.getElementById('change-password-form');
    const changePasswordModal = document.getElementById('changePasswordModal');
    if (changePasswordForm && changePasswordModal) {
      changePasswordForm.addEventListener('submit', (e) => {
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
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: u.email,
            currentPassword,
            newPassword,
          }),
        })
          .then((res) => res.json())
          .then((data) => {
            if (data.ok) {
              bootstrap.Modal.getInstance(changePasswordModal).hide();
              changePasswordForm.reset();
              document.getElementById('cp-email').value = u.email || '';
              alert('Password changed successfully.');
            } else {
              alert(data.error || 'Failed to change password');
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

    if (getCurrentUser()) {
      showAppPage();
      loadBoard();
      updateRoleUI();
    } else {
      showLoginPage();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
