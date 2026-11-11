/** Validate the V2 bundles and the translation keys used by its components. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'acorn';
import { transformSync } from 'esbuild';
import { createInstance } from 'i18next';
import { en, fr, ja, ko, zhCN, zhTW } from '../src/locales';
import v2En from '../src/v2/locales/en';
import v2Fr from '../src/v2/locales/fr';
import v2Ja from '../src/v2/locales/ja';
import v2Ko from '../src/v2/locales/ko';
import v2ZhCN from '../src/v2/locales/zh-CN';
import v2ZhTW from '../src/v2/locales/zh-TW';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/v2');
const bundles = { en: v2En, fr: v2Fr, ja: v2Ja, ko: v2Ko, 'zh-CN': v2ZhCN, 'zh-TW': v2ZhTW };
const shared = { en, fr, ja, ko, 'zh-CN': zhCN, 'zh-TW': zhTW };
const resources = Object.fromEntries(Object.entries(bundles).map(([language, v2]) => [language, { translation: { ...shared[language], v2 } }]));
const i18n = createInstance();
await i18n.init({ resources, lng: 'en', fallbackLng: false, initAsync: false });

function flatten(value: object, prefix = ''): Record<string, string> {
  return Object.fromEntries(Object.entries(value).flatMap(([key, text]) => {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    return typeof text === 'string' ? [[fullKey, text]] : Object.entries(flatten(text, fullKey));
  }));
}

const placeholders = (text: string) => [...new Set([...text.matchAll(/{{-?\s*([^},\s]+)/g)].map((match) => match[1]))].sort().join(',');
const problems: string[] = [];
const reference = flatten(v2En);
for (const [language, bundle] of Object.entries(bundles)) {
  const messages = flatten(bundle);
  for (const [key, english] of Object.entries(reference)) {
    if (!messages[key]?.trim()) problems.push(`${language}: missing or empty v2.${key}`);
    else if (placeholders(english) !== placeholders(messages[key])) problems.push(`${language}: interpolation mismatch for v2.${key}`);
  }
  for (const key of Object.keys(messages)) {
    if (!(key in reference)) problems.push(`${language}: unexpected v2.${key}`);
  }
}

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === 'locales') return [];
    const file = path.join(dir, entry.name);
    return entry.isDirectory() ? sourceFiles(file) : /\.tsx?$/.test(file) ? [file] : [];
  });
}

// esbuild removes TS/JSX and comments; acorn distinguishes calls, options, and fallback strings.
// A defaultValue never exempts a missing key. Conditional literal keys are checked on both paths.
function literalKeys(node: any): string[] {
  if (node?.type === 'Literal' && typeof node.value === 'string') return [node.value];
  if (node?.type === 'ConditionalExpression') return [...literalKeys(node.consequent), ...literalKeys(node.alternate)];
  if (node?.type === 'TemplateLiteral' && node.expressions.length === 0) return [node.quasis[0].value.cooked];
  return [];
}

let calls = 0;
for (const file of sourceFiles(ROOT)) {
  const source = fs.readFileSync(file, 'utf8');
  const { code } = transformSync(source, { loader: file.endsWith('.tsx') ? 'tsx' : 'ts', format: 'esm', legalComments: 'none' });
  const ast = parse(code, { ecmaVersion: 'latest', sourceType: 'module' });
  const walk = (node: any) => {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'CallExpression' && node.callee.type === 'Identifier' && node.callee.name === 't') {
      const properties = node.arguments.slice(1).filter((arg: any) => arg.type === 'ObjectExpression')
        .flatMap((arg: any) => arg.properties).map((property: any) => property.key?.name ?? property.key?.value);
      for (const key of literalKeys(node.arguments[0])) {
        calls++;
        for (const lng of Object.keys(bundles)) {
          for (const count of properties.includes('count') ? [0, 1, 2] : [undefined]) {
            const options = { lng, ...(count === undefined ? {} : { count }) };
            if (!i18n.exists(key, options)) problems.push(`${path.relative(ROOT, file)}: ${lng}: missing ${key}`);
            else if (!properties.includes('returnObjects') && typeof i18n.t(key, { ...options, returnObjects: true }) !== 'string') {
              problems.push(`${path.relative(ROOT, file)}: ${lng}: ${key} is an object, not a message`);
            }
          }
        }
      }
    }
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach(walk);
      else if (value && typeof value === 'object') walk(value);
    }
  };
  walk(ast);
}

// Enumerate the new finite dynamic mappings, which literal-call analysis cannot resolve.
const dynamicKeys = [
  ...Object.keys(v2En.commandKinds).map((kind) => `v2.commandKinds.${kind}`),
  ...Object.keys(v2En.watermark.positions).map((position) => `v2.watermark.positions.${position}`),
];
for (const key of dynamicKeys) {
  for (const lng of Object.keys(bundles)) if (!i18n.exists(key, { lng })) problems.push(`${lng}: missing ${key}`);
}

if (problems.length > 0) {
  for (const problem of new Set(problems)) console.error(problem);
  process.exit(1);
}
console.log(`V2 i18n checks passed: ${Object.keys(reference).length} keys in ${Object.keys(bundles).length} languages; ${calls} static references.`);
