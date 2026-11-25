// The records one account owns in a collection, for moving them to the account's new name or
// Employee ID (see services/employeeIdentity.js). WorkMate matches a record to an account by its
// Employee ID and its name, since accounts made long ago could share the old default ID
// (DILG-2026-7689) and only their names told them apart. So a record is the account's when it has
// the account's old Employee ID (or, for an account with none, its email) and either the
// account's old name or no name. `fields` names the record's owner fields.

const escapeRegExp = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const exactly = value => new RegExp(`^\\s*${escapeRegExp(value.trim())}\\s*$`, 'i');

export const ownRecordsFilter = ({ employeeId = '', email = '', name = '' } = {}, {
  idField = 'employeeId',
  emailField = 'employeeEmail',
  nameField = 'employeeName'
} = {}) => {
  const owner = employeeId ? { [idField]: employeeId } : email ? { [emailField]: exactly(email) } : null;
  if (!owner) return null;
  if (!name) return owner;
  return { ...owner, $or: [{ [nameField]: exactly(name) }, { [nameField]: { $in: ['', null] } }] };
};

// How one account's own records are found, as `$or` choices: by its Employee ID, and by its email
// only for records with no Employee ID (made by an account that had none). A record with another
// Employee ID is not the account's, though its email is the same: it belongs to an earlier account
// with that email, deleted since. This matches how HR's pages tell records apart (Employee ID
// first, see src/utils/attendanceIdentity.js).
export const ownByIdOrEmail = ({ employeeId = '', email = '' } = {}, { idField = 'employeeId', emailField = 'employeeEmail' } = {}) => [
  ...(employeeId ? [{ [idField]: employeeId }] : []),
  ...(email ? [employeeId ? { [emailField]: email, [idField]: { $in: ['', null] } } : { [emailField]: email }] : [])
];

// The `$set` for a record's owner fields: the new Employee ID and name that changed.
export const ownerChanges = ({ employeeId, name } = {}, { idField = 'employeeId', nameField = 'employeeName' } = {}) => ({
  ...(employeeId ? { [idField]: employeeId } : {}),
  ...(name ? { [nameField]: name } : {})
});

export { exactly as exactTextPattern };
