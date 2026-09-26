import React from 'react';
import { jsPDF } from 'jspdf';
import { X, Download, Printer } from 'lucide-react';
import dilgOfficialLogo from '../../src/assets/DILG-OG-LOGO.png';
import bagongPilipinasLogo from '../../src/assets/Bagong_Pilipinas-logo.png';

export default function TravelOrderPreview({ request, user, onClose }) {
  const submissionDate = request.submissionDate || new Date().toISOString().split('T')[0];
  const startDate = request.startDate;
  const destination = request.detailsSpecify && request.detailsSpecify !== 'N/A' ? request.detailsSpecify : '';
  const activity = (request.travelActivity || request.purpose || '').replace(/^Official Travel\.\s*/i, '');
  const time = request.travelTime || '';
  const venue = request.travelVenue || destination;
  const orderNo = request.orderNo || (request.id ? `2026-${request.id.replace(/\D/g, '').slice(-3).padStart(3, '0')}` : '');

  const dateText = (value) => value
    ? new Date(`${value}T00:00:00`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : '';
  const weekday = startDate
    ? new Date(`${startDate}T00:00:00`).toLocaleDateString('en-US', { weekday: 'long' })
    : '';

  const exportPDF = async () => {
    const imageData = async (source) => {
      const response = await fetch(source);
      const blob = await response.blob();
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    };
    const [dilgData, bagongData] = await Promise.all([imageData(dilgOfficialLogo), imageData(bagongPilipinasLogo)]);
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const center = 105;
    const left = 17;
    doc.addImage(dilgData, 'PNG', 74, 8, 22, 22);
    doc.addImage(bagongData, 'PNG', 99, 8, 26, 22);
    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text('Republic of the Philippines', center, 34, { align: 'center' });
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text('DEPARTMENT OF THE INTERIOR AND LOCAL GOVERNMENT', center, 40, { align: 'center' });
    doc.text(user.region || 'MIMAROPA REGION', center, 46, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.text('Province of Marinduque', center, 52, { align: 'center' });
    doc.text('Capitol Compound, Boac, Marinduque', center, 58, { align: 'center' });
    doc.setTextColor(0, 90, 170);
    doc.text('www.mimaropa.dilg.gov.ph', center, 64, { align: 'center' });
    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text('OFFICE OF THE PROVINCIAL DIRECTOR', center, 72, { align: 'center' });
    doc.setFontSize(10);
    doc.text('PROVINCIAL ORDER', left, 86);
    doc.text(`NO. ${orderNo}`, left, 93);
    const field = (label, value, y) => {
      doc.text(label, left, y);
      doc.text(':', left + 30, y);
      doc.text(value, left + 42, y);
    };
    field('TO', `${user.role || 'EMPLOYEE'} ${user.name || ''}`.toUpperCase(), 107);
    field('SUBJECT', activity.toUpperCase(), 118);
    field('DATE', dateText(submissionDate), 129);
    doc.setLineDashPattern([1, 1], 0);
    doc.line(left, 138, 193, 138);
    doc.setLineDashPattern([], 0);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    const body = `In the exigency of public service so requiring, the above mentioned personnel is hereby directed to attend the above-mentioned activity on ${dateText(startDate)} (${weekday}), from ${time}, at the ${venue}.`;
    doc.text(doc.splitTextToSize(body, 176), left, 148);
    doc.text('For your compliance and appropriate action.', left, 183);
    doc.setFont('helvetica', 'bold');
    doc.text(request.approver || 'IVAN STEPHEN F. FADRI, CESE', left, 202);
    doc.setFont('helvetica', 'normal');
    doc.text('Provincial Director', left, 208);
    doc.save(`${orderNo}_Provincial_Order.pdf`);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-900/80 p-2 sm:p-4">
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between bg-slate-900 px-4 py-3 text-white sm:px-6">
          <span className="text-xs font-extrabold uppercase tracking-wider">DILG Official Document Preview</span>
          <div className="flex items-center gap-2">
            <button onClick={() => window.print()} className="flex items-center gap-1 border-0 bg-transparent p-2 text-xs font-bold text-slate-300"><Printer className="h-4 w-4" /> Print</button>
            <button onClick={exportPDF} className="flex items-center gap-1 border-0 bg-blue-700 px-3 py-2 text-xs font-bold text-white"><Download className="h-4 w-4" /> Download PDF</button>
            <button onClick={onClose} className="border-0 bg-transparent p-2 text-slate-300"><X className="h-5 w-5" /></button>
          </div>
        </div>
        <div className="flex-1 overflow-auto bg-slate-100 p-2 sm:p-8">
          <div className="mx-auto min-h-[297mm] w-full max-w-[210mm] bg-white px-8 py-5 text-[10px] leading-tight text-black shadow-lg sm:px-16">
            <div className="flex h-20 items-start justify-center gap-3">
              <img src={dilgOfficialLogo} alt="DILG official logo" className="h-16 w-16 object-contain" />
              <img src={bagongPilipinasLogo} alt="Bagong Pilipinas logo" className="h-16 w-[72px] object-contain" />
            </div>
            <div className="text-center leading-tight">
              <p>Republic of the Philippines</p>
              <p className="font-black uppercase">Department of the Interior and Local Government</p>
              <p className="font-black uppercase">{user.region || 'MIMAROPA REGION'}</p>
              <p>Province of Marinduque</p>
              <p>Capitol Compound, Boac, Marinduque</p>
              <p className="text-blue-700 underline">www.mimaropa.dilg.gov.ph</p>
            </div>
            <p className="mt-5 text-center text-xs font-black uppercase">Office of the Provincial Director</p>
            <div className="mt-5 space-y-3 font-black uppercase">
              <p>PROVINCIAL ORDER</p>
              <p>NO. <span className="ml-6 font-normal">{orderNo}</span></p>
              <p>TO <span className="ml-8">:</span> <span className="font-normal">{user.role || 'EMPLOYEE'} {user.name || ''}</span></p>
              <p>SUBJECT <span className="ml-1">:</span> <span className="font-normal">{activity}</span></p>
              <p>DATE <span className="ml-4">:</span> <span className="font-normal">{dateText(submissionDate)}</span></p>
            </div>
            <div className="mt-4 border-t-2 border-dashed border-black pt-4 text-justify leading-snug">
              <p>In the exigency of public service so requiring, the above mentioned personnel is hereby directed to attend the above-mentioned activity on <strong>{dateText(startDate)}</strong> (<strong>{weekday}</strong>), from <strong>{time}</strong>, at the <strong>{venue}</strong>.</p>
              <p className="mt-3">For your compliance and appropriate action.</p>
            </div>
            <div className="mt-5 font-sans">
              {request.status === 'Approved' && <p className="ml-2 font-serif text-xl italic text-blue-900">G. Yap</p>}
              <p className="text-[10px] font-black uppercase">{request.approver || 'IVAN STEPHEN F. FADRI, CESE'}</p>
              <p className="text-[9px]">Provincial Director</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
