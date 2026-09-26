import { ReactNode, useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AlertCircle, Cast, Check, Copy, ExternalLink, FolderOpen, Loader2, Pencil, Plus, Trash2, Tv } from 'lucide-react';
import { toast } from 'sonner';
import {
  createMediaDevice, deleteMediaDevice, fetchMediaDevices, updateMediaDevice,
  type DlnaStatus, type MediaDeviceKind, type MediaDeviceSummary,
} from '../../api';
import { ConfirmModal } from '../ConfirmModal';
import { ProjectScopePicker, isScopeValid } from './ProjectScopePicker';

const INPUT_CLASS = 'w-full bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-xl px-4 py-2.5 text-sm text-neutral-900 dark:text-white placeholder-neutral-500 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 transition-all font-medium';
const PRIMARY_BUTTON = 'inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-blue-600/10 transition-all hover:bg-blue-500 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50';
const SECONDARY_BUTTON = 'inline-flex items-center justify-center gap-2 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-5 py-2.5 text-sm font-bold text-neutral-600 dark:text-neutral-400 transition-colors hover:text-neutral-900 dark:hover:text-white';
const CARD = 'rounded-card border border-neutral-200/50 dark:border-white/5 bg-white/40 dark:bg-neutral-900/40 backdrop-blur-3xl p-5 md:p-6';

function formatDate(ms: number): string {
  return new Date(ms).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function CopyField({ label, value }: { label: string; value: string }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast.success(t('mediaShare.toasts.copied'));
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard blocked (plain HTTP): the text is selectable.
    }
  };
  return (
    <div className="space-y-1.5 min-w-0">
      <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-500 ml-1">{label}</span>
      <div className="flex items-center gap-2">
        <code className={`min-w-0 flex-1 truncate select-all rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950 px-3 py-2 text-xs md:text-sm text-neutral-800 dark:text-neutral-200 font-mono`}>
          {value}
        </code>
        <button
          type="button"
          onClick={copy}
          className="flex-shrink-0 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-2 transition-all hover:bg-neutral-100 dark:hover:bg-neutral-800 active:scale-95"
          title={t('mediaShare.common.copy')}
          aria-label={t('mediaShare.common.copy')}
        >
          {copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4 text-neutral-500" />}
        </button>
      </div>
    </div>
  );
}

function StaticField({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1.5 min-w-0">
      <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-500 ml-1">{label}</span>
      <div className="truncate rounded-xl border border-dashed border-neutral-200 dark:border-neutral-800 px-3 py-2 text-xs md:text-sm italic text-neutral-500">{value}</div>
    </div>
  );
}

function SectionHeader({ icon, title, desc, action }: { icon: ReactNode; title: string; desc: string; action?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex items-start gap-3 min-w-0">
        <div className="flex-shrink-0 rounded-xl border border-blue-500/20 bg-blue-500/10 p-2.5 text-blue-500">{icon}</div>
        <div className="min-w-0">
          <h3 className="text-lg font-bold tracking-tight text-neutral-900 dark:text-white">{title}</h3>
          <p className="mt-1 max-w-3xl text-sm text-neutral-600 dark:text-neutral-400">{desc}</p>
        </div>
      </div>
      {action}
    </div>
  );
}

