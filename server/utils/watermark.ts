import sharp from 'sharp';
import { z } from 'zod';

const WATERMARK_BASE_SHORT_EDGE = 1080;
const WATERMARK_JPEG_QUALITY = 90;

export const postWatermarkPositions = [
  'top',
  'bottom',
  'left',
  'right',
  'center',
  'top_left',
  'top_right',
  'bottom_left',
  'bottom_right',
] as const;

export type PostWatermarkPosition = typeof postWatermarkPositions[number];

export type PostWatermarkConfig = {
  enabled: boolean;
  text: string;
  position: PostWatermarkPosition;
  padding: number;
  fontSize: number;
  opacity: number;
  color: string;
};

export const DEFAULT_POST_WATERMARK_SETTING: PostWatermarkConfig = {
  enabled: false,
  text: '',
  position: 'center',
  padding: 32,
  fontSize: 48,
  opacity: 0.35,
  color: '#ffffff',
};

export const postWatermarkSettingSchema = z.object({
  enabled: z.boolean().optional(),
  text: z.string().max(200).optional(),
  position: z.enum(postWatermarkPositions).optional(),
  padding: z.number().int().min(0).max(512).optional(),
  fontSize: z.number().int().min(8).max(256).optional(),
  opacity: z.number().min(0).max(1).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
});

export function serializePostWatermarkSetting(setting: any): PostWatermarkConfig & { id?: string; userId?: string } {
  return {
    id: setting.id,
    userId: setting.userId,
    enabled: Boolean(setting.enabled),
    text: setting.text || '',
    position: postWatermarkPositions.includes(setting.position) ? setting.position : DEFAULT_POST_WATERMARK_SETTING.position,
    padding: Number.isFinite(setting.padding) ? setting.padding : DEFAULT_POST_WATERMARK_SETTING.padding,
    fontSize: Number.isFinite(setting.fontSize) ? setting.fontSize : DEFAULT_POST_WATERMARK_SETTING.fontSize,
    opacity: Number.isFinite(setting.opacity) ? setting.opacity : DEFAULT_POST_WATERMARK_SETTING.opacity,
    color: /^#[0-9a-fA-F]{6}$/.test(setting.color || '') ? setting.color : DEFAULT_POST_WATERMARK_SETTING.color,
  };
}

export function normalizePostWatermarkPayload(setting: z.infer<typeof postWatermarkSettingSchema>): PostWatermarkConfig {
  return serializePostWatermarkSetting({ ...DEFAULT_POST_WATERMARK_SETTING, ...setting });
}

function escapeSvgText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function getWatermarkPoint(
  position: PostWatermarkPosition,
  width: number,
  height: number,
  padding: number,
  fontSize: number,
) {
  const topY = padding + (fontSize / 2);
  const bottomY = height - padding - (fontSize / 2);
  switch (position) {
    case 'top':
      return { x: width / 2, y: topY, anchor: 'middle' };
    case 'bottom':
      return { x: width / 2, y: bottomY, anchor: 'middle' };
    case 'left':
      return { x: padding, y: height / 2, anchor: 'start' };
    case 'right':
      return { x: width - padding, y: height / 2, anchor: 'end' };
    case 'top_left':
      return { x: padding, y: topY, anchor: 'start' };
    case 'top_right':
      return { x: width - padding, y: topY, anchor: 'end' };
    case 'bottom_left':
      return { x: padding, y: bottomY, anchor: 'start' };
    case 'bottom_right':
      return { x: width - padding, y: bottomY, anchor: 'end' };
    case 'center':
    default:
      return { x: width / 2, y: height / 2, anchor: 'middle' };
  }
}

function getScaledWatermarkMetrics(width: number, height: number, setting: PostWatermarkConfig) {
  const shortEdge = Math.min(width, height);
  const scale = shortEdge / WATERMARK_BASE_SHORT_EDGE;
  const fontSize = Math.max(1, Math.min(setting.fontSize * scale, shortEdge * 0.5));
  const padding = Math.max(0, Math.min(setting.padding * scale, shortEdge / 2));
  return { fontSize, padding };
}

export async function applyPostWatermark(buffer: Buffer, setting?: PostWatermarkConfig | null): Promise<Buffer> {
  const text = setting?.text?.trim();
  if (!setting?.enabled || !text) return buffer;

  const image = sharp(buffer);
  const metadata = await image.metadata();
  const width = metadata.width || 0;
  const height = metadata.height || 0;
  if (!width || !height) return buffer;

  const { padding, fontSize } = getScaledWatermarkMetrics(width, height, setting);
  const point = getWatermarkPoint(setting.position, width, height, padding, fontSize);
  const svg = `
    <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
      <text
        x="${point.x}"
        y="${point.y}"
        text-anchor="${point.anchor}"
        dominant-baseline="middle"
        font-family="Arial, Helvetica, sans-serif"
        font-size="${fontSize}"
        font-weight="700"
        fill="${setting.color}"
        fill-opacity="${setting.opacity}"
      >${escapeSvgText(text)}</text>
    </svg>`;

  return sharp(buffer)
    .composite([{ input: Buffer.from(svg), blend: 'over' }])
    .jpeg({ quality: WATERMARK_JPEG_QUALITY })
    .toBuffer();
}
