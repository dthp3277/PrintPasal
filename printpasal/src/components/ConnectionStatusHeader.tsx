import React, { useState, useRef, useEffect } from 'react';
import { Smartphone, Mail, CheckCircle, AlertTriangle, XCircle, LogOut, RefreshCw, Power } from 'lucide-react';
import { ServiceInfo, ServiceStatus } from '../types';
import ConnectionModal from './ConnectionModal';

interface ConnectionStatusHeaderProps {
  waInfo: ServiceInfo;
  gmailInfo: ServiceInfo;
  onTerminateWA: () => void;
  onTerminateGmail: () => void;
  onConnectWA: () => void;
  onConnectGmail: () => void;
}

export default function ConnectionStatusHeader({
  waInfo,
  gmailInfo,
  onTerminateWA,
  onTerminateGmail,
  onConnectWA,
  onConnectGmail,
}: ConnectionStatusHeaderProps) {
  const [expandedService, setExpandedService] = useState<'whatsapp' | 'gmail' | null>(null);
  const [connectTarget, setConnectTarget] = useState<'whatsapp' | 'gmail' | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setExpandedService(null);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [wrapperRef]);

  const getStatusDetails = (status: ServiceStatus) => {
    switch (status) {
      case 'connected':
      case 'syncing':
        return {
          icon: <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />,
          colorClass: 'text-emerald-400',
          dotClass: 'bg-emerald-400',
          pingClass: 'bg-emerald-400',
          pulse: false,
          text: status === 'syncing' ? 'Syncing' : 'Connected',
        };
      case 'pending':
      case 'auth_required':
        return {
          icon: <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />,
          colorClass: 'text-amber-400',
          dotClass: 'bg-amber-400',
          pingClass: 'bg-amber-400',
          pulse: true,
          text: status === 'auth_required' ? 'Auth Needed' : 'Pending',
        };
      case 'disconnected':
      case 'failed':
      case 'expired':
      default:
        return {
          icon: <XCircle className="w-3.5 h-3.5 text-rose-400" />,
          colorClass: 'text-rose-400',
          dotClass: 'bg-rose-400',
          pingClass: 'bg-rose-400',
          pulse: false,
          text: status === 'failed' ? 'Failed' : status === 'expired' ? 'Expired' : 'Terminated',
        };
    }
  };

  const waDetails = getStatusDetails(waInfo.status);
  const gmDetails = getStatusDetails(gmailInfo.status);

  const toggleExpanded = (service: 'whatsapp' | 'gmail') => {
    setExpandedService(prev => prev === service ? null : service);
  };

  const handleOpenConnect = (service: 'whatsapp' | 'gmail') => {
    setConnectTarget(service);
    if (service === 'whatsapp') onConnectWA();
    // Gmail: do NOT call onConnectGmail() here — the modal drives the full
    // OAuth flow via /api/gmail/auth-url and /api/gmail/auth-code.
    setExpandedService(null);
  };

  return (
    <>
      <header className="relative flex h-16 items-center justify-between border-b border-white/5 bg-[#0a0a0f] px-8 shadow-2xl z-40">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-md">
            <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946C.06 5.348 5.397.01 12.008.01c3.202.001 6.212 1.246 8.477 3.514 2.266 2.268 3.507 5.28 3.505 8.484-.004 6.657-5.34 11.997-11.953 11.997-2.005-.001-3.973-.502-5.717-1.455L0 24zm6.59-4.846c1.6.95 3.188 1.449 4.825 1.451 5.436 0 9.86-4.37 9.864-9.799.002-2.63-1.023-5.101-2.885-6.965C16.488 2.01 14.07 1.012 11.516 1.012c-5.44 0-9.866 4.372-9.87 9.802 0 1.714.475 3.393 1.374 4.82L2.094 21.03l5.523-1.443c-1.52.83-1.45.74.03.433z"/>
            </svg>
          </div>
          <div>
            <h1 className="font-sans text-base font-black tracking-tight text-white uppercase">
              PrintPasal
            </h1>
            <p className="font-sans text-[10px] text-zinc-400 font-medium leading-normal">
              Dhiraj and Biraj Stationery
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4" ref={wrapperRef}>
          {/* WhatsApp Indicator Button */}
          <div className="relative">
            <button
              onClick={() => toggleExpanded('whatsapp')}
              className={`flex items-center gap-3 rounded-xl border py-1.5 px-3 transition-all ${expandedService === 'whatsapp' ? 'bg-white/10 border-white/20' : 'bg-white/5 border-white/10 hover:bg-white/10'}`}
            >
              <div className="relative flex h-2 w-2 mt-0.5">
                {waDetails.pulse && <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 ${waDetails.pingClass}`}></span>}
                <span className={`relative inline-flex h-2 w-2 rounded-full ${waDetails.dotClass}`}></span>
              </div>
              <div className="flex flex-col items-start text-left">
                <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-300">WhatsApp</span>
                <span className={`text-[10px] ${waDetails.colorClass} truncate max-w-[100px] leading-tight`}>
                  {waInfo.status === 'connected' ? waInfo.account || 'Linked' : waDetails.text}
                </span>
              </div>
            </button>
            
            {/* WhatsApp Dropdown */}
            {expandedService === 'whatsapp' && (
              <div className="absolute right-0 top-12 w-64 bg-[#0a0a0f] border border-white/10 rounded-xl shadow-2xl p-4 z-50 flex flex-col gap-3">
                 <div className="flex items-center gap-3 mb-2 border-b border-white/5 pb-3">
                    <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400">
                      <Smartphone className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-white text-xs font-bold uppercase tracking-wider">WhatsApp Status</h4>
                      <p className={`text-[10px] ${waDetails.colorClass} font-semibold uppercase tracking-wider`}>{waDetails.text}</p>
                    </div>
                 </div>

                 {waInfo.status === 'connected' ? (
                   <div className="flex flex-col gap-3">
                     <div className="bg-black/20 p-2.5 rounded-lg border border-white/5">
                        <span className="block text-[9px] text-zinc-500 uppercase tracking-wider font-bold mb-1">Connected Number</span>
                        <span className="font-mono text-zinc-300 text-sm">{waInfo.account || 'Linked Device'}</span>
                     </div>
                     <button onClick={() => { onTerminateWA(); setExpandedService(null); }} className="w-full flex items-center justify-center gap-2 py-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 text-xs font-bold uppercase tracking-wider rounded-lg border border-rose-500/20 transition-colors">
                       <Power className="w-3.5 h-3.5" /> Terminate Session
                     </button>
                   </div>
                 ) : (
                   <div className="flex flex-col gap-3">
                     <p className="text-xs text-zinc-400">Your WhatsApp Business API session is currently not active.</p>
                     <button onClick={() => handleOpenConnect('whatsapp')} className="w-full flex items-center justify-center gap-2 py-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 text-xs font-bold uppercase tracking-wider rounded-lg border border-emerald-500/20 transition-colors">
                       <RefreshCw className="w-3.5 h-3.5" /> Link Device
                     </button>
                   </div>
                 )}
              </div>
            )}
          </div>

          {/* Gmail Indicator Button */}
          <div className="relative">
            <button
              onClick={() => toggleExpanded('gmail')}
              className={`flex items-center gap-3 rounded-xl border py-1.5 px-3 transition-all ${expandedService === 'gmail' ? 'bg-white/10 border-white/20' : 'bg-white/5 border-white/10 hover:bg-white/10'}`}
            >
              <div className="relative flex h-2 w-2 mt-0.5">
                {gmDetails.pulse && <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 ${gmDetails.pingClass}`}></span>}
                <span className={`relative inline-flex h-2 w-2 rounded-full ${gmDetails.dotClass}`}></span>
              </div>
              <div className="flex flex-col items-start text-left">
                <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-300">Gmail</span>
                <span className={`text-[10px] ${gmDetails.colorClass} truncate max-w-[120px] leading-tight`}>
                  {(gmailInfo.status === 'connected' || gmailInfo.status === 'syncing') ? gmailInfo.account || 'Linked' : gmDetails.text}
                </span>
              </div>
            </button>

            {/* Gmail Dropdown */}
            {expandedService === 'gmail' && (
              <div className="absolute right-0 top-12 w-64 bg-[#0a0a0f] border border-white/10 rounded-xl shadow-2xl p-4 z-50 flex flex-col gap-3">
                 <div className="flex items-center gap-3 mb-2 border-b border-white/5 pb-3">
                    <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400">
                      <Mail className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-white text-xs font-bold uppercase tracking-wider">Gmail Status</h4>
                      <p className={`text-[10px] ${gmDetails.colorClass} font-semibold uppercase tracking-wider`}>{gmDetails.text}</p>
                    </div>
                 </div>

                 {gmailInfo.status === 'connected' || gmailInfo.status === 'syncing' ? (
                   <div className="flex flex-col gap-3">
                     <div className="bg-black/20 p-2.5 rounded-lg border border-white/5 overflow-hidden">
                        <span className="block text-[9px] text-zinc-500 uppercase tracking-wider font-bold mb-1">Connected Account</span>
                        <span className="font-mono text-zinc-300 text-xs truncate block">{gmailInfo.account || 'Linked Account'}</span>
                     </div>
                     <button onClick={() => { onTerminateGmail(); setExpandedService(null); }} className="w-full flex items-center justify-center gap-2 py-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 text-xs font-bold uppercase tracking-wider rounded-lg border border-rose-500/20 transition-colors">
                       <Power className="w-3.5 h-3.5" /> Terminate Session
                     </button>
                   </div>
                 ) : (
                   <div className="flex flex-col gap-3">
                     <p className="text-xs text-zinc-400">Your Gmail IMAP session is currently disconnected.</p>
                     <button onClick={() => handleOpenConnect('gmail')} className="w-full flex items-center justify-center gap-2 py-2 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 text-xs font-bold uppercase tracking-wider rounded-lg border border-blue-500/20 transition-colors">
                       <RefreshCw className="w-3.5 h-3.5" /> Connect Account
                     </button>
                   </div>
                 )}
              </div>
            )}
          </div>
        </div>
      </header>

      <ConnectionModal
        isOpen={connectTarget !== null}
        onClose={() => setConnectTarget(null)}
        waInfo={waInfo}
        gmailInfo={gmailInfo}
        target={connectTarget}
      />
    </>
  );
}
