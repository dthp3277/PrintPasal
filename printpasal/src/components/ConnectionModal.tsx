import React, { useState, useEffect } from 'react';
import { X, Smartphone, Mail, AlertTriangle, RefreshCw, CheckCircle, ExternalLink, ClipboardPaste, ArrowRight } from 'lucide-react';
import { ServiceInfo } from '../types';
import QRCodeDisplay from './QRCodeDisplay';

interface ConnectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  waInfo: ServiceInfo;
  gmailInfo: ServiceInfo;
  target: 'whatsapp' | 'gmail' | null;
}

// ─── Gmail Auth Flow ────────────────────────────────────────────────────────

type GmailStep = 'idle' | 'loading_url' | 'awaiting_code' | 'submitting' | 'success' | 'error';

function GmailAuthPanel({ gmailInfo, onClose }: { gmailInfo: ServiceInfo; onClose: () => void }) {
  const [step, setStep] = useState<GmailStep>('idle');
  const [authUrl, setAuthUrl] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // If already connected, show connected state
  const isConnected = gmailInfo.status === 'connected' || gmailInfo.status === 'syncing';

  // Reset to idle if the modal is re-opened (target switches to gmail)
  useEffect(() => {
    setStep('idle');
    setAuthUrl(null);
    setCode('');
    setErrorMsg(null);
  }, []);

  const handleSignIn = async () => {
    setStep('loading_url');
    setErrorMsg(null);
    try {
      const res = await fetch('/api/gmail/auth-url');
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setAuthUrl(data.url);
      window.open(data.url, '_blank', 'noopener,noreferrer');
      setStep('awaiting_code');
    } catch (e: any) {
      setErrorMsg(e?.message || 'Failed to get authorization URL');
      setStep('error');
    }
  };

  const handleSubmitCode = async () => {
    if (!code.trim()) return;
    setStep('submitting');
    setErrorMsg(null);
    try {
      const res = await fetch('/api/gmail/auth-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: code.trim() }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || 'Authorization failed');
      }
      setStep('success');
    } catch (e: any) {
      setErrorMsg(e?.message || 'Failed to verify code');
      setStep('error');
    }
  };

  if (isConnected || step === 'success') {
    const email = gmailInfo.account || 'Linked Account';
    return (
      <div className="flex flex-col items-center text-center space-y-4 py-4">
        <div className="w-16 h-16 rounded-full bg-blue-500/20 flex items-center justify-center ring-2 ring-blue-500/30">
          <CheckCircle className="w-8 h-8 text-blue-400" />
        </div>
        <div>
          <p className="text-blue-400 font-bold uppercase tracking-wider text-xs mb-1">Connected</p>
          <p className="text-zinc-300 font-mono text-sm">{step === 'success' ? (gmailInfo.account || 'Verifying…') : email}</p>
        </div>
        <button
          onClick={onClose}
          className="mt-2 px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg uppercase tracking-wider text-xs transition-colors"
        >
          Done
        </button>
      </div>
    );
  }

  if (step === 'idle') {
    return (
      <div className="flex flex-col items-center text-center space-y-5 py-2">
        {/* Google logo */}
        <div className="w-14 h-14 rounded-2xl bg-white flex items-center justify-center shadow-lg">
          <svg viewBox="0 0 48 48" className="w-8 h-8">
            <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
            <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
            <path fill="#FBBC05" d="M10.53 28.59c-.5-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.55 10.78l7.98-6.19z"/>
            <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.55 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
          </svg>
        </div>
        <div>
          <p className="text-white font-bold text-sm">Sign in with Google</p>
          <p className="text-zinc-500 text-[11px] mt-1 max-w-[240px] leading-relaxed">
            You'll be redirected to Google to authorize access to your Gmail inbox.
          </p>
        </div>
        <button
          id="btn-gmail-signin"
          onClick={handleSignIn}
          className="w-full flex items-center justify-center gap-2.5 py-2.5 px-4 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white font-bold rounded-xl text-xs uppercase tracking-wider transition-all shadow-[0_0_20px_rgba(59,130,246,0.3)] hover:shadow-[0_0_28px_rgba(59,130,246,0.45)]"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          Open Google Sign-In
        </button>
      </div>
    );
  }

  if (step === 'loading_url') {
    return (
      <div className="flex flex-col items-center gap-4 text-center py-6">
        <RefreshCw className="w-9 h-9 text-blue-400 animate-spin" />
        <p className="text-zinc-400 text-xs font-semibold uppercase tracking-wider">Opening Google…</p>
      </div>
    );
  }

  if (step === 'awaiting_code' || step === 'submitting') {
    return (
      <div className="flex flex-col gap-4 py-2">
        {/* Step indicators */}
        <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider">
          <span className="flex items-center justify-center w-5 h-5 rounded-full bg-blue-600 text-white text-[9px]">✓</span>
          <span className="text-blue-400">Google opened</span>
          <ArrowRight className="w-3 h-3 text-zinc-600" />
          <span className="flex items-center justify-center w-5 h-5 rounded-full bg-blue-600 text-white text-[9px]">2</span>
          <span className="text-zinc-300">Paste code below</span>
        </div>

        <p className="text-zinc-400 text-[11px] leading-relaxed">
          Sign in with your Google account in the new tab. After you approve access, Google will show you a code — paste it here.
        </p>

        {authUrl && (
          <a
            href={authUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-[10px] text-blue-400 hover:text-blue-300 underline underline-offset-2 transition-colors"
          >
            <ExternalLink className="w-3 h-3 shrink-0" />
            Re-open Google authorization page
          </a>
        )}

        <div className="flex flex-col gap-2">
          <label className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider flex items-center gap-1.5">
            <ClipboardPaste className="w-3 h-3" />
            Authorization Code
          </label>
          <input
            id="gmail-auth-code-input"
            type="text"
            value={code}
            onChange={e => setCode(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSubmitCode()}
            placeholder="4/0AY0e-g7..."
            disabled={step === 'submitting'}
            autoFocus
            className="w-full bg-black/30 border border-white/10 focus:border-blue-500/60 focus:ring-1 focus:ring-blue-500/30 rounded-lg px-3 py-2.5 text-zinc-200 text-xs font-mono placeholder-zinc-600 outline-none transition-all disabled:opacity-50"
          />
        </div>

        <button
          id="btn-gmail-submit-code"
          onClick={handleSubmitCode}
          disabled={!code.trim() || step === 'submitting'}
          className="w-full flex items-center justify-center gap-2 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold rounded-xl text-xs uppercase tracking-wider transition-all"
        >
          {step === 'submitting'
            ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Verifying…</>
            : <><CheckCircle className="w-3.5 h-3.5" /> Authorize</>
          }
        </button>
      </div>
    );
  }

  if (step === 'error') {
    return (
      <div className="flex flex-col items-center text-center space-y-4 py-4">
        <div className="w-14 h-14 rounded-full bg-rose-500/15 flex items-center justify-center ring-1 ring-rose-500/30">
          <AlertTriangle className="w-7 h-7 text-rose-400" />
        </div>
        <div>
          <p className="text-rose-400 font-bold text-xs uppercase tracking-wider mb-1">Authorization Failed</p>
          <p className="text-zinc-400 text-[11px] max-w-[240px] leading-relaxed">{errorMsg}</p>
        </div>
        <button
          onClick={() => { setStep('idle'); setCode(''); setErrorMsg(null); setAuthUrl(null); }}
          className="px-5 py-2 bg-zinc-700 hover:bg-zinc-600 text-white font-bold rounded-lg text-xs uppercase tracking-wider transition-colors"
        >
          Try Again
        </button>
      </div>
    );
  }

  return null;
}

// ─── Main Modal ─────────────────────────────────────────────────────────────

export default function ConnectionModal({
  isOpen,
  onClose,
  waInfo,
  gmailInfo,
  target,
}: ConnectionModalProps) {
  if (!isOpen || !target) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="relative w-full max-w-md bg-[#0a0a0f] border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between bg-white/5">
          <h2 className="text-lg font-bold text-white tracking-wide uppercase">
            Connect {target === 'whatsapp' ? 'WhatsApp' : 'Gmail'}
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors text-zinc-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6">
          {target === 'whatsapp' ? (
            <div className="flex flex-col bg-white/5 border border-white/10 rounded-xl p-5 relative overflow-hidden group">
              <div className="absolute -bottom-4 -right-4 p-3 opacity-5 pointer-events-none">
                <Smartphone className="w-32 h-32" />
              </div>
              <div className="flex items-center gap-3 mb-6 z-10">
                <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                  <Smartphone className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-white text-sm uppercase tracking-wider">WhatsApp Link</h3>
                  <p className="text-[10px] text-zinc-400">Scan to authenticate</p>
                </div>
              </div>

              <div className="flex-1 flex flex-col items-center justify-center py-4 z-10 min-h-[200px]">
                {waInfo.status === 'connected' ? (
                  <div className="flex flex-col items-center text-center space-y-3">
                    <div className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center">
                      <CheckCircle className="w-8 h-8 text-emerald-400" />
                    </div>
                    <div>
                      <p className="text-emerald-400 font-bold uppercase tracking-wider text-xs">Connected</p>
                      <p className="text-zinc-300 font-mono text-sm mt-1">{waInfo.account || 'Linked Device'}</p>
                    </div>
                    <button onClick={onClose} className="mt-4 px-6 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg uppercase tracking-wider text-xs">Done</button>
                  </div>
                ) : waInfo.status === 'pending' && waInfo.qrCode ? (
                  <div className="flex flex-col items-center gap-4">
                    <div className="bg-white rounded-xl p-4 shadow-lg inline-flex items-center justify-center">
                      <QRCodeDisplay value={waInfo.qrCode} size={260} />
                    </div>
                    <div className="text-center space-y-1">
                      <p className="text-xs text-zinc-300 font-semibold">Open WhatsApp → Linked Devices → Link a Device</p>
                      <p className="text-[10px] text-amber-400/80 font-medium">⚠ Keep this window open — WhatsApp will ask you to scan twice.</p>
                    </div>
                  </div>
                ) : waInfo.status === 'pending' ? (
                  <div className="flex flex-col items-center gap-4 text-center">
                    <RefreshCw className="w-10 h-10 text-emerald-400 animate-spin" />
                    <p className="text-zinc-400 text-xs font-semibold uppercase tracking-wider">Generating QR Code...</p>
                    <p className="text-zinc-500 text-[10px]">Please wait while we communicate with WhatsApp.</p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center text-center space-y-3">
                    <AlertTriangle className="w-10 h-10 text-amber-400/50" />
                    <p className="text-zinc-400 text-xs">Failed to connect to WhatsApp daemon.</p>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex flex-col bg-white/5 border border-white/10 rounded-xl p-5 relative overflow-hidden">
              <div className="absolute -bottom-4 -right-4 p-3 opacity-5 pointer-events-none">
                <Mail className="w-32 h-32" />
              </div>
              <div className="flex items-center gap-3 mb-5 z-10">
                <div className="p-2.5 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400">
                  <Mail className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-white text-sm uppercase tracking-wider">Gmail Authorization</h3>
                  <p className="text-[10px] text-zinc-400">OAuth 2.0 — secure, no password stored</p>
                </div>
              </div>
              <div className="z-10">
                <GmailAuthPanel gmailInfo={gmailInfo} onClose={onClose} />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
