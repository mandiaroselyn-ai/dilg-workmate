import React, { useState } from 'react';
import { Paperclip } from 'lucide-react';
import DocumentViewer from './DocumentViewer';
import { dataUrlToFile } from '../utils/documentFiles';

// A request's attached files. Tapping one opens it in the document viewer (a PDF page by
// page, a photo as it is, any other file as a download). A file kept without its contents
// is listed by name only. Taps do not reach a list row the files sit in.
export default function AttachmentList({ attachments = [], className = '', itemClassName = '', emptyText = null }) {
  const [viewer, setViewer] = useState(null); // { key, title, load }
  const files = Array.isArray(attachments) ? attachments : [];
  if (!files.length) return emptyText;

  const open = (event, file, name) => {
    event.stopPropagation();
    setViewer({
      key: Date.now(),
      title: name,
      load: () => {
        const { type, bytes } = dataUrlToFile(file.dataUrl);
        return { fileName: name, fileType: type, bytes };
      }
    });
  };

  return (
    <>
      <div className={className}>
        {files.map((file, index) => {
          const name = (typeof file === 'string' ? file : file?.name) || `Attachment ${index + 1}`;
          return file?.dataUrl ? (
            <button
              key={file.id || `${name}-${index}`}
              type="button"
              onClick={event => open(event, file, name)}
              title={`Open ${name}`}
              className={`inline-flex items-center gap-1 underline decoration-dotted underline-offset-2 ${itemClassName}`}
            >
              <Paperclip className="h-3 w-3 shrink-0" />
              <span className="truncate">{file.type ? `${file.type}: ` : ''}{name}</span>
            </button>
          ) : (
            <span key={`${name}-${index}`} className={`inline-flex items-center gap-1 ${itemClassName}`}>
              <Paperclip className="h-3 w-3 shrink-0" />
              <span className="truncate">{name}</span>
            </span>
          );
        })}
      </div>
      {viewer && (
        <div onClick={event => event.stopPropagation()}>
          <DocumentViewer key={viewer.key} title={viewer.title} load={viewer.load} onClose={() => setViewer(null)} />
        </div>
      )}
    </>
  );
}
