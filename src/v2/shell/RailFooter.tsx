import { useEffect, useState, type MouseEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'react-router-dom';
import { fetchStorageAnalysis } from '../../api';
import {
  Avatar,
  Badge,
  ButtonGroup,
  Icon,
  IconButton,
  LinearProgress,
  MenuButton,
  MenuDivider,
  MenuItem,
  Text,
  useTheme,
  type ThemeMode,
} from '../../m3';
import { useAuth } from '../app/auth';
import { openClassicUi } from '../app/paths';
import { formatBytes, isNewerVersion } from '../lib/format';
import { setModeWithReveal } from '../theme/prefs';

const APP_VERSION = import.meta.env.VITE_APP_VERSION || '1.12.1';
const GIT_COMMIT = import.meta.env.VITE_GIT_COMMIT || '';
const RELEASES_URL = 'https://github.com/shinchven/remix-studio/releases/latest';

function useStorageUsage(enabled: boolean) {
  const [usage, setUsage] = useState<{ size: number; limit: number } | null>(null);
  useEffect(() => {
    if (!enabled) {
      setUsage(null);
      return;
    }
    const load = () =>
      fetchStorageAnalysis({ includeProjects: false })
        .then((analysis) => setUsage({ size: analysis.totalSize, limit: analysis.limit }))
        .catch((error) => console.error('Failed to load storage size:', error));
    void load();
    const interval = setInterval(() => void load(), 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [enabled]);
  return usage;
}

function useUpdateCheck() {
  const [update, setUpdate] = useState<string | null>(null);
  useEffect(() => {
    fetch('https://api.github.com/repos/shinchven/remix-studio/releases/latest')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        const latest = data?.tag_name?.replace(/^v/, '');
        if (latest && isNewerVersion(latest, APP_VERSION)) setUpdate(data.html_url || RELEASES_URL);
      })
      .catch((e) => console.error('Failed to check for updates:', e));
  }, []);
  return update;
}

const MODES: Array<{ value: ThemeMode; icon: string; key: string }> = [
  { value: 'light', icon: 'light_mode', key: 'account.preferences.light' },
  { value: 'dark', icon: 'dark_mode', key: 'account.preferences.dark' },
  { value: 'system', icon: 'computer', key: 'account.preferences.system' },
];

/**
 * Bottom of the navigation rail: color mode and the appearance panel, storage, the account and,
 * for admins, the update notice. It shows a full layout in the expanded
 * rail and icon buttons in the collapsed one.
 */
export function RailFooter({ onOpenTheme }: { onOpenTheme: () => void }) {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const { mode, setMode } = useTheme();
  const location = useLocation();
  const usage = useStorageUsage(!!user);
  const updateUrl = useUpdateCheck();
  const isAdmin = user?.role === 'admin';
  const percent = usage && usage.limit ? Math.min(100, (usage.size / usage.limit) * 100) : 0;
  const storageText = usage ? `${formatBytes(usage.size)} / ${formatBytes(usage.limit)}` : t('mainLayout.storageUnavailable');
  const accountActive = location.pathname === '/account' || location.pathname.startsWith('/account/');

  const changeMode = (next: ThemeMode, event?: MouseEvent) => setModeWithReveal(setMode, next, event);

  const accountMenu = (
    <>
      <MenuItem icon="person" href="/account">
        {t('v2.shell.account')}
      </MenuItem>
      <MenuItem icon="palette" onSelect={onOpenTheme}>
        {t('v2.theme.title')}
      </MenuItem>
      <MenuItem icon="history_toggle_off" supportingText={t('v2.shell.classicUiHint')} onSelect={openClassicUi}>
        {t('v2.shell.classicUi')}
      </MenuItem>
      <MenuDivider />
      <MenuItem icon="logout" onSelect={() => void logout()}>
        {t('v2.shell.signOut')}
      </MenuItem>
    </>
  );

  return (
    <>
      {/* Collapsed rail */}
      <div className="v2-rail-footer" data-variant="collapsed">
        <IconButton icon="palette" label={t('v2.theme.open')} tooltip onClick={onOpenTheme} />
        <IconButton icon="swap_horiz" label={t('v2.shell.classicUiHint')} tooltip onClick={openClassicUi} />
        {isAdmin && updateUrl && (
          <IconButton icon="upgrade" label={t('sidebar.updateAvailable', 'Update Available')} tooltip href={updateUrl} target="_blank" rel="noopener noreferrer" badge={<Badge />} />
        )}
        <MenuButton
          placement="right"
          trigger={(props) => (
            <button type="button" {...props} className="v2-rail-avatar m3-focus-ring" aria-label={t('v2.shell.account')} data-active={accountActive ? '' : undefined}>
              <Avatar name={user?.email || ''} size={36} shape="cookie-9" />
            </button>
          )}
        >
          {accountMenu}
        </MenuButton>
      </div>

      {/* Expanded rail */}
      <div className="v2-rail-footer" data-variant="expanded">
        <div className="flex items-center justify-between gap-2">
          <ButtonGroup
            variant="connected"
            selection="single"
            size="xs"
            aria-label={t('v2.theme.mode')}
            value={mode}
          >
            {MODES.map((m) => (
              <IconButton
                key={m.value}
                value={m.value}
                icon={m.icon}
                label={t(m.key)}
                variant="tonal"
                onClick={(e) => changeMode(m.value, e)}
              />
            ))}
          </ButtonGroup>
          <div className="flex items-center gap-1">
            <IconButton icon="swap_horiz" label={t('v2.shell.classicUiHint')} tooltip variant="tonal" size="xs" onClick={openClassicUi} />
            <IconButton icon="palette" label={t('v2.theme.open')} tooltip variant="tonal" size="xs" onClick={onOpenTheme} />
          </div>
        </div>

        <Link to="/account?tab=storage" className="v2-storage-card m3-focus-ring">
          <div className="flex items-center justify-between gap-2">
            <Text as="span" variant="label-medium" className="text-on-surface-variant">
              {t('sidebar.storage')}
            </Text>
            <Text as="span" variant="label-medium" emphasized title={storageText}>
              {storageText}
            </Text>
          </div>
          <LinearProgress
            value={percent}
            aria-label={t('sidebar.storage')}
            className={percent > 90 ? 'v2-progress-error' : percent > 70 ? 'v2-progress-warning' : undefined}
          />
        </Link>

        <MenuButton
          placement="top-start"
          trigger={(props) => (
            <button type="button" {...props} className="v2-account-row m3-focus-ring" data-active={accountActive ? '' : undefined}>
              <Avatar name={user?.email || ''} size={36} shape="cookie-9" />
              <span className="flex min-w-0 flex-1 flex-col text-start">
                <Text as="span" variant="label-large" emphasized className="truncate">
                  {user?.email}
                </Text>
                <Text as="span" variant="body-small" className="truncate capitalize text-on-surface-variant">
                  {user?.role}
                </Text>
              </span>
              <Icon name="unfold_more" className="text-on-surface-variant" />
            </button>
          )}
        >
          {accountMenu}
        </MenuButton>

        {isAdmin && updateUrl && (
          <div className="flex items-center gap-1">
            <IconButton
              icon="upgrade"
              label={t('sidebar.updateAvailable', 'Update Available')}
              tooltip
              variant="tonal"
              size="xs"
              href={updateUrl}
              target="_blank"
              rel="noopener noreferrer"
              badge={<Badge />}
            />
          </div>
        )}

        <div className="v2-version">
          <span title={`${t('mainLayout.version')} ${APP_VERSION}`}>v{APP_VERSION}</span>
          {GIT_COMMIT && (
            <>
              <span aria-hidden="true">·</span>
              <a
                href={`https://github.com/shinchven/remix-studio/commit/${GIT_COMMIT}`}
                target="_blank"
                rel="noopener noreferrer"
                title={`${t('mainLayout.commit')} ${GIT_COMMIT}`}
              >
                {GIT_COMMIT}
              </a>
            </>
          )}
        </div>
      </div>
    </>
  );
}
