/**
 * @license
 * SPDX-License-Identifier: Apache-2.5
 */

import React, { useState } from 'react';
import { jsPDF } from 'jspdf';
import {
  BriefcaseBusiness,
  CalendarDays,
  Download,
  Eye,
  FileCheck2,
  FileText,
  IdCard,
  MapPin,
  ShieldCheck,
  UserRound
} from 'lucide-react';

const formatDate = (value) => {
  if (!value) return 'Not recorded';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
};

const getYearsInService = (dateHired) => {
  if (!dateHired) return 'Not recorded';
  const start = new Date(dateHired);
  if (Number.isNaN(start.getTime())) return 'Not recorded';
  const years = (Date.now() - start.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
  return `${Math.max(0, years).toFixed(1)} years`;
};

const createPdf = (user, history) => {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  let y = 22;

  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('DILG WORKMATE', 20, y);
  y += 8;
  doc.setFontSize(12);
  doc.text('SERVICE RECORD SUMMARY', 20, y);
  y += 14;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`Full Name: ${user.name || 'Not recorded'}`, 20, y);
  y += 6;
  doc.text(`Employee ID: ${user.employeeId || 'Not recorded'}`, 20, y);
  y += 6;
  doc.text(`Position: ${user.role || 'Not recorded'}`, 20, y);
  y += 6;
  doc.text(`Office/Division: ${user.office || 'Not recorded'}`, 20, y);
  y += 6;
  doc.text(`Employment Status: ${user.employmentStatus || 'Active'}`, 20, y);
  y += 6;
  doc.text(`Date Hired: ${formatDate(user.dateHired)}`, 20, y);
  y += 6;
  doc.text(`Years in Service: ${getYearsInService(user.dateHired)}`, 20, y);
  y += 14;
  doc.setFont('helvetica', 'bold');
  doc.text('EMPLOYMENT HISTORY', 20, y);
  y += 8;
  doc.setFont('helvetica', 'normal');
  history.forEach((record) => {
    const line = `${record.position} | ${record.office} | ${record.inclusiveDates} | ${record.appointmentStatus}`;
    const lines = doc.splitTextToSize(line, pageWidth - 40);
    doc.text(lines, 20, y);
    y += lines.length * 6 + 2;
  });
  doc.setFontSize(8);
  doc.setTextColor(100);
  doc.text('This summary excludes 201 File documents and confidential attachments.', 20, 280);
  return doc;
};

