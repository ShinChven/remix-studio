import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { imageDisplayUrl } from '../../../api';
import { civitaiOptionLabel } from '../../../lib/civitai';
import { Button, Dialog, Icon, Text } from '../../../m3';
import type { Library, Project, WorkflowItem } from '../../../types';
import { kindMeta } from '../../ui/entityMeta';
import { EmptyState } from '../../ui/Page';
import { StatusPill } from '../../ui/Stat';

const STEP_ICONS: Record<WorkflowItem['type'], string> = {
  text: kindMeta('text').icon,
  image: kindMeta('image').icon,
  video: kindMeta('video').icon,
  audio: kindMeta('audio').icon,
  library: 'photo_library',
  model: 'hexagon',
};

function Fact({ label, value }: { label: ReactNode; value: ReactNode }) {
  return (
    <div className="v2-preview-fact">
      <Text variant="label-small" className="text-on-surface-variant">{label}</Text>
      <Text variant="body-medium">{value}</Text>
    </div>
  );
}

/** Read-only summary of a project's model, settings and workflow, with a link into it. */
export function ProjectPreviewDialog({ project, libraries, onClose }: { project: Project | null; libraries: Library[]; onClose: () => void }) {
  const { t } = useTranslation();
  const steps = project?.workflow || [];
  const libraryName = (id: string) => libraries.find((l) => l.id === id)?.name || t('assistant.preview.unknownLibrary', 'Unknown Library');
  const notSet = t('assistant.preview.notSet', 'Not set');

  return (
    <Dialog
      open={!!project}
      onClose={onClose}
      icon="auto_awesome"
      fullScreen="compact"
      maxWidth={900}
      headline={project?.name}
      actions={
        <>
          <Button variant="text" onClick={onClose}>
            {t('common.close', 'Close')}
          </Button>
          {project && (
            <Button variant="filled" icon="open_in_new" href={`/project/${project.id}`} onClick={onClose}>
              {t('assistant.preview.openProject', 'Open Full Project')}
            </Button>
          )}
        </>
      }
    >
      {project && (
        <div className="v2-preview">
          {project.description && <Text variant="body-medium" className="text-on-surface-variant">{project.description}</Text>}
          <div className="v2-preview__badges">
            <code className="v2-code-chip">ID: {project.id}</code>
            <StatusPill tone="primary">{project.type}</StatusPill>
            {project.status === 'archived' && <StatusPill tone="warning">{t('assistant.preview.archived', 'Archived')}</StatusPill>}
          </div>
          <div className="v2-preview__grid">
            <div className="v2-preview__aside">
              <section className="v2-preview__group">
                <Text variant="label-medium" className="v2-preview__heading"><Icon name="smart_toy" size={18} />{t('assistant.preview.aiConfig', 'AI configuration')}</Text>
                <Fact label={t('assistant.preview.provider', 'Provider')} value={project.providerId || notSet} />
                <Fact label={t('assistant.preview.model', 'Model')} value={project.modelConfigId || notSet} />
              </section>
              <section className="v2-preview__group">
                <Text variant="label-medium" className="v2-preview__heading"><Icon name="tune" size={18} />{t('assistant.preview.settings', 'Project settings')}</Text>
                {project.aspectRatio && <Fact label={t('assistant.preview.aspectRatio', 'Aspect Ratio')} value={project.aspectRatio} />}
                {project.quality && <Fact label={t('assistant.preview.quality', 'Quality')} value={project.quality} />}
                {project.resolution && <Fact label={t('assistant.preview.resolution', 'Resolution')} value={project.resolution} />}
                {project.duration && <Fact label={t('assistant.preview.duration', 'Duration')} value={`${project.duration}s`} />}
              </section>
            </div>
            <section className="v2-preview__steps">
              <Text variant="label-medium" className="v2-preview__heading"><Icon name="layers" size={18} />{t('assistant.preview.steps', 'Workflow steps ({{count}})', { count: steps.length })}</Text>
              {steps.length === 0 && <EmptyState size="inline" icon="layers" title={t('assistant.preview.noSteps', 'No workflow steps')} />}
              {steps.map((item, index) => (
                <div key={item.id} className="v2-preview-step" data-disabled={item.disabled ? '' : undefined}>
                  <div className="v2-preview-step__head">
                    <span className="v2-preview-step__num">{index + 1}</span>
                    <Icon name={STEP_ICONS[item.type] ?? 'circle'} size={18} />
                    <Text variant="label-large">
                      {item.type === 'model' ? (item.civitai?.slot === 'checkpoint' ? 'checkpoint' : 'lora') : item.type}
                      {item.civitai?.slot === 'negative' && ' · negative'}
                    </Text>
                    {item.disabled && <StatusPill>{t('assistant.preview.disabled', 'Disabled')}</StatusPill>}
                  </div>
                  {item.type === 'text' && <Text variant="body-medium" className="v2-preview-step__quote">“{item.value || t('assistant.preview.noContent', 'No content')}”</Text>}
                  {item.type === 'model' && (
                    <ul className="v2-preview-step__list">
                      {(item.civitai?.options || []).map((option, i) => (
                        <li key={i}>{civitaiOptionLabel(option, item.civitai!.slot)}</li>
                      ))}
                    </ul>
                  )}
                  {item.type === 'library' && (
                    <Text variant="body-medium" className="v2-preview-step__line"><Icon name="photo_library" size={16} />{libraryName(item.value)}</Text>
                  )}
                  {(item.type === 'image' || item.type === 'video' || item.type === 'audio') && (
                    <div className="v2-preview-step__media">
                      <span className="v2-preview-step__thumb">
                        {item.value && item.type === 'image' && <img src={imageDisplayUrl(item.thumbnailUrl || item.value)} alt="" />}
                        {item.value && item.type === 'video' && item.thumbnailUrl && <img src={imageDisplayUrl(item.thumbnailUrl)} alt="" />}
                        {(!item.value || (item.type === 'video' && !item.thumbnailUrl) || item.type === 'audio') && <Icon name={item.value ? STEP_ICONS[item.type] : 'hide_image'} size={22} />}
                      </span>
                      <Text variant="body-small" className="text-on-surface-variant v2-ellipsis">{item.value || t('assistant.preview.noFile', 'No file uploaded')}</Text>
                    </div>
                  )}
                </div>
              ))}
            </section>
          </div>
        </div>
      )}
    </Dialog>
  );
}
