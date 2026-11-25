import type { ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { AlertCircle, ExternalLink, LoaderCircle } from 'lucide-react';
import type { Translator } from './i18n';
import './styles.css';

export function mount(view: ReactNode) {
  createRoot(document.getElementById('root')!).render(view);
}

export function Header({
  title,
  subtitle,
  url,
  onOpen,
  t,
  children,
}: {
  title: string;
  subtitle?: string;
  url?: string;
  onOpen: (url: string) => void;
  t: Translator;
  children?: ReactNode;
}) {
  return (
    <header className="rs-header">
      <div className="rs-header-text">
        <h1 className="rs-title" title={title}>{title}</h1>
        {subtitle ? <p className="rs-subtitle">{subtitle}</p> : null}
      </div>
      <div className="rs-header-actions">
        {children}
        {url ? (
          <button type="button" className="rs-button" onClick={() => onOpen(url)} title={t('openInStudio')}>
            <ExternalLink size={16} aria-hidden />
            <span className="rs-label-collapsible">{t('openInStudio')}</span>
          </button>
        ) : null}
      </div>
    </header>
  );
}

export function StateMessage({ tone, children }: { tone?: 'danger'; children: ReactNode }) {
  return (
    <div className="rs-state" data-tone={tone} role={tone === 'danger' ? 'alert' : 'status'}>
      {tone === 'danger' ? <AlertCircle size={18} aria-hidden /> : null}
      <span>{children}</span>
    </div>
  );
}

export function Waiting({ t }: { t: Translator }) {
  return (
    <div className="rs-view">
      <div className="rs-state" role="status">
        <LoaderCircle size={18} className="rs-spin" aria-hidden />
        <span>{t('waiting')}</span>
      </div>
    </div>
  );
}

export function formatTime(value: string | number | Date | null | undefined, locale: string, withDate = true) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(locale, withDate
    ? { dateStyle: 'medium', timeStyle: 'short' }
    : { timeStyle: 'medium' }).format(date);
}

export function formatNumber(value: number, locale: string) {
  return new Intl.NumberFormat(locale).format(value);
}
