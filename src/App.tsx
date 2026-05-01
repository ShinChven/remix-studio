/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'sonner';
import { ApiKeyCheck } from './components/ApiKeyCheck';
import { MainLayout } from './components/MainLayout';
import { Dashboard } from './components/Dashboard';
import { LibraryRoute } from './components/LibraryRoute';
import { ProjectRoute } from './components/ProjectRoute';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { useTheme } from './contexts/ThemeContext';
import { Login } from './pages/Login';
import { AdminUsers } from './pages/AdminUsers';
import { AdminInvites } from './pages/AdminInvites';
import { Libraries } from './pages/Libraries';
import { Projects } from './pages/Projects';
import { LibraryForm } from './pages/LibraryForm.tsx';
import { ProjectForm } from './pages/ProjectForm.tsx';
import { PromptEditor } from './pages/PromptEditor.tsx';
import { LibraryCleanup } from './pages/LibraryCleanup.tsx';
import { LibraryImportExport } from './pages/LibraryImportExport.tsx';
import { Providers } from './pages/Providers.tsx';
import { ProviderProfile } from './pages/ProviderProfile.tsx';
import { ProviderForm } from './pages/ProviderForm.tsx';
import { ProviderCustomModels } from './pages/ProviderCustomModels.tsx';
import { TrashView } from './components/TrashView.tsx';
import { ProjectOrphans } from './pages/ProjectOrphans.tsx';
import { Exports } from './pages/Exports.tsx';
import { Account } from './pages/Account.tsx';
import { AccountTwoFactorSetup } from './pages/AccountTwoFactorSetup.tsx';
import { AssistantPage } from './pages/AssistantPage.tsx';
import { AssistantSettingsPage } from './pages/AssistantSettingsPage.tsx';
import { ChatHistoryPage } from './pages/ChatHistoryPage.tsx';
import { QueueMonitor } from './pages/QueueMonitor.tsx';
import { Campaigns } from './pages/Campaigns.tsx';
import { CampaignDetail } from './pages/CampaignDetail.tsx';
import { CampaignForm } from './pages/CampaignForm.tsx';
import { CampaignChannels } from './pages/CampaignChannels.tsx';
import { CampaignBatchActions } from './pages/CampaignBatchActions.tsx';
import { CampaignBatchCreate } from './pages/CampaignBatchCreate.tsx';
import { PostForm } from './pages/PostForm.tsx';
import { CampaignHistory } from './pages/CampaignHistory.tsx';
import { ScheduledPosts } from './pages/ScheduledPosts.tsx';

function ProtectedRoute({ children, adminOnly = false }: { children: React.ReactNode, adminOnly?: boolean }) {
  const { user, isLoading } = useAuth();
  
  if (isLoading) return <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex items-center justify-center text-zinc-500">Loading...</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (adminOnly && user.role !== 'admin') return <Navigate to="/" replace />;
  
  return <>{children}</>;
}

export default function App() {
  const { theme } = useTheme();
  return (
    <AuthProvider>
      <ApiKeyCheck>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            
            <Route path="/" element={<ProtectedRoute><MainLayout /></ProtectedRoute>}>
              <Route index element={<Dashboard />} />
              <Route path="libraries" element={<Libraries />} />
              <Route path="library/new" element={<LibraryForm />} />
              <Route path="library/:id/edit" element={<LibraryForm />} />
              <Route path="projects" element={<Projects />} />
              <Route path="queues" element={<QueueMonitor />} />
              <Route path="project/new" element={<ProjectForm />} />
              <Route path="project/:id" element={<ProjectRoute />} />
              <Route path="project/:id/edit" element={<ProjectForm />} />
              <Route path="project/:id/orphans" element={<ProjectOrphans />} />
              <Route path="library/:id" element={<LibraryRoute />} />
              <Route path="library/:id/import-export" element={<LibraryImportExport />} />
              <Route path="library/:id/cleanup" element={<LibraryCleanup />} />
              <Route path="library/:id/prompt/:index" element={<PromptEditor />} />
                <Route path="campaigns">
                  <Route index element={<Campaigns />} />
                  <Route path="history" element={<CampaignHistory />} />
                  <Route path="scheduled" element={<ScheduledPosts />} />
                  <Route path="channels" element={<CampaignChannels />} />
                  <Route path="new" element={<CampaignForm />} />
                  <Route path="edit/:id" element={<CampaignForm />} />
                  <Route path=":campaignId/posts/new" element={<PostForm />} />
                  <Route path=":campaignId/posts/edit/:postId" element={<PostForm />} />
                  <Route path=":id" element={<CampaignDetail />} />
                  <Route path=":id/batch" element={<CampaignBatchActions />} />
                  <Route path=":id/batch/create" element={<CampaignBatchCreate />} />
                </Route>
              <Route path="admin/users" element={<ProtectedRoute adminOnly><AdminUsers /></ProtectedRoute>} />
              <Route path="admin/invites" element={<ProtectedRoute adminOnly><AdminInvites /></ProtectedRoute>} />
              <Route path="providers" element={<Providers />} />
              <Route path="provider/new" element={<ProviderForm />} />
              <Route path="provider/:id" element={<ProviderProfile />} />
              <Route path="provider/:id/edit" element={<ProviderForm />} />
              <Route path="provider/:id/custom-models" element={<ProviderCustomModels />} />
              <Route path="exports" element={<Exports />} />
              <Route path="trash" element={<TrashView />} />
              <Route path="storage" element={<Navigate to="/account?tab=storage" replace />} />
              <Route path="account" element={<Account />} />
              <Route path="account/security/2fa" element={<AccountTwoFactorSetup />} />
              <Route path="account/mcp" element={<Navigate to="/assistant/settings?tab=mcp" replace />} />
              <Route path="assistant" element={<AssistantPage />} />
              <Route path="assistant/history" element={<ChatHistoryPage />} />
              <Route path="assistant/settings" element={<AssistantSettingsPage />} />
              <Route path="assistant/:id/settings" element={<AssistantSettingsPage />} />
              <Route path="assistant/:id" element={<AssistantPage />} />
            </Route>
          </Routes>
        </BrowserRouter>
        <Toaster position="bottom-right" theme={theme === 'system' ? 'system' : theme} />
      </ApiKeyCheck>
    </AuthProvider>
  );
}
