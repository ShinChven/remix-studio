import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { deleteProject, fetchAssistantProviders, fetchCampaigns, fetchLibraries, fetchProjects } from '../../api';
import { useLiveRefresh } from '../../hooks/useLiveRefresh';
import { filterEnabledAssistantProviders, normalizeAssistantProviderSelection } from '../../lib/assistant-provider-settings';
import { Button, Icon, IconButton, Shape, Text } from '../../m3';
import type { Library, Project, Provider } from '../../types';
import type { AttachedImage, BoundContext } from '../components/assistant/Composer';
import { AssistantHero } from '../components/assistant/Hero';
import { CampaignCard, LibraryCard, ProjectCard } from '../components/EntityCards';
import { ProjectFormDialog } from '../components/ProjectFormDialog';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { EmptyState, LoadingState, Page } from '../ui/Page';

type CampaignSummary = Parameters<typeof CampaignCard>[0]['campaign'];

function Shelf({ title, icon, to, onAdd, addLabel, children, empty }: { title: string; icon: string; to: string; onAdd: () => void; addLabel: string; children: ReactNode[]; empty: string }) {
  return (
    <section className="v2-shelf">
      <div className="v2-shelf__head">
        <Link to={to} className="v2-shelf__title m3-focus-ring">
          <Icon name={icon} className="text-primary" />
          <Text as="span" variant="title-large" emphasized>
            {title}
          </Text>
          <Icon name="chevron_right" className="v2-shelf__chevron" />
        </Link>
        <IconButton icon="add" label={addLabel} tooltip variant="tonal" onClick={onAdd} />
      </div>
      {children.length > 0 ? <div className="v2-shelf__row">{children}</div> : <EmptyState size="inline" title={empty} icon={icon} />}
    </section>
  );
}

