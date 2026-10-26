import { useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, useLocation, useSearchParams } from 'react-router-dom';
import { approveMediaPairing, denyMediaPairing, fetchMediaPairing, type MediaPairingInfo } from '../../api';
import { Button, Icon, Shape, Text, TextField, useSnackbar } from '../../m3';
import { useAuth } from '../app/auth';
import { isScopeValid, ProjectScopePicker } from '../components/media-share/ProjectScopePicker';
import { LoadingState } from '../ui/Page';

/** Formats what the user types as XXXX-XXXX, dropping characters codes never use. */
function formatCode(value: string): string {
  const clean = value.toUpperCase().replace(/[^0-9A-Z]/g, '').slice(0, 8);
  return clean.length > 4 ? `${clean.slice(0, 4)}-${clean.slice(4)}` : clean;
}

/** Approves a TV's pairing code; the TV's QR code opens it with the code filled in. */
export function LinkTv() {
  const { t } = useTranslation();
  const snackbar = useSnackbar();
  const { user, isLoading } = useAuth();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const [code, setCode] = useState(formatCode(searchParams.get('code') || ''));
  const [pairing, setPairing] = useState<MediaPairingInfo | null>(null);
  const [name, setName] = useState('');
  const [scope, setScope] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<'linked' | 'denied' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const lookup = async (value: string) => {
    setBusy(true);
    setError(null);
    try {
      const info = await fetchMediaPairing(value.replace('-', ''));
      setPairing(info);
      setName(info.suggestedName);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (user && code.replace('-', '').length === 8 && !pairing && !outcome) void lookup(code);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  if (isLoading) return <LoadingState minHeight={480} />;
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace />;

  const act = async (fn: () => Promise<void>, result: 'linked' | 'denied') => {
    setBusy(true);
    try {
      await fn();
      setOutcome(result);
    } catch (e) {
      snackbar.show((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    setCode('');
    setPairing(null);
    setOutcome(null);
    setScope(null);
    setError(null);
  };

  return (
    <div className="v2-standalone">
      <div className="v2-standalone__panel">
        <div className="flex items-center gap-3">
          <span className="v2-kind-badge bg-primary-container text-on-primary-container">
            <Icon name="tv" />
          </span>
          <div className="min-w-0">
            <Text as="h1" variant="headline-small" emphasized>
              {t('mediaShare.link.title')}
            </Text>
            <Text variant="body-small" className="text-on-surface-variant">
              {user.email}
            </Text>
          </div>
        </div>

        {outcome ? (
          <div className="flex flex-col items-center gap-4 py-4 text-center">
            <span className="v2-outcome" data-outcome={outcome} aria-hidden>
              <Shape name={outcome === 'linked' ? 'sunny' : 'cookie-4'} size={88} />
              <Icon name={outcome === 'linked' ? 'check' : 'close'} size={40} />
            </span>
            <Text variant="title-medium" emphasized>
              {outcome === 'linked' ? t('mediaShare.link.done') : t('mediaShare.link.denied')}
            </Text>
            <div className="flex flex-wrap justify-center gap-2">
              <Button variant="filled" href="/account?tab=devices">
                {t('mediaShare.link.manage')}
              </Button>
              <Button variant="outlined" onClick={reset}>
                {t('mediaShare.link.again')}
              </Button>
            </div>
          </div>
        ) : pairing ? (
          <div className="flex flex-col gap-5">
            <div>
              <Text variant="title-small" emphasized>
                {t('mediaShare.link.request')}
              </Text>
              <Text variant="headline-medium" emphasized className="font-mono tracking-widest text-primary">
                {formatCode(pairing.userCode)}
              </Text>
              <Text variant="body-small" className="text-on-surface-variant">
                {t('mediaShare.link.expiresIn', { minutes: Math.max(1, Math.round((pairing.expiresAt - Date.now()) / 60000)) })}
              </Text>
            </div>
            <TextField variant="outlined" label={t('mediaShare.link.deviceName')} value={name} onValueChange={setName} maxLength={64} showCounter={false} fullWidth />
            <ProjectScopePicker value={scope} onChange={setScope} />
            <div className="flex flex-wrap gap-2">
              <Button
                variant="filled"
                className="flex-1"
                loading={busy}
                disabled={!isScopeValid(scope)}
                onClick={() => void act(() => approveMediaPairing(pairing.userCode, name.trim() || pairing.suggestedName, scope), 'linked')}
              >
                {t('mediaShare.link.approve')}
              </Button>
              <Button variant="outlined" disabled={busy} onClick={() => void act(() => denyMediaPairing(pairing.userCode), 'denied')}>
                {t('mediaShare.link.deny')}
              </Button>
            </div>
          </div>
        ) : (
          <form
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              if (code.replace('-', '').length === 8) void lookup(code);
            }}
            className="flex flex-col gap-4"
          >
            <Text variant="body-medium" className="text-on-surface-variant">
              {t('mediaShare.link.desc')}
            </Text>
            <TextField
              variant="outlined"
              label={t('mediaShare.link.code')}
              value={code}
              onValueChange={(v) => setCode(formatCode(v))}
              placeholder="ABCD-EFGH"
              autoFocus
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              inputClassName="v2-otp text-center"
              error={!!error}
              errorText={error ?? undefined}
              fullWidth
            />
            <Button type="submit" variant="filled" size="md" loading={busy} disabled={code.replace('-', '').length !== 8} fullWidth>
              {t('mediaShare.link.continue')}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
