import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import ReactCrop, { type Crop, type PixelCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import { Button, Dialog, IconButton, Text } from '../../m3';
import { Segmented } from '../ui/Toolbar';

interface ImageEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (base64: string) => Promise<void>;
  imageUrl: string;
}

const COLORS = ['#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#000000', '#ffffff'];

interface Path {
  color: string;
  width: number;
  points: { x: number; y: number }[];
}

interface CanvasCoordinates {
  point: { x: number; y: number };
  scale: number;
}

interface ExportRect {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
}

/**
 * Resolve the source rectangle (in the image's natural pixel space) that should
 * be exported. `crop` comes from react-image-crop and is expressed in *rendered*
 * pixels, so it has to be scaled up; when there is no crop the full natural
 * size is used as-is instead of being scaled a second time.
 */
function getExportRect(image: HTMLImageElement, crop?: PixelCrop): ExportRect {
  const { naturalWidth, naturalHeight } = image;

  if (!crop?.width || !crop?.height) {
    return { sx: 0, sy: 0, sw: naturalWidth, sh: naturalHeight };
  }

  // Rendered size of the <img>; fall back to natural size before layout settles.
  const displayWidth = image.width || naturalWidth;
  const displayHeight = image.height || naturalHeight;

  const scaleX = naturalWidth / displayWidth;
  const scaleY = naturalHeight / displayHeight;

  // Round to whole pixels: a fractional canvas size gets truncated by the
  // browser, which is what produced the odd off-by-a-few output dimensions.
  const sx = Math.min(Math.max(Math.round(crop.x * scaleX), 0), Math.max(naturalWidth - 1, 0));
  const sy = Math.min(Math.max(Math.round(crop.y * scaleY), 0), Math.max(naturalHeight - 1, 0));
  const sw = Math.min(Math.max(Math.round(crop.width * scaleX), 1), naturalWidth - sx);
  const sh = Math.min(Math.max(Math.round(crop.height * scaleY), 1), naturalHeight - sy);

  return { sx, sy, sw, sh };
}

