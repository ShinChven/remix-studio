import { FormEvent, useEffect, useState } from 'react';
import { Link, Navigate, useLocation, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, Loader2, Tv, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { approveMediaPairing, denyMediaPairing, fetchMediaPairing, type MediaPairingInfo } from '../api';
import { useAuth } from '../contexts/AuthContext';
import { ProjectScopePicker, isScopeValid } from '../components/media-share/ProjectScopePicker';

/** Formats what the user types as XXXX-XXXX, dropping characters codes never use. */
function formatCode(value: string): string {
  const clean = value.toUpperCase().replace(/[^0-9A-Z]/g, '').slice(0, 8);
  return clean.length > 4 ? `${clean.slice(0, 4)}-${clean.slice(4)}` : clean;
}

const INPUT_CLASS = 'w-full bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-xl px-4 py-2.5 text-sm text-neutral-900 dark:text-white placeholder-neutral-500 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 transition-all font-medium';

/**
 * Where a TV's pairing code is approved. The TV's QR code opens this page
 * with the code filled in; it also works typed in by hand.
 */
export function LinkTv() {
  const { t } = useTranslation();
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

  // A code arriving in the link is looked up right away.
  useEffect(() => {
    if (user && code.replace('-', '').length === 8 && !pairing && !outcome) void lookup(code);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  if (isLoading) {
    return <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-zinc-950 text-zinc-500"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }
  if (!user) {
    return <Navigate to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  }

  const submitCode = (event: FormEvent) => {
    event.preventDefault();
    if (code.replace('-', '').length === 8) void lookup(code);
  };

  const approve = async () => {
    if (!pairing || !isScopeValid(scope)) return;
    setBusy(true);
    try {
      await approveMediaPairing(pairing.userCode, name.trim() || pairing.suggestedName, scope);
      setOutcome('linked');
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const deny = async () => {
    if (!pairing) return;
    setBusy(true);
    try {
      await denyMediaPairing(pairing.userCode);
      setOutcome('denied');
    } catch (e) {
      toast.error((e as Error).message);
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
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 px-4 py-10 sm:py-16">
      <div className="mx-auto w-full max-w-lg space-y-6">
        <div className="flex items-center gap-3">
          <div className="rounded-xl border border-blue-500/20 bg-blue-500/10 p-2.5 text-blue-500">
            <Tv className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-neutral-900 dark:text-white">{t('mediaShare.link.title')}</h1>
            <p className="text-sm text-neutral-500">{user.email}</p>
          </div>
        </div>

        <div className="rounded-card border border-neutral-200/50 dark:border-white/5 bg-white/70 dark:bg-neutral-900/60 p-5 sm:p-6 shadow-sm space-y-5">
          {outcome ? (
            <div className="space-y-5 text-center">
              {outcome === 'linked'
                ? <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-500" />
                : <XCircle className="mx-auto h-12 w-12 text-neutral-400" />}
              <p className="text-base font-semibold text-neutral-900 dark:text-white">
                {outcome === 'linked' ? t('mediaShare.link.done') : t('mediaShare.link.denied')}
              </p>
              <div className="flex flex-wrap justify-center gap-3">
                <Link to="/account?tab=devices" className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-blue-500">{t('mediaShare.link.manage')}</Link>
                <button type="button" onClick={reset} className="rounded-xl border border-neutral-200 dark:border-neutral-800 px-5 py-2.5 text-sm font-bold text-neutral-600 dark:text-neutral-300">{t('mediaShare.link.again')}</button>
              </div>
            </div>
          ) : pairing ? (
            <div className="space-y-5">
              <div>
                <p className="text-base font-bold text-neutral-900 dark:text-white">{t('mediaShare.link.request')}</p>
                <p className="mt-1 font-mono text-2xl font-bold tracking-widest text-blue-600 dark:text-blue-400">{formatCode(pairing.userCode)}</p>
                <p className="mt-1 text-xs text-neutral-500">
                  {t('mediaShare.link.expiresIn', { minutes: Math.max(1, Math.round((pairing.expiresAt - Date.now()) / 60000)) })}
                </p>
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-500 ml-1">{t('mediaShare.link.deviceName')}</label>
                <input type="text" value={name} onChange={(e) => setName(e.target.value)} maxLength={64} className={INPUT_CLASS} />
              </div>
              <ProjectScopePicker value={scope} onChange={setScope} />
              <div className="flex flex-wrap gap-3 pt-1">
                <button
                  type="button"
                  onClick={approve}
                  disabled={busy || !isScopeValid(scope)}
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-blue-600/10 hover:bg-blue-500 disabled:opacity-50"
                >
                  {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                  {t('mediaShare.link.approve')}
                </button>
                <button
                  type="button"
                  onClick={deny}
                  disabled={busy}
                  className="rounded-xl border border-neutral-200 dark:border-neutral-800 px-5 py-3 text-sm font-bold text-neutral-600 dark:text-neutral-300 disabled:opacity-50"
                >
                  {t('mediaShare.link.deny')}
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={submitCode} className="space-y-4">
              <p className="text-sm text-neutral-600 dark:text-neutral-400">{t('mediaShare.link.desc')}</p>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-500 ml-1">{t('mediaShare.link.code')}</label>
                <input
                  type="text"
                  value={code}
                  onChange={(e) => setCode(formatCode(e.target.value))}
                  placeholder="ABCD-EFGH"
                  autoFocus
                  autoCapitalize="characters"
                  autoComplete="off"
                  spellCheck={false}
                  inputMode="text"
                  className={`${INPUT_CLASS} text-center font-mono text-2xl tracking-[0.3em]`}
                />
              </div>
              {error && <p className="text-sm font-medium text-red-600 dark:text-red-400">{error}</p>}
              <button
                type="submit"
                disabled={busy || code.replace('-', '').length !== 8}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white hover:bg-blue-500 disabled:opacity-50"
              >
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                {t('mediaShare.link.continue')}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
