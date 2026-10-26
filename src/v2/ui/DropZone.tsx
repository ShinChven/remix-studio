import { useRef, useState, type ReactNode } from 'react';
import { Button, cx, Icon, LinearProgress, Text } from '../../m3';

export interface DropZoneProps {
  title: ReactNode;
  hint?: ReactNode;
  icon?: string;
  accept?: string;
  multiple?: boolean;
  /** Label of the choose-file button. */
  buttonLabel: ReactNode;
  buttonIcon?: string;
  busy?: boolean;
  /** 0–100 while uploading; shows a progress bar. */
  progress?: number | null;
  disabled?: boolean;
  onFiles: (files: File[]) => void;
  className?: string;
  children?: ReactNode;
}

/** Drop target with a file button: drag files onto it or pick them. */
export function DropZone({ title, hint, icon = 'upload_file', accept, multiple, buttonLabel, buttonIcon = 'upload', busy, progress, disabled, onFiles, className, children }: DropZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  return (
    <div
      className={cx('v2-dropzone', className)}
      data-dragging={dragging ? '' : undefined}
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setDragging(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        if (disabled) return;
        const files = Array.from(e.dataTransfer.files ?? []);
        if (files.length) onFiles(multiple ? files : files.slice(0, 1));
      }}
    >
      <div className="v2-dropzone__row">
        <span className="v2-kind-badge bg-tertiary-container text-on-tertiary-container">
          <Icon name={icon} />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <Text variant="title-small" emphasized>
            {title}
          </Text>
          {hint && (
            <Text variant="body-small" className="text-on-surface-variant">
              {hint}
            </Text>
          )}
        </div>
        <Button variant="filled" icon={buttonIcon} loading={busy} disabled={disabled} onClick={() => inputRef.current?.click()}>
          {buttonLabel}
        </Button>
      </div>
      {progress !== null && progress !== undefined && <LinearProgress value={progress} shape="wavy" aria-label="Upload progress" />}
      {children}
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        hidden
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          if (files.length) onFiles(files);
          e.target.value = '';
        }}
      />
    </div>
  );
}
