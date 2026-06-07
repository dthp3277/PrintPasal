import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Stage, Layer, Image as KonvaImage, Transformer, Text, Group } from 'react-konva';
import { ArrowLeft, Printer, Layout, AArrowUp, AArrowDown, RefreshCw, Check } from 'lucide-react';
import { Attachment } from '../types';
import Konva from 'konva';

interface PageSize {
  label: string;
  width: number;
  height: number;
}

const PAGE_SIZES: PageSize[] = [
  { label: 'A4', width: 2480, height: 3508 },
  { label: 'Letter', width: 2550, height: 3300 },
  { label: 'Legal', width: 2550, height: 4200 },
];

interface ImageLayer {
  id: string;
  image: HTMLImageElement;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  naturalWidth: number;
  naturalHeight: number;
}

interface CombineWorkspaceProps {
  attachments: Attachment[];
  mode: 'combine' | 'nagrikta';
  onBack: () => void;
  onPrint: (dataUrl: string, label: string) => void;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return fetch(url)
    .then(res => {
      if (!res.ok) throw new Error(`Failed to fetch ${url}`);
      return res.blob();
    })
    .then(blob => {
      return new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new window.Image();
        const blobUrl = URL.createObjectURL(blob);
        img.onload = () => { resolve(img); URL.revokeObjectURL(blobUrl); };
        img.onerror = () => { reject(new Error('Failed to load image')); URL.revokeObjectURL(blobUrl); };
        img.src = blobUrl;
      });
    });
}

