// Helpers for the HR/Admin and Supervisor notification panel and Notifications page.

const lower = value => String(value || '').trim().toLowerCase();

// What a notification lets the reader do (review_account, reset_password,
// review_enrollment, review_request) and whom it is about, or null. Notifications saved
// before actions were recorded get one from their title and message where it is clear.
export const notificationAction = (notification = {}) => {
  if (notification.action && notification.targetId) {
    return { action: notification.action, targetId: notification.targetId };
  }
  const title = String(notification.title || '');
  const message = String(notification.message || '');
  const email = message.match(/\(([^()\s,]+@[^()\s,]+)[,)]/)?.[1];
  if (title === 'New Account Awaiting Approval' && email) return { action: 'review_account', targetId: email };
  if (title === 'Password Reset Requested' && email) return { action: 'reset_password', targetId: email };
  const submitted = title === 'New Request Submitted' && message.match(/\(Ref ([^)\s]+)\)/)?.[1];
  if (submitted) return { action: 'review_request', targetId: submitted };
  const forwarded = title === 'Request Ready for Review' && message.match(/(\S+) was validated by HR\/Admin/)?.[1];
  if (forwarded) return { action: 'review_request', targetId: forwarded };
  return null;
};

// The employee a notification is about, by employee ID or email.
export const findTargetEmployee = (employees = [], targetId) => {
  const key = lower(targetId);
  if (!key) return null;
  return employees.find(employee => lower(employee.employeeId) === key || lower(employee.email) === key) || null;
};

const timeOf = value => {
  const time = Date.parse(value || '');
  return Number.isFinite(time) ? time : null;
};

// True while the thing a notification asks for has not been done yet: the account is
// still Pending, the enrollment still waits for review, the request still waits for this
// reviewer, or the password has not been reset since the person asked.
export const isActionPending = (notification, { role = 'hr_admin', employees = [], requests = [] } = {}) => {
  const target = notificationAction(notification);
  if (!target) return false;
  if (target.action === 'review_request') {
    const request = requests.find(item => item.id === target.targetId);
    if (!request) return false;
    const status = request.status || 'Pending Review';
    return role === 'supervisor' ? status === 'For Supervisor' : ['Pending', 'Pending Review'].includes(status);
  }
  const employee = findTargetEmployee(employees, target.targetId);
  if (!employee) return false;
  if (target.action === 'review_account') return lower(employee.accountStatus) === 'pending';
  if (target.action === 'review_enrollment') return employee.biometricEnrollmentStatus === 'pending';
  if (target.action === 'reset_password') {
    const changed = timeOf(employee.passwordChangedAt);
    const asked = timeOf(notification.createdAt);
    return changed === null || (asked !== null && changed < asked);
  }
  return false;
};

// The button text for a notification's action, which changes once it has been done.
export const actionLabel = (action, pending) => ({
  review_account: pending ? 'Review account' : 'Open profile',
  reset_password: 'Open profile',
  review_enrollment: pending ? 'Review enrollment' : 'Open profile',
  review_request: pending ? 'Review request' : 'View request'
}[action] || '');

// Which icon and color a notification gets.
export const notificationKind = (notification = {}) => {
  const action = notificationAction(notification)?.action;
  const title = lower(notification.title);
  if (action === 'review_account') return 'account';
  if (action === 'reset_password') return 'password';
  if (action === 'review_enrollment' || notification.type === 'biometric_enrollment') return 'biometric';
  if (title.includes('withdrawn')) return 'withdrawn';
  if (notification.type === 'request' || action === 'review_request') return 'request';
  if (notification.type === 'announcement') return 'announcement';
  if (notification.type === 'attendance') return 'attendance';
  if (title.includes('sms')) return 'sms';
  if (notification.type === 'employee_management') return 'people';
  return 'system';
};

const startOfDay = time => {
  const date = new Date(time);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
};

// 'Today', 'Yesterday', or 'Earlier', in the viewer's time zone.
export const dayGroup = (time, now = Date.now()) => {
  if (time === null) return 'Earlier';
  const days = Math.round((startOfDay(now) - startOfDay(time)) / 86400000);
  if (days <= 0) return 'Today';
  return days === 1 ? 'Yesterday' : 'Earlier';
};

// When a notification arrived: "5 min ago" or "2 hr ago" today, the time yesterday, and
// the date before that. Notifications without a saved time show their old label.
export const notificationWhen = (notification = {}, now = Date.now()) => {
  const time = timeOf(notification.createdAt);
  if (time === null) return notification.time || '';
  const minutes = Math.floor((now - time) / 60000);
  const group = dayGroup(time, now);
  if (group === 'Today') {
    if (minutes < 1) return 'Just now';
    return minutes < 60 ? `${minutes} min ago` : `${Math.floor(minutes / 60)} hr ago`;
  }
  if (group === 'Yesterday') return new Date(time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return new Date(time).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

// The notifications shown for a tab ('all', 'unread', or 'action') and search text, in
// sections: 'Needs action' first, then Today, Yesterday, and Earlier, newest first. Each
// item carries `pending` and its action ({ action, targetId } or null).
export const notificationSections = (notifications = [], { tab = 'all', query = '', context = {}, now = Date.now() } = {}) => {
  const search = lower(query);
  const items = notifications
    .map(notification => ({
      notification,
      target: notificationAction(notification),
      pending: isActionPending(notification, context),
      time: timeOf(notification.createdAt)
    }))
    .filter(item => tab === 'all' || (tab === 'unread' ? !item.notification.read : item.pending))
    .filter(item => !search || lower(`${item.notification.title} ${item.notification.message}`).includes(search))
    .sort((a, b) => (b.time ?? 0) - (a.time ?? 0));
  const sections = [{ label: 'Needs action', items: items.filter(item => item.pending) }];
  for (const label of ['Today', 'Yesterday', 'Earlier']) {
    sections.push({ label, items: items.filter(item => !item.pending && dayGroup(item.time, now) === label) });
  }
  return sections.filter(section => section.items.length > 0);
};

// How many notifications each tab holds.
export const notificationCounts = (notifications = [], context = {}) => ({
  all: notifications.length,
  unread: notifications.filter(notification => !notification.read).length,
  action: notifications.filter(notification => isActionPending(notification, context)).length
});
