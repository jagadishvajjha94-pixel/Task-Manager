'use strict';

(function () {
  const API_BASE = (typeof window !== 'undefined' && (window.location.protocol === 'http:' || window.location.protocol === 'https:')) ? window.location.origin : '';

  const defaultUsers = [
    { id: 'm1', name: 'Sarah', role: 'manager' },
    { id: 'e1', name: 'Alice', role: 'employee' },
    { id: 'e2', name: 'Bob', role: 'employee' },
    { id: 'e3', name: 'Charlie', role: 'employee' }
  ];

  const defaultDepartments = ['Training dept.', 'Placement dept.', 'H.R. dept.'];

  function getMockBoard() {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const nextWeek = new Date(now);
    nextWeek.setDate(nextWeek.getDate() + 7);
    const lastWeek = new Date(now);
    lastWeek.setDate(lastWeek.getDate() - 7);
    const fmt = (d) => d.toISOString().slice(0, 16);
    return {
      columns: [
        {
          id: 'todo',
          title: 'To Do',
          cards: [
            { id: 'mc1', title: 'Onboard new interns', description: 'Prepare materials and schedule orientation', urgency: 'high', assignees: ['Alice'], department: 'H.R. dept.', deadline: fmt(tomorrow), assignedByName: 'Manager', assignedAt: now.toISOString() },
            { id: 'mc2', title: 'Update training slides', description: 'Q4 product updates for Training dept.', urgency: 'medium', assignees: ['Bob'], department: 'Training dept.', deadline: fmt(nextWeek), assignedByName: 'Manager', assignedAt: now.toISOString() },
            { id: 'mc3', title: 'Placement drive coordination', description: 'Coordinate with colleges for campus drive', urgency: 'high', assignees: ['Alice', 'Charlie'], department: 'Placement dept.', deadline: fmt(tomorrow), assignedByName: 'Manager', assignedAt: now.toISOString() },
            { id: 'mc4', title: 'Policy document review', description: 'Review and sign off HR policy changes', urgency: 'low', assignees: ['Alice'], department: 'H.R. dept.', deadline: fmt(nextWeek), assignedByName: 'Manager', assignedAt: now.toISOString() }
          ]
        },
        {
          id: 'progress',
          title: 'In Progress',
          cards: [
            { id: 'mc5', title: 'Conduct skill assessment', description: 'Run assessments for Training batch', urgency: 'high', assignees: ['Bob'], department: 'Training dept.', deadline: fmt(tomorrow), assignedByName: 'Manager', assignedAt: now.toISOString() },
            { id: 'mc6', title: 'Interview scheduling', description: 'Schedule rounds for shortlisted candidates', urgency: 'medium', assignees: ['Charlie'], department: 'Placement dept.', deadline: fmt(nextWeek), assignedByName: 'Manager', assignedAt: now.toISOString() }
          ]
        },
        {
          id: 'done',
          title: 'Done',
          cards: [
            { id: 'mc7', title: 'Quarterly report submitted', description: 'Q3 metrics and placement report', urgency: 'low', assignees: ['Alice'], department: 'Placement dept.', deadline: fmt(lastWeek), completedAt: lastWeek.toISOString(), assignedByName: 'Manager', assignedAt: now.toISOString() },
            { id: 'mc8', title: 'Training session completed', description: 'New joiner induction completed', urgency: 'medium', assignees: ['Bob'], department: 'Training dept.', deadline: fmt(lastWeek), completedAt: lastWeek.toISOString(), assignedByName: 'Manager', assignedAt: now.toISOString() }
          ]
        }
      ],
      departments: defaultDepartments.slice(),
      upcomingTasks: [
        { id: 'ut1', title: 'Annual appraisal forms', description: 'Send and collect appraisal forms', urgency: 'high', department: 'H.R. dept.' },
        { id: 'ut2', title: 'Campus recruitment calendar', description: 'Finalize calendar with colleges', urgency: 'medium', department: 'Placement dept.' }
      ],
      notifications: [
        { id: 'n1', message: 'Manager assigned "Onboard new interns" to Alice', taskTitle: 'Onboard new interns', assigneeName: 'Alice', assignedByName: 'Manager', at: now.toISOString() },
        { id: 'n2', message: 'Manager assigned "Conduct skill assessment" to Bob', taskTitle: 'Conduct skill assessment', assigneeName: 'Bob', assignedByName: 'Manager', at: now.toISOString() }
      ],
      users: []
    };
  }

  const defaultBoard = getMockBoard();

  let board = { columns: [], departments: [], upcomingTasks: [], notifications: [], users: [] };

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
        if (!Array.isArray(board.departments)) board.departments = defaultDepartments.slice();
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
          if (!Array.isArray(board.departments)) board.departments = defaultDepartments.slice();
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
    renderManagerTab();
    renderNotifications();
    updateRoleUI();
  }

  function getDepartments() {
    return Array.isArray(board.departments) && board.departments.length ? board.departments : defaultDepartments.slice();
  }

  function renderManagerTab() {
    const deptsList = document.getElementById('manager-depts-list');
    const accuracyTbody = document.getElementById('manager-accuracy-tbody');
    if (!deptsList) return;
    const depts = getDepartments();
    deptsList.innerHTML = depts.map((d) => `<li class="list-group-item">${escapeHtml(d)}</li>`).join('');
    const stats = computeEmployeeStats();
    const names = Object.keys(stats).sort();
    if (accuracyTbody) {
      if (names.length === 0) {
        accuracyTbody.innerHTML = '<tr><td colspan="5" class="text-muted text-center">No assignees yet. Assign tasks to see accuracy.</td></tr>';
      } else {
        accuracyTbody.innerHTML = names.map((name) => {
          const s = stats[name];
          const pct = s.assigned > 0 ? Math.round((s.completed / s.assigned) * 100) : 0;
          return `<tr><td>${escapeHtml(name)}</td><td>${s.assigned}</td><td>${s.completed}</td><td>${s.onTime}</td><td class="d-flex align-items-center gap-2"><span class="accuracy-circle-wrap" style="width:24px;height:24px"><svg viewBox="0 0 36 36" width="24" height="24" style="transform:rotate(-90deg)"><path fill="none" stroke="rgba(0,0,0,.08)" stroke-width="3" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"/><path fill="none" stroke="var(--bs-success)" stroke-width="3" stroke-linecap="round" pathLength="100" stroke-dasharray="${pct} 100" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"/></svg></span><strong>${pct}%</strong></td></tr>`;
        }).join('');
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
    el.innerHTML = '<strong>Server not running.</strong> Data is saved in this browser only. <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>';
    document.body.insertBefore(el, document.body.firstChild);
  }

  function hideConnectionBanner() {
    const el = document.getElementById('connection-banner');
    if (el) el.remove();
  }

  function loadDemoData() {
    board = JSON.parse(JSON.stringify(getMockBoard()));
    if (!Array.isArray(board.columns)) board.columns = [];
    if (!Array.isArray(board.departments)) board.departments = defaultDepartments.slice();
    if (!Array.isArray(board.upcomingTasks)) board.upcomingTasks = [];
    if (!Array.isArray(board.notifications)) board.notifications = [];
    if (!Array.isArray(board.users)) board.users = [];
    saveBoard();
    render();
    renderTasksTab();
    renderManagerTab();
    renderNotifications();
    updateRoleUI();
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

  function getAssigneesList(card) {
    if (card.assignees && Array.isArray(card.assignees) && card.assignees.length > 0) {
      return card.assignees.map((a) => (typeof a === 'string' ? a : (a && a.name) || '')).filter(Boolean);
    }
    if (card.assigneeName) return [card.assigneeName];
    return [];
  }

  function assigneeBlock(name) {
    if (!name || !name.trim()) return '';
    const initial = name.trim().charAt(0).toUpperCase();
    return `<span class="assignee-with-name"><span class="assignee-initial" title="${escapeHtml(name.trim())}">${escapeHtml(initial)}</span><span class="assignee-name">${escapeHtml(name.trim())}</span></span>`;
  }

  function assigneesInitialsOnly(names) {
    if (!names || names.length === 0) return '';
    return `<span class="assignee-initials-wrap">${names.map((n) => {
      const empName = (n || '').trim();
      if (!empName) return '';
      const initial = empName.charAt(0).toUpperCase();
      return `<span class="assignee-clickable assignee-with-name" data-employee-name="${escapeHtml(empName)}" title="Click to view ${escapeHtml(empName)}'s performance"><span class="assignee-initial">${escapeHtml(initial)}</span><span class="assignee-name">${escapeHtml(empName)}</span></span>`;
    }).join('')}</span>`;
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

  function getTodayDateKey() {
    const n = new Date();
    return n.getFullYear() + '-' + String(n.getMonth() + 1).padStart(2, '0') + '-' + String(n.getDate()).padStart(2, '0');
  }

  function addDaysToDateKey(dateKey, days) {
    const d = new Date(dateKey + 'T12:00:00');
    d.setDate(d.getDate() + days);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
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
    (board.columns || []).forEach((col) => {
      (col.cards || []).forEach((card) => {
        const c = { ...card, _columnId: col.id };
        allCards.push(c);
      });
    });

    const todayKey = getTodayDateKey();
    const fallbackDate = todayKey;

    const byDate = {};

    allCards.forEach((card) => {
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
        _originalDateKey: originalDateKey,
      });
    });

    return Object.keys(byDate).sort().map((dateKey) => {
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

  function computeEmployeeStats() {
    const stats = {};
    (board.columns || []).forEach((col) => {
      (col.cards || []).forEach((card) => {
        const names = getAssigneesList(card);
        names.forEach((name) => {
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
    (board.columns || []).forEach((col) => {
      (col.cards || []).forEach((card) => {
        const names = getAssigneesList(card);
        const has = names.some((n) => (n || '').trim().toLowerCase() === nameKey);
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
    (board.columns || []).forEach((col) => {
      (col.cards || []).forEach((card) => {
        if (!card.completedAt) return;
        const names = getAssigneesList(card);
        const has = names.some((n) => (n || '').trim().toLowerCase() === nameKey);
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
      const dk = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
      dateKeys.push(dk);
      dates.push(d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: '2-digit' }));
      completions.push(byDate[dk] ? byDate[dk].count : 0);
    }
    return { dates, dateKeys, completions, byDate };
  }

  let employeeChartInstance = null;
  let employeeStatsChartInstance = null;

  function openEmployeeModal(employeeName) {
    const modal = document.getElementById('employeeDetailsModal');
    const nameEl = document.getElementById('employee-modal-name');
    const avatarEl = document.getElementById('employee-modal-avatar');
    const tasksTbody = document.getElementById('employee-tasks-tbody');
    const chartEl = document.getElementById('employeeChart');
    if (!modal || !nameEl) return;

    const name = (employeeName || '').trim();
    nameEl.textContent = name || 'Employee';
    if (avatarEl) avatarEl.textContent = name ? name.charAt(0).toUpperCase() : '?';

    const stats = computeEmployeeStats();
    const statsKey = Object.keys(stats || {}).find((k) => (k || '').trim().toLowerCase() === name.toLowerCase());
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
        tasksTbody.innerHTML = tasks.map((t) => {
          const done = isCardDone(t);
          const status = done ? '<span class="badge bg-success">Completed</span>' : '<span class="badge bg-warning">Pending</span>';
          const urgency = (t.urgency || 'medium').charAt(0).toUpperCase() + (t.urgency || 'medium').slice(1);
          const deadline = t.deadline ? new Date(t.deadline).toLocaleString() : '—';
          return `<tr><td>${escapeHtml(t.title || '')}</td><td>${status}</td><td>${escapeHtml(urgency)}</td><td>${escapeHtml(deadline)}</td></tr>`;
        }).join('');
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
        chart: { type: 'radialBar', height: 280, fontFamily: 'inherit' },
        plotOptions: {
          radialBar: {
            startAngle: -90,
            endAngle: 90,
            hollow: { size: '38%', margin: 4 },
            track: { background: '#e9ecef', strokeWidth: '90%', margin: 2 },
            dataLabels: {
              show: true,
              name: { show: true, fontSize: '13px', fontWeight: 600, offsetY: -2 },
              value: { show: true, fontSize: '16px', fontWeight: 700, offsetY: 2, formatter: (v) => v + '%' },
              total: { show: true, label: 'Overall', fontSize: '12px', formatter: () => accuracy + '%' }
            }
          }
        },
        series: [assignedRate, completionRate, onTimeRate, accuracy],
        labels: ['Assigned', 'Completed', 'On time', 'Accuracy'],
        colors: ['#696cff', '#28c76f', '#00cfe8', '#ff9f43'],
        legend: { show: true, position: 'bottom', fontSize: '12px' },
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
      const completedTasks = (tasks || []).filter((t) => isCardDone(t));
      const completedNames = completedTasks.map((t) => t.title || 'Task').slice(0, 8);
      const chartConfig = {
        chart: { type: 'radialBar', height: 180 },
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
                fontWeight: 600,
                offsetY: -10,
                formatter: () => 'Goal: 100%'
              },
              value: {
                show: true,
                fontSize: '24px',
                fontWeight: 700,
                offsetY: 2,
                formatter: (v) => v + '% achieved'
              },
              total: {
                show: true,
                label: 'Tasks',
                fontSize: '11px',
                fontWeight: 500,
                formatter: function () { return s.completed + ' / ' + s.assigned; }
              }
            }
          }
        },
        labels: ['Tasks'],
        tooltip: {
          custom: function (opts) {
            const taskList = completedNames.length > 0
              ? completedNames.map((t) => '• ' + escapeHtml(t)).join('<br>') + (completedTasks.length > 8 ? '<br><span style="color:#697a8d;font-size:10px">+' + (completedTasks.length - 8) + ' more</span>' : '')
              : 'No tasks completed yet';
            return '<div class="apexcharts-tooltip-title" style="margin-bottom:6px;font-weight:600">Completed tasks</div>' +
              '<div style="font-size:11px;color:#697a8d;max-width:180px;line-height:1.5">' + taskList + '</div>';
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

  let kanbanCalendarMonth = new Date();
  kanbanCalendarMonth.setDate(1);

  function getTasksByDateKey() {
    const byDate = {};
    (board.columns || []).forEach((col) => {
      (col.cards || []).forEach((card) => {
        const assignedAt = card.assignedAt || card.createdAt || '';
        const dateKey = assignedAt ? assignedAt.slice(0, 10) : '';
        if (!dateKey) return;
        if (!byDate[dateKey]) byDate[dateKey] = [];
        byDate[dateKey].push({ ...card, status: isCardDone(card) ? 'Completed' : 'Pending' });
      });
    });
    return byDate;
  }

  function renderKanbanCalendar() {
    const grid = document.getElementById('kanban-calendar');
    const monthEl = document.getElementById('kanban-calendar-month');
    const detailWrap = document.getElementById('kanban-calendar-day-detail');
    const detailTitle = document.getElementById('kanban-day-detail-title');
    const detailBody = document.getElementById('kanban-day-detail-body');
    if (!grid) return;
    const byDate = getTasksByDateKey();
    const year = kanbanCalendarMonth.getFullYear();
    const month = kanbanCalendarMonth.getMonth();
    monthEl.textContent = kanbanCalendarMonth.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startPad = (firstDay.getDay() + 6) % 7;
    const daysInMonth = lastDay.getDate();
    const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    let html = dayNames.map((d) => `<div class="cal-day-name">${d}</div>`).join('');
    for (let i = 0; i < startPad; i++) html += '<div class="cal-day"></div>';
    for (let d = 1; d <= daysInMonth; d++) {
      const dateKey = year + '-' + String(month + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
      const tasks = byDate[dateKey] || [];
      const count = tasks.length;
      html += `<div class="cal-day${count ? ' has-tasks' : ''}" data-date="${dateKey}" title="${count} task(s)"><span class="cal-num">${d}</span>${count ? '<span class="cal-count">' + count + '</span>' : ''}</div>`;
    }
    grid.innerHTML = html;
    grid.querySelectorAll('.cal-day[data-date]').forEach((el) => {
      el.addEventListener('click', () => {
        grid.querySelectorAll('.cal-day').forEach((c) => c.classList.remove('selected'));
        el.classList.add('selected');
        const dateKey = el.dataset.date;
        // Get fresh data to reflect any task status changes
        const freshByDate = getTasksByDateKey();
        const tasks = freshByDate[dateKey] || [];
        const d = new Date(dateKey + 'T12:00:00');
        detailTitle.textContent = 'Tasks for ' + d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' });
        if (tasks.length === 0) {
          detailBody.innerHTML = '<p class="text-muted mb-0">No tasks assigned this day.</p>';
        } else {
          detailBody.innerHTML = '<table class="table table-sm mb-0"><thead><tr><th>Task</th><th>Assigned to</th><th>Status</th></tr></thead><tbody>' +
            tasks.map((t) => '<tr><td>' + escapeHtml(t.title || '') + '</td><td>' + escapeHtml(getAssigneesList(t).join(', ') || '—') + '</td><td><span class="badge ' + (t.status === 'Completed' ? 'bg-success' : 'bg-warning') + '">' + escapeHtml(t.status) + '</span></td></tr>').join('') +
            '</tbody></table>';
        }
        detailWrap.classList.remove('d-none');
      });
    });
  }

  function render() {
    const container = document.getElementById('kanban-board');
    if (!container) return;
    const manager = isManager();
    const dateGroups = getTasksByDate();

    if (dateGroups.length === 0) {
      container.innerHTML = '<p class="text-muted py-5">No tasks yet. Add tasks from the Tasks tab or use "Load demo data".</p>';
      const todoCol = (board.columns || []).find((c) => (c.id || '').toString().toLowerCase() === 'todo');
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
    dateGroups.forEach((group) => {
      if (group.dateKey === todayKey) {
        const rolloverPending = group.cards.filter((c) => !isCardDone(c) && c._isRollover === true);
        const todayRest = group.cards.filter((c) => !c._isRollover || isCardDone(c));
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
          cards: sortCardsByPriority(group.cards)
        });
      }
    });

    function renderColumn(group) {
      const partClass = group.isRolloverPart ? ' kanban-part-rollover' : (group.isTodayPart ? ' kanban-part-today' : '');
      return `
      <div class="kanban-column kanban-date-column${partClass}" data-date-key="${group.dateKey}">
        <div class="kanban-column-header">
          <h6 class="mb-0">${escapeHtml(group.label)}</h6>
          <span class="badge bg-label-primary">${group.cards.length}</span>
        </div>
        <div class="kanban-column-cards" data-date-key="${group.dateKey}">
          ${group.cards
            .map(
              (card) => {
                const isDone = isCardDone(card);
                const isRollover = card._isRollover === true;
                const urgency = card.urgency || 'medium';
                const urgencyClass = isDone ? '' : (urgency === 'high' ? 'kanban-urgency-high' : urgency === 'low' ? 'kanban-urgency-low' : 'kanban-urgency-medium');
                const doneClass = isDone ? 'kanban-card-done' : '';
                const rolloverClass = isRollover ? 'kanban-card-rollover' : '';
                const rolloverBadge = isRollover ? `<span class="rollover-badge"><i class="bx bx-error-circle text-warning"></i> ${escapeHtml(getRolloverLabel(card._originalDateKey || ''))}</span>` : '';
                const assignedDateKey = card._originalDateKey || card.assignedAt?.slice(0, 10) || '';
                const taskDateHtml = assignedDateKey ? `<span class="task-assigned-date small text-muted"><i class="bx bx-calendar me-1"></i>${escapeHtml(formatTaskDate(assignedDateKey))}</span>` : '';
                const assigneeNames = getAssigneesList(card);
                const assigneeHtml = assigneeNames.length > 0 ? assigneesInitialsOnly(assigneeNames) : '';
                const deptHtml = card.department ? `<span class="badge bg-label-info me-1 small">${escapeHtml(card.department)}</span>` : '';
                const deadlineHtml = card.deadline ? `<span class="card-deadline d-block mt-1 small ${!isDone && new Date(card.deadline) < new Date() ? 'overdue' : ''}">${escapeHtml(formatDeadlineTimer(card.deadline, card.completedAt, isDone))}</span>` : '';
                const assignedByHtml = card.assignedByName ? `<span class="card-assigned-by d-block mt-1 small text-muted"><i class="bx bx-user-plus me-1"></i>Assigned by ${escapeHtml(card.assignedByName)}</span>` : '';
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
                const todoCol = (board.columns || []).find((c) => (c.id || '').toString().toLowerCase() === 'todo') || (board.columns || [])[0];
                const colId = card._columnId || (todoCol ? todoCol.id : 'todo');
                const toggleBtnClass = isDone ? 'kanban-done-toggle-btn done' : 'kanban-done-toggle-btn';
                const toggleIcon = isDone ? 'bx-like' : 'bx-circle';
                const toggleTitle = isDone ? 'Mark as not done' : 'Mark as done';
                return `
            <div class="card kanban-card ${urgencyClass} ${doneClass} ${rolloverClass}" data-card-id="${card.id}" data-column-id="${colId}">
              <div class="card-body py-3 d-flex gap-2">
                <button type="button" class="${toggleBtnClass}" data-card-id="${escapeHtml(card.id)}" title="${toggleTitle}" aria-label="${toggleTitle}">
                  <i class="bx ${toggleIcon}"></i>
                </button>
                <div class="flex-grow-1 min-w-0">
                ${rolloverBadge}
                ${taskDateHtml}
                <div class="d-flex justify-content-between align-items-start gap-2">
                  <div class="d-flex align-items-center gap-2 flex-grow-1 min-w-0 flex-wrap">
                    ${assigneeHtml}
                    ${deptHtml}
                    <h6 class="card-title mb-0 text-truncate">${escapeHtml(card.title)}</h6>
                  </div>
                  ${actions}
                </div>
                ${card.description ? `<p class="card-text small text-body-secondary mb-0 mt-1">${escapeHtml(card.description)}</p>` : ''}
                ${deadlineHtml}
                ${assignedByHtml}
                ${completedBadge}
                </div>
              </div>
            </div>
          `;
              }
            )
            .join('')}
        </div>
        ${manager ? `<button type="button" class="btn btn-sm btn-outline-primary w-100 mt-2 add-card" data-column-id="${((board.columns || [])[0] && (board.columns[0].id)) || 'todo'}">+ Add card</button>` : ''}
      </div>
    `;
    }

    let boardHtml = '';
    if (groupsToRender.length >= 2 && groupsToRender[0].isRolloverPart && groupsToRender[1].isTodayPart) {
      boardHtml += '<div class="kanban-board-rows">';
      boardHtml += '<div class="kanban-board-row">' + renderColumn(groupsToRender[0]) + '</div>';
      boardHtml += '<div class="kanban-board-row">' + renderColumn(groupsToRender[1]) + '</div>';
      if (groupsToRender.length > 2) {
        boardHtml += '<div class="kanban-board-row">';
        for (let i = 2; i < groupsToRender.length; i++) boardHtml += renderColumn(groupsToRender[i]);
        boardHtml += '</div>';
      }
      boardHtml += '</div>';
    } else {
      boardHtml += '<div class="kanban-board-rows"><div class="kanban-board-row">';
      groupsToRender.forEach((g) => { boardHtml += renderColumn(g); });
      boardHtml += '</div></div>';
    }
    container.innerHTML = boardHtml;

    container.querySelectorAll('.kanban-done-toggle-btn').forEach((btn) => {
      btn.addEventListener('click', onToggleDone);
    });
    if (manager) {
      container.querySelectorAll('.add-card').forEach((btn) => btn.addEventListener('click', onAddCard));
    }
    container.querySelectorAll('.edit-card').forEach((a) => a.addEventListener('click', onEditCard));
    container.querySelectorAll('.delete-card').forEach((a) => a.addEventListener('click', onDeleteCard));
    container.querySelectorAll('.view-card-details').forEach((a) => a.addEventListener('click', onViewCardDetails));
    container.querySelectorAll('.assignee-clickable').forEach((el) => {
      el.addEventListener('click', (e) => {
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
    const col = (board.columns || []).find((c) => (c.cards || []).some((card) => card.id === cardId));
    if (!col) return;
    const card = (col.cards || []).find((c) => c.id === cardId);
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
    const deptEl = document.getElementById('detail-department');
    const deadlineEl = document.getElementById('detail-deadline');
    const assigneeEl = document.getElementById('detail-assignee');
    const assignedByEl = document.getElementById('detail-assigned-by');
    if (titleEl) titleEl.textContent = card.title || '—';
    if (descEl) descEl.textContent = card.description || '—';
    if (urgencyEl) {
      const u = (card.urgency || 'medium');
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
      assigneeEl.innerHTML = names.length > 0 ? names.map((n) => assigneeBlock(n)).join(' ') : '— Unassigned —';
    }
    if (assignedByEl) assignedByEl.textContent = card.assignedByName || '—';
    const bsModal = new bootstrap.Modal(modal);
    bsModal.show();
  }

  function fillDepartmentSelect(selectEl) {
    if (!selectEl) return;
    const current = selectEl.value;
    const depts = getDepartments();
    selectEl.innerHTML = '<option value="">— Select department —</option>' + depts.map((d) => `<option value="${escapeHtml(d)}">${escapeHtml(d)}</option>`).join('');
    if (current && depts.indexOf(current) !== -1) selectEl.value = current;
  }

  function renderAssigneesChips(container, names, onRemove) {
    if (!container) return;
    container.innerHTML = (names || []).map((name) => {
      const n = (name || '').trim();
      if (!n) return '';
      return `<span class="assignee-chip" data-name="${escapeHtml(n)}">${escapeHtml(n)} <button type="button" class="btn btn-link btn-sm p-0 ms-1 text-danger" data-remove-name="${escapeHtml(n)}" aria-label="Remove">&times;</button></span>`;
    }).join('');
    container.querySelectorAll('[data-remove-name]').forEach((btn) => {
      btn.addEventListener('click', () => { onRemove(btn.dataset.removeName); });
    });
  }

  function getAssigneesFromChips() {
    const container = document.getElementById('card-assignees-chips');
    if (!container) return [];
    return [].map.call(container.querySelectorAll('.assignee-chip[data-name]'), (el) => el.dataset.name || '').filter(Boolean);
  }

  function openCardModal(card, columnId) {
    const modal = document.getElementById('cardModal');
    const titleInput = document.getElementById('cardTitle');
    const descInput = document.getElementById('cardDescription');
    const urgencySelect = document.getElementById('cardUrgency');
    const departmentSelect = document.getElementById('cardDepartment');
    const assigneeInput = document.getElementById('cardAssignee');
    const deadlineInput = document.getElementById('cardDeadline');
    const assigneesChips = document.getElementById('card-assignees-chips');
    const departmentGroup = document.getElementById('department-group');
    const assigneeNameGroup = document.getElementById('assignee-name-group');
    const deadlineGroup = document.getElementById('deadline-group');
    const assignedByInfo = document.getElementById('assigned-by-info');
    const assignedByNameEl = document.getElementById('assigned-by-name');
    const form = document.getElementById('cardForm');
    const newDeptWrap = document.getElementById('card-new-dept-wrap');
    if (!modal || !form) return;

    const manager = isManager();
    if (departmentGroup) departmentGroup.style.display = manager ? 'block' : 'none';
    if (assigneeNameGroup) assigneeNameGroup.style.display = manager ? 'block' : 'none';
    if (deadlineGroup) deadlineGroup.style.display = manager ? 'block' : 'none';
    if (assignedByInfo) assignedByInfo.style.display = 'none';
    if (newDeptWrap) newDeptWrap.classList.add('d-none');

    fillDepartmentSelect(departmentSelect);

    const assigneeNames = card ? getAssigneesList(card) : [];
    function removeAssignee(name) {
      const list = getAssigneesFromChips().filter((n) => n !== name);
      renderAssigneesChips(assigneesChips, list, removeAssignee);
    }
    renderAssigneesChips(assigneesChips, assigneeNames, removeAssignee);

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
    const departmentSelect = document.getElementById('cardDepartment');
    const assigneeInput = document.getElementById('cardAssignee');
    const deadlineInput = document.getElementById('cardDeadline');
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
    const currentUser = getCurrentUser();
    const assigneesFromChips = getAssigneesFromChips();
    const newName = assigneeInput ? assigneeInput.value.trim() : '';
    const assigneeNames = newName ? (assigneesFromChips.indexOf(newName) === -1 ? assigneesFromChips.concat(newName) : assigneesFromChips) : assigneesFromChips;

    if (isUpcoming) {
      const task = { id: uid(), title, description: descInput.value.trim(), urgency, department, deadline };
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
        card.title = title;
        card.description = descInput.value.trim();
        card.urgency = urgency;
        card.department = department || undefined;
        card.deadline = deadline;
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
      }
    } else {
      const card = { id: uid(), title, description: descInput.value.trim(), urgency, department: department || undefined, deadline };
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
    saveBoard();
    render();
    renderManagerTab();
    renderNotifications();
    updateAccuracyUI();
  }

  function renderTasksTab() {
    const container = document.getElementById('tasks-tab-content');
    const addBtn = document.getElementById('add-upcoming-task');
    const addDeptBtn = document.getElementById('add-dept-tasks-btn');
    if (!container) return;
    const manager = isManager();
    if (addBtn) addBtn.style.display = manager ? 'inline-flex' : 'none';
    if (addDeptBtn) addDeptBtn.classList.toggle('d-none', !manager);

    const tasks = board.upcomingTasks || [];
    const byDept = {};
    tasks.forEach((task) => {
      const dept = (task.department || '').trim() || 'Other';
      if (!byDept[dept]) byDept[dept] = [];
      byDept[dept].push(task);
    });

    const deptOrder = getDepartments().slice();
    Object.keys(byDept).forEach((d) => {
      if (d !== 'Other' && deptOrder.indexOf(d) === -1) deptOrder.push(d);
    });
    if (byDept['Other']) deptOrder.push('Other');
    if (deptOrder.length === 0 && manager) {
      container.innerHTML = '<p class="text-muted text-center py-4 mb-0 px-3">No departments yet. Click <strong>Create dept</strong> above to add one, then add tasks.</p>';
      return;
    }
    if (deptOrder.length === 0) {
      container.innerHTML = '<p class="text-muted text-center py-4 mb-0 px-3">No tasks yet. Only the manager can add and assign tasks.</p>';
      return;
    }

    let html = '';
    deptOrder.forEach((dept) => {
      const deptTasks = byDept[dept] || [];
      html += '<div class="tasks-dept-section border-bottom pb-4 mb-4">';
      html += '<div class="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-3 px-0">';
      html += '<h6 class="text-body mb-0 d-flex align-items-center"><i class="bx bx-building-house me-2"></i>' + escapeHtml(dept) + '</h6>';
      if (manager) {
        html += '<button type="button" class="btn btn-sm btn-primary add-task-for-dept" data-dept="' + escapeHtml(dept) + '" title="Add task for ' + escapeHtml(dept) + '"><i class="bx bx-plus me-1"></i> Add task</button>';
      }
      html += '</div>';
      html += '<div class="table-responsive"><table class="table table-hover table-align-middle mb-0"><thead><tr><th>Task</th><th>Urgency</th><th>Department</th><th>Assigned to</th><th class="task-row-assign text-nowrap">Assign to</th></tr></thead><tbody>';
      deptTasks.forEach((task) => {
        const assigneesStr = getAssigneesList(task).join(', ') || '—';
        const assignInput = manager
          ? `<div class="input-group input-group-sm"><input type="text" class="form-control assign-upcoming-input" data-task-id="${task.id}" data-title="${escapeHtml(task.title).replace(/"/g, '&quot;')}" placeholder="Employee name" /><button type="button" class="btn btn-primary btn-sm assign-upcoming-btn" data-task-id="${task.id}" data-title="${escapeHtml(task.title).replace(/"/g, '&quot;')}">Assign</button></div>`
          : '<span class="text-muted">—</span>';
        html += `<tr data-task-id="${task.id}">
        <td><strong>${escapeHtml(task.title)}</strong>${task.description ? `<br><span class="text-muted small">${escapeHtml(task.description)}</span>` : ''}</td>
        <td><span class="badge ${task.urgency === 'high' ? 'bg-danger' : task.urgency === 'low' ? 'bg-success' : 'bg-warning'}">${escapeHtml(task.urgency || 'medium')}</span></td>
        <td>${escapeHtml(task.department || '—')}</td>
        <td>${escapeHtml(assigneesStr)}</td>
        <td class="task-row-assign">${assignInput}</td>
      </tr>`;
      });
      if (deptTasks.length === 0) {
        html += '<tr><td colspan="5" class="text-muted text-center py-3">No tasks in this department. Click <strong>Add task</strong> above to add one.</td></tr>';
      }
      html += '</tbody></table></div></div>';
    });
    container.innerHTML = html;

    if (manager) {
      container.querySelectorAll('.assign-upcoming-btn').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          const input = e.target.closest('tr').querySelector('.assign-upcoming-input');
          if (input) onAssignUpcoming(input);
        });
      });
      container.querySelectorAll('.add-task-for-dept').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          const dept = e.currentTarget.dataset.dept;
          openUpcomingTaskModal(dept);
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

    const task = (board.upcomingTasks || []).find((t) => t.id === taskId);
    if (!task) return;
    const currentUser = getCurrentUser();
    task.assigneeName = assigneeName;
    task.assignees = [assigneeName];
    task.assignedById = currentUser ? currentUser.id : '';
    task.assignedByName = currentUser ? currentUser.name : 'Manager';
    task.assignedAt = task.assignedAt || new Date().toISOString();

    const alreadyOnBoard = (board.columns || []).some((col) => (col.cards || []).some((c) => c.id === task.id));
    const todoCol = (board.columns || []).find((c) => (c.id || '').toString().toLowerCase() === 'todo');
    if (!alreadyOnBoard && todoCol) {
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

  function updateAccuracyUI() {
    const widget = document.getElementById('accuracy-widget');
    const circleFill = document.getElementById('accuracy-circle-fill');
    const circleText = document.getElementById('accuracy-circle-text');
    const badge = document.getElementById('accuracy-badge');
    const u = getCurrentUser();
    if (!widget) return;
    if (!u || u.role === 'manager') {
      widget.classList.add('d-none');
      return;
    }
    const stats = computeEmployeeStats();
    const myName = (u.name || '').trim();
    const myKey = Object.keys(stats || {}).find((k) => (k || '').trim().toLowerCase() === myName.toLowerCase());
    const my = myKey ? stats[myKey] : null;
    if (!stats || Object.keys(stats).length === 0) {
      if (circleFill) circleFill.setAttribute('stroke-dasharray', '0 100');
      if (circleText) circleText.textContent = '0%';
      if (badge) badge.textContent = 'accuracy';
      widget.classList.remove('d-none');
      return;
    }
    const assigned = my ? my.assigned : 0;
    const completed = my ? my.completed : 0;
    const pct = assigned > 0 ? Math.round((completed / assigned) * 100) : 0;
    if (circleFill) circleFill.setAttribute('stroke-dasharray', pct + ' 100');
    if (circleText) circleText.textContent = pct + '%';
    if (badge) badge.textContent = 'accuracy';
    widget.classList.remove('d-none');
  }

  function updateRoleUI() {
    const label = document.getElementById('current-role-label');
    const u = getCurrentUser();
    if (label) label.textContent = u ? (u.name + ' (' + (u.role === 'manager' ? 'Manager' : 'Employee') + ')') : '';
    const addBtn = document.getElementById('add-upcoming-task');
    if (addBtn) addBtn.style.display = isManager() ? 'inline-flex' : 'none';
    const storedDataMenuItem = document.getElementById('menu-item-stored-data');
    if (storedDataMenuItem) storedDataMenuItem.classList.toggle('d-none', !isManager());
    const managerMenuItem = document.getElementById('menu-item-manager');
    if (managerMenuItem) managerMenuItem.classList.toggle('d-none', !isManager());
    const btnChangePw = document.getElementById('btn-change-password');
    if (btnChangePw) btnChangePw.classList.toggle('d-none', !isManager());
    updateAccuracyUI();
  }

  function switchTab(tabId) {
    if ((tabId === 'stored-data' || tabId === 'manager') && !isManager()) {
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
      else if (tabId === 'manager') title.textContent = 'Manager';
      else title.textContent = 'Kanban Board';
    }
    if (tabId === 'stored-data') renderStoredDataView();
    if (tabId === 'manager') renderManagerTab();
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
    cols.forEach((col) => (col.cards || []).forEach((card) => allCards.push(card)));
    const upcoming = board.upcomingTasks || [];
    const notifs = board.notifications || [];

    let html = '';

    html += '<h6 class="mb-2">Tasks on board</h6>';
    html += '<div class="mb-2"><input type="text" class="form-control form-control-sm stored-search" id="stored-search-tasks" placeholder="Search task, name, status..." style="max-width: 280px;" /></div>';
    html += '<div class="table-responsive mb-4"><table class="table table-bordered table-sm stored-table" id="stored-tasks-table"><thead><tr><th>S.No</th><th>Title</th><th>Description</th><th>Status</th><th>Urgency</th><th>Department</th><th>Deadline</th><th>Assigned to</th><th>Assigned by</th><th>Assigned at</th></tr></thead><tbody>';
    allCards.forEach((card, idx) => {
      const assignedAt = card.assignedAt ? new Date(card.assignedAt).toLocaleString() : '—';
      const deadlineStr = card.deadline ? new Date(card.deadline).toLocaleString() : '—';
      const assigneesStr = getAssigneesList(card).join(', ') || '—';
      const status = isCardDone(card) ? 'Completed' : 'Pending';
      html += '<tr data-search="' + escapeHtml((card.title || '') + ' ' + (card.description || '') + ' ' + assigneesStr + ' ' + status).toLowerCase() + '">';
      html += '<td>' + (idx + 1) + '</td>';
      html += '<td>' + escapeHtml(card.title) + '</td>';
      html += '<td>' + escapeHtml((card.description || '').slice(0, 80)) + (card.description && card.description.length > 80 ? '…' : '') + '</td>';
      html += '<td><span class="badge ' + (status === 'Completed' ? 'bg-success' : 'bg-warning') + '">' + escapeHtml(status) + '</span></td>';
      html += '<td>' + escapeHtml(card.urgency || 'medium') + '</td>';
      html += '<td>' + escapeHtml(card.department || '—') + '</td>';
      html += '<td>' + deadlineStr + '</td>';
      html += '<td>' + escapeHtml(assigneesStr) + '</td>';
      html += '<td>' + escapeHtml(card.assignedByName || '—') + '</td>';
      html += '<td>' + assignedAt + '</td>';
      html += '</tr>';
    });
    if (allCards.length === 0) html += '<tr><td colspan="10" class="text-muted text-center">No tasks</td></tr>';
    html += '</tbody></table></div>';

    html += '<h6 class="mb-2">Upcoming tasks (not yet assigned)</h6>';
    html += '<div class="mb-2"><input type="text" class="form-control form-control-sm stored-search" id="stored-search-upcoming" placeholder="Search task..." style="max-width: 280px;" /></div>';
    html += '<div class="table-responsive mb-4"><table class="table table-bordered table-sm stored-table" id="stored-upcoming-table"><thead><tr><th>S.No</th><th>Title</th><th>Description</th><th>Urgency</th></tr></thead><tbody>';
    upcoming.forEach((t, idx) => {
      html += '<tr data-search="' + escapeHtml((t.title || '') + ' ' + (t.description || '')).toLowerCase() + '"><td>' + (idx + 1) + '</td><td>' + escapeHtml(t.title) + '</td><td>' + escapeHtml((t.description || '').slice(0, 60)) + '</td><td>' + escapeHtml(t.urgency || 'medium') + '</td></tr>';
    });
    if (upcoming.length === 0) html += '<tr><td colspan="4" class="text-muted text-center">No upcoming tasks</td></tr>';
    html += '</tbody></table></div>';

    html += '<h6 class="mb-2">Assignment history (who assigned what to whom)</h6>';
    html += '<div class="mb-2"><input type="text" class="form-control form-control-sm stored-search" id="stored-search-notifs" placeholder="Search message, name..." style="max-width: 280px;" /></div>';
    html += '<div class="table-responsive"><table class="table table-bordered table-sm stored-table" id="stored-notifs-table"><thead><tr><th>S.No</th><th>Message</th><th>Date</th></tr></thead><tbody>';
    notifs.forEach((n, idx) => {
      const at = n.at ? new Date(n.at).toLocaleString() : '—';
      html += '<tr data-search="' + escapeHtml((n.message || '') + ' ' + (n.assigneeName || '') + (n.assignedByName || '')).toLowerCase() + '"><td>' + (idx + 1) + '</td><td>' + escapeHtml(n.message || '') + '</td><td>' + at + '</td></tr>';
    });
    if (notifs.length === 0) html += '<tr><td colspan="3" class="text-muted text-center">No notifications yet</td></tr>';
    html += '</tbody></table></div>';

    container.innerHTML = html;

    function filterTable(inputId, tableId) {
      const input = document.getElementById(inputId);
      const table = document.getElementById(tableId);
      if (!input || !table) return;
      input.addEventListener('input', () => {
        const q = (input.value || '').trim().toLowerCase();
        table.querySelectorAll('tbody tr').forEach((tr) => {
          const search = tr.dataset.search;
          if (search === undefined) return;
          tr.style.display = !q || search.indexOf(q) !== -1 ? '' : 'none';
        });
      });
    }
    filterTable('stored-search-tasks', 'stored-tasks-table');
    filterTable('stored-search-upcoming', 'stored-upcoming-table');
    filterTable('stored-search-notifs', 'stored-notifs-table');
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
    const form = document.getElementById('cardForm');
    if (!form) return;
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
    if (assigneeNameGroup) assigneeNameGroup.style.display = 'none';
    if (deadlineGroup) deadlineGroup.style.display = 'block';
    if (deadlineInput) deadlineInput.value = '';
    if (assigneesChips) renderAssigneesChips(assigneesChips, [], () => {});
    if (assignedByInfo) assignedByInfo.style.display = 'none';
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

    const employeeModal = document.getElementById('employeeDetailsModal');
    if (employeeModal) employeeModal.addEventListener('hidden.bs.modal', onEmployeeModalHidden);

    document.querySelectorAll('.tab-link').forEach((a) => {
      a.addEventListener('click', (e) => {
        e.preventDefault();
        const tab = e.currentTarget.closest('.menu-item').dataset.tab;
        if (tab) switchTab(tab);
      });
    });

    const addUpcoming = document.getElementById('add-upcoming-task');
    if (addUpcoming) addUpcoming.addEventListener('click', () => { if (isManager()) openUpcomingTaskModal(); });
    const addDeptTasksBtn = document.getElementById('add-dept-tasks-btn');
    const tasksCreateDeptWrap = document.getElementById('tasks-create-dept-wrap');
    const tasksNewDeptName = document.getElementById('tasks-new-dept-name');
    const tasksNewDeptSave = document.getElementById('tasks-new-dept-save');
    const tasksNewDeptCancel = document.getElementById('tasks-new-dept-cancel');
    if (addDeptTasksBtn) {
      addDeptTasksBtn.addEventListener('click', () => {
        if (!isManager()) return;
        if (tasksCreateDeptWrap) tasksCreateDeptWrap.classList.remove('d-none');
        if (tasksNewDeptName) { tasksNewDeptName.value = ''; tasksNewDeptName.focus(); }
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
    if (refreshStored) refreshStored.addEventListener('click', () => { loadBoard().then(() => renderStoredDataView()); });
    const openCalBtn = document.getElementById('open-kanban-calendar-btn');
    if (openCalBtn) {
      openCalBtn.addEventListener('click', () => {
        renderKanbanCalendar();
        const calModal = document.getElementById('kanbanCalendarModal');
        if (calModal) new bootstrap.Modal(calModal).show();
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
      if (newColumnTitle) { newColumnTitle.value = ''; newColumnTitle.focus(); }
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
      if (newDeptName) { newDeptName.value = ''; newDeptName.focus(); }
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
      if (input) { input.value = ''; input.focus(); }
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
      function removeAssignee(n) {
        const list = getAssigneesFromChips().filter((x) => x !== n);
        renderAssigneesChips(container, list, removeAssignee);
      }
      renderAssigneesChips(container, current.concat(name), removeAssignee);
      if (input) input.value = '';
    });

    const btnLogout = document.getElementById('btn-logout');
    if (btnLogout) btnLogout.addEventListener('click', () => {
      localStorage.removeItem('kanban-current-user');
      showLoginPage();
    });
    document.getElementById('btn-load-demo-data')?.addEventListener('click', () => {
      loadDemoData();
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
