import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router-dom';
import { createLibraryItem, deleteLibraryItem, fetchAssistantProviders, fetchAssistantTools, fetchLibraryItems, updateLibraryItem, type AssistantSwarmPreset, type AssistantSwarmToolScope, type AssistantToolMetadata } from '../../api';
import { loadAssistantSettings, normalizeAssistantProviderSelection, resolveEnabledAssistantProviderIds, saveAssistantSettings } from '../../lib/assistant-provider-settings';
import { ensureAssistantSkillsLibrary } from '../../lib/assistant-skills';
import { DEFAULT_SWARM_PRESETS } from '../../lib/assistant-swarm-presets';
import { Button, ChipSet, Dialog, FilterChip, Icon, MenuButton, MenuDivider, MenuGroup, MenuItem, Switch, Tab, Tabs, Text, TextField } from '../../m3';
import { getTextModelsForProvider, type Library, type LibraryItem, type Provider } from '../../types';
import { McpConnections } from '../components/assistant/McpConnections';
import { ProviderLogo } from '../components/ProviderLogo';
import { usePaginationScroll } from '../lib/usePaginationScroll';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { EmptyState, LoadingState, Page, PageHeader, Section } from '../ui/Page';
import { PagedFooter } from '../ui/PagedFooter';
import { Row, RowList } from '../ui/Rows';
import { ListSearch } from '../ui/ListSearch';
import { StatTile, StatusPill } from '../ui/Stat';
import { useToast } from '../ui/useToast';

type AssistantSettingsTab = 'providers' | 'swarm' | 'skills' | 'tools' | 'mcp';

type SkillEditorState = {
  mode: 'create' | 'edit';
  item: LibraryItem | null;
};

const SKILLS_PAGE_SIZE = 8;

