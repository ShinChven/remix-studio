import { useTranslation } from 'react-i18next';
import { CIVITAI_LIMITS, civitaiModelItemValue, civitaiResourceFitsEngine, isCivitaiEmbedding, type CivitaiVideoEngineSpec } from '../../../lib/civitai';
import { Icon, IconButton, Slider, Text } from '../../../m3';
import type { CivitaiResource, WorkflowItem } from '../../../types';
import { NumberField } from '../../ui/NumberField';
import { CivitaiResourceCard, CivitaiResourceLookup } from './CivitaiParts';
import { StepCard, type StepDragProps } from './StepCard';

const CHECKPOINT_TYPES = new Set(['Checkpoint']);
const NETWORK_TYPES = new Set(['LORA', 'LoCon', 'DoRA', 'TextualInversion', 'Hypernetwork']);

export interface CivitaiModelStepProps extends StepDragProps {
  item: WorkflowItem;
  providerId?: string;
  videoEngine?: CivitaiVideoEngineSpec;
  onRemove: (id: string) => void;
  onToggleDisable?: (id: string) => void;
  onChange: (item: WorkflowItem) => void;
  gridView?: boolean;
}

/**
 * A checkpoint or LoRA slot in a Civitai workflow. Like a library, each job
 * takes one of its options, so several options multiply the combinations.
 */
