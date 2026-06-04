/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { Search, FileText, Image as ImageIcon, Calendar, User, MessageSquare, Inbox, Mail, Paperclip, RefreshCw } from 'lucide-react';
import { Attachment, FileType, SourceType } from '../types';

interface AttachmentListProps {
  attachments: Attachment[];
  selectedAttachmentId: string | null;
  onSelectAttachment: (attachment: Attachment) => void;
  onToggleUnread?: (id: string) => void;
  isSyncing?: boolean;
  onRefresh?: () => void;
}

export default function AttachmentList({
  attachments,
  selectedAttachmentId,
  onSelectAttachment,
  onToggleUnread,
  isSyncing,
  onRefresh
}: AttachmentListProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<'all' | FileType>('all');

  // Format timestamp relative to today, yesterday, etc.
  const groupDateLabel = (isoString: string): string => {
    const date = new Date(isoString);
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);

    if (date.toDateString() === today.toDateString()) {
      return 'Today';
    } else if (date.toDateString() === yesterday.toDateString()) {
      return 'Yesterday';
    } else {
      return date.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
    }
  };

  // Helper size formatter
  const formatSize = (bytes: number): string => {
    if (bytes === 0) return '';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const getFileIcon = (type: FileType) => {
    switch (type) {
      case 'pdf':
        return <FileText className="w-4 h-4 text-rose-400" />;
      case 'image':
        return <ImageIcon className="w-4 h-4 text-emerald-400" />;
      default:
        return <FileText className="w-4 h-4 text-zinc-400" />;
    }
  };

  // Filter & Search attachments from BOTH sources chronologically
  const filteredAttachments = useMemo(() => {
    const sorted = [...attachments].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    
    return sorted.filter(att => {
      const matchesSearch = 
        att.fileName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (att.senderName || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        att.senderNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (att.gmailSubject || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (att.caption || '').toLowerCase().includes(searchQuery.toLowerCase());

      const matchesFilter = activeFilter === 'all' || att.fileType === activeFilter;

      return matchesSearch && matchesFilter;
    });
  }, [attachments, searchQuery, activeFilter]);

  // Group by date
  const groupedAttachments = useMemo(() => {
    const groups: { [key: string]: Attachment[] } = {};
    filteredAttachments.forEach(att => {
      const label = groupDateLabel(att.timestamp);
      if (!groups[label]) {
        groups[label] = [];
      }
      groups[label].push(att);
    });
    return groups;
  }, [filteredAttachments]);

  // Statistics tailored to all combined attachments
  const stats = useMemo(() => {
    const total = attachments.length;
    const pdfCount = attachments.filter(a => a.fileType === 'pdf').length;
    const imageCount = attachments.filter(a => a.fileType === 'image').length;
    return { total, pdfCount, imageCount };
  }, [attachments]);

  return (
    <div className="flex h-full flex-col bg-[#08080c] border-r border-white/5">
      {/* Header */}
      <div className="flex h-[60px] items-center justify-between border-b border-white/5 px-5 bg-white/[0.02]">
        <div className="flex items-center gap-2.5">
          <FileText className="w-4 h-4 text-zinc-400" />
          <h2 className="text-[11px] font-bold tracking-widest text-zinc-300 uppercase">Incoming Files</h2>
          <span className="flex h-5 items-center justify-center rounded-full bg-white/10 px-2 text-[10px] font-bold text-white">
            {attachments.length}
          </span>
        </div>
        
        {onRefresh && (
          <button 
            onClick={onRefresh}
            disabled={isSyncing}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg hover:bg-white/10 transition-colors border border-white/5 bg-white/5 text-zinc-400 hover:text-white"
            title="Fetch Latest Files"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin text-blue-400' : ''}`} />
            <span className="text-[9px] font-bold uppercase tracking-wider">{isSyncing ? 'Syncing...' : 'Refresh'}</span>
          </button>
        )}
      </div>

      {/* Search Header and FileType Tabs */}
      <div className="bg-[#0b0b10] p-4 border-b border-white/5 flex flex-col gap-3">
        {/* Search Header */}
        <div className="relative">
          <span className="absolute inset-y-0 left-0 flex items-center pl-3">
            <Search className="h-4 w-4 text-zinc-500" />
          </span>
          <input
            type="text"
            className="w-full rounded-xl border border-white/10 bg-white/5 pl-9 pr-4 py-2 text-sm text-zinc-200 placeholder-zinc-500 focus:border-blue-500 focus:bg-white/10 focus:outline-hidden focus:ring-1 focus:ring-blue-500/30 transition-all duration-200"
            placeholder="Search files, senders, subjects..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {/* Categories Tabs */}
        <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
          <button
            onClick={() => setActiveFilter('all')}
            className={`rounded-lg px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider whitespace-nowrap transition-all border ${
              activeFilter === 'all'
                ? 'bg-blue-600 border-blue-500 text-white shadow-md shadow-blue-600/30'
                : 'bg-white/5 border-white/5 text-zinc-400 hover:bg-white/10 hover:text-zinc-200'
            }`}
          >
            All ({stats.total})
          </button>
          <button
            onClick={() => setActiveFilter('pdf')}
            className={`rounded-lg px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider whitespace-nowrap transition-all flex items-center gap-1 border ${
              activeFilter === 'pdf'
                ? 'bg-rose-600 border-rose-500 text-white shadow-md shadow-rose-600/30'
                : 'bg-white/5 border-white/5 text-zinc-400 hover:bg-white/10 hover:text-zinc-200'
            }`}
          >
            PDFs ({stats.pdfCount})
          </button>
          <button
            onClick={() => setActiveFilter('image')}
            className={`rounded-lg px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider whitespace-nowrap transition-all flex items-center gap-1 border ${
              activeFilter === 'image'
                ? 'bg-emerald-600 border-emerald-500 text-white shadow-md shadow-emerald-500/30'
                : 'bg-white/5 border-white/5 text-zinc-400 hover:bg-white/10 hover:text-zinc-200'
            }`}
          >
            Images ({stats.imageCount})
          </button>
        </div>
      </div>

      {/* Attachments List Container */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {filteredAttachments.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="rounded-full bg-white/5 border border-white/5 p-4 text-zinc-500 mb-3 shadow-md">
              <Inbox className="w-6 h-6 text-zinc-400" />
            </div>
            <p className="text-zinc-200 font-semibold text-sm">No attachments found</p>
            <p className="text-xs text-zinc-500 mt-1 max-w-[200px]">No printable media matches search parameters</p>
          </div>
        ) : (
          Object.keys(groupedAttachments).map((dateLabel) => (
            <div key={dateLabel} className="space-y-2">
              <div className="flex items-center gap-2 px-1">
                <Calendar className="w-3.5 h-3.5 text-zinc-500" />
                <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest">{dateLabel}</span>
              </div>
              
              <div className="space-y-2 border-l border-zinc-800/50 pl-2 ml-1">
                {groupedAttachments[dateLabel].map((att) => {
                  const isSelected = selectedAttachmentId === att.id;
                  
                  return (
                    <div
                      id={`att-item-${att.id}`}
                      key={att.id}
                      onClick={() => {
                        onSelectAttachment(att);
                        if (att.unread && onToggleUnread) {
                          onToggleUnread(att.id);
                        }
                      }}
                      className={`group relative flex flex-col gap-2 rounded-xl border p-3.5 transition-all duration-200 cursor-pointer ${
                        isSelected
                          ? att.source === 'gmail'
                            ? 'bg-rose-500/10 border-rose-500/80 text-white shadow-[0_0_15px_rgba(239,68,68,0.15)] ring-1 ring-rose-500/25'
                            : 'bg-emerald-500/10 border-emerald-500/80 text-white shadow-[0_0_15px_rgba(16,185,129,0.15)] ring-1 ring-emerald-500/25'
                          : 'bg-[#0d0d14] border-white/5 hover:border-white/10 text-zinc-300 hover:bg-white/2'
                      }`}
                    >
                      <div className="space-y-1.5 w-full">
                        {/* Row 1: Source icon + sender name + timestamp */}
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-xs font-black text-zinc-100 flex items-center gap-1.5 truncate max-w-[190px]">
                            {att.source === 'gmail' ? (
                              <Mail className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                            ) : (
                              <MessageSquare className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                            )}
                            <span className="truncate">{att.senderName || att.senderNumber}</span>
                          </span>
                          <span className="font-mono text-[9px] text-zinc-500 shrink-0">
                            {new Date(att.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>

                        {/* Row 2: Contact detail (phone or email) */}
                        {att.senderContact && att.senderContact !== att.senderName && (
                          <div className="flex items-center gap-1">
                            <User className="w-3 h-3 text-zinc-600 shrink-0" />
                            <span className="font-mono text-[9px] text-zinc-500 truncate max-w-[220px]">{att.senderContact}</span>
                          </div>
                        )}

                        {/* Row 3: File badge */}
                        <div className="flex items-center gap-2 bg-black/45 border border-white/5 py-1.5 px-2.5 rounded-lg text-[11px] text-zinc-200 hover:text-white transition-all">
                          {getFileIcon(att.fileType)}
                          <Paperclip className="w-3 h-3 text-zinc-500 shrink-0" />
                          <span className="font-medium truncate max-w-[130px] font-mono">{att.fileName}</span>
                          {att.fileSize > 0 && (
                            <>
                              <span className="text-zinc-650">•</span>
                              <span className="font-mono text-[9px] text-zinc-500 shrink-0">{formatSize(att.fileSize)}</span>
                            </>
                          )}
                        </div>

                        {/* Row 4: Subject (Gmail) or Caption (WhatsApp) */}
                        {att.source === 'gmail' ? (
                          <div className="space-y-0.5">
                            {(att.subject || att.gmailSubject) && (
                              <div className="text-[10px] font-bold text-zinc-400 truncate">
                                ✉ {att.subject || att.gmailSubject}
                              </div>
                            )}
                            {att.gmailSnippet && (
                              <p className="text-[10px] text-zinc-500 line-clamp-1 italic leading-tight">
                                "{att.gmailSnippet}"
                              </p>
                            )}
                          </div>
                        ) : (
                          att.caption && (
                            <p className="text-[10px] text-zinc-500 line-clamp-1 italic leading-tight">
                              "{att.caption}"
                            </p>
                          )
                        )}

                        {/* Unread Status Dot Indicator */}
                        {att.unread && (
                          <span className={`absolute top-3.5 right-3 h-2 w-2 rounded-full ${
                            att.source === 'gmail' ? 'bg-rose-500 shadow-[0_0_8px_rgba(239,68,68,0.95)]' : 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.95)]'
                          } animate-pulse`} />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
