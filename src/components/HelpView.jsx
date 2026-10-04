/**
 * @license
 * SPDX-License-Identifier: Apache-2.5
 */

import React, { useState } from 'react';
import { BookOpen, ChevronDown, ChevronUp, HelpCircle, PhoneCall, Search, Send, ShieldCheck } from 'lucide-react';
import { SUPPORT_DETAILS_MAX, SUPPORT_SUBJECT_MAX, SUPPORT_TOPICS } from '../../shared/supportTopics';
import { apiFetch } from '../utils/api';

// Answers match how WorkMate works; update them when a feature changes.
const faqs = [
  {
    topic: 'Getting started',
    question: 'I signed up. Why can I not log in yet?',
    answer: 'New accounts wait for HR approval. You get an SMS (sign-up form) or an email (Continue with Google) once HR approves your account. To check, tap "Check account status" on the login screen.'
  },
  {
    topic: 'Getting started',
    question: 'What do I need before my first Time In?',
    answer: 'Two things: (1) Biometric Enrollment approved by HR. Open Profile, then Biometric Enrollment, upload the front and back of your government ID, and take a selfie. The same tab shows whether HR has approved it. (2) Your fingerprint or face unlock registered on your phone. In a browser, tap Register this phone on the Biometric Enrollment tab. In the WorkMate app, your phone is registered the first time you verify your fingerprint on the Attendance page.'
  },
  {
    topic: 'Getting started',
    question: "Can I use WorkMate on a computer?",
    answer: "Employees use WorkMate on a phone, in the browser or in the WorkMate app. The computer version is for Supervisors and HR."
  },
  {
    topic: 'Attendance',
    question: "How do I choose where I am working today?",
    answer: "On the Attendance page, choose Office and then your office, Field and then the municipality and barangay, or Work from home. You must be at the site you choose: inside the barangay for Field, or within 150 meters of the office or your work-from-home address. Work from home works only after HR sets your approved work-from-home address."
  },
  {
    topic: 'Attendance',
    question: 'Why can I not Time In?',
    answer: 'The message on the Attendance page says which check failed. Common reasons: you are Out of Range (not at the site you chose: outside the barangay for Field, or more than 150 meters from the office or work-from-home address); your GPS accuracy is weaker than 50 meters (move outdoors or near a window and wait); your selfie did not match your enrollment selfie (use good light and keep your face clearly visible); your fingerprint was not verified; HR has not approved your Biometric Enrollment yet; or you have no internet. Time In needs an internet connection.'
  },
  {
    topic: 'Attendance',
    question: "Why did WorkMate Time In by itself?",
    answer: "After you take your selfie and verify your fingerprint, WorkMate records your Time In by itself as soon as you are within range of the site you chose."
  },
  {
    topic: 'Attendance',
    question: 'Can I Time In or Time Out without internet?',
    answer: 'Yes, in the WorkMate phone app, once your phone has verified your fingerprint online at least once. Without internet, tap the fingerprint step, then Time In, and scan your fingerprint: your Time In is saved on your phone with your selfie and GPS, and sent automatically when you are back online. If a check fails then (for example, your selfie does not match or your phone clock was wrong), HR reviews it before it counts in your DTR. A Time Out works the same way, without the fingerprint; if your phone clock looked wrong when it was sent, HR checks the Time Out before it counts. Settings, under Offline records, shows anything still waiting and has a Sync now button.'
  },
  {
    topic: 'Attendance',
    question: 'I forgot to Time Out, or my attendance record is wrong. What do I do?',
    answer: 'Ask HR to correct it. HR can review and fix attendance records. Use the "Ask HR for help" form below and include the date.'
  },
  {
    topic: 'Attendance',
    question: 'Why does WorkMate use my location?',
    answer: 'At Time In, your location confirms that you are at the work site you chose. While your shift is open (from Time In to Time Out), the app sends your location about once a minute while it is open, so HR can see field staff on the map. It does not send your location after Time Out.'
  },
  {
    topic: 'Leave and travel',
    question: 'What do the request statuses mean?',
    answer: 'Draft: saved but not sent. Pending: waiting for HR. For Supervisor: HR checked it and sent it to the Supervisor. Approved or Rejected: the Supervisor\'s decision. Withdrawn: you took it back.'
  },
  {
    topic: 'Leave and travel',
    question: 'When are my leave credits deducted?',
    answer: 'When the Supervisor approves your leave, its working days are deducted from your Vacation Leave or Sick Leave credits. Requests, under the Leave tab, shows your remaining credits.'
  },
  {
    topic: 'Leave and travel',
    question: 'Can I cancel a request?',
    answer: 'Yes, while it is still Pending or For Supervisor: open it in Requests and tap Withdraw. For a request that is already approved, ask HR.'
  },
  {
    topic: 'Documents',
    question: 'Where do I get my CSC Form 6, Travel Order, or DTR?',
    answer: 'Open Documents. My Leave Applications has the CSC Form 6 of each leave and the files you attached, My Travel Orders has each Travel Order, and My Daily Time Records has your DTR (CSC Form No. 48) for each month. You can also export your DTR from the Attendance page.'
  },
  {
    topic: 'Announcements and calendar',
    question: "How do I confirm that I read an announcement?",
    answer: "Open Announcements, tap Read Full Circular, then tap Acknowledge Receipt. WorkMate records that you read it."
  },
  {
    topic: 'Announcements and calendar',
    question: "Where do I see office events?",
    answer: "Open Calendar from the menu. Upcoming events also appear on your Dashboard."
  },
  {
    topic: 'Profile',
    question: "How do I update my contact number or profile photo?",
    answer: "Open Profile. Tap Update Personnel Information to change your name, position, contact number, office, and region. Tap your photo, then Upload Photo, to change it. Your government email and employee ID are managed by HR."
  },
  {
    topic: 'SMS and notifications',
    question: 'What updates do I get by SMS?',
    answer: 'A confirmation when you Time In and Time Out, and an update when your leave or travel request changes status. The SMS goes to the contact number in your Profile. The bell icon shows the same updates inside the app.'
  },
  {
    topic: 'SMS and notifications',
    question: "Where can I see the SMS WorkMate sent me?",
    answer: "Tap the envelope icon at the top of the app. It lists the texts WorkMate sent to your number."
  },
  {
    topic: 'SMS and notifications',
    question: 'Why am I not getting SMS?',
    answer: 'Check that the contact number in your Profile is correct (for example, 0917 123 4567). If it is correct and you still get no SMS, tell HR, who can see whether each message was sent or failed.'
  },
  {
    topic: 'Account and password',
    question: 'I forgot my password. What do I do?',
    answer: 'Tap "Forgot password?" on the login screen. A personal email gets a reset link. DILG (@dilg.gov.ph) accounts are reset by HR: tap "Request password reset from HR" and HR gives you a temporary password. If you signed up with Google, log in with Continue with Google instead.'
  },
  {
    topic: 'Account and password',
    question: "How do I change my password?",
    answer: "Open Settings, then Change password. If you signed up with Google and have no password yet, you can set one there."
  },
  {
    topic: 'Account and password',
    question: 'Why was I logged out?',
    answer: 'A session lasts 8 hours, and changing your password logs you out everywhere. Log in again. On a computer, tick "Remember me" to stay signed in after closing the browser.'
  },
  {
    topic: 'App problems',
    question: 'The camera or GPS does not work.',
    answer: 'Allow the camera and location for WorkMate in your phone settings and turn on Location (GPS). Then open Settings, Phone permissions, and use Test GPS and Test camera.'
  },
  {
    topic: 'App problems',
    question: 'The app is stuck loading or looks outdated.',
    answer: 'Check your internet connection, then close and reopen WorkMate. To get the newest version, open Settings, About WorkMate, and tap Check for update.'
  }
];

