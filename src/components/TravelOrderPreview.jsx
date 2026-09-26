/**
 * @license
 * SPDX-License-Identifier: Apache-2.5
 */

import React, { useEffect, useRef, useState } from 'react';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { jsPDF } from 'jspdf';
import { X, Download, Printer, FileCheck } from 'lucide-react';
import dilgLogo from '../assets/logo-form.png';
import dilgOfficialLogo from '../assets/DILG-OG-LOGO.png';
import bagongPilipinasLogo from '../assets/Bagong_Pilipinas-logo.png';

export default function TravelOrderPreview({ request, user, onClose }) {
  const printRef = useRef(null);
  const showOfficialForm = false;
  const [filledFormUrl, setFilledFormUrl] = useState(null);

  const submissionDateStr = request.submissionDate || new Date().toISOString().split('T')[0];
  const startDateStr = request.startDate;
  const endDateStr = request.endDate;
  const destinationStr = request.detailsSpecify && request.detailsSpecify !== 'N/A' ? request.detailsSpecify : '';
  const fundingSource = request.detailsType || 'Provincial Operations Funds';
  const activityStr = (request.travelActivity || request.purpose || 'Official government activity')
    .replace(/^Official Travel\.\s*/i, '');
  const timeStr = request.travelTime || '';
  const venueStr = request.travelVenue || destinationStr;

  // Extract clean purpose details (strip "Official Travel." prefix if present)
  let cleanPurpose = request.purpose || '';
  if (cleanPurpose.startsWith('Official Travel.')) {
    cleanPurpose = cleanPurpose.replace(/^Official Travel\.\s*/i, '');
  }

  const orderNo = request.orderNo || (request.id ? `2026-${request.id.replace(/\D/g, '').slice(-3).padStart(3, '0')}` : '');

  const formatFormDate = (dateValue) => {
    if (!dateValue) return '';
    return new Date(`${dateValue}T00:00:00`).toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    });
  };

  useEffect(() => {
    setFilledFormUrl(null);
  }, []);

  const handlePrint = () => {
    window.print();
  };

  const exportPDF = () => {
    const imageToDataUrl = async (source) => {
      const blob = await fetch(source).then((response) => response.blob());
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    };

    const exportTravelOrder = async () => {
      const [dilgDataUrl, bagongDataUrl] = await Promise.all([
        imageToDataUrl(dilgOfficialLogo),
        imageToDataUrl(bagongPilipinasLogo)
      ]);
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const center = 105;
      const left = 17;
      doc.addImage(dilgDataUrl, 'PNG', 74, 8, 22, 22);
      doc.addImage(bagongDataUrl, 'PNG', 99, 8, 26, 22);
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
      field('SUBJECT', activityStr.toUpperCase(), 118);
      field('DATE', formatFormDate(submissionDateStr), 129);
      doc.setLineDashPattern([1, 1], 0);
      doc.line(left, 138, 193, 138);
      doc.setLineDashPattern([], 0);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      const weekday = startDateStr
        ? new Date(`${startDateStr}T00:00:00`).toLocaleDateString('en-US', { weekday: 'long' })
        : '';
      const body = `In the exigency of public service so requiring, the above mentioned personnel is hereby directed to attend the above-mentioned activity on ${formatFormDate(startDateStr)} (${weekday}), from ${timeStr}, at the ${venueStr}.`;
      doc.text(doc.splitTextToSize(body, 176), left, 148);
      doc.text('For your compliance and appropriate action.', left, 183);
      doc.setFont('helvetica', 'bold');
      doc.text(request.approver || 'IVAN STEPHEN F. FADRI, CESE', left, 202);
      doc.setFont('helvetica', 'normal');
      doc.text('Provincial Director', left, 208);
      doc.setFont('helvetica', 'bold');
      doc.text('“Matino, Mahusay at Maaasahan”', center, 284, { align: 'center' });
      doc.setFont('helvetica', 'normal');
      doc.text('Telephone Number (042) 754-5881', center, 289, { align: 'center' });
      doc.save(`${orderNo}_Provincial_Order.pdf`);
    };

    exportTravelOrder().catch(() => window.print());
    return;

    if (filledFormUrl) {
      const downloadLink = document.createElement('a');
      downloadLink.href = filledFormUrl;
      downloadLink.download = `${orderNo}_Provincial_Order.pdf`;
      downloadLink.click();
      return;
    }

    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageWidth = 210;
    const left = 24;
    const right = 186;

    doc.setDrawColor(180, 180, 180);
    doc.setLineWidth(0.25);
    doc.rect(12, 10, 186, 277);
    doc.setFont('times', 'normal');
    doc.setFontSize(9);
    doc.text('Republic of the Philippines', pageWidth / 2, 24, { align: 'center' });
    doc.setFont('times', 'bold');
    doc.setFontSize(10);
    doc.text('DEPARTMENT OF THE INTERIOR AND LOCAL GOVERNMENT', pageWidth / 2, 29, { align: 'center' });
    doc.setTextColor(30, 64, 175);
    doc.text(user.region || 'MIMAROPA REGION', pageWidth / 2, 34, { align: 'center' });
    doc.setTextColor(30, 41, 59);
    doc.setFontSize(9);
    doc.text(user.office || 'Provincial Office of Marinduque', pageWidth / 2, 39, { align: 'center' });
    doc.setFont('times', 'normal');
    doc.setFontSize(8);
    doc.text('Capitol Compound, Boac, Marinduque', pageWidth / 2, 44, { align: 'center' });

    doc.setFont('times', 'bold');
    doc.setFontSize(13);
    doc.text('OFFICE OF THE PROVINCIAL DIRECTOR', pageWidth / 2, 58, { align: 'center' });
    doc.setFontSize(10);
    doc.text('PROVINCIAL ORDER', left, 69);
    doc.text(`NO. ${orderNo}`, left, 74);

    doc.setFontSize(10);
    doc.text('TO', left, 88);
    doc.text(':', left + 18, 88);
    doc.text(`${user.role || 'EMPLOYEE'} ${user.name}`, left + 26, 88);
    doc.text('SUBJECT', left, 99);
    doc.text(':', left + 18, 99);
    const subjectLines = doc.splitTextToSize(cleanPurpose.toUpperCase(), right - left - 26);
    doc.text(subjectLines, left + 26, 99);
    const dateY = 99 + (subjectLines.length * 5) + 7;
    doc.text('DATE', left, dateY);
    doc.text(':', left + 18, dateY);
    doc.text(submissionDateStr, left + 26, dateY);
    doc.setLineWidth(0.5);
    doc.line(left, dateY + 9, right, dateY + 9);

    doc.setFont('times', 'normal');
    doc.setFontSize(10);
    const activityDate = formatFormDate(startDateStr);
    const weekday = startDateStr
      ? new Date(`${startDateStr}T00:00:00`).toLocaleDateString('en-US', { weekday: 'long' })
      : '';
    const venueText = venueStr || destinationStr;
    const body = `In the exigency of public service so requiring, the above-mentioned personnel is hereby directed to attend the above-mentioned activity on ${activityDate} (${weekday}), from ${timeStr}, at the ${venueText}.`;
    doc.text(doc.splitTextToSize(body, right - left), left, dateY + 19);
    doc.text('For compliance and appropriate action.', left, dateY + 59);

    const signatureY = dateY + 83;
    if (request.status === 'Approved') {
      doc.setTextColor(30, 64, 175);
      doc.setFont('courier', 'italic');
      doc.setFontSize(15);
      doc.text('G. Yap', left, signatureY);
      doc.setTextColor(30, 41, 59);
    }
    doc.setFont('times', 'bold');
    doc.setFontSize(10);
    doc.text(request.approver || 'GERMAN F. YAP, CESO V', left, signatureY + 7);
    doc.setFont('times', 'normal');
    doc.setFontSize(9);
    doc.text('Provincial Director', left, signatureY + 12);
    doc.setFontSize(7);
    doc.text(user.office || 'Provincial Office of Marinduque', pageWidth / 2, 278, { align: 'center' });
    doc.save(`${orderNo}_Provincial_Order.pdf`);
    return;

    if (false) {
    const legacyDoc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });

    // Outer borders
    doc.setDrawColor(30, 41, 59);
    doc.setLineWidth(0.6);
    doc.rect(8, 8, 194, 281);
    doc.setLineWidth(0.2);
    doc.rect(9, 9, 192, 279);

    // Header Letterhead
    doc.setFont('times', 'normal');
    doc.setFontSize(8);
    doc.text('DILG-FMS Form No. 2026-TO', 11, 14);

    doc.setFont('times', 'bold');
    doc.setFontSize(10);
    doc.text('Republic of the Philippines', 105, 16, { align: 'center' });
    doc.setFont('times', 'normal');
    doc.setFontSize(9);
    doc.text('DEPARTMENT OF THE INTERIOR AND LOCAL GOVERNMENT', 105, 20, { align: 'center' });
    doc.setFont('times', 'bold');
    doc.setFontSize(9);
    doc.text(user.region || 'REGION IV-B - MIMAROPA', 105, 24, { align: 'center' });
    doc.setFont('times', 'normal');
    doc.setFontSize(8.5);
    doc.text(user.office || 'Marinduque Provincial Office', 105, 28, { align: 'center' });
    doc.text('Capitol Compound, Boac, Marinduque', 105, 32, { align: 'center' });

    // Dividers
    doc.setDrawColor(30, 41, 59);
    doc.setLineWidth(0.5);
    doc.line(9, 36, 201, 36);

    // Travel Order Title Block
    doc.setFont('times', 'bold');
    doc.setFontSize(15);
    doc.text('TRAVEL ORDER', 105, 45, { align: 'center' });
    
    doc.setFontSize(9);
    doc.text(`No. ${orderNo}`, 105, 50, { align: 'center' });
    doc.setFont('times', 'normal');
    doc.text(`Date of Issuance: ${submissionDateStr}`, 105, 54, { align: 'center' });

    doc.line(9, 58, 201, 58);

    // Info Table Blocks
    doc.setFont('times', 'bold');
    doc.setFontSize(9.5);
    doc.text('1. NAME OF OFFICIAL / EMPLOYEE:', 14, 65);
    doc.setFont('times', 'normal');
    doc.setFontSize(11);
    doc.text(user.name, 20, 71);

    doc.setFont('times', 'bold');
    doc.setFontSize(9.5);
    doc.text('2. POSITION / DESIGNATION:', 14, 79);
    doc.setFont('times', 'normal');
    doc.setFontSize(11);
    doc.text(user.role, 20, 85);

    doc.setFont('times', 'bold');
    doc.setFontSize(9.5);
    doc.text('3. STATION OF ORIGIN:', 14, 93);
    doc.setFont('times', 'normal');
    doc.setFontSize(11);
    doc.text(user.office, 20, 99);

    doc.line(9, 105, 201, 105);

    doc.setFont('times', 'bold');
    doc.setFontSize(9.5);
    doc.text('4. DESTINATION / STATION TO VISIT:', 14, 112);
    doc.setFont('times', 'normal');
    doc.setFontSize(11);
    doc.text(destinationStr, 20, 118);

    doc.setFont('times', 'bold');
    doc.setFontSize(9.5);
    doc.text('5. INCLUSIVE DATES OF TRAVEL:', 14, 126);
    doc.setFont('times', 'normal');
    doc.setFontSize(11);
    doc.text(`${startDateStr} to ${endDateStr}`, 20, 132);

    doc.line(9, 138, 201, 138);

    // Purpose Block
    doc.setFont('times', 'bold');
    doc.setFontSize(9.5);
    doc.text('6. PURPOSE OF TRAVEL & SPECIAL INSTRUCTIONS:', 14, 145);
    doc.setFont('times', 'normal');
    doc.setFontSize(10);
    
    // Split text automatically for wraps
    const splitPurpose = doc.splitTextToSize(cleanPurpose, 172);
    doc.text(splitPurpose, 20, 151);

    // Source of funds position calculated relative to purpose text size
    const purposeHeight = splitPurpose.length * 5;
    const fundsY = 156 + purposeHeight;

    doc.setFont('times', 'bold');
    doc.setFontSize(9.5);
    doc.text('7. SOURCE OF FUNDS:', 14, fundsY);
    doc.setFont('times', 'normal');
    doc.setFontSize(10.5);
    doc.text(fundingSource, 20, fundsY + 6);

    const checkY = fundsY + 12;
    doc.line(9, checkY, 201, checkY);

    // Standard reporting requirements
    doc.setFont('times', 'bold');
    doc.setFontSize(8.5);
    doc.text('SPECIAL ADMINISTRATIVE REQUIREMENTS:', 14, checkY + 7);
    doc.setFont('times', 'italic');
    doc.setFontSize(8);
    doc.text('1. A Certificate of Appearance must be secured from the visited station/office as attachment to the claim.', 18, checkY + 12);
    doc.text('2. A travel report must be submitted to the immediate supervisor within five (5) working days upon return.', 18, checkY + 16);
    doc.text('3. Travel claims shall be processed subject to standard accounting rules and COA regulations.', 18, checkY + 20);

    const signersY = checkY + 28;
    doc.line(9, signersY, 201, signersY);

    // Signatories blocks
    // Recommending Approval
    doc.setFont('times', 'bold');
    doc.setFontSize(9);
    doc.text('RECOMMENDING APPROVAL:', 14, signersY + 8);
    
    // Cursive sign of recommendor
    doc.setFont('courier', 'bolditalic');
    doc.setFontSize(12);
    doc.setTextColor(37, 99, 235);
    doc.text('J.E. Matining', 30, signersY + 16);
    doc.setTextColor(30, 41, 59);

    doc.setFont('times', 'bold');
    doc.setFontSize(10);
    doc.text('JOHN ERICK J. MATINING', 14, signersY + 22);
    doc.setFont('times', 'normal');
    doc.setFontSize(8.5);
    doc.text('OIC - Program Manager', 14, signersY + 26);

    // Approved By
    doc.setFont('times', 'bold');
    doc.setFontSize(9);
    doc.text('APPROVED BY AUTHORITY OF THE RD:', 115, signersY + 8);

    if (request.status === 'Approved') {
      // Cursive sign of director
      doc.setFont('courier', 'bolditalic');
      doc.setFontSize(15);
      doc.setTextColor(30, 58, 138);
      doc.text('G. Yap', 135, signersY + 16);
      doc.setTextColor(30, 41, 59);

      // Ink stamp border outline
      doc.setDrawColor(37, 99, 235);
      doc.setLineWidth(0.4);
      doc.rect(160, signersY + 4, 32, 11);
      doc.setFont('courier', 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(37, 99, 235);
      doc.text('DILG APPROVED', 176, signersY + 8, { align: 'center' });
      doc.text('E-SIGNED', 176, signersY + 12, { align: 'center' });
      doc.setTextColor(30, 41, 59);
      doc.setDrawColor(30, 41, 59);
      doc.setLineWidth(0.2);
    }

    doc.setFont('times', 'bold');
    doc.setFontSize(10);
    doc.text('GERMAN F. YAP, CESO V', 115, signersY + 22);
    doc.setFont('times', 'normal');
    doc.setFontSize(8.5);
    doc.text('Provincial Director', 115, signersY + 26);

    // Bottom warning
    doc.line(9, 275, 201, 275);
    doc.setFont('times', 'bold');
    doc.setFontSize(7.5);
    doc.text('REMINDERS: Carry this official documentation at all times during travel operations.', 105, 279, { align: 'center' });

    legacyDoc.save(`${orderNo}_Official_Travel_Order.pdf`);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-xs z-50 flex items-center justify-center p-2 sm:p-4 overflow-y-auto select-none id-travel-order-preview">
      <div className="bg-white rounded-2xl border border-slate-200 w-full max-w-[95vw] sm:max-w-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header Ribbon bar */}
        <div className="bg-slate-900 px-3 py-3 sm:px-6 sm:py-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-slate-800 text-white select-none">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-none shrink-0"></div>
            <span className="font-extrabold text-[9px] sm:text-xs tracking-wider uppercase truncate">DILG Official Document Preview</span>
          </div>
          <div className="flex items-center justify-end gap-2 sm:gap-3 flex-wrap">
            <button
              onClick={handlePrint}
              className="p-1.5 sm:p-2 hover:bg-slate-800 text-slate-300 hover:text-white rounded-lg transition-colors cursor-pointer border-0 bg-transparent flex items-center gap-1 text-[9px] sm:text-xs font-bold"
            >
              <Printer className="w-3 h-3 sm:w-4 sm:h-4" />
              <span className="hidden sm:inline">Print Document</span>
            </button>
            <button
              onClick={exportPDF}
              className="py-1.5 px-2.5 sm:py-2 sm:px-3 bg-[#1e40af] hover:bg-blue-600 text-white rounded-lg transition-colors cursor-pointer border-0 text-[9px] sm:text-xs font-black flex items-center gap-1.5"
            >
              <Download className="w-3 h-3 sm:w-4 sm:h-4" />
              <span>Download PDF</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 hover:bg-slate-800 text-slate-400 hover:text-white rounded-lg transition-colors cursor-pointer border-0 bg-transparent"
            >
              <X className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>
          </div>
        </div>

        {/* Scrollable Document Paper */}
        <div className="flex-1 overflow-auto p-2 sm:p-8 bg-slate-100 flex justify-center">
          {showOfficialForm ? (
            <div className="w-full max-w-[210mm] bg-white border border-slate-300 shadow-lg p-2 sm:p-4">
              <iframe
                src={`${filledFormUrl}#toolbar=0&navpanes=0&view=FitH`}
                title="Official Travel Order Form"
                className="w-full h-[calc(90vh-150px)] min-h-[620px] border-0"
              />
            </div>
          ) : (
          <div
            ref={printRef}
            className="w-full max-w-[100%] sm:max-w-[210mm] bg-white border border-slate-300 shadow-lg p-3 sm:p-10 text-[#1e293b] select-text relative font-serif text-xs leading-relaxed origin-top scale-[0.8] sm:scale-100"
            style={{ minHeight: '297mm' }}
          >
            {/* Inner Content padding */}
            <div className="relative z-10 px-8 py-2 space-y-6">
              <div className="min-h-[245mm] px-4 py-3 text-[10px] leading-tight font-sans text-black">
                <div className="flex items-start justify-center gap-3 h-20">
                  <img src={dilgOfficialLogo} alt="DILG official logo" className="h-16 w-16 object-contain" />
                  <img src={bagongPilipinasLogo} alt="Bagong Pilipinas logo" className="h-16 w-[72px] object-contain" />
                </div>
                <div className="text-center leading-tight">
                  <p className="text-[9px]">Republic of the Philippines</p>
                  <p className="text-[10px] font-black uppercase">Department of the Interior and Local Government</p>
                  <p className="text-[10px] font-black uppercase">{user.region || 'MIMAROPA REGION'}</p>
                  <p className="text-[9px]">Province of Marinduque</p>
                  <p className="text-[9px]">Capitol Compound, Boac, Marinduque</p>
                  <p className="text-[9px] text-blue-700 underline">www.mimaropa.dilg.gov.ph</p>
                </div>

                <p className="mt-5 text-center text-[12px] font-black uppercase">Office of the Provincial Director</p>
                <div className="mt-5 space-y-3 text-[10px] font-black uppercase">
                  <p>PROVINCIAL ORDER</p>
                  <div className="grid grid-cols-[55px_18px_1fr] gap-1"><span>NO.</span><span></span><span>{orderNo}</span></div>
                  <div className="grid grid-cols-[55px_18px_1fr] gap-1"><span>TO</span><span>:</span><span>{user.role || 'EMPLOYEE'} {user.name || ''}</span></div>
                  <div className="grid grid-cols-[55px_18px_1fr] gap-1"><span>SUBJECT</span><span>:</span><span>{activityStr}</span></div>
                  <div className="grid grid-cols-[55px_18px_1fr] gap-1"><span>DATE</span><span>:</span><span>{formatFormDate(submissionDateStr)}</span></div>
                </div>

                <div className="mt-4 border-t-2 border-dashed border-black pt-4 text-justify text-[10px] leading-snug">
                  <p>In the exigency of public service so requiring, the above mentioned personnel is hereby directed to attend the above-mentioned activity on <strong>{formatFormDate(startDateStr)}</strong> (<strong>{startDateStr ? new Date(`${startDateStr}T00:00:00`).toLocaleDateString('en-US', { weekday: 'long' }) : ''}</strong>), from <strong>{timeStr}</strong>, at the <strong>{venueStr}</strong>.</p>
                  <p className="mt-3">For your compliance and appropriate action.</p>
                </div>

                <div className="mt-5 font-sans">
                  {request.status === 'Approved' && <p className="mb-1 ml-2 font-serif text-xl italic text-blue-900">G. Yap</p>}
                  <p className="font-black uppercase text-[10px]">{request.approver || 'IVAN STEPHEN F. FADRI, CESE'}</p>
                  <p className="text-[9px]">Provincial Director</p>
                </div>

                <div className="mt-[120mm] text-center text-[9px] leading-tight">
                  <p className="font-bold">“Matino, Mahusay at Maaasahan”</p>
                  <p>Telephone Number (042) 754-5881</p>
                </div>
              </div>

              <div className="border-t border-slate-200 pt-3 text-center font-sans text-[9px] font-bold uppercase tracking-wide text-slate-400">
                Filled travel order details
              </div>
              
              {false && (
              <>
              {/* Header Letterhead */}
              <div className="flex items-center justify-center gap-3 text-left select-none">
                <img src={dilgLogo} alt="DILG official logo" className="h-12 w-12 shrink-0 object-contain" />
                <div className="space-y-1">
                  <p className="text-[10px] tracking-tight uppercase font-sans">Republic of the Philippines</p>
                  <p className="text-xs font-bold tracking-wide uppercase font-sans">DEPARTMENT OF THE INTERIOR AND LOCAL GOVERNMENT</p>
                  <p className="text-[11px] font-black tracking-wide uppercase text-[#1e40af] font-sans">{user.region || 'REGION IV-A - CALABARZON'}</p>
                  <p className="text-[10px] font-bold tracking-wide text-slate-600 uppercase font-sans">{user.office || 'Marinduque Provincial Office'}</p>
                  <p className="text-[8.5px] text-slate-450 uppercase font-sans">Capitol Compound, Boac, Marinduque</p>
                </div>
              </div>

              <div className="w-full border-t border-slate-800 my-2"></div>

              {/* Document Title Block */}
              <div className="text-center space-y-1.5 py-2">
                <h1 className="text-xl font-bold tracking-widest text-slate-900 uppercase">TRAVEL ORDER</h1>
                <p className="font-mono text-slate-700 text-[10px] font-bold">No. {orderNo}</p>
                <p className="text-[9.5px] text-slate-500 font-sans font-bold">Date of Issuance: {submissionDateStr}</p>
              </div>

              <div className="w-full border-t border-slate-800 my-2"></div>

              {/* Details table blocks */}
              <div className="space-y-4 text-left">
                <div className="grid grid-cols-12 gap-2 pb-2 border-b border-slate-200">
                  <div className="col-span-4 font-sans font-extrabold text-[9px] uppercase text-slate-500">1. Name of Official/Employee:</div>
                  <div className="col-span-8 font-serif text-sm font-bold text-slate-900">{user.name}</div>
                </div>

                <div className="grid grid-cols-12 gap-2 pb-2 border-b border-slate-200">
                  <div className="col-span-4 font-sans font-extrabold text-[9px] uppercase text-slate-500">2. Position / Designation:</div>
                  <div className="col-span-8 font-serif text-sm text-slate-800">{user.role}</div>
                </div>

                <div className="grid grid-cols-12 gap-2 pb-2 border-b border-slate-200">
                  <div className="col-span-4 font-sans font-extrabold text-[9px] uppercase text-slate-500">3. Station of Origin:</div>
                  <div className="col-span-8 font-serif text-sm text-slate-850">{user.office}</div>
                </div>

                <div className="grid grid-cols-12 gap-2 pb-2 border-b border-slate-200">
                  <div className="col-span-4 font-sans font-extrabold text-[9px] uppercase text-slate-500">4. Destination to Visit:</div>
                  <div className="col-span-8 font-serif text-sm font-bold text-slate-900 bg-amber-50/50 px-1 decoration-dotted underline">{destinationStr}</div>
                </div>

                <div className="grid grid-cols-12 gap-2 pb-2 border-b border-slate-200">
                  <div className="col-span-4 font-sans font-extrabold text-[9px] uppercase text-slate-500">5. Inclusive Dates of Travel:</div>
                  <div className="col-span-8 font-serif text-sm font-bold text-slate-900 bg-amber-50/50 px-1 decoration-dotted underline">{startDateStr} to {endDateStr}</div>
                </div>
              </div>

              {/* Purpose and Instructions Box */}
              <div className="p-4 bg-slate-50/80 border border-slate-200 rounded-xl space-y-2 text-left">
                <span className="font-sans font-extrabold text-[9.5px] uppercase text-slate-600 block">6. Purpose of Travel & Special Instructions:</span>
                <p className="font-serif italic text-[11px] text-slate-800 leading-relaxed font-semibold">
                  {cleanPurpose}
                </p>
              </div>

              {/* Source of Funds Box */}
              <div className="p-4 bg-slate-50/80 border border-slate-200 rounded-xl space-y-1.5 text-left">
                <span className="font-sans font-extrabold text-[9.5px] uppercase text-slate-600 block">7. Source of Funds for Expenses:</span>
                <p className="font-serif text-[11px] text-slate-850 font-bold">
                  {fundingSource}
                </p>
              </div>

              {/* Standard reporting requirements */}
              <div className="border-t border-slate-300 pt-3 space-y-2 text-left">
                <span className="font-sans font-extrabold text-[8.5px] uppercase text-slate-500 block">Special Administrative Instructions:</span>
                <ol className="list-decimal pl-4 space-y-1.5 font-sans text-[8px] text-slate-450 leading-normal font-semibold">
                  <li>A Certificate of Appearance must be secured from the visited station/office as attachment to the claim.</li>
                  <li>A travel report must be submitted to the immediate supervisor within five (5) working days upon return.</li>
                  <li>Travel claims shall be processed subject to standard accounting rules and COA regulations.</li>
                </ol>
              </div>

              <div className="w-full border-t border-slate-800 my-2"></div>

              {/* Signatories grid row */}
              <div className="grid grid-cols-2 gap-8 pt-4 text-left">
                {/* Recommending sign */}
                <div className="space-y-6">
                  <span className="font-sans font-extrabold text-[9px] uppercase text-slate-500 block">Recommending Approval:</span>
                  <div className="space-y-1 text-center relative flex flex-col items-center">
                    <span className="absolute top-[-18px] font-mono text-[14px] text-blue-600 select-none italic" style={{ fontFamily: 'Caveat, cursive' }}>
                      J.E. Matining
                    </span>
                    <div className="w-full border-b border-slate-900 mt-4"></div>
                    <span className="text-[10px] font-black text-slate-800 uppercase mt-1 tracking-wider">JOHN ERICK J. MATINING</span>
                    <span className="text-[8px] font-bold text-slate-500">OIC - Program Manager</span>
                  </div>
                </div>

                {/* Approved sign */}
                <div className="space-y-6 relative">
                  {request.status === 'Approved' && (
                    <div className="absolute right-4 top-[-20px] select-none pointer-events-none w-24 h-24 border-4 border-dashed border-blue-500/30 rounded-full flex flex-col items-center justify-center text-blue-600/30 text-center font-mono leading-none rotate-15">
                      <span className="text-[6px] font-extrabold uppercase">Department of Interior</span>
                      <span className="text-[8px] font-black my-1">APPROVED</span>
                      <span className="text-[5px] font-medium block">MARINDUQUE PROVINCE</span>
                    </div>
                  )}
                  <span className="font-sans font-extrabold text-[9px] uppercase text-slate-500 block">Approved by Authority of the RD:</span>
                  <div className="space-y-1 text-center relative flex flex-col items-center">
                    {request.status === 'Approved' && (
                      <span className="absolute top-[-25px] font-semibold text-[26px] text-blue-800 select-none italic transform -rotate-2" style={{ fontFamily: 'Alex Brush, Caveat, cursive' }}>
                        G. Yap
                      </span>
                    )}
                    <div className="w-full border-b border-slate-900 mt-4"></div>
                    <span className="text-[10px] font-black text-slate-900 uppercase mt-1 tracking-wider">GERMAN F. YAP, CESO V</span>
                    <span className="text-[8px] font-bold text-slate-500">Provincial Director</span>
                  </div>
                </div>
              </div>

              {/* Reminders Footer */}
              <div className="text-center pt-8 font-mono text-[7.5px] font-extrabold tracking-widest text-slate-400 uppercase select-none">
                REMINDERS: Carry this official documentation at all times during travel operations.
              </div>

              </>
              )}

            </div>
          </div>
          )}

        </div>

        {/* Bottom Bar */}
        <div className="bg-slate-900 border-t border-slate-800 p-3.5 text-center text-[10px] text-slate-400 font-bold flex flex-wrap gap-2 justify-between items-center select-none">
          <div className="flex items-center gap-1.5">
            <FileCheck className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
            <span>Official digital verification of approved travel mandate complete.</span>
          </div>
          <div>
            <span>Format: ISO Standard Portrait A4 • DILG-FMS Form 2026-TO</span>
          </div>
        </div>

      </div>
    </div>
  );
}
