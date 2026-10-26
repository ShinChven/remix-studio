import type { ImgHTMLAttributes } from 'react'
import type { MaterialShapeName } from '../shapes/materialShapes'
import { type ArtOptions, art } from '../utils/art'
import { cx } from '../utils/hooks'
import { shapeMaskStyle } from './List'

export interface ArtworkProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'>, ArtOptions {
  /** Numeric seed selecting palette (0-6) and deterministic layout. */
  seed?: number
  /** ViewBox width in px (default: 600). */
  width?: number
  /** ViewBox height in px (default: 400). */
  height?: number
  /** CSS aspect ratio, e.g. '16 / 9', '4 / 3', '1 / 1'. Defaults to `${width} / ${height}`. */
  aspectRatio?: string
  /**
   * Layout style:
   * - `flush`: square corners, edge-to-edge
   * - `rounded`: rounded container corners
   * - `inset`: padded container
   */
  layout?: 'flush' | 'rounded' | 'inset'
  /** Optional Material Shape clip mask for expressive artistic framing. */
  shape?: MaterialShapeName
}

/**
 * Artwork (M3 Expressive generative artwork):
 * Deterministic abstract illustrations rendered as self-contained vector SVGs.
 * Supports smooth, continuous organic drifting animation without network assets or video.
 */
export function Artwork({
  seed = 0,
  width = 600,
  height = 400,
  animated = true,
  speed = 1,
  aspectRatio,
  layout = 'flush',
  shape,
  alt = '',
  className,
  style,
  ...rest
}: ArtworkProps) {
  const uri = art(seed, width, height, { animated, speed })

  return (
    <img
      loading="lazy"
      decoding="async"
      {...rest}
      src={uri}
      alt={alt}
      className={cx('m3-artwork', className)}
      data-layout={layout}
      data-shape={shape}
      style={{
        display: 'block',
        width: '100%',
        height: 'auto',
        aspectRatio: aspectRatio ?? `${width} / ${height}`,
        objectFit: 'cover',
        ...shapeMaskStyle(shape),
        ...style,
      }}
    />
  )
}
