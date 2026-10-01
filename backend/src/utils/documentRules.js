import { getManilaDateString } from '../../../shared/localDate.js';
import {
  CERTIFICATE_TYPES,
  DOCUMENT_CATEGORIES,
  DOCUMENT_FILE_TYPES,
  EMPLOYEE_UPLOAD_CATEGORIES,
  HR_UPLOAD_CATEGORIES,
  MAX_DOCUMENT_BYTES
} from '../../../shared/documentCatalog.js';

// The first bytes of each allowed file type, so a file is what its type says it is. The
// app opens documents in the browser, so nothing else (such as a web page) may be stored.
const FILE_SIGNATURES = {
  'application/pdf': [0x25, 0x50, 0x44, 0x46],
  'image/png': [0x89, 0x50, 0x4e, 0x47],
  'image/jpeg': [0xff, 0xd8, 0xff]
};
const FILE_EXTENSIONS = { 'application/pdf': 'pdf', 'image/png': 'png', 'image/jpeg': 'jpg' };

const text = (value, max) => (typeof value === 'string' ? value.trim().slice(0, max) : '');
const dateText = value => (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : '');

const ownerFields = account => ({
  employeeId: account?.employeeId || '',
  employeeEmail: account?.email?.toString().trim().toLowerCase() || '',
  employeeName: account?.name || ''
});

// Reads an uploaded file ({ name, dataUrl }). Returns { file } with the fields saved on the
// document, or { error } when it is missing, too large, or not a PDF, JPEG, or PNG.
export const parseDocumentFile = upload => {
  const match = typeof upload?.dataUrl === 'string'
    && /^data:([\w/+.-]+);base64,([A-Za-z0-9+/]*={0,2})$/.exec(upload.dataUrl);
  if (!match) return { error: 'Attach the document as a PDF, JPEG, or PNG file.' };
  const [, fileType, base64] = match;
  if (!DOCUMENT_FILE_TYPES.includes(fileType)) return { error: 'Only PDF, JPEG, and PNG files can be uploaded.' };
  const bytes = Buffer.from(base64, 'base64');
  if (!bytes.length) return { error: 'The attached file is empty.' };
  if (bytes.length > MAX_DOCUMENT_BYTES) {
    return { error: `The file is larger than ${MAX_DOCUMENT_BYTES / 1024 / 1024} MB. Scan it at a lower resolution and try again.` };
  }
  if (!FILE_SIGNATURES[fileType].every((byte, index) => bytes[index] === byte)) {
    return { error: 'The file does not match its type. Upload the original PDF, JPEG, or PNG.' };
  }
  const name = String(upload.name || '').split(/[\\/]/).pop().replace(/[\u0000-\u001f\u007f]/g, '');
  return {
    file: {
      fileName: text(name, 120) || `document.${FILE_EXTENSIONS[fileType]}`,
      fileType,
      fileSize: bytes.length,
      fileData: upload.dataUrl
    }
  };
};

// Builds a document uploaded for `owner`. HR files 201, performance, and training
// documents for any employee; an employee adds only their own training certificates.
export const buildDocumentUpload = (body, owner, uploader) => {
  const isHr = uploader?.accessLevel === 'hr_admin';
  const allowed = isHr ? HR_UPLOAD_CATEGORIES : EMPLOYEE_UPLOAD_CATEGORIES;
  const category = body?.category;
  if (!allowed.includes(category)) {
    return { error: isHr ? 'Choose the 201 File, performance, or training category.' : 'You can only add your own training certificates.' };
  }
  const docType = text(body.docType, 80);
  if (!DOCUMENT_CATEGORIES[category].types.includes(docType)) return { error: 'Choose the document type.' };
  const { file, error } = parseDocumentFile(body.file);
  if (error) return { error };
  return {
    document: {
      ...ownerFields(owner),
      category,
      docType,
      title: text(body.title, 120) || docType,
      documentDate: dateText(body.documentDate),
      notes: text(body.notes, 500),
      status: 'Filed',
      uploadedBy: uploader.name || (isHr ? 'HR/Admin' : 'Employee'),
      uploadedByRole: isHr ? 'hr_admin' : 'employee',
      ...file
    }
  };
};

// Builds an employee's request for one of the certificates HR issues.
export const buildCertificateRequest = (body, user, today = getManilaDateString()) => {
  const docType = text(body?.docType, 80);
  if (!CERTIFICATE_TYPES.includes(docType)) return { error: 'Choose the certificate to request.' };
  const purpose = text(body.purpose, 500);
  if (!purpose) return { error: 'Say what the certificate is for (for example, a loan or a scholarship).' };
  return {
    document: {
      ...ownerFields(user),
      category: 'certificate',
      docType,
      title: docType,
      purpose,
      documentDate: today,
      status: 'Requested',
      uploadedBy: '',
      uploadedByRole: ''
    }
  };
};

// HR's answer to a certificate request: release it with the signed copy, or decline it
// with a reason. A request can be answered only once.
export const buildCertificateDecision = (existing, body, hrUser, today = getManilaDateString()) => {
  if (existing?.category !== 'certificate' || existing.status !== 'Requested') {
    return { error: 'This certificate request was already answered.', conflict: true };
  }
  const answer = { answeredAt: new Date(), answeredBy: hrUser?.name || 'HR/Admin' };
  if (body?.action === 'release') {
    const { file, error } = parseDocumentFile(body.file);
    if (error) return { error };
    return {
      update: {
        ...answer,
        ...file,
        status: 'Released',
        notes: text(body.notes, 500),
        documentDate: today,
        uploadedBy: answer.answeredBy,
        uploadedByRole: 'hr_admin'
      }
    };
  }
  if (body?.action === 'decline') {
    const reason = text(body.reason, 500);
    if (!reason) return { error: 'Give the reason for declining, so the employee knows what to do next.' };
    return { update: { ...answer, status: 'Declined', declineReason: reason } };
  }
  return { error: 'Choose to release or decline the request.' };
};

export const isDocumentOwner = (doc, user) => Boolean(
  (user?.employeeId && doc?.employeeId === user.employeeId)
  || (user?.email && doc?.employeeEmail === user.email.toLowerCase())
);

// HR sees every employee's documents; an employee sees only their own. Supervisors do not
// handle personnel files.
export const canViewDocument = (doc, user) => user?.accessLevel === 'hr_admin'
  || (user?.accessLevel === 'employee' && isDocumentOwner(doc, user));

// HR may remove any document. An employee may remove a training certificate they added
// themselves, or cancel a certificate request HR has not answered yet.
export const canDeleteDocument = (doc, user) => {
  if (user?.accessLevel === 'hr_admin') return true;
  if (user?.accessLevel !== 'employee' || !isDocumentOwner(doc, user)) return false;
  return doc.uploadedByRole === 'employee' || (doc.category === 'certificate' && doc.status === 'Requested');
};