export function Home() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[]>([]);
  const [libraries, setLibraries] = useState<Library[]>([]);
  const [campaigns, setCampaigns] = useState<CampaignSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);
  const [projectForm, setProjectForm] = useState<{ copyFromId?: string } | null>(null);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [selectedProviderId, setSelectedProviderId] = useState(() => localStorage.getItem('assistant_last_provider') || '');
  const [selectedModelId, setSelectedModelId] = useState(() => localStorage.getItem('assistant_last_model') || '');

  useEffect(() => {
    if (selectedProviderId) localStorage.setItem('assistant_last_provider', selectedProviderId);
  }, [selectedProviderId]);
  useEffect(() => {
    if (selectedModelId) localStorage.setItem('assistant_last_model', selectedModelId);
  }, [selectedModelId]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setIsLoading(true);
      try {
        const [projRes, libRes, provRes, campRes] = await Promise.all([
          fetchProjects(1, 8, undefined, 'active'),
          fetchLibraries(1, 8),
          fetchAssistantProviders(),
          fetchCampaigns({ pageSize: 8 }).catch(() => []),
        ]);
        if (!mounted) return;
        const enabled = filterEnabledAssistantProviders(provRes.providers);
        setProjects(projRes.items);
        setLibraries(libRes.items);
        setProviders(enabled);
        setCampaigns(Array.isArray(campRes) ? (campRes as CampaignSummary[]).slice(0, 8) : []);
        const normalized = normalizeAssistantProviderSelection(enabled, selectedProviderId, selectedModelId);
        setSelectedProviderId(normalized.providerId);
        setSelectedModelId(normalized.modelId);
      } catch (err) {
        console.error('Failed to load home data:', err);
      } finally {
        if (mounted) setIsLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadProjects = async () => {
    try {
      setProjects((await fetchProjects(1, 8, undefined, 'active')).items);
    } catch (err) {
      console.error('Failed to reload projects:', err);
    }
  };

  useLiveRefresh(
    () => true,
    async (events) => {
      const changed = new Set(events.map((event) => event.resource));
      const all = events.length === 0;
      await Promise.all([
        (all || changed.has('project')) && loadProjects(),
        (all || changed.has('library')) &&
          fetchLibraries(1, 8)
            .then((res) => setLibraries(res.items))
            .catch((err) => console.error('Failed to reload libraries:', err)),
        (all || changed.has('campaign') || changed.has('post')) &&
          fetchCampaigns({ pageSize: 8 })
            .then((res) => setCampaigns(Array.isArray(res) ? (res as CampaignSummary[]).slice(0, 8) : []))
            .catch((err) => console.error('Failed to reload campaigns:', err)),
      ]);
    },
  );

  const startChat = (context: BoundContext) => {
    localStorage.removeItem('assistant_last_conversation');
    navigate('/assistant', { state: { draftBoundContexts: [context] } });
  };

  const handleStartChat = (text: string, contexts: BoundContext[], images: AttachedImage[]) => {
    const trimmed = text.trim();
    if (!trimmed && contexts.length === 0 && images.length === 0) return;
    localStorage.removeItem('assistant_last_conversation');
    navigate('/assistant', {
      state: { initialMessage: trimmed, providerId: selectedProviderId, modelId: selectedModelId, boundContexts: contexts, attachedImages: images },
    });
  };

  return (
    <Page className="v2-home">
      {!isLoading && providers.length === 0 && (
        <section className="v2-setup-banner">
          <span className="v2-setup-banner__art" aria-hidden>
            <Shape name="sunny" size={72} />
            <span className="material-symbols-outlined">auto_awesome</span>
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <Text as="h2" variant="title-large" emphasized>
              {t('dashboard.setupNoticeTitle')}
            </Text>
            <Text variant="body-medium">{t('dashboard.setupNoticeDescription')}</Text>
          </div>
          <Button variant="filled" icon="add" href="/provider/new" emphasized>
            {t('dashboard.setupNoticeButton')}
          </Button>
        </section>
      )}

      <section className="v2-home__hero">
        <AssistantHero
          selectedProviderId={selectedProviderId}
          setSelectedProviderId={setSelectedProviderId}
          selectedModelId={selectedModelId}
          setSelectedModelId={setSelectedModelId}
          providers={providers}
          isSending={false}
          onSend={handleStartChat}
          placeholder={t('assistant.typePlaceholder', 'Type a message...')}
        />
      </section>

      {isLoading ? (
        <LoadingState />
      ) : (
        <div className="flex flex-col gap-8">
          <Shelf title={t('dashboard.recentProjects')} icon="schedule" to="/projects" onAdd={() => setProjectForm({})} addLabel={t('dashboard.newProject')} empty={t('dashboard.noProjects')}>
            {projects.map((project) => (
              <div key={project.id} className="v2-shelf__item">
                <ProjectCard
                  project={project}
                  onStartAssistantChat={(p) => startChat({ id: p.id, name: p.name, type: 'project', subType: p.type || 'image' })}
                  onDuplicate={(p) => setProjectForm({ copyFromId: p.id })}
                  onDelete={setDeleteTarget}
                />
              </div>
            ))}
          </Shelf>
          <Shelf title={t('dashboard.libraries')} icon="grid_view" to="/libraries" onAdd={() => navigate('/library/new')} addLabel={t('dashboard.newLibrary')} empty={t('dashboard.noLibraries')}>
            {libraries.map((library) => (
              <div key={library.id} className="v2-shelf__item">
                <LibraryCard library={library} onStartAssistantChat={(l) => startChat({ id: l.id, name: l.name, type: 'library', subType: l.type || 'text' })} />
              </div>
            ))}
          </Shelf>
          <Shelf title={t('sidebar.campaigns', 'Campaigns')} icon="campaign" to="/campaigns" onAdd={() => navigate('/campaigns/new')} addLabel={t('campaigns.new', 'New Campaign')} empty={t('campaigns.noCampaigns', 'No campaigns yet.')}>
            {campaigns.map((campaign) => (
              <div key={campaign.id} className="v2-shelf__item">
                <CampaignCard campaign={campaign} />
              </div>
            ))}
          </Shelf>
        </div>
      )}

      {projectForm && (
        <ProjectFormDialog
          copyFromId={projectForm.copyFromId}
          onClose={() => setProjectForm(null)}
          onSaved={(saved) => {
            setProjectForm(null);
            navigate(`/project/${saved.id}`);
          }}
        />
      )}
      <ConfirmDialog
        open={!!deleteTarget}
        tone="danger"
        title={t('projects.deleteTitle', { defaultValue: 'Delete Project' })}
        message={t('projects.deleteConfirmation', { name: deleteTarget?.name })}
        confirmLabel={t('common.delete', { defaultValue: 'Delete' })}
        onConfirm={async () => {
          if (!deleteTarget) return;
          try {
            await deleteProject(deleteTarget.id);
            await loadProjects();
          } catch (err) {
            console.error('Failed to delete project:', err);
            throw err;
          }
        }}
        onClose={() => setDeleteTarget(null)}
      />
    </Page>
  );
}
