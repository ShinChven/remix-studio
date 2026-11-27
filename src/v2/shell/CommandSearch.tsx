import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import {
  createCampaign,
  createLibrary,
  createProject,
  fetchCampaigns,
  fetchLibraries,
  fetchProjects,
} from '../../api';
import { Dialog, Icon, LoadingIndicator, Ripple, Text, TextField } from '../../m3';
import { useAuth } from '../app/auth';
import { useToast } from '../ui/useToast';
import { useOpenThemeEditor } from './ThemeEditorContext';

interface PaletteItem {
  value: string;
  label: string;
  icon: string;
  keepOpen?: boolean;
}

interface PaletteGroup {
  label: string;
  suggestions: PaletteItem[];
}

type CreateKind = 'project' | 'library' | 'campaign';
interface CreateMatch {
  type: CreateKind;
  subType: string;
  name: string;
}

const COMMANDS: Array<{ id: string; key: string; prefix: string }> = [
  { id: 'cmd-text-proj', key: 'textProject', prefix: '> create text project ' },
  { id: 'cmd-img-proj', key: 'imageProject', prefix: '> create image project ' },
  { id: 'cmd-vid-proj', key: 'videoProject', prefix: '> create video project ' },
  { id: 'cmd-aud-proj', key: 'audioProject', prefix: '> create audio project ' },
  { id: 'cmd-text-lib', key: 'textLibrary', prefix: '> create text library ' },
  { id: 'cmd-img-lib', key: 'imageLibrary', prefix: '> create image library ' },
  { id: 'cmd-vid-lib', key: 'videoLibrary', prefix: '> create video library ' },
  { id: 'cmd-aud-lib', key: 'audioLibrary', prefix: '> create audio library ' },
  { id: 'cmd-camp', key: 'campaign', prefix: '> create campaign ' },
];

/** Prefix that switches the palette to settings, the way `>` switches it to commands. */
const SETTINGS_PREFIX = '@';

/** Settings the palette can jump to. `to: 'theme'` opens the appearance panel instead of a page. */
const SETTINGS: Array<{ key: string; icon: string; to: string; keywords: string; adminOnly?: boolean }> = [
  { key: 'appearance', icon: 'palette', to: 'theme', keywords: 'theme color dark light mode density font' },
  { key: 'account', icon: 'account_circle', to: '/account?tab=overview', keywords: 'profile overview' },
  { key: 'preferences', icon: 'tune', to: '/account?tab=preferences', keywords: 'language auto tag' },
  { key: 'storage', icon: 'hard_drive', to: '/account?tab=storage', keywords: 'quota disk usage space' },
  { key: 'security', icon: 'shield', to: '/account?tab=security', keywords: 'password passkey login' },
  { key: 'twoFactor', icon: 'pin', to: '/account/security/2fa', keywords: '2fa totp authenticator otp' },
  { key: 'devices', icon: 'devices', to: '/account?tab=devices', keywords: 'tv link webos dlna' },
  { key: 'providers', icon: 'key', to: '/providers', keywords: 'api key model openai gemini' },
  { key: 'addProvider', icon: 'add_link', to: '/provider/new', keywords: 'api key new' },
  { key: 'assistantProviders', icon: 'smart_toy', to: '/assistant/settings?tab=providers', keywords: 'chat model ai' },
  { key: 'assistantSkills', icon: 'auto_awesome', to: '/assistant/settings?tab=skills', keywords: 'ai prompt' },
  { key: 'assistantTools', icon: 'build', to: '/assistant/settings?tab=tools', keywords: 'ai' },
  { key: 'mcp', icon: 'hub', to: '/assistant/settings?tab=mcp', keywords: 'mcp connector server token' },
  { key: 'users', icon: 'group', to: '/admin/users', keywords: 'admin members', adminOnly: true },
  { key: 'invites', icon: 'mail', to: '/admin/invites', keywords: 'admin invitation', adminOnly: true },
];

function parseCreate(query: string): CreateMatch | null {
  const match = query.match(/^create\s+(?:(text|image|video|audio)\s+(project|library)|(campaign))\s+(.+)$/i);
  if (!match) return null;
  const name = match[4].trim();
  if (match[3]) return { type: 'campaign', subType: 'image', name };
  return { type: match[2].toLowerCase() as CreateKind, subType: match[1].toLowerCase(), name };
}

interface Named {
  id: string;
  name: string;
}

const PaletteContext = createContext<() => void>(() => undefined);

/** Opens the search palette from anywhere in the shell. */
export function useOpenCommandPalette() {
  return useContext(PaletteContext);
}

