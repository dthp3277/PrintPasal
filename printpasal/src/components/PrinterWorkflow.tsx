/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import {
  Printer,
  Play,
  X,
  RefreshCw,
  CircleDot,
  Monitor,
} from 'lucide-react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

import { Attachment, PrintSettings, Printer as PrinterType } from '../types';

interface PrinterWorkflowProps {
  attachments: Attachment[];
  onClose: () => void;
}

const DEFAULT_SETTINGS: PrintSettings = {
  copies: 1,
  orientation: 'portrait',
  colorMode: 'color',
  duplex: 'simplex',
  collate: false,
  paperSize: 'A4',
  layout: 'fit',
  pageRange: '',
};

function statusLabel(status: PrinterType['status']) {
  switch (status) {
    case 'ready':
      return 'Ready';
    case 'printing':
      return 'Printing';
    case 'busy':
      return 'Busy';
    case 'paused':
      return 'Paused';
    case 'error':
      return 'Error';
    case 'offline':
      return 'Offline';
    default:
      return 'Unknown';
  }
}

function statusClass(status: PrinterType['status']) {
  switch (status) {
    case 'ready':
      return 'text-emerald-400';
    case 'printing':
    case 'busy':
      return 'text-blue-400';
    case 'paused':
      return 'text-amber-400';
    case 'error':
    case 'offline':
      return 'text-red-400';
    default:
      return 'text-zinc-500';
  }
}

/* ── Preview sub-component ─────────────────────────────────────────── */

/* ── Paper dimensions (mm) ──────────────────────────────────────── */
const PAPER_DIMS: Record<string, { w: number; h: number }> = {
  A4:     { w: 210,   h: 297 },
  Letter: { w: 215.9, h: 279.4 },
  Legal:  { w: 215.9, h: 355.6 },
};

interface PreviewPaneProps {
  attachments: Attachment[];
  paperSize: PrintSettings['paperSize'];
  orientation: PrintSettings['orientation'];
  layout: PrintSettings['layout'];
}

