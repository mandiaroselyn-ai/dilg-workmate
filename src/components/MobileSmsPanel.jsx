import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft } from 'lucide-react';
import { smsStatus, smsTime, smsWhen } from '../utils/smsLog';
import { SmsBubbles, SmsReplyBar } from './SmsChat';

// A text that could not be sent to the employee's phone is still shown here.
const failedNote = () => (
  <p className="text-[11px] text-rose-700">Not sent to your phone. Check your mobile number in Profile.</p>
);

const Avatar = ({ className }) => (
  <span className={`flex shrink-0 items-center justify-center rounded-full font-extrabold ${className}`} aria-hidden="true">DW</span>
);

// The inbox row for the employee's one conversation, with its newest text.
const ConversationRow = ({ latest, onOpen }) => (
  <button type="button" onClick={onOpen} className="flex w-full items-start gap-3 border-b border-slate-100 bg-white px-4 py-3.5 text-left hover:bg-slate-50 active:bg-slate-100">
    <Avatar className="h-11 w-11 bg-[#1e40af] text-sm text-white" />
    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
      <span className="flex items-center gap-2">
        <span className="truncate text-[15px] font-bold text-slate-900">DILG WorkMate</span>
        {latest && <span className="ml-auto shrink-0 text-xs text-slate-500">{smsWhen(latest)}</span>}
      </span>
      <span className="line-clamp-2 text-[13px] leading-snug text-slate-600">
        {latest ? `${latest.direction === 'inbound' ? 'You: ' : ''}${latest.message}` : 'No texts yet. Tap to message HR.'}
      </span>
      {latest && smsStatus(latest) === 'Failed' && (
        <span className="mt-0.5 self-start rounded bg-rose-50 px-1.5 py-0.5 text-[10px] font-bold text-rose-700">Not delivered</span>
      )}
    </span>
  </button>
);

// The employee's texts from DILG WorkMate, like a phone's Messages app: first the inbox
// with the "DILG WorkMate" conversation, which opens into chat bubbles (WorkMate's texts on
// the left, the employee's replies on the right). With `onReply`, the employee can type a
// message to HR at the bottom. `layout` is 'screen' (full screen in the phone app and
// phone browsers) or 'dropdown' (under the SMS button in a computer browser).
export function EmployeeSms({ smsAlerts = [], onClose, onReply, layout = 'screen' }) {
  const [open, setOpen] = useState(false);
  const messages = useMemo(
    () => [...smsAlerts].sort((a, b) => (smsTime(a) ?? 0) - (smsTime(b) ?? 0)),
    [smsAlerts]
  );
  const latest = messages[messages.length - 1];
  const screen = layout === 'screen';
  const goBack = open ? () => setOpen(false) : onClose;

  return (
    <>
      <header className="flex-shrink-0 bg-gradient-to-r from-[#1e40af] to-indigo-900 text-white">
        <div className="flex items-center gap-2.5 px-3 py-2.5">
          {goBack && (
            <button
              type="button"
              onClick={goBack}
              aria-label={open ? 'Back to messages' : 'Back'}
              className="rounded-lg bg-white/15 p-1.5 hover:bg-white/25 active:bg-white/30"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
          )}
          {open ? (
            <>
              <Avatar className="h-9 w-9 bg-white/20 text-xs" />
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-[15px] font-bold tracking-tight">DILG WorkMate</h2>
                <p className="truncate text-[11px] text-white/75">Texts and messages with HR</p>
              </div>
            </>
          ) : (
            <h2 className={`truncate text-[15px] font-bold tracking-tight ${goBack ? '' : 'px-1'}`}>Messages</h2>
          )}
        </div>
      </header>

      {open ? (
        <>
          <SmsBubbles
            messages={messages}
            isMine={sms => sms.direction === 'inbound'}
            failedNote={failedNote}
            emptyText="No texts yet. Send HR a message below."
            className={screen ? 'min-h-0 flex-1' : 'h-80'}
          />
          {onReply ? (
            <div className={screen ? 'flex-shrink-0 pb-[env(safe-area-inset-bottom)]' : ''}>
              <SmsReplyBar name="HR" onSend={onReply} placeholder="Message to HR" note="Goes to HR in WorkMate" />
            </div>
          ) : (
            <p className="flex-shrink-0 border-t border-slate-200 bg-slate-50 px-4 py-3 text-center text-xs text-slate-600">
              To reply, text back from your phone's Messages app. HR sees your reply.
            </p>
          )}
        </>
      ) : (
        <div className={screen ? 'min-h-0 flex-1 overflow-y-auto bg-white' : 'bg-white'}>
          <ConversationRow latest={latest} onOpen={() => setOpen(true)} />
        </div>
      )}
    </>
  );
}

// The full-screen Messages view. It is drawn on the page itself, outside the header's layer,
// so it covers the bottom menu while open.
export default function MobileSmsPanel({ smsAlerts = [], onClose, onReply }) {
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label="Messages" className="fixed inset-0 z-[60] flex flex-col bg-white text-slate-900">
      <EmployeeSms smsAlerts={smsAlerts} onClose={onClose} onReply={onReply} layout="screen" />
    </div>,
    document.body
  );
}
