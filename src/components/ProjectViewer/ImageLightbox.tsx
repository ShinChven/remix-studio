import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { X, ChevronLeft, ChevronRight, Trash2, Play, Pause, Maximize, Minimize, Wand2 } from 'lucide-react';

interface ImageLightboxProps {
  images: string[];
  startIndex: number;
  onClose: () => void;
  onDelete?: (index: number) => void;
  onIndexChange?: (index: number) => void;
}

const MIN_INTERVAL = 1;
const MAX_INTERVAL = 60;
const DEFAULT_INTERVAL = 3;
const INTERVAL_STORAGE_KEY = 'imageLightbox.slideshowInterval';

const TRANSITIONS = ['none', 'fade', 'slide', 'zoom', 'blur', 'ripple'] as const;
type Transition = typeof TRANSITIONS[number];
const TRANSITION_STORAGE_KEY = 'imageLightbox.slideshowTransition';
const TRANSITION_CLASS: Record<Transition, string> = {
  none: '',
  fade: 'animate-slideshow-fade',
  slide: 'animate-slideshow-slide',
  zoom: 'animate-slideshow-zoom',
  blur: 'animate-slideshow-blur',
  ripple: 'animate-slideshow-ripple',
};

function loadStoredTransition(): Transition {
  try {
    const raw = localStorage.getItem(TRANSITION_STORAGE_KEY);
    return (TRANSITIONS as readonly string[]).includes(raw ?? '') ? (raw as Transition) : 'none';
  } catch {
    return 'none';
  }
}

function clampIndex(index: number, length: number) {
  if (length <= 0) return 0;
  return Math.min(Math.max(index, 0), length - 1);
}

function clampInterval(value: number) {
  return Math.min(Math.max(Math.round(value), MIN_INTERVAL), MAX_INTERVAL);
}

function loadStoredInterval() {
  try {
    const raw = localStorage.getItem(INTERVAL_STORAGE_KEY);
    if (raw === null) return DEFAULT_INTERVAL;
    const value = Number(raw);
    return Number.isNaN(value) ? DEFAULT_INTERVAL : clampInterval(value);
  } catch {
    return DEFAULT_INTERVAL;
  }
}

