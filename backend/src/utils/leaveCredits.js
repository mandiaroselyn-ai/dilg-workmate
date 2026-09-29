// Annual leave entitlement under CSC rules: 15 days vacation leave and 15 days sick leave.
export const DEFAULT_LEAVE_CREDITS = 15;

// Which credit balance an approved leave type is charged to. Mandatory/Forced Leave is
// charged to vacation leave. Other leave types (maternity, special privilege, and so on)
// have their own entitlements and are not deducted here.
export const leaveCreditField = leaveType => {
  const type = String(leaveType || '').toLowerCase();
  if (type.includes('sick')) return 'sickLeaveCredits';
  if (type.includes('vacation') || type.includes('mandatory') || type.includes('forced')) return 'vacationLeaveCredits';
  return null;
};

// Returns the deduction for a request that has just become Approved, or null when no
// credits should be deducted (not a leave request, already approved, or no chargeable days).
export const leaveCreditDeduction = (previous, updated) => {
  if (updated?.type !== 'Leave Request' || updated.status !== 'Approved' || previous?.status === 'Approved') return null;
  const field = leaveCreditField(updated.leaveType);
  const days = Number(updated.workingDays);
  if (!field || !Number.isFinite(days) || days <= 0) return null;
  return { field, days };
};
