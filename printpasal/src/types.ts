/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type ConnectionStatus = 'connected' | 'pending' | 'disconnected';

// Per-service status codes coming from the Go backend
export type ServiceStatus =
  | 'connected'     // logged in and active
  | 'disconnected'  // explicitly terminated or gone offline
  | 'pending'       // trying to connect / QR not yet scanned
  | 'expired'       // QR code timed out
  | 'failed'        // connection attempt error
  | 'auth_required' // Gmail OAuth needed
  | 'syncing'       // Gmail is actively polling
  | 'unknown';      // initial / not yet reported

export interface ServiceInfo {
  status: ServiceStatus;
  account?: string;   // phone number (WA) or email address (Gmail)
  qrCode?: string;    // base64 QR string when status === 'pending' for WA
  qrPhase?: string;   // '1', '2', etc.
  isVerifying?: boolean;
  pairCode?: string;  // 8-character code for phone pairing
  connectedSince?: string;
}

export interface WhatsAppSession {
  phoneNumber: string;
  deviceName: string;
  connectedSince: string | null;
  status: ConnectionStatus;
  avatarUrl?: string;
}

export type FileType = 'pdf' | 'image' | 'document' | 'audio' | 'video' | 'other';
export type SourceType = 'whatsapp' | 'gmail';

export interface Attachment {
  id: string;
  senderName?: string;     // Display name (e.g. "Dhiraj Thapa")
  senderNumber: string;    // Phone (WhatsApp) or email address (Gmail)
  senderContact?: string;  // Explicit contact from rich metadata (phone or email)
  timestamp: string;       // ISO string
  fileName: string;
  fileSize: number;        // in bytes
  fileType: FileType;
  fileUrl: string;         // local or external data url
  caption?: string;
  subject?: string;        // Gmail subject line (from rich metadata)
  unread: boolean;
  source: SourceType;      // Switchable interface source
  senderEmail?: string;    // For Gmail source (legacy compat)
  gmailSubject?: string;   // Subject field for Gmail (legacy compat)
  gmailSnippet?: string;   // Body preview snippet for Gmail
}

export interface Printer {
  id: string;
  name: string;
  type: 'local' | 'network' | 'usb';
  status: 'ready' | 'offline' | 'printing' | 'busy' | 'paused' | 'error' | 'unknown' | 'low-ink';
  location?: string;
  isDefault?: boolean;
  supportsColor?: boolean;
  supportsDuplex?: boolean;
  supportsCollate?: boolean;
  supportsCopies?: boolean;
}

export interface PrintSettings {
  copies: number;
  orientation: 'portrait' | 'landscape';
  colorMode: 'color' | 'mono';
  duplex: 'simplex' | 'long-edge' | 'short-edge';
  collate: boolean;
  paperSize: 'A4' | 'Letter' | 'Legal';
  layout: 'fit' | 'fill' | 'original';
  pageRange: string;
}

export interface PrintOptions {
  copies: number;
  orientation: 'portrait' | 'landscape';
  colorMode: 'color' | 'mono';
  duplex: 'simplex' | 'long-edge' | 'short-edge';
  collate: boolean;
  paperSize: 'A4' | 'Letter' | 'Legal';
  layout: 'fit' | 'fill' | 'original';
}
