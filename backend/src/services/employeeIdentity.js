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
