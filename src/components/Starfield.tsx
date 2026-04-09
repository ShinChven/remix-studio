import React, { useEffect, useRef } from 'react';

interface Star {
  x: number;
  y: number;
  z: number;
  px: number;
  py: number;
}

export const Starfield: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let w: number;
    let h: number;
    const stars: Star[] = [];
    const count = 800;
    const speed = 5;
    const centerX = () => w / 2;

    const centerY = () => h / 2;

    const init = () => {
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = w;
      canvas.height = h;

      stars.length = 0;
      for (let i = 0; i < count; i++) {
        stars.push({
          x: Math.random() * w - centerX(),
          y: Math.random() * h - centerY(),
          z: Math.random() * w,
          px: 0,
          py: 0,
        });
      }
    };

    const draw = () => {
      ctx.clearRect(0, 0, w, h);

      stars.forEach((s) => {

        s.z -= speed;

        if (s.z <= 0) {
          s.z = w;
          s.x = Math.random() * w - centerX();
          s.y = Math.random() * h - centerY();
          s.px = 0;
          s.py = 0;
        }

        const size = (1 - s.z / w) * 3;
        const x = (s.x / s.z) * w + centerX();
        const y = (s.y / s.z) * h + centerY();

        if (s.px !== 0) {
          ctx.strokeStyle = `rgba(255, 255, 255, ${1 - s.z / w})`;
          ctx.lineWidth = size;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(s.px, s.py);
          ctx.stroke();
        }

        s.px = x;
        s.py = y;
      });

      animationFrameId = requestAnimationFrame(draw);
    };

    init();
    draw();

    const handleResize = () => {
      init();
    };

    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 z-0 pointer-events-none"
      style={{ willChange: 'transform' }}
    />


  );
};
