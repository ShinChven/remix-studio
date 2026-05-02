import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Check,
  Database,
  KeyRound,
  Layers3,
  ListChecks,
  Loader2,
  Pencil,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Trash2,
  Unplug,
  Wrench,
  X,
} from 'lucide-react';
import { toast } from 'sonner';

import {
  createLibraryItem,
  deleteLibraryItem,
  fetchAssistantProviders,
  fetchAssistantTools,
  fetchLibraryItems,
  updateLibraryItem,
} from '../api';
import type { AssistantToolMetadata } from '../api';
import { ConfirmModal } from '../components/ConfirmModal';
import { PageHeader } from '../components/PageHeader';
import { ensureAssistantSkillsLibrary } from '../lib/assistant-skills';
import {
  normalizeAssistantProviderSelection,
  resolveEnabledAssistantProviderIds,
  setStoredEnabledAssistantProviderIds,
} from '../lib/assistant-provider-settings';
import { McpConnections } from './McpConnections';
import type { Library, LibraryItem, Provider } from '../types';
import { getTextModelsForProvider } from '../types';

type AssistantSettingsTab = 'providers' | 'skills' | 'tools' | 'mcp';

type SkillEditorState = {
  mode: 'create' | 'edit';
  item: LibraryItem | null;
};

const MODEL_STORAGE_KEY = 'assistant_last_model';
const PROVIDER_STORAGE_KEY = 'assistant_last_provider';
const SKILLS_PAGE_SIZE = 8;

function isAssistantSettingsTab(value: string | null): value is AssistantSettingsTab {
  return value === 'providers' || value === 'skills' || value === 'tools' || value === 'mcp';
}

function getStoredValue(key: string) {
  if (typeof window === 'undefined') return '';
  return window.localStorage.getItem(key) || '';
}

function setStoredValue(key: string, value: string) {
  if (typeof window === 'undefined') return;
  if (!value) {
    window.localStorage.removeItem(key);
    return;
  }
  window.localStorage.setItem(key, value);
}

function summarizeSkillContent(content: string) {
  const normalized = content.replace(/\s+/g, ' ').trim();
  if (!normalized) return 'Empty prompt';
  return normalized.length > 180 ? `${normalized.slice(0, 177)}...` : normalized;
}

function getToolProperties(tool: AssistantToolMetadata) {
  const properties = tool.inputSchema.properties;
  if (!properties || typeof properties !== 'object' || Array.isArray(properties)) return [];

  const required = Array.isArray(tool.inputSchema.required)
    ? new Set(tool.inputSchema.required.filter((item): item is string => typeof item === 'string'))
    : new Set<string>();

  return Object.entries(properties as Record<string, Record<string, unknown>>).map(([name, schema]) => ({
    name,
    required: required.has(name),
    type: formatSchemaType(schema),
    description: typeof schema.description === 'string' ? schema.description : '',
  }));
}

function formatSchemaType(schema: Record<string, unknown>) {
  if (Array.isArray(schema.enum) && schema.enum.length > 0) {
    return schema.enum.map(String).join(' | ');
  }
  if (schema.type === 'array' && schema.items && typeof schema.items === 'object') {
    return `${formatSchemaType(schema.items as Record<string, unknown>)}[]`;
  }
  if (Array.isArray(schema.type)) return schema.type.map(String).join(' | ');
  if (typeof schema.type === 'string') return schema.type;
  return 'value';
}

function getToolCategoryLabel(category: AssistantToolMetadata['category']) {
  switch (category) {
    case 'read':
      return 'Read';
    case 'mutate':
      return 'Write';
    case 'destructive':
      return 'Destructive';
    default:
      return category;
  }
}

