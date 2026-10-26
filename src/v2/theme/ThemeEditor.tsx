import { useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  ButtonGroup,
  Icon,
  IconButton,
  Shape,
  SideSheet,
  Slider,
  Switch,
  Text,
  ThemeBuilder,
  THEME_BUILDER_PRESETS,
  useSnackbar,
  useTheme,
  type MaterialShapeName,
} from '../../m3';
import { DEFAULT_SEED, DEFAULT_UI_PREFS, seedFromImageFile, useUiPrefs } from './prefs';

const PRESETS = [DEFAULT_SEED, ...THEME_BUILDER_PRESETS.filter((c) => c.toLowerCase() !== DEFAULT_SEED.toLowerCase())].slice(0, 8);
const PREVIEW_SHAPES: MaterialShapeName[] = ['cookie-9', 'clover-4', 'sunny', 'soft-burst', 'flower', 'puffy'];

const SWATCHES: Array<{ role: string; on: string }> = [
  { role: 'primary', on: 'on-primary' },
  { role: 'primary-container', on: 'on-primary-container' },
  { role: 'secondary', on: 'on-secondary' },
  { role: 'secondary-container', on: 'on-secondary-container' },
  { role: 'tertiary', on: 'on-tertiary' },
  { role: 'tertiary-container', on: 'on-tertiary-container' },
  { role: 'error', on: 'on-error' },
  { role: 'error-container', on: 'on-error-container' },
  { role: 'surface-container-lowest', on: 'on-surface' },
  { role: 'surface-container', on: 'on-surface' },
  { role: 'surface-container-highest', on: 'on-surface' },
  { role: 'inverse-surface', on: 'inverse-on-surface' },
];

function Section({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <Text variant="title-small" emphasized className="text-on-surface-variant">
          {title}
        </Text>
        {action}
      </div>
      {children}
    </section>
  );
}

