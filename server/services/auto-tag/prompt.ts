/** Tags asked of the model per item, and the most kept from one reply. */
export const AUTO_TAG_MIN = 5;
export const AUTO_TAG_MAX = 10;

/** Text items are cut to this many characters before they are sent. */
export const AUTO_TAG_TEXT_LIMIT = 8000;

/** Existing tags offered to the model as the vocabulary to reuse. */
export const AUTO_TAG_VOCABULARY_SIZE = 40;

const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English',
  fr: 'French',
  ja: 'Japanese',
  ko: 'Korean',
  'zh-CN': 'Simplified Chinese',
  'zh-TW': 'Traditional Chinese',
};

/** The language tags are written in, from the UI language code the browser sent. */
export function autoTagLanguageName(code: unknown): string {
  if (typeof code !== 'string') return LANGUAGE_NAMES.en;
  return LANGUAGE_NAMES[code] || LANGUAGE_NAMES[code.split('-')[0]] || LANGUAGE_NAMES.en;
}

export const AUTO_TAG_SYSTEM_PROMPT =
  'You tag media in a creative asset library so it can be found and filtered later. '
  + 'Reply with a JSON array of strings and nothing else.';

export function buildAutoTagPrompt(options: {
  kind: 'image' | 'text';
  language: string;
  vocabulary: string[];
  existingTags: string[];
  text?: string;
}): string {
  const lines = [
    options.kind === 'image' ? 'Tag this image.' : 'Tag the text below.',
    options.kind === 'image'
      ? `- Give ${AUTO_TAG_MIN} to ${AUTO_TAG_MAX} tags covering its subject, setting, style, mood, colors and composition.`
      : `- Give ${AUTO_TAG_MIN} to ${AUTO_TAG_MAX} tags covering its topic, genre, tone and style.`,
    `- Write every tag in ${options.language}. Keep each one short (one to three words), lowercase where the language has case, with no "#".`,
  ];
  if (options.vocabulary.length > 0) {
    lines.push(`- This collection already uses these tags; reuse them when they fit rather than inventing a synonym: ${options.vocabulary.join(', ')}`);
  }
  if (options.existingTags.length > 0) {
    lines.push(`- The item already has these tags; do not repeat them: ${options.existingTags.join(', ')}`);
  }
  lines.push('Reply with only a JSON array, for example ["tag one", "tag two"].');
  if (options.kind === 'text') {
    lines.push('', '<text>', (options.text ?? '').slice(0, AUTO_TAG_TEXT_LIMIT), '</text>');
  }
  return lines.join('\n');
}

function cleanTag(value: string): string {
  return value
    .replace(/^[\s"'`“”‘’「」『』]+|[\s"'`“”‘’「」『』.。]+$/g, '')
    .replace(/^(?:(?:[-*•]|\d+[.)])\s+)+/, '')
    .replace(/^#+/, '')
    .trim();
}

/**
 * The tags in a model's reply. Models are asked for a JSON array but some wrap
 * it in a code fence or a sentence, and a few answer with a plain list, so the
 * array is looked for anywhere in the reply before falling back to splitting
 * on commas and line breaks.
 */
export function parseAutoTagReply(reply: string): string[] {
  const text = reply.trim();
  let values: unknown[] | null = null;

  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start !== -1 && end > start) {
    try {
      const parsed = JSON.parse(text.slice(start, end + 1));
      if (Array.isArray(parsed)) values = parsed;
    } catch {
      // Not JSON after all; fall through to the plain-list reading.
    }
  }
  if (!values) {
    values = text
      .replace(/```[a-z]*|```/gi, '')
      .split(/[,，、;；\n]/);
  }

  const seen = new Set<string>();
  const tags: string[] = [];
  for (const value of values) {
    if (typeof value !== 'string') continue;
    const tag = cleanTag(value);
    if (!tag || tag.length > 64) continue;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    tags.push(tag);
    if (tags.length >= AUTO_TAG_MAX) break;
  }
  return tags;
}