export default function CombineWorkspace({ attachments, mode, onBack, onPrint }: CombineWorkspaceProps) {
  const [pageSize, setPageSize] = useState<PageSize>(PAGE_SIZES[0]);
  const [layers, setLayers] = useState<ImageLayer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const transformerRef = useRef<Konva.Transformer>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.15);

  useEffect(() => {
    if (selectedId && transformerRef.current) {
      const node = stageRef.current?.findOne(`#${selectedId}`);
      if (node) {
        transformerRef.current.nodes([node]);
        transformerRef.current.getLayer()?.batchDraw();
      }
    } else {
      transformerRef.current?.nodes([]);
      transformerRef.current?.getLayer()?.batchDraw();
    }
  }, [selectedId]);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);

    Promise.all(
      attachments.map(async (att) => {
        const img = await loadImage(att.fileUrl);
        return { att, img };
      })
    ).then((results) => {
      if (cancelled) return;
      const maxW = pageSize.width * 0.85;
      const maxH = pageSize.height * 0.85;

      if (mode === 'nagrikta' && results.length === 2) {
        const slotW = Math.min(1600, pageSize.width * 0.75);
        const slotH = Math.min(1100, pageSize.height * 0.32);
        const gap = 80;

        const newLayers: ImageLayer[] = results.map(({ att, img }, i) => {
          const imgAspect = img.naturalWidth / img.naturalHeight;
          const slotAspect = slotW / slotH;

          let w: number, h: number;
          if (imgAspect > slotAspect) {
            w = slotW;
            h = w / imgAspect;
          } else {
            h = slotH;
            w = h * imgAspect;
          }

          const cx = (pageSize.width - w) / 2;
          const totalH = slotH * 2 + gap;
          const startY = (pageSize.height - totalH) / 2;
          const cy = startY + i * (slotH + gap) + (slotH - h) / 2;

          return {
            id: att.id,
            image: img,
            x: cx + w / 2,
            y: cy + h / 2,
            width: w,
            height: h,
            rotation: 0,
            naturalWidth: img.naturalWidth,
            naturalHeight: img.naturalHeight,
          };
        });
        setLayers(newLayers);
      } else {
        const cols = Math.min(results.length, 2);
        const rows = Math.ceil(results.length / cols);
        const cellW = maxW / cols;
        const cellH = maxH / rows;
        const pad = 30;

        const newLayers: ImageLayer[] = results.map(({ att, img }, i) => {
          const col = i % cols;
          const row = Math.floor(i / cols);
          const imgAspect = img.naturalWidth / img.naturalHeight;
          const areaW = cellW - pad * 2;
          const areaH = cellH - pad * 2;
          const areaAspect = areaW / areaH;

          let w: number, h: number;
          if (imgAspect > areaAspect) {
            w = areaW;
            h = w / imgAspect;
          } else {
            h = areaH;
            w = h * imgAspect;
          }

          const x = (pageSize.width - maxW) / 2 + col * cellW + pad + (areaW - w) / 2;
          const y = (pageSize.height - maxH) / 2 + row * cellH + pad + (areaH - h) / 2;

          return {
            id: att.id,
            image: img,
            x: x + w / 2,
            y: y + h / 2,
            width: w,
            height: h,
            rotation: 0,
            naturalWidth: img.naturalWidth,
            naturalHeight: img.naturalHeight,
          };
        });
        setLayers(newLayers);
      }
      setIsLoading(false);
    }).catch((err) => {
      console.error('Failed to load images', err);
      setIsLoading(false);
    });

    return () => { cancelled = true; };
  }, [attachments, mode, pageSize]);

  const handleExport = useCallback(async () => {
    if (!stageRef.current) return;
    setIsExporting(true);
    try {
      const tempContainer = document.createElement('div');
      tempContainer.style.position = 'absolute';
      tempContainer.style.left = '-9999px';
      document.body.appendChild(tempContainer);

      const exportStage = new Konva.Stage({
        container: tempContainer,
        width: pageSize.width,
        height: pageSize.height,
      });
      const exportLayer = new Konva.Layer();
      exportStage.add(exportLayer);

      for (const l of layers) {
        const konvaImage = new Konva.Image({
          image: l.image,
          x: l.x,
          y: l.y,
          width: l.width,
          height: l.height,
          offsetX: l.width / 2,
          offsetY: l.height / 2,
          rotation: l.rotation,
        });
        exportLayer.add(konvaImage);
      }

      exportLayer.draw();
      const dataUrl = exportStage.toDataURL({
        x: 0,
        y: 0,
        width: pageSize.width,
        height: pageSize.height,
        pixelRatio: 1,
      });
      exportStage.destroy();
      document.body.removeChild(tempContainer);
      onPrint(dataUrl, `combined_${mode === 'nagrikta' ? 'nagrikta' : 'page'}`);
    } catch (e) {
      console.error('Export failed', e);
    } finally {
      setIsExporting(false);
    }
  }, [pageSize, layers, onPrint, mode]);

  const handleZoomIn = () => setScale(s => Math.min(s + 0.05, 1.0));
  const handleZoomOut = () => setScale(s => Math.max(s - 0.05, 0.1));

  const stageWidth = pageSize.width * scale;
  const stageHeight = pageSize.height * scale;

  return (
    <div className="flex h-full flex-col bg-[#0c0c12]">
      {/* Toolbar */}
      <div className="flex items-center justify-between border-b border-white/5 px-4 py-2.5 shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 text-zinc-300 text-[10px] font-bold uppercase tracking-wider transition-all"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back</span>
          </button>
          <div className="w-px h-5 bg-white/10" />
          <span className="text-sm font-bold text-white uppercase tracking-wider">
            {mode === 'nagrikta' ? 'Nagrikta Layout' : 'Combine Workspace'}
          </span>
          {mode === 'nagrikta' && (
            <span className="bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-widest">
              Citizenship
            </span>
          )}
        </div>

        <div className="flex items-center gap-2.5">
          {/* Page size */}
          <div className="flex items-center gap-1.5 bg-white/5 border border-white/10 rounded-xl px-2 py-1">
            <Layout className="w-3.5 h-3.5 text-zinc-500" />
            <select
              value={pageSize.label}
              onChange={(e) => {
                const ps = PAGE_SIZES.find(p => p.label === e.target.value) || PAGE_SIZES[0];
                setPageSize(ps);
                setScale(0.15);
              }}
              className="bg-transparent text-[10px] font-bold text-zinc-300 outline-none uppercase tracking-wider"
            >
              {PAGE_SIZES.map(ps => (
                <option key={ps.label} value={ps.label} className="bg-[#1a1a20]">{ps.label} ({ps.width}×{ps.height})</option>
              ))}
            </select>
          </div>

          {/* Zoom */}
          <div className="flex items-center gap-1 bg-white/5 border border-white/10 rounded-xl px-2 py-1">
            <button onClick={handleZoomOut} className="p-0.5 text-zinc-500 hover:text-white" title="Zoom out">
              <AArrowDown className="w-3.5 h-3.5" />
            </button>
            <span className="text-[10px] font-mono text-zinc-400 w-8 text-center">{Math.round(scale * 100)}%</span>
            <button onClick={handleZoomIn} className="p-0.5 text-zinc-500 hover:text-white" title="Zoom in">
              <AArrowUp className="w-3.5 h-3.5" />
            </button>
          </div>

          <button
            onClick={handleExport}
            disabled={isExporting || isLoading}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 border border-blue-500 hover:bg-blue-500 text-white text-[10px] font-bold uppercase tracking-wider shadow-[0_4px_25px_rgba(37,99,235,0.45)] transition-all disabled:opacity-50"
          >
            {isExporting ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Printer className="w-3.5 h-3.5" />
            )}
            <span>{isExporting ? 'Exporting...' : 'Print Combined'}</span>
          </button>
        </div>
      </div>

      {/* Canvas */}
      <div ref={containerRef} className="flex-1 overflow-auto bg-[#050508] flex items-start justify-center p-4">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <RefreshCw className="w-8 h-8 text-blue-500 animate-spin" />
          </div>
        ) : (
          <Stage
            ref={stageRef}
            width={stageWidth}
            height={stageHeight}
            scaleX={scale}
            scaleY={scale}
            style={{ background: '#ffffff', borderRadius: '4px', boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}
            onMouseDown={(e) => {
              const clickedOnStage = e.target === e.target.getStage();
              if (clickedOnStage) setSelectedId(null);
            }}
          >
            <Layer>
              {layers.map((layer) => (
                <React.Fragment key={layer.id}>
                  <KonvaImage
                    id={layer.id}
                    image={layer.image}
                    x={layer.x}
                    y={layer.y}
                    width={layer.width}
                    height={layer.height}
                    offsetX={layer.width / 2}
                    offsetY={layer.height / 2}
                    rotation={layer.rotation}
                    draggable
                    onClick={() => setSelectedId(layer.id)}
                    onTap={() => setSelectedId(layer.id)}
                    onDragEnd={(e) => {
                      setLayers(prev =>
                        prev.map(l =>
                          l.id === layer.id
                            ? { ...l, x: e.target.x(), y: e.target.y() }
                            : l
                        )
                      );
                    }}
                    onTransformEnd={(e) => {
                      const node = e.target;
                      const scaleX = node.scaleX();
                      const scaleY = node.scaleY();
                      setLayers(prev =>
                        prev.map(l =>
                          l.id === layer.id
                            ? {
                                ...l,
                                x: node.x(),
                                y: node.y(),
                                width: Math.max(node.width() * scaleX, 20),
                                height: Math.max(node.height() * scaleY, 20),
                                rotation: node.rotation(),
                              }
                            : l
                        )
                      );
                      node.scaleX(1);
                      node.scaleY(1);
                    }}
                  />
                  {selectedId === layer.id && (
                    <Group
                      x={layer.x}
                      y={layer.y}
                    >
                      <Text
                        text="↻"
                        fontSize={72}
                        fill="#3b82f6"
                        offsetX={36}
                        offsetY={36}
                        shadowColor="rgba(0,0,0,0.5)"
                        shadowBlur={6}
                        shadowEnabled={true}
                        onClick={() => {
                          setLayers(prev =>
                            prev.map(l =>
                              l.id === layer.id
                                ? { ...l, rotation: (l.rotation + 90) % 360 }
                                : l
                            )
                          );
                        }}
                      />
                    </Group>
                  )}
                </React.Fragment>
              ))}
              <Transformer
                ref={transformerRef}
                boundBoxFunc={(oldBox, newBox) => {
                  if (newBox.width < 20 || newBox.height < 20) return oldBox;
                  return newBox;
                }}
              />
            </Layer>
          </Stage>
        )}
      </div>

      {/* Footer status */}
      <div className="border-t border-white/5 px-4 py-2 flex items-center justify-between text-[10px] text-zinc-500 shrink-0">
        <span>{layers.length} image{layers.length !== 1 ? 's' : ''} · {pageSize.label} ({pageSize.width}×{pageSize.height})</span>
        <span className="font-mono">Click image to select · Drag to move · Resize with handles</span>
      </div>
    </div>
  );
}
