import { useEffect, useState } from 'react';

const GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ';

/** Cycles through `texts`, resolving each one from scrambled glyphs left to right. */
export function ScrambleText({ texts, interval = 8000, className }: { texts: string[]; interval?: number; className?: string }) {
  const [index, setIndex] = useState(0);
  const [shown, setShown] = useState('');

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const target = texts[index] ?? '';
    let iteration = reduced ? target.length : 0;
    let frame = 0;
    const tick = () => {
      setShown(
        [...target]
          .map((char, i) => (i < iteration || char === ' ' ? char : GLYPHS[Math.floor(Math.random() * GLYPHS.length)]))
          .join(''),
      );
      if (iteration < target.length) {
        iteration += 0.5;
        frame = requestAnimationFrame(tick);
      }
    };
    frame = requestAnimationFrame(tick);
    const timer = setTimeout(() => setIndex((i) => (i + 1) % texts.length), interval);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(timer);
    };
  }, [index, texts, interval]);

  return (
    <span className={className} aria-live="off">
      {shown}
    </span>
  );
}
