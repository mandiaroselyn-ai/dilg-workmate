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

// The Employee ID a deleted account's records are left under, such as
// "deleted:DILG-2026-123456:6650f0c2...": they stay in the database (RA 9470), still saying whose
// they were, but no account matches it, so a new account made again with the same email or
// Employee ID starts with no records.
export const deletedOwnerId = account => `deleted:${clean(account?.employeeId) || clean(account?.email).toLowerCase() || 'account'}:${clean(account?._id)}`;

// Leaves a deleted account's records (attendance, requests and its place among Travel Order
// companions, signed DTRs, travel reports, and overtime office orders) under deletedOwnerId.
// Returns a warning when they could not all be moved, or ''.
export const detachRecordsOfDeletedAccount = async account => {
  try {
    await carryRecordsToNewIdentity(account, { employeeId: deletedOwnerId(account), name: clean(account?.name) });
    return '';
  } catch (error) {
    console.error('Unable to set apart the records of a deleted account:', error);
    return 'The account was deleted, but some of its records could not be set apart, so they may show for a new account made with the same email or Employee ID.';
  }
};

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
