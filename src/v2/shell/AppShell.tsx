import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Outlet, useLocation } from 'react-router-dom';
import { AppScaffold, IconButton, type NavItem, type NavSection } from '../../m3';
import { ThemeEditor } from '../theme/ThemeEditor';
import { CommandPaletteProvider, SearchTrigger, useOpenCommandPalette } from './CommandSearch';
import { RailFooter } from './RailFooter';
import { ThemeEditorContext } from './ThemeEditorContext';

const RAIL_KEY = 'v2-rail-expanded';

function activeKey(pathname: string): string | null {
  if (pathname === '/') return 'home';
  if (pathname === '/assistant' || pathname.startsWith('/assistant/')) return 'assistant';
  if (pathname === '/projects' || pathname.startsWith('/projects/') || pathname.startsWith('/project/')) return 'projects';
  if (pathname === '/libraries' || pathname.startsWith('/library/')) return 'libraries';
  if (pathname === '/campaigns' || pathname.startsWith('/campaigns/') || pathname.startsWith('/campaign/')) return 'campaigns';
  if (pathname === '/providers' || pathname.startsWith('/provider/')) return 'providers';
  if (pathname === '/exports' || pathname.startsWith('/exports/')) return 'exports';
  if (pathname === '/trash') return 'trash';
  return null;
}

/** The app frame: adaptive navigation with search at its top, and the appearance panel. */
export function AppShell() {
  const { t } = useTranslation();
  const location = useLocation();
  const [themeOpen, setThemeOpen] = useState(false);
  const [railExpanded, setRailExpanded] = useState(() => {
    try {
      return localStorage.getItem(RAIL_KEY) !== 'false';
    } catch {
      return true;
    }
  });

  const item = (key: string, href: string, icon: string, label: string): NavItem => ({ key, href, icon, label });
  const home = item('home', '/', 'explore', t('sidebar.home', 'Home'));
  const assistant = item('assistant', '/assistant', 'auto_awesome', t('sidebar.assistant'));
  const projects = item('projects', '/projects', 'play_circle', t('sidebar.projects'));
  const libraries = item('libraries', '/libraries', 'folder', t('sidebar.libraries'));
  const campaigns = item('campaigns', '/campaigns', 'send', t('sidebar.campaigns'));
  const providers = item('providers', '/providers', 'key', t('sidebar.providers'));
  const exports = item('exports', '/exports', 'folder_zip', t('sidebar.exports'));
  const trash = item('trash', '/trash', 'delete', t('sidebar.recycleBin'));
  const items = [home, assistant, projects, libraries, campaigns, providers, exports, trash];
  const sections: NavSection[] = [
    { items: [home, assistant] },
    { headline: t('v2.shell.sections.create'), items: [projects, libraries, campaigns] },
    { headline: t('v2.shell.sections.manage'), items: [providers, exports, trash] },
  ];

  return (
    <ThemeEditorContext.Provider value={() => setThemeOpen(true)}>
    <CommandPaletteProvider>
      <AppScaffold
        items={items}
        sections={sections}
        value={activeKey(location.pathname)}
        aria-label={t('v2.shell.navigation')}
        brand={
          <span className="v2-brand">
            <img src="/favicon.svg" alt="" width={28} height={28} />
            <span className="m3-typescale-emphasized-title-large">Remix Studio</span>
          </span>
        }
        railIndicator="fill"
        navigationDensity="compact"
        railWidth={272}
        railExpanded={railExpanded}
        onRailExpandedChange={(next) => {
          setRailExpanded(next);
          try {
            localStorage.setItem(RAIL_KEY, String(next));
          } catch {
            // The rail state then resets on the next visit.
          }
        }}
        scrollResetKey={location.pathname}
        navigationFooter={<RailFooter onOpenTheme={() => setThemeOpen(true)} />}
        railHeader={<SearchTrigger />}
        // No app bar: search sits at the top of the navigation. Phones, where the
        // navigation is a modal rail, keep only a slim row to open it.
        appBar={(ctx) =>
          ctx.mode === 'bar' || ctx.mode === 'modal-rail' ? (
            <div className="v2-compact-top">
              {ctx.menuButton}
              <span className="v2-brand">
                <img src="/favicon.svg" alt="" width={24} height={24} />
                <span className="m3-typescale-emphasized-title-medium">Remix Studio</span>
              </span>
              <CompactSearchButton />
              <IconButton icon="palette" label={t('v2.theme.open')} onClick={() => setThemeOpen(true)} />
            </div>
          ) : null
        }
      >
        <Outlet />
      </AppScaffold>
      <ThemeEditor open={themeOpen} onClose={() => setThemeOpen(false)} />
    </CommandPaletteProvider>
    </ThemeEditorContext.Provider>
  );
}

function CompactSearchButton() {
  const { t } = useTranslation();
  const open = useOpenCommandPalette();
  return <IconButton icon="search" label={t('v2.common.search')} className="ms-auto" onClick={open} />;
}