export function ImageLightbox({ images, startIndex, onClose, onDelete, onIndexChange }: ImageLightboxProps) {
  const { t } = useTranslation();
  const [currentIndex, setCurrentIndex] = useState(() => clampIndex(startIndex, images.length));
  const [slideshowOn, setSlideshowOn] = useState(false);
  const [intervalSec, setIntervalSec] = useState(loadStoredInterval);
  const [progress, setProgress] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [transition, setTransition] = useState<Transition>(loadStoredTransition);
  const dialogRef = useRef<HTMLDivElement>(null);
  const onIndexChangeRef = useRef(onIndexChange);

  useEffect(() => {
    onIndexChangeRef.current = onIndexChange;
  }, [onIndexChange]);

  useEffect(() => {
    const nextIndex = clampIndex(startIndex, images.length);
    setCurrentIndex((prev) => (prev === nextIndex ? prev : nextIndex));
  }, [images.length, startIndex]);

  useEffect(() => {
    if (images.length === 0) return;
    const nextIndex = clampIndex(currentIndex, images.length);
    if (nextIndex !== currentIndex) {
      setCurrentIndex(nextIndex);
      return;
    }
    onIndexChangeRef.current?.(nextIndex);
  }, [currentIndex, images.length]);

  useEffect(() => {
    dialogRef.current?.focus();
  }, []);

  // Keep our fullscreen state in sync with the browser (covers Esc / F11 / OS toggles).
  useEffect(() => {
    const handleChange = () => setIsFullscreen(document.fullscreenElement != null);
    document.addEventListener('fullscreenchange', handleChange);
    handleChange();
    return () => {
      document.removeEventListener('fullscreenchange', handleChange);
      // Leave fullscreen when the lightbox unmounts.
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    };
  }, []);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      dialogRef.current?.requestFullscreen().catch(() => {});
    }
  };

  const applyInterval = (value: number) => {
    const next = clampInterval(value);
    setIntervalSec(next);
    try {
      localStorage.setItem(INTERVAL_STORAGE_KEY, String(next));
    } catch {
      // Ignore storage failures (e.g. private mode); the value still applies for this session.
    }
    return next;
  };

  const adjustInterval = (delta: number) => {
    setIntervalSec(prev => {
      const next = clampInterval(prev + delta);
      try {
        localStorage.setItem(INTERVAL_STORAGE_KEY, String(next));
      } catch {
        // Ignore storage failures (e.g. private mode).
      }
      return next;
    });
  };

  const cycleTransition = () => {
    setTransition(prev => {
      const next = TRANSITIONS[(TRANSITIONS.indexOf(prev) + 1) % TRANSITIONS.length];
      try {
        localStorage.setItem(TRANSITION_STORAGE_KEY, next);
      } catch {
        // Ignore storage failures (e.g. private mode).
      }
      return next;
    });
  };

  // A slideshow only makes sense with more than one image.
  useEffect(() => {
    if (images.length <= 1 && slideshowOn) setSlideshowOn(false);
  }, [images.length, slideshowOn]);

  // Drive the slideshow: a smooth countdown ring that advances on each cycle.
  useEffect(() => {
    if (!slideshowOn || images.length <= 1) {
      setProgress(0);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min((now - start) / 1000 / intervalSec, 1);
      setProgress(p);
      if (p >= 1) {
        // Effect re-runs on index change, restarting the countdown.
        setCurrentIndex(prev => (prev < images.length - 1 ? prev + 1 : 0));
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [slideshowOn, intervalSec, images.length, currentIndex]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // When fullscreen, let the browser exit it natively instead of closing.
        if (document.fullscreenElement) return;
        e.preventDefault();
        onClose();
        return;
      }
      if (images.length === 0) return;
      const target = e.target as HTMLElement | null;
      const inInput = target?.tagName === 'INPUT';
      if (e.key === 'f' || e.key === 'F') {
        if (inInput) return;
        e.preventDefault();
        toggleFullscreen();
        return;
      }
      if (e.key === 'd' || e.key === 'D') {
        if (inInput || !onDelete) return;
        e.preventDefault();
        // Pause the slideshow before prompting deletion.
        setSlideshowOn(false);
        onDelete(clampIndex(currentIndex, images.length));
        return;
      }
      if (e.key === 'ArrowUp') {
        if (inInput) return;
        e.preventDefault();
        adjustInterval(1);
        return;
      }
      if (e.key === 'ArrowDown') {
        if (inInput) return;
        e.preventDefault();
        adjustInterval(-1);
        return;
      }
      if (e.key === ' ' || e.code === 'Space') {
        // Don't hijack the spacebar while editing the interval field.
        if (inInput) return;
        e.preventDefault();
        if (images.length > 1) setSlideshowOn(prev => !prev);
        return;
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setCurrentIndex(prev => prev > 0 ? prev - 1 : images.length - 1);
        return;
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        setCurrentIndex(prev => prev < images.length - 1 ? prev + 1 : 0);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [images.length, onClose, onDelete, currentIndex]);

  if (!images || images.length === 0) return null;
  const boundedIndex = clampIndex(currentIndex, images.length);

  // Geometry for the circular countdown ring around the play/pause button.
  const RING_RADIUS = 18;
  const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

  const toggleSlideshow = (e: React.MouseEvent) => {
    e.stopPropagation();
    setSlideshowOn(prev => !prev);
  };

  const handleIntervalChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = Number(e.target.value);
    if (Number.isNaN(value)) return;
    applyInterval(value);
  };

  const handlePrev = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentIndex(prev => prev > 0 ? prev - 1 : images.length - 1);
  };
  
  const handleNext = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentIndex(prev => prev < images.length - 1 ? prev + 1 : 0);
  };

  return createPortal(
    <div
      ref={dialogRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[900] flex items-center justify-center bg-black/90 backdrop-blur-sm animate-in fade-in duration-300 cursor-pointer outline-none"
      onClick={onClose}
    >
      <div className="absolute top-4 right-4 flex items-center gap-2 z-10">
        {images.length > 1 && (
          <>
            {slideshowOn && (
              <div
                className="flex items-center gap-1 px-3 py-1.5 text-white/80 bg-black/50 rounded-full text-sm"
                onClick={(e) => e.stopPropagation()}
                title={`${t('projectViewer.imageLightbox.slideshowInterval')} (↑ / ↓)`}
              >
                <input
                  type="number"
                  min={MIN_INTERVAL}
                  max={MAX_INTERVAL}
                  value={intervalSec}
                  onChange={handleIntervalChange}
                  className="w-9 bg-transparent text-center text-white outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
                  aria-label={t('projectViewer.imageLightbox.slideshowInterval')}
                />
                <span className="text-white/50">{t('projectViewer.imageLightbox.seconds')}</span>
              </div>
            )}
            {slideshowOn && (
              <button
                onClick={(e) => { e.stopPropagation(); cycleTransition(); }}
                className="flex items-center gap-1.5 pl-3 pr-3.5 py-2 text-white/70 hover:text-white transition-colors bg-black/50 hover:bg-black/80 rounded-full text-sm"
                title={t('projectViewer.imageLightbox.transitionTitle')}
              >
                <Wand2 className="w-4 h-4" />
                <span>{t(`projectViewer.imageLightbox.transition.${transition}`)}</span>
              </button>
            )}
            <div className="relative w-10 h-10">
              <button
                onClick={toggleSlideshow}
                className="relative z-10 p-2 text-white/50 hover:text-white transition-colors bg-black/50 hover:bg-black/80 rounded-full"
                title={`${t(slideshowOn ? 'projectViewer.imageLightbox.stopSlideshow' : 'projectViewer.imageLightbox.startSlideshow')} (Space)`}
                aria-pressed={slideshowOn}
              >
                {slideshowOn ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6" />}
              </button>
              {slideshowOn && (
                <svg
                  className="absolute inset-0 w-full h-full -rotate-90 pointer-events-none"
                  viewBox="0 0 40 40"
                  aria-hidden="true"
                >
                  <circle
                    cx="20"
                    cy="20"
                    r={RING_RADIUS}
                    fill="none"
                    stroke="rgba(255,255,255,0.15)"
                    strokeWidth="2"
                  />
                  <circle
                    cx="20"
                    cy="20"
                    r={RING_RADIUS}
                    fill="none"
                    stroke="currentColor"
                    className="text-blue-400"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeDasharray={RING_CIRCUMFERENCE}
                    strokeDashoffset={RING_CIRCUMFERENCE * progress}
                  />
                </svg>
              )}
            </div>
          </>
        )}
        {onDelete && (
          <button 
            onClick={(e) => { e.stopPropagation(); onDelete(boundedIndex); }} 
            className="p-2 text-white/50 hover:text-red-500 transition-colors bg-black/50 hover:bg-black/80 rounded-full"
            title={`${t('projectViewer.imageLightbox.deleteImage')} (D)`}
          >
            <Trash2 className="w-6 h-6" />
          </button>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); toggleFullscreen(); }}
          className="p-2 text-white/50 hover:text-white transition-colors bg-black/50 hover:bg-black/80 rounded-full"
          title={`${t(isFullscreen ? 'projectViewer.imageLightbox.exitFullscreen' : 'projectViewer.imageLightbox.enterFullscreen')} (F)`}
          aria-pressed={isFullscreen}
        >
          {isFullscreen ? <Minimize className="w-6 h-6" /> : <Maximize className="w-6 h-6" />}
        </button>
        <button
          onClick={onClose}
          className="p-2 text-white/50 hover:text-white transition-colors bg-black/50 hover:bg-black/80 rounded-full"
          title={`${t('projectViewer.imageLightbox.close')} (Esc)`}
        >
          <X className="w-6 h-6" />
        </button>
      </div>
      
      {images.length > 1 && (
        <button onClick={handlePrev} title={`${t('projectViewer.imageLightbox.previous')} (←)`} className="absolute left-2 md:left-8 p-3 text-white/50 hover:text-white transition-colors z-10 bg-black/50 hover:bg-black/80 rounded-full">
          <ChevronLeft className="w-8 h-8" />
        </button>
      )}
      
      <img
        key={slideshowOn && transition !== 'none' ? `${boundedIndex}-${transition}` : undefined}
        src={images[boundedIndex]}
        alt={t('projectViewer.imageLightbox.previewAlt', { index: boundedIndex + 1 })}
        className={`max-w-[90vw] max-h-[90vh] object-contain select-none shadow-2xl ${slideshowOn ? TRANSITION_CLASS[transition] : ''}`}
        onClick={(e) => e.stopPropagation()}
      />
      
      {images.length > 1 && (
        <button onClick={handleNext} title={`${t('projectViewer.imageLightbox.next')} (→)`} className="absolute right-2 md:right-8 p-3 text-white/50 hover:text-white transition-colors z-10 bg-black/50 hover:bg-black/80 rounded-full">
          <ChevronRight className="w-8 h-8" />
        </button>
      )}
      
      {images.length > 1 && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 px-4 py-1.5 bg-black/50 rounded-full text-white/80 text-xs font-bold tracking-widest backdrop-blur-sm">
          {boundedIndex + 1} / {images.length}
        </div>
      )}
    </div>,
    document.body
  );
}
