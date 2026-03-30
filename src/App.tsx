/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ApiKeyCheck } from './components/ApiKeyCheck';
import { MainLayout } from './components/MainLayout';
import { Dashboard } from './components/Dashboard';
import { LibraryRoute } from './components/LibraryRoute';
import { ProjectRoute } from './components/ProjectRoute';

export default function App() {
  return (
    <ApiKeyCheck>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<MainLayout />}>
            <Route index element={<Dashboard />} />
            <Route path="library/:id" element={<LibraryRoute />} />
            <Route path="project/:id" element={<ProjectRoute />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ApiKeyCheck>
  );
}
