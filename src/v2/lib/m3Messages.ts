import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import type { M3Messages } from '../../m3';
import type { V2Messages } from '../locales/types';

/** M3 uses its own message object; a locale tag alone only changes regional formats. */
export function m3Messages(t: TFunction): M3Messages {
  const strings = t('v2.m3', { returnObjects: true }) as V2Messages['m3'];
  return {
    ...strings,
    remove: (label) => t('v2.m3.remove', { label }),
    selectedCount: (count) => t('v2.m3.selectedCount', { count }),
    moveFailed: (label) => t('v2.m3.moveFailed', { label }),
    moved: (label, target) => t('v2.m3.moved', { label, target }),
  };
}

export function useM3Messages(): M3Messages {
  const { t } = useTranslation();
  return useMemo(() => m3Messages(t), [t]);
}
