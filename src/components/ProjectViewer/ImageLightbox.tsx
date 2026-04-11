import React, { useState, useEffect } from 'react';
import { X, ChevronLeft, ChevronRight, Trash2 } from 'lucide-react';

interface ImageLightboxProps {
  images: string[];
  startIndex: number;
  onClose: () => void;
  onDelete?: (index: number) => void;
}

export function ImageLightbox({ images, startIndex, onClose, onDelete }: ImageLightboxProps) {
  const [currentIndex, setCurrentIndex] = useState(startIndex);
  
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') setCurrentIndex(prev => prev > 0 ? prev - 1 : images.length - 1);
      if (e.key === 'ArrowRight') setCurrentIndex(prev => prev < images.length - 1 ? prev + 1 : 0);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [images.length, onClose]);

  if (!images || images.length === 0) return null;

  const handlePrev = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentIndex(prev => prev > 0 ? prev - 1 : images.length - 1);
  };
  
  const handleNext = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentIndex(prev => prev < images.length - 1 ? prev + 1 : 0);
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/90 backdrop-blur-sm animate-in fade-in duration-300 cursor-pointer" onClick={onClose}>
      <div className="absolute top-4 right-4 flex items-center gap-2 z-10">
        {onDelete && (
          <button 
            onClick={(e) => { e.stopPropagation(); onDelete(currentIndex); }} 
            className="p-2 text-white/50 hover:text-red-500 transition-colors bg-black/50 hover:bg-black/80 rounded-full"
            title="Delete Image"
          >
            <Trash2 className="w-6 h-6" />
          </button>
        )}
        <button onClick={onClose} className="p-2 text-white/50 hover:text-white transition-colors bg-black/50 hover:bg-black/80 rounded-full">
          <X className="w-6 h-6" />
        </button>
      </div>
      
      {images.length > 1 && (
        <button onClick={handlePrev} className="absolute left-2 md:left-8 p-3 text-white/50 hover:text-white transition-colors z-10 bg-black/50 hover:bg-black/80 rounded-full">
          <ChevronLeft className="w-8 h-8" />
        </button>
      )}
      
      <img 
        src={images[currentIndex]} 
        alt={`Preview ${currentIndex + 1}`} 
        className="max-w-[90vw] max-h-[90vh] object-contain select-none shadow-2xl"
        onClick={(e) => e.stopPropagation()} 
      />
      
      {images.length > 1 && (
        <button onClick={handleNext} className="absolute right-2 md:right-8 p-3 text-white/50 hover:text-white transition-colors z-10 bg-black/50 hover:bg-black/80 rounded-full">
          <ChevronRight className="w-8 h-8" />
        </button>
      )}
      
      {images.length > 1 && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 px-4 py-1.5 bg-black/50 rounded-full text-white/80 text-xs font-bold tracking-widest backdrop-blur-sm">
          {currentIndex + 1} / {images.length}
        </div>
      )}
    </div>
  );
}
