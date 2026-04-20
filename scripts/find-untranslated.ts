import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const localesDir = path.join(__dirname, '../src/locales');
const en = JSON.parse(fs.readFileSync(path.join(localesDir, 'en.json'), 'utf-8'));
const files = ['fr.json', 'ja.json', 'ko.json', 'zh-CN.json', 'zh-TW.json'];

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

for (const file of files) {
  const target = JSON.parse(fs.readFileSync(path.join(localesDir, file), 'utf-8'));
  const issues = findEnglishValues(en, target);
  console.log(`\n--- ${file} (${issues.length} keys with potential English values) ---`);
  console.log(issues.slice(0, 20).join(', ') + (issues.length > 20 ? '...' : ''));
}
