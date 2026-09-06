import React, { useEffect, useId, useRef, useState } from 'react';
import { ChevronDown, Search, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export function AlbumSearch({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState(value);
  const [isComposing, setIsComposing] = useState(false);
  useEffect(() => setDraft(value), [value]);
  useEffect(() => {
    if (isComposing || draft === value) return;
    const timer = window.setTimeout(() => onChange(draft), 300);
    return () => window.clearTimeout(timer);
  }, [draft, value, onChange, isComposing]);

  return (
    <div className="flex items-center gap-2 min-h-8 w-full @sm/pane:w-56 @min-[56rem]/pane:w-64 px-2.5 rounded-lg border border-neutral-300 dark:border-neutral-700 focus-within:ring-2 focus-within:ring-blue-500/40">
      <Search className="w-3.5 h-3.5 shrink-0 text-neutral-500" />
      <input
        type="search"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onCompositionStart={() => setIsComposing(true)}
        onCompositionEnd={() => setIsComposing(false)}
        placeholder={t('projectViewer.album.searchPlaceholder')}
        aria-label={t('projectViewer.album.searchPlaceholder')}
        className="w-full min-w-0 py-1.5 bg-transparent text-xs text-neutral-800 dark:text-neutral-200 outline-none [&::-webkit-search-cancel-button]:appearance-none"
      />
      {draft && (
        <button type="button" onClick={() => { setDraft(''); onChange(''); }} aria-label={t('projectViewer.album.clearSearch')} className="p-1 text-neutral-500 hover:text-blue-500">
          <X className="w-3 h-3" />
        </button>
      )}
    </div>
  );
}

export interface AlbumAction {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  destructive?: boolean;
}

export function AlbumActionsMenu({ actions, disabled }: { actions: AlbumAction[]; disabled?: boolean }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const close = () => { setOpen(false); trigger.current?.focus(); };

  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);

  useEffect(() => {
    if (!open) return;
    root.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
    const dismiss = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, [open]);

  return (
    <div ref={root} className="relative" onBlur={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget as Node)) setOpen(false);
    }} onKeyDown={(event) => {
      if (event.key === 'Escape') { event.preventDefault(); close(); }
    }}>
      <button
        ref={trigger}
        type="button"
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen(!open)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setOpen(true); }
        }}
        className="flex items-center gap-1.5 min-h-8 px-3 py-1.5 text-[10px] font-bold rounded-lg border border-blue-500/30 bg-blue-500/10 text-blue-500 hover:bg-blue-500/20 disabled:opacity-50"
      >
        {t('projectViewer.album.actions')}
        <ChevronDown className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div id={menuId} role="menu" aria-label={t('projectViewer.album.actions')}
          className="absolute top-full left-0 mt-2 w-60 max-w-[calc(100vw-2rem)] p-1.5 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-xl z-[100]"
          onKeyDown={(event) => {
            const items = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'));
            const index = items.indexOf(document.activeElement as HTMLButtonElement);
            let next: number;
            if (event.key === 'ArrowDown') next = (index + 1) % items.length;
            else if (event.key === 'ArrowUp') next = (index - 1 + items.length) % items.length;
            else if (event.key === 'Home') next = 0;
            else if (event.key === 'End') next = items.length - 1;
            else return;
            event.preventDefault();
            items[next]?.focus();
          }}
        >
          {actions.map((action) => (
            <button key={action.label} type="button" role="menuitem" tabIndex={-1}
              onClick={() => { close(); action.onClick(); }}
              className={`flex items-center gap-2.5 w-full px-3 py-2.5 rounded-lg text-left text-xs font-medium outline-none ${action.destructive
                ? 'text-red-500 hover:bg-red-500/10 focus:bg-red-500/10'
                : 'text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 focus:bg-neutral-100 dark:focus:bg-neutral-800'}`}
            >
              {action.icon}
              {action.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
