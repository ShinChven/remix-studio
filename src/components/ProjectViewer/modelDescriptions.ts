import { useTranslation } from 'react-i18next';

/**
 * Short explanations of the bundled models, keyed by model config `id`, from
 * the `modelDescriptions` locale block. The ids carry dots (`gpt-5.4`), which
 * i18next would read as nesting, so the block is fetched whole and indexed
 * rather than looked up one key at a time. Custom aliases have no entry.
 */
export function useModelDescriptions(): Record<string, string> {
  const { t } = useTranslation();
  const descriptions = t('modelDescriptions', { returnObjects: true });
  return descriptions && typeof descriptions === 'object' ? (descriptions as Record<string, string>) : {};
}
