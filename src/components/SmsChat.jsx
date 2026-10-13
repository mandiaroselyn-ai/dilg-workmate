import React, { useEffect, useRef, useState } from 'react';
import { Send } from 'lucide-react';
import { SMS_KIND_LABELS, smsKind, smsStatus, smsTime } from '../utils/smsLog';

// The server starts each text HR types with this, so it fits in the 918-character SMS limit.
export const SENT_AS = 'DILG WorkMate HR:';
export const MESSAGE_MAX = 900;

const dayLabel = time => (time === null ? '' : new Date(time).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }));
// What an automatic text was about, shown under it; texts HR typed and replies need no label.
const LABELED_KINDS = ['attendance', 'account', 'request', 'review'];

const clockLabel = (sms, time) => (time === null ? sms.timestamp || '' : new Date(time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }));

// A conversation drawn like a phone's Messages app, oldest at the top: texts for which
// `isMine` is true sit on the right in blue, the rest on the left in gray, with the day
// shown between days. `failedNote` adds what to say (and do) under a text that was not
// delivered. It scrolls to the newest text when it opens and when a text arrives.
export function SmsBubbles({ messages = [], isMine, failedNote, emptyText = 'No texts yet.', className = '' }) {
  const listRef = useRef(null);
  const lastId = messages[messages.length - 1]?.id;
  useEffect(() => {
    // Scrolls only the conversation, never the page around it.
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [lastId, messages.length]);

  let previousDay = null;
  return (
    <div ref={listRef} className={`overflow-y-auto bg-white px-3 py-3 ${className}`}>
      {messages.length === 0 && <p className="py-10 text-center text-[13px] font-semibold text-slate-500">{emptyText}</p>}
      <ol className="space-y-1.5">
        {messages.map(sms => {
          const time = smsTime(sms);
          const day = dayLabel(time);
          const showDay = day && day !== previousDay;
          previousDay = day;
          const mine = isMine(sms);
          const failed = smsStatus(sms) === 'Failed';
          const kind = smsKind(sms);
          const bubble = mine
            ? `rounded-br-md text-white ${failed ? 'bg-[#0B4EA2]/60' : 'bg-[#0B4EA2]'}`
            : 'rounded-bl-md bg-slate-200 text-slate-900';
          return (
            <li key={sms.id || `${sms.timestamp}-${sms.message}`}>
              {showDay && <p className="pb-1 pt-3 text-center text-[11px] font-bold text-slate-500">{day}</p>}
              <div className={`flex flex-col ${mine ? 'items-end' : 'items-start'}`}>
                <p className={`max-w-[80%] whitespace-pre-line break-words rounded-2xl px-3.5 py-2 text-[13.5px] leading-snug ${bubble}`}>{sms.message}</p>
                <p className={`mt-0.5 px-1 text-[10.5px] ${failed ? 'font-bold text-rose-700' : 'text-slate-500'}`}>
                  {clockLabel(sms, time)}
                  {LABELED_KINDS.includes(kind) ? ` · ${SMS_KIND_LABELS[kind]}` : ''}
                  {sms.channel === 'app' ? ' · Sent in WorkMate' : ''}
                  {failed ? ' · Not delivered' : ''}
                </p>
                {failed && failedNote && <div className={`max-w-[85%] px-1 ${mine ? 'text-right' : 'text-left'}`}>{failedNote(sms)}</div>}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

// The box at the bottom of a conversation for typing a message, with a round Send button.
// Enter sends; Shift+Enter starts a new line. `note` says where the message goes.
export function SmsReplyBar({ name, onSend, placeholder = 'Text message', note = `Starts with "${SENT_AS}"` }) {
  const [message, setMessage] = useState('');
  // '', 'sending', or why the text was not sent.
  const [state, setState] = useState('');
  const canSend = Boolean(message.trim()) && state !== 'sending';

  const send = async () => {
    if (!canSend) return;
    setState('sending');
    try {
      await onSend(message.trim());
      setMessage('');
      setState('');
    } catch (error) {
      setState(error.message || 'The text could not be sent.');
    }
  };

  return (
    <form onSubmit={event => { event.preventDefault(); send(); }} className="border-t border-slate-200 bg-white px-3 pb-2.5 pt-2">
      {state && state !== 'sending' && <p role="alert" className="mb-1.5 text-xs font-bold text-rose-800">{state}</p>}
      <div className="flex items-end gap-2">
        <label className="min-w-0 flex-1">
          <span className="sr-only">Text {name}</span>
          <textarea
            value={message}
            onChange={event => { setMessage(event.target.value); if (state !== 'sending') setState(''); }}
            onKeyDown={event => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                send();
              }
            }}
            maxLength={MESSAGE_MAX}
            rows={Math.min(4, message.split('\n').length)}
            placeholder={placeholder}
            className="block max-h-28 w-full resize-none rounded-2xl border border-slate-300 bg-slate-100 px-3.5 py-2 text-[13.5px] outline-none focus:border-[#0B4EA2] focus:bg-white"
          />
        </label>
        <button
          type="submit"
          disabled={!canSend}
          aria-label={state === 'sending' ? 'Sending' : 'Send'}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#0B4EA2] text-white hover:bg-[#093f84] disabled:opacity-40"
        >
          <Send className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
      <p className="mt-1 px-1 text-[10.5px] text-slate-500">
        {state === 'sending' ? 'Sending...' : `${note} · ${message.length}/${MESSAGE_MAX}`}
      </p>
    </form>
  );
}
