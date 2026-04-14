import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { fetchProvider, updateProvider } from '../api';
import { CustomModelAlias, PROVIDER_MODELS_MAP, Provider, ModelConfig } from '../types';
import { ArrowLeft, Plus, Trash2, Pencil, Save, X, Layers, AlertCircle } from 'lucide-react';

type EditorState = {
  mode: 'create' | 'edit';
  index: number; // -1 for create
  customName: string;
  customModelId: string;
  baseModelId: string;
};

export function ProviderCustomModels() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

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
      // Migrate old data that may lack customModelId
      setCustomModels((p.customModels ?? []).map((m) => ({
        ...m,
        customModelId: m.customModelId ?? '',
      })));
    } catch {
      setError(t('providerCustomModels.errorLoad'));
    } finally {
      setIsLoading(false);
    }
  }, [id, t]);

  useEffect(() => { load(); }, [load]);

  const baseModels = provider ? (PROVIDER_MODELS_MAP[provider.type] || []) : [];
  const baseModelMap = new Map<string, ModelConfig>(baseModels.map((m) => [m.id, m]));

  const persist = async (next: CustomModelAlias[]) => {
    if (!id) return;
    setIsSaving(true);
    setError(null);
    try {
      await updateProvider(id, { customModels: next });
      setCustomModels(next);
    } catch (e: any) {
      setError(e?.message || t('providerCustomModels.errors.saveFailed'));
    } finally {
      setIsSaving(false);
    }
  };

  const openCreate = () => {
    setEditor({
      mode: 'create',
      index: -1,
      customName: '',
      customModelId: '',
      baseModelId: baseModels[0]?.id ?? '',
    });
  };

  const openEdit = (idx: number) => {
    const m = customModels[idx];
    setEditor({
      mode: 'edit',
      index: idx,
      customName: m.customName,
      customModelId: m.customModelId,
      baseModelId: m.baseModelId,
    });
  };

  const handleEditorSave = async () => {
    if (!editor) return;
    const { customName, customModelId, baseModelId } = editor;
    if (!customName.trim() || !(customModelId || '').trim() || !baseModelId) return;

    const alias: CustomModelAlias = {
      customName: customName.trim(),
      customModelId: customModelId.trim(),
      baseModelId,
    };

    let next: CustomModelAlias[];
    if (editor.mode === 'create') {
      next = [...customModels, alias];
    } else {
      next = customModels.map((m, i) => (i === editor.index ? alias : m));
    }

    await persist(next);
    setEditor(null);
  };

  const handleDelete = async (idx: number) => {
    const next = customModels.filter((_, i) => i !== idx);
    await persist(next);
    setDeleteTarget(null);
  };

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!provider) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4">
        <AlertCircle className="w-10 h-10 text-red-400" />
        <p className="text-neutral-600 dark:text-neutral-400">{error || t('providerCustomModels.errorNotFound')}</p>
        <button onClick={() => navigate('/providers')} className="text-sm text-amber-400 hover:underline">
          {t('providerCustomModels.backToProviders')}
        </button>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col p-4 md:p-8 overflow-y-auto">
      <div className="w-full space-y-6">
        {/* Back */}
        <button
          onClick={() => navigate(`/provider/${id}`)}
          className="text-sm text-neutral-500 dark:text-neutral-500 hover:text-neutral-300 flex items-center gap-1 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> {t('providerCustomModels.backToProvider', { name: provider.name })}
        </button>

        {/* Header */}
        <header className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl md:text-3xl font-bold text-neutral-900 dark:text-white font-display flex items-center gap-3">
              <Layers className="w-7 h-7 text-cyan-500" />
              {t('providerCustomModels.title')}
            </h2>
            <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-1">
              {t('providerCustomModels.description')}
            </p>
          </div>
          <button
            onClick={openCreate}
            disabled={!!editor}
            className="text-xs md:text-sm bg-cyan-600 text-white hover:bg-cyan-700 px-4 py-2.5 rounded-xl transition-all flex items-center gap-2 border border-cyan-700 font-black uppercase tracking-widest shadow-lg shadow-cyan-600/10 active:scale-95 disabled:opacity-30"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">{t('providerCustomModels.newVariant')}</span>
            <span className="sm:hidden">{t('providerCustomModels.create')}</span>
          </button>
        </header>

        {error && (
          <div className="p-4 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-xl text-red-700 dark:text-red-400 text-sm flex items-center gap-2 shadow-sm font-medium">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {error}
          </div>
        )}

        {/* Editor panel (create / edit) */}
        {editor && (
          <div className="bg-white/40 dark:bg-neutral-900/40 border border-cyan-600/30 rounded-2xl p-5 space-y-4 backdrop-blur-3xl shadow-sm">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-neutral-900 dark:text-white uppercase tracking-wider">
                {editor.mode === 'create' ? t('providerCustomModels.newVariant') : t('providerCustomModels.editVariant')}
              </h3>
              <button
                onClick={() => setEditor(null)}
                className="p-1.5 text-neutral-500 dark:text-neutral-500 hover:text-neutral-200 rounded-lg transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Base model */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-500 dark:text-neutral-500 ml-0.5">
                {t('providerCustomModels.baseModelLabel')}
              </label>
              <select
                value={editor.baseModelId}
                onChange={(e) => setEditor({ ...editor, baseModelId: e.target.value })}
                className="w-full bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-xl px-3 py-2.5 text-sm text-neutral-900 dark:text-neutral-200 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-500/50 transition-all shadow-sm"
              >
                <option value="">{t('providerCustomModels.selectBaseModel')}</option>
                {baseModels.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} — {m.modelId} ({m.category})
                  </option>
                ))}
              </select>
              {editor.baseModelId && baseModelMap.has(editor.baseModelId) && (() => {
                const bm = baseModelMap.get(editor.baseModelId)!;
                const traits = [
                  bm.options.aspectRatios && `${bm.options.aspectRatios.length} aspect ratios`,
                  bm.options.qualities && `qualities: ${bm.options.qualities.join(', ')}`,
                ].filter(Boolean);
                return traits.length > 0 ? (
                  <p className="text-[11px] text-neutral-600 ml-0.5">{t('providerCustomModels.inherits', { traits: traits.join(' · ') })}</p>
                ) : null;
              })()}
            </div>

            {/* Name + ID */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-500 dark:text-neutral-500 ml-0.5">
                  {t('providerCustomModels.modelNameLabel')} <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={editor.customName}
                  onChange={(e) => setEditor({ ...editor, customName: e.target.value })}
                  placeholder={t('providerCustomModels.namePlaceholder')}
                  className="w-full bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-xl px-3 py-2.5 text-sm text-neutral-900 dark:text-neutral-200 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-500/50 transition-all placeholder:text-neutral-400 shadow-sm"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-500 dark:text-neutral-500 ml-0.5">
                  {t('providerCustomModels.modelIdLabel')} <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={editor.customModelId}
                  onChange={(e) => setEditor({ ...editor, customModelId: e.target.value })}
                  placeholder={t('providerCustomModels.idPlaceholder')}
                  className="w-full bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-xl px-3 py-2.5 text-sm text-neutral-900 dark:text-neutral-200 font-mono focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-500/50 transition-all placeholder:text-neutral-400 placeholder:font-sans shadow-sm"
                />
              </div>
            </div>

            {/* Save / Cancel */}
            <div className="flex items-center gap-2 pt-1">
              <button
                onClick={handleEditorSave}
                disabled={isSaving || !editor.customName.trim() || !(editor.customModelId || '').trim() || !editor.baseModelId}
                className="px-5 py-2.5 bg-cyan-600 hover:bg-cyan-700 text-white rounded-xl text-xs font-black uppercase tracking-widest transition-all disabled:opacity-30 flex items-center gap-2 border border-cyan-700 shadow-sm active:scale-95"
              >
                <Save className="w-3.5 h-3.5" />
                {isSaving ? t('providerCustomModels.saving') : editor.mode === 'create' ? t('providerCustomModels.create') : t('providerCustomModels.update')}
              </button>
              <button
                onClick={() => setEditor(null)}
                className="px-5 py-2.5 bg-white/70 dark:bg-neutral-900/70 border border-neutral-200/50 dark:border-white/5 backdrop-blur-xl text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-xl text-xs font-black uppercase tracking-widest transition-all shadow-sm active:scale-95"
              >
                {t('providerCustomModels.cancel')}
              </button>
            </div>
          </div>
        )}

        {/* List */}
        {customModels.length === 0 && !editor ? (
          <div className="col-span-full py-20 border-2 border-dashed border-neutral-200/50 dark:border-white/5 rounded-[2.5rem] text-neutral-500 dark:text-neutral-500 flex flex-col items-center justify-center gap-4 bg-white/40 dark:bg-neutral-900/40 backdrop-blur-3xl shadow-sm">
            <div className="p-4 rounded-full bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-sm">
              <Layers className="w-8 h-8 text-neutral-600 dark:text-neutral-700" />
            </div>
            <div className="text-center">
              <p className="text-lg font-bold text-neutral-600 dark:text-neutral-400 tracking-tight">{t('providerCustomModels.noVariants')}</p>
              <p className="text-sm mt-1">{t('providerCustomModels.noVariantsDesc')}</p>
            </div>
          </div>
        ) : customModels.length > 0 && (
          <div className="space-y-2">
            {customModels.map((alias, idx) => {
              const base = baseModelMap.get(alias.baseModelId);
              const isDeleting = deleteTarget === idx;
              return (
                <div
                  key={idx}
                  className="bg-white/70 dark:bg-neutral-900/70 border border-neutral-200/50 dark:border-white/5 hover:border-neutral-400 dark:hover:border-neutral-700 px-5 py-4 rounded-2xl transition-all flex items-center justify-between gap-4 shadow-sm hover:shadow-md backdrop-blur-xl"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="font-black text-neutral-900 dark:text-white text-sm truncate uppercase tracking-tight">{alias.customName}</h4>
                      <code className="text-[10px] text-cyan-700 dark:text-cyan-400 bg-cyan-50 dark:bg-cyan-500/10 px-2 py-0.5 rounded-md font-mono border border-cyan-200 dark:border-cyan-500/20 uppercase tracking-wider">
                        {alias.customModelId}
                      </code>
                    </div>
                    <div className="flex items-center gap-2 mt-1 text-[11px] text-neutral-500 dark:text-neutral-500">
                      <span>{t('providerCustomModels.baseModelLabel')}: <span className="text-neutral-600 dark:text-neutral-400">{base?.name ?? alias.baseModelId}</span></span>
                      {base && (
                        <>
                          <span className="text-neutral-700">·</span>
                          <span>{base.category}</span>
                          {base.options.qualities && (
                            <>
                              <span className="text-neutral-700">·</span>
                              <span>{base.options.qualities.join(', ')}</span>
                            </>
                          )}
                        </>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1 flex-shrink-0">
                    {isDeleting ? (
                      <>
                        <button
                          onClick={() => handleDelete(idx)}
                          disabled={isSaving}
                          className="px-2.5 py-1.5 text-xs font-bold text-red-400 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 rounded-lg transition-colors disabled:opacity-50"
                        >
                          {isSaving ? '...' : t('providerCustomModels.confirmDelete')}
                        </button>
                        <button
                          onClick={() => setDeleteTarget(null)}
                          className="px-2.5 py-1.5 text-xs font-bold text-neutral-600 dark:text-neutral-400 bg-neutral-200 dark:bg-neutral-800 hover:bg-neutral-700 rounded-lg transition-colors"
                        >
                          {t('providerCustomModels.cancel')}
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => openEdit(idx)}
                          disabled={!!editor}
                          className="p-1.5 text-neutral-500 dark:text-neutral-500 hover:text-neutral-200 hover:bg-neutral-700 rounded-lg transition-colors disabled:opacity-30"
                          title={t('providerCustomModels.edit')}
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setDeleteTarget(idx)}
                          disabled={!!editor}
                          className="p-1.5 text-neutral-500 dark:text-neutral-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors disabled:opacity-30"
                          title={t('providerCustomModels.delete')}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