/** Holds the search palette and opens it on Cmd/Ctrl+K. */
export function CommandPaletteProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const show = useCallback(() => setOpen(true), []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return (
    <PaletteContext.Provider value={show}>
      {children}
      <CommandPalette open={open} onClose={() => setOpen(false)} />
    </PaletteContext.Provider>
  );
}

/** Looks like a search field; opens the search palette. */
export function SearchTrigger() {
  const { t } = useTranslation();
  const open = useOpenCommandPalette();
  const mac = typeof navigator !== 'undefined' && /mac/i.test(navigator.platform);
  return (
    <button type="button" className="v2-search-trigger m3-focus-ring" onClick={open} aria-haspopup="dialog">
      <Ripple />
      <Icon name="search" size={20} />
      <span className="v2-search-trigger__text">{t('v2.shell.searchShort')}</span>
      <kbd className="v2-search-trigger__kbd">{mac ? '⌘K' : 'Ctrl K'}</kbd>
    </button>
  );
}

/**
 * Global search, centered over the page: finds projects, libraries and campaigns, and runs `>`
 * commands that create them.
 */
function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const toast = useToast();
  const openTheme = useOpenThemeEditor();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [value, setValue] = useState('');
  const [debounced, setDebounced] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<{ projects: Named[]; libraries: Named[]; campaigns: Named[] }>({
    projects: [],
    libraries: [],
    campaigns: [],
  });

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), 300);
    return () => clearTimeout(timer);
  }, [value]);

  const isCommandMode = value.trim().startsWith('>');
  const isSettingsMode = value.trim().startsWith(SETTINGS_PREFIX);
  const settingsQuery = isSettingsMode ? value.trim().slice(SETTINGS_PREFIX.length).trim().toLowerCase() : '';
  const commandQuery = isCommandMode ? value.trim().slice(1).trim().toLowerCase() : '';
  const createMatch = useMemo(() => (isCommandMode ? parseCreate(commandQuery) : null), [isCommandMode, commandQuery]);

  useEffect(() => {
    if (debounced.trim().startsWith('>') || debounced.trim().startsWith(SETTINGS_PREFIX)) return;
    let cancelled = false;
    const query = debounced.trim();
    const limit = query ? 20 : 10;
    setLoading(true);
    Promise.all([
      fetchProjects(1, limit, query, undefined, true),
      fetchLibraries(1, limit, query, false, true),
      fetchCampaigns({ page: 1, pageSize: limit, q: query || undefined }),
    ])
      .then(([projects, libraries, campaigns]) => {
        if (cancelled) return;
        setResults({
          projects: (projects.items || []) as Named[],
          libraries: (libraries.items || []) as Named[],
          campaigns: ((campaigns as Named[]) || []),
        });
      })
      .catch((err) => console.error('Failed to load search results', err))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [debounced]);

  const kindLabel = (match: CreateMatch) => {
    const key = match.type === 'campaign' ? 'campaign' : `${match.subType}${match.type === 'project' ? 'Project' : 'Library'}`;
    return t(`v2.commandKinds.${key}`);
  };

  const runCreate = async (match: CreateMatch) => {
    const kind = kindLabel(match);
    setLoading(true);
    try {
      if (match.type === 'library') {
        const id = match.name.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
        await createLibrary({ id: id || Date.now().toString(), name: match.name, type: match.subType as never });
        navigate(`/library/${id}`);
      } else if (match.type === 'project') {
        const id = Date.now().toString();
        await createProject({ id, name: match.name, type: match.subType as never, createdAt: Date.now(), workflow: [], jobs: [], album: [] } as never);
        navigate(`/project/${id}`);
      } else {
        const campaign = await createCampaign({ name: match.name });
        navigate(campaign?.id ? `/campaigns/${campaign.id}` : '/campaigns');
      }
      toast.success(t('v2.shell.created', { kind, name: match.name }));
      setValue('');
    } catch (err) {
      toast.error(t('v2.shell.createFailed', { kind, message: (err as Error).message }));
    } finally {
      setLoading(false);
    }
  };

  const groups: PaletteGroup[] = [];
  if (isCommandMode) {
    const suggestions: PaletteItem[] = createMatch
      ? [
          {
            value: `execute:${value}`,
            label: t('v2.shell.execute', { kind: kindLabel(createMatch), name: createMatch.name }),
            icon: 'add_circle',
          },
        ]
      : COMMANDS.filter(
          (cmd) =>
            cmd.prefix.includes(value.toLowerCase()) ||
            t(`v2.shell.create.${cmd.key}`).toLowerCase().includes(value.toLowerCase().replace(/^>\s*/, '')),
        ).map((cmd) => ({ value: cmd.prefix, label: t(`v2.shell.create.${cmd.key}`), icon: 'terminal', keepOpen: true }));
    groups.push({ label: t('v2.shell.commands'), suggestions });
  } else if (isSettingsMode) {
    const terms = settingsQuery.split(/\s+/).filter(Boolean);
    const suggestions = SETTINGS.filter((item) => isAdmin || !item.adminOnly)
      .map((item) => ({ item, label: t(`v2.shell.settingsItems.${item.key}`) }))
      .filter(({ item, label }) => {
        const haystack = `${label} ${item.key} ${item.keywords}`.toLowerCase();
        return terms.every((term) => haystack.includes(term));
      })
      .map(({ item, label }) => ({ value: `setting:${item.to}`, label, icon: item.icon }));
    groups.push({ label: t('v2.shell.settings'), suggestions });
  } else {
    const add = (label: string, icon: string, kind: string, items: Named[]) => {
      if (items.length) groups.push({ label, suggestions: items.map((item) => ({ value: `${kind}:${item.id}`, label: item.name, icon })) });
    };
    add(t('v2.shell.projects'), 'play_circle', 'project', results.projects);
    add(t('v2.shell.libraries'), 'folder', 'library', results.libraries);
    add(t('v2.shell.campaigns'), 'send', 'campaign', results.campaigns);
  }

  const onSelect = (suggestion: PaletteItem) => {
    const [kind, ...rest] = suggestion.value.split(':');
    const id = rest.join(':');
    if (kind === 'execute') {
      if (createMatch) void runCreate(createMatch).then(onClose);
      return;
    }
    if (suggestion.keepOpen) {
      // A command fills the field with its prefix for the name to follow.
      setValue(suggestion.value);
      inputRef.current?.focus();
      return;
    }
    setValue('');
    onClose();
    if (kind === 'project') navigate(`/project/${id}`);
    else if (kind === 'library') navigate(`/library/${id}`);
    else if (kind === 'campaign') navigate(`/campaigns/${id}`);
    else if (kind === 'setting') {
      if (id === 'theme') openTheme();
      else navigate(id);
    }
  };

  const flat = groups.flatMap((g) => g.suggestions);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => setActive(0), [value, results]);
  useEffect(() => {
    if (open) setValue('');
  }, [open]);
  useEffect(() => {
    document.getElementById(`v2-palette-${active}`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  let index = -1;
  return (
    <Dialog open={open} onClose={onClose} maxWidth={640} className="v2-palette" aria-label={t('v2.shell.searchPlaceholder')}>
      <TextField
        ref={inputRef}
        variant="filled"
        leadingIcon="search"
        aria-label={t('v2.shell.searchPlaceholder')}
        placeholder={t('v2.shell.searchPlaceholder')}
        value={value}
        onValueChange={setValue}
        data-autofocus
        fullWidth
        trailingIcon={loading ? <LoadingIndicator size={24} aria-hidden /> : undefined}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActive((a) => Math.min(flat.length - 1, a + 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((a) => Math.max(0, a - 1));
          } else if (e.key === 'Enter') {
            e.preventDefault();
            if (flat[active]) onSelect(flat[active]);
            else if (createMatch) void runCreate(createMatch).then(onClose);
          }
        }}
      />
      <div className="v2-palette__results" role="listbox" aria-label={t('v2.shell.searchPlaceholder')}>
        {flat.length === 0 && !loading && (
          <Text variant="body-medium" className="py-8 text-center text-on-surface-variant">
            {t('v2.shell.noResults')}
          </Text>
        )}
        {groups.map((group) => (
          <div key={group.label} className="v2-palette__group">
            <Text as="div" variant="label-small" className="v2-palette__label">
              {group.label}
            </Text>
            {group.suggestions.map((s) => {
              index += 1;
              const i = index;
              return (
                <button key={s.value} id={`v2-palette-${i}`} type="button" role="option" aria-selected={i === active} className="v2-palette__item" data-active={i === active ? '' : undefined} onMouseEnter={() => setActive(i)} onClick={() => onSelect(s)}>
                  <Ripple />
                  <Icon name={s.icon} size={20} />
                  <span className="min-w-0 flex-1 truncate text-start">{s.label}</span>
                  {i === active && <Icon name="keyboard_return" size={16} className="opacity-60" />}
                </button>
              );
            })}
          </div>
        ))}
      </div>
      <Text as="div" variant="label-small" className="v2-palette__hint">
        ↑↓ · ↵ · Esc · <code>&gt;</code> {t('v2.shell.commands')} · <code>{SETTINGS_PREFIX}</code> {t('v2.shell.settings')}
      </Text>
    </Dialog>
  );
}
