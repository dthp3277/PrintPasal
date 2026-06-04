/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import ConnectionStatusHeader from './components/ConnectionStatusHeader';
import AttachmentList from './components/AttachmentList';
import AttachmentPreview from './components/AttachmentPreview';
import PrinterWorkflow from './components/PrinterWorkflow';
import { Attachment, ServiceInfo } from './types';
import { Wifi, Plus, HelpCircle, Activity, Info, MessageSquare } from 'lucide-react';

const MOCK_ATTACHMENTS: Attachment[] = [];

export default function App() {
  const [waInfo, setWaInfo] = useState<ServiceInfo>({ status: 'disconnected' });
  const [gmailInfo, setGmailInfo] = useState<ServiceInfo>({ status: 'disconnected' });
  const [websocketUrl, setWebsocketUrl] = useState(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${window.location.host}/ws`;
  });
  const [attachments, setAttachments] = useState<Attachment[]>(MOCK_ATTACHMENTS);
  const [selectedAttachment, setSelectedAttachment] = useState<Attachment | null>(null);
  const [isPrintWizardOpen, setIsPrintWizardOpen] = useState(false);
  const [simulationAlert, setSimulationAlert] = useState<string | null>(null);
  const [isGmailSyncing, setIsGmailSyncing] = useState(false);

  const socketRef = useRef<WebSocket | null>(null);

  const fetchFiles = () => {
    fetch('/api/files')
      .then(res => res.json())
      .then(data => {
        if (!data) return;
        const fetchedAttachments: Attachment[] = data.map((item: any, index: number) => {
          const senderName = item.sender_name || item.sender || '';
          const senderContact = item.sender_contact || '';
          const source = (item.source || 'unknown').toLowerCase() as Attachment['source'];
          // Determine the display contact: phone for WA, email for Gmail
          const senderNumber = senderContact || senderName || 'Unknown';
          const ext = (item.filename || '').split('.').pop()?.toLowerCase();
          const fileType: Attachment['fileType'] = ext === 'pdf' ? 'pdf'
            : ['jpg','jpeg','png','gif','webp','bmp'].includes(ext || '') ? 'image'
            : 'other';
          return {
            id: `file-${item.filename}-${index}`,
            senderName: senderName || undefined,
            senderNumber,
            senderContact: senderContact || undefined,
            timestamp: item.time || new Date().toISOString(),
            fileName: item.filename,
            fileSize: item.file_size || 0,
            fileType,
            fileUrl: `/downloads/${item.filename}`,
            caption: item.caption || '',
            subject: item.subject || undefined,
            gmailSubject: item.subject || undefined,
            unread: false,
            source,
          } as Attachment;
        });
        setAttachments(fetchedAttachments);
        if (fetchedAttachments.length > 0 && !selectedAttachment) {
          setSelectedAttachment(fetchedAttachments[0]);
        }
      })
      .catch(err => console.error("Error fetching files:", err));
  };

  useEffect(() => {
    fetchFiles();
  }, []);

  // Core WebSocket Client Connector for the Go Backend integration
  useEffect(() => {
    if (!websocketUrl) return;

    console.log(`[WebSocket] Initiating link with: ${websocketUrl}`);
    setWaInfo(prev => ({ ...prev, status: 'pending' }));
    setGmailInfo(prev => ({ ...prev, status: 'pending' }));

    try {
      const socket = new WebSocket(websocketUrl);
      socketRef.current = socket;

      socket.onopen = () => {
        console.log('[WebSocket] Linked with Go Backend securely');
      };

      socket.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          console.log('[WebSocket] Message received:', message);

          if (message.type === 'status') {
            const p = message.payload || {};
            if (p.whatsapp) {
              setWaInfo(prev => ({
                ...prev,
                status: p.whatsapp,
                qrCode: p.wa_qr !== undefined ? p.wa_qr : prev.qrCode,
                account: p.whatsapp_account || p.wa_number || prev.account
              }));
            }
            if (p.gmail) {
              setGmailInfo(prev => ({
                ...prev,
                status: p.gmail,
                account: p.gmail_account || prev.account
              }));
            }
          } else if (message.type === 'qr') {
            // WhatsApp QR code — payload is the raw QR string (not base64 image)
            // We store it as-is; the modal renders it as a text QR or we convert
            setWaInfo(prev => ({
              ...prev,
              status: 'pending',
              qrCode: message.payload as string,
            }));
          } else if (message.type === 'file') {
            const raw = message.payload;
            const senderName = raw.sender_name || raw.sender || 'Unknown';
            const senderContact = raw.sender_contact || '';
            const source = (raw.source || 'whatsapp').toLowerCase() as Attachment['source'];
            const filename = raw.filename || 'document.pdf';
            const ext = filename.split('.').pop()?.toLowerCase();
            const fileType: Attachment['fileType'] = ext === 'pdf' ? 'pdf'
              : ['jpg','jpeg','png','gif','webp','bmp'].includes(ext || '') ? 'image'
              : 'other';
            const newAtt: Attachment = {
              id: `file-${filename}-${Date.now()}`,
              senderName: senderName !== 'Unknown' ? senderName : undefined,
              senderNumber: senderContact || senderName,
              senderContact: senderContact || undefined,
              timestamp: raw.time || new Date().toISOString(),
              fileName: filename,
              fileSize: raw.file_size || 0,
              fileType,
              fileUrl: `/downloads/${filename}`,
              caption: raw.caption || '',
              subject: raw.subject || undefined,
              gmailSubject: raw.subject || undefined,
              unread: true,
              source,
            };

            setAttachments(prev => {
              // Ensure we don't add duplicate IDs
              if (prev.some(a => a.fileName === newAtt.fileName)) return prev;
              return [newAtt, ...prev];
            });
            
            // Show alert bubble
            showTempNotification(`New ${newAtt.source === 'gmail' ? 'Gmail attachment' : 'WhatsApp attachment'} received: ${newAtt.fileName}`);
            
            // Also fetch to ensure we are fully synchronized
            fetchFiles();
            setIsGmailSyncing(false);
          } else if (message.type === 'sync_complete') {
            setIsGmailSyncing(false);
            fetchFiles();
          }
        } catch (err) {
          console.error('[WebSocket] Erroneous JSON structural frame:', err);
        }
      };

      socket.onerror = (e) => {
        console.log('[WebSocket] Passive offline mode - Go backend connection failed, using diagnostic simulator.');
        setWaInfo(prev => ({ ...prev, status: 'disconnected' }));
        setGmailInfo(prev => ({ ...prev, status: 'disconnected' }));
      };

      socket.onclose = () => {
        console.log('[WebSocket] Link closed');
        setWaInfo(prev => ({ ...prev, status: 'disconnected' }));
        setGmailInfo(prev => ({ ...prev, status: 'disconnected' }));
      };

      return () => {
        socket.close();
      };
    } catch (e) {
      console.warn('[WebSocket] Constructor failure. Proceeding with frontend state.', e);
      setWaInfo(prev => ({ ...prev, status: 'disconnected' }));
      setGmailInfo(prev => ({ ...prev, status: 'disconnected' }));
    }
  }, [websocketUrl]);

  const showTempNotification = (msg: string) => {
    setSimulationAlert(msg);
    setTimeout(() => setSimulationAlert(null), 4000);
  };

  const handleSelectAttachment = (att: Attachment) => {
    setSelectedAttachment(att);
  };

  const sendWsCommand = (cmd: string, target: string) => {
    const url = cmd === 'terminate'
      ? `/api/terminate/${target}`
      : cmd === 'connect'
      ? `/api/connect/${target}`
      : cmd === 'refresh'
      ? `/api/sync/gmail`
      : null;
    if (url) {
      fetch(url, { method: 'POST' }).catch(err => console.error('[API] Command failed:', err));
    }
  };

  const handleToggleUnread = (id: string) => {
    setAttachments(prev =>
      prev.map(att => att.id === id ? { ...att, unread: false } : att)
    );
  };

  // Triggers manual mock WhatsApp influx
  const handleTriggerMockReceive = () => {
    const isPdf = Math.random() > 0.5;
    const mockFiles = [
      { senderName: 'Michael Scott', senderNumber: '+1 (555) 302-9918' },
      { senderNumber: '+91 88776 65544' }, // Name omitted on purpose!
      { senderName: 'Dwight Schrute', senderNumber: '+1 (555) 902-8812' },
      { senderNumber: '+1 (555) 443-2211' } // Name omitted on purpose!
    ];
    const chosenSender = mockFiles[Math.floor(Math.random() * mockFiles.length)];
    
    const mockFile: Attachment = isPdf
      ? {
          id: `att-mock-wa-${Date.now()}`,
          senderName: chosenSender.senderName,
          senderNumber: chosenSender.senderNumber,
          timestamp: new Date().toISOString(),
          fileName: `Purchase_Order_M${Math.floor(Math.random() * 800) + 100}.pdf`,
          fileSize: 68040 + Math.floor(Math.random() * 50000),
          fileType: 'pdf',
          fileUrl: '',
          caption: 'Confirm layout and route to paper printer ASAP.',
          unread: true,
          source: 'whatsapp',
        }
      : {
          id: `att-mock-wa-${Date.now()}`,
          senderName: chosenSender.senderName,
          senderNumber: chosenSender.senderNumber,
          timestamp: new Date().toISOString(),
          fileName: `Production_Stock_Photo_${Math.floor(Math.random() * 9) + 1}.png`,
          fileSize: 220100 + Math.floor(Math.random() * 150000),
          fileType: 'image',
          fileUrl: 'https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?w=800&auto=format&fit=crop',
          caption: 'Visual draft of the shipment palette tags ready for clearance.',
          unread: true,
          source: 'whatsapp',
        };

    setAttachments(prev => [mockFile, ...prev]);
    setSelectedAttachment(mockFile);
    showTempNotification(`Simulated WhatsApp Inflow: ${mockFile.fileName}`);
  };

  // Triggers manual mock Gmail sync influx
  const handleTriggerMockGmailReceive = () => {
    const isPdf = Math.random() > 0.5;
    const gmailSenders = [
      { senderName: 'Acme Billing Solutions', senderNumber: 'billing@acme-solutions.org' },
      { senderName: 'Industrial Suppliers Co', senderNumber: 'suppliers@industrialsafe.net' },
      { senderName: 'Shipping Terminal 4', senderNumber: 't4-shipping@portpartners.com' }
    ];
    const chosenSender = gmailSenders[Math.floor(Math.random() * gmailSenders.length)];
    
    const mockFile: Attachment = isPdf
      ? {
          id: `att-mock-gm-${Date.now()}`,
          senderName: chosenSender.senderName,
          senderNumber: chosenSender.senderNumber,
          timestamp: new Date().toISOString(),
          fileName: `Supplier_Invoice_${Math.floor(Math.random() * 900) + 100}.pdf`,
          fileSize: 48000 + Math.floor(Math.random() * 70000),
          fileType: 'pdf',
          fileUrl: '',
          caption: 'Please print invoice out directly for administrative validation ledger approval.',
          unread: true,
          source: 'gmail',
          gmailSubject: `Verified Document Attachment: Invoice ID #${Math.floor(Math.random() * 90000) + 10000}`,
          gmailSnippet: 'Attached is the final verified billing artifact package ready for mechanical spool print routing.',
        }
      : {
          id: `att-mock-gm-${Date.now()}`,
          senderName: chosenSender.senderName,
          senderNumber: chosenSender.senderNumber,
          timestamp: new Date().toISOString(),
          fileName: `Cargo_Container_Tag_${Math.floor(Math.random() * 10) + 1}.png`,
          fileSize: 180200 + Math.floor(Math.random() * 130000),
          fileType: 'image',
          fileUrl: 'https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?w=800&auto=format&fit=crop',
          caption: 'Attached dispatch batch packaging photo for dock inventory check logs.',
          unread: true,
          source: 'gmail',
          gmailSubject: `URGENT: Stock Arrival Photo - Batch Ref #${Math.floor(Math.random() * 900) + 100}`,
          gmailSnippet: 'Please spool structural physical verification copy. Direct photo attached.',
        };

    setAttachments(prev => [mockFile, ...prev]);
    setSelectedAttachment(mockFile);
    showTempNotification(`Simulated Gmail Arrival: ${mockFile.fileName}`);
  };

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-[#06060a] text-zinc-300 antialiased font-sans">
      
      {/* Top Banner Status Header */}
      <ConnectionStatusHeader 
        waInfo={waInfo}
        gmailInfo={gmailInfo}
        onTerminateWA={() => sendWsCommand('terminate', 'whatsapp')}
        onConnectWA={() => sendWsCommand('connect', 'whatsapp')}
        onTerminateGmail={() => sendWsCommand('terminate', 'gmail')}
        onConnectGmail={() => sendWsCommand('connect', 'gmail')}
      />

      {/* Main Workspace Frame Splitter */}
      <div className="flex flex-1 min-h-0 relative">
        
        {/* Unread Alert Overlay */}
        {simulationAlert && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 bg-[#0c0c18] text-white text-xs font-bold px-4.5 py-2.5 rounded-xl shadow-[0_4px_30px_rgba(59,130,246,0.4)] border border-blue-500/40 flex items-center gap-2 backdrop-blur-md">
            <span className="h-2 w-2 rounded-full bg-blue-400 animate-ping" />
            <span className="font-mono text-[11px] tracking-wide uppercase">{simulationAlert}</span>
          </div>
        )}

        {/* Column 1: Left List panel (1/3 size) */}
        <div id="attachments-panel" className="w-[380px] shrink-0 h-full border-r border-white/5">
          <AttachmentList 
            attachments={attachments}
            selectedAttachmentId={selectedAttachment ? selectedAttachment.id : null}
            onSelectAttachment={handleSelectAttachment}
            onToggleUnread={handleToggleUnread}
            isSyncing={isGmailSyncing}
            onRefresh={() => {
              setIsGmailSyncing(true);
              sendWsCommand('refresh', 'gmail');
              // Fallback fetch in case WebSocket doesn't fire sync_complete
              setTimeout(() => {
                fetchFiles();
                setIsGmailSyncing(false);
              }, 4000);
            }}
          />
        </div>

        {/* Column 2: Central Work & Preview Panel (2/3 size) */}
        <div id="preview-panel" className="flex-1 h-full overflow-hidden flex flex-col bg-[#09090e]">
          <div className="flex-1 min-h-0">
            <AttachmentPreview 
              attachment={selectedAttachment}
              onOpenPrintWizard={() => setIsPrintWizardOpen(true)}
            />
          </div>

          {/* Quick instructions and debug terminal bar at the very footer */}
          <div className="bg-[#0b0b10] border-t border-white/5 px-6 py-3.5 flex flex-col sm:flex-row sm:items-center justify-end gap-3 text-xs text-zinc-500">
            
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {/* WhatsApp Simulator Button */}
              <button
                id="btn-simulate-recv"
                type="button"
                onClick={handleTriggerMockReceive}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 rounded-xl border border-emerald-500/30 text-emerald-400 font-bold uppercase tracking-wider text-[9px] transition-all cursor-pointer shadow-[0_0_15px_rgba(16,185,129,0.1)]"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Simulate WhatsApp Influx</span>
              </button>

              {/* Gmail Simulator Button */}
              <button
                id="btn-simulate-sync"
                type="button"
                onClick={handleTriggerMockGmailReceive}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 rounded-xl border border-rose-500/30 text-rose-400 font-bold uppercase tracking-wider text-[9px] transition-all cursor-pointer shadow-[0_0_15px_rgba(239,68,68,0.1)]"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Simulate Gmail Arrival</span>
              </button>
            </div>
          </div>
        </div>

      </div>

      {/* Printer Step-by-Step UI wizard overlay */}
      {isPrintWizardOpen && selectedAttachment && (
        <PrinterWorkflow 
          attachment={selectedAttachment}
          onClose={() => setIsPrintWizardOpen(false)}
        />
      )}
    </div>
  );
}
