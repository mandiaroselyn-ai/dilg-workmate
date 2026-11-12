// The files the employees on a Travel Order attach once it is approved, as DILG Marinduque asked
// (2026-11-12): a Post Activity Report, or a Certificate of Appearance. Each employee on the
// Travel Order attaches their own and says which one it is. COA Circular No. 2012-001 (1.2.4.1)
// likewise asks a certificate of appearance or attendance for local travel, and COA Circular
// No. 96-004 a certificate of appearance or a report on the trip.

export const TRAVEL_DOCUMENTS = {
  report: { label: 'Post Activity Report' },
  certificate: { label: 'Certificate of Appearance' }
};

export const TRAVEL_DOCUMENT_KIND_REQUIRED = 'Choose what you are attaching: a Post Activity Report or a Certificate of Appearance.';

// Whether the employees on `request` may attach their files now: once the Travel Order is approved.
export const travelDocumentsOpen = request => request?.type === 'Travel Order' && request.status === 'Approved';

// A scan or photo of the report or certificate: a PDF, JPG, or PNG of 3 MB at most, and up to 10
// files for one Travel Order (its employees each attach their own).
export const TRAVEL_DOCUMENT_TYPES = { 'application/pdf': 'PDF', 'image/jpeg': 'JPG', 'image/png': 'PNG' };
export const MAX_TRAVEL_DOCUMENT_BYTES = 3 * 1024 * 1024;
export const MAX_TRAVEL_DOCUMENTS = 10;

// The file type `bytes` really are, from their first bytes, or '' when not one of the above.
export const sniffTravelDocumentType = bytes => {
  const b = bytes || [];
  if (b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46) return 'application/pdf';
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  return '';
};
