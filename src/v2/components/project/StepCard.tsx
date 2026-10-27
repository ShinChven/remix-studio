import type { DragEvent, ReactNode } from 'react';
import { cx, Icon, Text } from '../../../m3';

export interface StepDragProps {
  index: number;
  draggedIndex: number | null;
  dragOverIndex: number | null;
  onDragStart: (e: DragEvent, index: number) => void;
  onDragOver: (e: DragEvent, index: number) => void;
  onDrop: (e: DragEvent, index: number) => void;
  onDragEnd: () => void;
}

export interface StepCardProps extends Partial<StepDragProps> {
  icon: string;
  label: ReactNode;
  /** Shown after the label, e.g. a character count or a prompt/negative switch. */
  extra?: ReactNode;
  actions?: ReactNode;
  disabled?: boolean;
  /** Tone of the leading icon badge. */
  tone?: 'primary' | 'secondary' | 'tertiary' | 'error';
  gridView?: boolean;
  className?: string;
  children?: ReactNode;
}

/** A step in the workflow list: drag handle, kind badge, actions and the step's content. */
export function StepCard({ icon, label, extra, actions, disabled, tone = 'primary', gridView, className, children, index, draggedIndex, dragOverIndex, onDragStart, onDragOver, onDrop, onDragEnd }: StepCardProps) {
  const draggable = index !== undefined && onDragStart !== undefined;
  return (
    <div
      className={cx('v2-step', className)}
      data-disabled={disabled ? '' : undefined}
      data-dragging={draggable && draggedIndex === index ? '' : undefined}
      data-drop-target={draggable && dragOverIndex === index && draggedIndex !== index ? '' : undefined}
      data-grid={gridView ? '' : undefined}
      draggable={draggable}
      onDragStart={draggable ? (e) => onDragStart!(e, index!) : undefined}
      onDragOver={draggable ? (e) => onDragOver?.(e, index!) : undefined}
      onDrop={draggable ? (e) => onDrop?.(e, index!) : undefined}
      onDragEnd={draggable ? onDragEnd : undefined}
    >
      <div className="v2-step__head">
        <span className="v2-step__badge" data-tone={tone} data-draggable={draggable ? '' : undefined}>
          <Icon name={icon} size={16} className="v2-step__kind" />
          {draggable && <Icon name="drag_indicator" size={16} className="v2-step__grip" />}
        </span>
        <Text as="span" variant="label-medium" emphasized className="v2-step__label">
          {label}
        </Text>
        {extra}
        {actions && <div className="v2-step__actions">{actions}</div>}
      </div>
      {children && <div className="v2-step__body">{children}</div>}
    </div>
  );
}

/** An icon button that opens a file picker and hands the change event on. */
export function FilePickButton({ accept, busy, label, icon, onChange, variant = 'icon' }: { accept: string; busy?: boolean; label: string; icon: string; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void; variant?: 'icon' | 'tile' }) {
  return (
    <label className={cx('v2-file-pick m3-focus-ring', variant === 'tile' && 'v2-file-pick--tile')} title={label} aria-disabled={busy || undefined}>
      <Icon name={busy ? 'progress_activity' : icon} size={variant === 'tile' ? 24 : 18} className={busy ? 'v2-spin' : undefined} />
      {variant === 'tile' && (
        <Text as="span" variant="label-medium">
          {label}
        </Text>
      )}
      <input type="file" accept={accept} hidden disabled={busy} onChange={onChange} aria-label={label} />
    </label>
  );
}
