import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useQuery, useMutation, gql } from '@apollo/client';
import { Typography, Box, CircularProgress, Chip, InputBase, Tooltip, Button, Dialog, DialogTitle, DialogContent, Grid, DialogActions, Popover } from '@mui/material';
import { GridColDef, GridRenderCellParams, GridRowSelectionModel } from '@mui/x-data-grid';
import SearchIcon from '@mui/icons-material/Search';
import ZoomInIcon from '@mui/icons-material/ZoomIn';
import NewspaperIcon from '@mui/icons-material/Newspaper';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import RefreshIcon from '@mui/icons-material/Refresh';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import { StatusBadge, ErrorBoundary, FilterChipGroup, BulkActionBar, RowTintedDataGrid } from '../components/common';
import { SmartCron } from '../components/common/SmartCron';
import { sentimentCache, SentimentData } from '../store/sentimentCache';
import { useThemeMode } from '../theme/ThemeContext';
import { apiUrl } from '../utils/api';
import { PreReleaseEdgeCell } from '../components/events/PreReleaseEdgeCell';
import { PreReleaseEdgeDialog } from '../components/events/PreReleaseEdgeDialog';
import { GET_PRE_RELEASE_EDGES, PreReleaseEdge, isTradeVerdict } from '../components/events/preReleaseTypes';
import { useNavigate } from 'react-router-dom';
import { useIsMobile } from '../hooks/useResponsive';
import type { MobileSortOption } from '../components/common';

// ─── Standalone News Cell ──────────────────────────────────────────────────────
interface NewsItem { title: string; summary: string; url: string; source: string; published: string; }