/** The appearance panel: color scheme, mode, motion, density, shape and type scale. */
export function ThemeEditor({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const prefs = useUiPrefs();
  const snackbar = useSnackbar();
  const fileRef = useRef<HTMLInputElement>(null);
  const [shapeIndex, setShapeIndex] = useState(0);
  const [extracting, setExtracting] = useState(false);

  const pickImage = async (file: File | undefined) => {
    if (!file) return;
    setExtracting(true);
    try {
      const seed = await seedFromImageFile(file);
      theme.setConfig({ seed });
      snackbar.show(t('v2.theme.seedFromImageDone', { seed }));
    } catch {
      snackbar.show(t('v2.theme.seedFromImageFailed'));
    } finally {
      setExtracting(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const resetAll = () => {
    theme.reset();
    prefs.resetPrefs();
  };

  return (
    <SideSheet
      open={open}
      onClose={onClose}
      modal
      width={420}
      headline={t('v2.theme.title')}
      actions={
        <>
          <Button variant="text" icon="restart_alt" onClick={resetAll}>
            {t('v2.theme.resetAll')}
          </Button>
          <Button variant="filled" onClick={onClose}>
            {t('v2.common.done')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-7 pb-4">
        <button
          type="button"
          className="v2-theme-hero m3-focus-ring"
          onClick={() => setShapeIndex((i) => (i + 1) % PREVIEW_SHAPES.length)}
          aria-label={t('v2.theme.previewShape')}
        >
          <Shape name={PREVIEW_SHAPES[shapeIndex]} size={88} className="v2-theme-hero__shape" />
          <div className="flex min-w-0 flex-col items-start gap-1 text-start">
            <Text variant="headline-small" emphasized>
              Remix Studio
            </Text>
            <Text variant="body-medium" className="opacity-80">
              {t('v2.theme.heroCaption')}
            </Text>
            <div className="mt-2 flex gap-2">
              <span className="v2-theme-hero__dot bg-primary" />
              <span className="v2-theme-hero__dot bg-secondary" />
              <span className="v2-theme-hero__dot bg-tertiary" />
              <span className="v2-theme-hero__dot bg-success" />
              <span className="v2-theme-hero__dot bg-warning" />
              <span className="v2-theme-hero__dot bg-error" />
            </div>
          </div>
        </button>

        <ThemeBuilder
          variant="plain"
          presets={PRESETS}
          showReset={false}
          labels={{
            seed: t('v2.theme.seed'),
            seedHexAriaLabel: t('v2.theme.seedHex'),
            seedHexErrorText: t('v2.theme.seedHexError'),
            customSeedTitle: t('v2.theme.customSeed'),
            customSeedAriaLabel: t('v2.theme.customSeed'),
            variant: t('v2.theme.variant'),
            variantAriaLabel: t('v2.theme.variant'),
            mode: t('v2.theme.mode'),
            modeAriaLabel: t('v2.theme.mode'),
            modeLight: t('account.preferences.light'),
            modeDark: t('account.preferences.dark'),
            modeSystem: t('account.preferences.system'),
            motion: t('v2.theme.motion'),
            motionAriaLabel: t('v2.theme.motion'),
            motionExpressive: t('v2.theme.motionExpressive'),
            motionStandard: t('v2.theme.motionStandard'),
            contrast: t('v2.theme.contrast'),
            contrastAriaLabel: t('v2.theme.contrast'),
            followSystemContrast: t('v2.theme.followSystem'),
          }}
        />

        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => void pickImage(e.target.files?.[0])}
          />
          <Button variant="tonal" icon="wallpaper" loading={extracting} onClick={() => fileRef.current?.click()}>
            {t('v2.theme.seedFromImage')}
          </Button>
          <Button variant="text" icon="refresh" onClick={() => theme.setConfig({ seed: DEFAULT_SEED })}>
            {t('v2.theme.brandSeed')}
          </Button>
        </div>

        <Section title={t('v2.theme.density')}>
          <ButtonGroup
            variant="connected"
            selection="single"
            fullWidth
            aria-label={t('v2.theme.density')}
            value={prefs.density}
            onChange={(value) => value && prefs.setPrefs({ density: value as 'comfortable' | 'compact' })}
          >
            <Button variant="tonal" value="comfortable" icon="density_medium">
              {t('v2.theme.densityComfortable')}
            </Button>
            <Button variant="tonal" value="compact" icon="density_small">
              {t('v2.theme.densityCompact')}
            </Button>
          </ButtonGroup>
          <Text variant="body-small" className="text-on-surface-variant">
            {t('v2.theme.densityHint')}
          </Text>
        </Section>

        <Section title={t('v2.theme.effects')}>
          <Switch
            label={t('account.preferences.glass')}
            supportingText={t('account.preferences.glassDescription')}
            checked={prefs.glass}
            onChange={(e) => prefs.setPrefs({ glass: e.target.checked })}
          />
          <Switch
            label={t('account.preferences.motion')}
            supportingText={t('account.preferences.motionDescription')}
            checked={prefs.motion}
            onChange={(e) => prefs.setPrefs({ motion: e.target.checked })}
          />
        </Section>

        <Section title={`${t('v2.theme.corners')} · ${Math.round(prefs.cornerScale * 100)}%`}>
          <div className="flex items-center gap-3">
            <Icon name="crop_square" className="text-on-surface-variant" />
            <Slider
              aria-label={t('v2.theme.corners')}
              min={0}
              max={1.5}
              step={0.25}
              stops
              value={prefs.cornerScale}
              onChange={(v) => prefs.setPrefs({ cornerScale: v })}
              className="flex-1"
            />
            <Icon name="circle" className="text-on-surface-variant" />
          </div>
        </Section>

        <Section title={`${t('v2.theme.textSize')} · ${Math.round(prefs.fontScale * 100)}%`}>
          <div className="flex items-center gap-3">
            <Icon name="text_decrease" className="text-on-surface-variant" />
            <Slider
              aria-label={t('v2.theme.textSize')}
              min={0.875}
              max={1.125}
              step={0.0625}
              stops
              value={prefs.fontScale}
              onChange={(v) => prefs.setPrefs({ fontScale: v })}
              className="flex-1"
            />
            <Icon name="text_increase" className="text-on-surface-variant" />
          </div>
        </Section>

        <Section
          title={t('v2.theme.statusColors')}
          action={
            <IconButton
              icon="restart_alt"
              label={t('v2.theme.resetStatusColors')}
              tooltip
              size="xs"
              onClick={() => prefs.setPrefs({ successSeed: DEFAULT_UI_PREFS.successSeed, warningSeed: DEFAULT_UI_PREFS.warningSeed })}
            />
          }
        >
          <div className="grid grid-cols-2 gap-3">
            {(
              [
                ['successSeed', 'v2.theme.success', 'bg-success-container text-on-success-container'],
                ['warningSeed', 'v2.theme.warning', 'bg-warning-container text-on-warning-container'],
              ] as const
            ).map(([key, label, cls]) => (
              <label key={key} className={`v2-color-chip ${cls}`}>
                <input
                  type="color"
                  value={prefs[key]}
                  onChange={(e) => prefs.setPrefs({ [key]: e.target.value })}
                  aria-label={t(label)}
                />
                <span className="m3-typescale-label-large">{t(label)}</span>
              </label>
            ))}
          </div>
        </Section>

        <Section title={t('v2.theme.palette')}>
          <div className="grid grid-cols-3 gap-2">
            {SWATCHES.map((s) => (
              <div
                key={s.role}
                className="v2-swatch"
                style={{ background: `var(--md-sys-color-${s.role})`, color: `var(--md-sys-color-${s.on})` }}
                title={s.role}
              >
                <span className="m3-typescale-label-small">{s.role.replace('surface-container', 'surface')}</span>
              </div>
            ))}
          </div>
        </Section>
      </div>
    </SideSheet>
  );
}
