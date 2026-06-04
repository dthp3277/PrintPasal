import React, { useEffect, useRef } from 'react';
import QRCode from 'qrcode';

interface QRCodeDisplayProps {
  value: string;
  size?: number;
}

export default function QRCodeDisplay({ value, size = 280 }: QRCodeDisplayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvasRef.current || !value) return;
    // Use errorCorrectionLevel 'L' — lower density means fewer modules
    // which is much easier for the WhatsApp mobile camera to decode,
    // especially on the second confirmation scan.
    // Do NOT set width via CSS scaling — render at exact pixel dimensions
    // so there is zero canvas distortion.
    QRCode.toCanvas(canvasRef.current, value, {
      width: size,
      margin: 4,
      color: {
        dark: '#000000',
        light: '#ffffff',
      },
      errorCorrectionLevel: 'L',
    });
  }, [value, size]);

  return (
    // Display the canvas at exactly its intrinsic pixel size — no CSS scaling.
    // This ensures 1-to-1 pixel fidelity which WhatsApp's scanner requires.
    <canvas
      ref={canvasRef}
      style={{ display: 'block', width: `${size}px`, height: `${size}px`, borderRadius: '8px' }}
    />
  );
}
