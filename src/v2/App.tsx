import { lazy, Suspense, useEffect, useState, type ComponentType, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { BrowserRouter, Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom';
import { Button, LinkProvider, M3LocaleProvider, SnackbarProvider, Text, ThemeProvider } from '../m3';
import { AuthProvider, useAuth } from './app/auth';
import { setPreferNewUi, V2_BASE } from './app/paths';
import { RouterLink } from './app/RouterLink';
import { AppShell } from './shell/AppShell';
import { DEFAULT_SEED, THEME_STORAGE_KEY, UiPrefsProvider } from './theme/prefs';
import { LoadingState } from './ui/Page';

/** Lazy route module whose page is a named export. */
function page<T>(load: () => Promise<T>, name: keyof T) {
  return lazy(async () => ({ default: (await load())[name] as unknown as ComponentType<any> }));
}

const Home = page(() => import('./pages/Home'), 'Home');
const Login = page(() => import('./pages/Login'), 'Login');
const Projects = page(() => import('./pages/Projects'), 'Projects');
const Libraries = page(() => import('./pages/Libraries'), 'Libraries');
const LibraryForm = page(() => import('./pages/LibraryForm'), 'LibraryForm');
const LibraryEditor = page(() => import('./pages/LibraryEditor'), 'LibraryEditorPage');
const ProjectViewer = page(() => import('./pages/ProjectViewer'), 'ProjectViewerPage');
const Campaigns = page(() => import('./pages/Campaigns'), 'Campaigns');
const CampaignForm = page(() => import('./pages/CampaignForm'), 'CampaignForm');
const CampaignChannels = page(() => import('./pages/CampaignChannels'), 'CampaignChannels');
const CampaignDetail = page(() => import('./pages/CampaignDetail'), 'CampaignDetail');
const PostForm = page(() => import('./pages/PostForm'), 'PostForm');
const CampaignPostDetail = page(() => import('./pages/CampaignPostDetail'), 'CampaignPostDetail');
const CampaignHistory = page(() => import('./pages/CampaignHistory'), 'CampaignHistory');
const ScheduledPosts = page(() => import('./pages/ScheduledPosts'), 'ScheduledPosts');
const CampaignBatchActions = page(() => import('./pages/CampaignBatchActions'), 'CampaignBatchActions');
const CampaignBatchCreate = page(() => import('./pages/CampaignBatchCreate'), 'CampaignBatchCreate');
const Providers = page(() => import('./pages/Providers'), 'Providers');
const ProviderProfile = page(() => import('./pages/ProviderProfile'), 'ProviderProfile');
const ProviderForm = page(() => import('./pages/ProviderForm'), 'ProviderForm');
const ProviderCustomModels = page(() => import('./pages/ProviderCustomModels'), 'ProviderCustomModels');
const Exports = page(() => import('./pages/Exports'), 'Exports');
const Releases = page(() => import('./pages/Releases'), 'Releases');
const ReleaseHistory = page(() => import('./pages/ReleaseHistory'), 'ReleaseHistory');
const SellExport = page(() => import('./pages/SellExport'), 'SellExport');
const Trash = page(() => import('./pages/Trash'), 'Trash');
const Account = page(() => import('./pages/Account'), 'Account');
const AccountTwoFactorSetup = page(() => import('./pages/AccountTwoFactorSetup'), 'AccountTwoFactorSetup');
const AdminUsers = page(() => import('./pages/AdminUsers'), 'AdminUsers');
const AdminInvites = page(() => import('./pages/AdminInvites'), 'AdminInvites');
const LinkTv = page(() => import('./pages/LinkTv'), 'LinkTv');
const ProjectImport = page(() => import('./pages/ProjectImport'), 'ProjectImport');
const QueueMonitor = page(() => import('./pages/QueueMonitor'), 'QueueMonitor');
const ProjectOrphans = page(() => import('./pages/ProjectOrphans'), 'ProjectOrphans');
const ExportWatermark = page(() => import('./pages/ExportWatermark'), 'ExportWatermark');
const QuickWatermark = page(() => import('./pages/QuickWatermark'), 'QuickWatermark');
const ExtensionImport = page(() => import('./pages/ExtensionImport'), 'ExtensionImport');
const SharePage = page(() => import('./pages/SharePage'), 'SharePage');
const LibraryCleanup = page(() => import('./pages/LibraryCleanup'), 'LibraryCleanup');
const PromptEditor = page(() => import('./pages/PromptEditor'), 'PromptEditor');
const LibraryImportExport = page(() => import('./pages/LibraryImportExport'), 'LibraryImportExport');
const AssistantPage = page(() => import('./pages/AssistantPage'), 'AssistantPage');
const ChatHistory = page(() => import('./pages/ChatHistory'), 'ChatHistory');
const AssistantSettings = page(() => import('./pages/AssistantSettings'), 'AssistantSettings');

function LegacyRedirect({ to }: { to: string }) {
  const { search, hash } = useLocation();
  return <Navigate to={`${to}${search}${hash}`} replace />;
}

function ProjectEditRedirect() {
  const { id } = useParams<{ id: string }>();
  return <Navigate to={`/project/${id}`} replace />;
}

function Protected({ children, adminOnly = false }: { children: ReactNode; adminOnly?: boolean }) {
  const { user, isLoading } = useAuth();
  const location = useLocation();
  if (isLoading) return <LoadingState minHeight={320} />;
  if (!user) {
    const here = location.pathname + location.search;
    return <Navigate to={here === '/' ? '/login' : `/login?next=${encodeURIComponent(here)}`} replace />;
  }
  if (adminOnly && user.role !== 'admin') return <Navigate to="/" replace />;
  return <>{children}</>;
}

/** The AI Studio host can ask for an API key before the app runs. */
function ApiKeyGate({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const [hasKey, setHasKey] = useState<boolean | null>(null);
  useEffect(() => {
    const studio = (window as { aistudio?: { hasSelectedApiKey?: () => Promise<boolean> } }).aistudio;
    if (studio?.hasSelectedApiKey) void studio.hasSelectedApiKey().then(setHasKey);
    else setHasKey(true);
  }, []);
  if (hasKey === null) return <LoadingState label={t('apiKeyCheck.loading')} minHeight={480} />;
  if (!hasKey) {
    return (
      <div className="v2-gate">
        <Text as="h1" variant="headline-medium" emphasized>
          {t('apiKeyCheck.title')}
        </Text>
        <Text variant="body-large" className="max-w-md text-center text-on-surface-variant">
          {t('apiKeyCheck.description')}{' '}
          <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" rel="noreferrer" className="v2-link">
            {t('apiKeyCheck.learnMore')}
          </a>
        </Text>
        <Button
          variant="filled"
          onClick={async () => {
            const studio = (window as { aistudio?: { openSelectKey?: () => Promise<void> } }).aistudio;
            if (studio?.openSelectKey) {
              await studio.openSelectKey();
              setHasKey(true);
            }
          }}
        >
          {t('apiKeyCheck.selectApiKey')}
        </Button>
      </div>
    );
  }
  return <>{children}</>;
}

function AppRoutes() {
  return (
    <Suspense fallback={<LoadingState minHeight={320} />}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/link" element={<LinkTv />} />
        <Route
          path="/"
          element={
            <Protected>
              <AppShell />
            </Protected>
          }
        >
          <Route index element={<Home />} />
          <Route path="libraries" element={<Libraries />} />
          <Route path="library/new" element={<LibraryForm />} />
          <Route path="library/:id" element={<LibraryEditor />} />
          <Route path="project/:id" element={<ProjectViewer />} />
          <Route path="campaigns" element={<Campaigns />} />
          <Route path="campaigns/channels" element={<CampaignChannels />} />
          <Route path="campaigns/history" element={<CampaignHistory />} />
          <Route path="campaigns/scheduled" element={<ScheduledPosts />} />
          <Route path="campaigns/new" element={<CampaignForm />} />
          <Route path="campaigns/edit/:id" element={<CampaignForm />} />
          <Route path="campaigns/:campaignId/posts/new" element={<PostForm />} />
          <Route path="campaigns/:campaignId/posts/edit/:postId" element={<PostForm />} />
          <Route path="campaigns/:campaignId/posts/:postId" element={<CampaignPostDetail />} />
          <Route path="campaigns/:id" element={<CampaignDetail />} />
          <Route path="campaigns/:id/batch" element={<CampaignBatchActions />} />
          <Route path="campaigns/:id/batch/create" element={<CampaignBatchCreate />} />
          <Route path="assistant" element={<AssistantPage />} />
          <Route path="assistant/history" element={<ChatHistory />} />
          <Route path="assistant/settings" element={<AssistantSettings />} />
          <Route path="assistant/:id" element={<AssistantPage />} />
          <Route path="library/:id/edit" element={<LibraryForm />} />
          <Route path="library/:id/cleanup" element={<LibraryCleanup />} />
          <Route path="library/:id/import-export" element={<LibraryImportExport />} />
          <Route path="library/:id/prompt/:index" element={<PromptEditor />} />
          <Route path="projects" element={<Projects />} />
          <Route path="projects/import" element={<ProjectImport />} />
          <Route path="projects/queues" element={<QueueMonitor />} />
          <Route path="project/:id/orphans" element={<ProjectOrphans />} />
          <Route path="project/:id/export-watermark" element={<ExportWatermark />} />
          <Route path="project/:id/album/:itemId/watermark" element={<QuickWatermark source="album" />} />
          <Route path="library/:id/items/:itemId/watermark" element={<QuickWatermark source="library" />} />
          <Route path="providers" element={<Providers />} />
          <Route path="provider/new" element={<ProviderForm />} />
          <Route path="provider/:id" element={<ProviderProfile />} />
          <Route path="provider/:id/edit" element={<ProviderForm />} />
          <Route path="provider/:id/custom-models" element={<ProviderCustomModels />} />
          <Route path="exports" element={<Exports />} />
          <Route path="exports/releases" element={<Releases />} />
          <Route path="exports/history" element={<ReleaseHistory />} />
          <Route path="exports/:exportId/sell" element={<SellExport />} />
          <Route path="trash" element={<Trash />} />
          <Route path="import" element={<ExtensionImport />} />
          <Route path="share" element={<SharePage />} />
          <Route path="account" element={<Account />} />
          <Route
            path="admin/users"
            element={
              <Protected adminOnly>
                <AdminUsers />
              </Protected>
            }
          />
          <Route
            path="admin/invites"
            element={
              <Protected adminOnly>
                <AdminInvites />
              </Protected>
            }
          />
          <Route path="account/security/2fa" element={<AccountTwoFactorSetup />} />
          <Route path="queues" element={<Navigate to="/projects/queues" replace />} />
          <Route path="project/new" element={<LegacyRedirect to="/projects" />} />
          <Route path="project/:id/edit" element={<ProjectEditRedirect />} />
          <Route path="exports/stores" element={<LegacyRedirect to="/exports/releases" />} />
          <Route path="exports/uploads" element={<LegacyRedirect to="/exports/history" />} />
          <Route path="exports/releases/history" element={<LegacyRedirect to="/exports/history" />} />
          <Route path="releases" element={<LegacyRedirect to="/exports/releases" />} />
          <Route path="releases/history" element={<LegacyRedirect to="/exports/history" />} />
          <Route path="storage" element={<Navigate to="/account?tab=storage" replace />} />
          <Route path="account/mcp" element={<Navigate to="/assistant/settings?tab=mcp" replace />} />
        </Route>
      </Routes>
    </Suspense>
  );
}

export function App() {
  const { i18n } = useTranslation();
  useEffect(() => {
    setPreferNewUi(true);
  }, []);
  return (
    <ThemeProvider storageKey={THEME_STORAGE_KEY} defaultConfig={{ seed: DEFAULT_SEED, motionScheme: 'expressive' }}>
      <UiPrefsProvider>
        <M3LocaleProvider locale={i18n.resolvedLanguage || i18n.language || 'en'}>
          <SnackbarProvider>
            <AuthProvider>
              <ApiKeyGate>
                <BrowserRouter basename={V2_BASE}>
                  <LinkProvider component={RouterLink}>
                    <AppRoutes />
                  </LinkProvider>
                </BrowserRouter>
              </ApiKeyGate>
            </AuthProvider>
          </SnackbarProvider>
        </M3LocaleProvider>
      </UiPrefsProvider>
    </ThemeProvider>
  );
}
