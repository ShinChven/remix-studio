/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ApiKeyCheck } from './components/ApiKeyCheck';
import { MainLayout } from './components/MainLayout';
import { Dashboard } from './components/Dashboard';
import { LibraryRoute } from './components/LibraryRoute';
import { ProjectRoute } from './components/ProjectRoute';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { Login } from './pages/Login';
import { AdminUsers } from './pages/AdminUsers';
import { Libraries } from './pages/Libraries';
import { Projects } from './pages/Projects';
import { LibraryForm } from './pages/LibraryForm.tsx';
import { ProjectForm } from './pages/ProjectForm.tsx';
import { PromptEditor } from './pages/PromptEditor.tsx';
import { LibraryCleanup } from './pages/LibraryCleanup.tsx';
import { LibraryImportExport } from './pages/LibraryImportExport.tsx';
import { Providers } from './pages/Providers.tsx';
import { ProviderForm } from './pages/ProviderForm.tsx';
import { TrashView } from './components/TrashView.tsx';
import { ProjectOrphans } from './pages/ProjectOrphans.tsx';
import { Exports } from './pages/Exports.tsx';

function ProtectedRoute({ children, adminOnly = false }: { children: React.ReactNode, adminOnly?: boolean }) {
  const { user, isLoading } = useAuth();
  
  if (isLoading) return <div className="min-h-screen bg-zinc-950 flex items-center justify-center text-zinc-500">Loading...</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (adminOnly && user.role !== 'admin') return <Navigate to="/" replace />;
  
  return <>{children}</>;
}

export default function App() {
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
              <Route path="project/new" element={<ProjectForm />} />
              <Route path="project/:id" element={<ProjectRoute />} />
              <Route path="project/:id/edit" element={<ProjectForm />} />
              <Route path="project/:id/orphans" element={<ProjectOrphans />} />
              <Route path="library/:id" element={<LibraryRoute />} />
              <Route path="library/:id/import-export" element={<LibraryImportExport />} />
              <Route path="library/:id/cleanup" element={<LibraryCleanup />} />
              <Route path="library/:id/prompt/:index" element={<PromptEditor />} />
              <Route path="admin/users" element={<ProtectedRoute adminOnly><AdminUsers /></ProtectedRoute>} />
              <Route path="providers" element={<Providers />} />
              <Route path="provider/new" element={<ProviderForm />} />
              <Route path="provider/:id/edit" element={<ProviderForm />} />
              <Route path="exports" element={<Exports />} />
              <Route path="trash" element={<TrashView />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </ApiKeyCheck>
    </AuthProvider>
  );
}
