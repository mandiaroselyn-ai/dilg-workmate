/**
 * @license
 * SPDX-License-Identifier: Apache-2.5
 */

import React, { useState } from 'react';
import { HelpCircle, Search, ChevronDown, ChevronUp, BookOpen, MessageSquare, PhoneCall, ShieldAlert, CheckCircle } from 'lucide-react';

export default function HelpView() {
  const [searchQuery, setSearchQuery] = useState('');
  const [openIndex, setOpenIndex] = useState(null);
  const [ticketSubject, setTicketSubject] = useState('');
  const [ticketCategory, setTicketCategory] = useState('Biometrics / Attendance');
  const [ticketBody, setTicketBody] = useState('');
  const [formSubmitted, setFormSubmitted] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  const faqs = [
    {
      category: "Attendance",
      question: "Why can't I time in?",
      answer: "Allow location and camera access, make sure you are within the assigned work area, and complete the required verification. If the issue continues, submit a support ticket with the exact error message."
    },
    {
      category: "Attendance",
      question: "How do I view my attendance?",
      answer: "Open Attendance from the menu to view today's Time In, Time Out, Total Hours, monthly records, and attendance status."
    },
    {
      category: "Requests",
      question: "Where can I check my leave or travel request?",
      answer: "Open Requests to submit a Leave Request or Travel Order and check its current status and approval updates."
    },
    {
      category: "Documents",
      question: "Where can I find my personnel documents?",
      answer: "Open Documents and choose a category such as Personal Records, Employment Documents, Leave Documents, or Training Certificates. Uploaded files will appear under the matching category."
    },
    {
      category: "Account Access",
      question: "What should I do if I forget my password?",
      answer: "Use Forgot password on the login screen and follow the reset instructions sent to your registered email address."
    },
    {
      category: "Mobile App",
      question: "Why is the mobile app stuck loading?",
      answer: "Check your internet connection, confirm that the WorkMate service is available, then close and reopen the app. Include a screenshot and your device details in a support ticket if it persists."
    }
  ];

  const filteredFaqs = faqs.filter(faq => 
    faq.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
    faq.answer.toLowerCase().includes(searchQuery.toLowerCase()) ||
    faq.category.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleTicketSubmit = (e) => {
    e.preventDefault();
    if (!ticketSubject || !ticketBody) return;
    setFormSubmitted(true);
    setSuccessMsg('');
    setTimeout(() => {
      const ticketId = "TKT-" + Math.floor(Math.random() * 90000 + 10000);
      setTicketSubject('');
      setTicketBody('');
      setFormSubmitted(false);
      setSuccessMsg("DILG WorkMate Helpdesk Ticket submitted. Ticket ID: " + ticketId);
      setTimeout(() => setSuccessMsg(''), 6000);
    }, 1500);
  };

  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-4 pb-32 font-sans sm:p-6 sm:pb-8 lg:p-8">
      {/* Visual Header Banner */}
      <div className="bg-gradient-to-r from-[#1e40af] to-indigo-900 rounded-3xl p-6 text-white shadow-md relative overflow-hidden">
        <div className="absolute right-0 top-0 translate-x-12 -translate-y-12 w-64 h-64 bg-white/5 blur-xl rounded-full"></div>
        <div className="absolute left-1/3 bottom-0 translate-y-8 w-44 h-44 bg-blue-400/10 blur-lg rounded-full"></div>
        
        <div className="max-w-2xl space-y-2 relative z-10 text-left">
          <span className="text-[10px] bg-sky-500/25 border border-sky-400/30 text-sky-200 px-3 py-1 rounded-full font-mono font-bold uppercase tracking-widest inline-flex items-center gap-1.5">
            <BookOpen className="w-3 h-3" />
            Employee Help & Support
          </span>
          <h2 className="text-2xl font-extrabold tracking-tight">Need help with WorkMate?</h2>
          <p className="text-xs text-blue-100/95 leading-relaxed font-semibold">
            Find quick answers for attendance, requests, documents, and account access.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Helpdesk FAQs List FAQ */}
        <div className="lg:col-span-2 bg-white border border-slate-200/80 rounded-2xl p-6 shadow-xs space-y-5">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="text-left">
              <h3 className="font-bold text-slate-800 text-sm uppercase tracking-wider font-mono flex items-center gap-2">
                <HelpCircle className="w-4 h-4 text-[#1e40af]" />
                Common Questions
              </h3>
              <p className="text-xs text-slate-500 mt-1 font-semibold">Quick answers for your employee account.</p>
            </div>
            {/* Search FAQ */}
            <div className="relative max-w-xs w-full">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search resources..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full text-xs font-semibold rounded-lg border border-slate-200 bg-slate-50 text-slate-800 pl-9 pr-4 py-2 placeholder-slate-405 focus:outline-none focus:ring-1 focus:ring-[#1e40af]/30 focus:border-[#1e40af] transition-all"
              />
            </div>
          </div>

          <div className="divide-y divide-slate-100 border-t border-slate-100 pt-1.5">
            {filteredFaqs.length === 0 ? (
              <div className="p-8 text-center text-slate-400 font-bold text-xs">
                No matching answers found. Try a different keyword.
              </div>
            ) : (
              filteredFaqs.map((faq, idx) => {
                const isOpen = openIndex === idx;
                return (
                  <div key={idx} className="py-3.5 space-y-2 text-left">
                    <button
                      onClick={() => setOpenIndex(isOpen ? null : idx)}
                      className="w-full flex items-center justify-between text-left font-bold text-xs text-slate-800 hover:text-[#1e40af] transition-colors gap-4"
                    >
                      <span className="flex items-center gap-2.5">
                        <span className="text-[9px] font-black uppercase text-blue-600 bg-blue-50 px-2 py-0.5 rounded font-sans tracking-wide shrink-0">
                          {faq.category}
                        </span>
                        <span>{faq.question}</span>
                      </span>
                      {isOpen ? <ChevronUp className="w-4 h-4 shrink-0 text-slate-400" /> : <ChevronDown className="w-4 h-4 shrink-0 text-slate-400" />}
                    </button>
                    {isOpen && (
                      <p className="text-xs text-slate-650 leading-relaxed pl-3 border-l-2 border-blue-500 bg-slate-50/50 p-2.5 rounded-lg animate-in fade-in duration-200 font-semibold text-left">
                        {faq.answer}
                      </p>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Contact Support Ticket Form */}
        <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-xs space-y-5 h-fit text-left">
          <div>
            <h3 className="font-bold text-slate-800 text-sm uppercase tracking-wider font-mono flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-[#1e40af]" />
              Submit Helpdesk Ticket
            </h3>
            <p className="text-xs text-slate-500 mt-1 font-semibold">Send an issue to the support team for follow-up.</p>
          </div>

          <form onSubmit={handleTicketSubmit} className="space-y-4">
            <div>
              <label className="block text-[11px] font-bold text-slate-550 uppercase tracking-wider mb-1.5 ">Category</label>
              <select
                value={ticketCategory}
                onChange={(e) => setTicketCategory(e.target.value)}
                className="w-full text-xs font-semibold rounded-lg border border-slate-200 bg-slate-50 text-slate-808 p-2.5 outline-none focus:ring-1 focus:ring-[#1e40af] focus:border-[#1e40af]"
              >
                <option value="Biometrics / Attendance">Biometrics / Attendance</option>
                <option value="GPS & Boundary Accuracy">GPS & Boundary Accuracy</option>
                <option value="Employee Profile Updates">Employee Profile Updates</option>
                <option value="Official Communications">Official Communications</option>
                <option value="Other System Bug">Other System Bug</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-550 uppercase tracking-wider mb-1.5">Subject Heading</label>
              <input
                type="text"
                placeholder="e.g. Inaccurate location tagging"
                value={ticketSubject}
                onChange={(e) => setTicketSubject(e.target.value)}
                required
                className="w-full text-xs font-semibold rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-slate-808 placeholder-slate-400 outline-none focus:ring-2 focus:ring-[#1e40af]/10 focus:border-[#1e40af]"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-550 uppercase tracking-wider mb-1.5">Detailed Complaint/Query</label>
              <textarea
                placeholder="Indicate municipal coordinates or error behavior..."
                value={ticketBody}
                onChange={(e) => setTicketBody(e.target.value)}
                required
                rows={4}
                className="w-full text-xs font-semibold rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-slate-808 placeholder-slate-400 outline-none focus:ring-2 focus:ring-[#1e40af]/10 focus:border-[#1e40af] resize-none"
              ></textarea>
            </div>

            {successMsg && (
              <div className="bg-emerald-50 border border-emerald-100 text-emerald-700 p-3 rounded-lg text-xs font-semibold flex items-center gap-2 select-none text-left">
                <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{successMsg}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={formSubmitted}
              className="w-full bg-[#1e40af] hover:bg-blue-800 disabled:bg-slate-200 text-white font-bold text-xs py-2.5 px-4 rounded-lg flex items-center justify-center gap-2 shadow transition-all cursor-pointer font-semibold"
            >
              {formSubmitted ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  <span>Filing Ticket ...</span>
                </>
              ) : (
                <>
                  <CheckCircle className="w-3.5 h-3.5" />
                  <span>Submit Ticket</span>
                </>
              )}
            </button>
          </form>
        </div>
      </div>

      {/* Immediate Emergency Contacts Card */}
      <div className="grid grid-cols-1 gap-4 rounded-2xl border border-slate-200/60 bg-slate-50 p-5 text-left md:grid-cols-3 md:gap-6 md:p-6">
        <div className="flex items-start gap-3.5">
          <div className="mt-1 w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-[#1e40af] shrink-0">
            <PhoneCall className="w-4 h-4" />
          </div>
          <div>
            <h4 className="font-bold text-xs text-slate-800 uppercase tracking-wide">DILG Provincial Hotline</h4>
            <p className="text-xs font-bold text-[#1e40af] mt-0.5">(042) 332-1543</p>
            <p className="text-[10px] text-slate-500 font-medium">Available Monday to Friday, 8AM to 5PM</p>
          </div>
        </div>

        <div className="flex items-start gap-3.5">
          <div className="mt-1 w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-[#1e40af] shrink-0">
            <MessageSquare className="w-4 h-4" />
          </div>
          <div>
            <h4 className="font-bold text-xs text-slate-800 uppercase tracking-wide">Workmate IT Helpdesk</h4>
            <p className="text-xs font-bold text-[#1e40af] mt-0.5">support@dilg-marinduque.gov.ph</p>
            <p className="text-[10px] text-slate-500 font-medium">Hashed queries solved within 24 hours</p>
          </div>
        </div>

        <div className="flex items-start gap-3.5">
          <div className="mt-1 w-8 h-8 rounded-full bg-rose-100 flex items-center justify-center text-rose-600 shrink-0">
            <ShieldAlert className="w-4 h-4" />
          </div>
          <div>
            <h4 className="font-bold text-xs text-slate-800 uppercase tracking-wide">Legal & Audit Compliance</h4>
            <p className="text-xs font-bold text-rose-600 mt-0.5">compliance@dilg.gov.ph</p>
            <p className="text-[10px] text-slate-500 font-medium">Authorized personnel reporting line</p>
          </div>
        </div>
      </div>
    </div>
  );
}
