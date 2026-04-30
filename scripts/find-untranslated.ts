import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const localesDir = path.join(__dirname, '../src/locales');
const locales = ['fr', 'ja', 'ko', 'zh-CN', 'zh-TW'];

function loadLocale(locale: string): Record<string, any> {
  const localeDir = path.join(localesDir, locale);
  const data: Record<string, any> = {};

  for (const file of fs.readdirSync(localeDir).filter(file => file.endsWith('.json'))) {
    const chunk = JSON.parse(fs.readFileSync(path.join(localeDir, file), 'utf-8'));
    Object.assign(data, chunk);
  }

  return data;
}

const en = loadLocale('en');

function findEnglishValues(enObj: any, targetObj: any, path: string = ''): string[] {
  let issues: string[] = [];
  for (const key in enObj) {
    const currentPath = path ? `${path}.${key}` : key;
    if (typeof enObj[key] === 'object' && enObj[key] !== null) {
      if (targetObj[key]) {
        issues = issues.concat(findEnglishValues(enObj[key], targetObj[key], currentPath));
      }
    } else {
      if (targetObj[key] === enObj[key]) {
        // Exclude specific words that are likely to be the same
        const val = enObj[key];
        const skipWords = ['ID', 'API', 'URI', 'MCP', 'Google', 'Remix Studio', '{{count}}', '{{used}}', '{{limit}}'];
        const isSkipWord = skipWords.includes(val) || (typeof val === 'string' && val.length < 3);
        if (!isSkipWord) {
          issues.push(currentPath);
        }
      }
    }
  }
  return issues;
}

for (const locale of locales) {
  const target = loadLocale(locale);
  const issues = findEnglishValues(en, target);
  console.log(`\n--- ${locale} (${issues.length} keys with potential English values) ---`);
  console.log(issues.slice(0, 20).join(', ') + (issues.length > 20 ? '...' : ''));
}
