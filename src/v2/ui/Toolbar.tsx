import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, ButtonGroup, cx, Fab, IconButton, type ButtonSize } from '../../m3';

export interface SegmentedOption<V extends string> {
  value: V;
  label: ReactNode;
  icon?: string;
}

/** Single-choice connected button group (the M3 Expressive segmented control). */
export function Segmented<V extends string>({
  options,
  value,
  onChange,
  size = 'xs',
  className,
  'aria-label': ariaLabel,
  fullWidth,
}: {
  options: SegmentedOption<V>[];
  value: V;
  onChange: (value: V) => void;
  size?: ButtonSize;
  className?: string;
  'aria-label'?: string;
  fullWidth?: boolean;
}) {
  return (
    <ButtonGroup
      variant="connected"
      selection="single"
      size={size}
      value={value}
      onChange={(next) => next && onChange(next as V)}
      aria-label={ariaLabel}
      className={className}
      fullWidth={fullWidth}
    >
      {options.map((option) => (
        <Button key={option.value} value={option.value} variant="tonal" icon={option.icon}>
          {option.label}
        </Button>
      ))}
    </ButtonGroup>
  );
}

/** Floating action button pinned to the bottom of the window on phones only. */
export function MobileFab({ icon, label, onClick, href }: { icon: string; label: string; onClick?: () => void; href?: string }) {
  return (
    <div className="v2-mobile-fab">
      {href !== undefined ? <Fab icon={icon} aria-label={label} href={href} size="regular" /> : <Fab icon={icon} aria-label={label} onClick={onClick} size="regular" />}
    </div>
  );
}

/** Responsive card grid. */
export function CardGrid({ children, min = 280, className }: { children: ReactNode; min?: number; className?: string }) {
  return (
    <div className={cx('v2-card-grid', className)} style={{ ['--v2-card-min' as string]: `${min}px` }}>
      {children}
    </div>
  );
}

export type ListLayout = 'cards' | 'list';
export const LIST_LAYOUTS: readonly ListLayout[] = ['cards', 'list'];

/** Switches a list between cards and rows; the button shows the layout it switches to. */
export function LayoutToggle({ value, onChange }: { value: ListLayout; onChange: (value: ListLayout) => void }) {
  const { t } = useTranslation();
  const next: ListLayout = value === 'cards' ? 'list' : 'cards';
  return <IconButton icon={next === 'cards' ? 'grid_view' : 'view_agenda'} size="sm" label={next === 'cards' ? t('v2.library.cards') : t('v2.library.list')} tooltip onClick={() => onChange(next)} />;
}
