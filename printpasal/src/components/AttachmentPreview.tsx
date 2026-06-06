/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  ZoomIn, ZoomOut, RotateCw, Printer, Download, Eye, 
  FileCheck, ShieldAlert, ChevronLeft, ChevronRight, FileText, Search, X, ArrowUp, ArrowDown, RefreshCw
} from 'lucide-react';
import { Attachment } from '../types';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

interface AttachmentPreviewProps {
  attachment: Attachment | null;
  onOpenPrintWizard: () => void;
}

export default function AttachmentPreview({ attachment, onOpenPrintWizard }: AttachmentPreviewProps) {
  const [zoom, setZoom] = useState(100);
  const [rotation, setRotation] = useState(0);
  const [pdfPage, setPdfPage] = useState(1);
  const [numPages, setNumPages] = useState<number | null>(null);
  const [pdfError, setPdfError] = useState<string | null>(null);

  // Page input — editable "x / n" field
  const [pageInputEditing, setPageInputEditing] = useState(false);
  const [pageInputVal, setPageInputVal] = useState('1');
  const pageInputRef = useRef<HTMLInputElement>(null);

  // PDF search
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<{ page: number; index: number }[]>([]);
  const [searchMatchIdx, setSearchMatchIdx] = useState(0);
  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Reset everything when attachment changes
  useEffect(() => {
    setPdfPage(1);
    setNumPages(null);
    setPdfError(null);
    setPageInputVal('1');
    setPageInputEditing(false);
    setSearchOpen(false);
    setSearchQuery('');
    setSearchResults([]);
    setSearchMatchIdx(0);
    setPdfDoc(null);
    setPreviewUrl(null);

    if (attachment) {
      if (attachment.fileType === 'pdf' || attachment.fileType === 'image') {
        setPreviewUrl(attachment.fileUrl);
      } else if (attachment.fileType === 'document') {
        fetchPreview(attachment.fileName);
      }
    }
  }, [attachment]);

  const fetchPreview = async (filename: string) => {
    setIsLoadingPreview(true);
    try {
      const resp = await fetch(`/api/preview?filename=${encodeURIComponent(filename)}`);
      if (resp.ok) {
        const data = await resp.json();
        setPreviewUrl(data.url);
      } else {
        setPdfError('Failed to generate preview for this document.');
      }
    } catch (e) {
      setPdfError('Error connecting to preview engine.');
    } finally {
      setIsLoadingPreview(false);
    }
  };

  const handleOpenInApp = async () => {
    if (!attachment) return;
    try {
      await fetch('/api/open-in-app', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: attachment.fileName })
      });
    } catch (e) {
      console.error('Failed to open in app', e);
    }
  };

  // Sync page input display when page changes externally (scroll)
  useEffect(() => {
    if (!pageInputEditing) setPageInputVal(String(pdfPage));
  }, [pdfPage, pageInputEditing]);

  // Focus search input when opening
  useEffect(() => {
    if (searchOpen) setTimeout(() => searchInputRef.current?.focus(), 50);
  }, [searchOpen]);

  const runSearch = useCallback(async (query: string, doc: any) => {
    if (!query) {
      setIsSearching(false);
      return;
    }
    setIsSearching(true);
    const results: { page: number; index: number }[] = [];
    const q = query.trim().toLowerCase();

    for (let p = 1; p <= doc.numPages; p++) {
      try {
        const page = await doc.getPage(p);
        const content = await page.getTextContent();
        const text = content.items.map((i: any) => i.str).join(' ').toLowerCase();
        
        let matchIdx = text.indexOf(q);
        let itemIndex = 0;
        while (matchIdx !== -1) {
          results.push({ page: p, index: itemIndex++ });
          matchIdx = text.indexOf(q, matchIdx + q.length);
        }
      } catch (e) {
        console.error('Error searching page', p, e);
      }
    }
    setSearchResults(results);
    setSearchMatchIdx(0);
    setIsSearching(false);
    if (results.length > 0) scrollToPage(results[0].page);
  }, []);

  if (!attachment) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-[#08080c] p-8 text-center rounded-2xl border border-white/5 shadow-2xl">
        <div className="h-16 w-16 bg-white/5 border border-white/10 rounded-2xl flex items-center justify-center text-zinc-400 mb-4 shadow-md">
          <Eye className="w-8 h-8 text-blue-400" />
        </div>
        <h3 className="text-white font-bold text-base mb-1 uppercase tracking-wide">Ready for review</h3>
        <p className="text-sm text-zinc-500 max-w-sm leading-relaxed">
          Select an incoming attachment on the left feed to preview, search, and route to print.
        </p>
      </div>
    );
  }

  const handleZoomIn = () => setZoom(prev => Math.min(prev + 25, 200));
  const handleZoomOut = () => setZoom(prev => Math.max(prev - 25, 50));
  const handleRotate = () => setRotation(prev => (prev + 90) % 360);
  const handleReset = () => { setZoom(100); setRotation(0); };

  // ── PDF page scrolling helpers ────────────────────────────────────────────

  const scrollToPage = (p: number) => {
    const el = document.getElementById(`pdf-page-${p}`);
    if (el && scrollContainerRef.current) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setPdfPage(p);
    }
  };

  const handlePdfScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const container = e.currentTarget;
    const children = container.querySelectorAll('.pdf-page-container');
    let currentActivePage = pdfPage;
    let minDiff = Infinity;
    children.forEach(child => {
      const rect = child.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      const diff = Math.abs(rect.top - containerRect.top);
      if (diff < minDiff) {
        minDiff = diff;
        const attr = child.getAttribute('data-page-num');
        if (attr) currentActivePage = parseInt(attr);
      }
    });
    if (currentActivePage !== pdfPage) setPdfPage(currentActivePage);
  };

  // ── Page input handlers ───────────────────────────────────────────────────

  const commitPageInput = () => {
    setPageInputEditing(false);
    const n = parseInt(pageInputVal);
    if (!isNaN(n) && n >= 1 && (!numPages || n <= numPages)) {
      scrollToPage(n);
    } else {
      setPageInputVal(String(pdfPage));
    }
  };

  // ── PDF text search ───────────────────────────────────────────────────────

  const handleSearchChange = (val: string) => {
    setSearchQuery(val);
    if (pdfDoc) runSearch(val, pdfDoc);
  };

  const jumpToMatch = (delta: number) => {
    if (!searchResults.length) return;
    const next = (searchMatchIdx + delta + searchResults.length) % searchResults.length;
    setSearchMatchIdx(next);
    scrollToPage(searchResults[next].page);
  };

  const closeSearch = () => {
    setSearchOpen(false);
    setSearchQuery('');
    setSearchResults([]);
    setSearchMatchIdx(0);
  };

  // ── Render PDF block ──────────────────────────────────────────────────────

  const renderPdf = (url: string) => (
    <div className="flex-1 flex flex-col bg-[#1e1e1f] rounded-xl border border-white/5 overflow-hidden min-h-[450px]">
      {/* Toolbar */}
      <div className="bg-[#2a2a2e] px-3 py-1.5 border-b border-[#1c1c1f] flex flex-wrap items-center gap-2 text-xs text-zinc-300">

        {/* Page navigation */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => scrollToPage(Math.max(1, pdfPage - 1))}
            disabled={pdfPage <= 1}
            className="p-1 text-zinc-400 hover:text-white hover:bg-white/5 rounded disabled:opacity-25 disabled:hover:bg-transparent"
            title="Previous Page"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          {/* Typeable page input */}
          <div
            className="flex items-center gap-1 cursor-text"
            onClick={() => { setPageInputEditing(true); setTimeout(() => pageInputRef.current?.select(), 20); }}
            title="Click to jump to page"
          >
            {pageInputEditing ? (
              <input
                ref={pageInputRef}
                type="number"
                min={1}
                max={numPages ?? undefined}
                value={pageInputVal}
                onChange={e => setPageInputVal(e.target.value)}
                onBlur={commitPageInput}
                onKeyDown={e => { if (e.key === 'Enter') commitPageInput(); if (e.key === 'Escape') { setPageInputEditing(false); setPageInputVal(String(pdfPage)); } }}
                className="w-10 bg-black/40 border border-blue-500/60 rounded px-1 py-0.5 text-center font-mono font-bold text-white text-xs outline-none focus:ring-1 focus:ring-blue-500/40"
              />
            ) : (
              <span className="font-mono font-bold text-white text-xs px-1.5 py-0.5 rounded hover:bg-white/10 transition-colors select-none min-w-[28px] text-center">
                {pdfPage}
              </span>
            )}
            {numPages && (
              <span className="text-zinc-500 font-mono text-xs select-none">/ {numPages}</span>
            )}
          </div>

          <button
            onClick={() => scrollToPage(numPages ? Math.min(numPages, pdfPage + 1) : pdfPage + 1)}
            disabled={!!numPages && pdfPage >= numPages}
            className="p-1 text-zinc-400 hover:text-white hover:bg-white/5 rounded disabled:opacity-25 disabled:hover:bg-transparent"
            title="Next Page"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* Divider */}
        <div className="w-px h-4 bg-white/10" />

        {/* Filename */}
        <div className="hidden md:flex items-center gap-1.5 font-bold uppercase tracking-wider text-[10px] text-zinc-400 flex-1 min-w-0">
          <FileText className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
          <span className="truncate">{attachment.fileName}</span>
        </div>

        {/* Search button */}
        <button
          onClick={() => setSearchOpen(o => !o)}
          title="Search in PDF"
          className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all ${searchOpen ? 'bg-blue-600 text-white' : 'bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white border border-white/10'}`}
        >
          <Search className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Search</span>
        </button>
      </div>

      {/* Search bar */}
      {searchOpen && (
        <div className="bg-[#222226] border-b border-[#1c1c1f] px-3 py-2 flex items-center gap-2">
          <Search className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
          <input
            ref={searchInputRef}
            id="pdf-search-input"
            type="text"
            value={searchQuery}
            onChange={e => handleSearchChange(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') jumpToMatch(e.shiftKey ? -1 : 1); if (e.key === 'Escape') closeSearch(); }}
            placeholder="Search text in PDF…"
            className="flex-1 bg-transparent text-zinc-200 text-xs placeholder-zinc-600 outline-none"
          />
          {/* Match count */}
          {searchQuery && (
            <span className="text-[10px] font-mono text-zinc-500 shrink-0 min-w-[56px] text-right">
              {isSearching ? '…' : searchResults.length === 0 ? 'No match' : `${searchMatchIdx + 1} / ${searchResults.length}`}
            </span>
          )}
          <button onClick={() => jumpToMatch(-1)} disabled={!searchResults.length} className="p-1 text-zinc-400 hover:text-white disabled:opacity-30 rounded hover:bg-white/10" title="Previous match (Shift+Enter)">
            <ArrowUp className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => jumpToMatch(1)} disabled={!searchResults.length} className="p-1 text-zinc-400 hover:text-white disabled:opacity-30 rounded hover:bg-white/10" title="Next match (Enter)">
            <ArrowDown className="w-3.5 h-3.5" />
          </button>
          <button onClick={closeSearch} className="p-1 text-zinc-500 hover:text-white rounded hover:bg-white/10" title="Close search (Esc)">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Document render */}
      <div
        ref={scrollContainerRef}
        onScroll={handlePdfScroll}
        className="flex-1 bg-[#4b4b4d] overflow-y-auto p-8 flex flex-col items-center relative min-h-[350px]"
      >
        {pdfError ? (
          <div className="text-red-400 flex flex-col items-center mt-10">
            <ShieldAlert className="w-10 h-10 mb-2" />
            <p>{pdfError}</p>
          </div>
        ) : (
          <Document
            file={url}
            onLoadSuccess={({ numPages: n, ...doc }) => {
              setNumPages(n);
              setPdfDoc(doc);
            }}
            onLoadError={err => setPdfError(err.message)}
            className="flex flex-col gap-6"
          >
            {numPages && Array.from(new Array(numPages), (_, index) => (
              <div
                key={`page_${index + 1}`}
                id={`pdf-page-${index + 1}`}
                data-page-num={index + 1}
                className={`pdf-page-container shadow-[0_12px_35px_rgba(0,0,0,0.6)] border bg-white transition-all ${
                  searchResults.some(r => r.page === index + 1) && searchResults[searchMatchIdx]?.page === index + 1
                    ? 'border-blue-400 ring-2 ring-blue-400/30'
                    : searchResults.some(r => r.page === index + 1)
                    ? 'border-blue-600/50'
                    : 'border-neutral-300'
                }`}
              >
                <Page
                  pageNumber={index + 1}
                  scale={zoom / 100}
                  rotate={rotation}
                  className="bg-white"
                  renderTextLayer={searchOpen}
                  renderAnnotationLayer={false}
                />
              </div>
            ))}
          </Document>
        )}
      </div>
    </div>
  );

  const getPreviewContent = () => {
    if (isLoadingPreview) {
      return (
        <div className="flex-grow flex flex-col items-center justify-center bg-white/2 rounded-xl border border-dashed border-white/10 p-8 text-center min-h-[400px]">
          <RefreshCw className="w-12 h-12 text-blue-500 animate-spin mb-3" />
          <h4 className="text-white font-bold text-sm">Normalizing Document...</h4>
          <p className="text-xs text-zinc-400 mt-1 max-w-xs">
            Preparing a high-fidelity preview for this Office document. This may take a few seconds.
          </p>
        </div>
      );
    }

    if (!previewUrl && attachment.fileType === 'document') {
        return (
          <div className="flex-grow flex flex-col items-center justify-center bg-white/2 rounded-xl border border-dashed border-white/10 p-8 text-center min-h-[400px]">
            <FileText className="w-12 h-12 text-zinc-600 mb-3" />
            <h4 className="text-white font-bold text-sm">Preview Generation Failed</h4>
            <p className="text-xs text-zinc-400 mt-1 max-w-xs">
              We couldn't generate a preview for this document. You can still try to print it or open it in Word.
            </p>
          </div>
        );
    }

    switch (attachment.fileType) {
      case 'image':
        return (
          <div className="relative flex-1 flex items-center justify-center overflow-auto bg-[#050508] rounded-xl border border-white/5 p-4 min-h-[400px]">
            <div
              className="transition-all duration-300 ease-out"
              style={{ transform: `rotate(${rotation}deg) scale(${zoom / 100})`, maxHeight: '80%', maxWidth: '80%' }}
            >
              <img
                src={previewUrl || attachment.fileUrl}
                alt={attachment.fileName}
                className="rounded-lg shadow-2xl max-h-[450px] max-w-full object-contain pointer-events-none border border-white/5"
                referrerPolicy="no-referrer"
              />
            </div>
            <div className="absolute bottom-3 left-3 bg-[#0c0c12]/90 border border-white/10 px-2.5 py-1.5 rounded-lg shadow-lg text-[10px] font-mono text-zinc-400 flex items-center gap-1.5 backdrop-blur-md">
              <span className="text-blue-400">RESOLUTION: SCALED</span>
              <span className="text-zinc-600">•</span>
              <span>ZOOM: {zoom}%</span>
              <span className="text-zinc-600">•</span>
              <span>ROTN: {rotation}°</span>
            </div>
          </div>
        );

      case 'pdf':
      case 'document':
        return previewUrl ? renderPdf(previewUrl) : null;

      default:
        return (
          <div className="flex-grow flex flex-col items-center justify-center bg-white/2 rounded-xl border border-dashed border-white/10 p-8 text-center min-h-[400px]">
            <FileText className="w-12 h-12 text-zinc-600 mb-3" />
            <h4 className="text-white font-bold text-sm">Preview Unavailable</h4>
            <p className="text-xs text-zinc-400 mt-1 max-w-xs">
              Preview support for "{attachment.fileType}" file format is pending. You can still initialize print wizard layouts.
            </p>
          </div>
        );
    }
  };

  return (
    <div className="flex h-full flex-col bg-[#0c0c12] p-6 gap-5">
      {/* Action panel header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/5 pb-4">
        <div>
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-widest bg-blue-500/10 border border-blue-500/20 text-blue-400 mb-1.5">
            {attachment.source.toUpperCase()} • {attachment.fileType.toUpperCase()}
          </span>
          <h2 className="text-base font-extrabold tracking-tight text-white truncate max-w-md">{attachment.fileName}</h2>
          <p className="text-xs text-zinc-500 mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 font-sans">
            <span>Sender: <strong className="text-zinc-300">{attachment.senderName || attachment.senderNumber}</strong></span>
            {attachment.senderContact && attachment.senderContact !== attachment.senderName && (
              <>
                <span className="text-zinc-700">•</span>
                <span className="text-[11px] font-mono text-zinc-400">{attachment.senderContact}</span>
              </>
            )}
            {!attachment.senderContact && attachment.senderName && attachment.senderName !== attachment.senderNumber && (
              <>
                <span className="text-zinc-700">•</span>
                <span className="text-[11px] font-mono">{attachment.senderNumber}</span>
              </>
            )}
            <span className="text-zinc-700">•</span>
            <span>{new Date(attachment.timestamp).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}</span>
          </p>
          {(attachment.subject || attachment.gmailSubject) && (
            <p className="text-[11px] text-zinc-500 mt-0.5 flex items-center gap-1.5">
              <span className="text-rose-400">✉</span>
              <span className="truncate max-w-md italic">{attachment.subject || attachment.gmailSubject}</span>
            </p>
          )}
        </div>

        {/* Toolbar controls */}
        <div className="flex items-center gap-2.5 shrink-0">
          <div className="flex items-center rounded-xl border border-white/10 p-1 bg-white/5">
            <button onClick={handleZoomOut} className="p-1.5 hover:bg-white/10 rounded-lg text-zinc-400 hover:text-white transition-all" title="Zoom out">
              <ZoomOut className="w-4 h-4" />
            </button>
            <span className="px-2 font-mono text-xs font-bold text-zinc-300 w-12 text-center select-none">{zoom}%</span>
            <button onClick={handleZoomIn} className="p-1.5 hover:bg-white/10 rounded-lg text-zinc-400 hover:text-white transition-all" title="Zoom in">
              <ZoomIn className="w-4 h-4" />
            </button>
            {attachment.fileType === 'image' && (
              <>
                <div className="w-px h-4 bg-white/10 mx-1" />
                <button onClick={handleRotate} className="p-1.5 hover:bg-white/10 rounded-lg text-zinc-400 hover:text-white transition-all" title="Rotate Right">
                  <RotateCw className="w-4 h-4" />
                </button>
              </>
            )}
            <div className="w-px h-4 bg-white/10 mx-1" />
            <button onClick={handleReset} className="p-1.5 hover:bg-white/10 rounded-lg text-zinc-400 hover:text-white text-[10px] font-bold uppercase tracking-wider transition-all px-2.5" title="Reset Zoom">
              Reset
            </button>
          </div>

          <button
            onClick={handleOpenInApp}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 text-zinc-300 text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer"
          >
            <Eye className="w-3.5 h-3.5" />
            <span>Open in App</span>
          </button>

          <button
            onClick={onOpenPrintWizard}
            className="flex items-center gap-1.5 px-4.5 py-2 rounded-xl bg-blue-600 border border-blue-500 hover:bg-blue-500 text-white text-xs font-bold uppercase tracking-wider shadow-[0_4px_25px_rgba(37,99,235,0.45)] transition-all cursor-pointer"
          >
            <Printer className="w-4 h-4" />
            <span>Print</span>
          </button>
        </div>
      </div>

      {/* Main Preview Screen */}
      {getPreviewContent()}
    </div>
  );
}
