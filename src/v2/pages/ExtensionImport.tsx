import { useTranslation } from 'react-i18next';
import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { createLibrary, createLibraryItem, createProject, fetchLibraries, fetchProjects, fetchProjectWorkflow, saveImage, updateProject } from '../../api';
import { consumePwaShareHandoff } from '../../lib/pwa-share';
import { Button, Dialog, Icon, Select, Text, TextField } from '../../m3';
import type { Library, Project } from '../../types';
import { EmptyState, LoadingState, Page, PageHeader, Section } from '../ui/Page';
import { Segmented } from '../ui/Toolbar';
import { useToast } from '../ui/useToast';
import { errorText } from '../lib/errors';

type ImportData = { type: 'image' | 'text'; data: string; name?: string };
type Destination = 'library' | 'project';

/** Creates the destination on the spot: a library or a project of the imported item's type. */
function CreateDestinationDialog({ kind, open, type, onClose, onCreated }: { kind: Destination; open: boolean; type: 'image' | 'text'; onClose: () => void; onCreated: (id: string, name: string) => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [prefix, setPrefix] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    try {
      if (kind === 'library') {
        const id = crypto.randomUUID();
        await createLibrary({ id, name: name.trim(), description: description.trim() || undefined, type });
        toast.success(t('v2.importer.libraryCreated'));
        onCreated(id, name.trim());
      } else {
        const id = crypto.randomUUID();
        await createProject({ id, name: name.trim(), description: description.trim() || undefined, type, prefix: prefix.trim(), createdAt: Date.now(), workflow: [], jobs: [], album: [], shuffle: false } as Project);
        toast.success(t('v2.importer.projectCreated'));
        onCreated(id, name.trim());
      }
      onClose();
      setName('');
      setDescription('');
      setPrefix('');
    } catch {
      toast.error(kind === 'library' ? t('v2.importer.libraryCreateFailed') : t('v2.importer.projectCreateFailed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      icon={kind === 'library' ? 'folder' : 'play_circle'}
      headline={kind === 'library' ? t('v2.importer.createLibrary') : t('v2.importer.createProject')}
      maxWidth={460}
      actions={
        <>
          <Button variant="text" onClick={onClose}>
            {t('projectViewer.common.cancel')}
          </Button>
          <Button variant="filled" loading={busy} disabled={!name.trim()} onClick={() => void submit()}>
            {kind === 'library' ? t('v2.importer.createLibrary') : t('v2.importer.createProject')}
          </Button>
        </>
      }
    >
      <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-4">
        <TextField variant="outlined" label={t('v2.importer.name')} required value={name} onValueChange={setName} placeholder={kind === 'library' ? t('v2.importer.libraryNameHint') : t('v2.importer.projectNameHint')} autoFocus fullWidth />
        <TextField variant="outlined" label={t('v2.importer.description')} value={description} onValueChange={setDescription} placeholder={kind === 'library' ? t('v2.importer.libraryDescriptionHint') : undefined} multiline rows={kind === 'library' ? 3 : 2} fullWidth />
        {kind === 'project' && <TextField variant="outlined" label={t('v2.importer.prefix')} value={prefix} onValueChange={setPrefix} placeholder="img_" fullWidth />}
        <button type="submit" hidden />
      </form>
    </Dialog>
  );
}

/** Saves an image or text sent from the Chrome extension or the share sheet into a library or project. */
export function ExtensionImport() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const toast = useToast();
  const [searchParams] = useSearchParams();
  const destinationParam = searchParams.get('destination');
  const requested: Destination | null = destinationParam === 'project' || destinationParam === 'library' ? destinationParam : null;
  const [importData, setImportData] = useState<ImportData | null>(null);
  const [destination, setDestination] = useState<Destination>(requested ?? 'library');
  const [itemName, setItemName] = useState('');
  const [libraries, setLibraries] = useState<Library[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loadingDestinations, setLoadingDestinations] = useState(false);
  const [selectedId, setSelectedId] = useState('');
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState<Destination | null>(null);
  const [timedOut, setTimedOut] = useState(false);

  const changeDestination = (type: Destination) => {
    setDestination(type);
    if (importData?.type) localStorage.setItem(`remix_studio_import_destination_${importData.type}`, type);
  };
  const changeId = (id: string) => {
    setSelectedId(id);
    if (importData?.type) localStorage.setItem(`remix_studio_import_selected_id_${importData.type}_${destination}`, id);
  };

  useEffect(() => {
    const timer = setTimeout(() => setTimedOut(true), 1500);
    const apply = (payload: ImportData) => {
      setImportData(payload);
      if (payload?.type && !requested) {
        const saved = localStorage.getItem(`remix_studio_import_destination_${payload.type}`);
        if (saved === 'project' || saved === 'library') setDestination(saved);
      }
      if (payload.name) setItemName(payload.name);
      clearTimeout(timer);
    };
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === 'REMIX_STUDIO_EXTENSION_IMPORT') {
        apply(event.data.payload);
        // Acknowledge so the extension stops resending and clears its storage.
        window.postMessage({ type: 'REMIX_STUDIO_EXTENSION_ACK' }, '*');
      }
    };
    window.addEventListener('message', onMessage);
    let released = false;
    void consumePwaShareHandoff().then((shared) => {
      if (!released && shared) apply({ type: shared.type, data: shared.data, name: shared.name });
    });
    return () => {
      released = true;
      window.removeEventListener('message', onMessage);
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!importData) return;
    (async () => {
      setLoadingDestinations(true);
      try {
        const key = `remix_studio_import_selected_id_${importData.type}_${destination}`;
        const items =
          destination === 'library'
            ? (await fetchLibraries(1, 100, undefined, false, true)).items.filter((l) => l.type === importData.type)
            : (await fetchProjects(1, 100, undefined, 'active', true)).items.filter((p) => p.type === importData.type);
        if (destination === 'library') setLibraries(items as Library[]);
        else setProjects(items as Project[]);
        const saved = localStorage.getItem(key);
        setSelectedId(saved && items.find((x) => x.id === saved) ? saved : items[0]?.id ?? '');
      } catch (e) {
        console.error('Failed to load destinations', e);
        toast.error(t('v2.importer.destinationsLoadFailed'));
      } finally {
        setLoadingDestinations(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [destination, importData]);

  const save = async () => {
    if (!importData || !selectedId) return;
    setSaving(true);
    try {
      let value = importData.data;
      let thumbnailUrl: string | undefined;
      let optimizedUrl: string | undefined;
      let size: number | undefined;
      if (importData.type === 'image') {
        const result = await saveImage(importData.data, selectedId);
        value = result.key;
        thumbnailUrl = result.thumbnailKey;
        optimizedUrl = result.optimizedKey;
        size = result.size;
      }
      if (destination === 'library') {
        await createLibraryItem(selectedId, { id: crypto.randomUUID(), content: value, thumbnailUrl, optimizedUrl, size, title: itemName.trim() || t(importData.type === 'image' ? 'v2.importer.importedImage' : 'v2.importer.importedText') });
        toast.success(t('v2.importer.savedLibrary'));
        navigate(`/library/${selectedId}`);
      } else {
        const workflow = await fetchProjectWorkflow(selectedId);
        await updateProject(selectedId, { workflow: [...workflow, { id: crypto.randomUUID(), type: importData.type, value, thumbnailUrl, optimizedUrl, size, order: workflow.length }] });
        toast.success(t('v2.importer.savedProject'));
        navigate(`/project/${selectedId}`);
      }
    } catch (e) {
      console.error(e);
      toast.error(errorText(e, t('v2.importer.saveFailed')));
    } finally {
      setSaving(false);
    }
  };

  if (!importData) {
    return timedOut ? (
      <Page>
        <EmptyState
          icon="image"
          title={t('v2.importer.noData')}
          description={t('v2.importer.noDataHint')}
          action={
            <Button variant="filled" href="/">
              {t('v2.share.home')}
            </Button>
          }
        />
      </Page>
    ) : (
      <LoadingState label={t('v2.importer.waiting')} minHeight={400} />
    );
  }

  const options = destination === 'library' ? libraries : projects;

  return (
    <Page width="default">
      <PageHeader title={t(importData.type === 'image' ? 'v2.importer.titleImage' : 'v2.importer.titleText')} description={t('v2.importer.descriptionText')} backLink={{ label: t('projectViewer.common.cancel'), onClick: () => navigate(-1) }} />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Section variant="card">
          <TextField variant="outlined" label={t('v2.importer.name')} leadingIcon="title" value={itemName} onValueChange={setItemName} placeholder={t(importData.type === 'image' ? 'v2.importer.nameImage' : 'v2.importer.nameText')} autoFocus fullWidth />
          <Text variant="label-large" className="text-on-surface-variant">
            {t('projectViewer.common.preview')}
          </Text>
          <div className="v2-import-preview">
            {importData.type === 'image' ? <img src={importData.data} alt={t('v2.importer.preview')} /> : <pre>{importData.data}</pre>}
          </div>
        </Section>
        <aside className="flex flex-col gap-4">
          <Section variant="card" icon={<Icon name="folder" />} title={t('v2.importer.destination')} description={t('v2.importer.destinationHint')}>
            <Segmented<Destination>
              fullWidth
              value={destination}
              onChange={changeDestination}
              options={[
                { value: 'library', label: t('v2.importer.library'), icon: 'layers' },
                { value: 'project', label: t('v2.importer.project'), icon: 'folder' },
              ]}
            />
            {loadingDestinations ? (
              <LoadingState minHeight={80} />
            ) : (
              <div className="flex flex-col gap-2">
                {options.length === 0 ? (
                  <div className="v2-notice" data-tone="error">
                    <Icon name="error" />
                    <Text variant="body-small">{t(destination === 'library' ? 'v2.importer.noLibraries' : 'v2.importer.noProjects')}</Text>
                  </div>
                ) : (
                  <Select
                    variant="outlined"
                    label={t(destination === 'library' ? 'v2.importer.selectLibrary' : 'v2.importer.selectProject')}
                    placeholder={t('v2.importer.chooseDestination')}
                    value={selectedId || null}
                    onChange={changeId}
                    options={options.map((o) => ({ value: o.id, label: o.name }))}
                    fullWidth
                  />
                )}
                <Button variant="text" size="xs" icon="add" className="self-start" onClick={() => setCreating(destination)}>
                  {t('v2.importer.createNew')}
                </Button>
              </div>
            )}
          </Section>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outlined" disabled={saving} onClick={() => navigate(-1)}>
              {t('projectViewer.common.cancel')}
            </Button>
            <Button variant="filled" icon="save" loading={saving} disabled={!selectedId} onClick={() => void save()} emphasized>
              {saving ? t('v2.feedback.saving') : t('projectViewer.common.save')}
            </Button>
          </div>
        </aside>
      </div>
      <CreateDestinationDialog
        kind="library"
        open={creating === 'library'}
        type={importData.type}
        onClose={() => setCreating(null)}
        onCreated={(id, name) => {
          setLibraries((prev) => [{ id, name, description: '', type: importData.type, items: [], createdAt: Date.now() } as Library, ...prev]);
          changeId(id);
        }}
      />
      <CreateDestinationDialog
        kind="project"
        open={creating === 'project'}
        type={importData.type}
        onClose={() => setCreating(null)}
        onCreated={(id, name) => {
          setProjects((prev) => [{ id, name, description: '', type: importData.type, workflow: [], jobs: [], album: [], createdAt: Date.now(), prefix: '', shuffle: false } as Project, ...prev]);
          changeId(id);
        }}
      />
    </Page>
  );
}
