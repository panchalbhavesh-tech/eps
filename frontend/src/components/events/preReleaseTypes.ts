import { gql } from '@apollo/client';

export interface PreReleaseEdge {
  companyId: string;
  ticker: string;
  eventDate: string;
  eventSession?: string | null;
  daysToEvent?: number | null;
  asOfDate?: string | null;
  engine?: string | null;
  nPriorEvents?: number | null;
  verdict?: string | null;
  strategy?: string | null;
  confidence?: string | null;
  convictionScore?: number | null;
  pRunup?: number | null;
  runupP10?: number | null;
  runupP50?: number | null;
  runupP90?: number | null;
  pReaction?: number | null;
  reactionP10?: number | null;
  reactionP50?: number | null;
  reactionP90?: number | null;
  entryDate?: string | null;
  exitDate?: string | null;
  entryPriceRef?: number | null;
  stopPrice?: number | null;
  targetPrice?: number | null;
  stretchTarget?: number | null;
  positionSizePct?: number | null;
  impliedMovePct?: number | null;
  histAvgMovePct?: number | null;
  putCallRatio?: number | null;
  graded: boolean;
  hit?: boolean | null;
  realizedRunup?: number | null;
  realizedReaction3d?: number | null;
  realizedReaction5d?: number | null;
  realizedTradeReturn?: number | null;
  driversJson?: string | null;
  detailsJson?: string | null;
  historyJson?: string | null;
  trackRecordJson?: string | null;
}

export interface Driver { group: string; direction: 'UP' | 'DOWN'; weight: number; text: string; }

const EDGE_FIELDS = `
  companyId ticker eventDate eventSession daysToEvent asOfDate engine nPriorEvents
  verdict strategy confidence convictionScore
  pRunup runupP10 runupP50 runupP90 pReaction reactionP10 reactionP50 reactionP90
  entryDate exitDate entryPriceRef stopPrice targetPrice stretchTarget positionSizePct
  impliedMovePct histAvgMovePct putCallRatio
  graded hit realizedRunup realizedReaction3d realizedReaction5d realizedTradeReturn
`;

export const GET_PRE_RELEASE_EDGES = gql`
  query GetPreReleaseEdges {
    preReleaseEdges { ${EDGE_FIELDS} }
  }
`;

export const GET_PRE_RELEASE_EDGE_DETAIL = gql`
  query GetPreReleaseEdgeDetail($companyId: String!) {
    preReleaseEdgeDetail(companyId: $companyId) { ${EDGE_FIELDS} driversJson detailsJson historyJson trackRecordJson }
  }
`;

export const isTradeVerdict = (v?: string | null) => v === 'RUN-UP PLAY' || v === 'HOLD-THROUGH PLAY';

/** Headline probability/expectation for the chosen strategy (run-up for RUNUP, results reaction otherwise). */
export const headline = (e: PreReleaseEdge) => {
  const runup = e.strategy === 'RUNUP';
  return {
    target: runup ? 'Run-up' : 'Reaction',
    p: runup ? e.pRunup : e.pReaction,
    p10: runup ? e.runupP10 : e.reactionP10,
    p50: runup ? e.runupP50 : e.reactionP50,
    p90: runup ? e.runupP90 : e.reactionP90,
  };
};

export const fmtPct = (v?: number | null, digits = 1, signed = true) =>
  v == null || !isFinite(v) ? '—' : `${signed && v > 0 ? '+' : ''}${v.toFixed(digits)}%`;

export const fmtProb = (v?: number | null) => (v == null || !isFinite(v) ? '—' : `${Math.round(v * 100)}%`);

export const fmtDate = (s?: string | null) => {
  if (!s) return '—';
  const d = new Date(`${s}T00:00:00`);
  return isNaN(d.getTime()) ? s : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
};

export const fmtPrice = (v?: number | null) =>
  v == null || !isFinite(v) ? '—' : `₹${v.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const sessionLabel = (s?: string | null) =>
  s === 'POST' ? 'after market' : s === 'PRE' ? 'before market' : s === 'MARKET' ? 'during market' : 'time not announced';

export const safeJson = <T,>(s?: string | null, fallback: T = {} as T): T => {
  if (!s) return fallback;
  try { return JSON.parse(s) as T; } catch { return fallback; }
};

export const GET_PRE_RELEASE_PRICE_PATH = gql`
  query GetPreReleasePricePath($companyId: String!) {
    preReleasePricePath(companyId: $companyId)
  }
`;
