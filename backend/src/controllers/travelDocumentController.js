import { randomUUID } from 'node:crypto';
import { Leave } from '../models/leaveModel.js';
import { TravelDocument, travelDocumentNote } from '../models/travelDocumentModel.js';
import { Announcement } from '../models/announcementModel.js';
import { sendServerError } from '../middleware/requestSecurity.js';
import { travelOrderCovers } from '../../../shared/travelStatus.js';
import {
  MAX_TRAVEL_DOCUMENTS,
  MAX_TRAVEL_DOCUMENT_BYTES,
  TRAVEL_DOCUMENTS,
  TRAVEL_DOCUMENT_KIND_REQUIRED,
  TRAVEL_DOCUMENT_TYPES,
  sniffTravelDocumentType,
  travelDocumentsOpen
} from '../../../shared/travelDocuments.js';

// The Post Activity Report or Certificate of Appearance the employees on a Travel Order attach
// once it is approved (shared/travelDocuments.js). The filer and each employee they included
// attach their own and say which one it is; HR and the Supervisor see them all. One path, so it
// works on Vercel without a rewrite: GET ?ref=&id= sends one file, POST uploads one,
// DELETE ?ref=&id= removes one the employee uploaded.

const safeFileName = value => String(value || '').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').trim().slice(0, 150) || 'document';
const isReviewer = user => ['hr_admin', 'supervisor'].includes(user?.accessLevel);
const findTravelOrder = async ref => {
  const request = ref ? await Leave.findByCustomId(ref) : null;
  return request?.type === 'Travel Order' ? request : null;
};
const sameId = (a, b) => Boolean(a) && Boolean(b) && String(a).trim().toLowerCase() === String(b).trim().toLowerCase();

// The uploaded file's bytes and type, from base64 (a data: link is fine too), or { error }.
const readUpload = data => {
  const base64 = typeof data === 'string' ? data.replace(/^data:[^,]*,/, '') : '';
  if (!base64 || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) return { error: 'Choose the file to upload.' };
  const bytes = Buffer.from(base64, 'base64');
  if (bytes.length > MAX_TRAVEL_DOCUMENT_BYTES) return { error: 'The file is too large (3 MB at most). Scan or photograph it at a lower resolution, then upload it again.' };
  const mimeType = sniffTravelDocumentType(bytes);
  if (!TRAVEL_DOCUMENT_TYPES[mimeType]) return { error: 'Upload a PDF, JPG, or PNG file.' };
  return { bytes, mimeType };
};

export const getTravelDocument = async (req, res) => {
  try {
    const ref = String(req.query.ref || '');
    const id = String(req.query.id || '');
    if (!ref || !id) return res.status(400).json({ success: false, error: 'Choose a document.' });
    const request = await findTravelOrder(ref);
    const mayView = request && (isReviewer(req.user) || (req.user?.accessLevel === 'employee' && travelOrderCovers(request, req.user)));
    const document = mayView ? await TravelDocument.find(ref, id) : null;
    if (!document) return res.status(404).json({ success: false, error: 'Document not found.' });
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({ success: true, document: { ...travelDocumentNote(document), data: document.data.toString('base64') } });
  } catch (error) {
    sendServerError(res, error);
  }
};

// POST { ref, kind ('report' or 'certificate'), fileName, data (base64) }. Returns the Travel
// Order with its notes.
export const uploadTravelDocument = async (req, res) => {
  try {
    if (req.user?.accessLevel !== 'employee') return res.status(403).json({ success: false, error: 'Only the employees on the Travel Order attach its report or certificate.' });
    const ref = String(req.body?.ref || '');
    const request = await findTravelOrder(ref);
    if (!request) return res.status(404).json({ success: false, error: 'Travel Order not found.' });
    if (!travelOrderCovers(request, req.user)) return res.status(403).json({ success: false, error: 'Only the employees on this Travel Order attach its report or certificate.' });
    if (!travelDocumentsOpen(request)) {
      return res.status(409).json({ success: false, error: 'Attach the report or certificate once the Travel Order is approved.' });
    }
    const kind = TRAVEL_DOCUMENTS[req.body?.kind] ? req.body.kind : null;
    if (!kind) return res.status(400).json({ success: false, error: TRAVEL_DOCUMENT_KIND_REQUIRED });
    if ((request.travelDocuments || []).length >= MAX_TRAVEL_DOCUMENTS) {
      return res.status(409).json({ success: false, error: `A Travel Order can have up to ${MAX_TRAVEL_DOCUMENTS} uploaded files.` });
    }
    const upload = readUpload(req.body?.data);
    if (upload.error) return res.status(400).json({ success: false, error: upload.error });

    const documentId = randomUUID();
    const uploadedBy = { employeeId: req.user.employeeId || '', name: req.user.name || '', email: req.user.email || '' };
    const fileName = safeFileName(req.body?.fileName);
    await TravelDocument.save({ documentId, ref, kind, fileName, mimeType: upload.mimeType, bytes: upload.bytes, uploadedBy });
    const note = travelDocumentNote({ documentId, kind, fileName, mimeType: upload.mimeType, size: upload.bytes.length, uploadedBy, uploadedAt: new Date() });
    const updated = await Leave.addTravelDocument(ref, note, MAX_TRAVEL_DOCUMENTS);
    if (!updated) {
      await TravelDocument.remove(ref, documentId);
      return res.status(409).json({ success: false, error: `A Travel Order can have up to ${MAX_TRAVEL_DOCUMENTS} uploaded files.` });
    }
    // HR keeps the reports and certificates. A failed notice never fails the upload.
    await Announcement.createNotification({
      title: `Travel Order ${TRAVEL_DOCUMENTS[kind].label} Submitted`,
      message: `${req.user.name || 'An employee'} attached a ${TRAVEL_DOCUMENTS[kind].label} to Travel Order ${ref}${request.travelActivity ? ` (${request.travelActivity})` : ''}.`,
      type: 'travel_document',
      recipientRole: 'hr_admin',
      action: 'review_request',
      targetId: ref
    }).catch(error => console.error('Unable to notify HR about a travel order document:', error));
    res.status(201).json({ success: true, request: updated });
  } catch (error) {
    sendServerError(res, error);
  }
};

// DELETE ?ref=&id=: the employee who uploaded a file removes it (for example, the wrong one).
export const removeTravelDocument = async (req, res) => {
  try {
    const ref = String(req.query.ref || '');
    const id = String(req.query.id || '');
    const request = await findTravelOrder(ref);
    const note = (request?.travelDocuments || []).find(item => item?.id === id);
    if (!note) return res.status(404).json({ success: false, error: 'Document not found.' });
    if (req.user?.accessLevel !== 'employee' || !sameId(note.uploadedByEmployeeId, req.user.employeeId)) {
      return res.status(403).json({ success: false, error: 'Only the employee who uploaded this file removes it.' });
    }
    const updated = await Leave.removeTravelDocument(ref, id);
    await TravelDocument.remove(ref, id);
    res.status(200).json({ success: true, request: updated });
  } catch (error) {
    sendServerError(res, error);
  }
};