function PreviewPane({ attachments, paperSize, orientation, layout }: PreviewPaneProps) {
  const [pdfPages, setPdfPages] = useState<Record<string, number>>({});
  const containerRef = useRef<HTMLDivElement>(null);

  const onDocumentLoadSuccess = useCallback(
    (id: string, { numPages }: { numPages: number }) => {
      setPdfPages(prev => ({ ...prev, [id]: numPages }));
    },
    []
  );

  /* Compute paper pixel dimensions that fit the panel width */
  const paperPixels = useMemo(() => {
    const raw = PAPER_DIMS[paperSize] ?? PAPER_DIMS.A4;
    const w = orientation === 'landscape' ? raw.h : raw.w;
    const h = orientation === 'landscape' ? raw.w : raw.h;
    const maxW = 320; // available width inside padding
    const scale = maxW / w;
    return { width: Math.round(w * scale), height: Math.round(h * scale) };
  }, [paperSize, orientation]);

  /* Style for the image inside the paper depending on layout mode */
  const imgStyle = useMemo((): React.CSSProperties => {
    const base: React.CSSProperties = { display: 'block', maxWidth: '100%', maxHeight: '100%' };
    switch (layout) {
      case 'fill':
        return { ...base, width: '100%', height: '100%', objectFit: 'cover' };
      case 'original':
        return { ...base, objectFit: 'none', overflow: 'hidden' };
      case 'fit':
      default:
        return { ...base, objectFit: 'contain' };
    }
  }, [layout]);

  if (attachments.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-zinc-600">
        <p className="text-xs uppercase tracking-widest">No files to preview</p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="h-full overflow-y-auto overflow-x-hidden px-4 py-6"
      style={{ scrollbarWidth: 'thin', scrollbarColor: '#333 transparent' }}
    >
      <div className="flex flex-col items-center gap-6">
        {attachments.map(att => {
          const isPdf = att.fileType === 'pdf' || att.fileName.toLowerCase().endsWith('.pdf');
          const isImage =
            att.fileType === 'image' ||
            /\.(jpe?g|png|gif|webp|bmp|svg)$/i.test(att.fileName);

          if (isPdf) {
            const totalPages = pdfPages[att.id] ?? 0;
            return (
              <div key={att.id} className="flex flex-col items-center gap-4 w-full">
                {attachments.length > 1 && (
                  <p className="truncate text-[10px] font-bold uppercase tracking-widest text-zinc-500 self-start">
                    {att.fileName}
                  </p>
                )}
                <Document
                  file={att.fileUrl}
                  onLoadSuccess={(pdf) => onDocumentLoadSuccess(att.id, pdf)}
                  loading={
                    <div
                      className="flex items-center justify-center rounded-sm bg-white"
                      style={{ width: paperPixels.width, height: paperPixels.height, boxShadow: '0 2px 16px rgba(0,0,0,.35)' }}
                    >
                      <RefreshCw className="h-5 w-5 animate-spin text-zinc-400" />
                    </div>
                  }
                  error={
                    <div
                      className="flex items-center justify-center rounded-sm bg-white text-xs text-red-400"
                      style={{ width: paperPixels.width, height: paperPixels.height, boxShadow: '0 2px 16px rgba(0,0,0,.35)' }}
                    >
                      Failed to load PDF
                    </div>
                  }
                >
                  {Array.from({ length: totalPages }, (_, i) => (
                    <div key={`${att.id}-page-${i + 1}`} className="flex flex-col items-center gap-1.5">
                      <div
                        className="relative flex items-center justify-center overflow-hidden rounded-sm bg-white"
                        style={{
                          width: paperPixels.width,
                          height: paperPixels.height,
                          boxShadow: '0 2px 16px rgba(0,0,0,.35)',
                        }}
                      >
                        <Page
                          pageNumber={i + 1}
                          width={paperPixels.width}
                          renderTextLayer={false}
                          renderAnnotationLayer={false}
                        />
                      </div>
                      <span className="text-[9px] font-bold text-zinc-600">
                        {i + 1} / {totalPages}
                      </span>
                    </div>
                  ))}
                </Document>
              </div>
            );
          }

          if (isImage) {
            return (
              <div key={att.id} className="flex flex-col items-center gap-4 w-full">
                {attachments.length > 1 && (
                  <p className="truncate text-[10px] font-bold uppercase tracking-widest text-zinc-500 self-start">
                    {att.fileName}
                  </p>
                )}
                <div className="flex flex-col items-center gap-1.5">
                  <div
                    className="relative flex items-center justify-center overflow-hidden rounded-sm bg-white"
                    style={{
                      width: paperPixels.width,
                      height: paperPixels.height,
                      boxShadow: '0 2px 16px rgba(0,0,0,.35)',
                    }}
                  >
                    <img
                      src={att.fileUrl}
                      alt={att.fileName}
                      style={imgStyle}
                      draggable={false}
                    />
                  </div>
                  <span className="text-[9px] font-bold text-zinc-600">1 / 1</span>
                </div>
              </div>
            );
          }

          /* Unsupported type */
          return (
            <div key={att.id} className="flex flex-col items-center gap-1.5">
              <div
                className="flex flex-col items-center justify-center rounded-sm bg-white"
                style={{
                  width: paperPixels.width,
                  height: paperPixels.height,
                  boxShadow: '0 2px 16px rgba(0,0,0,.35)',
                }}
              >
                <p className="text-xs font-bold text-zinc-400">No preview</p>
                <p className="mt-1 max-w-[80%] truncate text-[10px] text-zinc-500">{att.fileName}</p>
              </div>
              <span className="text-[9px] font-bold text-zinc-600">—</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Main component ────────────────────────────────────────────────── */

export default function PrinterWorkflow({ attachments, onClose }: PrinterWorkflowProps) {
  const processedAttachments = useMemo(() => {
    return attachments.map(att => {
      if (att.fileType === 'image') {
        try {
          const raw = localStorage.getItem('printpasal_crop_' + att.fileName);
          if (raw) {
            const data = JSON.parse(raw);
            if (data.croppedDataUrl) {
              return { ...att, fileUrl: data.croppedDataUrl };
            }
          }
        } catch (e) { }
      }
      return att;
    });
  }, [attachments]);

  const [printers, setPrinters] = useState<PrinterType[]>([]);
  const [selectedPrinterId, setSelectedPrinterId] = useState<string>('');
  const [settings, setSettings] = useState<PrintSettings>(DEFAULT_SETTINGS);
  const [currentFileIndex, setCurrentFileIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [printStatusText, setPrintStatusText] = useState('');
  const [isPrinting, setIsPrinting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isRefreshingPrinters, setIsRefreshingPrinters] = useState(false);

  const selectedPrinter = useMemo(
    () => printers.find(pr => pr.id === selectedPrinterId) ?? null,
    [printers, selectedPrinterId]
  );

  const selectedPrinterSupportsColor = selectedPrinter?.supportsColor ?? true;
  const selectedPrinterSupportsDuplex = selectedPrinter?.supportsDuplex ?? true;
  const selectedPrinterSupportsCollate = selectedPrinter?.supportsCollate ?? true;

  const effectiveSettings = useMemo(() => {
    return {
      ...settings,
      colorMode: selectedPrinterSupportsColor ? settings.colorMode : 'mono',
      duplex: selectedPrinterSupportsDuplex ? settings.duplex : 'simplex',
      collate: selectedPrinterSupportsCollate ? settings.collate : false,
    };
  }, [settings, selectedPrinterSupportsColor, selectedPrinterSupportsDuplex, selectedPrinterSupportsCollate]);

  useEffect(() => {
    fetchPrinters();
  }, []);

  useEffect(() => {
    if (!selectedPrinterSupportsColor && settings.colorMode === 'color') {
      setSettings(prev => ({ ...prev, colorMode: 'mono' }));
    }
    if (!selectedPrinterSupportsDuplex && settings.duplex !== 'simplex') {
      setSettings(prev => ({ ...prev, duplex: 'simplex' }));
    }
    if (!selectedPrinterSupportsCollate && settings.collate) {
      setSettings(prev => ({ ...prev, collate: false }));
    }
  }, [selectedPrinterSupportsColor, selectedPrinterSupportsDuplex, selectedPrinterSupportsCollate, settings.colorMode, settings.duplex, settings.collate]);

  useEffect(() => {
    if (!selectedPrinterId && printers.length > 0) {
      const preferred = printers.find(pr => pr.isDefault) ?? printers[0];
      setSelectedPrinterId(preferred.id);
      return;
    }
    if (selectedPrinterId && !printers.some(pr => pr.id === selectedPrinterId) && printers.length > 0) {
      const preferred = printers.find(pr => pr.isDefault) ?? printers[0];
      setSelectedPrinterId(preferred.id);
    }
  }, [printers, selectedPrinterId]);

  const fetchPrinters = async () => {
    setIsRefreshingPrinters(true);
    try {
      const resp = await fetch('/api/printers');
      if (!resp.ok) {
        throw new Error(await resp.text());
      }
      const data = await resp.json();
      const mappedPrinters: PrinterType[] = (data || []).map((p: any, index: number) => ({
        id: p.name || `printer-${index}`,
        name: p.name || `Printer ${index + 1}`,
        type: p.type || 'local',
        status: (p.status || 'unknown') as PrinterType['status'],
        location: p.port_name || '',
        isDefault: !!p.is_default,
        supportsColor: p.supports_color ?? true,
        supportsDuplex: p.supports_duplex ?? true,
        supportsCollate: p.supports_collate ?? true,
        supportsCopies: p.supports_copies ?? true,
      }));
      setPrinters(mappedPrinters);
      const preferred = mappedPrinters.find(pr => pr.isDefault) ?? mappedPrinters[0] ?? null;
      setSelectedPrinterId(prev => {
        if (prev && mappedPrinters.some(pr => pr.id === prev)) return prev;
        return preferred?.id ?? '';
      });
    } catch (e) {
      console.error('Failed to fetch printers', e);
    } finally {
      setIsRefreshingPrinters(false);
    }
  };

  const openNativeSettings = async (properties = false) => {
    if (!selectedPrinter) return;
    try {
      const resp = await fetch('/api/printer/native-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          printer: selectedPrinter.name,
          properties,
        }),
      });
      if (!resp.ok) {
        throw new Error(await resp.text());
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to open printer settings.');
    }
  };

  const handleCopiesChange = (val: string | number) => {
    if (val === '') {
      setSettings(prev => ({ ...prev, copies: '' as any }));
      return;
    }
    const num = typeof val === 'string' ? parseInt(val, 10) : val;
    if (isNaN(num)) return;
    setSettings(prev => ({ ...prev, copies: Math.min(num, 999) }));
  };

  const handleCopiesBlur = () => {
    if (settings.copies === '' || (settings.copies as any) < 1) {
      setSettings(prev => ({ ...prev, copies: 1 }));
    }
  };

  const handlePrint = async () => {
    if (!selectedPrinter || processedAttachments.length === 0) return;

    setIsPrinting(true);
    setError(null);
    setCurrentFileIndex(0);
    setProgress(0);
    setPrintStatusText('');

    try {
      for (let i = 0; i < processedAttachments.length; i++) {
        const att = processedAttachments[i];
        setCurrentFileIndex(i);
        setPrintStatusText(`Preparing ${att.fileName}...`);
        setProgress(10);

        const isDataUrl = att.fileUrl.startsWith('data:');
        const resp = await fetch('/api/print', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            filename: att.fileName,
            printer: selectedPrinter.name,
            copies: effectiveSettings.copies === '' ? 1 : effectiveSettings.copies,
            orientation: settings.orientation,
            duplex: effectiveSettings.duplex,
            collate: effectiveSettings.collate,
            colorMode: effectiveSettings.colorMode,
            paperSize: settings.paperSize,
            layout: effectiveSettings.layout,
            pageRange: settings.pageRange,
            ...(isDataUrl ? { fileData: att.fileUrl } : {}),
          }),
        });

        if (!resp.ok) {
          const errText = await resp.text();
          throw new Error(`Failed on file "${att.fileName}": ${errText || 'Print request failed'}`);
        }

        setPrintStatusText(`Spooling ${att.fileName} to ${selectedPrinter.name}...`);
        setProgress(70);
        await new Promise(r => setTimeout(r, 250));
        setProgress(100);
      }

      setPrintStatusText('All documents spooled successfully.');
    } catch (e: any) {
      setError(e?.message || 'Printing failed.');
    } finally {
      setIsPrinting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md p-4">
      <div className="relative flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#0a0a0f] shadow-2xl">
        {/* ── Header ──────────────────────────────────────────────── */}
        <div className="flex items-center justify-between border-b border-white/5 bg-[#0c0c12] px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-blue-500/20 bg-blue-500/10 text-blue-400 shadow-inner">
              <Printer className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-white">Print Setup</h3>
              <p className="text-[9px] uppercase tracking-[0.2em] text-zinc-500">
                {processedAttachments.length === 1 ? processedAttachments[0].fileName : `${processedAttachments.length} files in batch`}
              </p>
            </div>
          </div>

          <button
            id="close-wizard-btn"
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-zinc-500 transition-all hover:bg-white/5 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* ── Body: settings (left) + preview (right) ─────────────── */}
        <div className="flex min-h-0 flex-1">
          {/* Left: settings panel */}
          <div className="min-h-0 flex-1 overflow-y-auto p-6" style={{ scrollbarWidth: 'thin', scrollbarColor: '#333 transparent' }}>
            <div className="space-y-5">
              {/* Printer selection */}
              <div className="rounded-xl border border-white/5 bg-[#050508] p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Printer</p>
                    <h4 className="mt-1 text-sm font-bold text-white">
                      {selectedPrinter?.name || 'Select a printer'}
                    </h4>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`inline-flex items-center gap-1 rounded-full border border-white/5 bg-white/5 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${statusClass(selectedPrinter?.status || 'unknown')}`}>
                      <CircleDot className="h-2 w-2 fill-current" />
                      {statusLabel(selectedPrinter?.status || 'unknown')}
                    </span>
                    <button
                      type="button"
                      onClick={fetchPrinters}
                      className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-zinc-300 hover:bg-white/10 hover:text-white"
                    >
                      <RefreshCw className={`h-3.5 w-3.5 ${isRefreshingPrinters ? 'animate-spin' : ''}`} />
                      Refresh
                    </button>
                  </div>
                </div>

                <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_auto]">
                  <div>
                    <label className="mb-1.5 block text-[9px] font-bold uppercase tracking-widest text-zinc-500">
                      Printer Selection
                    </label>
                    <select
                      className="w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-sm font-semibold text-zinc-200 focus:border-blue-500 focus:outline-none"
                      value={selectedPrinterId}
                      onChange={(e) => setSelectedPrinterId(e.target.value)}
                    >
                      <option value="" disabled>
                        Select a printer
                      </option>
                      {printers.map((pr) => (
                        <option key={pr.id} value={pr.id}>
                          {pr.name}{pr.isDefault ? ' (Default)' : ''}
                        </option>
                      ))}
                    </select>
                    {!printers.length && (
                      <div className="mt-3 rounded-xl border border-dashed border-white/10 bg-white/3 px-4 py-6 text-center">
                        {isRefreshingPrinters ? (
                          <>
                            <RefreshCw className="mx-auto mb-2 h-6 w-6 animate-spin text-zinc-500" />
                            <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Detecting printers…</p>
                          </>
                        ) : (
                          <>
                            <Monitor className="mx-auto mb-2 h-6 w-6 text-zinc-500" />
                            <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">No printers detected</p>
                          </>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="rounded-xl border border-white/5 bg-white/3 px-4 py-3 text-[10px] font-mono text-zinc-500">
                    <div className="grid grid-cols-2 gap-2">
                      <div>Color: <span className="text-zinc-300">{selectedPrinterSupportsColor ? 'Supported' : 'No'}</span></div>
                      <div>Duplex: <span className="text-zinc-300">{selectedPrinterSupportsDuplex ? 'Supported' : 'No'}</span></div>
                      <div>Collate: <span className="text-zinc-300">{selectedPrinterSupportsCollate ? 'Supported' : 'No'}</span></div>
                      <div>Copies: <span className="text-zinc-300">{selectedPrinter?.supportsCopies ? 'Supported' : 'Unknown'}</span></div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Job settings */}
              <div className="rounded-xl border border-white/5 bg-[#050508] p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Job Settings</p>
                    <h4 className="mt-1 text-sm font-bold text-white">Configure output</h4>
                  </div>
                  <button
                    type="button"
                    onClick={() => openNativeSettings(true)}
                    disabled={!selectedPrinter}
                    className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-zinc-300 hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Open Properties
                  </button>
                </div>

                <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="mb-1.5 block text-[9px] font-bold uppercase tracking-widest text-zinc-500" htmlFor="input-copies">
                        Copies
                      </label>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleCopiesChange(Math.max(1, (typeof settings.copies === 'number' ? settings.copies : 1) - 1))}
                          className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/5 font-bold text-zinc-300 hover:bg-white/10 hover:text-white"
                        >
                          -
                        </button>
                        <input
                          id="input-copies"
                          type="number"
                          min={1}
                          max={999}
                          className="[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none h-9 w-12 rounded-lg border border-white/20 bg-zinc-950 text-center text-sm font-bold text-white focus:border-blue-500 focus:outline-none"
                          value={settings.copies}
                          onChange={(e) => handleCopiesChange(e.target.value)}
                          onBlur={handleCopiesBlur}
                        />
                        <button
                          type="button"
                          onClick={() => handleCopiesChange((typeof settings.copies === 'number' ? settings.copies : 1) + 1)}
                          className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/5 font-bold text-zinc-300 hover:bg-white/10 hover:text-white"
                        >
                          +
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="mb-1.5 block text-[9px] font-bold uppercase tracking-widest text-zinc-500" htmlFor="input-pages">
                        Pages (e.g. 1-3, 5)
                      </label>
                      <input
                        id="input-pages"
                        type="text"
                        placeholder="All"
                        className="h-9 w-full rounded-lg border border-white/20 bg-zinc-950 px-3 text-sm font-bold text-white placeholder:text-zinc-600 focus:border-blue-500 focus:outline-none"
                        value={settings.pageRange}
                        onChange={(e) => setSettings(prev => ({ ...prev, pageRange: e.target.value }))}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="mb-1.5 block text-[9px] font-bold uppercase tracking-widest text-zinc-500">
                      Page Orientation
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      {(['portrait', 'landscape'] as const).map((orientation) => (
                        <button
                          key={orientation}
                          type="button"
                          onClick={() => setSettings(prev => ({ ...prev, orientation }))}
                          className={`rounded-lg border px-3 py-2 text-center text-xs font-bold uppercase tracking-wider transition-all ${
                            settings.orientation === orientation
                              ? 'border-blue-500 bg-blue-600/10 text-blue-400'
                              : 'border-white/5 bg-white/5 text-zinc-500 hover:border-white/10 hover:bg-white/10 hover:text-zinc-300'
                          }`}
                        >
                          {orientation}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="mb-1.5 block text-[9px] font-bold uppercase tracking-widest text-zinc-500">
                      Color Mode
                    </label>
                    {!selectedPrinterSupportsColor && (
                      <p className="mb-2 text-[11px] text-amber-400">
                        Selected printer does not report color support. Mono is enforced.
                      </p>
                    )}
                    <div className="grid grid-cols-2 gap-2">
                      {(['color', 'mono'] as const).map((mode) => (
                        <button
                          key={mode}
                          type="button"
                          disabled={mode === 'color' && !selectedPrinterSupportsColor}
                          onClick={() => setSettings(prev => ({ ...prev, colorMode: mode }))}
                          className={`rounded-lg border px-3 py-2 text-center text-xs font-bold uppercase tracking-wider transition-all ${
                            settings.colorMode === mode
                              ? 'border-blue-500 bg-blue-600/10 text-blue-400'
                              : 'border-white/5 bg-white/5 text-zinc-500 hover:border-white/10 hover:bg-white/10 hover:text-zinc-300'
                          } ${mode === 'color' && !selectedPrinterSupportsColor ? 'cursor-not-allowed opacity-40' : ''}`}
                        >
                          {mode === 'mono' ? 'Black & White' : 'Full Color'}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="mb-1.5 block text-[9px] font-bold uppercase tracking-widest text-zinc-500">
                      Paper Size
                    </label>
                    <select
                      className="w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-xs font-semibold text-zinc-300 focus:border-blue-500 focus:outline-none"
                      value={settings.paperSize}
                      onChange={(e) => setSettings(prev => ({ ...prev, paperSize: e.target.value as PrintSettings['paperSize'] }))}
                    >
                      <option value="A4">A4</option>
                      <option value="Letter">Letter</option>
                      <option value="Legal">Legal</option>
                    </select>
                  </div>

                  <div>
                    <label className="mb-1.5 block text-[9px] font-bold uppercase tracking-widest text-zinc-500">
                      Duplex
                    </label>
                    {!selectedPrinterSupportsDuplex && (
                      <p className="mb-2 text-[11px] text-amber-400">
                        Duplex is not reported by this printer. Simplex will be used.
                      </p>
                    )}
                    <div className="grid grid-cols-3 gap-2">
                      {([
                        { value: 'simplex', label: 'Off' },
                        { value: 'long-edge', label: 'Long Edge' },
                        { value: 'short-edge', label: 'Short Edge' },
                      ] as const).map(({ value, label }) => (
                        <button
                          key={value}
                          type="button"
                          disabled={value !== 'simplex' && !selectedPrinterSupportsDuplex}
                          onClick={() => setSettings(prev => ({ ...prev, duplex: value }))}
                          className={`rounded-lg border px-3 py-2 text-center text-[11px] font-bold uppercase tracking-wider transition-all ${
                            settings.duplex === value
                              ? 'border-blue-500 bg-blue-600/10 text-blue-400'
                              : 'border-white/5 bg-white/5 text-zinc-500 hover:border-white/10 hover:bg-white/10 hover:text-zinc-300'
                          } ${value !== 'simplex' && !selectedPrinterSupportsDuplex ? 'cursor-not-allowed opacity-40' : ''}`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="lg:col-span-2">
                    <label className="mb-1.5 block text-[9px] font-bold uppercase tracking-widest text-zinc-500">
                      Collate
                    </label>
                    {!selectedPrinterSupportsCollate && (
                      <p className="mb-2 text-[11px] text-amber-400">
                        Collate is not reported by this printer. The app will send single-copy jobs instead.
                      </p>
                    )}
                    <button
                      type="button"
                      disabled={!selectedPrinterSupportsCollate}
                      onClick={() => setSettings(prev => ({ ...prev, collate: !prev.collate }))}
                      className={`w-full rounded-lg border px-3 py-2 text-left text-xs font-bold uppercase tracking-wider transition-all ${
                        settings.collate
                          ? 'border-blue-500 bg-blue-600/10 text-blue-400'
                          : 'border-white/5 bg-white/5 text-zinc-500 hover:border-white/10 hover:bg-white/10 hover:text-zinc-300'
                      } ${!selectedPrinterSupportsCollate ? 'cursor-not-allowed opacity-40' : ''}`}
                    >
                      {settings.collate ? 'Collated' : 'Uncollated'}
                    </button>
                  </div>
                </div>
              </div>

            </div>
          </div>

          {/* Right: preview panel */}
          <div className="hidden w-[380px] shrink-0 border-l border-white/5 bg-[#08080c] md:block">
            <PreviewPane attachments={processedAttachments} paperSize={settings.paperSize} orientation={settings.orientation} layout={settings.layout} />
          </div>
        </div>

        {/* ── Footer ──────────────────────────────────────────────── */}
        <div className="flex items-center justify-between gap-4 border-t border-white/5 bg-[#0c0c12] px-6 py-4">
          <div className="flex-1 overflow-hidden">
            {/* Error */}
            {error && (
              <div className="flex items-center gap-2 text-sm text-red-400">
                <span className="truncate">{error}</span>
              </div>
            )}

            {/* Printing progress */}
            {isPrinting && (
              <div className="flex items-center gap-4">
                <RefreshCw className="h-4 w-4 animate-spin text-blue-400 shrink-0" />
                <div className="flex-1">
                  <div className="flex items-center justify-between gap-4">
                    <p className="truncate text-xs text-zinc-300">{printStatusText}</p>
                    <span className="font-mono text-[10px] font-bold text-zinc-400">
                      {Math.round(((currentFileIndex + (progress / 100)) / Math.max(processedAttachments.length, 1)) * 100)}%
                    </span>
                  </div>
                  <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-white/5">
                    <div
                      className="h-full bg-blue-600 shadow-[0_0_10px_rgba(59,130,246,0.8)] transition-all duration-200"
                      style={{ width: `${((currentFileIndex + (progress / 100)) / Math.max(processedAttachments.length, 1)) * 100}%` }}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Success message */}
            {!isPrinting && printStatusText && !error && (
              <div className="flex items-center gap-2 text-xs text-emerald-400">
                <span className="truncate">{printStatusText}</span>
              </div>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              disabled={!selectedPrinter || isPrinting || processedAttachments.length === 0}
              className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-5 py-2 text-[10px] font-bold uppercase tracking-wider text-white shadow-[0_0_20px_rgba(37,99,235,0.45)] transition-all hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Play className="h-3.5 w-3.5 fill-current" />
              <span>Print</span>
            </button>
            <button
              type="button"
              className="rounded-xl border border-white/5 bg-zinc-800 px-5 py-2 text-[10px] font-bold uppercase tracking-wider text-zinc-200 hover:bg-zinc-700"
              onClick={onClose}
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
