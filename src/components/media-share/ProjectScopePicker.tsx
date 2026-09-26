import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Search } from 'lucide-react';
import { fetchProjects } from '../../api';

interface ProjectOption {
  id: string;
  name: string;
  status?: string;
}

/**
 * Chooses what a TV, WebDAV client or DLNA server may read: every active
 * project (null) or an explicit list of project ids.
 */
export function ProjectScopePicker({ value, onChange }: {
  value: string[] | null;
  onChange: (value: string[] | null) => void;
}) {
  const { t } = useTranslation();
  const [projects, setProjects] = useState<ProjectOption[] | null>(null);
  const [query, setQuery] = useState('');
  const selected = value !== null;

  useEffect(() => {
    if (!selected || projects) return;
    let cancelled = false;
    fetchProjects(1, 500, undefined, 'all', true)
      .then((result) => {
        if (!cancelled) setProjects(result.items.map((p) => ({ id: p.id, name: p.name, status: (p as { status?: string }).status })));
      })
      .catch(() => {
        if (!cancelled) setProjects([]);
      });
    return () => {
      cancelled = true;
    };
  }, [selected, projects]);

  const filtered = useMemo(() => {
    const list = projects || [];
    const q = query.trim().toLowerCase();
    return q ? list.filter((p) => p.name.toLowerCase().includes(q)) : list;
  }, [projects, query]);

  const toggle = (id: string) => {
    const current = value || [];
    onChange(current.includes(id) ? current.filter((x) => x !== id) : [...current, id]);
  };

  const radio = (active: boolean, label: string, hint: string | null, onSelect: () => void) => (
    <button
      type="button"
      onClick={onSelect}
      className={`flex-1 rounded-xl border px-4 py-3 text-left transition-ui ${
        active
          ? 'border-blue-500/40 bg-blue-500/10 text-blue-700 dark:text-blue-300'
          : 'border-neutral-200 dark:border-neutral-800 bg-white/60 dark:bg-neutral-950/40 text-neutral-700 dark:text-neutral-300 hover:border-neutral-300 dark:hover:border-neutral-700'
      }`}
    >
      <span className="block text-sm font-bold">{label}</span>
      {hint && <span className="mt-0.5 block text-xs text-neutral-500">{hint}</span>}
    </button>
  );

  return (
    <div className="space-y-3">
      <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-500 ml-1">{t('mediaShare.scope.label')}</label>
      <div className="flex flex-col gap-2 sm:flex-row">
        {radio(!selected, t('mediaShare.scope.all'), t('mediaShare.scope.allHint'), () => onChange(null))}
        {radio(
          selected,
          t('mediaShare.scope.selected'),
          selected ? t('mediaShare.scope.selectedCount', { count: value.length }) : null,
          () => onChange(value || []),
        )}
      </div>
      {selected && (
        <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white/60 dark:bg-neutral-950/40">
          <div className="flex items-center gap-2 border-b border-neutral-200 dark:border-neutral-800 px-3 py-2">
            <Search className="h-4 w-4 text-neutral-400" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('mediaShare.scope.search')}
              className="w-full bg-transparent text-sm text-neutral-900 dark:text-white placeholder-neutral-500 focus:outline-none"
            />
          </div>
          <div className="max-h-64 overflow-y-auto p-1">
            {projects === null ? (
              <div className="flex items-center gap-2 px-3 py-4 text-sm text-neutral-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                {t('mediaShare.scope.loading')}
              </div>
            ) : filtered.length === 0 ? (
              <div className="px-3 py-4 text-sm text-neutral-500">{t('mediaShare.scope.empty')}</div>
            ) : (
              filtered.map((project) => (
                <label key={project.id} className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm hover:bg-neutral-100 dark:hover:bg-neutral-800/60">
                  <input
                    type="checkbox"
                    checked={value.includes(project.id)}
                    onChange={() => toggle(project.id)}
                    className="h-4 w-4 accent-blue-600"
                  />
                  <span className="min-w-0 flex-1 truncate text-neutral-800 dark:text-neutral-200">{project.name}</span>
                  {project.status === 'archived' && (
                    <span className="rounded-full bg-neutral-200 dark:bg-neutral-800 px-2 py-0.5 text-[10px] font-semibold text-neutral-500">
                      {t('mediaShare.scope.archived')}
                    </span>
                  )}
                </label>
              ))
            )}
          </div>
        </div>
      )}
      {selected && value.length === 0 && <p className="text-xs font-medium text-amber-600 dark:text-amber-400">{t('mediaShare.scope.pickOne')}</p>}
    </div>
  );
}

export function isScopeValid(value: string[] | null): boolean {
  return value === null || value.length > 0;
}
