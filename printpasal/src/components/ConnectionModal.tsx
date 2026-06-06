import React from 'react';
import { X, Smartphone, Mail, AlertTriangle, RefreshCw, CheckCircle, ExternalLink, Hash, QrCode } from 'lucide-react';
import { ServiceInfo } from '../types';
import QRCodeDisplay from './QRCodeDisplay';

interface ConnectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  waInfo: ServiceInfo;
  gmailInfo: ServiceInfo;
  target: 'whatsapp' | 'gmail' | null;
}

// ─── WhatsApp Auth Flow ─────────────────────────────────────────────────────

function WhatsAppAuthPanel({ waInfo, onClose }: { waInfo: ServiceInfo; onClose: () => void }) {
  const [method, setMethod] = React.useState<'qr' | 'phone'>('qr');
  const [phoneNumber, setPhoneNumber] = React.useState('');
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  // Reset local submitting state if we receive a pairing code
  React.useEffect(() => {
    if (waInfo.pairCode) {
      setIsSubmitting(false);
    }
  }, [waInfo.pairCode]);

  const handlePhoneSubmit = async () => {
    if (!phoneNumber.trim()) return;
    setIsSubmitting(true);
    try {
      const resp = await fetch('/api/connect/whatsapp/phone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: phoneNumber.trim() }),
      });
      if (!resp.ok) {
        setIsSubmitting(false);
        console.error("Server rejected phone link request");
      }
    } catch (e) {
      console.error("Phone link network failed", e);
      setIsSubmitting(false);
    }
  };

  if (waInfo.status === 'connected') {
    return (
      <div className="flex flex-col items-center text-center space-y-3 py-4">
        <div className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center">
          <CheckCircle className="w-8 h-8 text-emerald-400" />
        </div>
        <p className="text-emerald-400 font-bold uppercase tracking-wider text-xs">Connected</p>
        <p className="text-zinc-300 font-mono text-sm">{waInfo.account || 'Linked Device'}</p>
        <button onClick={onClose} className="mt-4 px-6 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg uppercase tracking-wider text-xs">Done</button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Tab Switcher */}
      <div className="flex p-1 bg-black/40 rounded-xl border border-white/5">
        <button
          onClick={() => setMethod('qr')}
          className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-[11px] font-bold uppercase tracking-wider transition-all ${method === 'qr' ? 'bg-white/10 text-white' : 'text-zinc-500'}`}
        >
          <QrCode className="w-3.5 h-3.5" /> QR Code
        </button>
        <button
          onClick={() => setMethod('phone')}
          className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-[11px] font-bold uppercase tracking-wider transition-all ${method === 'phone' ? 'bg-white/10 text-white' : 'text-zinc-500'}`}
        >
          <Hash className="w-3.5 h-3.5" /> Phone Number
        </button>
      </div>

      <div className="min-h-[320px] flex flex-col items-center justify-center">
        {method === 'qr' ? (
          waInfo.qrCode ? (
            <div className="flex flex-col items-center gap-5 w-full">
              <div className="bg-white rounded-xl p-4 shadow-lg border-4 border-emerald-500/20">
                <QRCodeDisplay value={waInfo.qrCode} size={240} />
              </div>
              <div className="text-center space-y-4 w-full px-2">
                <div className="space-y-1">
                  <h4 className="text-white font-bold text-sm uppercase tracking-wider">Scan this QR code</h4>
                  <p className="text-zinc-400 text-[13px]">यो QR कोड स्क्यान गर्नुहोस्</p>
                </div>
                <div className="p-3 rounded-xl bg-black/40 border border-white/5 text-left text-xs space-y-1">
                   <p className="text-zinc-300">1. Open <span className="text-white font-bold">WhatsApp</span> → Linked Devices</p>
                   <p className="text-zinc-300">2. Tap <span className="text-white font-bold">Link a Device</span> and scan this screen</p>
                   <p className="text-zinc-500 mt-2 italic">Note: WhatsApp may ask you to scan twice for security.</p>
                </div>
                <div className="text-[10px] font-mono text-amber-400/80 animate-pulse uppercase">Keep window open / विन्डो खुल्ला राख्नुहोस्</div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-4 py-8">
              <RefreshCw className="w-10 h-10 text-emerald-400 animate-spin" />
              <p className="text-zinc-400 text-xs font-semibold uppercase tracking-wider">Connecting to WhatsApp...</p>
            </div>
          )
        ) : (
          <div className="w-full flex flex-col gap-6">
            {waInfo.pairCode ? (
              <div className="flex flex-col items-center gap-6 text-center animate-in fade-in zoom-in duration-500">
                <div className="flex gap-1.5 flex-wrap justify-center">
                  {waInfo.pairCode.split('').map((char, i) => (
                    <div key={i} className="w-9 h-12 flex items-center justify-center bg-white/10 border border-white/20 rounded-lg text-2xl font-black font-mono text-emerald-400">
                      {char}
                    </div>
                  ))}
                </div>
                <div className="space-y-1">
                  <p className="text-white font-bold text-sm uppercase tracking-wider">Pairing Code</p>
                  <p className="text-zinc-500 text-xs font-medium italic">Enter this code on your phone</p>
                </div>
                <div className="p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/10 text-left text-xs space-y-2">
                   <p className="text-zinc-300">1. Open WhatsApp → Linked Devices → Link a Device</p>
                   <p className="text-zinc-300">2. Select <span className="text-emerald-400 font-bold">"Link with phone number instead"</span></p>
                   <p className="text-zinc-300">3. Enter the 8-character code shown above</p>
                </div>
                <div className="text-[10px] font-mono text-amber-400/80 animate-pulse uppercase">Keep window open / विन्डो खुल्ला राख्नुहोस्</div>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="space-y-2 px-2">
                  <label className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold flex items-center gap-2">
                    <Smartphone className="w-3.5 h-3.5" /> Phone Number (with Country Code)
                  </label>
                  <input
                    type="text"
                    value={phoneNumber}
                    onChange={e => setPhoneNumber(e.target.value)}
                    placeholder="+977 9841234567"
                    className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-4 text-white font-mono outline-none focus:border-emerald-500/50 text-xl text-center"
                  />
                  <p className="text-[10px] text-zinc-600 text-center uppercase tracking-tighter">e.g. +977 for Nepal / +91 for India</p>
                </div>
                <button
                  onClick={handlePhoneSubmit}
                  disabled={isSubmitting || !phoneNumber.trim()}
                  className="w-full py-4 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-30 text-white font-black rounded-xl uppercase tracking-widest text-xs transition-all shadow-lg shadow-emerald-900/20 active:scale-[0.98]"
                >
                  {isSubmitting ? <RefreshCw className="w-4 h-4 animate-spin mx-auto" /> : 'Request Pairing Code'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Gmail Auth Flow ────────────────────────────────────────────────────────

type GmailStep = 'idle' | 'loading_url' | 'awaiting_code' | 'submitting' | 'success' | 'error';

function GmailAuthPanel({ gmailInfo, onClose }: { gmailInfo: ServiceInfo; onClose: () => void }) {
  const [step, setStep] = React.useState<GmailStep>('idle');
  const [authUrl, setAuthUrl] = React.useState<string | null>(null);
  const [code, setCode] = React.useState('');
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);

  const isConnected = gmailInfo.status === 'connected' || gmailInfo.status === 'syncing';

  React.useEffect(() => {
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
    return (
      <div className="flex flex-col items-center text-center space-y-4 py-4">
        <div className="w-16 h-16 rounded-full bg-blue-500/20 flex items-center justify-center ring-2 ring-blue-500/30">
          <CheckCircle className="w-8 h-8 text-blue-400" />
        </div>
        <div>
          <p className="text-blue-400 font-bold uppercase tracking-wider text-xs mb-1">Connected</p>
          <p className="text-zinc-300 font-mono text-sm">{gmailInfo.account || 'Linked Account'}</p>
        </div>
        <button onClick={onClose} className="mt-2 px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg uppercase tracking-wider text-xs transition-colors">Done</button>
      </div>
    );
  }

  if (step === 'idle') {
    return (
      <div className="flex flex-col items-center text-center space-y-5 py-2">
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
          <p className="text-zinc-500 text-[11px] mt-1 max-w-[240px] leading-relaxed">You'll be redirected to Google to authorize access to your Gmail inbox.</p>
        </div>
        <button onClick={handleSignIn} className="w-full flex items-center justify-center gap-2.5 py-2.5 px-4 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl text-xs uppercase tracking-wider transition-all">
          <ExternalLink className="w-3.5 h-3.5" /> Open Google Sign-In
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
        <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider">
          <span className="flex items-center justify-center w-5 h-5 rounded-full bg-blue-600 text-white text-[9px]">✓</span>
          <span className="text-blue-400">Google opened</span>
          <ArrowRight className="w-3 h-3 text-zinc-600" />
          <span className="flex items-center justify-center w-5 h-5 rounded-full bg-blue-600 text-white text-[9px]">2</span>
          <span className="text-zinc-300">Paste code below</span>
        </div>
        <div className="flex flex-col gap-2">
          <label className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">Authorization Code</label>
          <input
            type="text"
            value={code}
            onChange={e => setCode(e.target.value)}
            placeholder="Paste code here..."
            className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2.5 text-zinc-200 text-xs font-mono outline-none"
          />
        </div>
        <button onClick={handleSubmitCode} disabled={!code.trim() || step === 'submitting'} className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl text-xs uppercase tracking-wider transition-all">
          {step === 'submitting' ? 'Verifying...' : 'Authorize'}
        </button>
      </div>
    );
  }

  return null;
}

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
        <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between bg-white/5">
          <h2 className="text-lg font-bold text-white tracking-wide uppercase">
            Connect {target === 'whatsapp' ? 'WhatsApp' : 'Gmail'}
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors text-zinc-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6">
          {target === 'whatsapp' ? (
            <WhatsAppAuthPanel waInfo={waInfo} onClose={onClose} />
          ) : (
            <div className="flex flex-col bg-white/5 border border-white/10 rounded-xl p-5 relative overflow-hidden">
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
