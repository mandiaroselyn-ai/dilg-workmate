import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { PDFDocument } from 'pdf-lib';
import { MAX_SIGNED_PDF_BYTES } from '../../shared/signedForms.js';
import { consolidatedPdfFilename, fillConsolidatedPdf } from './consolidatedReportPdf.js';

const logos = ['../assets/dilg-seal.png', '../assets/Bagong_Pilipinas-logo.png'].map(path => readFileSync(new URL(path, import.meta.url)));
const row = (no, extra = {}) => ({ no, name: `Sample${no}, Alma B.`, position: 'LGOO VI', station: 'Provincial Office', vl: '12-15', sl: '', tardy: '30 min - October 5\n13 min - October 19', undertime: '', halfDay: '', remarks: 'SPL - 21\nCTO - 27-30', ...extra });
const consolidated = rows => ({ director: 'Pedro P. Penduko', vacant: '1', counts: { personnel: rows.length, male: 1, female: 1 }, rows });

test('the Consolidated Report of Attendance is a legal-size landscape PDF the PD signs above the name', async () => {
  const made = await fillConsolidatedPdf({ monthLabel: 'October 2026', consolidated: consolidated([row(1), row(2, { name: 'Peña, Ñora G.', remarks: '' })]), logos });
  const pdf = await PDFDocument.load(made.bytes);
  assert.equal(pdf.getPageCount(), 1);
  assert.deepEqual(pdf.getPage(0).getSize(), { width: 1008, height: 612 });
  assert.equal(made.pageIndex, 0);
  // The PD's signature, on the last page, above the name WorkMate printed from the accounts.
  assert.deepEqual(made.marks.map(mark => mark.type), ['signature']);
  const [signature] = made.marks;
  assert.ok(signature.bottom > 30 && signature.bottom + signature.height < 612);
  // With the two logos it stays well under the size a signed upload may have.
  assert.ok(made.bytes.length < MAX_SIGNED_PDF_BYTES / 2, `${made.bytes.length} bytes`);
  assert.equal(consolidatedPdfFilename('2026-10'), 'Consolidated_Report_of_Attendance_2026-10.pdf');
});

test('a long report runs to more pages, with the signature on the last; with no PD account, the signer is named', async () => {
  const rows = Array.from({ length: 40 }, (_, index) => row(index + 1));
  const made = await fillConsolidatedPdf({ monthLabel: 'October 2026', consolidated: { ...consolidated(rows), director: '' } });
  const pdf = await PDFDocument.load(made.bytes);
  assert.ok(pdf.getPageCount() > 1);
  assert.equal(made.pageIndex, pdf.getPageCount() - 1);
  assert.deepEqual(made.marks.map(mark => mark.type), ['signature', 'text']);
  assert.equal(made.marks[1].text, '{name}');
  // An empty report still has its certification to sign.
  const empty = await fillConsolidatedPdf({ monthLabel: 'October 2026', consolidated: consolidated([]) });
  assert.equal((await PDFDocument.load(empty.bytes)).getPageCount(), 1);
});