export function AssistantSettingsPage() {
  const { t } = useTranslation();
  const { id: conversationId } = useParams<{ id: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = isAssistantSettingsTab(searchParams.get('tab'))
    ? (searchParams.get('tab') as AssistantSettingsTab)
    : 'providers';

  const [providers, setProviders] = useState<Provider[]>([]);
  const [enabledProviderIds, setEnabledProviderIds] = useState<string[]>([]);
  const [isLoadingProviders, setIsLoadingProviders] = useState(true);
  const [isSavingProviders, setIsSavingProviders] = useState(false);

  const [skillsLibrary, setSkillsLibrary] = useState<Library | null>(null);
  const [skillItems, setSkillItems] = useState<LibraryItem[]>([]);
  const [skillPage, setSkillPage] = useState(1);
  const [skillPages, setSkillPages] = useState(1);
  const [skillTotal, setSkillTotal] = useState(0);
  const [isLoadingSkills, setIsLoadingSkills] = useState(false);
  const [editorState, setEditorState] = useState<SkillEditorState | null>(null);
  const [skillTitle, setSkillTitle] = useState('');
  const [skillContent, setSkillContent] = useState('');
  const [isSavingSkill, setIsSavingSkill] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<LibraryItem | null>(null);
  const [isDeletingSkill, setIsDeletingSkill] = useState(false);

  const [tools, setTools] = useState<AssistantToolMetadata[]>([]);
  const [isLoadingTools, setIsLoadingTools] = useState(false);
  const [toolSearch, setToolSearch] = useState('');
  const [toolCategory, setToolCategory] = useState<'all' | AssistantToolMetadata['category']>('all');

  const returnPath = conversationId ? `/assistant/${conversationId}` : '/assistant';

  const providerEntries = useMemo(
    () => providers.map((provider) => ({
      provider,
      models: getTextModelsForProvider(provider.type),
    })),
    [providers],
  );

  const toolCounts = useMemo(() => ({
    total: tools.length,
    read: tools.filter((tool) => tool.category === 'read').length,
    mutate: tools.filter((tool) => tool.category === 'mutate').length,
    destructive: tools.filter((tool) => tool.category === 'destructive').length,
    confirmation: tools.filter((tool) => tool.requiresConfirmation).length,
  }), [tools]);

  const visibleTools = useMemo(() => {
    const query = toolSearch.trim().toLowerCase();
    return tools.filter((tool) => {
      const matchesCategory = toolCategory === 'all' || tool.category === toolCategory;
      const matchesQuery = !query
        || tool.name.toLowerCase().includes(query)
        || tool.title.toLowerCase().includes(query)
        || tool.description.toLowerCase().includes(query);
      return matchesCategory && matchesQuery;
    });
  }, [toolCategory, toolSearch, tools]);

  useEffect(() => {
    let active = true;

    const load = async () => {
      setIsLoadingProviders(true);

      try {
        const result = await fetchAssistantProviders();
        if (!active) return;

        setProviders(result.providers);
        setEnabledProviderIds(resolveEnabledAssistantProviderIds(result.providers));
      } catch (error) {
        console.error('Failed to load assistant providers:', error);
        toast.error(t('assistant.errorOccurred', { defaultValue: 'Something went wrong. Try again.' }));
      } finally {
        if (active) setIsLoadingProviders(false);
      }
    };

    void load();

    return () => {
      active = false;
    };
  }, [t]);

  useEffect(() => {
    if (activeTab !== 'skills' || skillsLibrary) return;

    let active = true;

    const loadLibrary = async () => {
      try {
        const library = await ensureAssistantSkillsLibrary();
        if (active) {
          setSkillsLibrary(library);
        }
      } catch (error) {
        console.error('Failed to prepare assistant skills library:', error);
        if (active) {
          toast.error(t('assistant.errorOccurred', { defaultValue: 'Something went wrong. Try again.' }));
        }
      }
    };

    void loadLibrary();

    return () => {
      active = false;
    };
  }, [activeTab, skillsLibrary, t]);

  useEffect(() => {
    if (activeTab !== 'tools' || tools.length > 0) return;

    let active = true;

    const loadTools = async () => {
      setIsLoadingTools(true);
      try {
        const result = await fetchAssistantTools();
        if (active) {
          setTools(result.tools);
        }
      } catch (error) {
        console.error('Failed to load assistant tools:', error);
        if (active) {
          toast.error(t('assistant.errorOccurred', { defaultValue: 'Something went wrong. Try again.' }));
        }
      } finally {
        if (active) setIsLoadingTools(false);
      }
    };

    void loadTools();

    return () => {
      active = false;
    };
  }, [activeTab, t, tools.length]);

  const loadSkills = useCallback(async (page: number) => {
    if (!skillsLibrary) return;

    setIsLoadingSkills(true);
    try {
      const result = await fetchLibraryItems(skillsLibrary.id, page, SKILLS_PAGE_SIZE);
      setSkillItems(result.items);
      setSkillTotal(result.total);
      setSkillPages(result.pages);

      if (page !== result.page) {
        setSkillPage(result.page);
      }
    } catch (error) {
      console.error('Failed to load assistant skills:', error);
      toast.error(t('assistant.errorOccurred', { defaultValue: 'Something went wrong. Try again.' }));
    } finally {
      setIsLoadingSkills(false);
    }
  }, [skillsLibrary, t]);

  useEffect(() => {
    if (activeTab !== 'skills' || !skillsLibrary) return;
    void loadSkills(skillPage);
  }, [activeTab, loadSkills, skillPage, skillsLibrary]);

  const handleTabChange = (tab: AssistantSettingsTab) => {
    const next = new URLSearchParams(searchParams);
    next.set('tab', tab);
    setSearchParams(next, { replace: true });
  };

  const handleToggleProvider = async (providerId: string) => {
    const isEnabled = enabledProviderIds.includes(providerId);
    if (isEnabled && enabledProviderIds.length === 1) {
      toast.error(
        t('assistant.minimumProviderValidation', {
          defaultValue: 'Keep at least one provider enabled for chat.',
        }),
      );
      return;
    }

    const nextEnabledIds = isEnabled
      ? enabledProviderIds.filter((id) => id !== providerId)
      : [...enabledProviderIds, providerId];

    const validProviderIds = providerEntries
      .filter(({ models }) => models.length > 0)
      .map(({ provider }) => provider.id);
    const normalizedEnabledIds = nextEnabledIds.filter((id) => validProviderIds.includes(id));

    if (normalizedEnabledIds.length === 0) {
      toast.error(
        t('assistant.minimumProviderValidation', {
          defaultValue: 'Keep at least one provider enabled for chat.',
        }),
      );
      return;
    }

    setIsSavingProviders(true);
    try {
      setStoredEnabledAssistantProviderIds(normalizedEnabledIds);

      const enabledProviders = providers.filter((p) => normalizedEnabledIds.includes(p.id));
      const normalizedSelection = normalizeAssistantProviderSelection(
        enabledProviders,
        getStoredValue(PROVIDER_STORAGE_KEY),
        getStoredValue(MODEL_STORAGE_KEY),
      );
      setStoredValue(PROVIDER_STORAGE_KEY, normalizedSelection.providerId);
      setStoredValue(MODEL_STORAGE_KEY, normalizedSelection.modelId);

      setEnabledProviderIds(normalizedEnabledIds);
      toast.success(
        t('assistant.providersSaved', {
          defaultValue: 'Chat-enabled providers updated.',
        }),
      );
    } catch (error) {
      console.error('Failed to save enabled providers:', error);
      toast.error(t('assistant.errorOccurred', { defaultValue: 'Something went wrong. Try again.' }));
    } finally {
      setIsSavingProviders(false);
    }
  };

  const openSkillEditor = (mode: 'create' | 'edit', item?: LibraryItem) => {
    setEditorState({ mode, item: item || null });
    setSkillTitle(item?.title || '');
    setSkillContent(item?.content || '');
  };

  const closeSkillEditor = () => {
    setEditorState(null);
    setSkillTitle('');
    setSkillContent('');
  };

  const handleSaveSkill = async () => {
    if (!skillsLibrary || !editorState) return;

    const title = skillTitle.trim();
    const content = skillContent.trim();

    if (!title || !content) {
      toast.error(
        t('assistant.skillValidation', {
          defaultValue: 'A title and prompt content are required.',
        }),
      );
      return;
    }

    setIsSavingSkill(true);
    try {
      if (editorState.mode === 'create') {
        await createLibraryItem(skillsLibrary.id, {
          id: crypto.randomUUID(),
          title,
          content,
          tags: [],
        });
        setSkillPage(1);
        await loadSkills(1);
      } else if (editorState.item) {
        await updateLibraryItem(skillsLibrary.id, editorState.item.id, {
          title,
          content,
        });
        await loadSkills(skillPage);
      }

      closeSkillEditor();
      toast.success(
        editorState.mode === 'create'
          ? t('assistant.skillCreated', { defaultValue: 'Preset prompt created.' })
          : t('assistant.skillUpdated', { defaultValue: 'Preset prompt updated.' }),
      );
    } catch (error) {
      console.error('Failed to save assistant skill:', error);
      toast.error(t('assistant.errorOccurred', { defaultValue: 'Something went wrong. Try again.' }));
    } finally {
      setIsSavingSkill(false);
    }
  };

  const handleDeleteSkill = async () => {
    if (!skillsLibrary || !deleteTarget) return;

    setIsDeletingSkill(true);
    try {
      await deleteLibraryItem(skillsLibrary.id, deleteTarget.id);

      const nextPage = skillItems.length === 1 && skillPage > 1
        ? skillPage - 1
        : skillPage;

      setSkillPage(nextPage);
      await loadSkills(nextPage);
      setDeleteTarget(null);
      toast.success(t('assistant.skillDeleted', { defaultValue: 'Preset prompt deleted.' }));
    } catch (error) {
      console.error('Failed to delete assistant skill:', error);
      toast.error(t('assistant.errorOccurred', { defaultValue: 'Something went wrong. Try again.' }));
    } finally {
      setIsDeletingSkill(false);
    }
  };

  return (
    <>
      {document.getElementById('mobile-header-assistant-title') && createPortal(
        <>
          <Settings2 className="h-5 w-5 flex-shrink-0 text-indigo-500" />
          <h1 className="truncate text-base font-semibold text-neutral-900 dark:text-white">
            {t('assistant.chatSettings', { defaultValue: 'Chat settings' })}
          </h1>
        </>,
        document.getElementById('mobile-header-assistant-title')!,
      )}

      <div className="h-full overflow-y-auto p-6 lg:p-10">
        <div className="w-full space-y-8">
          <PageHeader
            title={t('assistant.chatSettings', { defaultValue: 'Chat settings' })}
            description={t('assistant.chatSettingsDescription', {
              defaultValue: 'Enable the providers available to chat across the app and manage the preset prompts shown from the composer.',
            })}
            backLink={{
              to: returnPath,
              label: conversationId
                ? t('assistant.backToConversation', { defaultValue: 'Back to chat' })
                : t('assistant.backToAssistant', { defaultValue: 'Back to assistant' }),
            }}
          />

          <div className="rounded-card border border-neutral-200/50 bg-white/40 p-3 backdrop-blur-3xl dark:border-white/5 dark:bg-neutral-900/40">
            <div className="grid gap-2 md:grid-cols-4">
              {[
                {
                  id: 'providers' as const,
                  label: t('assistant.providersTab', { defaultValue: 'Providers' }),
                  icon: KeyRound,
                },
                {
                  id: 'skills' as const,
                  label: t('assistant.skillsTab', { defaultValue: 'Skills' }),
                  icon: Sparkles,
                },
                {
                  id: 'tools' as const,
                  label: t('assistant.toolsTab', { defaultValue: 'Tools' }),
                  icon: Wrench,
                },
                {
                  id: 'mcp' as const,
                  label: t('assistant.mcpTab', { defaultValue: 'MCP' }),
                  icon: Unplug,
                },
              ].map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;

                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => handleTabChange(tab.id)}
                    className={`flex items-center justify-center gap-2 rounded-card border px-4 py-3 text-sm font-medium transition-colors ${
                      isActive
                        ? 'border-blue-500/30 bg-blue-500/10 text-neutral-900 dark:text-white'
                        : 'border-neutral-200/50 bg-white/70 text-neutral-600 hover:border-neutral-300 hover:text-neutral-900 dark:border-white/5 dark:bg-neutral-900/70 dark:text-neutral-400 dark:hover:border-neutral-700 dark:hover:text-neutral-200'
                    }`}
                  >
                    <Icon className={`h-4 w-4 ${isActive ? 'text-blue-400' : 'text-neutral-500 dark:text-neutral-500'}`} />
                    {tab.label}
                  </button>
                );
              })}
            </div>
          </div>

          {activeTab === 'providers' && (
            <section className="rounded-card border border-neutral-200/50 bg-white/50 p-6 backdrop-blur-3xl dark:border-white/5 dark:bg-neutral-900/40">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.2em] text-neutral-500 dark:text-neutral-500">
                    {t('assistant.chatProvidersSection', { defaultValue: 'Chat providers' })}
                  </p>
                  <h2 className="mt-2 text-xl font-bold text-neutral-900 dark:text-white">
                    {t('assistant.chatProvidersTitle', { defaultValue: 'Enable providers for Assistant' })}
                  </h2>
                  <p className="mt-2 max-w-2xl text-sm text-neutral-600 dark:text-neutral-400">
                    {t('assistant.chatProvidersDescription', {
                      defaultValue: 'These providers appear in the assistant composer across the app. Disabled providers are hidden from new chat selection.',
                    })}
                  </p>
                  <Link
                    to="/providers"
                    className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-indigo-600 transition-colors hover:text-indigo-500 dark:text-indigo-300"
                  >
                    <Settings2 className="h-4 w-4" />
                    {t('assistant.manageProvidersLink', { defaultValue: 'Manage provider credentials' })}
                  </Link>
                </div>

                  <div className="flex flex-col items-start gap-3 rounded-card border border-neutral-200/60 bg-white/70 px-4 py-3 text-sm shadow-sm dark:border-white/5 dark:bg-neutral-900/60 lg:min-w-60">
                    <div className="flex items-center gap-2">
                      <Layers3 className="h-4 w-4 text-indigo-500" />
                      <span className="font-semibold text-neutral-900 dark:text-white">
                        {t('assistant.enabledProviderCount', {
                          defaultValue: '{{count}} enabled',
                          count: enabledProviderIds.length,
                        })}
                      </span>
                    </div>
                  </div>
              </div>

              <div className="mt-6 space-y-4">
                {isLoadingProviders ? (
                  <div className="flex items-center justify-center rounded-card border border-neutral-200/50 bg-white/70 px-4 py-10 text-neutral-500 dark:border-white/5 dark:bg-neutral-900/60 dark:text-neutral-400">
                    <Loader2 className="h-5 w-5 animate-spin" />
                  </div>
                ) : providerEntries.length === 0 ? (
                  <div className="rounded-card border border-dashed border-neutral-200/70 bg-white/60 px-4 py-8 text-center text-sm text-neutral-500 dark:border-neutral-800 dark:bg-neutral-900/40 dark:text-neutral-400">
                    {t('assistant.providerNotConfigured', {
                      defaultValue: 'No chat provider is configured yet. Add one first.',
                    })}
                  </div>
                ) : (
                  providerEntries.map(({ provider, models }) => {
                    const isEnabled = enabledProviderIds.includes(provider.id);
                    const isUnavailable = models.length === 0;

                    return (
                      <div
                        key={provider.id}
                        className="rounded-card border border-neutral-200/60 bg-white/70 px-4 py-4 shadow-sm dark:border-white/5 dark:bg-neutral-900/60"
                      >
                        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="text-lg font-semibold text-neutral-900 dark:text-white">{provider.name}</h3>
                              <span className="rounded-full border border-neutral-200/70 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500 dark:border-white/10 dark:text-neutral-400">
                                {provider.type}
                              </span>
                              <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${
                                isEnabled
                                  ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300'
                                  : 'border-neutral-200/70 bg-neutral-100/80 text-neutral-500 dark:border-white/10 dark:bg-neutral-800/80 dark:text-neutral-400'
                              }`}>
                                {isEnabled
                                  ? t('assistant.providerEnabled', { defaultValue: 'Enabled' })
                                  : t('assistant.providerDisabled', { defaultValue: 'Disabled' })}
                              </span>
                            </div>
                            <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
                              {isUnavailable
                                ? t('assistant.providerUnavailable', {
                                    defaultValue: 'No text chat models are available for this provider.',
                                  })
                                : t('assistant.providerModelSummary', {
                                    defaultValue: '{{count}} chat models available',
                                    count: models.length,
                                  })}
                            </p>
                            {models.length > 0 && (
                              <div className="mt-4 flex flex-wrap gap-2">
                                {models.map((model) => (
                                  <span
                                    key={model.id}
                                    className="rounded-full border border-indigo-500/15 bg-indigo-500/10 px-3 py-1 text-xs font-medium text-indigo-700 dark:text-indigo-300"
                                  >
                                    {model.name}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>

                          <button
                            type="button"
                            onClick={() => handleToggleProvider(provider.id)}
                            disabled={isUnavailable}
                            className={`inline-flex items-center gap-2 rounded-card border px-4 py-2.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                              isEnabled
                                ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/15 dark:text-emerald-300'
                                : 'border-neutral-200/70 bg-white/80 text-neutral-700 hover:border-neutral-300 hover:text-neutral-900 dark:border-white/10 dark:bg-neutral-950/70 dark:text-neutral-300 dark:hover:border-neutral-700 dark:hover:text-white'
                            }`}
                          >
                            {isEnabled ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
                            {isEnabled
                              ? t('assistant.disableProviderAction', { defaultValue: 'Disable for chat' })
                              : t('assistant.enableProviderAction', { defaultValue: 'Enable for chat' })}
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </section>
          )}

          {activeTab === 'skills' && (
            <section className="rounded-card border border-neutral-200/50 bg-white/50 p-6 backdrop-blur-3xl dark:border-white/5 dark:bg-neutral-900/40">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.2em] text-neutral-500 dark:text-neutral-500">
                    {t('assistant.presetPrompts', { defaultValue: 'Preset prompts' })}
                  </p>
                  <h2 className="mt-2 text-xl font-bold text-neutral-900 dark:text-white">
                    {t('assistant.presetPromptsTitle', { defaultValue: 'Composer skills' })}
                  </h2>
                  <p className="mt-2 max-w-2xl text-sm text-neutral-600 dark:text-neutral-400">
                    {t('assistant.presetPromptsDescription', {
                      defaultValue: 'Type ` in the chat box to open this list and insert a preset prompt into the current draft.',
                    })}
                  </p>
                  {skillsLibrary && (
                    <Link
                      to={`/library/${skillsLibrary.id}`}
                      className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-indigo-600 transition-colors hover:text-indigo-500 dark:text-indigo-300"
                    >
                      <Sparkles className="h-4 w-4" />
                      {t('assistant.openSkillsLibrary', { defaultValue: 'Open underlying text library' })}
                    </Link>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => openSkillEditor('create')}
                  disabled={!skillsLibrary}
                  className="inline-flex items-center justify-center gap-2 rounded-card bg-indigo-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-600/20 transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Plus className="h-4 w-4" />
                  {t('assistant.newSkill', { defaultValue: 'New skill' })}
                </button>
              </div>

              <div className="mt-6 space-y-3">
                {isLoadingSkills ? (
                  <div className="flex items-center justify-center rounded-card border border-neutral-200/50 bg-white/70 px-4 py-12 text-neutral-500 dark:border-white/5 dark:bg-neutral-900/60 dark:text-neutral-400">
                    <Loader2 className="h-5 w-5 animate-spin" />
                  </div>
                ) : skillItems.length === 0 ? (
                  <div className="rounded-card border border-dashed border-neutral-200/70 bg-white/60 px-4 py-12 text-center dark:border-neutral-800 dark:bg-neutral-900/40">
                    <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-card bg-indigo-500/10 text-indigo-500 dark:text-indigo-300">
                      <Sparkles className="h-6 w-6" />
                    </div>
                    <p className="mt-4 text-lg font-semibold text-neutral-900 dark:text-white">
                      {t('assistant.emptySkillsTitle', { defaultValue: 'No preset prompts yet' })}
                    </p>
                    <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
                      {t('assistant.emptySkillsDescription', {
                        defaultValue: 'Create a skill here, then type ` in the composer to insert it into the chat draft.',
                      })}
                    </p>
                  </div>
                ) : (
                  skillItems.map((item, index) => (
                    <div
                      key={item.id}
                      className="rounded-card border border-neutral-200/60 bg-white/70 px-4 py-4 shadow-sm transition-colors dark:border-white/5 dark:bg-neutral-900/60"
                    >
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="rounded-full border border-indigo-500/20 bg-indigo-500/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-indigo-600 dark:text-indigo-300">
                              {t('assistant.skillLabel', { defaultValue: 'Skill' })}
                            </span>
                            <span className="text-xs text-neutral-500 dark:text-neutral-500">
                              {t('assistant.skillIndex', {
                                defaultValue: '{{index}} of {{total}}',
                                index: (skillPage - 1) * SKILLS_PAGE_SIZE + index + 1,
                                total: skillTotal,
                              })}
                            </span>
                          </div>
                          <h3 className="mt-3 text-lg font-semibold text-neutral-900 dark:text-white">
                            {item.title || t('assistant.untitledSkill', { defaultValue: 'Untitled preset prompt' })}
                          </h3>
                          <p className="mt-2 text-sm leading-6 text-neutral-600 dark:text-neutral-400">
                            {summarizeSkillContent(item.content)}
                          </p>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => openSkillEditor('edit', item)}
                            className="inline-flex items-center gap-2 rounded-xl border border-neutral-200/70 bg-white/80 px-3 py-2 text-sm font-medium text-neutral-700 transition-colors hover:border-neutral-300 hover:text-neutral-900 dark:border-white/10 dark:bg-neutral-950/70 dark:text-neutral-300 dark:hover:border-neutral-700 dark:hover:text-white"
                          >
                            <Pencil className="h-4 w-4" />
                            {t('assistant.editSkill', { defaultValue: 'Edit' })}
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(item)}
                            className="inline-flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-500/15 dark:text-red-300"
                          >
                            <Trash2 className="h-4 w-4" />
                            {t('assistant.deleteSkill', { defaultValue: 'Delete' })}
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {skillPages > 1 && (
                <div className="mt-6 flex items-center justify-between rounded-card border border-neutral-200/60 bg-white/70 px-4 py-3 text-sm dark:border-white/5 dark:bg-neutral-900/60">
                  <button
                    type="button"
                    onClick={() => setSkillPage((page) => Math.max(1, page - 1))}
                    disabled={skillPage === 1}
                    className="rounded-xl border border-neutral-200/70 px-3 py-2 font-medium text-neutral-700 transition-colors hover:border-neutral-300 hover:text-neutral-900 disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/10 dark:text-neutral-300 dark:hover:border-neutral-700 dark:hover:text-white"
                  >
                    {t('assistant.previousPage', { defaultValue: 'Previous' })}
                  </button>
                  <span className="text-neutral-500 dark:text-neutral-400">
                    {t('assistant.skillPageLabel', {
                      defaultValue: 'Page {{page}} of {{pages}}',
                      page: skillPage,
                      pages: skillPages,
                    })}
                  </span>
                  <button
                    type="button"
                    onClick={() => setSkillPage((page) => Math.min(skillPages, page + 1))}
                    disabled={skillPage === skillPages}
                    className="rounded-xl border border-neutral-200/70 px-3 py-2 font-medium text-neutral-700 transition-colors hover:border-neutral-300 hover:text-neutral-900 disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/10 dark:text-neutral-300 dark:hover:border-neutral-700 dark:hover:text-white"
                  >
                    {t('assistant.nextPage', { defaultValue: 'Next' })}
                  </button>
                </div>
              )}
            </section>
          )}

          {activeTab === 'tools' && (
            <section className="rounded-card border border-neutral-200/50 bg-white/50 p-6 backdrop-blur-3xl dark:border-white/5 dark:bg-neutral-900/40">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.2em] text-neutral-500 dark:text-neutral-500">
                    {t('assistant.toolsSection', { defaultValue: 'Assistant tools' })}
                  </p>
                  <h2 className="mt-2 text-xl font-bold text-neutral-900 dark:text-white">
                    {t('assistant.toolsTitle', { defaultValue: 'Available MCP tools' })}
                  </h2>
                  <p className="mt-2 max-w-2xl text-sm text-neutral-600 dark:text-neutral-400">
                    {t('assistant.toolsDescription', {
                      defaultValue: 'These are the actions the assistant can call during chat. Write actions pause for approval before they run.',
                    })}
                  </p>
                </div>
              </div>

              <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {[
                  {
                    label: t('assistant.toolsTotal', { defaultValue: 'Total tools' }),
                    value: toolCounts.total,
                    icon: Wrench,
                    tone: 'text-indigo-600 bg-indigo-500/10 dark:text-indigo-300',
                  },
                  {
                    label: t('assistant.toolsReadOnly', { defaultValue: 'Read-only' }),
                    value: toolCounts.read,
                    icon: Database,
                    tone: 'text-sky-600 bg-sky-500/10 dark:text-sky-300',
                  },
                  {
                    label: t('assistant.toolsWriteActions', { defaultValue: 'Write actions' }),
                    value: toolCounts.mutate,
                    icon: ListChecks,
                    tone: 'text-emerald-600 bg-emerald-500/10 dark:text-emerald-300',
                  },
                  {
                    label: t('assistant.toolsNeedApproval', { defaultValue: 'Need approval' }),
                    value: toolCounts.confirmation,
                    icon: ShieldCheck,
                    tone: 'text-amber-600 bg-amber-500/10 dark:text-amber-300',
                  },
                ].map((stat) => {
                  const Icon = stat.icon;
                  return (
                    <div
                      key={stat.label}
                      className="rounded-card border border-neutral-200/60 bg-white/70 px-4 py-4 shadow-sm dark:border-white/5 dark:bg-neutral-900/60"
                    >
                      <div className={`inline-flex h-10 w-10 items-center justify-center rounded-card ${stat.tone}`}>
                        <Icon className="h-5 w-5" />
                      </div>
                      <p className="mt-4 text-2xl font-bold text-neutral-900 dark:text-white">{stat.value}</p>
                      <p className="mt-1 text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500 dark:text-neutral-500">
                        {stat.label}
                      </p>
                    </div>
                  );
                })}
              </div>

              <div className="mt-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <label className="relative block lg:min-w-96">
                  <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
                  <input
                    value={toolSearch}
                    onChange={(event) => setToolSearch(event.target.value)}
                    placeholder={t('assistant.searchTools', { defaultValue: 'Search tools' })}
                    className="w-full rounded-card border border-neutral-200/70 bg-white/80 py-3 pl-11 pr-4 text-sm text-neutral-900 outline-none transition-colors focus:border-indigo-400 dark:border-white/10 dark:bg-neutral-950/70 dark:text-white"
                  />
                </label>

                <div className="flex flex-wrap gap-2">
                  {[
                    ['all', t('assistant.toolsAll', { defaultValue: 'All' })],
                    ['read', t('assistant.toolsRead', { defaultValue: 'Read' })],
                    ['mutate', t('assistant.toolsWrite', { defaultValue: 'Write' })],
                    ['destructive', t('assistant.toolsDestructive', { defaultValue: 'Destructive' })],
                  ].map(([value, label]) => {
                    const isActive = toolCategory === value;
                    return (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setToolCategory(value as typeof toolCategory)}
                        className={`rounded-card border px-4 py-2.5 text-sm font-medium transition-colors ${
                          isActive
                            ? 'border-indigo-500/30 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300'
                            : 'border-neutral-200/70 bg-white/80 text-neutral-600 hover:border-neutral-300 hover:text-neutral-900 dark:border-white/10 dark:bg-neutral-950/70 dark:text-neutral-300 dark:hover:border-neutral-700 dark:hover:text-white'
                        }`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="mt-6">
                {isLoadingTools ? (
                  <div className="flex items-center justify-center rounded-card border border-neutral-200/50 bg-white/70 px-4 py-12 text-neutral-500 dark:border-white/5 dark:bg-neutral-900/60 dark:text-neutral-400">
                    <Loader2 className="h-5 w-5 animate-spin" />
                  </div>
                ) : visibleTools.length === 0 ? (
                  <div className="rounded-card border border-dashed border-neutral-200/70 bg-white/60 px-4 py-12 text-center dark:border-neutral-800 dark:bg-neutral-900/40">
                    <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-card bg-indigo-500/10 text-indigo-500 dark:text-indigo-300">
                      <Wrench className="h-6 w-6" />
                    </div>
                    <p className="mt-4 text-lg font-semibold text-neutral-900 dark:text-white">
                      {t('assistant.noToolsFound', { defaultValue: 'No tools found' })}
                    </p>
                    <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
                      {t('assistant.noToolsFoundDescription', {
                        defaultValue: 'Try a different search term or category filter.',
                      })}
                    </p>
                  </div>
                ) : (
                  <div className="grid gap-4 xl:grid-cols-2">
                    {visibleTools.map((tool) => {
                      const properties = getToolProperties(tool);
                      const categoryLabel = getToolCategoryLabel(tool.category);
                      const categoryTone = tool.category === 'read'
                        ? 'border-sky-500/20 bg-sky-500/10 text-sky-700 dark:text-sky-300'
                        : tool.category === 'mutate'
                          ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                          : 'border-red-500/20 bg-red-500/10 text-red-700 dark:text-red-300';

                      return (
                        <article
                          key={tool.name}
                          className="rounded-card border border-neutral-200/60 bg-white/70 p-5 shadow-sm dark:border-white/5 dark:bg-neutral-900/60"
                        >
                          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${categoryTone}`}>
                                  {categoryLabel}
                                </span>
                                {tool.requiresConfirmation && (
                                  <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/20 bg-amber-500/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-700 dark:text-amber-300">
                                    <ShieldCheck className="h-3 w-3" />
                                    {t('assistant.confirmationRequired', { defaultValue: 'Approval' })}
                                  </span>
                                )}
                              </div>
                              <h3 className="mt-3 text-lg font-bold text-neutral-900 dark:text-white">
                                {tool.title}
                              </h3>
                              <p className="mt-1 font-mono text-xs text-neutral-500 dark:text-neutral-500">
                                {tool.name}
                              </p>
                            </div>
                          </div>

                          <p className="mt-4 text-sm leading-6 text-neutral-600 dark:text-neutral-400">
                            {tool.description}
                          </p>

                          <div className="mt-5 border-t border-neutral-200/70 pt-4 dark:border-white/10">
                            <p className="text-xs font-black uppercase tracking-[0.2em] text-neutral-500 dark:text-neutral-500">
                              {t('assistant.toolInputs', { defaultValue: 'Inputs' })}
                            </p>
                            {properties.length === 0 ? (
                              <p className="mt-3 text-sm text-neutral-500 dark:text-neutral-400">
                                {t('assistant.noToolInputs', { defaultValue: 'No inputs required.' })}
                              </p>
                            ) : (
                              <div className="mt-3 space-y-2">
                                {properties.map((property) => (
                                  <div
                                    key={property.name}
                                    className="rounded-xl border border-neutral-200/60 bg-white/70 px-3 py-3 dark:border-white/5 dark:bg-neutral-950/50"
                                  >
                                    <div className="flex flex-wrap items-center gap-2">
                                      <span className="font-mono text-sm font-semibold text-neutral-900 dark:text-white">
                                        {property.name}
                                      </span>
                                      <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
                                        {property.type}
                                      </span>
                                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                                        property.required
                                          ? 'bg-rose-500/10 text-rose-600 dark:text-rose-300'
                                          : 'bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400'
                                      }`}>
                                        {property.required
                                          ? t('assistant.requiredInput', { defaultValue: 'Required' })
                                          : t('assistant.optionalInput', { defaultValue: 'Optional' })}
                                      </span>
                                    </div>
                                    {property.description && (
                                      <p className="mt-2 text-sm leading-5 text-neutral-600 dark:text-neutral-400">
                                        {property.description}
                                      </p>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}
              </div>
            </section>
          )}

          {activeTab === 'mcp' && <McpConnections embedded />}
        </div>

        {editorState && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
            <div className="w-full max-w-2xl rounded-card border border-neutral-200/60 bg-white p-6 shadow-2xl dark:border-white/10 dark:bg-neutral-950">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.2em] text-neutral-500 dark:text-neutral-500">
                    {editorState.mode === 'create'
                      ? t('assistant.newSkill', { defaultValue: 'New skill' })
                      : t('assistant.editSkill', { defaultValue: 'Edit' })}
                  </p>
                  <h2 className="mt-2 text-xl font-bold text-neutral-900 dark:text-white">
                    {editorState.mode === 'create'
                      ? t('assistant.createSkillTitle', { defaultValue: 'Create a preset prompt' })
                      : t('assistant.editSkillTitle', { defaultValue: 'Update preset prompt' })}
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={closeSkillEditor}
                  disabled={isSavingSkill}
                  className="rounded-xl border border-neutral-200/70 px-3 py-2 text-sm font-medium text-neutral-600 transition-colors hover:border-neutral-300 hover:text-neutral-900 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:text-neutral-300 dark:hover:border-neutral-700 dark:hover:text-white"
                >
                  {t('assistant.cancel', { defaultValue: 'Cancel' })}
                </button>
              </div>

              <div className="mt-6 space-y-4">
                <label className="block">
                  <span className="text-xs font-black uppercase tracking-[0.2em] text-neutral-500 dark:text-neutral-500">
                    {t('assistant.skillTitleField', { defaultValue: 'Title' })}
                  </span>
                  <input
                    value={skillTitle}
                    onChange={(event) => setSkillTitle(event.target.value)}
                    placeholder={t('assistant.skillTitlePlaceholder', { defaultValue: 'Summarize this transcript' })}
                    className="mt-2 w-full rounded-card border border-neutral-200/70 bg-white px-4 py-3 text-sm text-neutral-900 outline-none transition-colors focus:border-indigo-400 dark:border-white/10 dark:bg-neutral-950 dark:text-white"
                  />
                </label>

                <label className="block">
                  <span className="text-xs font-black uppercase tracking-[0.2em] text-neutral-500 dark:text-neutral-500">
                    {t('assistant.skillPromptField', { defaultValue: 'Prompt template' })}
                  </span>
                  <textarea
                    value={skillContent}
                    onChange={(event) => setSkillContent(event.target.value)}
                    rows={10}
                    placeholder={t('assistant.skillPromptPlaceholder', {
                      defaultValue: 'Paste the prompt template that should be inserted into the chat box.',
                    })}
                    className="mt-2 w-full resize-y rounded-card border border-neutral-200/70 bg-white px-4 py-3 text-sm text-neutral-900 outline-none transition-colors focus:border-indigo-400 dark:border-white/10 dark:bg-neutral-950 dark:text-white"
                  />
                </label>
              </div>

              <div className="mt-6 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={closeSkillEditor}
                  disabled={isSavingSkill}
                  className="rounded-card border border-neutral-200/70 px-4 py-3 text-sm font-medium text-neutral-700 transition-colors hover:border-neutral-300 hover:text-neutral-900 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:text-neutral-300 dark:hover:border-neutral-700 dark:hover:text-white"
                >
                  {t('assistant.cancel', { defaultValue: 'Cancel' })}
                </button>
                <button
                  type="button"
                  onClick={handleSaveSkill}
                  disabled={isSavingSkill}
                  className="inline-flex items-center gap-2 rounded-card bg-indigo-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-600/20 transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isSavingSkill ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  {editorState.mode === 'create'
                    ? t('assistant.createSkillAction', { defaultValue: 'Create skill' })
                    : t('assistant.saveSkillAction', { defaultValue: 'Save changes' })}
                </button>
              </div>
            </div>
          </div>
        )}

        <ConfirmModal
          isOpen={!!deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onConfirm={handleDeleteSkill}
          title={t('assistant.deleteSkillTitle', { defaultValue: 'Delete preset prompt' })}
          message={t('assistant.deleteSkillMessage', {
            defaultValue: 'Delete "{{name}}" from the preset prompt list?',
            name: deleteTarget?.title || t('assistant.untitledSkill', { defaultValue: 'Untitled preset prompt' }),
          })}
          confirmText={
            isDeletingSkill
              ? t('assistant.deletingSkill', { defaultValue: 'Deleting...' })
              : t('assistant.deleteSkill', { defaultValue: 'Delete' })
          }
          type="danger"
        />
      </div>
    </>
  );
}