export function CivitaiModelStep(props: CivitaiModelStepProps) {
  const { item, providerId, videoEngine, onChange } = props;
  const { t } = useTranslation();
  const slot = item.civitai?.slot === 'checkpoint' ? 'checkpoint' : 'lora';
  const options = item.civitai?.options || [];
  const setOptions = (next: CivitaiResource[]) => onChange({ ...item, value: civitaiModelItemValue(next), civitai: { slot, options: next } });

  const accept = (resource: CivitaiResource) => {
    if (slot === 'checkpoint' && resource.type && !CHECKPOINT_TYPES.has(resource.type)) return t('projectViewer.civitai.notACheckpoint', { type: resource.type });
    if (slot === 'lora' && resource.type && !NETWORK_TYPES.has(resource.type)) return t('projectViewer.civitai.notANetwork', { type: resource.type });
    if (options.some((option) => option.air === resource.air)) return t('projectViewer.civitai.alreadyAdded');
    if (options.length >= CIVITAI_LIMITS.options) return t('projectViewer.civitai.tooManyOptions', { count: CIVITAI_LIMITS.options });
    return null;
  };

  /** A copy of a LoRA option at another strength becomes an option of its own. */
  const addStrength = (position: number) => {
    const source = options[position];
    const taken = new Set(options.filter((o) => o.air === source.air).map((o) => o.strength ?? 1));
    let strength = Math.round(((source.strength ?? 1) - 0.25) * 100) / 100;
    while (taken.has(strength) && strength > CIVITAI_LIMITS.strength.min) strength = Math.round((strength - 0.25) * 100) / 100;
    if (taken.has(strength) || options.length >= CIVITAI_LIMITS.options) return;
    const next = [...options];
    next.splice(position + 1, 0, { ...source, strength });
    setOptions(next);
  };

  const updateStrength = (position: number, strength: number) => {
    const rounded = Math.round(strength * 100) / 100;
    // Two options of one LoRA at the same strength would be the same job twice.
    if (options.some((o, i) => i !== position && o.air === options[position].air && (o.strength ?? 1) === rounded)) return;
    setOptions(options.map((o, i) => (i === position ? { ...o, strength: rounded } : o)));
  };

  return (
    <StepCard
      {...props}
      icon={slot === 'checkpoint' ? 'hexagon' : 'layers'}
      tone="tertiary"
      label={slot === 'checkpoint' ? t('projectViewer.civitai.checkpoint') : t('projectViewer.civitai.lora')}
      disabled={item.disabled}
      extra={options.length > 1 && <span className="v2-info-chip" data-tone="tertiary">{t('projectViewer.civitai.optionsCount', { count: options.length })}</span>}
      actions={
        <>
          {props.onToggleDisable && (
            <IconButton
              icon={item.disabled ? 'visibility_off' : 'visibility'}
              size="xs"
              label={item.disabled ? t('projectViewer.workflow.enableItem', { defaultValue: 'Enable' }) : t('projectViewer.workflow.disableItem', { defaultValue: 'Disable' })}
              tooltip
              onClick={() => props.onToggleDisable!(item.id)}
            />
          )}
          <IconButton icon="delete" size="xs" label={t('projectViewer.common.delete', { defaultValue: 'Delete' })} tooltip onClick={() => props.onRemove(item.id)} />
        </>
      }
    >
      <div className="flex flex-col gap-2">
        {videoEngine && (slot === 'checkpoint' || videoEngine.loras === 0) && (
          <div className="v2-notice" data-tone="warning">
            <Icon name="warning" size={18} />
            <Text variant="body-small">{slot === 'checkpoint' ? t('projectViewer.civitai.video.checkpointUnused', { engine: videoEngine.label }) : t('projectViewer.civitai.video.noLorasHint', { engine: videoEngine.label })}</Text>
          </div>
        )}
        {options.length === 0 && (
          <Text variant="body-small" className="v2-dashed-note">
            {slot === 'checkpoint' ? t('projectViewer.civitai.emptyCheckpoint') : t('projectViewer.civitai.emptyLora')}
          </Text>
        )}
        {options.map((option, position) => (
          <CivitaiResourceCard
            key={`${option.air}-${position}`}
            resource={option}
            onRemove={() => setOptions(options.filter((_, i) => i !== position))}
            actions={slot === 'lora' && !isCivitaiEmbedding(option) ? <IconButton icon="library_add" size="xs" label={t('projectViewer.civitai.addStrength')} tooltip onClick={() => addStrength(position)} /> : undefined}
          >
            {slot === 'lora' && videoEngine && videoEngine.loras > 0 && civitaiResourceFitsEngine(option, videoEngine) === false && (
              <div className="v2-notice" data-tone="warning">
                <Icon name="warning" size={18} />
                <Text variant="body-small">{t('projectViewer.civitai.video.loraMismatch', { baseModel: option.baseModel, engine: videoEngine.label })}</Text>
              </div>
            )}
            {slot === 'lora' && !isCivitaiEmbedding(option) && (
              <div className="flex items-center gap-3">
                <Text as="span" variant="label-small" className="uppercase tracking-widest text-on-surface-variant">
                  {t('projectViewer.civitai.strength')}
                </Text>
                <Slider className="flex-1" min={-1} max={2} step={0.05} value={option.strength ?? 1} onChange={(v) => updateStrength(position, v)} aria-label={t('projectViewer.civitai.strength')} />
                <NumberField aria-label={t('projectViewer.civitai.strength')} value={option.strength ?? 1} onValueChange={(v) => updateStrength(position, v)} min={CIVITAI_LIMITS.strength.min} max={CIVITAI_LIMITS.strength.max} step={0.05} className="v2-scalar-field" />
              </div>
            )}
          </CivitaiResourceCard>
        ))}
        {options.length > 1 && (
          <Text variant="body-small" className="text-on-surface-variant">
            {t('projectViewer.civitai.optionsHint', { count: options.length })}
          </Text>
        )}
        <CivitaiResourceLookup
          providerId={providerId}
          slot={slot}
          baseModels={slot === 'lora' && videoEngine?.loras ? videoEngine.baseModels : undefined}
          placeholder={slot === 'checkpoint' ? t('projectViewer.civitai.checkpointPlaceholder') : t('projectViewer.civitai.resourcePlaceholder')}
          accept={accept}
          onResolved={(resource) => setOptions([...options, slot === 'lora' && !isCivitaiEmbedding(resource) ? { ...resource, strength: 1 } : resource])}
        />
      </div>
    </StepCard>
  );
}
