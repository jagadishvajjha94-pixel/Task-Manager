import { API_BASE } from '../config';

export function getAuthHeaders(user) {
  const headers = { 'Content-Type': 'application/json' };
  if (!user) return headers;
  const role = user.role === 'manager' ? 'manager' : 'employee';
  headers['X-User-Role'] = role;
  if (user.id) headers['X-User-Id'] = String(user.id);
  if (role === 'employee' && user.canCreateAndAssign) headers['X-Can-Edit-Board'] = 'true';
  return headers;
}

export async function loginManager(email, password) {
  const res = await fetch(`${API_BASE}/api/auth/manager/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: email.trim(), password }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Login failed');
  return data;
}

export async function loginEmployee(email, password) {
  const res = await fetch(`${API_BASE}/api/auth/employee/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: email.trim(), password }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Login failed');
  return data;
}

export async function getBoard(user) {
  const res = await fetch(`${API_BASE}/api/board`, {
    headers: getAuthHeaders(user),
  });
  if (!res.ok) throw new Error('Failed to load board');
  return res.json();
}

export async function saveBoard(user, board) {
  const res = await fetch(`${API_BASE}/api/board`, {
    method: 'PUT',
    headers: getAuthHeaders(user),
    body: JSON.stringify(board),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Failed to save');
  return data;
}
