import type { ReactNode } from 'react';
import { InputChip } from '../../m3';

/** Tags on an item, as quiet text; clicking one filters by it. */
export function TagLine({ tags, onTagClick, limit }: { tags?: string[]; onTagClick?: (tag: string) => void; limit?: number }) {
  if (!tags || tags.length === 0) return null;
  const shown = limit ? tags.slice(0, limit) : tags;
  const overflow = tags.length - shown.length;
  return (
    <span className="v2-tag-line">
      {shown.map((tag) => (
        <button
          key={tag}
          type="button"
          className="v2-tag-line__tag"
          title={tag}
          disabled={!onTagClick}
          onClick={(e) => {
            e.stopPropagation();
            onTagClick?.(tag);
          }}
        >
          #{tag}
        </button>
      ))}
      {overflow > 0 && <span className="v2-tag-line__more">+{overflow}</span>}
    </span>
  );
}

/** One active filter, removable. */
export function FilterChip({ label, onRemove, removeLabel, icon }: { label: ReactNode; onRemove: () => void; removeLabel: string; icon?: string }) {
  return <InputChip label={label} icon={icon} onRemove={onRemove} removeLabel={removeLabel} />;
}
