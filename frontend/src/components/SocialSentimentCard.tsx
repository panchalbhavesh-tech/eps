import React, { useEffect, useState } from 'react';
import { useThemeMode } from '../theme/ThemeContext';
import { 
  Box, Typography, Paper, Grid, CircularProgress, Alert, Chip, Button, Stack, 
  Drawer, IconButton, Tooltip
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import ForumOutlinedIcon from '@mui/icons-material/ForumOutlined';
import NewspaperOutlinedIcon from '@mui/icons-material/NewspaperOutlined';
import InsightsOutlinedIcon from '@mui/icons-material/InsightsOutlined';
import PsychologyOutlinedIcon from '@mui/icons-material/PsychologyOutlined';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import CloseIcon from '@mui/icons-material/Close';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import { ExpandableSection } from './common';

interface SocialSentimentCardProps {
  company: {
    ticker: string;
    name: string;
    sector: string;
    currentPrice?: number;
  };
}

interface NewsSentimentData {
  overallSentiment: string;
  sentimentScore: number;
  confidence: string;
  impact: string;
  trend: string;
  dominantTheme: string | null;
  articleBreakdown: { bullish: number; bearish: number; neutral: number; mixed: number };
  keyDrivers: string;
  contradictions: string | null;
  articleCount: number;
  lastUpdated: string;
}

interface NewsArticle {
  title: string;
  summary: string;
  url: string;
  source: string;
  published: string;
  published_ts: string;
}

type DrawerType = 'NEWS' | 'REDDIT' | 'SMART_MONEY' | null;

const SocialSentimentCard: React.FC<SocialSentimentCardProps> = ({ company }) => {
  const { tokens } = useThemeMode();
  const [sentimentData, setSentimentData] = useState<NewsSentimentData | null>(null);
  const [newsArticles, setNewsArticles] = useState<NewsArticle[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [activeDrawer, setActiveDrawer] = useState<DrawerType>(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const queryParams = `?name=${encodeURIComponent(company.name || '')}&sector=${encodeURIComponent(company.sector || '')}`;
      const headers = { 'X-API-Key': 'QEPS-INTERNAL-SECURE-KEY' };
      
      // Fetch Sentiment
      let sentimentRes = await fetch(`/api/news-sentiment/${company.ticker}${queryParams}`, { headers });
      if (!sentimentRes.ok) sentimentRes = await fetch(`/news-sentiment/${company.ticker}${queryParams}`, { headers });
      if (!sentimentRes.ok) throw new Error(`Failed to retrieve news sentiment (Status: ${sentimentRes.status})`);
      const sData: NewsSentimentData = await sentimentRes.json();
      
      // Fetch Raw News
      let newsRes = await fetch(`/api/news/${company.ticker}${queryParams}`, { headers });
      if (!newsRes.ok) newsRes = await fetch(`/news/${company.ticker}${queryParams}`, { headers });
      if (!newsRes.ok) throw new Error(`Failed to retrieve news articles (Status: ${newsRes.status})`);
      const nData = await newsRes.json();

      setSentimentData(sData);
      setNewsArticles(nData.news || []);
    } catch (err: any) {
      console.error('Sentiment fetch error:', err);
      setError(err.message || 'Error communicating with sentiment engine');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [company.ticker]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  if (loading && !sentimentData) {
    return (
      <Box sx={{ p: 4, textAlign: 'center', bgcolor: tokens.background.paper, borderRadius: 3, my: 3, border: '1px solid #1e293b' }}>
        <CircularProgress sx={{ color: tokens.primary.main, mb: 2 }} />
        <Typography variant="body2" sx={{ color: tokens.text.secondary, fontWeight: 600 }}>
          Gathering and verifying real-time news sources...
        </Typography>
      </Box>
    );
  }

  if (error || !sentimentData) {
    return (
      <Alert severity="warning" sx={{ my: 3, borderRadius: 2, bgcolor: tokens.border.main, color: tokens.text.primary, border: '1px solid #334155' }}>
        Unable to evaluate verified sentiment: {error || 'No data returned'}
        <Button size="small" onClick={fetchData} sx={{ ml: 2, color: tokens.primary.main, fontWeight: 700 }}>Retry</Button>
      </Alert>
    );
  }

  const getStatusColor = (status: string) => {
    if (status === 'BULLISH' || status === 'IMPROVING') return { bg: tokens.background.card, border: tokens.border.main, text: tokens.status.success.main, glow: 'none' };
    if (status === 'MIXED' || status === 'NEUTRAL' || status === 'STABLE') return { bg: tokens.background.card, border: tokens.border.main, text: tokens.status.info.main, glow: 'none' };
    if (status === 'BEARISH' || status === 'DETERIORATING') return { bg: tokens.background.card, border: tokens.border.main, text: tokens.status.error.main, glow: 'none' };
    return { bg: tokens.background.card, border: tokens.border.main, text: tokens.text.secondary, glow: 'none' };
  };

  const newsTheme = getStatusColor(sentimentData.overallSentiment);
  
  const openExternalLink = (url?: string) => {
    if (url) {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  };

  const formatDate = (isoString: string) => {
    try {
      const date = new Date(isoString);
      return date.toLocaleString();
    } catch {
      return isoString;
    }
  };

  return (
    <Box sx={{ my: 4 }}>
      <ExpandableSection 
        defaultExpanded={false}
        title={
          <>
            <PsychologyOutlinedIcon sx={{ color: tokens.primary.main, fontSize: 16, opacity: 0.9 }} />
            Verified News & Sentiment Intelligence
            <Tooltip title="Source-grounded sentiment analysis. We only display sentiment derived from verified fetched news articles. 'No Source Data = No Sentiment Claim.'">
              <InfoOutlinedIcon sx={{ fontSize: 16, color: tokens.text.secondary, cursor: 'help' }} />
            </Tooltip>
          </>
        }
      >
      <Paper 
        elevation={10} 
        sx={{ 
          p: { xs: 2.5, md: 3.5 }, 
          background: tokens.background.paper, 
          color: tokens.text.primary, 
          borderRadius: 3.5, 
          border: '1px solid rgba(148, 163, 184, 0.15)', 
          boxShadow: 'none',
          position: 'relative',
          overflow: 'hidden'
        }}
      >
        {/* Top Header & Refresh Controls */}
        <Box display="flex" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={2} pb={2.5} borderBottom="1px solid rgba(148, 163, 184, 0.15)">
          <Box>
            <Stack direction="row" spacing={1.5} alignItems="center">
              <Typography variant="h5" sx={{ fontWeight: 800, color: tokens.text.primary, letterSpacing: 0.5 }}>
                {company.ticker} Source-Grounded Sentiment
              </Typography>
            </Stack>
            <Typography variant="caption" sx={{ color: tokens.text.secondary, display: 'block', mt: 0.5 }}>
              Objective NLP synthesis aggregating verified financial press and corporate disclosures. No fabricated data.
            </Typography>
          </Box>

          <Button
            size="small"
            variant="outlined"
            onClick={handleRefresh}
            disabled={refreshing}
            startIcon={<RefreshIcon sx={{ animation: refreshing ? 'spin 1s linear infinite' : 'none' }} />}
            sx={{
              color: tokens.primary.main,
              borderColor: tokens.primary.main,
              textTransform: 'none',
              fontWeight: 700,
              borderRadius: 2,
              '&:hover': { bgcolor: tokens.background.cardHover, borderColor: tokens.primary.main },
              '@keyframes spin': {
                '0%': { transform: 'rotate(0deg)' },
                '100%': { transform: 'rotate(360deg)' }
              }
            }}
          >
            {refreshing ? 'Scanning Sources...' : 'Refresh Live Engine'}
          </Button>
        </Box>

        {/* 3-Column Interactive Behavioral Grid */}
        <Grid container spacing={3} mt={0.5}>
          {/* Column 1: Financial News Sentiment (Real Data) */}
          <Grid item xs={12} md={4}>
            <Box 
              onClick={() => setActiveDrawer('NEWS')}
              sx={{ 
                p: 2.5, 
                bgcolor: newsTheme.bg, 
                borderRadius: 2.5, 
                border: `1px solid ${newsTheme.border}`,
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                cursor: 'pointer',
                transition: 'all 0.2s ease-in-out',
                '&:hover': {
                  transform: 'translateY(-4px)',
                  borderColor: tokens.primary.main,
                  bgcolor: tokens.background.cardHover,
                  boxShadow: 'none',
                  '& .action-text': { color: tokens.primary.main, textDecoration: 'underline' }
                }
              }}
            >
              <Box>
                <Box display="flex" alignItems="center" justifyContent="space-between" mb={1.5}>
                  <Box display="flex" alignItems="center" gap={1.2}>
                    <NewspaperOutlinedIcon sx={{ color: newsTheme.text }} />
                    <Typography variant="subtitle2" fontWeight={800} color={tokens.text.primary} textTransform="uppercase" letterSpacing={0.5}>
                      News Sentiment
                    </Typography>
                  </Box>
                  <Tooltip title="Verified sentiment score computed strictly from the provided news articles.">
                    <InfoOutlinedIcon sx={{ fontSize: 16, color: tokens.text.tertiary }} />
                  </Tooltip>
                </Box>
                
                {sentimentData.overallSentiment === 'INSUFFICIENT_DATA' ? (
                  <Box py={2}>
                    <Typography variant="body2" color={tokens.text.secondary} fontWeight={600} fontStyle="italic">
                      Insufficient verified data to compute sentiment.
                    </Typography>
                  </Box>
                ) : (
                  <>
                    <Box display="flex" alignItems="baseline" gap={1} mb={1}>
                      <Typography variant="h3" fontWeight={800} color={newsTheme.text}>
                        {sentimentData.sentimentScore > 0 ? '+' : ''}{sentimentData.sentimentScore}
                      </Typography>
                      <Typography variant="caption" color={tokens.text.secondary} fontWeight={700}>Score</Typography>
                    </Box>
                    <Typography variant="body2" color={tokens.text.primary} fontWeight={700} sx={{ mb: 1, textTransform: 'capitalize' }}>
                      Overall: {sentimentData.overallSentiment.toLowerCase()} ({sentimentData.trend.toLowerCase()} trend)
                    </Typography>
                    <Typography variant="body2" color={tokens.text.secondary} sx={{ lineHeight: 1.6, fontSize: '0.88rem' }}>
                      {sentimentData.keyDrivers}
                    </Typography>
                  </>
                )}
              </Box>
              <Box mt={3} pt={1.5} borderTop="1px solid rgba(148, 163, 184, 0.15)" display="flex" justifyContent="space-between" alignItems="center">
                <Typography variant="caption" color={tokens.text.tertiary} noWrap sx={{ fontStyle: 'italic', maxWidth: '75%' }}>
                  {sentimentData.articleCount} verified sources &bull; {sentimentData.confidence} confidence
                </Typography>
                <Typography className="action-text" variant="caption" sx={{ color: tokens.text.secondary, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 0.5, transition: 'color 0.15s' }}>
                  Analyze <ArrowForwardIcon sx={{ fontSize: 13 }} />
                </Typography>
              </Box>
            </Box>
          </Grid>

          {/* Column 2: Reddit & Forum Discussion Velocity (Explicitly Unavailable) */}
          <Grid item xs={12} md={4}>
            <Box 
              sx={{ 
                p: 2.5, 
                bgcolor: 'rgba(0,0,0,0.1)', 
                borderRadius: 2.5, 
                border: '1px dashed rgba(148, 163, 184, 0.3)',
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
              }}
            >
              <Box>
                <Box display="flex" alignItems="center" justifyContent="space-between" mb={1.5}>
                  <Box display="flex" alignItems="center" gap={1.2}>
                    <ForumOutlinedIcon sx={{ color: tokens.text.secondary }} />
                    <Typography variant="subtitle2" fontWeight={800} color={tokens.text.secondary} textTransform="uppercase" letterSpacing={0.5}>
                      Reddit Sentiment
                    </Typography>
                  </Box>
                  <Tooltip title="We only display data when a reliable, verifiable pipeline exists. We do not hallucinate Reddit sentiment.">
                    <InfoOutlinedIcon sx={{ fontSize: 16, color: tokens.text.tertiary }} />
                  </Tooltip>
                </Box>
                <Box display="flex" flexDirection="column" alignItems="center" justifyContent="center" py={3} gap={1}>
                  <ErrorOutlineIcon sx={{ color: tokens.text.tertiary, fontSize: 32 }} />
                  <Typography variant="body2" color={tokens.text.secondary} fontWeight={600} textAlign="center">
                    Insufficient Verified Data
                  </Typography>
                  <Typography variant="caption" color={tokens.text.tertiary} textAlign="center">
                    No verified Reddit ingestion pipeline active for this security.
                  </Typography>
                </Box>
              </Box>
            </Box>
          </Grid>

          {/* Column 3: Institutional Flows (Explicitly Unavailable) */}
          <Grid item xs={12} md={4}>
            <Box 
              sx={{ 
                p: 2.5, 
                bgcolor: 'rgba(0,0,0,0.1)', 
                borderRadius: 2.5, 
                border: '1px dashed rgba(148, 163, 184, 0.3)',
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
              }}
            >
              <Box>
                <Box display="flex" alignItems="center" justifyContent="space-between" mb={1.5}>
                  <Box display="flex" alignItems="center" gap={1.2}>
                    <InsightsOutlinedIcon sx={{ color: tokens.text.secondary }} />
                    <Typography variant="subtitle2" fontWeight={800} color={tokens.text.secondary} textTransform="uppercase" letterSpacing={0.5}>
                      Institutional Flows
                    </Typography>
                  </Box>
                  <Tooltip title="Real-time institutional flow data (Dark Pool, VWAP blocks) is not currently available in the verified feeds.">
                    <InfoOutlinedIcon sx={{ fontSize: 16, color: tokens.text.tertiary }} />
                  </Tooltip>
                </Box>
                <Box display="flex" flexDirection="column" alignItems="center" justifyContent="center" py={3} gap={1}>
                  <ErrorOutlineIcon sx={{ color: tokens.text.tertiary, fontSize: 32 }} />
                  <Typography variant="body2" color={tokens.text.secondary} fontWeight={600} textAlign="center">
                    Insufficient Verified Data
                  </Typography>
                  <Typography variant="caption" color={tokens.text.tertiary} textAlign="center">
                    Institutional block deal pipelines are currently offline or unavailable.
                  </Typography>
                </Box>
              </Box>
            </Box>
          </Grid>
        </Grid>
      </Paper>

      {/* RIGHT-SIDE TERMINAL GRID ROW ANALYTICS DRAWER PANEL */}
      <Drawer
        anchor="right"
        open={Boolean(activeDrawer)}
        onClose={() => setActiveDrawer(null)}
        PaperProps={{
          sx: {
            width: { xs: '100%', sm: 600, md: 760 },
            bgcolor: tokens.background.default,
            color: tokens.text.primary,
            p: 0,
            borderLeft: '1px solid #1e293b',
            borderRadius: 0,
            overflowY: 'auto',
            boxShadow: tokens.shadows.card
          }
        }}
      >
        {activeDrawer === 'NEWS' && (
          <Box>
            {/* Panel Header */}
            <Box sx={{ p: 3.5, pb: 2.5, borderBottom: '1px solid #1e293b', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <Box display="flex" alignItems="center" gap={1.5}>
                <NewspaperOutlinedIcon sx={{ color: tokens.primary.main, fontSize: 32 }} />
                <Box>
                  <Box display="flex" alignItems="center" gap={1}>
                    <Typography variant="h5" fontWeight={800} color={tokens.text.primary}>
                      Verified News Evidence
                    </Typography>
                  </Box>
                  <Typography variant="caption" color={tokens.text.secondary} display="block">
                    {company.ticker} &bull; Score: {sentimentData.sentimentScore} &bull; Updated: {formatDate(sentimentData.lastUpdated)}
                  </Typography>
                </Box>
              </Box>
              <IconButton onClick={() => setActiveDrawer(null)} sx={{ color: tokens.text.secondary, '&:hover': { color: tokens.text.primary, bgcolor: tokens.border.main, borderRadius: 0 } }}>
                <CloseIcon />
              </IconButton>
            </Box>

            {/* Information Banner */}
            <Box sx={{ px: 3.5, py: 2.5, bgcolor: tokens.background.paper, borderBottom: '1px solid #1e293b', borderLeft: 'none', borderRight: 'none', borderRadius: 0 }}>
              <Typography variant="subtitle2" fontWeight={700} color={tokens.primary.main} gutterBottom display="flex" alignItems="center" gap={1}>
                <InfoOutlinedIcon sx={{ fontSize: 18 }} /> Source Transparency Mandate
              </Typography>
              <Typography variant="body2" color={tokens.text.secondary} sx={{ fontSize: '0.86rem', lineHeight: 1.55 }}>
                The sentiment score is derived strictly from the {sentimentData.articleCount} verified articles shown below. We do not inject assumptions or use historical hallucination. If contradictory news exists (e.g. {sentimentData.articleBreakdown?.mixed || 0} mixed signals), confidence will be adjusted to {sentimentData.confidence}.
              </Typography>
              {sentimentData.dominantTheme && (
                <Chip 
                  size="small" 
                  label={`Dominant Theme: ${sentimentData.dominantTheme}`} 
                  sx={{ mt: 1.5, bgcolor: tokens.background.cardHover, color: tokens.primary.main, border: `1px solid ${tokens.primary.main}` }} 
                />
              )}
            </Box>

            {/* Section Header for Feed */}
            <Box sx={{ px: 3.5, py: 2, bgcolor: tokens.background.paper, borderBottom: '1px solid #1e293b', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography variant="subtitle1" fontWeight={800} color={tokens.text.primary} sx={{ letterSpacing: 0.3 }}>
                Live Source Evidence
              </Typography>
              <Chip 
                label={`${newsArticles.length} Verified Sources`} 
                sx={{ bgcolor: tokens.background.cardHover, color: tokens.primary.main, fontWeight: 800, borderRadius: 0, border: '1px solid #38bdf8', fontSize: '0.75rem', height: 24 }} 
              />
            </Box>

            {/* Master Grid Row-Wise Terminal Feed */}
            <Box sx={{ bgcolor: tokens.background.default, borderRadius: 0 }}>
              {newsArticles.length === 0 ? (
                <Box p={4} textAlign="center">
                  <Typography variant="body2" color={tokens.text.secondary}>No recent verified articles found for this ticker.</Typography>
                </Box>
              ) : (
                newsArticles.map((article, idx) => (
                  <Box 
                    key={idx} 
                    onClick={() => openExternalLink(article.url)}
                    sx={{ 
                      px: 3.5, 
                      py: 3, 
                      borderBottom: '1px solid rgba(148, 163, 184, 0.18)', 
                      borderLeft: 'none', 
                      borderRight: 'none',
                      borderRadius: 0,
                      cursor: article.url ? 'pointer' : 'default',
                      transition: 'all 0.15s ease-in-out',
                      '&:hover': article.url ? { 
                        bgcolor: tokens.background.cardHover,
                        '& .item-headline': { color: tokens.primary.main, textDecoration: 'underline' },
                        '& .source-link': { color: tokens.primary.main }
                      } : {} 
                    }}
                  >
                    <Typography className="item-headline" variant="subtitle2" fontWeight={800} color={tokens.text.primary} sx={{ fontSize: '0.98rem', lineHeight: 1.4, mb: 1, transition: 'color 0.15s' }}>
                      {article.title}
                    </Typography>

                    <Box display="flex" alignItems="center" gap={1} mb={1.5} flexWrap="wrap">
                      <Typography className="source-link" variant="caption" sx={{ color: tokens.text.secondary, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 0.5, transition: 'color 0.15s', fontSize: '0.78rem' }}>
                        {article.source} {article.url && <OpenInNewIcon sx={{ fontSize: 13 }} />}
                      </Typography>
                      <Typography variant="caption" sx={{ color: tokens.text.tertiary, fontSize: '0.78rem' }}>
                        &bull; {formatDate(article.published_ts || article.published)}
                      </Typography>
                    </Box>

                    <Typography variant="body2" color={tokens.text.secondary} sx={{ fontSize: '0.86rem', lineHeight: 1.6 }}>
                      {article.summary}
                    </Typography>
                  </Box>
                ))
              )}
            </Box>
          </Box>
        )}
      </Drawer>
      </ExpandableSection>
    </Box>
  );
};

export default SocialSentimentCard;
