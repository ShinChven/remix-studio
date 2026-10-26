import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { createMediaDevice, deleteMediaDevice, fetchMediaDevices, updateMediaDevice, type DlnaStatus, type MediaDeviceKind, type MediaDeviceSummary } from '../../../api';
import { Button, Icon, IconButton, Text, TextField, useSnackbar } from '../../../m3';
import { ConfirmDialog } from '../../ui/ConfirmDialog';
import { CopyField, StaticField } from '../../ui/CopyField';
import { ErrorState, Section } from '../../ui/Page';
import { Row, RowList } from '../../ui/Rows';
import { StatusPill } from '../../ui/Stat';
import { isScopeValid, ProjectScopePicker } from './ProjectScopePicker';

const formatDate = (ms: number) => new Date(ms).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

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
    <div className="v2-inline-form">
      <TextField
        variant="outlined"
        label={t('mediaShare.common.name')}
        value={name}
        onValueChange={setName}
        onKeyDown={(e) => e.key === 'Enter' && void submit()}
        placeholder={namePlaceholder}
        maxLength={64}
        showCounter={false}
        autoFocus
        fullWidth
      />
      <ProjectScopePicker value={scope} onChange={setScope} />
      <div className="flex flex-wrap gap-2">
        <Button variant="filled" loading={busy} disabled={!canSubmit} onClick={() => void submit()}>
          {submitLabel}
        </Button>
        <Button variant="text" onClick={onCancel}>
          {t('mediaShare.common.cancel')}
        </Button>
      </div>
    </div>
  );
}

