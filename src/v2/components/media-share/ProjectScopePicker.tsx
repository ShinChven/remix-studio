import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { fetchProjects } from '../../../api';
import { Checkbox, Text } from '../../../m3';
import { ChoiceTiles } from '../../ui/ChoiceTiles';
import { LoadingState } from '../../ui/Page';
import { SearchField } from '../../ui/SearchField';
import { StatusPill } from '../../ui/Stat';

interface ProjectOption {
  id: string;
  name: string;
  status?: string;
}

/** What a TV, WebDAV client or DLNA server may read: every active project (null) or a list. */
export function ProjectScopePicker({ value, onChange }: { value: string[] | null; onChange: (value: string[] | null) => void }) {
  const { t } = useTranslation();
  const [projects, setProjects] = useState<ProjectOption[] | null>(null);
  const [query, setQuery] = useState('');
  const selected = value !== null;

  useEffect(() => {
    if (!selected || projects) return;
    let cancelled = false;
    fetchProjects(1, 500, undefined, 'all', true, true)
      .then((result) => !cancelled && setProjects(result.items.map((p) => ({ id: p.id, name: p.name, status: p.status }))))
      .catch(() => !cancelled && setProjects([]));
    return () => {
      cancelled = true;
    };
  }, [selected, projects]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (projects || []).filter((p) => !q || p.name.toLowerCase().includes(q));
  }, [projects, query]);

  const toggle = (id: string) => {
    const current = value || [];
    onChange(current.includes(id) ? current.filter((x) => x !== id) : [...current, id]);
  };

  return (
    <div className="flex flex-col gap-3">
      <Text variant="label-large" className="text-on-surface-variant">
        {t('mediaShare.scope.label')}
      </Text>
      <ChoiceTiles<'all' | 'selected'>
        size="compact"
        value={selected ? 'selected' : 'all'}
        onChange={(mode) => onChange(mode === 'all' ? null : value || [])}
        options={[
          { value: 'all', icon: 'select_all', label: t('mediaShare.scope.all'), supportingText: t('mediaShare.scope.allHint') },
          { value: 'selected', icon: 'checklist', label: t('mediaShare.scope.selected'), supportingText: selected ? t('mediaShare.scope.selectedCount', { count: value.length }) : undefined },
        ]}
      />
      {selected && (
        <div className="v2-scope-list" data-density="compact">
          <SearchField shape="field" value={query} onChange={setQuery} placeholder={t('mediaShare.scope.search')} />
          <div className="max-h-64 overflow-y-auto">
            {projects === null ? (
              <LoadingState minHeight={80} label={t('mediaShare.scope.loading')} />
            ) : filtered.length === 0 ? (
              <Text variant="body-medium" className="px-3 py-4 text-on-surface-variant">
                {t('mediaShare.scope.empty')}
              </Text>
            ) : (
              filtered.map((project) => (
                <div key={project.id} className="flex items-center justify-between gap-2 px-1">
                  <Checkbox label={project.name} checked={value.includes(project.id)} onChange={() => toggle(project.id)} className="min-w-0 flex-1" />
                  {project.status === 'archived' && <StatusPill>{t('mediaShare.scope.archived')}</StatusPill>}
                </div>
              ))
            )}
          </div>
        </div>
      )}
      {selected && value.length === 0 && (
        <Text variant="body-small" className="text-warning">
          {t('mediaShare.scope.pickOne')}
        </Text>
      )}
    </div>
  );
}

export function isScopeValid(value: string[] | null): boolean {
  return value === null || value.length > 0;
}