const TOPICS = [...new Set(faqs.map(faq => faq.topic))];

const inputClass = 'w-full rounded-lg border border-slate-200 bg-white p-2.5 text-xs font-semibold text-slate-800 focus:border-[#1e40af] focus:outline-none focus:ring-2 focus:ring-blue-500/10';

function AskHrForm({ user }) {
  const [topic, setTopic] = useState(SUPPORT_TOPICS[0]);
  const [subject, setSubject] = useState('');
  const [details, setDetails] = useState('');
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState(null);

  const submit = async event => {
    event.preventDefault();
    if (!subject.trim() || !details.trim()) {
      setMessage({ error: true, text: 'Enter a subject and describe the problem.' });
      return;
    }
    setSending(true);
    setMessage(null);
    try {
      const response = await apiFetch('/api/support-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic, subject: subject.trim(), details: details.trim() })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) throw new Error(data.error || 'Unable to send your request. Please try again.');
      setSubject('');
      setDetails('');
      const contact = user?.phoneNumber || user?.email;
      setMessage({ text: `Sent to HR.${contact ? ` HR will follow up through ${contact}.` : ''}` });
    } catch (error) {
      setMessage({ error: true, text: error.message || 'Unable to send your request. Please try again.' });
    } finally {
      setSending(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <label className="block space-y-1 text-[10px] font-black uppercase tracking-wider text-slate-500" htmlFor="help-topic">What is it about?
        <select id="help-topic" value={topic} onChange={event => setTopic(event.target.value)} className={inputClass}>
          {SUPPORT_TOPICS.map(option => <option key={option}>{option}</option>)}
        </select>
      </label>
      <label className="block space-y-1 text-[10px] font-black uppercase tracking-wider text-slate-500" htmlFor="help-subject">Subject
        <input id="help-subject" type="text" value={subject} maxLength={SUPPORT_SUBJECT_MAX} onChange={event => setSubject(event.target.value)} placeholder="e.g. Out of Range inside the office" className={inputClass} />
      </label>
      <label className="block space-y-1 text-[10px] font-black uppercase tracking-wider text-slate-500" htmlFor="help-details">Details
        <textarea id="help-details" rows={4} value={details} maxLength={SUPPORT_DETAILS_MAX} onChange={event => setDetails(event.target.value)} placeholder="What happened, when, and the exact message the app showed." className={inputClass} />
      </label>
      {message?.text && (
        <p role="status" className={`rounded-lg px-3 py-2 text-xs font-bold ${message.error ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'}`}>{message.text}</p>
      )}
      <button type="submit" disabled={sending} className="inline-flex items-center gap-1.5 rounded-lg bg-[#1e40af] px-4 py-2.5 text-xs font-bold text-white transition hover:bg-blue-800 disabled:cursor-wait disabled:opacity-60">
        <Send className="h-3.5 w-3.5" />{sending ? 'Sending...' : 'Send to HR'}
      </button>
    </form>
  );
}

export default function HelpView({ user }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [openQuestion, setOpenQuestion] = useState(null);

  const query = searchQuery.trim().toLowerCase();
  const matches = faqs.filter(faq => !query || `${faq.topic} ${faq.question} ${faq.answer}`.toLowerCase().includes(query));

  return (
    <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50 p-4 pb-32 font-sans sm:p-6 sm:pb-8 lg:p-8">
      <div className="mx-auto w-full max-w-3xl space-y-4 text-left">
        <div className="rounded-2xl bg-gradient-to-r from-[#1e40af] to-indigo-900 p-5 text-white shadow-md">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-400/30 bg-sky-500/25 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-sky-100">
            <BookOpen className="h-3 w-3" />Help &amp; Support
          </span>
          <h1 className="mt-2 text-xl font-extrabold tracking-tight">Need help with WorkMate?</h1>
          <p className="mt-1 text-xs font-semibold leading-relaxed text-blue-100">Find answers about Time In, requests, documents, and your account. If you are still stuck, send your concern to HR.</p>
        </div>

        <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 text-sm font-black text-slate-900"><HelpCircle className="h-4 w-4 text-[#1e40af]" />Common questions</h2>
            <div className="relative w-full sm:w-64">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                aria-label="Search questions"
                value={searchQuery}
                onChange={event => setSearchQuery(event.target.value)}
                placeholder="Search, e.g. Time In, DTR, password"
                className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-xs font-semibold text-slate-800 focus:border-[#1e40af] focus:outline-none focus:ring-2 focus:ring-blue-500/10"
              />
            </div>
          </div>

          {matches.length === 0 && <p className="rounded-xl bg-slate-50 p-6 text-center text-xs font-bold text-slate-500">No answers match. Try another word, or send your concern to HR below.</p>}
          {TOPICS.map(topic => {
            const questions = matches.filter(faq => faq.topic === topic);
            if (!questions.length) return null;
            return (
              <div key={topic}>
                <h3 className="mb-1 text-[10px] font-black uppercase tracking-widest text-slate-400">{topic}</h3>
                <ul className="divide-y divide-slate-100 rounded-xl border border-slate-100">
                  {questions.map(faq => {
                    const isOpen = openQuestion === faq.question;
                    return (
                      <li key={faq.question}>
                        <button
                          type="button"
                          aria-expanded={isOpen}
                          onClick={() => setOpenQuestion(isOpen ? null : faq.question)}
                          className="flex w-full items-center justify-between gap-3 px-3 py-3 text-left text-xs font-bold text-slate-800 hover:text-[#1e40af]"
                        >
                          <span>{faq.question}</span>
                          {isOpen ? <ChevronUp className="h-4 w-4 shrink-0 text-slate-400" /> : <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />}
                        </button>
                        {isOpen && <p className="px-3 pb-3 text-xs leading-5 text-slate-600">{faq.answer}</p>}
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </section>

        <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div>
            <h2 className="flex items-center gap-2 text-sm font-black text-slate-900"><Send className="h-4 w-4 text-[#1e40af]" />Ask HR for help</h2>
            <p className="mt-0.5 text-xs text-slate-500">HR gets your concern in WorkMate with your mobile number and email, so they can follow up.</p>
          </div>
          <AskHrForm user={user} />
        </section>

        <section className="space-y-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <h2 className="flex items-center gap-2 text-sm font-black text-slate-900"><PhoneCall className="h-4 w-4 text-[#1e40af]" />Contact the office</h2>
          <p className="text-xs text-slate-600">DILG Provincial Office hotline: <span className="select-all font-bold text-slate-900">(042) 332-1543</span></p>
          <p className="text-xs text-slate-500">Monday to Friday, 8:00 AM to 5:00 PM</p>
        </section>

        <section id="privacy" className="space-y-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <h2 className="flex items-center gap-2 text-sm font-black text-slate-900"><ShieldCheck className="h-4 w-4 text-[#1e40af]" />Privacy notice</h2>
          <p className="text-xs leading-5 text-slate-600">WorkMate collects the following to record your attendance and process your requests, in line with the Data Privacy Act of 2012 (Republic Act No. 10173):</p>
          <ul className="list-disc space-y-1 pl-5 text-xs leading-5 text-slate-600">
            <li>Your name, employee ID, position, office, email, and mobile number.</li>
            <li>Your government ID photos and enrollment selfie, which HR reviews.</li>
            <li>Your Time In selfie, which is compared with your enrollment selfie.</li>
            <li>Your location at Time In and Time Out, and while your shift is open.</li>
            <li>Your leave and travel requests and their attachments.</li>
          </ul>
          <p className="text-xs leading-5 text-slate-600">Your fingerprint or face unlock stays on your phone. WorkMate receives only a confirmation that it matched. Your records are seen by HR, and your requests by the Supervisor who decides them. To ask about or correct your data, contact HR.</p>
        </section>
      </div>
    </div>
  );
}
