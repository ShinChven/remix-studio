import React, { useState, useEffect } from 'react';

const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ';

export const MatrixText = ({ texts, interval = 4000 }: { texts: string[], interval?: number }) => {
  const [textIndex, setTextIndex] = useState(0);
  const [displayText, setDisplayText] = useState('');
  
  useEffect(() => {
    let iteration = 0;
    const targetText = texts[textIndex];
    let animationFrame: number;
    
    const animate = () => {
      setDisplayText((current) => {
        return targetText
          .split('')
          .map((char, index) => {
            if (index < iteration) {
              return targetText[index];
            }
            // Keep spaces as spaces to avoid changing word lengths drastically
            if (char === ' ') return ' ';
            return CHARS[Math.floor(Math.random() * CHARS.length)];
          })
          .join('');
      });
      
      if (iteration < targetText.length) {
        iteration += 1 / 2; // Adjust speed here, higher fraction = faster
        animationFrame = requestAnimationFrame(animate);
      }
    };
    
    animationFrame = requestAnimationFrame(animate);
    
    const timer = setTimeout(() => {
      setTextIndex((prev) => (prev + 1) % texts.length);
    }, interval);
    
    return () => {
      cancelAnimationFrame(animationFrame);
      clearTimeout(timer);
    };
  }, [textIndex, texts, interval]);

  return <span className="font-mono tracking-tight">{displayText}</span>;
};