/** Form for a new WebDAV token or DLNA server, and for editing any device. */
function DeviceForm({ initialName, initialScope, namePlaceholder, submitLabel, onSubmit, onCancel }: {
  initialName: string;
  initialScope: string[] | null;
  namePlaceholder: string;
  submitLabel: string;
  onSubmit: (name: string, scope: string[] | null) => Promise<void>;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState(initialName);
  const [scope, setScope] = useState<string[] | null>(initialScope);
  const [busy, setBusy] = useState(false);
  const canSubmit = name.trim().length > 0 && isScopeValid(scope) && !busy;

  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    try {
      await onSubmit(name.trim(), scope);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4 rounded-xl border border-neutral-200/50 dark:border-white/5 bg-white/60 dark:bg-neutral-900/60 p-4 md:p-5">
      <div className="space-y-1.5">
        <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-500 ml-1">{t('mediaShare.common.name')}</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void submit(); }}
          placeholder={namePlaceholder}
          maxLength={64}
          autoFocus
          className={INPUT_CLASS}
        />
      </div>
      <ProjectScopePicker value={scope} onChange={setScope} />
      <div className="flex flex-wrap gap-3 pt-1">
        <button type="button" onClick={submit} disabled={!canSubmit} className={PRIMARY_BUTTON}>
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          {submitLabel}
        </button>
        <button type="button" onClick={onCancel} className={SECONDARY_BUTTON}>{t('mediaShare.common.cancel')}</button>
      </div>
    </div>
  );
}

function DeviceRow({ device, icon, onEdit, onRemove }: {
  device: MediaDeviceSummary;
  icon: ReactNode;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const { t } = useTranslation();
  const access = device.projectIds === null
    ? t('mediaShare.scope.all')
    : t('mediaShare.scope.selectedCount', { count: device.projectIds.length });
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-neutral-200/50 dark:border-white/5 bg-white/70 dark:bg-neutral-900/70 p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex-shrink-0 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950 p-2.5 text-neutral-500">{icon}</div>
        <div className="min-w-0 space-y-1">
          <div className="truncate font-bold text-neutral-900 dark:text-white">{device.name}</div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-neutral-500">
            <span className="rounded-full bg-blue-500/10 px-2 py-0.5 font-semibold text-blue-600 dark:text-blue-300">{access}</span>
            {device.kind === 'webdav' && device.tokenPrefix && <code className="font-mono">{device.tokenPrefix}…</code>}
            <span>
              {device.lastUsedAt ? t('mediaShare.common.lastUsed', { date: formatDate(device.lastUsedAt) }) : t('mediaShare.common.neverUsed')}
              {device.lastUsedAt && device.lastSeenIp ? ` ${t('mediaShare.common.from', { ip: device.lastSeenIp })}` : ''}
            </span>
          </div>
        </div>
      </div>
      <div className="flex flex-shrink-0 items-center gap-1 self-end sm:self-center">
        <button
          type="button"
          onClick={onEdit}
          className="rounded-xl p-2.5 text-neutral-500 transition-all hover:bg-neutral-100 hover:text-neutral-900 dark:hover:bg-neutral-800 dark:hover:text-white"
          title={t('mediaShare.common.edit')}
          aria-label={t('mediaShare.common.edit')}
        >
          <Pencil className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={onRemove}
          className="rounded-xl p-2.5 text-neutral-500 transition-all hover:bg-red-500/10 hover:text-red-500"
          title={t('mediaShare.common.remove')}
          aria-label={t('mediaShare.common.remove')}
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

export function MediaDevicesPanel() {
  const { t } = useTranslation();
  const [devices, setDevices] = useState<MediaDeviceSummary[] | null>(null);
  const [dlna, setDlna] = useState<DlnaStatus | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [creating, setCreating] = useState<'webdav' | 'dlna' | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newToken, setNewToken] = useState<string | null>(null);
  const [removeTarget, setRemoveTarget] = useState<MediaDeviceSummary | null>(null);

  const origin = window.location.origin;

  const load = useCallback(async () => {
    try {
      const result = await fetchMediaDevices();
      setDevices(result.devices);
      setDlna(result.dlna);
      setLoadError(null);
    } catch (e) {
      setLoadError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const create = async (kind: 'webdav' | 'dlna', name: string, scope: string[] | null) => {
    try {
      const result = await createMediaDevice(kind, name, scope);
      setCreating(null);
      if (result.token) setNewToken(result.token);
      toast.success(t('mediaShare.toasts.added'));
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const save = async (id: string, name: string, scope: string[] | null) => {
    try {
      await updateMediaDevice(id, { name, projectIds: scope });
      setEditingId(null);
      toast.success(t('mediaShare.toasts.saved'));
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const remove = async () => {
    if (!removeTarget) return;
    try {
      await deleteMediaDevice(removeTarget.id);
      toast.success(t('mediaShare.toasts.removed'));
      setRemoveTarget(null);
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const byKind = (kind: MediaDeviceKind) => (devices || []).filter((device) => device.kind === kind);

  const list = (kind: MediaDeviceKind, icon: ReactNode, emptyText: string) => {
    if (devices === null) {
      return <div className="h-16 animate-pulse rounded-xl bg-neutral-100 dark:bg-neutral-900/60" />;
    }
    const items = byKind(kind);
    if (items.length === 0) {
      return <p className="rounded-xl border-2 border-dashed border-neutral-200 dark:border-neutral-800 px-4 py-5 text-center text-sm text-neutral-500">{emptyText}</p>;
    }
    return (
      <div className="grid gap-3">
        {items.map((device) => editingId === device.id ? (
          <DeviceForm
            key={device.id}
            initialName={device.name}
            initialScope={device.projectIds}
            namePlaceholder=""
            submitLabel={t('mediaShare.common.save')}
            onSubmit={(name, scope) => save(device.id, name, scope)}
            onCancel={() => setEditingId(null)}
          />
        ) : (
          <DeviceRow
            key={device.id}
            device={device}
            icon={icon}
            onEdit={() => setEditingId(device.id)}
            onRemove={() => setRemoveTarget(device)}
          />
        ))}
      </div>
    );
  };

  const addButton = (kind: 'webdav' | 'dlna', label: string, disabled = false) => (
    <button
      type="button"
      onClick={() => { setCreating(kind); setNewToken(null); }}
      disabled={disabled}
      className="flex-shrink-0 rounded-xl bg-blue-600 p-2.5 text-white shadow-lg shadow-blue-600/10 transition-all hover:bg-blue-500 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
      title={label}
      aria-label={label}
    >
      <Plus className="h-4 w-4" />
    </button>
  );

  return (
    <div className="space-y-6">
      <p className="text-sm text-neutral-600 dark:text-neutral-400">{t('mediaShare.intro')}</p>
      {loadError && (
        <div className="flex items-center gap-2 rounded-card border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-600 dark:text-red-400">
          <AlertCircle className="h-4 w-4" />
          {loadError}
        </div>
      )}

      {/* TV mode */}
      <section className={`${CARD} space-y-5`}>
        <SectionHeader
          icon={<Tv className="h-5 w-5" />}
          title={t('mediaShare.tv.title')}
          desc={t('mediaShare.tv.desc')}
        />
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <p className="text-sm font-semibold text-neutral-800 dark:text-neutral-200">1. {t('mediaShare.tv.step1')}</p>
            <CopyField label="URL" value={`${origin}/tv`} />
            <a href="/tv" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:underline dark:text-blue-400">
              <ExternalLink className="h-3.5 w-3.5" />
              {t('mediaShare.tv.openHere')}
            </a>
          </div>
          <div className="space-y-2">
            <p className="text-sm font-semibold text-neutral-800 dark:text-neutral-200">2. {t('mediaShare.tv.step2')}</p>
            <Link to="/link" className={PRIMARY_BUTTON}>
              <Tv className="h-4 w-4" />
              {t('mediaShare.tv.linkButton')}
            </Link>
          </div>
        </div>
        <p className="text-xs text-neutral-500">{t('mediaShare.tv.webos')}</p>
        {list('tv', <Tv className="h-5 w-5" />, t('mediaShare.tv.empty'))}
      </section>

      {/* WebDAV */}
      <section className={`${CARD} space-y-5`}>
        <SectionHeader
          icon={<FolderOpen className="h-5 w-5" />}
          title={t('mediaShare.webdav.title')}
          desc={t('mediaShare.webdav.desc')}
          action={addButton('webdav', t('mediaShare.webdav.create'))}
        />
        <div className="grid gap-4 md:grid-cols-[2fr_1fr_1fr]">
          <CopyField label={t('mediaShare.webdav.address')} value={`${origin}/dav/`} />
          <StaticField label={t('mediaShare.webdav.username')} value={t('mediaShare.webdav.usernameValue')} />
          <StaticField label={t('mediaShare.webdav.password')} value={t('mediaShare.webdav.passwordValue')} />
        </div>
        <p className="text-xs text-neutral-500">{t('mediaShare.webdav.httpsNote')}</p>
        {newToken && (
          <div className="space-y-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
            <p className="flex items-center gap-2 text-sm font-bold text-emerald-600 dark:text-emerald-400">
              <Check className="h-4 w-4" />
              {t('mediaShare.webdav.tokenCreated')}
            </p>
            <CopyField label={t('mediaShare.webdav.password')} value={newToken} />
            <button type="button" onClick={() => setNewToken(null)} className="text-sm font-bold text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white">
              {t('mediaShare.common.done')}
            </button>
          </div>
        )}
        {creating === 'webdav' && (
          <DeviceForm
            initialName=""
            initialScope={null}
            namePlaceholder={t('mediaShare.webdav.namePlaceholder')}
            submitLabel={t('mediaShare.common.add')}
            onSubmit={(name, scope) => create('webdav', name, scope)}
            onCancel={() => setCreating(null)}
          />
        )}
        {list('webdav', <FolderOpen className="h-5 w-5" />, t('mediaShare.webdav.empty'))}
      </section>

      {/* DLNA */}
      <section className={`${CARD} space-y-5`}>
        <SectionHeader
          icon={<Cast className="h-5 w-5" />}
          title={t('mediaShare.dlna.title')}
          desc={t('mediaShare.dlna.desc')}
          action={addButton('dlna', t('mediaShare.dlna.create'), !dlna?.enabled)}
        />
        {dlna && !dlna.enabled && (
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-4 text-sm text-amber-700 dark:text-amber-300">{t('mediaShare.dlna.disabled')}</div>
        )}
        {dlna?.enabled && !dlna.running && (
          <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-600 dark:text-red-400">
            {t('mediaShare.dlna.notRunning', { error: dlna.error || '—' })}
          </div>
        )}
        {dlna?.enabled && dlna.running && (
          <div className="flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            {t('mediaShare.dlna.running', { addresses: dlna.addresses.join(', ') })}
          </div>
        )}
        {dlna?.enabled && <p className="text-xs text-neutral-500">{t('mediaShare.dlna.lanOnly')}</p>}
        {creating === 'dlna' && (
          <DeviceForm
            initialName={t('mediaShare.dlna.defaultName')}
            initialScope={null}
            namePlaceholder={t('mediaShare.dlna.namePlaceholder')}
            submitLabel={t('mediaShare.common.add')}
            onSubmit={(name, scope) => create('dlna', name, scope)}
            onCancel={() => setCreating(null)}
          />
        )}
        {list('dlna', <Cast className="h-5 w-5" />, t('mediaShare.dlna.empty'))}
      </section>

      <ConfirmModal
        isOpen={removeTarget !== null}
        onClose={() => setRemoveTarget(null)}
        onConfirm={remove}
        title={t('mediaShare.remove.title', { name: removeTarget?.name ?? '' })}
        message={t('mediaShare.remove.message')}
        confirmText={t('mediaShare.common.remove')}
        type="danger"
      />
    </div>
  );
}
