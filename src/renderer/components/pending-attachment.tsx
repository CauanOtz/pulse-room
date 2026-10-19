import { useEffect, useState } from 'react';
import { FileText, X } from 'lucide-react';
import { fileSize } from '../../shared/chat';

export function PendingAttachment({ file, busy, onRemove }: { file: File; busy: boolean; onRemove(): void }) {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    if (!file.type.startsWith('image/')) return;
    const value = URL.createObjectURL(file);
    setUrl(value);
    return () => URL.revokeObjectURL(value);
  }, [file]);
  return (
    <div className="pending-attachment">
      {url ? <img src={url} alt="" /> : <FileText size={22} aria-hidden="true" />}
      <span>
        <strong title={file.name}>{file.name}</strong>
        <small>{fileSize(file.size)}</small>
      </span>
      <button type="button" disabled={busy} aria-label={`Remove ${file.name}`} onClick={onRemove}>
        <X size={14} />
      </button>
    </div>
  );
}