function isAssistantSettingsTab(value: string | null): value is AssistantSettingsTab {
  return value === 'providers' || value === 'swarm' || value === 'skills' || value === 'tools' || value === 'mcp';
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

/** Assistant settings: chat providers, composer skills, the tools it can call, and MCP connections. */
export function AssistantSettings() {
  const toast = useToast();
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const returnTo = searchParams.get('returnTo');
  const activeTab = isAssistantSettingsTab(searchParams.get('tab'))
    ? (searchParams.get('tab') as AssistantSettingsTab)
    : 'providers';

  const [providers, setProviders] = useState<Provider[]>([]);
  const [enabledProviderIds, setEnabledProviderIds] = useState<string[]>([]);
  const [isLoadingProviders, setIsLoadingProviders] = useState(true);
  const [isSavingProviders, setIsSavingProviders] = useState(false);

  // Swarm settings & reusable presets
  const [swarmEnabled, setSwarmEnabled] = useState(false);
  const [swarmWorkerProviderId, setSwarmWorkerProviderId] = useState<string | null>(null);
  const [swarmWorkerModelId, setSwarmWorkerModelId] = useState<string | null>(null);
  const [swarmPresets, setSwarmPresets] = useState<AssistantSwarmPreset[]>([]);
  const [presetDialogOpen, setPresetDialogOpen] = useState(false);
  const [presetName, setPresetName] = useState('');
  const [presetDesc, setPresetDesc] = useState('');
  const [presetGoal, setPresetGoal] = useState('');
  const [presetWorkerRole, setPresetWorkerRole] = useState('Prompt Engineer');
  const [presetWorkerBrief, setPresetWorkerBrief] = useState('');
  const [presetWorkerScope, setPresetWorkerScope] = useState<AssistantSwarmToolScope>('propose');
  const [deletePresetTarget, setDeletePresetTarget] = useState<AssistantSwarmPreset | null>(null);

  const [skillsLibrary, setSkillsLibrary] = useState<Library | null>(null);
  const [skillItems, setSkillItems] = useState<LibraryItem[]>([]);
  const [skillPage, setSkillPage] = useState(1);
  const paginationRef = usePaginationScroll({ page: skillPage, enabled: activeTab === 'skills' });
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

  const returnPath = returnTo || '/assistant';

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
        const [result, settings] = await Promise.all([fetchAssistantProviders(), loadAssistantSettings()]);
        if (!active) return;

        setProviders(result.providers);
        setEnabledProviderIds(resolveEnabledAssistantProviderIds(result.providers, settings.enabledProviderIds));
        setSwarmEnabled(settings.swarmEnabled);
        setSwarmWorkerProviderId(settings.swarmWorkerProviderId);
        setSwarmWorkerModelId(settings.swarmWorkerModelId);
        setSwarmPresets(settings.swarmPresets);
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

  const skillsRequest = useRef(0);
  const loadSkills = useCallback(async (page: number) => {
    if (!skillsLibrary) return;
    const request = ++skillsRequest.current;

    setIsLoadingSkills(true);
    try {
      const result = await fetchLibraryItems(skillsLibrary.id, page, SKILLS_PAGE_SIZE);
      if (request !== skillsRequest.current) return;
      setSkillItems(result.items);
      setSkillTotal(result.total);
      setSkillPages(result.pages);

      if (page !== result.page) {
        setSkillPage(result.page);
      }
    } catch (error) {
      if (request !== skillsRequest.current) return;
      console.error('Failed to load assistant skills:', error);
      toast.error(t('assistant.errorOccurred', { defaultValue: 'Something went wrong. Try again.' }));
    } finally {
      if (request === skillsRequest.current) setIsLoadingSkills(false);
    }
  }, [skillsLibrary, t]);

  useEffect(() => {
    if (activeTab !== 'skills' || !skillsLibrary) return;
    void loadSkills(skillPage);
    return () => { skillsRequest.current++; };
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
        t('v2.assistant.minimumProviderValidation', {
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
        t('v2.assistant.minimumProviderValidation', {
          defaultValue: 'Keep at least one provider enabled for chat.',
        }),
      );
      return;
    }

    setIsSavingProviders(true);
    try {
      const current = await loadAssistantSettings();
      const enabledProviders = providers.filter((p) => normalizedEnabledIds.includes(p.id));
      const normalizedSelection = normalizeAssistantProviderSelection(
        enabledProviders,
        current.lastProviderId || '',
        current.lastModelId || '',
      );
      await saveAssistantSettings({
        enabledProviderIds: normalizedEnabledIds,
        lastProviderId: normalizedSelection.providerId || null,
        lastModelId: normalizedSelection.modelId || null,
      });

      setEnabledProviderIds(normalizedEnabledIds);
      toast.success(
        t('v2.assistant.providersSaved', {
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
        t('v2.assistant.skillValidation', {
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
          ? t('v2.assistant.skillCreated', { defaultValue: 'Preset prompt created.' })
          : t('v2.assistant.skillUpdated', { defaultValue: 'Preset prompt updated.' }),
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
      toast.success(t('v2.assistant.skillDeleted', { defaultValue: 'Preset prompt deleted.' }));
    } catch (error) {
      console.error('Failed to delete assistant skill:', error);
      toast.error(t('assistant.errorOccurred', { defaultValue: 'Something went wrong. Try again.' }));
    } finally {
      setIsDeletingSkill(false);
    }
  };

  return (
    <Page ref={paginationRef} width="default" density="compact">
      <PageHeader
        title={t('v2.assistant.chatSettings', { defaultValue: 'Chat settings' })}
        description={t('v2.assistant.chatSettingsDescription', { defaultValue: 'Enable the providers available to chat across the app and manage the preset prompts shown from the composer.' })}
        backLink={{ to: returnPath, label: returnTo ? t('v2.assistant.backToConversation', { defaultValue: 'Back to chat' }) : t('v2.chatHistory.backToAssistant', { defaultValue: 'Back to assistant' }) }}
      />
      <Tabs value={activeTab} onChange={(v) => handleTabChange(v as AssistantSettingsTab)} variant="secondary" scrollable className="mb-4">
        <Tab value="providers" icon="key" inlineIcon label={t('v2.assistant.providersTab', { defaultValue: 'Providers' })} />
        <Tab value="swarm" icon="hub" inlineIcon label={t('v2.assistant.swarmTab', { defaultValue: 'Swarm' })} />
        <Tab value="skills" icon="auto_awesome" inlineIcon label={t('v2.assistant.skillsTab', { defaultValue: 'Skills' })} />
        <Tab value="tools" icon="build" inlineIcon label={t('v2.assistant.toolsTab', { defaultValue: 'Tools' })} />
        <Tab value="mcp" icon="hub" inlineIcon label={t('sidebar.mcp', { defaultValue: 'MCP' })} />
      </Tabs>

      {activeTab === 'providers' && (
        <Section
          variant="plain"
          title={t('assistant.chatProvidersTitle', { defaultValue: 'Enable providers for Assistant' })}
          description={
            <>
              {t('v2.assistant.chatProvidersDescription', { defaultValue: 'These providers appear in the assistant composer across the app. Disabled providers are hidden from new chat selection.' })}{' '}
              <Link to="/providers" className="v2-link">
                {t('v2.assistant.manageProvidersLink', { defaultValue: 'Manage provider credentials' })}
              </Link>
            </>
          }
          actions={<StatusPill tone="primary" icon="layers">{t('v2.assistant.enabledProviderCount', { defaultValue: '{{count}} enabled', count: enabledProviderIds.length })}</StatusPill>}
        >
          {isLoadingProviders ? (
            <LoadingState minHeight={200} />
          ) : providerEntries.length === 0 ? (
            <EmptyState icon="key_off" size="inline" title={t('assistant.providerNotConfigured', { defaultValue: 'No chat provider is configured yet. Add one first.' })} />
          ) : (
            <RowList>
              {providerEntries.map(({ provider, models }) => {
                const enabled = enabledProviderIds.includes(provider.id);
                const unavailable = models.length === 0;
                return (
                  <Row
                    key={provider.id}
                    lead={<ProviderLogo type={provider.type} size={28} />}
                    title={
                      <span className="flex flex-wrap items-center gap-2">
                        {provider.name}
                        <span className="v2-info-chip">{provider.type}</span>
                        <StatusPill tone={enabled ? 'success' : 'neutral'}>{enabled ? t('v2.assistant.providerEnabled', { defaultValue: 'Enabled' }) : t('v2.assistant.providerDisabled', { defaultValue: 'Disabled' })}</StatusPill>
                      </span>
                    }
                    meta={unavailable ? t('v2.assistant.providerUnavailable', { defaultValue: 'No text chat models are available for this provider.' }) : t('v2.assistant.providerModelSummary', { defaultValue: '{{count}} chat models available', count: models.length })}
                    actions={
                      <Button variant={enabled ? 'tonal' : 'outlined'} size="sm" icon={enabled ? 'check' : 'close'} disabled={unavailable || isSavingProviders} onClick={() => void handleToggleProvider(provider.id)}>
                        {enabled ? t('v2.assistant.disableProviderAction', { defaultValue: 'Disable for chat' }) : t('v2.assistant.enableProviderAction', { defaultValue: 'Enable for chat' })}
                      </Button>
                    }
                  >
                    {models.length > 0 && (
                      <span className="mt-1 flex flex-wrap gap-1">
                        {models.map((m) => (
                          <span key={m.id} className="v2-info-chip">
                            {m.name}
                          </span>
                        ))}
                      </span>
                    )}
                  </Row>
                );
              })}
            </RowList>
          )}
        </Section>
      )}

      {activeTab === 'swarm' && (
        <>
          <Section
            variant="plain"
            title={t('v2.assistant.swarm.settingsTitle', { defaultValue: 'Multi-agent Swarm defaults' })}
            description={t('v2.assistant.swarm.settingsDescription', { defaultValue: 'Configure default Swarm Mode behavior and an optional faster/cheaper model for parallel workers.' })}
          >
            <RowList>
              <Row
                lead={<Icon name="hub" size={24} />}
                title={t('v2.assistant.swarm.defaultEnabled', { defaultValue: 'Enable Swarm Mode by default' })}
                meta={t('v2.assistant.swarm.defaultEnabledDesc', { defaultValue: 'Allow the Coordinator to spawn parallel specialist workers in new chats.' })}
                actions={
                  <Switch
                    checked={swarmEnabled}
                    onChange={async (e) => {
                      const next = e.target.checked;
                      setSwarmEnabled(next);
                      try {
                        await saveAssistantSettings({ swarmEnabled: next });
                      } catch {
                        toast.error(t('assistant.errorOccurred', { defaultValue: 'Something went wrong. Try again.' }));
                      }
                    }}
                  />
                }
              />
              <Row
                lead={<Icon name="bolt" size={24} />}
                title={t('v2.assistant.swarm.workerModel', { defaultValue: 'Swarm worker model' })}
                meta={t('v2.assistant.swarm.workerModelDesc', { defaultValue: 'Pair a frontier Coordinator model with a fast worker model for parallel shards.' })}
                actions={
                  <MenuButton
                    placement="bottom-end"
                    aria-label={t('v2.assistant.swarm.workerModel', { defaultValue: 'Swarm worker model' })}
                    trigger={(props) => {
                      const wp = providers.find((p) => p.id === swarmWorkerProviderId);
                      const wm = wp ? getTextModelsForProvider(wp.type).find((m) => m.id === swarmWorkerModelId) : null;
                      return (
                        <button {...props} type="button" className="v2-model-chip m3-focus-ring">
                          {wp ? <ProviderLogo type={wp.type} size={16} /> : <Icon name="sync" size={16} />}
                          <span className="truncate">{wm?.name || t('v2.assistant.swarm.sameAsCoordinator', { defaultValue: 'Same as Coordinator' })}</span>
                          <Icon name="arrow_drop_down" size={18} />
                        </button>
                      );
                    }}
                  >
                    <MenuItem
                      icon="sync"
                      selected={!swarmWorkerProviderId}
                      onSelect={async () => {
                        setSwarmWorkerProviderId(null);
                        setSwarmWorkerModelId(null);
                        await saveAssistantSettings({ swarmWorkerProviderId: null, swarmWorkerModelId: null }).catch(() => {});
                      }}
                    >
                      {t('v2.assistant.swarm.sameAsCoordinator', { defaultValue: 'Same as Coordinator' })}
                    </MenuItem>
                    {providerEntries.map(({ provider, models }) => {
                      if (models.length === 0) return null;
                      return [
                        <MenuDivider key={`${provider.id}-sw-div`} />,
                        <MenuGroup key={`${provider.id}-sw`} label={provider.name}>
                          {models.map((model) => (
                            <MenuItem
                              key={`${provider.id}::${model.id}`}
                              icon={<ProviderLogo type={provider.type} size={16} />}
                              type="radio"
                              checked={provider.id === swarmWorkerProviderId && model.id === swarmWorkerModelId}
                              onSelect={async () => {
                                setSwarmWorkerProviderId(provider.id);
                                setSwarmWorkerModelId(model.id);
                                await saveAssistantSettings({ swarmWorkerProviderId: provider.id, swarmWorkerModelId: model.id }).catch(() => {});
                              }}
                            >
                              {model.name}
                            </MenuItem>
                          ))}
                        </MenuGroup>,
                      ];
                    })}
                  </MenuButton>
                }
              />
            </RowList>
          </Section>

          <Section
            variant="plain"
            title={t('v2.assistant.swarm.presetsTitle', { defaultValue: 'Swarm presets' })}
            description={t('v2.assistant.swarm.presetsDescription', { defaultValue: 'Reusable team templates available from the Agent Side Panel Tools tab.' })}
            actions={
              <Button variant="filled" size="sm" icon="add" onClick={() => setPresetDialogOpen(true)}>
                {t('v2.assistant.swarm.newPreset', { defaultValue: 'New preset' })}
              </Button>
            }
          >
            <RowList>
              {swarmPresets.map((preset) => (
                <Row
                  key={preset.id}
                  lead={<Icon name="groups" size={22} />}
                  title={preset.name}
                  meta={`${preset.workers.length} · ${preset.description || preset.goalTemplate}`}
                  actions={
                    <Button variant="text" size="sm" icon="delete" onClick={() => setDeletePresetTarget(preset)}>
                      {t('v2.assistant.swarm.delete', { defaultValue: 'Delete' })}
                    </Button>
                  }
                />
              ))}
              {DEFAULT_SWARM_PRESETS.map((preset) => (
                <Row
                  key={preset.id}
                  lead={<Icon name="auto_awesome" size={22} />}
                  title={
                    <span className="flex items-center gap-2">
                      {preset.name}
                      <span className="v2-info-chip">{t('v2.assistant.swarm.builtIn', { defaultValue: 'Built-in' })}</span>
                    </span>
                  }
                  meta={`${preset.workers.length} · ${preset.description}`}
                />
              ))}
            </RowList>
          </Section>

          <Dialog
            open={presetDialogOpen}
            onClose={() => setPresetDialogOpen(false)}
            icon="hub"
            headline={t('v2.assistant.swarm.newPreset', { defaultValue: 'New preset' })}
            maxWidth={560}
            actions={
              <>
                <Button variant="text" onClick={() => setPresetDialogOpen(false)}>{t('assistant.cancel', { defaultValue: 'Cancel' })}</Button>
                <Button
                  variant="filled"
                  onClick={async () => {
                    if (!presetName.trim() || !presetWorkerBrief.trim()) {
                      toast.error(t('v2.assistant.skillValidation', { defaultValue: 'A title and prompt content are required.' }));
                      return;
                    }
                    const nextPreset: AssistantSwarmPreset = {
                      id: crypto.randomUUID(),
                      name: presetName.trim(),
                      description: presetDesc.trim(),
                      goalTemplate: presetGoal.trim() || presetDesc.trim(),
                      workers: [
                        {
                          name: presetWorkerRole.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'worker-1',
                          role: presetWorkerRole.trim() || 'Specialist',
                          brief: presetWorkerBrief.trim(),
                          toolScope: presetWorkerScope,
                        },
                      ],
                    };
                    const updated = [nextPreset, ...swarmPresets];
                    try {
                      await saveAssistantSettings({ swarmPresets: updated });
                      setSwarmPresets(updated);
                      setPresetDialogOpen(false);
                      setPresetName('');
                      setPresetDesc('');
                      setPresetGoal('');
                      setPresetWorkerBrief('');
                      toast.success(t('v2.assistant.swarm.presetSaved', { defaultValue: 'Swarm preset saved.' }));
                    } catch {
                      toast.error(t('assistant.errorOccurred', { defaultValue: 'Something went wrong. Try again.' }));
                    }
                  }}
                >
                  {t('v2.assistant.swarm.save', { defaultValue: 'Save' })}
                </Button>
              </>
            }
          >
            <div className="flex flex-col gap-3">
              <TextField label={t('v2.assistant.swarm.name', { defaultValue: 'Name' })} value={presetName} onChange={(e) => setPresetName(e.target.value)} />
              <TextField label={t('v2.assistant.swarm.description', { defaultValue: 'Description' })} value={presetDesc} onChange={(e) => setPresetDesc(e.target.value)} />
              <TextField label={t('v2.assistant.swarm.goalTemplate', { defaultValue: 'Goal template' })} value={presetGoal} onChange={(e) => setPresetGoal(e.target.value)} />
              <TextField label={t('v2.assistant.swarm.workerRole', { defaultValue: 'Worker role' })} value={presetWorkerRole} onChange={(e) => setPresetWorkerRole(e.target.value)} />
              <TextField multiline rows={3} label={t('v2.assistant.swarm.workerBrief', { defaultValue: 'Worker brief' })} value={presetWorkerBrief} onChange={(e) => setPresetWorkerBrief(e.target.value)} />
              <ChipSet>
                {(['read', 'propose', 'write'] as AssistantSwarmToolScope[]).map((scope) => (
                  <FilterChip key={scope} label={scope} selected={presetWorkerScope === scope} onClick={() => setPresetWorkerScope(scope)} />
                ))}
              </ChipSet>
            </div>
          </Dialog>

          <ConfirmDialog
            open={!!deletePresetTarget}
            title={t('v2.assistant.swarm.deletePresetTitle', { defaultValue: 'Delete swarm preset' })}
            message={t('v2.assistant.swarm.deletePresetMessage', { defaultValue: 'Remove this saved swarm preset?' })}
            confirmLabel={t('confirmModal.confirm', { defaultValue: 'Confirm' })}
            tone="danger"
            icon="delete"
            onConfirm={async () => {
              if (!deletePresetTarget) return;
              const updated = swarmPresets.filter((p) => p.id !== deletePresetTarget.id);
              try {
                await saveAssistantSettings({ swarmPresets: updated });
                setSwarmPresets(updated);
                setDeletePresetTarget(null);
              } catch {
                toast.error(t('assistant.errorOccurred', { defaultValue: 'Something went wrong. Try again.' }));
              }
            }}
            onClose={() => setDeletePresetTarget(null)}
          />
        </>
      )}

      {activeTab === 'skills' && (
        <Section
          aria-busy={isLoadingSkills}
          variant="plain"
          title={t('v2.assistant.presetPromptsTitle', { defaultValue: 'Composer skills' })}
          description={
            <>
              {t('v2.assistant.presetPromptsDescription', { defaultValue: 'Type ` in the chat box to open this list and insert a preset prompt into the current draft.' })}{' '}
              {skillsLibrary && (
                <Link to={`/library/${skillsLibrary.id}`} className="v2-link">
                  {t('v2.assistant.openSkillsLibrary', { defaultValue: 'Open underlying text library' })}
                </Link>
              )}
            </>
          }
          actions={
            <Button variant="filled" icon="add" disabled={!skillsLibrary} onClick={() => openSkillEditor('create')}>
              {t('v2.assistant.newSkill', { defaultValue: 'New skill' })}
            </Button>
          }
        >
          {isLoadingSkills && skillItems.length === 0 ? (
            <LoadingState minHeight={200} />
          ) : skillItems.length === 0 ? (
            <EmptyState icon="auto_awesome" shape="sunny" title={t('v2.assistant.emptySkillsTitle', { defaultValue: 'No preset prompts yet' })} description={t('v2.assistant.emptySkillsDescription', { defaultValue: 'Create a skill here, then type ` in the composer to insert it into the chat draft.' })} />
          ) : (
            <RowList>
              {skillItems.map((item, index) => (
                <Row
                  key={item.id}
                  lead={<Icon name="auto_awesome" className="text-tertiary" />}
                  title={item.title || t('v2.assistant.untitledSkill', { defaultValue: 'Untitled preset prompt' })}
                  meta={
                    <>
                      <span className="v2-info-chip">{t('v2.assistant.skillLabel', { defaultValue: 'Skill' })}</span>
                      <span>{t('v2.assistant.skillIndex', { defaultValue: '{{index}} of {{total}}', index: (skillPage - 1) * SKILLS_PAGE_SIZE + index + 1, total: skillTotal })}</span>
                      <span className="w-full">{summarizeSkillContent(item.content)}</span>
                    </>
                  }
                  actions={
                    <>
                      <Button variant="text" size="xs" icon="edit" onClick={() => openSkillEditor('edit', item)}>
                        {t('projectViewer.common.edit', { defaultValue: 'Edit' })}
                      </Button>
                      <Button variant="text" size="xs" icon="delete" className="v2-button-danger" onClick={() => setDeleteTarget(item)}>
                        {t('projectViewer.common.delete', { defaultValue: 'Delete' })}
                      </Button>
                    </>
                  }
                />
              ))}
            </RowList>
          )}
          <PagedFooter page={skillPage} pageSize={SKILLS_PAGE_SIZE} total={skillTotal} pages={skillPages} onPageChange={setSkillPage} />
        </Section>
      )}

      {activeTab === 'tools' && (
        <Section variant="plain" title={t('v2.assistant.toolsTitle', { defaultValue: 'Available MCP tools' })} description={t('v2.assistant.toolsDescription', { defaultValue: 'These are the actions the assistant can call during chat. Write actions pause for approval before they run.' })}>
          <div className="flex flex-col gap-3">
            <div className="v2-stat-grid">
              <StatTile icon="build" label={t('v2.assistant.toolsTotal', { defaultValue: 'Total tools' })} value={toolCounts.total} tone="primary" />
              <StatTile icon="database" label={t('v2.assistant.toolsReadOnly', { defaultValue: 'Read-only' })} value={toolCounts.read} tone="tertiary" />
              <StatTile icon="checklist" label={t('v2.assistant.toolsWriteActions', { defaultValue: 'Write actions' })} value={toolCounts.mutate} tone="success" />
              <StatTile icon="verified_user" label={t('v2.assistant.toolsNeedApproval', { defaultValue: 'Need approval' })} value={toolCounts.confirmation} tone="warning" />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <ListSearch value={toolSearch} onChange={setToolSearch} label={t('v2.assistant.searchTools', { defaultValue: 'Search tools' })} />
              <ChipSet>
                {(
                  [
                    ['all', t('v2.assistant.toolsAll', { defaultValue: 'All' })],
                    ['read', t('v2.assistant.toolsRead', { defaultValue: 'Read' })],
                    ['mutate', t('v2.assistant.toolsWrite', { defaultValue: 'Write' })],
                    ['destructive', t('v2.assistant.toolsDestructive', { defaultValue: 'Destructive' })],
                  ] as const
                ).map(([value, label]) => (
                  <FilterChip key={value} label={label} selected={toolCategory === value} onClick={() => setToolCategory(value as typeof toolCategory)} />
                ))}
              </ChipSet>
            </div>
            {isLoadingTools ? (
              <LoadingState minHeight={200} />
            ) : visibleTools.length === 0 ? (
              <EmptyState icon="build" size="inline" title={t('v2.assistant.noToolsFound', { defaultValue: 'No tools found' })} description={t('v2.assistant.noToolsFoundDescription', { defaultValue: 'Try a different search term or category filter.' })} />
            ) : (
              <div className="v2-tool-grid">
                {visibleTools.map((tool) => {
                  const properties = getToolProperties(tool);
                  return (
                    <article key={tool.name} className="v2-tool-card">
                      <span className="flex flex-wrap gap-1">
                        <StatusPill tone={tool.category === 'read' ? 'tertiary' : tool.category === 'mutate' ? 'success' : 'error'}>{getToolCategoryLabel(tool.category)}</StatusPill>
                        {tool.requiresConfirmation && (
                          <StatusPill tone="warning" icon="verified_user">
                            {t('v2.assistant.confirmationRequired', { defaultValue: 'Approval' })}
                          </StatusPill>
                        )}
                      </span>
                      <Text as="h3" variant="title-small" emphasized>
                        {tool.title}
                      </Text>
                      <Text variant="label-small" className="font-mono text-on-surface-variant">
                        {tool.name}
                      </Text>
                      <Text variant="body-small" className="text-on-surface-variant">
                        {tool.description}
                      </Text>
                      <Text variant="label-small" className="uppercase tracking-widest text-on-surface-variant">
                        {t('v2.assistant.toolInputs', { defaultValue: 'Inputs' })}
                      </Text>
                      {properties.length === 0 ? (
                        <Text variant="body-small" className="italic text-on-surface-variant">
                          {t('v2.assistant.noToolInputs', { defaultValue: 'No inputs required.' })}
                        </Text>
                      ) : (
                        <div className="v2-param-table">
                          {properties.map((p) => (
                            <div key={p.name} className="v2-param-table__row flex-col !gap-1">
                              <span className="flex flex-wrap items-center gap-2">
                                <code className="font-mono font-semibold">{p.name}</code>
                                <span className="v2-info-chip">{p.type}</span>
                                <span className="v2-info-chip" data-tone={p.required ? 'error' : undefined}>
                                  {p.required ? t('v2.assistant.requiredInput', { defaultValue: 'Required' }) : t('v2.assistant.optionalInput', { defaultValue: 'Optional' })}
                                </span>
                              </span>
                              {p.description && <span className="text-on-surface-variant">{p.description}</span>}
                            </div>
                          ))}
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        </Section>
      )}

      {activeTab === 'mcp' && <McpConnections />}

      <Dialog
        open={!!editorState}
        onClose={() => !isSavingSkill && closeSkillEditor()}
        icon="auto_awesome"
        headline={editorState?.mode === 'create' ? t('v2.assistant.createSkillTitle', { defaultValue: 'Create a preset prompt' }) : t('v2.assistant.editSkillTitle', { defaultValue: 'Update preset prompt' })}
        fullScreen="compact"
        maxWidth={720}
        actions={
          <>
            <Button variant="text" disabled={isSavingSkill} onClick={closeSkillEditor}>
              {t('assistant.cancel', { defaultValue: 'Cancel' })}
            </Button>
            <Button variant="filled" icon="auto_awesome" loading={isSavingSkill} onClick={() => void handleSaveSkill()}>
              {editorState?.mode === 'create' ? t('v2.assistant.createSkillAction', { defaultValue: 'Create skill' }) : t('v2.assistant.saveSkillAction', { defaultValue: 'Save changes' })}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <TextField variant="outlined" label={t('v2.assistant.skillTitleField', { defaultValue: 'Title' })} placeholder={t('v2.assistant.skillTitlePlaceholder', { defaultValue: 'Summarize this transcript' })} value={skillTitle} onValueChange={setSkillTitle} fullWidth data-autofocus />
          <TextField
            variant="outlined"
            multiline
            rows={10}
            maxRows={20}
            label={t('v2.assistant.skillPromptField', { defaultValue: 'Prompt template' })}
            placeholder={t('v2.assistant.skillPromptPlaceholder', { defaultValue: 'Paste the prompt template that should be inserted into the chat box.' })}
            value={skillContent}
            onValueChange={setSkillContent}
            fullWidth
          />
        </div>
      </Dialog>
      <ConfirmDialog
        open={!!deleteTarget}
        tone="danger"
        title={t('v2.assistant.deleteSkillTitle', { defaultValue: 'Delete preset prompt' })}
        message={t('v2.assistant.deleteSkillMessage', { defaultValue: 'Delete "{{name}}" from the preset prompt list?', name: deleteTarget?.title || t('v2.assistant.untitledSkill', { defaultValue: 'Untitled preset prompt' }) })}
        confirmLabel={isDeletingSkill ? t('deleteDialog.deleting', { defaultValue: 'Deleting...' }) : t('projectViewer.common.delete', { defaultValue: 'Delete' })}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDeleteSkill}
      />
    </Page>
  );
}
