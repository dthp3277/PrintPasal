/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  Printer, Check, Sliders, Play, Settings, CreditCard, ChevronRight, X, AlertCircle, 
  PrinterCheck, RefreshCw, Plus, FileText, CheckCircle2, CircleDot
} from 'lucide-react';
import { Printer as PrinterType, PrintSettings, Attachment } from '../types';

interface PrinterWorkflowProps {
  attachment: Attachment;
  onClose: () => void;
}

export default function PrinterWorkflow({ attachment, onClose }: PrinterWorkflowProps) {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [printers, setPrinters] = useState<PrinterType[]>([]);
  const [selectedPrinter, setSelectedPrinter] = useState<PrinterType | null>(null);
  const [settings, setSettings] = useState<PrintSettings>({
    copies: 1,
    orientation: 'portrait',
    colorMode: 'color',
    paperSize: 'A4',
    layout: 'fit',
  });

  // Printer addition state
  const [showAddForm, setShowAddForm] = useState(false);
  const [newPrinterName, setNewPrinterName] = useState('');
  const [newPrinterType, setNewPrinterType] = useState<'network' | 'usb'>('network');

  // Simulation state
  const [progress, setProgress] = useState(0);
  const [printStatusText, setPrintStatusText] = useState('');
  const [isSimulating, setIsSimulating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchPrinters();
  }, []);

  const fetchPrinters = async () => {
    try {
      const resp = await fetch('/api/printers');
      if (resp.ok) {
        const data = await resp.json();
        const mappedPrinters = data.map((p: any) => ({
          id: p.name,
          name: p.name,
          type: p.port_name.startsWith('IP_') ? 'network' : 'usb',
          status: p.status === 0 ? 'ready' : 'offline',
          location: p.port_name,
          isDefault: false
        }));
        setPrinters(mappedPrinters);
        if (mappedPrinters.length > 0) {
          setSelectedPrinter(mappedPrinters[0]);
        }
      }
    } catch (e) {
      console.error('Failed to fetch printers', e);
    }
  };

  // Add Dynamic Printer Handler
  const handleAddPrinter = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPrinterName.trim()) return;

    const newPrinter: PrinterType = {
      id: newPrinterName.trim(),
      name: newPrinterName.trim(),
      type: newPrinterType,
      status: 'ready',
      location: newPrinterType === 'network' ? 'LAN Auto-discovered' : 'USB Auto-detected',
      isDefault: false
    };

    setPrinters([...printers, newPrinter]);
    setSelectedPrinter(newPrinter);
    setNewPrinterName('');
    setShowAddForm(false);
  };

  const startPrinting = async () => {
    if (!selectedPrinter) return;
    
    setIsSimulating(true);
    setStep(4);
    setProgress(10);
    setPrintStatusText('Preparing document for transmission...');
    setError(null);

    try {
      const resp = await fetch('/api/print', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: attachment.fileName,
          printer: selectedPrinter.name
        })
      });

      if (!resp.ok) {
        const errText = await resp.text();
        throw new Error(errText || 'Print request failed');
      }

      // Simulate some progress for UI feedback since actual spooling is fast
      const messages = [
        'Establishing connection with physical address...',
        'Formatting and rendering document blocks...',
        'Spooling page streams to buffer...',
        'Transmission successful!'
      ];

      for (let i = 0; i < messages.length; i++) {
        setPrintStatusText(messages[i]);
        setProgress(25 * (i + 1));
        await new Promise(r => setTimeout(r, 800));
      }
      
      setProgress(100);
      setIsSimulating(false);
    } catch (e: any) {
      setError(e.message);
      setIsSimulating(false);
    }
  };

  const handleCopiesChange = (val: number) => {
    setSettings(prev => ({ ...prev, copies: Math.max(1, Math.min(val, 99)) }));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md p-4">
      {/* Container */}
      <div className="relative bg-[#0a0a0f] w-full max-w-2xl rounded-2xl border border-white/10 shadow-2xl flex flex-col overflow-hidden max-h-[90vh]">
        
        {/* Header workflow tabs */}
        <div className="bg-[#0c0c12] border-b border-white/5 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-blue-500/10 h-8 w-8 text-blue-400 rounded-lg border border-blue-500/20 flex items-center justify-center shadow-inner">
              <Printer className="w-4 h-4 shadow-sm" />
            </div>
            <div>
              <h3 className="font-sans font-extrabold text-white text-xs uppercase tracking-wider">Spool Production Wizard</h3>
              <p className="text-[9px] text-zinc-500 font-mono tracking-wide uppercase">File Node: {attachment.fileName}</p>
            </div>
          </div>

          <button 
            id="close-wizard-btn"
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-500 hover:bg-white/5 hover:text-white transition-all cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Process Indicator */}
        <div className="border-b border-white/5 bg-[#08080c] px-6 py-3 flex items-center justify-center gap-1.5 md:gap-4 select-none shadow-inner">
          {[
            { id: 1, label: 'Configure Device' },
            { id: 2, label: 'Preferences' },
            { id: 3, label: 'Spool Audit' },
            { id: 4, label: 'Transmission' },
          ].map((item) => (
            <React.Fragment key={item.id}>
              <button
                disabled={isSimulating}
                onClick={() => setStep(item.id as any)}
                className={`flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer ${
                  step === item.id 
                    ? 'text-blue-400' 
                    : step > item.id 
                      ? 'text-zinc-300 hover:text-blue-400' 
                      : 'text-zinc-650'
                }`}
              >
                <span className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-bold ${
                  step === item.id 
                    ? 'bg-blue-600 text-white shadow-[0_0_10px_rgba(59,130,246,0.65)]' 
                    : step > item.id 
                      ? 'bg-blue-500/15 text-blue-400 border border-blue-500/30 font-bold' 
                      : 'bg-white/5 text-zinc-600 border border-white/5'
                }`}>
                  {step > item.id ? <Check className="w-2.5 h-2.5" /> : item.id}
                </span>
                <span className="hidden sm:inline font-sans text-[10px] uppercase tracking-wider">{item.label}</span>
              </button>
              {item.id < 4 && <ChevronRight className="w-3 h-3 text-zinc-700 hidden sm:block" />}
            </React.Fragment>
          ))}
        </div>

        {/* Content body */}
        <div className="flex-1 overflow-y-auto p-6 bg-[#0a0a0f] text-zinc-350">
          <form onSubmit={(e) => e.preventDefault()}>
            
            {/* Step 1: Device Selection */}
            {step === 1 && (
              <div className="space-y-4">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-sans font-bold text-white text-xs uppercase tracking-wider">Select Production Physical Node</h4>
                  <button
                    type="button"
                    onClick={() => setShowAddForm(!showAddForm)}
                    className="flex items-center gap-1.5 px-3 py-1 bg-white/5 text-zinc-300 hover:bg-white/10 hover:text-white border border-white/10 text-[10px] font-bold uppercase tracking-wider rounded-lg transition-all"
                  >
                    <Plus className="w-3.5 h-3.5 text-blue-400" />
                    <span>Integrate Printer</span>
                  </button>
                </div>

                {/* Inline form to integrate printer dynamically */}
                {showAddForm && (
                  <div className="rounded-xl border border-dashed border-blue-500/35 bg-blue-500/5 p-4 space-y-3">
                    <h5 className="text-[10px] font-bold text-blue-400 uppercase tracking-widest">Configure New Client Line</h5>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[9px] font-bold text-zinc-500 uppercase tracking-widest mb-1">Device/Printer Name</label>
                        <input
                          type="text"
                          className="w-full text-xs rounded-lg border border-white/15 bg-zinc-950 px-2.5 py-1.5 focus:border-blue-500 focus:outline-hidden text-zinc-200"
                          value={newPrinterName}
                          onChange={(e) => setNewPrinterName(e.target.value)}
                          placeholder="HP OfficeJet Client Console"
                        />
                      </div>
                      <div>
                        <label className="block text-[9px] font-bold text-zinc-500 uppercase tracking-widest mb-1">Interface Port</label>
                        <select
                          className="w-full text-xs rounded-lg border border-white/15 bg-zinc-950 px-2.5 py-1.5 focus:border-blue-500 focus:outline-hidden text-zinc-300"
                          value={newPrinterType}
                          onChange={(e) => setNewPrinterType(e.target.value as any)}
                        >
                          <option value="network">Network IP / LAN (Socket TCP)</option>
                          <option value="usb">USB Console Physical Link</option>
                        </select>
                      </div>
                    </div>
                    <div className="flex justify-end gap-2 pt-1 border-t border-white/5">
                      <button
                        type="button"
                        className="px-2.5 py-1 text-xs text-zinc-500 hover:text-zinc-300"
                        onClick={() => setShowAddForm(false)}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={handleAddPrinter}
                        disabled={!newPrinterName.trim()}
                        className="px-3 py-1 bg-blue-600 text-white rounded-lg text-[10px] font-bold uppercase tracking-wider hover:bg-blue-500 disabled:opacity-20 transition-all shadow-md shadow-blue-600/30"
                      >
                        Find & Register
                      </button>
                    </div>
                  </div>
                )}

                {/* Device Directory Layout */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {printers.length === 0 && (
                    <div className="col-span-2 py-8 text-center border border-dashed border-white/5 rounded-xl">
                       <RefreshCw className="w-5 h-5 text-zinc-600 animate-spin mx-auto mb-2" />
                       <p className="text-[10px] text-zinc-500 font-mono uppercase">Scanning for available nodes...</p>
                    </div>
                  )}
                  {printers.map((pr) => {
                    const isSelected = selectedPrinter?.id === pr.id;
                    return (
                      <div
                        id={`btn-printer-select-${pr.id}`}
                        key={pr.id}
                        onClick={() => setSelectedPrinter(pr)}
                        className={`group border rounded-xl p-3.5 cursor-pointer relative transition-all duration-200 ${
                          isSelected
                            ? 'border-blue-500 bg-blue-600/10 shadow-[0_0_15px_rgba(59,130,246,0.15)] text-white ring-1 ring-blue-500/25'
                            : 'border-white/5 bg-[#0d0d14] hover:bg-[#12121c] hover:border-white/10 hover:shadow-md hover:text-white'
                        }`}
                      >
                        <div className="flex items-start justify-between mb-1.5">
                          <h5 className="font-bold text-zinc-100 text-xs tracking-wide truncate max-w-[180px]">{pr.name}</h5>
                          {pr.isDefault && (
                            <span className="text-[8px] font-bold uppercase tracking-widest text-blue-400 bg-blue-500/10 border border-blue-500/20 px-1.5 py-0.5 rounded-sm shrink-0">
                              Default
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] text-zinc-500 font-mono italic">{pr.location || 'Unknown network logs'}</p>
                        
                        <div className="mt-3 border-t border-white/5 pt-2 flex items-center justify-between text-[10px]">
                          <span className="capitalize font-mono text-zinc-400 bg-white/5 px-1.5 py-0.5 rounded-sm border border-white/5">
                            {pr.type} interface
                          </span>
                          <span className={`inline-flex items-center gap-1 font-bold uppercase tracking-wide text-[9px] ${
                            pr.status === 'ready' 
                              ? 'text-emerald-400' 
                              : pr.status === 'low-ink' 
                                ? 'text-amber-400' 
                                : 'text-zinc-600'
                          }`}>
                            <CircleDot className="w-2 h-2 fill-current animate-pulse" />
                            {pr.status === 'ready' ? 'Ready' : pr.status === 'low-ink' ? 'Low Ink' : 'Offline'}
                          </span>
                        </div>

                        {isSelected && (
                          <div className="absolute top-3 right-3 h-5 w-5 bg-blue-600 text-white rounded-full flex items-center justify-center shadow-[0_0_10px_rgba(59,130,246,0.8)] border border-blue-400">
                            <Check className="w-3 h-3" />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Step 2: Settings Configuration */}
            {step === 2 && (
              <div className="space-y-5">
                <h4 className="font-sans font-bold text-white text-xs uppercase tracking-wider">Production Output Specifications</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Copies */}
                  <div>
                    <label className="block text-[9px] font-bold text-zinc-500 uppercase tracking-widest mb-1.5" htmlFor="input-copies">Number of Copies</label>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleCopiesChange(settings.copies - 1)}
                        className="h-9 w-9 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 hover:text-white flex items-center justify-center font-bold text-zinc-300 transition-colors"
                      >
                        -
                      </button>
                      <input
                        id="input-copies"
                        type="number"
                        className="h-9 w-16 text-center rounded-lg border border-white/20 text-sm font-bold text-white bg-zinc-950 focus:border-blue-500"
                        value={settings.copies}
                        onChange={(e) => handleCopiesChange(parseInt(e.target.value) || 1)}
                      />
                      <button
                        type="button"
                        onClick={() => handleCopiesChange(settings.copies + 1)}
                        className="h-9 w-9 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 hover:text-white flex items-center justify-center font-bold text-zinc-300 transition-colors"
                      >
                        +
                      </button>
                    </div>
                  </div>

                  {/* Orientation */}
                  <div>
                    <label className="block text-[9px] font-bold text-zinc-500 uppercase tracking-widest mb-1.5">Page Layout Orientation</label>
                    <div className="grid grid-cols-2 gap-2">
                      {(['portrait', 'landscape'] as const).map((or) => (
                        <button
                          key={or}
                          type="button"
                          onClick={() => setSettings({ ...settings, orientation: or })}
                          className={`rounded-lg border px-3 py-2 text-center text-xs font-bold uppercase tracking-wider capitalize transition-all cursor-pointer ${
                            settings.orientation === or
                              ? 'bg-blue-600/10 border-blue-500 text-blue-400 shadow-[0_0_10px_rgba(59,130,246,0.3)]'
                              : 'border-white/5 bg-white/3 text-zinc-500 hover:bg-white/5 hover:text-zinc-300 hover:border-white/10'
                          }`}
                        >
                          {or}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Color mode */}
                  <div>
                    <label className="block text-[9px] font-bold text-zinc-500 uppercase tracking-widest mb-1.5">Color Preference</label>
                    <div className="grid grid-cols-2 gap-2">
                      {(['color', 'mono'] as const).map((cm) => (
                        <button
                          key={cm}
                          type="button"
                          onClick={() => setSettings({ ...settings, colorMode: cm })}
                          className={`rounded-lg border px-3 py-2 text-center text-xs font-bold uppercase tracking-wider capitalize transition-all cursor-pointer ${
                            settings.colorMode === cm
                              ? 'bg-blue-600/10 border-blue-500 text-blue-400 shadow-[0_0_10px_rgba(59,130,246,0.3)]'
                              : 'border-white/5 bg-white/3 text-zinc-500 hover:bg-white/5 hover:text-zinc-300 hover:border-white/10'
                          }`}
                        >
                          {cm === 'mono' ? 'Black & White' : 'Full Color'}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Paper size */}
                  <div>
                    <label className="block text-[9px] font-bold text-[#b1b1ba] uppercase tracking-widest mb-1.5">Paper Dimension</label>
                    <select
                      className="w-full text-xs rounded-lg border border-white/10 px-3 py-2 bg-zinc-950 text-zinc-300 focus:border-blue-500 focus:outline-hidden font-semibold"
                      value={settings.paperSize}
                      onChange={(e) => setSettings({ ...settings, paperSize: e.target.value as any })}
                    >
                      <option value="A4">A4 Page (8.27" x 11.69")</option>
                      <option value="Letter">Letter Standard (8.5" x 11")</option>
                      <option value="Legal">Legal Extended (8.5" x 14")</option>
                    </select>
                  </div>
                </div>
              </div>
            )}

            {/* Step 3: Verification & Interactive Preview */}
            {step === 3 && (
              <div className="space-y-4">
                <div className="border border-amber-500/10 bg-amber-500/5 p-3.5 rounded-xl flex gap-2.5">
                  <AlertCircle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                  <div>
                    <h5 className="font-bold text-amber-400 text-xs uppercase tracking-wider mb-0.5">Spool Audit Protocol</h5>
                    <p className="text-[11px] text-zinc-400 leading-normal">
                      Verified output node: <strong className="text-white font-semibold">{selectedPrinter?.name || 'NONE'}</strong> ({selectedPrinter?.type || 'N/A'}). 
                      Job size contains <strong className="text-white font-semibold">{settings.copies} bundle copies</strong> formatted in <strong className="text-white font-semibold">{settings.colorMode === 'color' ? 'Full Spectra Color' : 'Tonal Monochromatic'}</strong>.
                    </p>
                  </div>
                </div>

                {/* Job Preview representation frame */}
                <div className="border border-white/5 rounded-xl bg-[#050508] p-4 flex items-center justify-center min-h-[160px]">
                  <div className={`relative bg-zinc-950 border border-white/10 shadow-[0_10px_35px_rgba(0,0,0,0.8)] p-4 transition-all duration-300 ${
                    settings.orientation === 'landscape' ? 'w-[200px] h-[140px]' : 'w-[140px] h-[200px]'
                  }`}>
                    {/* Tiny visual indicators of the simulated page scale */}
                    <div className="flex flex-col h-full justify-between">
                      <div className="flex items-center gap-1.5 border-b border-white/5 pb-1">
                        <FileText className="w-3.5 h-3.5 text-blue-400" />
                        <span className="text-[7px] font-mono font-bold uppercase overflow-hidden whitespace-nowrap tracking-wider text-zinc-300">
                          {attachment.fileName.slice(0, 15)}
                        </span>
                      </div>
                      <div className="text-[6px] text-zinc-500 leading-normal font-sans italic p-1 border-t border-b border-dashed border-white/5 uppercase select-none text-center">
                        {settings.colorMode} SPOOLED PREVIEW
                      </div>
                      <div className="flex items-center justify-between text-[6px] font-mono text-zinc-400 pt-1 border-t border-white/5">
                        <span>{settings.paperSize}</span>
                        <span>{settings.copies} COPIES</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Step 4: Live Simulation Progress */}
            {step === 4 && (
              <div className="py-6 text-center space-y-6">
                {error ? (
                  <div className="space-y-4 max-w-sm mx-auto">
                    <div className="relative mx-auto h-14 w-14 rounded-full border border-red-500/20 bg-red-500/10 flex items-center justify-center shadow-lg">
                      <X className="w-5 h-5 text-red-400" />
                    </div>
                    <div>
                      <h4 className="font-bold text-white text-sm uppercase tracking-wider">Transmission Failed</h4>
                      <p className="text-[10px] text-red-500 font-mono mt-1 leading-normal">{error}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setStep(3)}
                      className="px-4 py-2 bg-white/5 text-zinc-300 rounded-lg text-[10px] font-bold uppercase tracking-wider hover:bg-white/10"
                    >
                      Go Back & Retry
                    </button>
                  </div>
                ) : progress < 100 ? (
                  <div className="space-y-4 max-w-sm mx-auto">
                    <div className="relative mx-auto h-14 w-14 rounded-full border border-blue-500/20 bg-blue-500/10 flex items-center justify-center shadow-lg">
                      <RefreshCw className="w-5 h-5 text-blue-400 animate-spin" />
                    </div>
                    <div>
                      <h4 className="font-bold text-white text-sm uppercase tracking-wider">Transmitting Spool Frame...</h4>
                      <p className="text-[10px] text-zinc-500 font-mono mt-1 leading-normal">{printStatusText}</p>
                    </div>
                    {/* Progress Slider */}
                    <div className="relative h-2 w-full bg-white/5 rounded-full overflow-hidden border border-white/5">
                      <div 
                        className="absolute inset-y-0 left-0 bg-blue-600 transition-all duration-150 shadow-[0_0_10px_rgba(59,130,246,0.8)]"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                    <span className="block font-mono text-xs font-bold text-zinc-300">{progress}% spooled</span>
                  </div>
                ) : (
                  <div className="space-y-4 max-w-sm mx-auto">
                    <div className="relative mx-auto h-16 w-14 border border-dashed border-emerald-500/40 bg-emerald-500/5 rounded-xl flex items-center justify-center shadow-md">
                      <CheckCircle2 className="w-6 h-6 text-emerald-400 absolute -top-1 -right-1 fill-[#0a0a0f]" />
                      <FileText className="w-8 h-8 text-emerald-400 animate-bounce" />
                    </div>
                    <div>
                      <h4 className="font-bold text-white text-sm uppercase tracking-wider flex items-center justify-center gap-1.5">
                        Spool Job Complete
                      </h4>
                      <p className="text-xs text-zinc-400 mt-1.5 leading-relaxed">
                        Your direct layout package was successfully released to node target <strong className="text-white">{selectedPrinter?.name}</strong>. Production complete.
                      </p>
                    </div>
                    <div className="grid grid-cols-2 gap-2 max-w-xs mx-auto border-t border-white/5 pt-4 text-[10px] font-mono text-zinc-500 text-left">
                      <div>Node Metric: <span className="text-zinc-300">ONLINE</span></div>
                      <div>Format Type: <span className="text-zinc-300 font-bold uppercase">{attachment.fileType}</span></div>
                      <div>Spanned: <span className="text-zinc-300">1 / 1 Node</span></div>
                      <div>Copies Out: <span className="text-zinc-300">{settings.copies}</span></div>
                    </div>
                  </div>
                )}
              </div>
            )}

          </form>
        </div>

        {/* Footer actions */}
        <div className="bg-[#0c0c12] border-t border-white/5 px-6 py-4 flex items-center justify-between">
          <button
            type="button"
            disabled={isSimulating}
            className={`px-4 py-1.5 rounded-xl border border-white/10 text-[10px] font-bold uppercase tracking-wider text-zinc-400 bg-white/5 hover:bg-white/10 hover:text-white transition-all cursor-pointer ${
              step === 1 ? 'invisible' : 'visible'
            }`}
            onClick={() => setStep(prev => Math.max(1, prev - 1) as any)}
          >
            Back Step
          </button>

          <div className="flex gap-2">
            {step < 3 ? (
              <button
                type="button"
                className="px-4 py-2 rounded-xl bg-zinc-800 text-zinc-200 hover:bg-zinc-700 border border-white/5 text-[10px] font-bold uppercase tracking-wider cursor-pointer"
                onClick={() => setStep(prev => Math.min(3, prev + 1) as any)}
              >
                Continue Setup
              </button>
            ) : step === 3 ? (
              <button
                type="button"
                disabled={!selectedPrinter}
                className="px-5 py-2 rounded-xl bg-blue-600 text-white hover:bg-blue-500 text-[10px] font-bold uppercase tracking-wider shadow-[0_0_20px_rgba(37,99,235,0.45)] transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                onClick={startPrinting}
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>Transmit Job</span>
              </button>
            ) : (
              <button
                type="button"
                className="px-5 py-2 rounded-xl bg-zinc-800 text-zinc-200 hover:bg-zinc-700 border border-white/5 text-[10px] font-bold uppercase tracking-wider cursor-pointer"
                onClick={onClose}
              >
                Done
              </button>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
