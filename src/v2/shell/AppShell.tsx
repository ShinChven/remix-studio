import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Outlet, useLocation } from 'react-router-dom';
import { AppScaffold, type NavItem, type NavSection } from '../../m3';
import { useAuth } from '../app/auth';
import { ThemeEditor } from '../theme/ThemeEditor';
import { CommandPaletteProvider, SearchTrigger } from './CommandSearch';
import { RailFooter } from './RailFooter';
import { ThemeEditorContext } from './ThemeEditorContext';
import { TopBarSlotContext } from './TopBarActions';

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
  if (pathname.startsWith('/admin/')) return 'users';
  return null;
}

/** The app frame: adaptive navigation with search at its top, and the appearance panel. */
export function AppShell() {
  const { t } = useTranslation();
  const location = useLocation();
  const [themeOpen, setThemeOpen] = useState(false);
  const [topBarSlot, setTopBarSlot] = useState<HTMLElement | null>(null);
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
  // User management is an admin's own Manage destination.
  const isAdmin = useAuth().user?.role === 'admin';
  const users = item('users', '/admin/users', 'shield_person', t('v2.shell.users'));
  const manage = isAdmin ? [providers, exports, trash, users] : [providers, exports, trash];
  const items = [home, assistant, projects, libraries, campaigns, ...manage];
  const sections: NavSection[] = [
    { items: [home, assistant] },
    { headline: t('v2.shell.sections.create'), items: [projects, libraries, campaigns] },
    { headline: t('v2.shell.sections.manage'), items: manage },
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
              {/* Search and appearance live in the navigation; this end of the bar is the page's own. */}
              <span ref={setTopBarSlot} className="v2-compact-top__actions" />
            </div>
          ) : null
        }
      >
        <TopBarSlotContext.Provider value={topBarSlot}>
          <Outlet />
        </TopBarSlotContext.Provider>
      </AppScaffold>
      <ThemeEditor open={themeOpen} onClose={() => setThemeOpen(false)} />
    </CommandPaletteProvider>
    </ThemeEditorContext.Provider>
  );
}

