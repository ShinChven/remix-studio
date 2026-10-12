import React from 'react';
import { useTranslation } from 'react-i18next';
import { CopyPlus, Eye, EyeOff, GripVertical, Hexagon, Layers, Trash2 } from 'lucide-react';
import type { CivitaiResource, WorkflowItem } from '../../types';
import { CIVITAI_LIMITS, civitaiModelItemValue, isCivitaiEmbedding } from '../../lib/civitai';
import { NumberInput } from '../NumberInput';
import { CivitaiResourceCard, CivitaiResourceLookup, civitaiNumberClass } from './CivitaiResourceParts';

const CHECKPOINT_TYPES = new Set(['Checkpoint']);
const NETWORK_TYPES = new Set(['LORA', 'LoCon', 'DoRA', 'TextualInversion', 'Hypernetwork']);

interface CivitaiModelItemProps {
  item: WorkflowItem;
  index: number;
  /** The project's Civitai account, used to look models up. */
  providerId?: string;
  draggedIndex: number | null;
  dragOverIndex: number | null;
  onDragStart: (e: React.DragEvent, index: number) => void;
  onDragOver: (e: React.DragEvent, index: number) => void;
  onDrop: (e: React.DragEvent, index: number) => void;
  onDragEnd: () => void;
  onRemove: (id: string) => void;
  onToggleDisable?: (id: string) => void;
  onChange: (item: WorkflowItem) => void;
  gridView?: boolean;
}

/**
 * A checkpoint or LoRA slot in a Civitai project's workflow. It holds one or
 * more options; like a library, each job takes one of them, so several
 * options multiply the combinations — two checkpoints, or one LoRA at two
 * strengths. Every enabled LoRA slot applies to every job.
 */
