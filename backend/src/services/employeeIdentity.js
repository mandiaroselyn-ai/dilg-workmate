import { DtrLog } from '../models/dtrLogModel.js';
import { DtrSubmission } from '../models/dtrSubmissionModel.js';
import { Leave } from '../models/leaveModel.js';
import { OvertimeOrder } from '../models/overtimeOrderModel.js';
import { TravelDocument } from '../models/travelDocumentModel.js';

const clean = value => String(value ?? '').trim();

// When an account's name or Employee ID changes (HR's Edit, or the employee's own Profile), its
// records go with it: attendance, leave and Travel Order requests (and its place among a Travel
// Order's companions), signed DTRs, travel reports and certificates, and overtime office orders.
// A record is matched to an account by Employee ID and name (see utils/recordOwner.js), so a
// record left with the old name or ID would no longer show for the employee, in HR's pages, or in
// the DTR and leave credits. `before` and `after` are the account before and after the change.
// Returns how many records moved, or null when nothing that matters changed.
export const carryRecordsToNewIdentity = async (before, after) => {
  const owner = { employeeId: clean(before?.employeeId), email: clean(before?.email).toLowerCase(), name: clean(before?.name) };
  const nextId = clean(after?.employeeId);
  const nextName = clean(after?.name);
  const changes = {
    ...(nextId && nextId !== owner.employeeId ? { employeeId: nextId } : {}),
    ...(nextName && nextName !== owner.name ? { name: nextName } : {})
  };
  if (!Object.keys(changes).length || (!owner.employeeId && !owner.email)) return null;
  const counts = await Promise.all([
    DtrLog.reassignOwner(owner, changes),
    Leave.reassignOwner(owner, changes),
    DtrSubmission.reassignOwner(owner, changes),
    TravelDocument.reassignOwner(owner, changes),
    changes.employeeId ? OvertimeOrder.replaceEmployeeId(owner.employeeId, changes.employeeId) : 0
  ]);
  return counts.reduce((total, count) => total + (Number(count) || 0), 0);
};

// True when the account has any attendance record, request (filed, or on another's Travel Order),
// or signed DTR. HR's pages and reports show only the records of current employee accounts, so
// deleting such an account would hide its DTR and leave history; it is kept Inactive instead.
export const hasOwnRecords = async account => {
  const owner = { employeeId: clean(account?.employeeId), email: clean(account?.email).toLowerCase(), name: clean(account?.name) };
  if (!owner.employeeId && !owner.email) return false;
  const found = await Promise.all([DtrLog.hasOwnRecords(owner), Leave.hasOwnRecords(owner), DtrSubmission.hasOwnRecords(owner)]);
  return found.some(Boolean);
};

export const KEEP_ACCOUNT_WITH_RECORDS = 'This employee has attendance or request records, so the account cannot be deleted: their DTR and leave history would no longer show in HR\'s pages and reports. Keep the account Inactive instead; it cannot log in, and their records stay.';

// What to tell HR or the employee when the account was saved but its records could not be moved.
// Saving again changes nothing (the account already has the new name or ID), so moving them is
// retried by changing it back, saving, and changing it again.
export const RECORDS_NOT_MOVED = 'The account was saved, but its earlier attendance and requests could not be moved to the new name or Employee ID. Change it back, save, then change it again to retry.';

// Runs carryRecordsToNewIdentity for a save that already succeeded: returns a warning to show
// when moving the records failed, or '' (the account itself stays saved).
export const carryRecordsOrWarn = async (before, after) => {
  try {
    await carryRecordsToNewIdentity(before, after);
    return '';
  } catch (error) {
    console.error('Unable to move records to the new name or Employee ID:', error);
    return RECORDS_NOT_MOVED;
  }
};