const NewsCell: React.FC<{ ticker: string; name: string; label?: string }> = ({ ticker, name, label = 'VIEW ↗' }) => {
  const { tokens } = useThemeMode();
  const [news, setNews] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [fetched, setFetched] = useState(false);

  const fetchNews = useCallback(async () => {
    if (fetched) { setExpanded(true); return; }
    setLoading(true);
    setExpanded(true);
    try {
      const res = await fetch(apiUrl(`/api/news/${ticker}?name=${encodeURIComponent(name || ticker)}`));
      if (res.ok) {
        const data = await res.json();
        setNews(data.news || []);
      }
    } catch (_) { }
    setFetched(true);
    setLoading(false);
  }, [ticker, name, fetched]);
  return (
    <Box sx={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {/* Table cell row - Only the VIEW button */}
      <Button
        size="small"
        onClick={(e) => { e.stopPropagation(); fetchNews(); }}
        sx={{
          minWidth: 0,
          px: '12px',
          py: '4px',
          fontSize: '10px',
          fontWeight: 700,
          color: tokens.text.primary,
          backgroundColor: 'transparent',
          border: `1px solid ${tokens.text.tertiary}`,
          textTransform: 'none',
          lineHeight: '16px',
          borderRadius: '4px',
          transition: 'all 0.15s ease-in-out',
          '&:hover': {
            borderColor: tokens.border.focus,
            backgroundColor: tokens.background.cardHover,
            color: tokens.text.primary
          }
        }}
      >
        {loading ? '…' : label}
      </Button>

      {/* Popup Dialog */}
      <Dialog
        open={expanded}
        onClose={(e: any) => { e.stopPropagation(); setExpanded(false); }}
        maxWidth="sm"
        fullWidth
        PaperProps={{
          sx: {
            backgroundColor: tokens.background.card,
            backgroundImage: 'none',
            border: `1px solid ${tokens.border.main}`,
            borderRadius: '12px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
          }
        }}
      >
        <DialogTitle sx={{ p: 2, borderBottom: `1px solid ${tokens.border.main}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <NewspaperIcon sx={{ color: tokens.accent.main, fontSize: 20 }} />
            <Typography sx={{ fontSize: '14px', fontWeight: 700, color: tokens.text.primary, letterSpacing: '0.5px' }}>
              {name || ticker} • LATEST NEWS
            </Typography>
          </Box>
          <Button onClick={(e) => { e.stopPropagation(); setExpanded(false); }} sx={{ color: tokens.text.tertiary, minWidth: 0, p: 0.5 }}>
            ✕
          </Button>
        </DialogTitle>

        <DialogContent sx={{ p: 0, maxHeight: '60vh' }}>
          {loading && (
            <Box sx={{ p: 4, display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'center', justifyContent: 'center' }}>
              <CircularProgress size={32} sx={{ color: tokens.accent.main }} />
              <Typography sx={{ fontSize: '13px', color: tokens.text.tertiary }}>Aggregating latest articles from financial feeds…</Typography>
            </Box>
          )}
          {!loading && news.length === 0 && (
            <Box sx={{ p: 4, textAlign: 'center' }}>
              <Typography sx={{ fontSize: '13px', color: tokens.text.tertiary }}>No recent news found for this company.</Typography>
            </Box>
          )}
          {!loading && news.map((item, idx) => (
            <Box
              key={idx}
              component="a"
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              sx={{
                display: 'block',
                p: 2,
                textDecoration: 'none',
                borderBottom: idx < news.length - 1 ? `1px solid ${tokens.border.main}` : 'none',
                '&:hover': { backgroundColor: tokens.background.cardHover },
                cursor: 'pointer',
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
                <Typography sx={{ fontSize: '13px', fontWeight: 600, color: tokens.text.primary, lineHeight: '18px', flex: 1 }}>
                  {item.title}
                </Typography>
                <OpenInNewIcon sx={{ fontSize: 16, color: tokens.text.tertiary, flexShrink: 0 }} />
              </Box>
              <Box sx={{ display: 'flex', gap: 1, mt: 1, alignItems: 'center' }}>
                <Chip size="small" label={item.source} sx={{ height: '20px', fontSize: '10px', fontWeight: 700, backgroundColor: tokens.primary.tint, color: tokens.text.primary, border: `1px solid ${tokens.border.light}` }} />
                <Typography sx={{ fontSize: '11px', color: tokens.text.tertiary }}>{item.published}</Typography>
              </Box>
              {item.summary && (
                <Typography sx={{ fontSize: '12px', color: tokens.text.secondary, mt: 1, lineHeight: '18px' }}>
                  {item.summary.length > 250 ? item.summary.slice(0, 250) + '…' : item.summary}
                </Typography>
              )}
            </Box>
          ))}
        </DialogContent>
      </Dialog>
    </Box>
  );
};
// ──────────────────────────────────────────────────────────────────────────────

// ─── Standalone News Sentiment Cell ────────────────────────────────────────────
const NewsSentimentCell: React.FC<{ ticker: string; name: string }> = ({ ticker, name }) => {
  const { tokens } = useThemeMode();
  // Read initial from cache synchronously
  const [data, setData] = useState<SentimentData | null>(() => sentimentCache.get(ticker));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Subscribe to cache updates
    const unsubscribe = sentimentCache.subscribe(ticker, (newData, newError) => {
      setData(newData);
      setError(newError);
      setLoading(false);
    });

    // If we already have data synchronously, we don't fetch. 
    // Otherwise, observe visibility to fetch.
    if (!data && !error) {
      const observer = new IntersectionObserver(
        (entries) => {
          if (entries[0].isIntersecting) {
            // Already cached check inside fetch, but sets in-flight
            setLoading(true);
            setTimeout(() => {
              sentimentCache.fetch(ticker, name).catch(() => setError(true));
            }, Math.random() * 500);
            observer.disconnect();
          }
        },
        { threshold: 0.1 }
      );

      if (containerRef.current) {
        observer.observe(containerRef.current);
      }
      return () => {
        unsubscribe();
        observer.disconnect();
      };
    }

    return unsubscribe;
  }, [ticker, name, data, error]);

  const handleRefresh = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (loading) return;
    setLoading(true);
    sentimentCache.fetch(ticker, name, true).catch(() => setError(true)).finally(() => setLoading(false));
  };

  const getSentimentColor = (sentiment: string) => {
    switch (sentiment) {
      case 'BULLISH': return tokens.status.success.main;
      case 'BEARISH': return tokens.status.error.main;
      case 'MIXED': return tokens.status.warning.main;
      case 'NEUTRAL': return tokens.text.tertiary;
      default: return tokens.text.disabled;
    }
  };

  const formatScore = (score: number) => {
    const sign = score >= 0 ? '+' : '';
    return `${sign}${score}`;
  };

  if (!data && !error) {
    return (
      <Box ref={containerRef} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', width: '100%' }}>
        <Typography sx={{ fontSize: { xs: '11.5px', sm: '10px' }, color: tokens.text.tertiary, fontStyle: 'italic' }}>
          {loading ? 'Analyzing…' : '—'}
        </Typography>
      </Box>
    );
  }

  if ((error && !data) || (data && data.overallSentiment === 'INSUFFICIENT_DATA')) {
    return (
      <Box ref={containerRef} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', width: '100%' }}>
        <Typography sx={{ fontSize: { xs: '11.5px', sm: '10px' }, color: tokens.text.disabled }}>—</Typography>
      </Box>
    );
  }

  const sentColor = data ? getSentimentColor(data.overallSentiment) : tokens.text.disabled;
  const open = Boolean(anchorEl);

  return (
    <Box ref={containerRef} sx={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
      {/* Compact inline indicator */}
      <Box
        onClick={(e) => { e.stopPropagation(); setAnchorEl(e.currentTarget); }}
        sx={{
          cursor: 'pointer',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '1px',
          py: '2px',
          px: '6px',
          borderRadius: '4px',
          transition: 'background-color 0.15s',
          '&:hover': { backgroundColor: tokens.background.cardHover }
        }}
      >
        {/* Row 1: Sentiment label + score + refresh */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <Typography className="mono-font tabular-nums" sx={{ fontSize: { xs: '11.5px', sm: '10px' }, fontWeight: 700, color: sentColor, letterSpacing: '0.3px' }}>
            {data!.overallSentiment}
          </Typography>
          <Typography className="mono-font tabular-nums" sx={{ fontSize: { xs: '11.5px', sm: '10px' }, fontWeight: 700, color: sentColor }}>
            {formatScore(data!.sentimentScore)}
          </Typography>
          <Box
            onClick={handleRefresh}
            title="Refresh sentiment"
            sx={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: '28px', height: '28px', borderRadius: '4px',
              color: tokens.text.tertiary,
              cursor: 'pointer',
              transition: 'all 0.15s ease-in-out',
              '&:hover': { color: tokens.text.primary, backgroundColor: tokens.background.cardHover },
              animation: loading ? 'spin 1s linear infinite' : 'none',
              '@keyframes spin': { '0%': { transform: 'rotate(0deg)' }, '100%': { transform: 'rotate(360deg)' } }
            }}
          >
            <RefreshIcon sx={{ fontSize: 15 }} />
          </Box>
        </Box>
        {/* Row 2: Confidence dot + theme */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
          <Box sx={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: sentColor, flexShrink: 0 }} />
          <Typography sx={{ fontSize: { xs: '11px', sm: '9px' }, fontWeight: 500, color: loading ? tokens.text.tertiary : tokens.text.secondary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '90px' }}>
            {loading ? 'Analyzing...' : `${data!.confidence} · ${data!.dominantTheme || data!.trend}`}
          </Typography>
        </Box>
      </Box>

      {/* Detail Popover */}
      {data && (
        <Popover
          open={open}
          anchorEl={anchorEl}
          onClose={(e: any) => { e?.stopPropagation?.(); setAnchorEl(null); }}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
          transformOrigin={{ vertical: 'top', horizontal: 'center' }}
          slotProps={{
            paper: {
              sx: {
                backgroundColor: tokens.background.card,
                border: `1px solid ${tokens.border.main}`,
                borderRadius: '8px',
                boxShadow: tokens.shadows.dropdown,
                p: 0,
                width: 300,
                maxHeight: '400px',
                overflow: 'auto'
              }
            }
          }}
        >
          {/* Popover Header */}
          <Box sx={{ p: 2, borderBottom: `1px solid ${tokens.border.main}` }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
              <Typography sx={{ fontSize: '11px', fontWeight: 700, color: tokens.text.secondary, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                N. Sentiment
              </Typography>
              <Typography sx={{ fontSize: { xs: '11.5px', sm: '10px' }, color: tokens.text.tertiary }}>
                {data.articleCount} articles
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
              <Typography className="mono-font" sx={{ fontSize: '18px', fontWeight: 800, color: sentColor }}>
                {data.overallSentiment}
              </Typography>
              <Typography className="mono-font tabular-nums" sx={{ fontSize: '16px', fontWeight: 700, color: sentColor }}>
                {formatScore(data.sentimentScore)}
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', gap: '12px', mt: 1 }}>
              <Typography sx={{ fontSize: { xs: '11.5px', sm: '10px' }, color: tokens.text.secondary }}>
                <span style={{ fontWeight: 600 }}>Confidence:</span> {data.confidence}
              </Typography>
              <Typography sx={{ fontSize: { xs: '11.5px', sm: '10px' }, color: tokens.text.secondary }}>
                <span style={{ fontWeight: 600 }}>Impact:</span> {data.impact}
              </Typography>
              <Typography sx={{ fontSize: { xs: '11.5px', sm: '10px' }, color: tokens.text.secondary }}>
                <span style={{ fontWeight: 600 }}>Trend:</span> {data.trend}
              </Typography>
            </Box>
          </Box>

          {/* Article Breakdown */}
          <Box sx={{ p: 2, borderBottom: `1px solid ${tokens.border.main}` }}>
            <Typography sx={{ fontSize: { xs: '11.5px', sm: '10px' }, fontWeight: 700, color: tokens.text.secondary, textTransform: 'uppercase', letterSpacing: '0.3px', mb: 1 }}>
              Article Breakdown
            </Typography>
            <Box sx={{ display: 'flex', gap: '6px', mb: 1 }}>
              {(['bullish', 'neutral', 'bearish', 'mixed'] as const).map(key => {
                const count = data.articleBreakdown[key] || 0;
                if (count === 0) return null;
                const colorMap = { bullish: tokens.status.success.main, bearish: tokens.status.error.main, neutral: tokens.text.tertiary, mixed: tokens.status.warning.main };
                return (
                  <Box key={key} sx={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                    <Box sx={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: colorMap[key] }} />
                    <Typography sx={{ fontSize: { xs: '11.5px', sm: '10px' }, color: tokens.text.secondary, fontWeight: 500 }}>
                      {key.charAt(0).toUpperCase() + key.slice(1)}: {count}
                    </Typography>
                  </Box>
                );
              })}
            </Box>
            {/* Visual bar */}
            <Box sx={{ display: 'flex', height: '4px', borderRadius: '2px', overflow: 'hidden', backgroundColor: tokens.border.main }}>
              {(() => {
                const total = (data.articleBreakdown.bullish || 0) + (data.articleBreakdown.bearish || 0) + (data.articleBreakdown.neutral || 0) + (data.articleBreakdown.mixed || 0);
                if (total === 0) return null;
                return (
                  <>
                    {data.articleBreakdown.bullish > 0 && <Box sx={{ width: `${(data.articleBreakdown.bullish / total) * 100}%`, backgroundColor: tokens.status.success.main }} />}
                    {data.articleBreakdown.neutral > 0 && <Box sx={{ width: `${(data.articleBreakdown.neutral / total) * 100}%`, backgroundColor: tokens.text.tertiary }} />}
                    {data.articleBreakdown.mixed > 0 && <Box sx={{ width: `${(data.articleBreakdown.mixed / total) * 100}%`, backgroundColor: tokens.status.warning.main }} />}
                    {data.articleBreakdown.bearish > 0 && <Box sx={{ width: `${(data.articleBreakdown.bearish / total) * 100}%`, backgroundColor: tokens.status.error.main }} />}
                  </>
                );
              })()}
            </Box>
          </Box>

          {/* Theme & Drivers */}
          <Box sx={{ p: 2, borderBottom: data.contradictions ? `1px solid ${tokens.border.main}` : 'none' }}>
            {data.dominantTheme && (
              <Box sx={{ mb: 1 }}>
                <Typography sx={{ fontSize: { xs: '11.5px', sm: '10px' }, fontWeight: 700, color: tokens.text.secondary, textTransform: 'uppercase', letterSpacing: '0.3px', mb: 0.5 }}>
                  Dominant Theme
                </Typography>
                <Typography sx={{ fontSize: '11px', fontWeight: 600, color: tokens.text.primary }}>
                  {data.dominantTheme}
                </Typography>
              </Box>
            )}
            <Typography sx={{ fontSize: { xs: '11.5px', sm: '10px' }, fontWeight: 700, color: tokens.text.secondary, textTransform: 'uppercase', letterSpacing: '0.3px', mb: 0.5 }}>
              Key Drivers
            </Typography>
            <Typography sx={{ fontSize: '11px', color: tokens.text.secondary, lineHeight: 1.5 }}>
              {data.keyDrivers}
            </Typography>
          </Box>

          {/* Contradictions */}
          {data.contradictions && (
            <Box sx={{ p: 2, borderBottom: `1px solid ${tokens.border.main}` }}>
              <Typography sx={{ fontSize: { xs: '11.5px', sm: '10px' }, fontWeight: 700, color: tokens.status.warning.main, textTransform: 'uppercase', letterSpacing: '0.3px', mb: 0.5 }}>
                Conflicting Signals
              </Typography>
              <Typography sx={{ fontSize: '11px', color: tokens.text.secondary, lineHeight: 1.5 }}>
                {data.contradictions}
              </Typography>
            </Box>
          )}

          {/* Footer */}
          <Box sx={{ px: 2, py: 1.5, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography sx={{ fontSize: { xs: '11px', sm: '9px' }, color: tokens.text.disabled }}>
              Updated: {data.lastUpdated ? new Date(data.lastUpdated).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
            </Typography>
            <Typography sx={{ fontSize: { xs: '11px', sm: '9px' }, color: tokens.text.disabled }}>
              {data.articleCount} articles analyzed
            </Typography>
          </Box>
        </Popover>
      )}
    </Box>
  );
};
// ──────────────────────────────────────────────────────────────────────────────


const GET_COMPANIES = gql`
  query GetCompanies {
    companies {
      id
      ticker
      name
      purpose
      upcomingDate
      currentPrice
      marketCap
      q1Eps
      q2Eps
      q3Eps
      q4Eps
      q0Eps
      q1Date
      q2Date
      q3Date
      q4Date
      q1Revenue
      q2Revenue
      q3Revenue
      q4Revenue
      q0Revenue
      q1Profit
      q2Profit
      q3Profit
      q4Profit
      q0Profit
      historicalTrend
      financialHealthScore
      financialHealthGrade
      momentumProbability
      avgPostEarningsMomentum
      postReleaseReturn
    }
  }
`;

const formatValCr = (val: any) => {
  if (val == null || val === '') return '—';
  const n = Number(val);
  if (isNaN(n) || n === 0) return '—';
  const inCr = Math.abs(n) >= 100000 ? n / 10000000 : n;
  return `${inCr < 0 ? '-' : ''}₹${Math.abs(inCr).toLocaleString('en-IN', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} Cr`;
};

const formatPrice = (val: any) => {
  if (val == null || val === '') return '—';
  const n = Number(val);
  if (isNaN(n) || n === 0) return '—';
  return `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const formatRelativeDate = (dateStr?: string | null) => {
  if (!dateStr) return '—';
  const eventDate = new Date(dateStr);
  if (isNaN(eventDate.getTime())) return dateStr;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(eventDate);
  target.setHours(0, 0, 0, 0);

  const diffDays = Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Tomorrow';
  if (diffDays === -1) return 'Yesterday';
  if (diffDays > 1 && diffDays <= 7) return `In ${diffDays} days`;
  if (diffDays < -1 && diffDays >= -7) return `${Math.abs(diffDays)} days ago`;
  return dateStr;
};


const MASS_CALCULATE_HEALTH = gql`
  mutation MassCalculateHealth {
    massCalculateFinancialHealth
  }
`;


/** Letter grade used by the HEALTH column and the mobile card (same rules for both). */
const healthLetter = (scoreVal: any, gradeVal: any): { letter: string; score: number } | null => {
  const score = scoreVal != null ? Number(scoreVal) : NaN;
  if (isNaN(score) || score <= 0) return null;
  const gradeStr = String(gradeVal || '');
  const byScore = score >= 80 ? 'A' : score >= 70 ? 'B' : score >= 50 ? 'C' : score >= 40 ? 'D' : 'F';
  if (/[A-F]/.test(gradeStr)) {
    const match = gradeStr.match(/Grade\s*([A-F])/i) || gradeStr.match(/\b([A-F])\b/);
    return { letter: match && match[1] ? match[1].toUpperCase() : byScore, score };
  }
  return { letter: byScore, score };
};

/** Sort key for the PRE-RELEASE EDGE column: trade calls first, then AVOID, then the rest; graded last. */
const edgeSortValue = (e?: PreReleaseEdge) => {
  if (!e) return -Infinity;
  if (e.graded) return -1;
  return isTradeVerdict(e.verdict) ? 1000 + (e.convictionScore || 0) : e.verdict === 'AVOID' ? 500 + (e.convictionScore || 0) : e.convictionScore || 0;
};

const HomeContent: React.FC = () => {
  const { mode, tokens } = useThemeMode();
  const isDark = mode === 'dark';
  const isMobile = useIsMobile();
  const navigate = useNavigate();

  const [expandQuarters, setExpandQuarters] = useState<boolean>(false);
  const [selectedRowIds, setSelectedRowIds] = useState<GridRowSelectionModel>([]);
  const [detailModalRow, setDetailModalRow] = useState<any>(null);
  const [search, setSearch] = useState('');
  const [filterMode, setFilterMode] = useState<'ALL' | 'RECENT_EVENTS' | 'HIGH_HEALTH' | 'EDGE_SETUPS'>('ALL');
  const [edgeDialog, setEdgeDialog] = useState<{ companyId: string; name: string } | null>(null);

  const { loading, error, data } = useQuery(GET_COMPANIES, { fetchPolicy: 'network-only' });
  const { data: edgeData } = useQuery(GET_PRE_RELEASE_EDGES, { fetchPolicy: 'network-only' });
  const edgeMap = useMemo(() => {
    const m = new Map<string, PreReleaseEdge>();
    (edgeData?.preReleaseEdges || []).forEach((e: PreReleaseEdge) => m.set(e.companyId, e));
    return m;
  }, [edgeData]);
  const isEdgeSetup = useCallback((id: string) => {
    const e = edgeMap.get(id);
    return Boolean(e && !e.graded && isTradeVerdict(e.verdict));
  }, [edgeMap]);
    const [massCalculate] = useMutation(MASS_CALCULATE_HEALTH, {
    onCompleted: () => {
      alert("Mass financial health analysis queued for all stocks! Check Tasks page for progress and refresh to view scores.");
    },
    onError: (err) => {
      console.error("Health calculation failed", err);
      alert("Failed to queue health calculation.");
    }
  });

    
      
    
    
  const handleCalculateHealth = useCallback(() => {
    massCalculate();
  }, [massCalculate]);

  
  const baseRows = useMemo(() => {
    if (!Array.isArray(data?.companies)) return [];
    const lowerSearch = (search || '').trim().toLowerCase();
    return data.companies.filter((c: any) =>
      (c.ticker || '').toLowerCase().includes(lowerSearch) ||
      (c.name || '').toLowerCase().includes(lowerSearch)
    ).map((c: any) => ({
      id: c.id,
      ...c
    }));
  }, [data?.companies, search]);

  const recentEventsCount = useMemo(() => {
    if (!Array.isArray(data?.companies)) return 0;
    return data.companies.filter((c: any) => {
      if (!c.upcomingDate) return false;
      const eventDate = new Date(c.upcomingDate);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      eventDate.setHours(0, 0, 0, 0);
      const diffDays = Math.ceil((eventDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      return diffDays >= 0 && diffDays <= 3;
    }).length || 0;
  }, [data?.companies]);

  const edgeSetupCount = useMemo(() => baseRows.filter((c: any) => isEdgeSetup(c.id)).length, [baseRows, isEdgeSetup]);

  const highHealthCount = useMemo(() => {
    if (!Array.isArray(data?.companies)) return 0;
    return data.companies.filter((c: any) => (c.financialHealthScore || 0) >= 70).length || 0;
  }, [data?.companies]);

  const rows = useMemo(() => {
    return baseRows.filter((c: any) => {
      if (filterMode === 'RECENT_EVENTS') {
        if (!c.upcomingDate) return false;
        const eventDate = new Date(c.upcomingDate);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        eventDate.setHours(0, 0, 0, 0);
        const diffDays = Math.ceil((eventDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        return diffDays >= 0 && diffDays <= 3;
      }
      if (filterMode === 'HIGH_HEALTH') {
        return (c.financialHealthScore || 0) >= 70;
      }
      if (filterMode === 'EDGE_SETUPS') {
        return isEdgeSetup(c.id);
      }
      return true;
    });
  }, [baseRows, filterMode, isEdgeSetup]);

  const sampleRow = useMemo(() => {
    if (!Array.isArray(data?.companies)) return {};
    return data.companies.find((c: any) => c.q4Date && c.q3Date) || {};
  }, [data?.companies]);

  const getDateLabel = useCallback((dbDate: string | undefined, fallbackMonth: string) => dbDate ? `${dbDate} ` : `${fallbackMonth} `, []);
  const q4Prefix = getDateLabel(sampleRow.q4Date, "Mar-2026");
  const q3Prefix = getDateLabel(sampleRow.q3Date, "Dec-2025");
  const q2Prefix = getDateLabel(sampleRow.q2Date, "Sep-2025");
  const q1Prefix = getDateLabel(sampleRow.q1Date, "Jun-2025");

  const dateSortComparator = useCallback((v1: string | null, v2: string | null) => {
    if (!v1 && !v2) return 0;
    if (!v1) return -1;
    if (!v2) return 1;
    const d1 = new Date(v1).getTime();
    const d2 = new Date(v2).getTime();
    if (isNaN(d1) && isNaN(d2)) return String(v1).localeCompare(String(v2));
    if (isNaN(d1)) return -1;
    if (isNaN(d2)) return 1;
    return d1 - d2;
  }, []);

  const renderSignalBadge = useCallback((status: string) => {
    const green = tokens.status.success.main;
    const red = tokens.status.error.main;
    const amber = tokens.status.warning.main;
    const cyan = tokens.status.info?.main || '#00B4D8';

    const colorMap: Record<string, { color: string; icon: string }> = {
      'BUY PRE-RELEASE': { color: green, icon: '•' },
      'AVOID PRE-RELEASE': { color: red, icon: '•' },
      'NEUTRAL / HOLD': { color: amber, icon: '•' },
      'TARGET HIT / WIN': { color: green, icon: '✓' },
      'PREDICTION FAILED': { color: red, icon: '✕' },
      'CONTRARY SURGE': { color: amber, icon: '•' },
      'HOLD VALIDATED': { color: cyan, icon: '•' },
      'LOSSES AVOIDED': { color: green, icon: '✓' },
    };

    const style = colorMap[status] || { color: tokens.text.secondary, icon: '•' };

    return (
      <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11px', fontWeight: 500, color: tokens.text.secondary }}>
        <span style={{ color: style.color, fontSize: '14px', lineHeight: 1 }}>{style.icon}</span>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{status}</span>
      </Box>
    );
  }, [tokens]);

  const renderClubbedQuarterCell = useCallback((
    currRev?: number | null, prevRev?: number | null,
    currProfit?: number | null, prevProfit?: number | null,
    currEps?: number | null, prevEps?: number | null,
    trendOverride?: string
  ) => {
    if (currRev == null && currProfit == null && currEps == null) {
      return <Box sx={{ py: 1 }}><Typography sx={{ fontSize: '12px', color: tokens.text.tertiary }}>—</Typography></Box>;
    }

    const renderSubRow = (label: string, curr?: number | null, prev?: number | null, isCurrency: boolean = true) => {
      const valText = curr != null && !isNaN(curr) ? (isCurrency ? formatValCr(curr) : curr.toString()) : '—';
      let pctEl = null;
      if (curr != null && prev != null && !isNaN(curr) && !isNaN(prev) && prev !== 0) {
        const pct = ((curr - prev) / Math.abs(prev)) * 100;
        if (!isNaN(pct) && isFinite(pct)) {
          const isPositive = pct >= 0;
          pctEl = (
            <Box component="span" className="mono-font tabular-nums" sx={{ color: isPositive ? tokens.status.success.main : tokens.status.error.main, fontWeight: 600, fontSize: '11px', ml: '6px' }}>
              {isPositive ? '+' : ''}{Number(pct).toFixed(1)}%
            </Box>
          );
        }
      }

      return (
        <Box key={label} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', py: '2px', borderBottom: `1px solid ${tokens.border.main}` }}>
          <Typography component="span" sx={{ fontSize: '11px', color: tokens.text.secondary, fontWeight: 500 }}>{label}:</Typography>
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            <Typography component="span" className="mono-font tabular-nums" sx={{ fontSize: '12px', color: tokens.text.primary, fontWeight: 600 }}>{valText}</Typography>
            {pctEl}
          </Box>
        </Box>
      );
    };

    let isUp = trendOverride === 'UP';
    let trendLabel = trendOverride || 'N/A';
    if (currEps != null && prevEps != null && !isNaN(currEps) && !isNaN(prevEps) && prevEps !== 0) {
      isUp = (currEps - prevEps) >= 0;
      trendLabel = isUp ? 'UP' : 'DOWN';
    }

    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', width: '100%', py: 0.5 }}>
        {renderSubRow('Rev', currRev, prevRev, true)}
        {renderSubRow('Prof', currProfit, prevProfit, true)}
        {renderSubRow('EPS', currEps, prevEps, false)}
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', pt: '4px' }}>
          <Typography component="span" sx={{ fontSize: '11px', color: tokens.text.secondary, fontWeight: 500 }}>Trend:</Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', fontWeight: 500, color: tokens.text.secondary }}>
            <span style={{ color: isUp ? tokens.status.success.main : tokens.status.error.main, fontSize: '14px', lineHeight: 1 }}>•</span>
            <span>{trendLabel}</span>
          </Box>
        </Box>
      </Box>
    );
  }, [tokens]);

  const columns: GridColDef[] = useMemo(() => [
    {
      field: 'name',
      headerName: 'COMPANY / TICKER',
      width: 240,
      minWidth: 240,
      type: 'string',
      headerAlign: 'left',
      align: 'left',
      sortable: true,
      renderCell: (p) => (
        <Box
          onClick={() => window.open(`/companies/${p.row?.id}`, '_blank', 'noopener,noreferrer')}
          sx={{ display: 'flex', flexDirection: 'column', gap: '2px', justifyContent: 'center', height: '100%', cursor: 'pointer', overflow: 'hidden', width: '100%', '&:hover .company-name': { color: tokens.accent.main, textDecoration: 'underline' } }}
        >
          <Typography className="company-name" noWrap sx={{ fontSize: '12px', fontWeight: 600, color: tokens.text.primary, lineHeight: '16px', transition: 'color 0.15s' }}>
            {p.row?.name || p.row?.company || '—'}
          </Typography>
          <Typography noWrap sx={{ fontSize: '11px', fontWeight: 500, color: tokens.text.secondary, lineHeight: '14px' }}>
            {p.row?.ticker || '—'} {p.row?.exchange || 'NSE'}
          </Typography>
        </Box>
      )
    },
    {
      field: 'preReleaseEdge',
      headerName: 'PRE-RELEASE EDGE',
      width: 235,
      minWidth: 235,
      type: 'number',
      headerAlign: 'left',
      align: 'left',
      sortable: true,
      description: 'Forecast for results due in the next 30 days: probability and expected move vs Nifty for the recommended strategy (run-up before results, or holding through results). Click VIEW for the full plan.',
      valueGetter: (_v: any, row: any) => edgeSortValue(edgeMap.get(row?.id)),
      renderCell: (p) => (
        <PreReleaseEdgeCell
          edge={edgeMap.get(p.row?.id)}
          upcomingDate={p.row?.upcomingDate}
          onOpen={() => setEdgeDialog({ companyId: p.row?.id, name: p.row?.name || p.row?.ticker })}
        />
      )
    },
    {
      field: 'currentPrice',
      headerName: 'PRICE',
      width: 110,
      type: 'number',
      headerAlign: 'right',
      align: 'right',
      valueGetter: (_v: any, row: any) => row?.currentPrice != null && !isNaN(row.currentPrice) ? Number(row.currentPrice) : -Infinity,
      renderCell: (p) => (
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', width: '100%', height: '100%' }}>
          <Typography className="mono-font tabular-nums" sx={{ fontSize: '12px', fontWeight: 600, color: tokens.text.primary }}>
            {formatPrice(p.row?.currentPrice)}
          </Typography>
        </Box>
      )
    },
    {
      field: 'marketCap',
      headerName: 'MKTCAP',
      width: 125,
      type: 'number',
      headerAlign: 'right',
      align: 'right',
      valueGetter: (_v: any, row: any) => row?.marketCap != null && !isNaN(row.marketCap) ? Number(row.marketCap) : -Infinity,
      renderCell: (p) => (
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', width: '100%', height: '100%' }}>
          <Typography className="mono-font tabular-nums" sx={{ fontSize: '12px', fontWeight: 500, color: tokens.text.secondary }}>
            {formatValCr(p.row?.marketCap)}
          </Typography>
        </Box>
      )
    },
    {
      field: 'financialHealthScore',
      headerName: 'HEALTH',
      width: 70,
      type: 'number',
      headerAlign: 'center',
      align: 'center',
      sortable: true,
      valueGetter: (_v: any, row: any) => row?.financialHealthScore != null && !isNaN(row.financialHealthScore) ? Number(row.financialHealthScore) : -Infinity,
      renderCell: (p) => {
        const hl = healthLetter(p.row?.financialHealthScore, p.row?.financialHealthGrade);
        if (!hl) {
          return (
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%' }}>
              <Chip label="—" size="small" sx={{ fontSize: '11px', height: '26px', width: '32px', backgroundColor: tokens.background.cardHover, color: tokens.text.tertiary, borderRadius: '6px' }} />
            </Box>
          );
        }
        const { letter, score } = hl;

        let letterColor = tokens.status.warning.main;
        if (letter === 'A' || letter === 'B' || score >= 70) letterColor = tokens.status.success.main;
        else if (letter === 'C' || letter === 'D') letterColor = tokens.status.warning.main;
        else letterColor = tokens.status.error.main;

        return (
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%' }}>
            <Tooltip title={`Financial Health: ${Number(score).toFixed(0)} / 100 (${p.row?.financialHealthGrade || 'Grade ' + letter})`} placement="top">
              <Typography sx={{ fontSize: '13px', fontWeight: 700, color: letterColor, cursor: 'help' }}>
                {letter}
              </Typography>
            </Tooltip>
          </Box>
        );
      }
    },
    {
      field: 'momentumProbability',
      headerName: 'MOM PROB',
      width: 105,
      type: 'number',
      headerAlign: 'right',
      align: 'right',
      sortable: true,
      valueGetter: (_v: any, row: any) => row?.momentumProbability != null && !isNaN(row.momentumProbability) ? Number(row.momentumProbability) : -Infinity,
      renderCell: (p) => {
        const prob = p.row?.momentumProbability != null ? Number(p.row.momentumProbability) : NaN;
        if (isNaN(prob) || prob < 0) {
          return (
            <Tooltip title="View Deep-Dive Financial Report" placement="top">
              <Box onClick={() => setDetailModalRow(p.row)} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', width: '100%', height: '100%', cursor: 'pointer', '&:hover .zoom-icon': { color: tokens.accent.main } }}>
                <Typography sx={{ fontSize: '11px', color: tokens.text.tertiary, mr: 0.5 }}>—</Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '28px', height: '28px', borderRadius: '4px' }}>
                  <ZoomInIcon className="zoom-icon" sx={{ fontSize: 16, color: tokens.text.tertiary, transition: 'color 0.15s' }} />
                </Box>
              </Box>
            </Tooltip>
          );
        }
        let barColor = tokens.status.error.main;
        if (prob >= 75) barColor = tokens.status.success.main;
        else if (prob >= 50) barColor = tokens.status.warning.main;

        return (
          <Tooltip title="View Deep-Dive Financial Report" placement="top">
            <Box
              onClick={() => setDetailModalRow(p.row)}
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-end',
                width: '100%',
                height: '100%',
                cursor: 'pointer',
                transition: 'none',
                '&:hover .prob-text': { color: tokens.accent.main },
                '&:hover .zoom-icon': { color: tokens.accent.main, opacity: 1 }
              }}
            >
              <Typography className="mono-font tabular-nums prob-text" sx={{ fontSize: '12px', fontWeight: 600, color: tokens.text.primary }}>
                {Number(prob).toFixed(0)}%
              </Typography>
              <Box sx={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: barColor, mx: '6px' }} />
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '28px', height: '28px', borderRadius: '4px' }}>
                <ZoomInIcon className="zoom-icon" sx={{ fontSize: 16, color: tokens.text.tertiary, transition: 'color 0.1s, opacity 0.1s' }} />
              </Box>
            </Box>
          </Tooltip>
        );
      }
    },
    {
      field: 'avgPostEarningsMomentum',
      headerName: 'AVG MOMENTUM / BUY INDICATOR',
      width: 250,
      type: 'number',
      headerAlign: 'left',
      align: 'left',
      sortable: true,
      valueGetter: (_v: any, row: any) => row?.avgPostEarningsMomentum != null && !isNaN(row.avgPostEarningsMomentum) ? Number(row.avgPostEarningsMomentum) : -Infinity,
      renderCell: (p) => {
        const avgMom = p.row?.avgPostEarningsMomentum != null ? Number(p.row.avgPostEarningsMomentum) : NaN;
        const prob = p.row?.momentumProbability != null ? Number(p.row.momentumProbability) : 0;
        if (isNaN(avgMom)) {
          return (
            <Box sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', height: '100%', py: 0.5, gap: '2px' }}>
              <Typography sx={{ fontSize: '11px', color: tokens.text.secondary, fontWeight: 500 }}>Not Calc</Typography>
              {renderSignalBadge('NEUTRAL / HOLD')}
            </Box>
          );
        }

        const isPos = avgMom >= 0;
        const momColor = isPos ? tokens.status.success.main : tokens.status.error.main;
        const momArrow = isPos ? '▲' : '▼';
        const momText = `${isPos ? '+' : ''}${avgMom.toFixed(1)}%`;

        let signalLabel = 'NEUTRAL / HOLD';
        if ((prob >= 75 && avgMom > 0) || (prob >= 50 && avgMom >= 2.0)) {
          signalLabel = 'BUY PRE-RELEASE';
        } else if (prob < 50 || avgMom < 0) {
          signalLabel = 'AVOID PRE-RELEASE';
        }

        return (
          <Box sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', height: '100%', py: 0.5, gap: '4px' }}>
            <Typography className="mono-font tabular-nums" sx={{ fontSize: '12px', fontWeight: 700, color: momColor, lineHeight: '14px' }}>
              Avg Reaction: {momArrow} {momText}
            </Typography>
            {renderSignalBadge(signalLabel)}
          </Box>
        );
      }
    },
    {
      field: 'postReleaseValidation',
      headerName: 'POST-RELEASE RESULT',
      width: 250,
      type: 'number',
      headerAlign: 'left',
      align: 'left',
      sortable: true,
      valueGetter: (_v: any, row: any) => row?.postReleaseReturn != null && !isNaN(row.postReleaseReturn) ? Number(row.postReleaseReturn) : -Infinity,
      renderCell: (p: GridRenderCellParams) => {
        const prRet = p.row?.postReleaseReturn != null ? Number(p.row.postReleaseReturn) : NaN;
        const avgMom = p.row?.avgPostEarningsMomentum != null ? Number(p.row.avgPostEarningsMomentum) : NaN;
        const prob = p.row?.momentumProbability != null ? Number(p.row.momentumProbability) : 0;
        const upcoming = p.row?.upcomingDate;

        if (isNaN(prRet)) {
          return (
            <Box sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', height: '100%', py: 0.5, gap: '4px' }}>
              <Typography sx={{ fontSize: '11px', color: tokens.text.secondary, fontWeight: 500 }}>Post-Release: Pending</Typography>
              {renderSignalBadge(upcoming ? `Due: ${formatRelativeDate(upcoming)}` : 'No recent release')}
            </Box>
          );
        }

        const isPos = prRet >= 0;
        const retColor = isPos ? tokens.status.success.main : tokens.status.error.main;
        const retArrow = isPos ? '▲' : '▼';
        const retText = `${isPos ? '+' : ''}${prRet.toFixed(1)}%`;

        let isBuyPred = (prob >= 75 && avgMom > 0) || (prob >= 50 && avgMom >= 2.0);
        let isAvoidPred = prob < 50 || avgMom < 0;

        let statusLabel = 'HOLD VALIDATED';
        if (isBuyPred) {
          if (isPos) statusLabel = 'TARGET HIT / WIN';
          else statusLabel = 'PREDICTION FAILED';
        } else if (isAvoidPred) {
          if (!isPos || prRet <= 0.5) statusLabel = 'LOSSES AVOIDED';
          else statusLabel = 'CONTRARY SURGE';
        }

        return (
          <Box sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', height: '100%', py: 0.5, gap: '4px' }}>
            <Typography className="mono-font tabular-nums" sx={{ fontSize: '12px', fontWeight: 700, color: retColor, lineHeight: '14px' }}>
              Post-Release: {retArrow} {retText}
            </Typography>
            {renderSignalBadge(statusLabel)}
          </Box>
        );
      }
    },
    {
      field: 'upcomingDate',
      headerName: 'REPORT DATE',
      width: 110,
      headerAlign: 'center',
      align: 'center',
      sortComparator: dateSortComparator,
      renderCell: (p: GridRenderCellParams) => (
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%' }}>
          <Typography className="mono-font tabular-nums" sx={{ fontSize: '12px', fontWeight: 600, color: tokens.text.primary }}>
            {formatRelativeDate(p.value) || '—'}
          </Typography>
        </Box>
      )
    },
    {
      field: 'latestNews',
      headerName: 'LATEST NEWS',
      width: 120,
      sortable: false,
      headerAlign: 'center',
      align: 'center',
      renderCell: (p: GridRenderCellParams) => (
        <NewsCell ticker={p.row?.ticker || ''} name={p.row?.name || ''} />
      )
    },
    {
      field: 'newsSentiment',
      headerName: 'N. SENTIMENT',
      width: 150,
      sortable: false,
      headerAlign: 'center' as const,
      align: 'center' as const,
      renderHeader: () => {
        const [isRefreshing, setIsRefreshing] = useState(false);
        const { tokens } = useThemeMode();
        return (
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', width: '100%' }}>
            <span style={{ fontWeight: 600, fontSize: '11px', color: tokens.text.secondary }}>N. SENTIMENT</span>
            <Box
              title="Refresh all sentiment analysis"
              onClick={async (e) => {
                e.stopPropagation();
                if (isRefreshing) return;
                setIsRefreshing(true);
                const itemsToRefresh = rows.map((r: any) => ({ ticker: r.ticker, name: r.name || r.ticker }));
                await sentimentCache.refreshBatch(itemsToRefresh, 3);
                setIsRefreshing(false);
              }}
              sx={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: '28px', height: '28px', borderRadius: '4px',
                cursor: 'pointer',
                color: tokens.text.tertiary,
                transition: 'all 0.15s ease-in-out',
                '&:hover': { color: tokens.text.primary, backgroundColor: tokens.background.cardHover },
                animation: isRefreshing ? 'spin 1s linear infinite' : 'none',
                '@keyframes spin': { '0%': { transform: 'rotate(0deg)' }, '100%': { transform: 'rotate(360deg)' } }
              }}
            >
              <RefreshIcon sx={{ fontSize: 16 }} />
            </Box>
          </Box>
        );
      },
      renderCell: (p: GridRenderCellParams) => (
        <NewsSentimentCell ticker={p.row?.ticker || ''} name={p.row?.name || ''} />
      )
    },
    {
      field: 'quarterlySummary',
      headerName: 'QUARTERLY RESULTS',
      width: 140,
      headerAlign: 'center' as const,
      align: 'center' as const,
      sortable: false,
      renderHeader: () => (
        <Box onClick={() => setExpandQuarters(!expandQuarters)} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '2px', cursor: 'pointer', width: '100%', height: '100%', color: tokens.text.secondary, '&:hover': { color: tokens.text.primary } }}>
          <span style={{ fontWeight: 600, fontSize: '11px' }}>QTRS</span>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '24px', height: '24px', borderRadius: '4px', '&:hover': { backgroundColor: tokens.background.cardHover } }}>
            {expandQuarters ? <KeyboardArrowDownIcon sx={{ fontSize: 16 }} /> : <KeyboardArrowUpIcon sx={{ fontSize: 16 }} />}
          </Box>
        </Box>
      ),
      renderCell: (p: GridRenderCellParams) => {
        const eps = p.row?.q4Eps;
        const label = eps != null && !isNaN(eps) ? `₹${eps} EPS` : 'Details ↗';
        return (
          <Box onClick={() => setDetailModalRow(p.row)} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', width: '100%', cursor: 'pointer', '&:hover .qtr-text': { color: tokens.accent.main, textDecoration: 'underline' } }}>
            <Typography className="qtr-text" sx={{ fontSize: '12px', fontWeight: 600, color: tokens.text.primary }}>
              {label}
            </Typography>
          </Box>
        );
      }
    }
  ], [expandQuarters, tokens, dateSortComparator, edgeMap]);

  const bulkActions = useMemo(() => [
    {
      label: 'Mass Calculate Health',
      isPrimary: true,
      icon: 'calc' as const,
      onClick: () => handleCalculateHealth()
    }
  ], [handleCalculateHealth]);

  const activeColumns = useMemo(() => {
    const qtrs = [
      { field: 'q1Clubbed', headerName: `${q1Prefix.trim()} (Q1)`, width: 160, sortable: false, renderCell: (p: any) => renderClubbedQuarterCell(p.row?.q1Revenue, p.row?.q0Revenue, p.row?.q1Profit, p.row?.q0Profit, p.row?.q1Eps, p.row?.q0Eps) },
      { field: 'q2Clubbed', headerName: `${q2Prefix.trim()} (Q2)`, width: 160, sortable: false, renderCell: (p: any) => renderClubbedQuarterCell(p.row?.q2Revenue, p.row?.q1Revenue, p.row?.q2Profit, p.row?.q1Profit, p.row?.q2Eps, p.row?.q1Eps, (p.row?.historicalTrend || '').split(',')[0] || 'UP') },
      { field: 'q3Clubbed', headerName: `${q3Prefix.trim()} (Q3)`, width: 160, sortable: false, renderCell: (p: any) => renderClubbedQuarterCell(p.row?.q3Revenue, p.row?.q2Revenue, p.row?.q3Profit, p.row?.q2Profit, p.row?.q3Eps, p.row?.q2Eps, (p.row?.historicalTrend || '').split(',')[1] || 'UP') },
      { field: 'q4Clubbed', headerName: `${q4Prefix.trim()} (Q4 - LATEST)`, width: 160, sortable: false, renderCell: (p: any) => renderClubbedQuarterCell(p.row?.q4Revenue, p.row?.q3Revenue, p.row?.q4Profit, p.row?.q3Profit, p.row?.q4Eps, p.row?.q3Eps, (p.row?.historicalTrend || '').split(',')[2] || 'UP') }
    ];
    return expandQuarters ? [...columns, ...qtrs] : columns;
  }, [expandQuarters, columns, q1Prefix, q2Prefix, q3Prefix, q4Prefix, renderClubbedQuarterCell]);

  // ── Phone card: identity & price → pre-release verdict → history line → actions ──
  const mobileSortOptions: MobileSortOption[] = [
    { key: 'edge', label: 'Pre-release edge', get: (r) => edgeSortValue(edgeMap.get(r.id)) },
    { key: 'date', label: 'Results date (soonest)', desc: false, get: (r) => { const t = r.upcomingDate ? new Date(r.upcomingDate).getTime() : NaN; return isNaN(t) ? null : t; } },
    { key: 'health', label: 'Health', get: (r) => (r.financialHealthScore > 0 ? r.financialHealthScore : null) },
    { key: 'mom', label: 'Momentum probability', get: (r) => r.momentumProbability },
    { key: 'mcap', label: 'Market cap', get: (r) => r.marketCap || null },
    { key: 'price', label: 'Price', get: (r) => r.currentPrice || null },
    { key: 'name', label: 'Name (A–Z)', desc: false, get: (r) => r.name || r.ticker },
  ];

  const renderEventCard = (row: any) => {
    const hl = healthLetter(row.financialHealthScore, row.financialHealthGrade);
    const hlColor = !hl ? tokens.text.tertiary : ['A', 'B'].includes(hl.letter) || hl.score >= 70 ? tokens.status.success.main : ['C', 'D'].includes(hl.letter) ? tokens.status.warning.main : tokens.status.error.main;
    const prob = row.momentumProbability != null ? Number(row.momentumProbability) : NaN;
    const avg = row.avgPostEarningsMomentum != null ? Number(row.avgPostEarningsMomentum) : NaN;
    const pr = row.postReleaseReturn != null ? Number(row.postReleaseReturn) : NaN;
    const relative = formatRelativeDate(row.upcomingDate);
    const parsed = row.upcomingDate ? new Date(row.upcomingDate) : null;
    // "Today"/"In 3 days" stay as-is; far dates read "14 Oct" instead of "14-Oct-2026"
    const when = relative !== row.upcomingDate || !parsed || isNaN(parsed.getTime()) ? relative
      : parsed.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
    const sub = { fontSize: '12px', color: tokens.text.secondary, lineHeight: '16px' };
    const btn = { minWidth: 0, height: 36, px: 1.5, fontSize: '12px', fontWeight: 700, textTransform: 'none', color: tokens.text.primary, border: `1px solid ${tokens.border.main}`, borderRadius: '6px' } as const;
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1.5, alignItems: 'flex-start' }}>
          <Box onClick={(e) => { e.stopPropagation(); navigate(`/companies/${row.id}`); }} sx={{ minWidth: 0, cursor: 'pointer' }}>
            <Typography noWrap sx={{ fontSize: '14px', fontWeight: 700, color: tokens.text.primary, lineHeight: '19px' }}>{row.name || row.ticker}</Typography>
            <Typography noWrap sx={sub}>
              {row.ticker}{row.upcomingDate ? <> · Results <b style={{ color: tokens.text.primary }}>{when}</b></> : ''}
            </Typography>
          </Box>
          <Box sx={{ textAlign: 'right', flexShrink: 0 }}>
            <Typography className="mono-font tabular-nums" sx={{ fontSize: '14px', fontWeight: 700, color: tokens.text.primary, lineHeight: '19px' }}>{formatPrice(row.currentPrice)}</Typography>
            <Typography sx={sub}>
              {formatValCr(row.marketCap) !== '—' ? `${formatValCr(row.marketCap)} · ` : ''}Health <b style={{ color: hlColor }}>{hl ? hl.letter : '—'}</b>
            </Typography>
          </Box>
        </Box>
        <Box sx={{ minHeight: 40, px: 1, py: 0.5, borderRadius: '8px', backgroundColor: tokens.background.cardHover }}>
          <PreReleaseEdgeCell edge={edgeMap.get(row.id)} upcomingDate={row.upcomingDate}
            onOpen={() => setEdgeDialog({ companyId: row.id, name: row.name || row.ticker })} />
        </Box>
        <Typography sx={sub}>
          {isNaN(avg) ? 'Past results: not measured' : <>Past results: <b style={{ color: prob >= 50 ? tokens.status.success.main : tokens.status.error.main }}>{prob.toFixed(0)}% up</b> · avg <b style={{ color: avg >= 0 ? tokens.status.success.main : tokens.status.error.main }}>{avg >= 0 ? '+' : ''}{avg.toFixed(1)}%</b></>}
          {!isNaN(pr) && <> · Last release <b style={{ color: pr >= 0 ? tokens.status.success.main : tokens.status.error.main }}>{pr >= 0 ? '+' : ''}{pr.toFixed(1)}%</b></>}
        </Typography>
        <Box onClick={(e) => e.stopPropagation()} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Box sx={{ width: 76, height: 36 }}><NewsCell ticker={row.ticker || ''} name={row.name || ''} label="News" /></Box>
          <Box sx={{ flex: 1, minWidth: 0, height: 40, display: 'flex' }}><NewsSentimentCell ticker={row.ticker || ''} name={row.name || ''} /></Box>
          <Button onClick={() => setDetailModalRow(row)} sx={btn}>Quarters</Button>
        </Box>
      </Box>
    );
  };

  if (loading && !data) {
    return (
      <Box display="flex" flexDirection="column" alignItems="center" justifyContent="center" minHeight="60vh" gap={2}>
        <CircularProgress size={44} sx={{ color: tokens.accent.main }} />
        <Typography sx={{ color: tokens.text.secondary, fontSize: '13px', fontWeight: 500, fontFamily: tokens.typography.fontFamily }}>
          Loading NSE Earnings Fixtures...
        </Typography>
      </Box>
    );
  }

  if (error) {
    return (
      <Box mt={5} p={3}>
        <Typography color="error" variant="h6">Failed to load earnings data: {error.message}</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ height: { xs: 'calc(100dvh - 56px)', md: 'calc(100vh - 56px)' }, backgroundColor: tokens.background.default, width: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Fixed Filter & Controls Bar */}
      <Box
        sx={{
          px: { xs: 1.5, md: '24px' },
          minHeight: 48,
          py: 1,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: { xs: 1, md: 2 },
          borderBottom: `1px solid ${tokens.border.main}`,
          backgroundColor: tokens.background.header,
          flexShrink: 0,
        }}
      >
        <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'wrap', width: { xs: '100%', md: 'auto' }, minWidth: 0 }}>
          <Typography sx={{ display: { xs: 'none', sm: 'block' }, fontSize: '11px', color: tokens.text.secondary, fontWeight: 600, letterSpacing: '0.5px', textTransform: 'uppercase' }}>
            Universe Filter:
          </Typography>
          <FilterChipGroup
            options={[
              { label: 'All Stocks', value: 'ALL', count: baseRows.length },
              { label: 'Events in 2-3 Days', value: 'RECENT_EVENTS', count: recentEventsCount },
              { label: 'High Health >70', value: 'HIGH_HEALTH', count: highHealthCount },
              { label: 'Edge Setups', value: 'EDGE_SETUPS', count: edgeSetupCount },
            ]}
            selectedValue={filterMode}
            onChange={(val) => setFilterMode(val as 'ALL' | 'RECENT_EVENTS' | 'HIGH_HEALTH' | 'EDGE_SETUPS')}
          />
        </Box>

        <Box display="flex" gap={1.5} alignItems="center" sx={{ width: { xs: '100%', md: 'auto' } }}>
          {/* 240px Search Bar (phones: full width) */}
          <Box sx={{ display: 'flex', alignItems: 'center', flex: { xs: 1, md: 'none' }, minWidth: 0, backgroundColor: tokens.background.card, border: `1px solid ${tokens.border.main}`, borderRadius: '20px', px: '12px', height: { xs: '40px', md: '32px' }, transition: 'border-color 0.15s ease-in-out', '&:focus-within': { borderColor: tokens.border.focus } }}>
            <SearchIcon sx={{ color: tokens.text.secondary, fontSize: 16, mr: '6px' }} />
            <InputBase
              placeholder={isMobile ? 'Search stocks' : 'Search ticker or name...'}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              sx={{ color: tokens.text.primary, fontSize: { xs: '16px', md: '12px' }, width: { xs: '100%', md: '200px' }, fontFamily: tokens.typography.fontFamily }}
            />
          </Box>

          <ErrorBoundary fallbackTitle="Cron Error">
            <SmartCron page="events" />
          </ErrorBoundary>
        </Box>
      </Box>

      {/* Bulk Selection Sticky Action Bar */}
      <Box sx={{ px: { xs: 1.5, md: '24px' }, mt: selectedRowIds.length > 0 ? 1.5 : 0 }}>
        <ErrorBoundary fallbackTitle="Bulk Actions Error">
          <BulkActionBar
            selectedCount={selectedRowIds.length}
            onClearSelection={() => setSelectedRowIds([])}
            actions={bulkActions}
          />
        </ErrorBoundary>
      </Box>

      {/* Dense Terminal DataGrid with Semantic Row Tinting & Dynamic Viewport Height */}
      <Box sx={{ flexGrow: 1, width: '100%', backgroundColor: tokens.background.paper, overflow: 'hidden', position: 'relative' }}>
        <ErrorBoundary fallbackTitle="Data Grid Table Error">
          <RowTintedDataGrid
            rows={rows}
            columns={activeColumns}
            mobileCard={renderEventCard}
            mobileSortOptions={mobileSortOptions}
            mobileDefaultSort="edge"
            mobileEmptyText="No stocks match this filter."
            checkboxSelection
            onRowSelectionModelChange={(newSelection) => setSelectedRowIds(newSelection)}
            rowSelectionModel={selectedRowIds}
            pageSizeOptions={[20, 50, 100]}
            initialState={{
              pagination: {
                paginationModel: { pageSize: 50, page: 0 },
              },
              sorting: {
                sortModel: [{ field: 'preReleaseEdge', sort: 'desc' }],
              },
            }}
            getRowClassName={(params) => {
              const prRet = params.row?.postReleaseReturn;
              if (prRet != null && !isNaN(Number(prRet))) {
                if (Number(prRet) > 2) return 'row-tint-buy';
                if (Number(prRet) < -2) return 'row-tint-avoid';
              }
              const prob = params.row?.momentumProbability;
              const avgMom = params.row?.avgPostEarningsMomentum;
              if (prob >= 75 && avgMom > 0) return 'row-tint-buy';
              if (prob < 50 || avgMom < -3) return 'row-tint-avoid';
              return 'row-tint-neutral';
            }}
            sx={{
              '& .MuiCheckbox-root': {
                color: tokens.text.secondary,
                '&.Mui-checked': { color: tokens.accent.main }
              },
            }}
          />
        </ErrorBoundary>
      </Box>

      <ErrorBoundary fallbackTitle="Pre-Release Edge Error">
        <PreReleaseEdgeDialog
          open={Boolean(edgeDialog)}
          onClose={() => setEdgeDialog(null)}
          companyId={edgeDialog?.companyId || null}
          companyName={edgeDialog?.name}
        />
      </ErrorBoundary>

      {/* Detail View Modal Dialog */}
      <Dialog open={Boolean(detailModalRow)} onClose={() => setDetailModalRow(null)} maxWidth="md" fullWidth fullScreen={isMobile} PaperProps={{ sx: { backgroundColor: tokens.background.paper, border: `1px solid ${tokens.border.main}`, borderRadius: '12px', boxShadow: tokens.shadows.dropdown } }}>
        <DialogTitle sx={{ borderBottom: `1px solid ${tokens.border.main}`, pb: 2, pt: 2.5, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box>
            <Typography sx={{ fontSize: '18px', fontWeight: 700, color: tokens.text.primary }}>
              {detailModalRow?.name} ({detailModalRow?.ticker})
            </Typography>
            <Typography sx={{ fontSize: '12px', color: tokens.text.secondary, mt: 0.5 }}>
              4-Quarter Quantitative Earning Reaction & Health Report
            </Typography>
          </Box>
          <StatusBadge status={detailModalRow?.financialHealthScore >= 70 ? "HIGH HEALTH" : "STANDARD HEALTH"} variant={detailModalRow?.financialHealthScore >= 70 ? "success" : "neutral"} />
        </DialogTitle>
        <ErrorBoundary fallbackTitle="Report Error">
          <DialogContent sx={{ py: 3, pt: '24px !important' }}>
          {detailModalRow && (
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6} md={3}>
                <Box sx={{ p: 2, backgroundColor: tokens.background.card, border: `1px solid ${tokens.border.main}`, borderRadius: '8px', height: '100%' }}>
                  <Typography sx={{ fontSize: '12px', fontWeight: 700, color: tokens.accent.main, pb: 1, mb: 1, borderBottom: `1px solid ${tokens.border.main}` }}>
                    {q1Prefix.trim()} (Q1)
                  </Typography>
                  {renderClubbedQuarterCell(detailModalRow.q1Revenue, detailModalRow.q0Revenue, detailModalRow.q1Profit, detailModalRow.q0Profit, detailModalRow.q1Eps, detailModalRow.q0Eps)}
                </Box>
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <Box sx={{ p: 2, backgroundColor: tokens.background.card, border: `1px solid ${tokens.border.main}`, borderRadius: '8px', height: '100%' }}>
                  <Typography sx={{ fontSize: '12px', fontWeight: 700, color: tokens.accent.main, pb: 1, mb: 1, borderBottom: `1px solid ${tokens.border.main}` }}>
                    {q2Prefix.trim()} (Q2)
                  </Typography>
                  {renderClubbedQuarterCell(detailModalRow.q2Revenue, detailModalRow.q1Revenue, detailModalRow.q2Profit, detailModalRow.q1Profit, detailModalRow.q2Eps, detailModalRow.q1Eps, (detailModalRow.historicalTrend || '').split(',')[0] || 'UP')}
                </Box>
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <Box sx={{ p: 2, backgroundColor: tokens.background.card, border: `1px solid ${tokens.border.main}`, borderRadius: '8px', height: '100%' }}>
                  <Typography sx={{ fontSize: '12px', fontWeight: 700, color: tokens.accent.main, pb: 1, mb: 1, borderBottom: `1px solid ${tokens.border.main}` }}>
                    {q3Prefix.trim()} (Q3)
                  </Typography>
                  {renderClubbedQuarterCell(detailModalRow.q3Revenue, detailModalRow.q2Revenue, detailModalRow.q3Profit, detailModalRow.q2Profit, detailModalRow.q3Eps, detailModalRow.q2Eps, (detailModalRow.historicalTrend || '').split(',')[1] || 'UP')}
                </Box>
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <Box sx={{ p: 2, backgroundColor: tokens.primary.tint, border: `1px solid ${tokens.border.light}`, borderRadius: '8px', height: '100%', boxShadow: tokens.accent.glow }}>
                  <Typography sx={{ fontSize: '12px', fontWeight: 700, color: tokens.text.primary, pb: 1, mb: 1, borderBottom: `1px solid ${tokens.border.main}` }}>
                    ★ {q4Prefix.trim()} (LATEST)
                  </Typography>
                  {renderClubbedQuarterCell(detailModalRow.q4Revenue, detailModalRow.q3Revenue, detailModalRow.q4Profit, detailModalRow.q3Profit, detailModalRow.q4Eps, detailModalRow.q3Eps, (detailModalRow.historicalTrend || '').split(',')[2] || 'UP')}
                </Box>
              </Grid>
            </Grid>
          )}
          </DialogContent>
        </ErrorBoundary>
        <DialogActions sx={{ px: 3, py: 2, borderTop: `1px solid ${tokens.border.main}` }}>
          <Button onClick={() => setDetailModalRow(null)} sx={{ color: tokens.text.secondary, textTransform: 'none', fontWeight: 600, fontSize: '12px' }}>Close</Button>
          <Button onClick={() => window.open(`/companies/${detailModalRow?.id}`, '_blank')} variant="contained" sx={{ backgroundColor: tokens.primary.main, color: isDark ? '#0A0A0C' : '#FFFFFF', fontWeight: 700, fontSize: '12px', textTransform: 'none', borderRadius: '6px' }}>Open Deep-Dive Lab ↗</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default function Home() {
  return (
    <ErrorBoundary fallbackTitle="NSE Events Unavailable">
      <HomeContent />
    </ErrorBoundary>
  );
}
