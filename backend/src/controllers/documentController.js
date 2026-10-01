import { EmployeeDocument } from '../models/employeeDocumentModel.js';
import { User } from '../models/User.js';
import { Announcement } from '../models/announcementModel.js';
import { sendServerError } from '../middleware/requestSecurity.js';
import { DOCUMENT_CATEGORIES } from '../../../shared/documentCatalog.js';
import {
  buildCertificateDecision,
  buildCertificateRequest,
  buildDocumentUpload,
  canDeleteDocument,
  canViewDocument
} from '../utils/documentRules.js';

// A failed notification never fails the change it is about.
const notify = async fields => {
  try {
    await Announcement.createNotification({ type: 'document', ...fields });
  } catch (error) {
    console.error('Unable to send a document notification:', error);
  }
};

const notifyEmployee = (doc, title, message) => notify({
  title,
  message,
  employeeId: doc.employeeId,
  employeeEmail: doc.employeeEmail
});

export const getDocuments = async (req, res) => {
  try {
    res.status(200).json(await EmployeeDocument.findFor(req.user));
  } catch (error) {
    sendServerError(res, error);
  }
};

// HR files a document for an employee (named by employeeId); an employee adds their own
// training certificate.
export const uploadDocument = async (req, res) => {
  try {
    const isHr = req.user?.accessLevel === 'hr_admin';
    let owner = req.user;
    if (isHr) {
      const employeeId = typeof req.body?.employeeId === 'string' ? req.body.employeeId.trim() : '';
      owner = employeeId ? await User.findByEmployeeId(employeeId) : null;
      // Older accounts saved without an access level are employees.
      if (!owner || (owner.accessLevel || 'employee') !== 'employee') {
        return res.status(404).json({ success: false, error: 'Choose an employee account to file the document for.' });
      }
    }
    const { document, error } = buildDocumentUpload(req.body, owner, req.user);
    if (error) return res.status(400).json({ success: false, error });
    const saved = await EmployeeDocument.create(document);
    if (isHr) {
      await notifyEmployee(saved, 'New Document in Your Records', `HR added "${saved.title}" to your ${DOCUMENT_CATEGORIES[saved.category].label}. Open Documents to view it.`);
    }
    res.status(201).json({ success: true, document: saved });
  } catch (error) {
    sendServerError(res, error);
  }
};

export const requestCertificate = async (req, res) => {
  try {
    const { document, error } = buildCertificateRequest(req.body, req.user);
    if (error) return res.status(400).json({ success: false, error });
    const saved = await EmployeeDocument.create(document);
    await notify({
      title: 'Certificate Requested',
      message: `${req.user.name || 'An employee'} requested a ${saved.docType}. Purpose: ${saved.purpose}`,
      recipientRole: 'hr_admin'
    });
    res.status(201).json({ success: true, document: saved });
  } catch (error) {
    sendServerError(res, error);
  }
};

// HR releases a requested certificate with the signed copy, or declines it.
export const answerCertificateRequest = async (req, res) => {
  try {
    const existing = await EmployeeDocument.findByCustomId(req.params.id);
    if (!existing) return res.status(404).json({ success: false, error: 'Document not found.' });
    const { update, error, conflict } = buildCertificateDecision(existing, req.body, req.user);
    if (error) return res.status(conflict ? 409 : 400).json({ success: false, error });
    const saved = await EmployeeDocument.update(existing.id, update);
    if (!saved) return res.status(404).json({ success: false, error: 'Document not found.' });
    if (saved.status === 'Released') {
      await notifyEmployee(saved, `${saved.docType} Ready`, `HR released your ${saved.docType}. Open Documents, then Certificates & Forms, to download it.`);
    } else {
      await notifyEmployee(saved, `${saved.docType} Request Declined`, `HR declined your ${saved.docType} request: ${saved.declineReason}`);
    }
    res.status(200).json({ success: true, document: saved });
  } catch (error) {
    sendServerError(res, error);
  }
};

export const getDocumentFile = async (req, res) => {
  try {
    const doc = await EmployeeDocument.findByCustomId(req.params.id, { withFile: true });
    if (!doc || !canViewDocument(doc, req.user)) return res.status(404).json({ success: false, error: 'Document not found.' });
    if (!doc.fileData) return res.status(404).json({ success: false, error: 'This document has no file yet.' });
    res.status(200).json({ success: true, fileName: doc.fileName, fileType: doc.fileType, dataUrl: doc.fileData });
  } catch (error) {
    sendServerError(res, error);
  }
};

export const deleteDocument = async (req, res) => {
  try {
    const doc = await EmployeeDocument.findByCustomId(req.params.id);
    if (!doc || !canViewDocument(doc, req.user)) return res.status(404).json({ success: false, error: 'Document not found.' });
    if (!canDeleteDocument(doc, req.user)) {
      return res.status(403).json({ success: false, error: 'Only HR can remove this document.' });
    }
    await EmployeeDocument.remove(doc.id);
    res.status(200).json({ success: true });
  } catch (error) {
    sendServerError(res, error);
  }
};