export default function ServiceRecordsView({ user, onRequestCertifiedCopy }) {
  const [requestStatus, setRequestStatus] = useState('');
  const [requestingCopy, setRequestingCopy] = useState(false);
  const dateHired = user?.dateHired || user?.hiredDate;
  const history = user?.employmentHistory?.length
    ? user.employmentHistory
    : [{
        position: user?.role || 'Not recorded',
        office: user?.office || 'Not recorded',
        inclusiveDates: dateHired ? `${formatDate(dateHired)} - Present` : 'Not recorded',
        appointmentStatus: user?.appointmentStatus || 'Not recorded'
      }];

  const profileFields = [
    ['Full Name', user?.name, UserRound],
    ['Employee ID', user?.employeeId, IdCard],
    ['Position', user?.role, BriefcaseBusiness],
    ['Office/Division', user?.office, MapPin],
    ['Employment Status', user?.employmentStatus || 'Active', ShieldCheck],
    ['Date Hired', formatDate(dateHired), CalendarDays],
    ['Years in Service', getYearsInService(dateHired), FileText]
  ];

  const downloadPdf = () => {
    createPdf(user || {}, history).save(`${user?.employeeId || 'employee'}-service-record.pdf`);
  };

  const viewPdf = () => {
    const blobUrl = createPdf(user || {}, history).output('bloburl');
    window.open(blobUrl, '_blank', 'noopener,noreferrer');
  };

  const requestCertifiedCopy = async () => {
    if (!onRequestCertifiedCopy || requestingCopy) return;
    setRequestingCopy(true);
    setRequestStatus('');
    try {
      await onRequestCertifiedCopy({ employeeId: user?.employeeId || '', document: 'Service Record Summary' });
      setRequestStatus('Certified copy request submitted and saved.');
    } catch (error) {
      setRequestStatus(error.message || 'Unable to submit certified copy request.');
    } finally {
      setRequestingCopy(false);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto bg-slate-50/70 px-4 pb-32 pt-4 font-sans md:p-8 id-service-records-view">
      <div className="w-full space-y-5">
        <div className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#1e40af] text-white shadow-sm">
            <FileText className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-lg font-extrabold text-slate-900">Service Records</h1>
            <p className="mt-1 max-w-2xl text-xs font-semibold leading-relaxed text-slate-500">
              Official employment information and service history. Confidential 201 File documents are not shown here.
            </p>
          </div>
        </div>

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-4">
            <UserRound className="h-5 w-5 text-[#1e40af]" />
            <div>
              <h2 className="text-sm font-black uppercase tracking-wide text-slate-800">Employee Information</h2>
              <p className="mt-1 text-[11px] font-semibold text-slate-500">Current personnel data from the employee record.</p>
            </div>
          </div>
          <div className="grid gap-px bg-slate-100 sm:grid-cols-2 lg:grid-cols-4">
            {profileFields.map(([label, value, Icon]) => (
              <div key={label} className="bg-white p-4">
                <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wide text-slate-400">
                  <Icon className="h-4 w-4 text-[#1e40af]" />
                  {label}
                </div>
                <p className="mt-2 break-words text-sm font-bold text-slate-800">{value || 'Not recorded'}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-4">
            <BriefcaseBusiness className="h-5 w-5 text-[#1e40af]" />
            <div>
              <h2 className="text-sm font-black uppercase tracking-wide text-slate-800">Employment History</h2>
              <p className="mt-1 text-[11px] font-semibold text-slate-500">Appointments and assignments included in the official service record.</p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-left text-xs">
              <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-3 font-black">Position</th>
                  <th className="px-5 py-3 font-black">Office</th>
                  <th className="px-5 py-3 font-black">Inclusive Dates</th>
                  <th className="px-5 py-3 font-black">Appointment Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {history.map((record, index) => (
                  <tr key={`${record.position}-${index}`} className="text-slate-700">
                    <td className="px-5 py-4 font-bold">{record.position || 'Not recorded'}</td>
                    <td className="px-5 py-4 font-semibold">{record.office || 'Not recorded'}</td>
                    <td className="px-5 py-4 font-semibold">{record.inclusiveDates || 'Not recorded'}</td>
                    <td className="px-5 py-4"><span className="inline-flex rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-black text-emerald-700">{record.appointmentStatus || 'Not recorded'}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-3">
            <FileCheck2 className="h-5 w-5 text-[#1e40af]" />
            <h2 className="text-sm font-black uppercase tracking-wide text-slate-800">Actions</h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <button type="button" onClick={viewPdf} className="flex items-center justify-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-xs font-black text-blue-700 transition hover:bg-blue-100"><Eye className="h-4 w-4" /> View Full Service Record (PDF)</button>
            <button type="button" onClick={downloadPdf} className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs font-black text-slate-700 transition hover:bg-slate-100"><Download className="h-4 w-4" /> Download PDF</button>
            <button type="button" onClick={requestCertifiedCopy} disabled={requestingCopy} className="flex items-center justify-center gap-2 rounded-xl bg-[#1e40af] px-4 py-3 text-xs font-black text-white transition hover:bg-blue-800 disabled:cursor-wait disabled:opacity-60"><FileCheck2 className="h-4 w-4" /> {requestingCopy ? 'Submitting...' : 'Request Certified Copy'}</button>
          </div>
          {requestStatus && <p className="mt-4 rounded-lg bg-blue-50 px-3 py-2 text-xs font-bold text-blue-700">{requestStatus}</p>}
        </section>
      </div>
    </div>
  );
}
