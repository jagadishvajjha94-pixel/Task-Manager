# Assumptions – Task Management App (Jira-like)

## Role & Auth

- **Manager** = Dean/Manager login (`/api/auth/manager/login`). Only managers can update the board, list employee logins, and access manager-only UI (Tasks/Upcoming, Stored data, Manager tab).
- **Employee** = Employee login (`/api/auth/employee/login`). Manager-created logins may have `canCreateAndAssign` (elevated); standard employees are view-only for task completion and cannot edit tasks.
- **Role validation**: Backend enforces role via `X-User-Role` and `X-User-Id` headers on API calls. Frontend sends these from the current user after login. Production should use session/JWT instead of trusting client headers.

## API Enforcement

- `GET /api/board`: Returns full board for manager; for employee, `upcomingTasks` is stripped and notifications limited to last 10.
- `PUT /api/board`: Returns 403 unless `X-User-Role: manager`.
- `GET /api/auth/employees`: Returns 403 unless `X-User-Role: manager`.

## Accuracy & Recalculation

- Task accuracy and performance metrics use a single source: `computeEmployeeStats()` (from board columns + `completedAt`). No duplicate recalculation; redeploy/recalc is consistent.

## UI Restrictions

- **Mark done**: Only managers see the mark-done control; employees view status only.
- **Edit task**: Only managers and employees with create/assign rights can open the card edit modal and save; other employees only view task details.
- **Delete task**: Managers and employees with create/assign rights can delete tasks (assigned or uploaded) from the Tasks tab (Actions → Delete) or from the task edit modal. Other employees cannot delete.
- **Upcoming Tasks**: Shown to managers and employees with create/assign rights (Tasks tab); hidden for other employees.
- **Notifications**: Employees see last 5 (essential); managers see last 20.

## Due Time

- Due-time progress is (remaining time) / (deadline − assignedAt), 0–100%. Warning state when &lt; 20% remaining (visual highlight). Shown as circular progress on each task card.
