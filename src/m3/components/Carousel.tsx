import { type CSSProperties, type ReactNode, useCallback, useEffect, useRef } from 'react'
import { useM3Locale } from '../i18n/locale'
import { cx, useIsoLayoutEffect, useStableId } from '../utils/hooks'
import { useLinkComponent } from '../utils/link'
import { IconButton } from './Button'
import { Ripple } from './Ripple'

export interface CarouselItem {
  /** Unique key of the item. */
  key: string
  /** Image URL. Use `content` for custom slides. */
  src?: string
  /** Alt text of the image. Leave it empty when the image is decorative. */
  alt?: string
  /** Custom slide content, used instead of `src`. */
  content?: ReactNode
  /** Text shown over the image (bottom start). */
  label?: ReactNode
  /** Makes the item a button. */
  onClick?: () => void
  /** Makes the item a link (through `LinkProvider`). */
  href?: string
}

export type CarouselLayout = 'multi-browse' | 'uncontained' | 'hero' | 'full-screen'

export interface CarouselProps {
  /** Items in display order. */
  items: CarouselItem[]
  /** M3 layout: `multi-browse`, `uncontained`, `hero` or `full-screen`. */
  layout?: CarouselLayout
  /** Width of a large item in px (multi-browse, uncontained). */
  itemWidth?: number
  /** Height in px. Ignored by full-screen. */
  height?: number
  /** Show previous/next buttons. */
  controls?: boolean
  /** Extra class on the carousel element. */
  className?: string
  /** Accessible name of the carousel. */
  'aria-label': string
}

/** Carousel with rounded edge masking (M3 carousel layouts). */
export function Carousel({
  items,
  layout = 'multi-browse',
  itemWidth = 260,
  height = 220,
  controls = false,
  className,
  'aria-label': ariaLabel,
}: CarouselProps) {
  const { messages } = useM3Locale()
  const Link = useLinkComponent()
  const scrollRef = useRef<HTMLUListElement>(null)
  const id = useStableId('m3-carousel')

  // Clip each item to its visible part with rounded corners, so edge items shrink smoothly.
  const updateMasks = useCallback(() => {
    const scroller = scrollRef.current
    if (!scroller) return
    const view = scroller.getBoundingClientRect()
    for (const el of scroller.querySelectorAll<HTMLElement>('.m3-carousel__item')) {
      const rect = el.getBoundingClientRect()
      const left = Math.max(0, view.left - rect.left)
      const right = Math.max(0, rect.right - view.right)
      const visible = rect.width - left - right
      el.style.setProperty('--_clip-left', `${Math.min(left, rect.width)}px`)
      el.style.setProperty('--_clip-right', `${Math.min(right, rect.width)}px`)
      el.style.setProperty('--_fade', String(Math.min(1, Math.max(0, (visible - 40) / 80))))
    }
  }, [])

  // New items or item widths change which items sit at the edges.
  useIsoLayoutEffect(() => {
    updateMasks()
  }, [updateMasks, items, itemWidth, layout, height])

  useEffect(() => {
    const scroller = scrollRef.current
    if (!scroller) return
    let frame = 0
    const onScroll = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(updateMasks)
    }
    updateMasks()
    scroller.addEventListener('scroll', onScroll, { passive: true })
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(onScroll) : undefined
    ro?.observe(scroller)
    return () => {
      cancelAnimationFrame(frame)
      scroller.removeEventListener('scroll', onScroll)
      ro?.disconnect()
    }
  }, [updateMasks])

  const scrollByItem = (direction: 1 | -1) => {
    const scroller = scrollRef.current
    if (!scroller) return
    const first = scroller.querySelector<HTMLElement>('.m3-carousel__item')
    const rtl = getComputedStyle(scroller).direction === 'rtl'
    const step = (first?.offsetWidth ?? itemWidth) + 8
    scroller.scrollBy({ left: direction * step * (rtl ? -1 : 1), behavior: 'smooth' })
  }

  return (
    <section
      className={cx('m3-carousel', className)}
      data-layout={layout}
      aria-roledescription="carousel"
      aria-label={ariaLabel}
      style={{ '--_item': `${itemWidth}px`, '--_height': `${height}px` } as CSSProperties}
    >
      <ul ref={scrollRef} id={id} className="m3-carousel__scroller">
        {items.map((item, index) => {
          const body = (
            <>
              {item.src && (
                <img
                  src={item.src}
                  alt={item.alt ?? ''}
                  loading="lazy"
                  decoding="async"
                  draggable={false}
                />
              )}
              {item.content}
              {item.label && <span className="m3-carousel__label">{item.label}</span>}
            </>
          )
          return (
            <li
              key={item.key}
              className="m3-carousel__item"
              aria-roledescription="slide"
              aria-label={`${index + 1} / ${items.length}`}
            >
              <div className="m3-carousel__mask">
                {item.href ? (
                  <Link href={item.href} className="m3-carousel__action m3-focus-ring">
                    <Ripple />
                    {body}
                  </Link>
                ) : item.onClick ? (
                  <button
                    type="button"
                    className="m3-carousel__action m3-focus-ring"
                    onClick={item.onClick}
                  >
                    <Ripple />
                    {body}
                  </button>
                ) : (
                  body
                )}
              </div>
            </li>
          )
        })}
      </ul>
      {controls && (
        <div className="m3-carousel__controls">
          <IconButton
            icon="chevron_left"
            label={messages.previousItem}
            aria-controls={id}
            onClick={() => scrollByItem(-1)}
            className="m3-mirror-rtl"
          />
          <IconButton
            icon="chevron_right"
            label={messages.nextItem}
            aria-controls={id}
            onClick={() => scrollByItem(1)}
            className="m3-mirror-rtl"
          />
        </div>
      )}
    </section>
  )
}
