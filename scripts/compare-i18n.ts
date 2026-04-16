import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const LOCALES_DIR = path.resolve(__dirname, '../src/locales');
const REFERENCE_FILE = 'en.json';

type LocaleData = { [key: string]: any };

function getFiles(): string[] {
  return fs.readdirSync(LOCALES_DIR).filter(file => file.endsWith('.json'));
}

function loadJson(filename: string): LocaleData {
  const filePath = path.join(LOCALES_DIR, filename);
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

function findMissingKeys(
  reference: LocaleData,
  target: LocaleData,
  prefix = ''
): string[] {
  let missing: string[] = [];

  for (const key in reference) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (!(key in target)) {
      missing.push(fullKey);
    } else if (
      typeof reference[key] === 'object' &&
      reference[key] !== null &&
      !Array.isArray(reference[key])
    ) {
      if (typeof target[key] !== 'object' || target[key] === null) {
        missing.push(fullKey);
      } else {
        missing = missing.concat(
          findMissingKeys(reference[key], target[key], fullKey)
        );
      }
    }
  }

  return missing;
}

function run() {
  const files = getFiles();
  if (!files.includes(REFERENCE_FILE)) {
    console.error(`Reference file ${REFERENCE_FILE} not found in ${LOCALES_DIR}`);
    process.exit(1);
  }

  const referenceData = loadJson(REFERENCE_FILE);
  const otherFiles = files.filter(f => f !== REFERENCE_FILE);

  let hasMissing = false;

  console.log(`Comparing against ${REFERENCE_FILE}...\n`);

  for (const file of otherFiles) {
    const targetData = loadJson(file);
    const missingKeys = findMissingKeys(referenceData, targetData);

    if (missingKeys.length > 0) {
      hasMissing = true;
      console.log(`❌ ${file}: ${missingKeys.length} missing keys`);
      missingKeys.forEach(key => console.log(`   - ${key}`));
      console.log('');
    } else {
      console.log(`✅ ${file}: No missing keys`);
    }
  }

  if (!hasMissing) {
    console.log('\nAll locale files are up to date! 🎉');
  } else {
    process.exit(1);
  }
}

run();
