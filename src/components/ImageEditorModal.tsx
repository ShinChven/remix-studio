import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Crop as CropIcon, PenTool, X, Loader2, Check, RotateCcw } from 'lucide-react';
import ReactCrop, { type Crop, type PixelCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';

interface ImageEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (base64: string) => Promise<void>;
  imageUrl: string;
}

interface Path {
  color: string;
  width: number;
  points: { x: number; y: number }[];
}

export function ImageEditorModal({ isOpen, onClose, onSave, imageUrl }: ImageEditorModalProps) {
  const { t } = useTranslation();
  const [isLoading, setIsLoading] = useState(false);
  const [mode, setMode] = useState<'crop' | 'draw'>('crop');
  const [currentImageUrl, setCurrentImageUrl] = useState(imageUrl);
  
  const [crop, setCrop] = useState<Crop>();
  const [completedCrop, setCompletedCrop] = useState<PixelCrop>();
  
  const imgRef = useRef<HTMLImageElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const [paths, setPaths] = useState<Path[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawColor, setDrawColor] = useState('#ef4444');
  const [drawWidth, setDrawWidth] = useState(4);

  useEffect(() => {
    if (isOpen) {
      setMode('crop');
      setCrop(undefined);
      setCompletedCrop(undefined);
      setPaths([]);
      setCurrentImageUrl(imageUrl);
    }
  }, [isOpen, imageUrl]);

  const redrawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    paths.forEach(path => {
      if (path.points.length < 2) return;
      ctx.beginPath();
      ctx.strokeStyle = path.color;
      ctx.lineWidth = path.width;
      ctx.moveTo(path.points[0].x, path.points[0].y);
      for (let i = 1; i < path.points.length; i++) {
        ctx.lineTo(path.points[i].x, path.points[i].y);
      }
      ctx.stroke();
    });
  }, [paths]);

  useEffect(() => {
    redrawCanvas();
  }, [redrawCanvas]);

  const onImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const { width, height } = e.currentTarget;
    if (canvasRef.current) {
      canvasRef.current.width = width;
      canvasRef.current.height = height;
    }
    redrawCanvas();
  };

  const getCoordinates = (e: React.MouseEvent | React.TouchEvent | MouseEvent | TouchEvent) => {
    if (!canvasRef.current) return null;
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    
    // Calculate scale in case the image is rendered at a different size than its natural size
    // Note: react-image-crop sets width/height on the img to scale it. We set canvas size to natural size.
    // So the client coordinates need to be scaled.
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    let clientX, clientY;
    if ('touches' in e) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = (e as React.MouseEvent).clientX;
      clientY = (e as React.MouseEvent).clientY;
    }

    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY
    };
  };

  const handlePointerDown = (e: React.MouseEvent | React.TouchEvent) => {
    if (mode !== 'draw') return;
    e.preventDefault();
    const coords = getCoordinates(e);
    if (!coords) return;
    
    setIsDrawing(true);
    setPaths(prev => [...prev, { color: drawColor, width: drawWidth, points: [coords] }]);
  };

  const handlePointerMove = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing || mode !== 'draw') return;
    e.preventDefault();
    const coords = getCoordinates(e);
    if (!coords) return;

    setPaths(prev => {
      const newPaths = [...prev];
      if (newPaths.length > 0) {
        newPaths[newPaths.length - 1].points.push(coords);
      }
      return newPaths;
    });
  };

  const handlePointerUp = () => {
    setIsDrawing(false);
  };

  const handleApplyCrop = () => {
    if (!imgRef.current || !canvasRef.current) return;
    
    const image = imgRef.current;
    const overlayCanvas = canvasRef.current;
    
    const targetCanvas = document.createElement('canvas');
    
    const cropX = completedCrop?.x ?? 0;
    const cropY = completedCrop?.y ?? 0;
    const cropWidth = completedCrop?.width ?? image.naturalWidth;
    const cropHeight = completedCrop?.height ?? image.naturalHeight;

    const finalCropWidth = cropWidth || image.naturalWidth;
    const finalCropHeight = cropHeight || image.naturalHeight;

    if (finalCropWidth === image.naturalWidth && finalCropHeight === image.naturalHeight) {
      // No crop made
      setCrop(undefined);
      setCompletedCrop(undefined);
      return;
    }

    const scaleX = image.naturalWidth / image.width;
    const scaleY = image.naturalHeight / image.height;

    const sx = cropX * scaleX;
    const sy = cropY * scaleY;
    const sw = finalCropWidth * scaleX;
    const sh = finalCropHeight * scaleY;

    targetCanvas.width = sw;
    targetCanvas.height = sh;

    const ctx = targetCanvas.getContext('2d');
    if (!ctx) return;

    // Draw the cropped portion of the image
    ctx.drawImage(
      image,
      sx, sy, sw, sh,
      0, 0, sw, sh
    );

    // Draw the cropped portion of the overlay canvas
    ctx.drawImage(
      overlayCanvas,
      sx, sy, sw, sh,
      0, 0, sw, sh
    );

    const base64 = targetCanvas.toDataURL('image/png');
    setCurrentImageUrl(base64);
    setCrop(undefined);
    setCompletedCrop(undefined);
    setPaths([]);
  };

  const handleSave = async () => {
    if (!imgRef.current || !canvasRef.current) return;
    setIsLoading(true);

    try {
      const image = imgRef.current;
      const overlayCanvas = canvasRef.current;
      
      const targetCanvas = document.createElement('canvas');
      
      const cropX = completedCrop?.x ?? 0;
      const cropY = completedCrop?.y ?? 0;
      const cropWidth = completedCrop?.width ?? image.naturalWidth;
      const cropHeight = completedCrop?.height ?? image.naturalHeight;

      // Handle cases where crop is effectively 0
      const finalCropWidth = cropWidth || image.naturalWidth;
      const finalCropHeight = cropHeight || image.naturalHeight;

      // Ensure we use the exact pixel crop from the natural image dimensions
      const scaleX = image.naturalWidth / image.width;
      const scaleY = image.naturalHeight / image.height;

      const sx = cropX * scaleX;
      const sy = cropY * scaleY;
      const sw = finalCropWidth * scaleX;
      const sh = finalCropHeight * scaleY;

      targetCanvas.width = sw;
      targetCanvas.height = sh;

      const ctx = targetCanvas.getContext('2d');
      if (!ctx) throw new Error('Could not get canvas context');

      // Draw the cropped portion of the image
      ctx.drawImage(
        image,
        sx, sy, sw, sh,
        0, 0, sw, sh
      );

      // Draw the cropped portion of the overlay canvas
      // The overlay canvas is already sized to naturalWidth/naturalHeight
      ctx.drawImage(
        overlayCanvas,
        sx, sy, sw, sh,
        0, 0, sw, sh
      );

      const base64 = targetCanvas.toDataURL('image/jpeg', 0.95);
      await onSave(base64);
      onClose();
    } catch (err) {
      console.error('Error saving image:', err);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-0 sm:p-6 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="bg-white dark:bg-neutral-900 border-0 sm:border border-neutral-200/50 dark:border-white/5 backdrop-blur-2xl rounded-none sm:rounded-card shadow-2xl flex flex-col w-full h-[100dvh] sm:h-auto sm:max-h-[90dvh] max-w-4xl overflow-hidden animate-in zoom-in-95 duration-300">
        
        {/* Toolbar */}
        <div className="relative flex flex-wrap items-center gap-2 sm:gap-4 p-2 sm:p-4 pr-12 sm:pr-14 border-b border-neutral-200/50 dark:border-white/5 bg-neutral-50 dark:bg-black/20">
            <div className="flex bg-neutral-200/50 dark:bg-neutral-800 rounded-lg p-1">
            <button
              onClick={() => setMode('crop')}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold uppercase tracking-wider transition-all ${
                mode === 'crop' 
                  ? 'bg-white dark:bg-neutral-700 text-neutral-900 dark:text-white shadow-sm' 
                  : 'text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300'
              }`}
            >
              <CropIcon className="w-3.5 h-3.5" />
              {t('imageEditor.crop', { defaultValue: 'Crop' })}
            </button>
            <button
              onClick={() => setMode('draw')}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold uppercase tracking-wider transition-all ${
                mode === 'draw' 
                  ? 'bg-white dark:bg-neutral-700 text-neutral-900 dark:text-white shadow-sm' 
                  : 'text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300'
              }`}
            >
              <PenTool className="w-3.5 h-3.5" />
              {t('imageEditor.draw', { defaultValue: 'Draw' })}
            </button>
          </div>

          {mode === 'draw' && (
            <div className="flex items-center gap-1.5 animate-in fade-in slide-in-from-left-4">
              <div className="flex gap-1.5">
                {['#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#000000', '#ffffff'].map(c => (
                  <button
                    key={c}
                    onClick={() => setDrawColor(c)}
                    className={`w-6 h-6 rounded-full border-2 transition-transform ${drawColor === c ? 'scale-110 border-neutral-900 dark:border-white shadow-md' : 'border-transparent'}`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
              <button
                onClick={() => setPaths([])}
                className="p-1 text-neutral-500 hover:bg-neutral-200 dark:hover:bg-neutral-800 rounded-md transition-colors ml-2"
                title={t('imageEditor.clearDrawings', { defaultValue: 'Clear Drawings' })}
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {mode === 'crop' && !!completedCrop?.width && !!completedCrop?.height && (
              <>
                {imgRef.current && (
                  <span className="text-xs font-black text-neutral-500 dark:text-neutral-400 tracking-widest uppercase hidden sm:inline-block">
                    {Math.round(completedCrop.width * (imgRef.current.naturalWidth / imgRef.current.width))} × {Math.round(completedCrop.height * (imgRef.current.naturalHeight / imgRef.current.height))} px
                  </span>
                )}
              <button
                onClick={() => {
                  setCrop(undefined);
                  setCompletedCrop(undefined);
                }}
                className="flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-bold uppercase tracking-wider transition-all bg-neutral-200 dark:bg-neutral-800 hover:bg-neutral-300 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-300 shadow-sm"
              >
                <X className="w-3.5 h-3.5" />
                {t('common.cancel', { defaultValue: 'Cancel' })}
              </button>
              <button
                onClick={handleApplyCrop}
                className="flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-bold uppercase tracking-wider transition-all bg-emerald-500 hover:bg-emerald-600 text-white shadow-sm"
              >
                <Check className="w-3.5 h-3.5" />
                {t('imageEditor.applyCrop', { defaultValue: 'Apply' })}
              </button>
            </>
          )}

          <button
            onClick={onClose}
            className="absolute top-2 sm:top-4 right-2 sm:right-4 p-1.5 text-neutral-500 hover:bg-neutral-200 dark:hover:bg-neutral-800 rounded-full transition-colors z-10"
            title={t('common.close', { defaultValue: 'Close' })}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Editor Area */}
        <div className="flex-1 overflow-auto bg-neutral-100 dark:bg-neutral-950 p-4 sm:p-8 flex items-center justify-center min-h-[300px]">
          <div ref={containerRef} className="relative max-w-full overflow-hidden shadow-2xl ring-1 ring-black/5 dark:ring-white/10 rounded-sm">
            <ReactCrop
              crop={crop}
              onChange={(_, percentCrop) => setCrop(percentCrop)}
              onComplete={(c) => setCompletedCrop(c)}
              disabled={mode === 'draw'}
              locked={mode === 'draw'}
              className={mode === 'draw' ? 'cursor-crosshair' : ''}
            >
              <div className="relative pointer-events-none">
                {/* 
                  The image needs to be the size container.
                  ReactCrop adds the drag handles over the image.
                */}
                <img
                  ref={imgRef}
                  alt="Editor"
                  src={currentImageUrl}
                  crossOrigin="anonymous"
                  onLoad={onImageLoad}
                  className="max-h-[60vh] max-w-full object-contain pointer-events-none"
                />
                <canvas
                  ref={canvasRef}
                  className="absolute top-0 left-0 w-full h-full"
                  style={{ 
                    pointerEvents: mode === 'draw' ? 'auto' : 'none',
                    touchAction: mode === 'draw' ? 'none' : 'auto'
                  }}
                  onMouseDown={handlePointerDown}
                  onMouseMove={handlePointerMove}
                  onMouseUp={handlePointerUp}
                  onMouseLeave={handlePointerUp}
                  onTouchStart={handlePointerDown}
                  onTouchMove={handlePointerMove}
                  onTouchEnd={handlePointerUp}
                />
              </div>
            </ReactCrop>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-neutral-200/50 dark:border-white/5 bg-neutral-50 dark:bg-black/20 flex justify-between items-center gap-3">
          <button
            onClick={() => {
              if (currentImageUrl !== imageUrl && currentImageUrl.startsWith('blob:')) {
                URL.revokeObjectURL(currentImageUrl);
              }
              setCurrentImageUrl(imageUrl);
              setPaths([]);
              setCrop(undefined);
              setCompletedCrop(undefined);
            }}
            className="flex items-center gap-2 px-3 py-2 text-sm font-bold text-neutral-500 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-800 rounded-lg transition-colors"
            title={t('imageEditor.resetOriginal', { defaultValue: 'Reset Original' })}
          >
            <RotateCcw className="w-4 h-4" />
            <span className="hidden sm:inline">{t('imageEditor.resetOriginal', { defaultValue: 'Reset Original' })}</span>
          </button>
          
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-bold text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-800 rounded-lg transition-colors"
            >
              {t('common.cancel', { defaultValue: 'Cancel' })}
            </button>
            <button
              onClick={handleSave}
              disabled={isLoading}
              className="flex items-center gap-2 px-6 py-2 bg-neutral-900 dark:bg-white text-white dark:text-black font-bold rounded-lg hover:bg-neutral-800 dark:hover:bg-neutral-100 transition-colors disabled:opacity-50 shadow-lg shadow-black/10 dark:shadow-white/10"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {t('common.saving', { defaultValue: 'Saving...' })}
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  {t('common.save', { defaultValue: 'Save' })}
                </>
              )}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
