import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useWakeLock } from '../../hooks/useWakeLock';
import { Button, CircularProgress, IconButton, Text, ThemeScope, Toolbar } from '../../m3';
import { NumberField } from '../ui/NumberField';

export interface LightboxProps {
  images: string[];
  startIndex: number;
  onClose: () => void;
  onDelete?: (index: number) => void;
  /** Restores the workflow that produced the image being viewed. */
  onReuse?: (index: number) => void;
  onIndexChange?: (index: number) => void;
}

/** An unattended slideshow lets the display sleep again after this long. */
const WAKE_LOCK_MAX_MS = 30 * 60 * 1000;
const MIN_INTERVAL = 1;
const MAX_INTERVAL = 60;
const DEFAULT_INTERVAL = 3;
const INTERVAL_KEY = 'imageLightbox.slideshowInterval';
/** In fullscreen the controls hide after this long without input. */
const IDLE_HIDE_MS = 3000;
/** The click that wakes the controls must not also close the lightbox. */
const WAKE_GRACE_MS = 400;
const TRANSITIONS = ['none', 'fade', 'slide', 'zoom', 'blur', 'ripple'] as const;
type Transition = (typeof TRANSITIONS)[number];
const TRANSITION_KEY = 'imageLightbox.slideshowTransition';
const TRANSITION_MS = 1100;

const clampIndex = (index: number, length: number) => (length <= 0 ? 0 : Math.min(Math.max(index, 0), length - 1));
const clampInterval = (value: number) => Math.min(Math.max(Math.round(value), MIN_INTERVAL), MAX_INTERVAL);

function readInterval() {
  try {
    const raw = localStorage.getItem(INTERVAL_KEY);
    const value = Number(raw);
    return raw === null || Number.isNaN(value) ? DEFAULT_INTERVAL : clampInterval(value);
  } catch {
    return DEFAULT_INTERVAL;
  }
}

function readTransition(): Transition {
  try {
    const raw = localStorage.getItem(TRANSITION_KEY);
    return (TRANSITIONS as readonly string[]).includes(raw ?? '') ? (raw as Transition) : 'none';
  } catch {
    return 'none';
  }
}

function store(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // The setting still applies for this visit.
  }
}

/**
 * Full-window image viewer: arrows and keys to browse, a slideshow with a countdown and
 * transitions, fullscreen with auto-hiding controls, and optional delete and reuse actions.
 */