/** Crop or draw on a reference image, then save it as a new upload. */
export function ImageEditorDialog({ isOpen, onClose, onSave, imageUrl }: ImageEditorModalProps) {
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
    const { naturalWidth, naturalHeight } = e.currentTarget;
    if (canvasRef.current) {
      // Keep drawing and crop composition in the image's natural pixel space.
      // CSS scales this canvas to the rendered image size for interaction.
      canvasRef.current.width = naturalWidth;
      canvasRef.current.height = naturalHeight;
    }
    redrawCanvas();
  };

  const getCoordinates = (e: React.MouseEvent | React.TouchEvent | MouseEvent | TouchEvent): CanvasCoordinates | null => {
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
      point: {
        x: (clientX - rect.left) * scaleX,
        y: (clientY - rect.top) * scaleY,
      },
      scale: (scaleX + scaleY) / 2,
    };
  };

  const handlePointerDown = (e: React.MouseEvent | React.TouchEvent) => {
    if (mode !== 'draw') return;
    e.preventDefault();
    const coords = getCoordinates(e);
    if (!coords) return;
    
    setIsDrawing(true);
    setPaths(prev => [...prev, {
      color: drawColor,
      width: drawWidth * coords.scale,
      points: [coords.point],
    }]);
  };

  const handlePointerMove = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing || mode !== 'draw') return;
    e.preventDefault();
    const coords = getCoordinates(e);
    if (!coords) return;

    setPaths(prev => {
      const lastPath = prev[prev.length - 1];
      if (!lastPath) return prev;
      return [
        ...prev.slice(0, -1),
        { ...lastPath, points: [...lastPath.points, coords.point] },
      ];
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

    const { sx, sy, sw, sh } = getExportRect(image, completedCrop);

    if (sx === 0 && sy === 0 && sw === image.naturalWidth && sh === image.naturalHeight) {
      // No crop made
      setCrop(undefined);
      setCompletedCrop(undefined);
      return;
    }

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

      // Without a crop this is the image's natural size, so a draw-only edit
      // keeps the original dimensions instead of being scaled up.
      const { sx, sy, sw, sh } = getExportRect(image, completedCrop);

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

  return (
    <Dialog
      open={isOpen}
      onClose={onClose}
      fullScreen="compact"
      maxWidth={1100}
      headline={
        <span className="flex flex-wrap items-center gap-3">
          <Segmented<'crop' | 'draw'>
            value={mode}
            onChange={setMode}
            options={[
              { value: 'crop', label: t('imageEditor.crop', { defaultValue: 'Crop' }), icon: 'crop' },
              { value: 'draw', label: t('imageEditor.draw', { defaultValue: 'Draw' }), icon: 'draw' },
            ]}
          />
          {mode === 'draw' && (
            <span className="flex items-center gap-1">
              {COLORS.map((c) => (
                <button key={c} type="button" className="v2-swatch m3-focus-ring" data-selected={drawColor === c ? '' : undefined} style={{ backgroundColor: c }} aria-label={c} onClick={() => setDrawColor(c)} />
              ))}
              <IconButton icon="ink_eraser" size="xs" label={t('imageEditor.clearDrawings', { defaultValue: 'Clear Drawings' })} tooltip onClick={() => setPaths([])} />
            </span>
          )}
          {mode === 'crop' && !!completedCrop?.width && !!completedCrop?.height && (
            <span className="flex items-center gap-1">
              {imgRef.current && (
                <Text as="span" variant="label-medium" className="font-mono text-on-surface-variant">
                  {Math.round(completedCrop.width * (imgRef.current.naturalWidth / imgRef.current.width))} × {Math.round(completedCrop.height * (imgRef.current.naturalHeight / imgRef.current.height))} px
                </Text>
              )}
              <Button
                variant="text"
                size="xs"
                icon="close"
                onClick={() => {
                  setCrop(undefined);
                  setCompletedCrop(undefined);
                }}
              >
                {t('common.cancel', { defaultValue: 'Cancel' })}
              </Button>
              <Button variant="tonal" size="xs" icon="check" onClick={handleApplyCrop}>
                {t('imageEditor.applyCrop', { defaultValue: 'Apply' })}
              </Button>
            </span>
          )}
        </span>
      }
      actions={
        <>
          <Button
            variant="text"
            icon="restart_alt"
            className="me-auto"
            onClick={() => {
              if (currentImageUrl !== imageUrl && currentImageUrl.startsWith('blob:')) URL.revokeObjectURL(currentImageUrl);
              setCurrentImageUrl(imageUrl);
              setPaths([]);
              setCrop(undefined);
              setCompletedCrop(undefined);
            }}
          >
            {t('imageEditor.resetOriginal', { defaultValue: 'Reset Original' })}
          </Button>
          <Button variant="text" onClick={onClose}>
            {t('common.cancel', { defaultValue: 'Cancel' })}
          </Button>
          <Button variant="filled" icon="check" loading={isLoading} onClick={() => void handleSave()}>
            {isLoading ? t('common.saving', { defaultValue: 'Saving...' }) : t('common.save', { defaultValue: 'Save' })}
          </Button>
        </>
      }
    >
      <div ref={containerRef} className="v2-image-editor">
        <ReactCrop crop={crop} onChange={(_, percentCrop) => setCrop(percentCrop)} onComplete={(c) => setCompletedCrop(c)} disabled={mode === 'draw'} locked={mode === 'draw'} className={mode === 'draw' ? 'cursor-crosshair' : ''}>
          <div className="relative">
            <img ref={imgRef} alt="Editor" src={currentImageUrl} crossOrigin="anonymous" onLoad={onImageLoad} className="pointer-events-none max-h-[60vh] max-w-full object-contain" />
            <canvas
              ref={canvasRef}
              className="absolute left-0 top-0 h-full w-full"
              style={{ pointerEvents: mode === 'draw' ? 'auto' : 'none', touchAction: mode === 'draw' ? 'none' : 'auto' }}
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
    </Dialog>
  );
}
