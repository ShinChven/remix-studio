import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { fetchProvider, updateProvider } from '../../api';
import { Button, IconButton, Select, Text, TextField } from '../../m3';
import { PROVIDER_MODELS_MAP, type CustomModelAlias, type ModelConfig, type Provider } from '../../types';
import { EmptyState, ErrorState, LoadingState, Page, PageHeader, Section } from '../ui/Page';
import { Row, RowList } from '../ui/Rows';
import { StatusPill } from '../ui/Stat';

type EditorState = { mode: 'create' | 'edit'; index: number; customName: string; customModelId: string; baseModelId: string };

export function ProviderCustomModels() {
  const { t } = useTranslation();
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
  const baseModelMap = new Map<string, ModelConfig>(baseModels.map((m) => [m.id, m]));

  const persist = async (next: CustomModelAlias[]) => {
    if (!id) return;
    setIsSaving(true);
    setError(null);
    try {
      await updateProvider(id, { customModels: next });
      setCustomModels(next);
    } catch (e) {
      setError((e as Error)?.message || t('providerCustomModels.errors.saveFailed'));
    } finally {
      setIsSaving(false);
    }
  };

  const saveEditor = async () => {
    if (!editor) return;
    const { customName, customModelId, baseModelId } = editor;
    if (!customName.trim() || !(customModelId || '').trim() || !baseModelId) return;
    const alias: CustomModelAlias = { customName: customName.trim(), customModelId: customModelId.trim(), baseModelId };
    await persist(editor.mode === 'create' ? [...customModels, alias] : customModels.map((m, i) => (i === editor.index ? alias : m)));
    setEditor(null);
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
              {t('providerCustomModels.backToProviders')}
            </Button>
          }
        />
      </Page>
    );
  }

  const inherits = (baseModelId: string) => {
    const bm = baseModelMap.get(baseModelId);
    if (!bm) return null;
    const traits = [bm.options.aspectRatios && `${bm.options.aspectRatios.length} aspect ratios`, bm.options.qualities && `qualities: ${bm.options.qualities.join(', ')}`].filter(Boolean);
    return traits.length > 0 ? t('providerCustomModels.inherits', { traits: traits.join(' · ') }) : undefined;
  };

  return (
    <Page width="default" density="compact">
      <PageHeader
        backLink={{ to: `/provider/${id}`, label: t('providerCustomModels.backToProvider', { name: provider.name }) }}
        title={t('providerCustomModels.title')}
        description={t('providerCustomModels.description')}
        actions={
          <Button
            variant="filled"
            icon="add"
            disabled={!!editor}
            onClick={() => setEditor({ mode: 'create', index: -1, customName: '', customModelId: '', baseModelId: baseModels[0]?.id ?? '' })}
          >
            {t('providerCustomModels.newVariant')}
          </Button>
        }
      />
      {error && <ErrorState message={error} />}

      {editor && (
        <Section
          variant="card"
          className="mb-6"
          title={editor.mode === 'create' ? t('providerCustomModels.newVariant') : t('providerCustomModels.editVariant')}
          actions={<IconButton icon="close" label={t('providerCustomModels.cancel')} size="xs" onClick={() => setEditor(null)} />}
        >
          <Select
            variant="outlined"
            label={t('providerCustomModels.baseModelLabel')}
            placeholder={t('providerCustomModels.selectBaseModel')}
            value={editor.baseModelId || null}
            onChange={(v) => setEditor({ ...editor, baseModelId: v })}
            options={baseModels.map((m) => ({ value: m.id, label: m.name, supportingText: `${m.modelId} (${m.category})` }))}
            supportingText={inherits(editor.baseModelId)}
            fullWidth
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              variant="outlined"
              label={t('providerCustomModels.modelNameLabel')}
              required
              value={editor.customName}
              onValueChange={(v) => setEditor({ ...editor, customName: v })}
              placeholder={t('providerCustomModels.namePlaceholder')}
              fullWidth
            />
            <TextField
              variant="outlined"
              label={t('providerCustomModels.modelIdLabel')}
              required
              value={editor.customModelId}
              onValueChange={(v) => setEditor({ ...editor, customModelId: v })}
              placeholder={t('providerCustomModels.idPlaceholder')}
              inputClassName="font-mono"
              fullWidth
            />
          </div>
          <div className="flex gap-2">
            <Button
              variant="filled"
              icon="save"
              loading={isSaving}
              disabled={!editor.customName.trim() || !(editor.customModelId || '').trim() || !editor.baseModelId}
              onClick={() => void saveEditor()}
            >
              {editor.mode === 'create' ? t('providerCustomModels.create') : t('providerCustomModels.update')}
            </Button>
            <Button variant="text" onClick={() => setEditor(null)}>
              {t('providerCustomModels.cancel')}
            </Button>
          </div>
        </Section>
      )}

      {customModels.length === 0 && !editor ? (
        <EmptyState icon="layers" shape="puffy" title={t('providerCustomModels.noVariants')} description={t('providerCustomModels.noVariantsDesc')} />
      ) : (
        customModels.length > 0 && (
          <RowList>
            {customModels.map((alias, idx) => {
              const base = baseModelMap.get(alias.baseModelId);
              return (
                <Row
                  key={idx}
                  title={
                    <span className="flex flex-wrap items-center gap-2">
                      {alias.customName}
                      <StatusPill tone="tertiary" className="font-mono">
                        {alias.customModelId}
                      </StatusPill>
                    </span>
                  }
                  meta={
                    <>
                      <span>
                        {t('providerCustomModels.baseModelLabel')}: <Text as="span" variant="label-medium">{base?.name ?? alias.baseModelId}</Text>
                      </span>
                      {base && <span>· {base.category}</span>}
                      {base?.options.qualities && <span>· {base.options.qualities.join(', ')}</span>}
                    </>
                  }
                  actions={
                    deleteTarget === idx ? (
                      <>
                        <Button
                          variant="tonal"
                          size="xs"
                          className="v2-button-danger"
                          loading={isSaving}
                          onClick={async () => {
                            await persist(customModels.filter((_, i) => i !== idx));
                            setDeleteTarget(null);
                          }}
                        >
                          {t('providerCustomModels.confirmDelete')}
                        </Button>
                        <Button variant="text" size="xs" onClick={() => setDeleteTarget(null)}>
                          {t('providerCustomModels.cancel')}
                        </Button>
                      </>
                    ) : (
                      <>
                        <IconButton
                          icon="edit"
                          label={t('providerCustomModels.edit')}
                          tooltip
                          size="xs"
                          disabled={!!editor}
                          onClick={() => setEditor({ mode: 'edit', index: idx, customName: alias.customName, customModelId: alias.customModelId, baseModelId: alias.baseModelId })}
                        />
                        <IconButton icon="delete" label={t('providerCustomModels.delete')} tooltip size="xs" disabled={!!editor} className="v2-button-danger" onClick={() => setDeleteTarget(idx)} />
                      </>
                    )
                  }
                />
              );
            })}
          </RowList>
        )
      )}
    </Page>
  );
}