export function CivitaiModelItem({
  item,
  index,
  providerId,
  draggedIndex,
  dragOverIndex,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  onRemove,
  onToggleDisable,
  onChange,
  gridView = false,
}: CivitaiModelItemProps) {
  const { t } = useTranslation();
  const slot = item.civitai?.slot === 'checkpoint' ? 'checkpoint' : 'lora';
  const options = item.civitai?.options || [];
  const Icon = slot === 'checkpoint' ? Hexagon : Layers;

  const setOptions = (next: CivitaiResource[]) => {
    onChange({ ...item, value: civitaiModelItemValue(next), civitai: { slot, options: next } });
  };

  const accept = (resource: CivitaiResource) => {
    if (slot === 'checkpoint' && resource.type && !CHECKPOINT_TYPES.has(resource.type)) {
      return t('projectViewer.civitai.notACheckpoint', { type: resource.type });
    }
    if (slot === 'lora' && resource.type && !NETWORK_TYPES.has(resource.type)) {
      return t('projectViewer.civitai.notANetwork', { type: resource.type });
    }
    if (options.some((option) => option.air === resource.air)) return t('projectViewer.civitai.alreadyAdded');
    if (options.length >= CIVITAI_LIMITS.options) return t('projectViewer.civitai.tooManyOptions', { count: CIVITAI_LIMITS.options });
    return null;
  };

  const addOption = (resource: CivitaiResource) => {
    setOptions([...options, slot === 'lora' && !isCivitaiEmbedding(resource) ? { ...resource, strength: 1 } : resource]);
  };

  /** Vary a LoRA's strength: a copy of the option at another strength becomes an option of its own. */
  const addStrength = (position: number) => {
    const source = options[position];
    const taken = new Set(options.filter((option) => option.air === source.air).map((option) => option.strength ?? 1));
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
    if (options.some((option, i) => i !== position && option.air === options[position].air && (option.strength ?? 1) === rounded)) return;
    setOptions(options.map((option, i) => (i === position ? { ...option, strength: rounded } : option)));
  };

  const visibilityLabel = item.disabled ? t('projectViewer.workflow.enableItem', { defaultValue: 'Enable' }) : t('projectViewer.workflow.disableItem', { defaultValue: 'Disable' });
  const deleteLabel = t('projectViewer.common.delete', { defaultValue: 'Delete' });

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, index)}
      onDragOver={(e) => onDragOver(e, index)}
      onDrop={(e) => onDrop(e, index)}
      onDragEnd={onDragEnd}
      className={`bg-white/70 dark:bg-neutral-950/70 border rounded-xl p-4 group transition-ui backdrop-blur-xl ${gridView ? 'lg:h-full lg:min-h-0 lg:flex lg:flex-col lg:overflow-hidden' : ''} ${item.disabled ? 'opacity-40 grayscale-[0.5]' : ''} ${
        draggedIndex === index ? 'opacity-50 border-sky-500' :
        dragOverIndex === index ? 'border-sky-400 border-dashed bg-white/40 dark:bg-neutral-800/40' :
        'border-neutral-200/50 dark:border-white/5 hover:border-sky-500/50 shadow-sm hover:shadow-xl duration-300 hover:-translate-y-0.5'
      }`}
    >
      <div className="flex justify-between items-center mb-3 lg:flex-shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <div className="cursor-grab active:cursor-grabbing text-neutral-600 hover:text-neutral-400 transition-colors">
            <GripVertical className="w-4 h-4" />
          </div>
          <span className={`text-[10px] font-bold uppercase tracking-widest flex items-center gap-1.5 ${item.disabled ? 'text-neutral-400 dark:text-neutral-600 line-through' : 'text-neutral-500 dark:text-neutral-500'}`}>
            <Icon className="w-3 h-3 text-sky-500" />
            {slot === 'checkpoint' ? t('projectViewer.civitai.checkpoint') : t('projectViewer.civitai.lora')}
          </span>
          {options.length > 1 && (
            <span className="rounded-md border border-sky-500/30 bg-sky-500/10 px-1.5 py-0.5 text-[9px] font-black tracking-[0.14em] text-sky-600 dark:text-sky-300">
              {t('projectViewer.civitai.optionsCount', { count: options.length })}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {onToggleDisable && (
            <button
              type="button"
              onClick={() => onToggleDisable(item.id)}
              className={`transition-all p-1.5 rounded-lg border border-transparent hover:bg-neutral-100 dark:hover:bg-neutral-800 ${item.disabled ? 'text-neutral-400 hover:text-neutral-600' : 'text-blue-500 hover:text-blue-600'}`}
              title={visibilityLabel}
              aria-label={visibilityLabel}
            >
              {item.disabled ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          )}
          <button
            type="button"
            onClick={() => onRemove(item.id)}
            className="text-neutral-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-all p-1.5 rounded-lg border border-transparent hover:border-red-200"
            title={deleteLabel}
            aria-label={deleteLabel}
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className={`space-y-2 ${gridView ? 'lg:flex-1 lg:min-h-0 lg:overflow-y-auto custom-scrollbar' : ''}`}>
        {options.length === 0 && (
          <p className="px-1 text-[11px] leading-4 text-neutral-500">
            {slot === 'checkpoint' ? t('projectViewer.civitai.emptyCheckpoint') : t('projectViewer.civitai.emptyLora')}
          </p>
        )}
        {options.map((option, position) => (
          <CivitaiResourceCard
            key={`${option.air}-${position}`}
            resource={option}
            onRemove={() => setOptions(options.filter((_, i) => i !== position))}
            actions={slot === 'lora' && !isCivitaiEmbedding(option) ? (
              <button
                type="button"
                onClick={() => addStrength(position)}
                className="p-1.5 rounded-lg text-neutral-400 hover:text-sky-600 dark:hover:text-sky-400 hover:bg-sky-500/10 transition-colors"
                title={t('projectViewer.civitai.addStrength')}
                aria-label={t('projectViewer.civitai.addStrength')}
              >
                <CopyPlus className="w-3.5 h-3.5" />
              </button>
            ) : undefined}
          >
            {slot === 'lora' && !isCivitaiEmbedding(option) && (
              <div className="flex items-center gap-2">
                <span className="text-[9px] font-black uppercase tracking-widest text-neutral-500 shrink-0">{t('projectViewer.civitai.strength')}</span>
                <input
                  type="range"
                  min={-1}
                  max={2}
                  step={0.05}
                  value={option.strength ?? 1}
                  onChange={(e) => updateStrength(position, Number(e.target.value))}
                  className="min-w-0 flex-1 accent-sky-500"
                  aria-label={t('projectViewer.civitai.strength')}
                />
                <NumberInput
                  value={option.strength ?? 1}
                  onValueChange={(strength) => updateStrength(position, strength)}
                  min={CIVITAI_LIMITS.strength.min}
                  max={CIVITAI_LIMITS.strength.max}
                  step={0.05}
                  className={`${civitaiNumberClass} !w-16 !py-1`}
                />
              </div>
            )}
          </CivitaiResourceCard>
        ))}
        {options.length > 1 && (
          <p className="px-1 text-[10px] leading-4 text-sky-600/80 dark:text-sky-400/80">{t('projectViewer.civitai.optionsHint', { count: options.length })}</p>
        )}
        <CivitaiResourceLookup
          providerId={providerId}
          slot={slot}
          placeholder={slot === 'checkpoint' ? t('projectViewer.civitai.checkpointPlaceholder') : t('projectViewer.civitai.resourcePlaceholder')}
          accept={accept}
          onResolved={addOption}
        />
      </div>
    </div>
  );
}