/** TV mode, WebDAV tokens and DLNA servers that read the user's media. */
export function MediaDevicesPanel() {
  const { t } = useTranslation();
  const snackbar = useSnackbar();
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
      snackbar.show(t('mediaShare.toasts.added'));
      await load();
    } catch (e) {
      snackbar.show((e as Error).message);
    }
  };

  const save = async (id: string, name: string, scope: string[] | null) => {
    try {
      await updateMediaDevice(id, { name, projectIds: scope });
      setEditingId(null);
      snackbar.show(t('mediaShare.toasts.saved'));
      await load();
    } catch (e) {
      snackbar.show((e as Error).message);
    }
  };

  const list = (kind: MediaDeviceKind, icon: string, emptyText: string): ReactNode => {
    if (devices === null) return <div className="v2-skeleton" style={{ height: 64 }} />;
    const items = devices.filter((d) => d.kind === kind);
    if (items.length === 0) {
      return (
        <Text variant="body-medium" className="v2-dashed-note">
          {emptyText}
        </Text>
      );
    }
    return (
      <RowList>
        {items.map((device) =>
          editingId === device.id ? (
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
            <Row
              key={device.id}
              lead={<Icon name={icon} />}
              title={device.name}
              meta={
                <>
                  <StatusPill tone="primary">{device.projectIds === null ? t('mediaShare.scope.all') : t('mediaShare.scope.selectedCount', { count: device.projectIds.length })}</StatusPill>
                  {device.kind === 'webdav' && device.tokenPrefix && <code className="font-mono">{device.tokenPrefix}…</code>}
                  <span>
                    {device.lastUsedAt ? t('mediaShare.common.lastUsed', { date: formatDate(device.lastUsedAt) }) : t('mediaShare.common.neverUsed')}
                    {device.lastUsedAt && device.lastSeenIp ? ` ${t('mediaShare.common.from', { ip: device.lastSeenIp })}` : ''}
                  </span>
                </>
              }
              actions={
                <>
                  <IconButton icon="edit" label={t('mediaShare.common.edit')} tooltip size="xs" onClick={() => setEditingId(device.id)} />
                  <IconButton icon="delete" label={t('mediaShare.common.remove')} tooltip size="xs" className="v2-button-danger" onClick={() => setRemoveTarget(device)} />
                </>
              }
            />
          ),
        )}
      </RowList>
    );
  };

  const addButton = (kind: 'webdav' | 'dlna', label: string, disabled = false) => (
    <IconButton
      icon="add"
      label={label}
      tooltip
      variant="filled"
      disabled={disabled}
      onClick={() => {
        setCreating(kind);
        setNewToken(null);
      }}
    />
  );

  return (
    <div className="flex flex-col gap-5">
      <Text variant="body-medium" className="text-on-surface-variant">
        {t('mediaShare.intro')}
      </Text>
      {loadError && <ErrorState message={loadError} />}

      <Section variant="card" icon={<Icon name="tv" />} title={t('mediaShare.tv.title')} description={t('mediaShare.tv.desc')}>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Text variant="label-large" emphasized>
              1. {t('mediaShare.tv.step1')}
            </Text>
            <CopyField label="URL" value={`${origin}/tv`} copiedMessage={t('mediaShare.toasts.copied')} />
            <Button variant="text" size="xs" icon="open_in_new" href="/tv" target="_blank" rel="noreferrer" className="self-start">
              {t('mediaShare.tv.openHere')}
            </Button>
          </div>
          <div className="flex flex-col items-start gap-2">
            <Text variant="label-large" emphasized>
              2. {t('mediaShare.tv.step2')}
            </Text>
            <Button variant="filled" icon="tv" href="/link">
              {t('mediaShare.tv.linkButton')}
            </Button>
          </div>
        </div>
        <Text variant="body-small" className="text-on-surface-variant">
          {t('mediaShare.tv.webos')}
        </Text>
        {list('tv', 'tv', t('mediaShare.tv.empty'))}
      </Section>

      <Section
        variant="card"
        icon={<Icon name="folder_open" />}
        title={t('mediaShare.webdav.title')}
        description={t('mediaShare.webdav.desc')}
        actions={addButton('webdav', t('mediaShare.webdav.create'))}
      >
        <div className="grid gap-4 md:grid-cols-[2fr_1fr_1fr]">
          <CopyField label={t('mediaShare.webdav.address')} value={`${origin}/dav/`} copiedMessage={t('mediaShare.toasts.copied')} />
          <StaticField label={t('mediaShare.webdav.username')} value={t('mediaShare.webdav.usernameValue')} />
          <StaticField label={t('mediaShare.webdav.password')} value={t('mediaShare.webdav.passwordValue')} />
        </div>
        <Text variant="body-small" className="text-on-surface-variant">
          {t('mediaShare.webdav.httpsNote')}
        </Text>
        {newToken && (
          <div className="v2-notice flex-col" data-tone="success">
            <Text variant="label-large" emphasized className="inline-flex items-center gap-2">
              <Icon name="check" size={18} />
              {t('mediaShare.webdav.tokenCreated')}
            </Text>
            <CopyField label={t('mediaShare.webdav.password')} value={newToken} copiedMessage={t('mediaShare.toasts.copied')} className="w-full" />
            <Button variant="text" size="xs" onClick={() => setNewToken(null)}>
              {t('mediaShare.common.done')}
            </Button>
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
        {list('webdav', 'folder_open', t('mediaShare.webdav.empty'))}
      </Section>

      <Section
        variant="card"
        icon={<Icon name="cast" />}
        title={t('mediaShare.dlna.title')}
        description={t('mediaShare.dlna.desc')}
        actions={addButton('dlna', t('mediaShare.dlna.create'), !dlna?.enabled)}
      >
        {dlna && !dlna.enabled && (
          <div className="v2-notice" data-tone="warning">
            <Icon name="info" />
            <Text variant="body-medium">{t('mediaShare.dlna.disabled')}</Text>
          </div>
        )}
        {dlna?.enabled && !dlna.running && (
          <div className="v2-notice" data-tone="error">
            <Icon name="error" />
            <Text variant="body-medium">{t('mediaShare.dlna.notRunning', { error: dlna.error || '—' })}</Text>
          </div>
        )}
        {dlna?.enabled && dlna.running && (
          <StatusPill tone="success" icon="circle">
            {t('mediaShare.dlna.running', { addresses: dlna.addresses.join(', ') })}
          </StatusPill>
        )}
        {dlna?.enabled && (
          <Text variant="body-small" className="text-on-surface-variant">
            {t('mediaShare.dlna.lanOnly')}
          </Text>
        )}
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
        {list('dlna', 'cast', t('mediaShare.dlna.empty'))}
      </Section>

      <ConfirmDialog
        open={removeTarget !== null}
        tone="danger"
        title={t('mediaShare.remove.title', { name: removeTarget?.name ?? '' })}
        message={t('mediaShare.remove.message')}
        confirmLabel={t('mediaShare.common.remove')}
        onClose={() => setRemoveTarget(null)}
        onConfirm={async () => {
          if (!removeTarget) return;
          try {
            await deleteMediaDevice(removeTarget.id);
            snackbar.show(t('mediaShare.toasts.removed'));
            await load();
          } catch (e) {
            snackbar.show((e as Error).message);
            throw e;
          }
        }}
      />
    </div>
  );
}
