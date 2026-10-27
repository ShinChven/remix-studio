import { useCallback, useEffect, useState, type CSSProperties, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { fetchProvider, updateProvider } from '../../api';
import { Button, Dialog, Icon, IconButton, Select, Shape, Text, TextField, useSnackbar } from '../../m3';
import { PROVIDER_MODELS_MAP, type CustomModelAlias, type ModelConfig, type Provider } from '../../types';
import { ModelRows, useModelEntries } from '../components/providers/ModelRows';
import { ProviderHero } from '../components/providers/ProviderHero';
import { modelTraits } from '../components/providers/providerMeta';
import { useModelDescriptions } from '../lib/modelDescriptions';
import { kindMeta } from '../ui/entityMeta';
import { KindBadge } from '../ui/KindBadge';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { EmptyState, ErrorState, LoadingState, Page } from '../ui/Page';

type EditorState = { mode: 'create' | 'edit'; index: number; customName: string; customModelId: string; baseModelId: string };

/** Creates or edits one variant: the model it starts from, its name, and the model ID sent to the service. */
function VariantDialog({ editor, baseModels, saving, onChange, onSave, onClose }: { editor: EditorState | null; baseModels: ModelConfig[]; saving: boolean; onChange: (next: EditorState) => void; onSave: () => void; onClose: () => void }) {
  const { t } = useTranslation();
  const descriptions = useModelDescriptions();
  const base = baseModels.find((model) => model.id === editor?.baseModelId);
  const valid = Boolean(editor && editor.customName.trim() && editor.customModelId.trim() && editor.baseModelId);
  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    if (valid && !saving) onSave();
  };
  return (
    <Dialog
      open={editor !== null}
      onClose={() => !saving && onClose()}
      icon="layers"
      headline={editor?.mode === 'edit' ? t('providerCustomModels.editVariant') : t('providerCustomModels.newVariant')}
      maxWidth={600}
      actions={
        <>
          <Button variant="text" onClick={onClose} disabled={saving}>
            {t('providerCustomModels.cancel')}
          </Button>
          <Button variant="filled" icon="save" loading={saving} disabled={!valid} onClick={() => submit()}>
            {editor?.mode === 'edit' ? t('providerCustomModels.update') : t('providerCustomModels.create')}
          </Button>
        </>
      }
    >
      {editor && (
        <form className="v2-variant-form" onSubmit={submit} autoComplete="off">
          <Select
            variant="outlined"
            label={t('providerCustomModels.baseModelLabel')}
            placeholder={t('providerCustomModels.selectBaseModel')}
            value={editor.baseModelId || null}
            onChange={(value) => onChange({ ...editor, baseModelId: value })}
            options={baseModels.map((model) => ({ value: model.id, label: model.name, supportingText: `${model.modelId} · ${t(`v2.providers.kind.${model.category}`)}` }))}
            fullWidth
          />
          {base && (
            <div className="v2-variant-form__base" data-kind={base.category}>
              <KindBadge kind={base.category} size={32} tone="solid" />
              <span>
                <Text as="span" variant="body-small">
                  {descriptions[base.id] ?? t('v2.providers.variants.inheritsAll')}
                </Text>
                {modelTraits(base).length > 0 && <span className="v2-model-row__traits">{modelTraits(base).join('  ·  ')}</span>}
              </span>
            </div>
          )}
          <TextField
            variant="outlined"
            label={t('providerCustomModels.modelNameLabel')}
            required
            value={editor.customName}
            onValueChange={(value) => onChange({ ...editor, customName: value })}
            placeholder={t('providerCustomModels.namePlaceholder')}
            supportingText={t('v2.providers.variants.nameHint')}
            data-autofocus
            fullWidth
          />
          <TextField
            variant="outlined"
            label={t('providerCustomModels.modelIdLabel')}
            required
            value={editor.customModelId}
            onValueChange={(value) => onChange({ ...editor, customModelId: value })}
            placeholder={t('providerCustomModels.idPlaceholder')}
            supportingText={t('v2.providers.variants.idHint')}
            inputClassName="font-mono"
            spellCheck={false}
            fullWidth
          />
          <button type="submit" hidden />
        </form>
      )}
    </Dialog>
  );
}

