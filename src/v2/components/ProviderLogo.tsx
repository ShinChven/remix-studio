import type { ComponentType } from 'react';
import { SiAlibabacloud, SiAnthropic, SiBytedance, SiGooglecloud, SiGooglegemini, SiMinimax, SiReplicate, SiX } from 'react-icons/si';
import { cx } from '../../m3';
import type { ProviderType } from '../../types';

const BRAND: Partial<Record<ProviderType, ComponentType<{ size?: number; className?: string }>>> = {
  GoogleAI: SiGooglegemini,
  VertexAI: SiGooglecloud,
  Claude: SiAnthropic,
  Grok: SiX,
  BytePlus: SiBytedance,
  Alibabacloud: SiAlibabacloud,
  Replicate: SiReplicate,
  MiniMax: SiMinimax,
};

const MONOGRAM: Partial<Record<ProviderType, string>> = {
  OpenAI: 'AI',
  RunningHub: 'RH',
  KlingAI: 'K',
  BlackForestLabs: 'BFL',
  Kimi: 'Ki',
  Civitai: 'C',
};

/** The letters that stand in for a provider without a brand mark, or null when it has one. */
export function providerMonogram(type: ProviderType | string): string | null {
  return BRAND[type as ProviderType] ? null : (MONOGRAM[type as ProviderType] ?? String(type).slice(0, 2));
}

/** A provider's brand mark, or a monogram where no mark is available. */
export function ProviderLogo({ type, size = 20, className }: { type: ProviderType | string; size?: number; className?: string }) {
  const Brand = BRAND[type as ProviderType];
  if (Brand) return <Brand size={size} className={cx('v2-provider-logo', className)} />;
  const text = providerMonogram(type) ?? '';
  return (
    <span
      className={cx('v2-provider-logo v2-provider-monogram', className)}
      style={{ width: size, height: size, fontSize: Math.max(8, size * (text.length > 2 ? 0.36 : 0.5)) }}
      aria-hidden
    >
      {text}
    </span>
  );
}
