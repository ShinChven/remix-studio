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
import { Register } from './pages/Register';
import { AdminUsers } from './pages/AdminUsers';

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
            <Route path="/register" element={<Register />} />
            
            <Route path="/" element={<ProtectedRoute><MainLayout /></ProtectedRoute>}>
              <Route index element={<Dashboard />} />
              <Route path="library/:id" element={<LibraryRoute />} />
              <Route path="project/:id" element={<ProjectRoute />} />
              <Route path="admin/users" element={<ProtectedRoute adminOnly><AdminUsers /></ProtectedRoute>} />
            </Route>
          </Routes>
        </BrowserRouter>
      </ApiKeyCheck>
    </AuthProvider>
  );
}
