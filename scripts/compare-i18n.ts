import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const LOCALES_DIR = path.resolve(__dirname, '../src/locales');
const REFERENCE_LOCALE = 'en';

type LocaleData = { [key: string]: any };

function getLocales(): string[] {
  return fs
    .readdirSync(LOCALES_DIR, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
    .sort();
}

function getLocaleFiles(locale: string): string[] {
  const localeDir = path.join(LOCALES_DIR, locale);
  return fs
    .readdirSync(localeDir)
    .filter(file => file.endsWith('.json'))
    .sort();
}

function loadLocale(locale: string): LocaleData {
  const localeDir = path.join(LOCALES_DIR, locale);
  const files = getLocaleFiles(locale);
  const localeData: LocaleData = {};

  for (const file of files) {
    const filePath = path.join(localeDir, file);
    const chunk = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

    for (const key of Object.keys(chunk)) {
      if (key in localeData) {
        throw new Error(`Duplicate key "${key}" in ${locale}/${file}`);
      }
    }

    Object.assign(localeData, chunk);
  }

  return localeData;
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
  const locales = getLocales();
  if (!locales.includes(REFERENCE_LOCALE)) {
    console.error(`Reference locale ${REFERENCE_LOCALE} not found in ${LOCALES_DIR}`);
    process.exit(1);
  }

  const referenceData = loadLocale(REFERENCE_LOCALE);
  const referenceFiles = getLocaleFiles(REFERENCE_LOCALE);
  const otherLocales = locales.filter(locale => locale !== REFERENCE_LOCALE);

  let hasMissing = false;

  console.log(`Comparing against ${REFERENCE_LOCALE}/...\n`);

  for (const locale of otherLocales) {
    const targetFiles = getLocaleFiles(locale);
    const missingFiles = referenceFiles.filter(file => !targetFiles.includes(file));
    const extraFiles = targetFiles.filter(file => !referenceFiles.includes(file));
    const targetData = loadLocale(locale);
    const missingKeys = findMissingKeys(referenceData, targetData);
    const hasChunkIssues = missingFiles.length > 0 || extraFiles.length > 0;

    if (missingFiles.length > 0) {
      hasMissing = true;
      console.log(`❌ ${locale}: ${missingFiles.length} missing locale chunks`);
      missingFiles.forEach(file => console.log(`   - ${file}`));
      console.log('');
    }

    if (extraFiles.length > 0) {
      hasMissing = true;
      console.log(`❌ ${locale}: ${extraFiles.length} extra locale chunks`);
      extraFiles.forEach(file => console.log(`   - ${file}`));
      console.log('');
    }

    if (missingKeys.length > 0) {
      hasMissing = true;
      console.log(`❌ ${locale}: ${missingKeys.length} missing keys`);
      missingKeys.forEach(key => console.log(`   - ${key}`));
      console.log('');
    } else if (!hasChunkIssues) {
      console.log(`✅ ${locale}: No missing keys`);
    }
  }

  if (!hasMissing) {
    console.log('\nAll locale files are up to date! 🎉');
  } else {
    process.exit(1);
  }
}

run();