export function ProviderCustomModels() {
  const { t } = useTranslation();
  const snackbar = useSnackbar();
  const { id } = useParams<{ id: string }>();
  const [provider, setProvider] = useState<Provider | null>(null);
  const [customModels, setCustomModels] = useState<CustomModelAlias[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<number | null>(null);
  const [editor, setEditor] = useState<EditorState | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      setIsLoading(true);
      setError(null);
      const p = await fetchProvider(id);
      setProvider(p);
      setCustomModels((p.customModels ?? []).map((m) => ({ ...m, customModelId: m.customModelId ?? '' })));
    } catch {
      setError(t('providerCustomModels.errorLoad'));
    } finally {
      setIsLoading(false);
    }
  }, [id, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const baseModels = provider ? PROVIDER_MODELS_MAP[provider.type] || [] : [];
  const baseEntries = useModelEntries(baseModels);
  const baseModelMap = new Map<string, ModelConfig>(baseModels.map((m) => [m.id, m]));

  /** Saves the whole list; true when it was saved. */
  const persist = async (next: CustomModelAlias[]) => {
    if (!id) return false;
    setIsSaving(true);
    setError(null);
    try {
      await updateProvider(id, { customModels: next });
      setCustomModels(next);
      return true;
    } catch (e) {
      snackbar.show((e as Error)?.message || t('providerCustomModels.errors.saveFailed'));
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  const saveEditor = async () => {
    if (!editor) return;
    const { customName, customModelId, baseModelId } = editor;
    if (!customName.trim() || !customModelId.trim() || !baseModelId) return;
    const alias: CustomModelAlias = { customName: customName.trim(), customModelId: customModelId.trim(), baseModelId };
    const saved = await persist(editor.mode === 'create' ? [...customModels, alias] : customModels.map((m, i) => (i === editor.index ? alias : m)));
    if (!saved) return;
    snackbar.show(t('v2.providers.variants.saved', { name: alias.customName }));
    setEditor(null);
  };

  const copy = (text: string) => {
    void navigator.clipboard
      .writeText(text)
      .then(() => snackbar.show(t('v2.providers.copied')))
      .catch(() => snackbar.show(t('v2.providers.copyFailed')));
  };

  if (isLoading) return <LoadingState minHeight={400} />;
  if (!provider) {
    return (
      <Page>
        <EmptyState
          icon="error"
          shape="boom"
          title={error || t('providerCustomModels.errorNotFound')}
          action={
            <Button variant="tonal" href="/providers">
              {t('providerProfile.backToProviders')}
            </Button>
          }
        />
      </Page>
    );
  }

  const openCreate = () => setEditor({ mode: 'create', index: -1, customName: '', customModelId: '', baseModelId: baseModels[0]?.id ?? '' });
  const deleting = deleteTarget !== null ? customModels[deleteTarget] : null;

  return (
    <Page className="v2-provider-page v2-provider-variants" density="compact">
      <ProviderHero
        type={provider.type}
        backLink={{ to: `/provider/${id}`, label: provider.name }}
        kicker={provider.name}
        title={t('providerCustomModels.title')}
        description={t('providerCustomModels.description')}
        actions={
          <Button variant="filled" icon="add" emphasized onClick={openCreate} disabled={baseModels.length === 0}>
            {t('providerCustomModels.newVariant')}
          </Button>
        }
      />
      {error && <ErrorState message={error} onRetry={() => void load()} retryLabel={t('v2.providers.retry')} />}

      <div className="v2-provider-variants__layout">
        <section className="v2-provider-models" aria-label={t('providerCustomModels.title')}>
          <div className="v2-provider-variants__head">
            <Text as="h2" variant="title-medium" emphasized>
              {t('v2.providers.variants.yours')}
            </Text>
            <Text as="span" variant="body-small" className="v2-form-step__hint">
              {t('v2.providers.variants.count', { count: customModels.length })}
            </Text>
          </div>
          {customModels.length === 0 ? (
            <EmptyState
              className="v2-pane-empty"
              icon="layers"
              shape="puffy"
              title={t('providerCustomModels.noVariants')}
              description={t('providerCustomModels.noVariantsDesc')}
              action={
                <Button variant="tonal" icon="add" onClick={openCreate} disabled={baseModels.length === 0}>
                  {t('providerCustomModels.newVariant')}
                </Button>
              }
            />
          ) : (
            <ul className="v2-variant-list">
              {customModels.map((alias, index) => {
                const base = baseModelMap.get(alias.baseModelId);
                const kind = base?.category ?? 'image';
                return (
                  <li key={`${alias.customModelId}-${index}`} className="v2-variant" data-kind={kind} style={{ '--v2-kind-turn': `${kindMeta(kind).turn}deg` } as CSSProperties}>
                    <span className="v2-variant__art" aria-hidden>
                      <Shape name={kindMeta(kind).shape} size={44} morph={false} />
                      <Icon name="layers" size={20} filled />
                    </span>
                    <span className="v2-variant__body">
                      <Text as="span" variant="title-small" emphasized className="v2-variant__name">
                        {alias.customName}
                      </Text>
                      <button type="button" className="v2-model-row__id v2-variant__id m3-focus-ring" title={t('v2.providers.models.copyId')} onClick={() => copy(alias.customModelId)}>
                        <span>{alias.customModelId}</span>
                        <Icon name="content_copy" size={14} aria-hidden />
                      </button>
                      <Text as="span" variant="body-small" className="v2-variant__base">
                        <Icon name="subdirectory_arrow_right" size={14} aria-hidden />
                        {t('v2.providers.variants.basedOn', { model: base?.name ?? alias.baseModelId })}
                        {base && modelTraits(base).length > 0 && <span className="v2-model-row__traits">{modelTraits(base).join('  ·  ')}</span>}
                      </Text>
                    </span>
                    <span className="v2-variant__actions">
                      <IconButton
                        icon="edit"
                        label={t('providerCustomModels.edit')}
                        tooltip
                        size="sm"
                        onClick={() => setEditor({ mode: 'edit', index, customName: alias.customName, customModelId: alias.customModelId, baseModelId: alias.baseModelId })}
                      />
                      <IconButton icon="delete" label={t('providerCustomModels.delete')} tooltip size="sm" className="v2-icon-danger" onClick={() => setDeleteTarget(index)} />
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {baseEntries.length > 0 && (
          <aside className="v2-provider-form__aside" aria-label={t('v2.providers.variants.baseModels')}>
            <div className="v2-provider-form__aside-head">
              <Text as="h2" variant="title-medium" emphasized>
                {t('v2.providers.variants.baseModels')}
              </Text>
              <Text as="span" variant="body-small" className="v2-form-step__hint">
                {t('v2.providers.variants.baseModelsHint')}
              </Text>
            </div>
            <ModelRows models={baseEntries} onCopy={copy} compact />
          </aside>
        )}
      </div>

      <VariantDialog editor={editor} baseModels={baseModels} saving={isSaving} onChange={setEditor} onSave={() => void saveEditor()} onClose={() => setEditor(null)} />

      <ConfirmDialog
        open={deleting !== null}
        tone="danger"
        icon="delete"
        title={t('v2.providers.variants.deleteTitle', { name: deleting?.customName ?? '' })}
        message={t('v2.providers.variants.deleteMessage', { id: deleting?.customModelId ?? '' })}
        confirmLabel={t('providerCustomModels.delete')}
        onClose={() => setDeleteTarget(null)}
        onConfirm={async () => {
          if (deleteTarget === null || !deleting) return;
          if (await persist(customModels.filter((_, i) => i !== deleteTarget))) snackbar.show(t('v2.providers.variants.deleted', { name: deleting.customName }));
        }}
      />
    </Page>
  );
}