export function Lightbox({ images, startIndex, onClose, onDelete, onReuse, onIndexChange }: LightboxProps) {
  const { t } = useTranslation();
  const [index, setIndex] = useState(() => clampIndex(startIndex, images.length));
  const [playing, setPlaying] = useState(false);
  const [interval, setIntervalSec] = useState(readInterval);
  const [progress, setProgress] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const [transition, setTransition] = useState<Transition>(readTransition);
  const [prevSrc, setPrevSrc] = useState<string | null>(null);
  const [idle, setIdle] = useState(false);
  const idleRef = useRef(false);
  const lastWake = useRef(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const onIndexChangeRef = useRef(onIndexChange);
  const lastSrc = useRef<string | undefined>(images[clampIndex(startIndex, images.length)]);

  useEffect(() => {
    onIndexChangeRef.current = onIndexChange;
  }, [onIndexChange]);

  useEffect(() => {
    const next = clampIndex(startIndex, images.length);
    setIndex((prev) => (prev === next ? prev : next));
  }, [images.length, startIndex]);

  useEffect(() => {
    if (images.length === 0) return;
    const next = clampIndex(index, images.length);
    if (next !== index) {
      setIndex(next);
      return;
    }
    onIndexChangeRef.current?.(next);
  }, [index, images.length]);

  useEffect(() => {
    rootRef.current?.focus();
  }, []);

  useEffect(() => {
    const sync = () => setFullscreen(document.fullscreenElement != null);
    document.addEventListener('fullscreenchange', sync);
    sync();
    return () => {
      document.removeEventListener('fullscreenchange', sync);
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    };
  }, []);

  useEffect(() => {
    if (!fullscreen) {
      idleRef.current = false;
      setIdle(false);
      return;
    }
    let timer = 0;
    const wake = () => {
      if (idleRef.current) {
        idleRef.current = false;
        lastWake.current = Date.now();
        setIdle(false);
      }
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        idleRef.current = true;
        setIdle(true);
      }, IDLE_HIDE_MS);
    };
    const events: (keyof WindowEventMap)[] = ['mousemove', 'mousedown', 'keydown', 'wheel', 'touchstart', 'touchmove'];
    events.forEach((ev) => window.addEventListener(ev, wake, { passive: true }));
    wake();
    return () => {
      window.clearTimeout(timer);
      events.forEach((ev) => window.removeEventListener(ev, wake));
    };
  }, [fullscreen]);

  // Fullscreen covers the whole document so confirmation dialogs stay visible on top.
  const toggleFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else document.documentElement.requestFullscreen().catch(() => {});
  };

  const requestDelete = (i: number) => {
    if (!onDelete) return;
    setPlaying(false);
    onDelete(i);
  };
  const requestReuse = (i: number) => {
    if (!onReuse) return;
    setPlaying(false);
    onReuse(i);
  };
  const applyInterval = (value: number) => {
    const next = clampInterval(value);
    setIntervalSec(next);
    store(INTERVAL_KEY, String(next));
  };
  const adjustInterval = (delta: number) =>
    setIntervalSec((prev) => {
      const next = clampInterval(prev + delta);
      store(INTERVAL_KEY, String(next));
      return next;
    });
  const cycleTransition = () =>
    setTransition((prev) => {
      const next = TRANSITIONS[(TRANSITIONS.indexOf(prev) + 1) % TRANSITIONS.length];
      store(TRANSITION_KEY, next);
      return next;
    });

  useEffect(() => {
    if (images.length <= 1 && playing) setPlaying(false);
  }, [images.length, playing]);

  useWakeLock(playing, WAKE_LOCK_MAX_MS);

  const currentSrc = images[clampIndex(index, images.length)];
  // The outgoing image stays underneath while the incoming one animates over it.
  useEffect(() => {
    const animating = playing && transition !== 'none';
    const prev = lastSrc.current;
    lastSrc.current = currentSrc;
    if (!animating || !prev || prev === currentSrc) {
      setPrevSrc(null);
      return;
    }
    setPrevSrc(prev);
    const timer = setTimeout(() => setPrevSrc(null), TRANSITION_MS);
    return () => clearTimeout(timer);
  }, [currentSrc, playing, transition]);

  useEffect(() => {
    if (!playing || images.length <= 1) {
      setProgress(0);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min((now - start) / 1000 / interval, 1);
      setProgress(p);
      if (p >= 1) {
        setIndex((prev) => (prev < images.length - 1 ? prev + 1 : 0));
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, interval, images.length, index]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (document.fullscreenElement) return;
        e.preventDefault();
        onClose();
        return;
      }
      if (images.length === 0) return;
      const inInput = (e.target as HTMLElement | null)?.tagName === 'INPUT';
      const current = clampIndex(index, images.length);
      if (inInput && e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      switch (e.key) {
        case 'f':
        case 'F':
          e.preventDefault();
          toggleFullscreen();
          return;
        case 'd':
        case 'D':
          if (!onDelete) return;
          e.preventDefault();
          requestDelete(current);
          return;
        case 'r':
        case 'R':
          if (!onReuse) return;
          e.preventDefault();
          requestReuse(current);
          return;
        case 'ArrowUp':
          e.preventDefault();
          adjustInterval(1);
          return;
        case 'ArrowDown':
          e.preventDefault();
          adjustInterval(-1);
          return;
        case ' ':
          e.preventDefault();
          if (images.length > 1) setPlaying((p) => !p);
          return;
        case 'ArrowLeft':
          e.preventDefault();
          setIndex((p) => (p > 0 ? p - 1 : images.length - 1));
          return;
        case 'ArrowRight':
          e.preventDefault();
          setIndex((p) => (p < images.length - 1 ? p + 1 : 0));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [images.length, onClose, onDelete, onReuse, index]);

  if (!images || images.length === 0) return null;
  const bounded = clampIndex(index, images.length);
  const stop = (e: MouseEvent) => e.stopPropagation();
  const prev = (e: MouseEvent) => {
    e.stopPropagation();
    setIndex((p) => (p > 0 ? p - 1 : images.length - 1));
  };
  const next = (e: MouseEvent) => {
    e.stopPropagation();
    setIndex((p) => (p < images.length - 1 ? p + 1 : 0));
  };

  return createPortal(
    <ThemeScope mode="dark">
      <div
        ref={rootRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        className="v2-lightbox"
        data-idle={idle ? '' : undefined}
        data-fullscreen={fullscreen ? '' : undefined}
        onClick={() => {
          if (Date.now() - lastWake.current < WAKE_GRACE_MS) return;
          onClose();
        }}
      >
        <div className="v2-lightbox__top v2-lightbox__chrome" onClick={stop}>
          {images.length > 1 && playing && (
            <>
              <div className="v2-lightbox__interval" title={`${t('projectViewer.imageLightbox.slideshowInterval')} (↑ / ↓)`}>
                <NumberField
                  aria-label={t('projectViewer.imageLightbox.slideshowInterval')}
                  min={MIN_INTERVAL}
                  max={MAX_INTERVAL}
                  integer
                  value={interval}
                  onValueChange={applyInterval}
                  suffixText={t('projectViewer.imageLightbox.seconds')}
                />
              </div>
              <Button variant="tonal" icon="auto_fix_high" onClick={cycleTransition} title={t('projectViewer.imageLightbox.transitionTitle')}>
                {t(`projectViewer.imageLightbox.transition.${transition}`)}
              </Button>
            </>
          )}
          {onReuse && <IconButton icon="refresh" label={`${t('projectViewer.album.reuseWorkflow')} (R)`} tooltip variant="tonal" onClick={() => requestReuse(bounded)} />}
          {onDelete && <IconButton icon="delete" label={`${t('projectViewer.imageLightbox.deleteImage')} (D)`} tooltip variant="tonal" className="v2-button-danger" onClick={() => requestDelete(bounded)} />}
          <IconButton
            icon={fullscreen ? 'fullscreen_exit' : 'fullscreen'}
            label={`${t(fullscreen ? 'projectViewer.imageLightbox.exitFullscreen' : 'projectViewer.imageLightbox.enterFullscreen')} (F)`}
            tooltip
            variant="tonal"
            onClick={toggleFullscreen}
          />
          <IconButton icon="close" label={`${t('projectViewer.imageLightbox.close')} (Esc)`} tooltip variant="filled" onClick={onClose} />
        </div>

        {prevSrc && <img src={prevSrc} alt="" aria-hidden className="v2-lightbox__image v2-lightbox__image--prev" />}
        <img
          key={`${currentSrc}-${playing && transition !== 'none' ? transition : 'static'}`}
          src={currentSrc}
          alt={t('projectViewer.imageLightbox.previewAlt', { index: bounded + 1 })}
          className="v2-lightbox__image"
          data-transition={playing && transition !== 'none' ? transition : undefined}
          onClick={stop}
        />

        {images.length > 1 && (
          <div className="v2-lightbox__bottom v2-lightbox__chrome" onClick={stop}>
            <div className="v2-lightbox__dock">
              <IconButton icon="chevron_left" label={`${t('projectViewer.imageLightbox.previous')} (←)`} tooltip size="sm" onClick={prev} className="m3-mirror-rtl" />
              <div className="v2-lightbox__play">
                {playing && <CircularProgress value={progress * 100} size={40} thickness={2.5} aria-hidden className="v2-lightbox__ring" />}
                <IconButton
                  icon={playing ? 'pause' : 'play_arrow'}
                  label={`${t(playing ? 'projectViewer.imageLightbox.stopSlideshow' : 'projectViewer.imageLightbox.startSlideshow')} (Space)`}
                  tooltip
                  size="sm"
                  variant="tonal"
                  shape="round"
                  shapeMorph={false}
                  onClick={(e) => {
                    e.stopPropagation();
                    setPlaying((p) => !p);
                  }}
                />
              </div>
              <span className="v2-lightbox__counter">
                {bounded + 1} / {images.length}
              </span>
              <IconButton icon="chevron_right" label={`${t('projectViewer.imageLightbox.next')} (→)`} tooltip size="sm" onClick={next} className="m3-mirror-rtl" />
            </div>
          </div>
        )}
      </div>
    </ThemeScope>,
    document.body,
  );
}
