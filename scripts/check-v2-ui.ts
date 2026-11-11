/**
 * Keeps the V2 UI on its shared pieces. Run with `npm run lint`.
 *
 * Each rule names what to use instead; a file listed under `allow` is the shared piece itself, or
 * a use the rule is not about (a clock or an animation is not polling).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/v2');

interface Rule {
  pattern: RegExp;
  message: string;
  allow?: string[];
}

const SOURCE_RULES: Rule[] = [
  { pattern: /\buseSnackbar\b/, message: 'Show notices through useToast (ui/useToast).', allow: ['ui/useToast.ts'] },
  { pattern: /navigator\.clipboard/, message: 'Copy through useCopy (lib/useCopy).', allow: ['lib/useCopy.ts', 'ui/CopyField.tsx'] },
  {
    pattern: /\bsetInterval\(/,
    message: 'Refresh on a timer through usePolling (lib/usePolling) or useAsyncData({ pollMs }).',
    allow: ['lib/usePolling.ts', 'pages/Login.tsx', 'components/assistant/Composer.tsx'],
  },
  { pattern: /\bwindow\.(?:confirm|alert|prompt)\(/, message: 'Ask through ConfirmDialog or PromptDialog (ui/).' },
  { pattern: /\buseRangeSelection\b|useState<Set<string>>\(new Set\(\)\);\s*\/\/ selection/, message: 'Select rows through useSelection (lib/useSelection).' },
  { pattern: /from '[./]+\/ui\/SearchField'/, message: 'Search a list with ListSearch (ui/ListSearch); SearchField is for filtering inside a dialog or form.', allow: ['components/', 'pages/CampaignForm.tsx'] },
  { pattern: /className="[^"]*\bv2-(?:selection-bar|list-toolbar|page-footer)\b/, message: 'Build lists with ListPane (ui/ListPane), which brings its bar, footer and selection toolbar.' },
];

/** Lower bounds of the M3 window size classes, and the matching upper bounds just below them. */
const BREAKPOINTS = new Set(['600', '840', '1200', '1600', '599.98', '839.98', '1199.98', '1599.98']);

interface Problem {
  file: string;
  line: number;
  message: string;
}

function walk(dir: string, extensions: string[]): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'locales' ? [] : walk(full, extensions);
    return extensions.some((extension) => entry.name.endsWith(extension)) ? [full] : [];
  });
}

const problems: Problem[] = [];

for (const file of walk(ROOT, ['.ts', '.tsx'])) {
  const relative = path.relative(ROOT, file).split(path.sep).join('/');
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  for (const rule of SOURCE_RULES) {
    if (rule.allow?.some((allowed) => relative === allowed || (allowed.endsWith('/') && relative.startsWith(allowed)))) continue;
    lines.forEach((text, index) => {
      if (text.trimStart().startsWith('//') || text.trimStart().startsWith('*')) return;
      if (rule.pattern.test(text)) problems.push({ file: relative, line: index + 1, message: rule.message });
    });
  }
}

for (const file of walk(path.join(ROOT, 'styles'), ['.css'])) {
  const relative = path.relative(ROOT, file).split(path.sep).join('/');
  if (relative === 'styles/theme-map.css') continue;
  fs.readFileSync(file, 'utf8')
    .split('\n')
    .forEach((text, index) => {
      const line = index + 1;
      for (const match of text.matchAll(/@media[^{]*?\((?:min|max)-width:\s*([\d.]+)px\)/g)) {
        if (!BREAKPOINTS.has(match[1])) problems.push({ file: relative, line, message: `Window breakpoint ${match[1]}px is not an M3 window size class (600, 840, 1200, 1600).` });
      }
      const declaresToken = /^\s*--v2-[\w-]+:/.test(text);
      if (!declaresToken && !text.includes('mask-image') && /#[0-9a-fA-F]{3,8}\b/.test(text)) {
        problems.push({ file: relative, line, message: 'Raw colour: use an M3 colour token, or a --v2- token for content laid over media.' });
      }
      if (/\btransition(?:-duration)?:[^;]*[\s,]\d*\.?\d+m?s\b/.test(text.replace(/\b0s\b/g, ''))) {
        problems.push({ file: relative, line, message: 'Raw transition time: use an M3 motion duration token.' });
      }
    });
}

if (problems.length > 0) {
  for (const problem of problems) console.error(`src/v2/${problem.file}:${problem.line}  ${problem.message}`);
  console.error(`\n${problems.length} problem${problems.length === 1 ? '' : 's'} in the V2 UI.`);
  process.exit(1);
}
console.log('V2 UI checks passed.');
