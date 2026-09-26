/**
 * @license
 * SPDX-License-Identifier: Apache-2.5
 */

import React, { useState } from 'react';
import {
  BriefcaseBusiness,
  CalendarDays,
  ClipboardList,
  FileArchive,
  FileBadge,
  FileCheck2,
  FolderOpen,
  GraduationCap,
  X,
  Plane,
  ReceiptText,
  UserRound
} from 'lucide-react';

const documentCategories = [
  { title: 'Personal Records', description: 'PDS, CSC Form 212, birth certificate, and valid IDs.', types: ['PDS', 'CSC Form 212', 'Birth Certificate', 'Valid ID'], icon: UserRound, color: 'bg-blue-50 text-blue-700' },
  { title: 'Employment Documents', description: 'Appointment papers, contracts, oath, and assumption of duty.', types: ['Appointment Paper', 'Contract', 'Oath of Office', 'Assumption of Duty'], icon: BriefcaseBusiness, color: 'bg-indigo-50 text-indigo-700' },
  { title: 'Service Records', description: 'Service record, plantilla item, promotion, and movement documents.', types: ['Service Record', 'Plantilla Item', 'Promotion', 'Personnel Movement'], icon: FileBadge, color: 'bg-violet-50 text-violet-700' },
  { title: 'Leave Documents', description: 'Leave forms, approvals, and supporting medical certificates.', types: ['Leave Form', 'Leave Approval', 'Medical Certificate'], icon: CalendarDays, color: 'bg-rose-50 text-rose-700' },
  { title: 'Travel Documents', description: 'Travel orders, itineraries, and liquidation documents.', types: ['Travel Order', 'Itinerary', 'Liquidation Form'], icon: Plane, color: 'bg-amber-50 text-amber-700' },
  { title: 'Performance Records', description: 'IPCR, OPCR, ratings, and accomplishment reports.', types: ['IPCR', 'OPCR', 'Performance Rating', 'Accomplishment Report'], icon: ClipboardList, color: 'bg-emerald-50 text-emerald-700' },
  { title: 'Training Certificates', description: 'Seminars, webinars, and certificates of completion.', types: ['Seminar Certificate', 'Webinar Certificate', 'Certificate of Completion'], icon: GraduationCap, color: 'bg-cyan-50 text-cyan-700' },
  { title: 'Payroll and Benefits', description: 'Payslips, GSIS, PhilHealth, and Pag-IBIG documents.', types: ['Payslip', 'GSIS', 'PhilHealth', 'Pag-IBIG'], icon: ReceiptText, color: 'bg-teal-50 text-teal-700' },
  { title: 'Official Memoranda', description: 'Department orders, HR advisories, and policy updates.', types: ['Department Order', 'HR Advisory', 'Policy Update'], icon: FileCheck2, color: 'bg-slate-100 text-slate-700' }
];

export default function DocumentsView() {
  const [selectedCategory, setSelectedCategory] = useState(null);

  return (
    <div className="h-full min-h-0 w-full overflow-y-auto bg-slate-50 p-4 pb-24 font-sans sm:p-5 sm:pb-5 lg:p-6">
      <div className="mb-3 flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#1e40af] text-white shadow-sm">
          <FileArchive className="h-5 w-5" />
        </div>
        <h1 className="text-lg font-extrabold text-slate-900">Documents</h1>
      </div>
      <div className="grid w-full gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {documentCategories.map(({ title, description, icon: Icon, color }) => (
          <button
            key={title}
            type="button"
            onClick={() => setSelectedCategory({ title, description, types: documentCategories.find(category => category.title === title)?.types || [], Icon, color })}
            className="group rounded-xl border border-slate-200 bg-white p-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md"
          >
            <div className="flex items-start justify-between gap-4">
              <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${color}`}>
                <Icon className="h-4 w-4" />
              </div>
              <FolderOpen className="h-3.5 w-3.5 text-slate-300 transition group-hover:text-blue-500" />
            </div>
            <h2 className="mt-2 text-xs font-extrabold text-slate-900">{title}</h2>
            <p className="mt-1 text-[11px] leading-4 text-slate-500">{description}</p>
            <p className="mt-2 text-[9px] font-bold uppercase tracking-widest text-slate-400">No documents yet</p>
          </button>
        ))}
      </div>
      {selectedCategory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4" onClick={() => setSelectedCategory(null)}>
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl" onClick={event => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${selectedCategory.color}`}>
                  <selectedCategory.Icon className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-base font-extrabold text-slate-900">{selectedCategory.title}</h2>
                  <p className="text-xs text-slate-500">{selectedCategory.description}</p>
                </div>
              </div>
              <button type="button" onClick={() => setSelectedCategory(null)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Close document category">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="mt-5 rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4">
              <p className="text-sm font-bold text-slate-700">No documents yet</p>
              <p className="mt-1 text-xs text-slate-500">Supported documents in this category:</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {selectedCategory.types.map(type => <span key={type} className="rounded-full bg-white px-3 py-1 text-[11px] font-semibold text-slate-600 shadow-sm">{type}</span>)}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
