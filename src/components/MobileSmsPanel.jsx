import React, { useMemo } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft } from 'lucide-react';
import { smsTime } from '../utils/smsLog';
import { SmsBubbles, SmsReplyBar } from './SmsChat';

// A text that could not be sent to the employee's phone is still shown here.
const failedNote = () => (
  <p className="text-[11px] text-rose-700">Not sent to your phone. Check your mobile number in Profile.</p>
);

// The employee's texts from DILG WorkMate, shown as one conversation like a phone's
// Messages app: WorkMate's texts on the left, the employee's replies on the right. With
// `onReply`, the employee can type a message to HR at the bottom. It is drawn on the page
// itself, outside the header's layer, so it covers the bottom menu while open.
export default function MobileSmsPanel({ smsAlerts = [], onClose, onReply }) {
  const messages = useMemo(
    () => [...smsAlerts].sort((a, b) => (smsTime(a) ?? 0) - (smsTime(b) ?? 0)),
    [smsAlerts]
  );

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label="Messages" className="fixed inset-0 z-[60] flex flex-col bg-white text-slate-900">
      <header className="flex-shrink-0 bg-gradient-to-r from-[#1e40af] to-indigo-900 text-white">
        <div className="flex items-center gap-2.5 px-3 py-2.5">
          <button
            type="button"
            onClick={onClose}
            aria-label="Back"
            className="rounded-lg bg-white/15 p-1.5 hover:bg-white/25 active:bg-white/30"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/20 text-xs font-extrabold">DW</span>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-[15px] font-bold tracking-tight">DILG WorkMate</h2>
            <p className="truncate text-[11px] text-white/75">Texts and messages with HR</p>
          </div>
        </div>
      </header>

      <SmsBubbles
        messages={messages}
        isMine={sms => sms.direction === 'inbound'}
        failedNote={failedNote}
        emptyText="No texts yet."
        className="min-h-0 flex-1"
      />

      {onReply ? (
        <div className="flex-shrink-0 pb-[env(safe-area-inset-bottom)]">
          <SmsReplyBar name="HR" onSend={onReply} placeholder="Message to HR" note="Goes to HR in WorkMate" />
        </div>
      ) : (
        <p className="flex-shrink-0 border-t border-slate-200 bg-slate-50 px-4 py-3 text-center text-xs text-slate-600">
          To reply, text back from your phone's Messages app. HR sees your reply.
        </p>
      )}
    </div>,
    document.body
  );
}
