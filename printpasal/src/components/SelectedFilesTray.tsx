/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { FileText, Image as ImageIcon, X, Printer, Trash2, Mail, MessageSquare, Paperclip, Loader2 } from 'lucide-react';
import { Attachment, FileType } from '../types';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

interface SelectedFilesTrayProps {
  selectedAttachments: Attachment[];
  onRemove: (id: string) => void;
  onClearAll: () => void;
  onOpenPrintWizard: () => void;
}

function Thumbnail({ attachment }: { attachment: Attachment }) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (attachment.fileType === 'image' || attachment.fileType === 'pdf') {
      setPreviewUrl(attachment.fileUrl);
    } else if (attachment.fileType === 'document') {
      setIsLoading(true);
      fetch(`/api/preview?filename=${encodeURIComponent(attachment.fileName)}`)
        .then(res => res.json())
        .then(data => setPreviewUrl(data.url))
        .catch(err => console.error('Thumbnail fetch error:', err))
        .finally(() => setIsLoading(false));
    }
  }, [attachment]);

  if (isLoading) {
    return (
      <div className="w-12 h-12 bg-white/5 rounded-lg border border-white/5 flex items-center justify-center">
        <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />
      </div>
    );
  }

  if (attachment.fileType === 'image' && previewUrl) {
    return (
      <div className="w-12 h-12 rounded-lg border border-white/10 overflow-hidden bg-black/40">
        <img src={previewUrl} alt="" className="w-full h-full object-cover" />
      </div>
    );
  }

  if ((attachment.fileType === 'pdf' || attachment.fileType === 'document') && previewUrl) {
    return (
      <div className="w-12 h-12 rounded-lg border border-white/10 overflow-hidden bg-white flex items-center justify-center scale-[0.25] origin-top-left" style={{ width: '48px', height: '48px' }}>
        <div className="scale-[0.25] origin-top-left" style={{ width: '192px', height: '192px' }}>
          <Document file={previewUrl} loading={null} error={null}>
            <Page pageNumber={1} width={192} renderTextLayer={false} renderAnnotationLayer={false} />
          </Document>
        </div>
      </div>
    );
  }

  return (
    <div className="w-12 h-12 bg-black/40 p-2.5 rounded-lg border border-white/5 flex items-center justify-center">
      {attachment.fileType === 'pdf' ? (
        <FileText className="w-5 h-5 text-emerald-400" />
      ) : attachment.fileType === 'image' ? (
        <ImageIcon className="w-5 h-5 text-emerald-400" />
      ) : (
        <FileText className="w-5 h-5 text-zinc-400" />
      )}
    </div>
  );
}

export default function SelectedFilesTray({
  selectedAttachments,
  onRemove,
  onClearAll,
  onOpenPrintWizard
}: SelectedFilesTrayProps) {
  
  const formatSize = (bytes: number): string => {
    if (bytes === 0) return '';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  if (selectedAttachments.length === 0) return null;

  return (
    <div className="flex h-full flex-col bg-[#0c0c12] p-6 gap-6">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/5 pb-4">
        <div>
          <h2 className="text-base font-extrabold tracking-tight text-white uppercase tracking-widest flex items-center gap-2">
            Selected Files
            <span className="bg-blue-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
              {selectedAttachments.length}
            </span>
          </h2>
          <p className="text-xs text-zinc-500 mt-1 font-sans">
            Batch processing ready for physical production.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={onClearAll}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/5 border border-white/10 hover:bg-rose-500/10 hover:text-rose-400 hover:border-rose-500/20 text-zinc-400 text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Clear Selection</span>
          </button>

          <button
            onClick={onOpenPrintWizard}
            className="flex items-center gap-1.5 px-4.5 py-2 rounded-xl bg-blue-600 border border-blue-500 hover:bg-blue-500 text-white text-xs font-bold uppercase tracking-wider shadow-[0_4px_25px_rgba(37,99,235,0.45)] transition-all cursor-pointer"
          >
            <Printer className="w-4 h-4" />
            <span>Print All ({selectedAttachments.length})</span>
          </button>
        </div>
      </div>

      {/* Selected List */}
      <div className="flex-1 overflow-y-auto space-y-3 pr-2 scrollbar-thin">
        {selectedAttachments.map((att) => (
          <div 
            key={att.id}
            className="group bg-[#0d0d14] border border-white/5 hover:border-white/10 rounded-xl p-3.5 flex items-center justify-between transition-all"
          >
            <div className="flex items-center gap-4 min-w-0 flex-1">
              <Thumbnail attachment={att} />
              
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-0.5">
                   {att.source === 'gmail' ? (
                      <Mail className="w-3 h-3 text-rose-500" />
                    ) : (
                      <MessageSquare className="w-3 h-3 text-emerald-500" />
                    )}
                  <span className="text-[11px] font-bold text-zinc-100 truncate">
                    {att.senderName || att.senderNumber}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                   <Paperclip className="w-3 h-3 text-zinc-600 shrink-0" />
                   <span className="text-[10px] text-zinc-400 font-mono truncate">{att.fileName}</span>
                   {att.fileSize > 0 && (
                     <>
                      <span className="text-zinc-800">•</span>
                      <span className="text-[9px] font-mono text-zinc-500">{formatSize(att.fileSize)}</span>
                     </>
                   )}
                </div>
              </div>
            </div>

            <button 
              onClick={() => onRemove(att.id)}
              className="p-1.5 rounded-lg text-zinc-600 hover:bg-white/5 hover:text-white transition-all opacity-0 group-hover:opacity-100"
              title="Remove from selection"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>

      {/* Production Info Footer */}
      <div className="bg-[#0b0b10] border border-white/5 rounded-xl p-4 flex items-center justify-between">
         <div className="flex items-center gap-3">
            <div className="h-10 w-10 bg-blue-500/10 border border-blue-500/20 rounded-xl flex items-center justify-center">
               <Printer className="w-5 h-5 text-blue-400" />
            </div>
            <div>
               <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-0.5">Production Queue</p>
               <p className="text-xs text-white font-mono">{selectedAttachments.length} Documents Spooled</p>
            </div>
         </div>
         <div className="text-right">
            <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-0.5">Estimated Time</p>
            <p className="text-xs text-blue-400 font-mono">~{selectedAttachments.length * 2} seconds</p>
         </div>
      </div>
    </div>
  );
}
