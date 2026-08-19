export interface CatalystSource {
  id: string;
  sourceName: string;
  url?: string;
  isPrimary: boolean;
  publishedAt?: string;
}

export interface CatalystEvent {
  id: string;
  ticker: string;
  companyId?: string;
  companyName?: string;
  eventTitle: string;
  eventType: string;
  category: string;
  impactScore?: number;
  earlyScore?: number;
  confidence: string;
  status: string;
  tier: string;
  matchStatus: string;
  whyItMatters?: string;
  reactionPct?: number;
  relativeVolume?: number;
  // Multi-horizon reaction metrics (P1.5)
  gapReactionPct?: number;
  sessionReactionPct?: number;
  reaction1d?: number;
  reaction3d?: number;
  reaction5d?: number;
  preEventPrice?: number;
  marketCapAtEvent?: number;
  sectorAtEvent?: string;
  publishedAt?: string;
  detectedAt?: string;
  verifiedAt?: string;
  createdAt: string;
  updatedAt: string;
  sources: CatalystSource[];
}
