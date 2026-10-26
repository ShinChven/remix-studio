import type { LibraryItem } from '../../types';

/**
 * The text and JSON formats a text library imports and exports: `- Title: Content | tags: a, b`
 * lines, or an array of { title, content, tags } objects.
 */
export type ParsedPreviewItem = {
  title?: string;
  content: string;
  tags: string[];
  sourceLine: number;
};

export type ParseIssue = {
  line: number;
  raw: string;
  reasonKey:
    | 'missingListMarker'
    | 'emptyAfterMarker'
    | 'missingContentBeforeTags'
    | 'missingContentAfterTitle'
    | 'invalidJson'
    | 'notArray'
    | 'invalidItem';
};

export type ExportMode = 'tagged' | 'plain';
export type ImportFormat = 'text' | 'json';
export type ExportFormat = 'text' | 'json';

const TAG_SEGMENT_PATTERN = /\s+\|\s*tags\s*:\s*(.+)$/i;

export function normalizeTags(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function parseTagsInput(value: string): string[] {
  return normalizeTags(value.split(','));
}

export function parseImportText(importText: string, sharedTagsInput: string): {
  items: ParsedPreviewItem[];
  issues: ParseIssue[];
} {
  const items: ParsedPreviewItem[] = [];
  const issues: ParseIssue[] = [];
  const sharedTags = parseTagsInput(sharedTagsInput);

  importText.split('\n').forEach((line, index) => {
    const trimmed = line.trim();

    if (!trimmed) return;

    if (!trimmed.startsWith('- ')) {
      issues.push({
        line: index + 1,
        raw: line,
        reasonKey: 'missingListMarker',
      });
      return;
    }

    let itemText = trimmed.slice(2).trim();
    if (!itemText) {
      issues.push({
        line: index + 1,
        raw: line,
        reasonKey: 'emptyAfterMarker',
      });
      return;
    }

    let inlineTags: string[] = [];
    const tagsMatch = itemText.match(TAG_SEGMENT_PATTERN);
    if (tagsMatch) {
      inlineTags = parseTagsInput(tagsMatch[1]);
      itemText = itemText.replace(TAG_SEGMENT_PATTERN, '').trim();
    }

    if (!itemText) {
      issues.push({
        line: index + 1,
        raw: line,
        reasonKey: 'missingContentBeforeTags',
      });
      return;
    }

    const colonIndex = itemText.indexOf(':');
    const hasTitle = colonIndex > 0;
    const title = hasTitle ? itemText.slice(0, colonIndex).trim() : undefined;
    const content = hasTitle ? itemText.slice(colonIndex + 1).trim() : itemText;

    if (!content) {
      issues.push({
        line: index + 1,
        raw: line,
        reasonKey: 'missingContentAfterTitle',
      });
      return;
    }

    items.push({
      title: title || undefined,
      content,
      tags: normalizeTags([...sharedTags, ...inlineTags]),
      sourceLine: index + 1,
    });
  });

  return { items, issues };
}

export function parseJsonImportText(importText: string, sharedTagsInput: string): {
  items: ParsedPreviewItem[];
  issues: ParseIssue[];
} {
  const items: ParsedPreviewItem[] = [];
  const issues: ParseIssue[] = [];
  const sharedTags = parseTagsInput(sharedTagsInput);
  const trimmed = importText.trim();

  if (!trimmed) {
    return { items, issues };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    issues.push({ line: 1, raw: importText, reasonKey: 'invalidJson' });
    return { items, issues };
  }

  if (!Array.isArray(parsed)) {
    issues.push({ line: 1, raw: importText, reasonKey: 'notArray' });
    return { items, issues };
  }

  parsed.forEach((entry, index) => {
    const line = index + 1;

    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      issues.push({ line, raw: JSON.stringify(entry), reasonKey: 'invalidItem' });
      return;
    }

    const record = entry as Record<string, unknown>;
    const content = typeof record.content === 'string' ? record.content.trim() : '';

    if (!content) {
      issues.push({ line, raw: JSON.stringify(entry), reasonKey: 'invalidItem' });
      return;
    }

    const title = typeof record.title === 'string' && record.title.trim() ? record.title.trim() : undefined;
    const entryTags = Array.isArray(record.tags)
      ? record.tags.filter((tag): tag is string => typeof tag === 'string')
      : [];

    items.push({
      title,
      content,
      tags: normalizeTags([...sharedTags, ...entryTags]),
      sourceLine: line,
    });
  });

  return { items, issues };
}

export function formatExportJson(items: LibraryItem[]): string {
  return JSON.stringify(
    items.map((item) => ({
      title: item.title || undefined,
      content: item.content,
      tags: item.tags && item.tags.length > 0 ? normalizeTags(item.tags) : undefined,
    })),
    null,
    2
  );
}

export function formatExportText(items: LibraryItem[], exportMode: ExportMode): string {
  return items
    .map((item) => {
      const baseLine = item.title
        ? `- ${item.title}: ${item.content}`
        : `- ${item.content}`;

      if (exportMode === 'plain' || !item.tags || item.tags.length === 0) {
        return baseLine;
      }

      return `${baseLine} | tags: ${normalizeTags(item.tags).join(', ')}`;
    })
    .join('\n');
}

