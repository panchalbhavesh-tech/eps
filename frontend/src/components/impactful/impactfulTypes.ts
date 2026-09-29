import { gql } from '@apollo/client';

export const GET_IMPACTFUL_EVENTS = gql`
  query GetImpactfulEvents {
    impactfulEvents
  }
`;

export const GET_IMPACTFUL_EVENT_DETAIL = gql`
  query GetImpactfulEventDetail($key: String!) {
    impactfulEventDetail(key: $key)
  }
`;

export const REFRESH_IMPACTFUL_EVENTS = gql`
  mutation RefreshImpactfulEvents {
    refreshImpactfulEvents
  }
`;

export type Action = 'BUY' | 'SKIP' | 'AVOID' | 'DONE';
export type Stage = 'NOTICE' | 'DECLARED' | 'EX_PASSED' | 'MEETING_DONE';

/** "If you buy today": what past events did when bought this many sessions before the ex-date / meeting. */
export interface BuyToday {
  basis: 'own' | 'group'; n: number; win: number; wins: number; median: number; best_pct: number;
  entry: number; target: number; target_pct: number; target_hit: number; stretch: number; stretch_pct: number;
  stop: number; stop_pct: number; sell_by: string; moves: number[]; peaks: number[];
}

export interface ImpactEvent {
  key: string; ticker: string; name: string; company_id: string;
  tab: string; kind: string; kind_label: string; stage: Stage; subject: string; what: string;
  meeting_date?: string | null; with_results: boolean; notice_at?: string | null; is_new: boolean;
  ex_date?: string | null; record_date?: string | null; days_to?: number | null; sessions_to_exit?: number | null;
  price: number; adv_cr?: number | null; moved_pct?: number | null;
  dividend?: number | null; yield_pct?: number | null; surprise_pct?: number | null; factor?: number | null;
  rights_ratio?: string | null; rights_price?: number | null; rights_discount_pct?: number | null; terp_drop_pct?: number | null;
  buyback_price?: number | null; buyback_method?: string | null; entitlement?: number | null;
  bb_premium_pct?: number | null; bb_return_pct?: number | null; bb_breakeven_acceptance?: number | null;
  action: Action; why: string; basis: 'own' | 'group' | null;
  own: { n: number; up?: number; mean?: number; moves: number[] };
  group: { n?: number; mean?: number; median?: number; hit?: number; verdict?: string };
  now?: BuyToday; result_pct?: number | null; after_ex_pct?: number | null;
}

export interface ImpactSnapshot {
  built_at: string | null; building?: boolean; evidence_events: number;
  tabs: Record<string, { total: number; buy: number }>; items: ImpactEvent[];
}

export const TABS: { key: string; label: string; short: string }[] = [
  { key: 'early', label: 'Early Radar', short: 'Early' },
  { key: 'dividends', label: 'Dividends', short: 'Dividends' },
  { key: 'bonus_split', label: 'Bonus & Splits', short: 'Bonus/Split' },
  { key: 'buyback', label: 'Buybacks', short: 'Buybacks' },
  { key: 'rights', label: 'Rights & Fund Raising', short: 'Rights' },
  { key: 'demerger', label: 'Demergers', short: 'Demergers' },
];

export const ACTION_ORDER: Action[] = ['BUY', 'SKIP', 'AVOID', 'DONE'];

/** "Ex-date in 2 days" / "Meeting tomorrow" / "Ex-date was 3 days ago" */
export const whenText = (e: ImpactEvent): string => {
  const d = e.days_to;
  const rel = d == null ? '' : d === 0 ? 'today' : d === 1 ? 'tomorrow' : d > 0 ? `in ${d} days` : `${-d} days ago`;
  if (e.stage === 'NOTICE') return `Meeting ${rel}`;
  if (e.stage === 'DECLARED') return `Ex-date ${rel}`;
  if (e.stage === 'EX_PASSED') return d != null && d < 0 ? `Ex-date was ${rel}` : 'Ex-date today';
  return `Meeting was ${rel}`;
};

export const keyDate = (e: ImpactEvent): string | null | undefined =>
  e.stage === 'NOTICE' || e.stage === 'MEETING_DONE' ? e.meeting_date : e.ex_date;
