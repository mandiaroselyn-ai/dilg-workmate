import { sendServerError } from '../middleware/requestSecurity.js';
import { DOWNLOAD_LINK_MINUTES, Download } from '../models/downloadModel.js';

// Types sent as themselves; anything else is sent as a plain download, so a file never opens
// as a page of the app.
const SERVED_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'text/csv'];
// Vercel takes at most 4.5 MB in a request and in a response, and the file goes up as base64
// (a third larger).
export const MAX_DOWNLOAD_BYTES = 3 * 1024 * 1024;

// A file name kept to characters every phone accepts, such as "DTR_JUAN_2026-10.pdf".
const safeFileName = value => String(value || '').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').trim().slice(0, 150) || 'document';

// Keeps a file the app made (such as a DTR) for a few minutes, for the WorkMate Android app
// to download it: { fileName, mimeType, data } with the file as base64. Returns its link.
export const createDownload = async (req, res) => {
  try {
    const { fileName, mimeType, data } = req.body || {};
    if (typeof data !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(data)) {
      return res.status(400).json({ success: false, error: 'The file to download is missing.' });
    }
    const bytes = Buffer.from(data, 'base64');
    if (bytes.length > MAX_DOWNLOAD_BYTES) {
      return res.status(413).json({ success: false, error: 'This file is too large to download in the app (3 MB at most). Download it from a computer instead.' });
    }
    const token = await Download.create({
      fileName: safeFileName(fileName),
      mimeType: SERVED_TYPES.includes(mimeType) ? mimeType : 'application/octet-stream',
      data: bytes,
      owner: req.user?.employeeId || req.user?.email || ''
    });
    res.status(201).json({ success: true, url: `/api/downloads?token=${token}`, expiresInMinutes: DOWNLOAD_LINK_MINUTES });
  } catch (error) {
    sendServerError(res, error);
  }
};

// Sends the file of a download link to the phone's download manager, which saves it in
// Downloads. The link is the only key, since the download manager sends no sign-in.
export const getDownload = async (req, res) => {
  try {
    const file = await Download.find(req.query?.token);
    if (!file) return res.status(404).type('text/plain').send('This download link has expired. Download the file again in WorkMate.');
    const asciiName = file.fileName.replace(/[^\x20-\x7e]/g, '_');
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(file.fileName)}`);
    res.setHeader('Cache-Control', 'no-store');
    res.send(Buffer.from(file.data));
  } catch (error) {
    sendServerError(res, error);
  }
};
