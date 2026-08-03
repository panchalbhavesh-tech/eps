import React, { useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, gql } from '@apollo/client';
import { Box, Typography, Button, CircularProgress, Alert, Grid, Paper, Tabs, Tab, Chip, Stack, IconButton, Tooltip } from '@mui/material';
import ReactMarkdown from 'react-markdown';
import rehypeRaw from 'rehype-raw';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import AssessmentOutlinedIcon from '@mui/icons-material/AssessmentOutlined';
import TrendingUpOutlinedIcon from '@mui/icons-material/TrendingUpOutlined';
import AccountBalanceOutlinedIcon from '@mui/icons-material/AccountBalanceOutlined';
import WarningAmberOutlinedIcon from '@mui/icons-material/WarningAmberOutlined';
import HistoryOutlinedIcon from '@mui/icons-material/HistoryOutlined';
import SummarizeOutlinedIcon from '@mui/icons-material/SummarizeOutlined';
import FinancialHealthScorecard from '../components/FinancialHealthScorecard';
import QuarterlyMarketImpact from '../components/QuarterlyMarketImpact';
import SocialSentimentCard from '../components/SocialSentimentCard';
import { useThemeMode } from '../theme/ThemeContext';
import { MetricCard, StatusBadge, ErrorBoundary } from '../components/common';

const COMPANY_DETAIL_QUERY = gql`
  query GetCompanyDetail($id: String!) {
    company(id: $id) {
      id
      ticker
      name
      sector
      currentPrice
      marketCap
      enterpriseValue
      high52w
      low52w
      peRatio
      pbRatio
      roe
      roce
      dividendYield
      bookValue
      debtToEquity
      promoterHolding
      fiiHolding
      diiHolding
      publicHolding
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
      predictions {
        id
        predictedEps
      }
      technicalSnapshots {
        dma50
        dma100
        dma200
        rsi
        macd
        trend
        crossStatus
        immSupport
        immResistance
      }
      eventStudies {
        gapPct
        ret1d
        ret30d
        maxGain
        maxDrawdown
      }
      backtests {
        strategyName
        winRate
        totalTrades
      }
      aiReports {
        statisticalAnalysis
        patternRecognition
        riskAssessment
        probabilityAnalysis
        tradingPlan
        finalVerdict
        overallRating
      }
    }
  }
`;

const TRIGGER_ANALYSIS_MUTATION = gql`
  mutation AnalyzeCompany($companyId: String!) {
    analyzeCompany(companyId: $companyId)
  }
`;

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;
  return (
    <div role="tabpanel" hidden={value !== index} id={`quant-tabpanel-${index}`} aria-labelledby={`quant-tab-${index}`} {...other}>
      {value === index && <Box sx={{ pt: 3 }}>{children}</Box>}
    </div>
  );
}

const CompanyDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { mode, tokens } = useThemeMode();
  const isDark = mode === 'dark';

  const [tabIndex, setTabIndex] = useState(0);
  const { data, loading, error } = useQuery(COMPANY_DETAIL_QUERY, { variables: { id }, pollInterval: 10000 });
  const [triggerAnalysis, { loading: triggering }] = useMutation(TRIGGER_ANALYSIS_MUTATION, {
    onCompleted: () => {
      alert("Quantitative research analysis queued! Please give it 30–60 seconds and refresh.");
    }
  });

  const formatIndianCurrency = useCallback((val: number | string | null | undefined) => {
    if (val == null || val === '') return '—';
    const num = typeof val === 'string' ? parseFloat(val) : val;
    if (isNaN(num) || num === 0) return '—';
    return `₹${num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }, []);

  const formatIndianLakhCr = useCallback((val: number | string | null | undefined) => {
    if (val == null || val === '') return '—';
    const num = typeof val === 'string' ? parseFloat(val) : val;
    if (isNaN(num) || num === 0) return '—';
    const absVal = Math.abs(num);
    if (absVal >= 100000000000) {
      return `₹${(num / 100000000000).toFixed(2)} Lakh Cr`;
    }
    if (absVal >= 100000) {
      return `₹${(num / 10000000).toFixed(2)} Cr`;
    }
    return formatIndianCurrency(num);
  }, [formatIndianCurrency]);

  const formatPct = useCallback((val: number | string | null | undefined) => {
    if (val == null || val === '') return '—';
    const num = typeof val === 'string' ? parseFloat(val) : val;
    if (isNaN(num)) return '—';
    return `${num.toFixed(2)}%`;
  }, []);

  const formatRatio = useCallback((val: number | string | null | undefined) => {
    if (val == null || val === '') return '—';
    const num = typeof val === 'string' ? parseFloat(val) : val;
    if (isNaN(num) || num === 0) return '—';
    return `${num.toFixed(2)}x`;
  }, []);

  const formatMarkdownTables = useCallback((text: string = '') => {
    if (!text) return '*No research report generated.*';
    const lines = text.split('\n');
    let result: string[] = [];
    let inTable = false;
    let tableRows: string[][] = [];

    const flushTable = () => {
      if (tableRows.length === 0) return;
      let html = '<table><thead><tr>';
      const header = tableRows[0];
      header.forEach(cell => {
        html += `<th>${cell}</th>`;
      });
      html += '</tr></thead><tbody>';
      for (let i = 1; i < tableRows.length; i++) {
        html += '<tr>';
        tableRows[i].forEach(cell => {
          html += `<td>${cell}</td>`;
        });
        html += '</tr>';
      }
      html += '</tbody></table>';
      result.push(html);
      tableRows = [];
      inTable = false;
    };

    lines.forEach(line => {
      const trimmed = line.trim();
      if (trimmed.startsWith('|') && trimmed.endsWith('|') && !trimmed.includes('---')) {
        inTable = true;
        const cells = trimmed.split('|').map(c => c.trim()).slice(1, -1);
        tableRows.push(cells);
      } else if (trimmed.includes('---') && trimmed.includes('|')) {
        // ignore markdown delimiter line
      } else {
        if (inTable) {
          flushTable();
        }
        result.push(line);
      }
    });
    if (inTable) {
      flushTable();
    }
    return result.join('\n');
  }, []);

  if (loading && !data) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '70vh', gap: 2 }}>
        <CircularProgress size={44} sx={{ color: tokens.accent.main }} />
        <Typography sx={{ color: tokens.text.secondary, fontSize: '14px', fontWeight: 500, fontFamily: tokens.typography.fontFamily }}>
          Loading Quantitative Equity Profile...
        </Typography>
      </Box>
    );
  }

  if (error) return <Box p={4}><Alert severity="error">{error.message}</Alert></Box>;
  if (!data?.company) return <Box p={4}><Alert severity="warning">Company not found in universe records.</Alert></Box>;

  const company = data.company;
  const aiReport = company.aiReports && company.aiReports.length > 0 ? company.aiReports[0] : null;
  const tech = company.technicalSnapshots && company.technicalSnapshots.length > 0 ? company.technicalSnapshots[0] : null;

  const markdownStyles = {
    '& h1, & h2, & h3': { color: tokens.text.primary, mt: 3, mb: 2, borderBottom: `1px solid ${tokens.border.main}`, pb: 1, fontSize: '18px', fontWeight: 700, fontFamily: tokens.typography.fontFamily },
    '& h4, & h5': { color: tokens.text.primary, mt: 2, mb: 1, fontSize: '15px', fontWeight: 600, fontFamily: tokens.typography.fontFamily },
    '& p': { color: tokens.text.primary, lineHeight: 1.7, mb: 2, fontSize: '13px', fontFamily: tokens.typography.fontFamily },
    '& ul, & ol': { color: tokens.text.primary, fontSize: '13px', mb: 2, paddingLeft: '24px', fontFamily: tokens.typography.fontFamily },
    '& li': { mb: 1, lineHeight: 1.6 },
    '& strong': { color: tokens.text.primary, fontWeight: 700 },
    '& table': { 
      width: '100%', 
      borderCollapse: 'collapse', 
      mt: 2, 
      mb: 3, 
      fontSize: '12px',
      backgroundColor: tokens.background.paper,
      border: `1px solid ${tokens.border.main}`,
      borderRadius: '8px',
      overflow: 'hidden',
      boxShadow: tokens.shadows.card,
    },
    '& th': { 
      backgroundColor: tokens.background.header, 
      color: tokens.text.secondary, 
      fontWeight: 600, 
      textAlign: 'left', 
      p: '12px 14px', 
      borderBottom: `1px solid ${tokens.border.main}`,
      textTransform: 'uppercase',
      fontSize: '11px',
      letterSpacing: '0.5px'
    },
    '& td': { 
      p: '12px 14px', 
      color: tokens.text.primary, 
      borderBottom: `1px solid ${tokens.border.main}`,
      fontFamily: tokens.typography.fontFamily,
      fontSize: '12px'
    },
    '& tr:nth-of-type(even)': { backgroundColor: tokens.background.card },
    '& tr:hover': { backgroundColor: tokens.background.cardHover },
    '& blockquote': {
      borderLeft: `4px solid ${tokens.primary.main}`,
      pl: 2,
      py: 0.5,
      my: 2,
      backgroundColor: tokens.background.card,
      color: tokens.text.secondary,
      fontStyle: 'italic',
      borderRadius: '4px'
    }
  };

  return (
    <Box sx={{ minHeight: '100vh', backgroundColor: tokens.background.default, p: { xs: 2, md: 4 }, fontFamily: tokens.typography.fontFamily, color: tokens.text.primary }}>
      <Button 
        startIcon={<ArrowBackIcon />} 
        onClick={() => navigate('/')} 
        sx={{ color: tokens.text.secondary, mb: 3, textTransform: 'none', fontWeight: 600, fontSize: '13px', '&:hover': { color: tokens.text.primary } }}
      >
        Back to Dashboard
      </Button>

      {/* Tier 1: Top Company Banner & Current Price Display */}
      <Paper elevation={0} sx={{ p: 3, backgroundColor: tokens.background.paper, border: `1px solid ${tokens.border.main}`, borderRadius: '12px', mb: 4, boxShadow: tokens.shadows.card }}>
        <Box display="flex" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={2}>
          <Box>
            <Stack direction="row" spacing={1.5} alignItems="center" mb={1} flexWrap="wrap" gap={1}>
              <Typography variant="h4" sx={{ fontWeight: 700, fontSize: '24px', color: tokens.text.primary }}>
                {company.name}
              </Typography>
              <Chip label={company.ticker} size="small" sx={{ backgroundColor: tokens.background.cardHover, color: tokens.text.primary, fontWeight: 700, border: `1px solid ${tokens.border.main}`, borderRadius: '6px' }} />
              {aiReport?.overallRating && (
                <StatusBadge 
                  status={aiReport.overallRating} 
                  variant={aiReport.overallRating.toLowerCase().includes('bullish') || aiReport.overallRating.toLowerCase().includes('strong') ? 'success' : aiReport.overallRating.toLowerCase().includes('bearish') ? 'error' : 'neutral'} 
                />
              )}
            </Stack>
            <Typography variant="subtitle2" sx={{ color: tokens.text.secondary, fontSize: '13px' }}>
              NSE | {company.sector} • Objective Quantitative Equity Analysis & Risk Assessment
            </Typography>
          </Box>

          <Box display="flex" alignItems="center" gap={2.5} flexWrap="wrap">
            <Box textAlign="right" sx={{ backgroundColor: tokens.background.card, p: 1.5, px: 2.5, borderRadius: '8px', border: `1px solid ${tokens.border.main}` }}>
              <Typography variant="caption" sx={{ color: tokens.text.secondary, textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.5px', fontSize: '11px', display: 'block' }}>
                Current Price
              </Typography>
              <Typography className="mono-font tabular-nums" sx={{ fontWeight: 700, fontSize: '26px', color: tokens.text.primary, my: 0.2 }}>
                {formatIndianCurrency(company.currentPrice)}
              </Typography>
              <Typography sx={{ color: tokens.status.success.main, fontWeight: 600, fontSize: '11px' }}>
                ● Live NSE Quote
              </Typography>
            </Box>

            <Button 
              variant="contained" 
              disabled={triggering}
              onClick={() => triggerAnalysis({ variables: { companyId: id } })}
              sx={{ 
                backgroundColor: tokens.primary.main, 
                color: isDark ? '#0A0A0C' : '#FFFFFF',
                fontWeight: 600, 
                px: 3, 
                py: 1.5,
                borderRadius: '8px',
                fontSize: '13px',
                textTransform: 'none',
                boxShadow: 'none',
                transition: 'opacity 0.15s ease-in-out',
                '&:hover': { opacity: 0.88, backgroundColor: tokens.primary.main }
              }}
            >
              {triggering ? "Calculating Models..." : "Generate Deep Research"}
            </Button>
          </Box>
        </Box>
      </Paper>

      {/* Tier 2: 8-Card Company Overview & Fundamental Snapshot */}
      <Typography variant="h6" sx={{ color: tokens.text.primary, mb: 2, fontSize: '16px', fontWeight: 700 }}>
        Company Overview & Fundamental Snapshot
      </Typography>
      <Grid container spacing={2} mb={4}>
        <Grid item xs={12} sm={6} md={3}>
          <MetricCard label="Market Cap" value={formatIndianLakhCr(company.marketCap)} change="NSE Total Valuation" />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <MetricCard label="Enterprise Value" value={formatIndianLakhCr(company.enterpriseValue || company.marketCap)} change="MktCap + Debt - Cash" />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <MetricCard label="Valuation Multiples" value={`P/E: ${formatRatio(company.peRatio)}`} change={`P/B: ${formatRatio(company.pbRatio)}`} />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <MetricCard label="Capital Returns" value={`ROE: ${formatPct(company.roe)}`} change={`ROCE: ${formatPct(company.roce)}`} trend="up" />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <MetricCard label="52 Week Range" value={`${formatIndianCurrency(company.low52w)} - ${formatIndianCurrency(company.high52w)}`} change="Annual Price Extremes" />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <MetricCard label="Debt & Solvency" value={`Debt/Eq: ${formatRatio(company.debtToEquity)}`} change={`Book Val: ${formatIndianCurrency(company.bookValue)}`} />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <MetricCard label="Promoter Holding" value={formatPct(company.promoterHolding)} change="Insider & Founder Ownership" />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <MetricCard label="Institutional Holding (FII)" value={formatPct(company.fiiHolding)} change="Foreign & Domestic Funds" />
        </Grid>
      </Grid>

      {/* Tier 3: Technical Analysis Indicator Deck */}
      <Typography variant="h6" sx={{ color: tokens.text.primary, mb: 2, fontSize: '16px', fontWeight: 700 }}>
        Technical Analysis & Momentum Deck
      </Typography>
      {tech ? (
        <Grid container spacing={2} mb={4}>
          <Grid item xs={12} sm={6} md={3}>
            <Paper elevation={0} sx={{ p: 2.5, backgroundColor: tokens.background.card, border: `1px solid ${tokens.border.main}`, borderRadius: '12px', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <Typography sx={{ color: tokens.text.secondary, fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Trend / Cross Status</Typography>
              <Typography sx={{ color: tech.trend === 'Bullish' ? tokens.status.success.main : tokens.status.error.main, fontWeight: 700, fontSize: '18px', mt: 0.5 }}>
                {tech.trend || 'N/A'} / {tech.crossStatus || 'N/A'}
              </Typography>
            </Paper>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Paper elevation={0} sx={{ p: 2.5, backgroundColor: tokens.background.card, border: `1px solid ${tokens.border.main}`, borderRadius: '12px', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <Typography sx={{ color: tokens.text.secondary, fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>RSI (14 Momentum)</Typography>
              <Typography className="mono-font tabular-nums" sx={{ color: tokens.text.primary, fontWeight: 700, fontSize: '20px', mt: 0.5 }}>
                {tech?.rsi != null && !isNaN(Number(tech.rsi)) ? Number(tech.rsi).toFixed(2) : 'N/A'}
              </Typography>
            </Paper>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Paper elevation={0} sx={{ p: 2.5, backgroundColor: tokens.background.card, border: `1px solid ${tokens.border.main}`, borderRadius: '12px', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <Typography sx={{ color: tokens.text.secondary, fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>MACD</Typography>
              <Typography className="mono-font tabular-nums" sx={{ color: tokens.text.primary, fontWeight: 700, fontSize: '20px', mt: 0.5 }}>
                {tech?.macd != null && !isNaN(Number(tech.macd)) ? Number(tech.macd).toFixed(2) : 'N/A'}
              </Typography>
            </Paper>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Paper elevation={0} sx={{ p: 2.5, backgroundColor: tokens.background.card, border: `1px solid ${tokens.border.main}`, borderRadius: '12px', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <Typography sx={{ color: tokens.text.secondary, fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Imm Support / Resistance</Typography>
              <Typography className="mono-font tabular-nums" sx={{ color: tokens.text.primary, fontWeight: 700, fontSize: '16px', mt: 0.5 }}>
                {formatIndianCurrency(tech.immSupport)} / {formatIndianCurrency(tech.immResistance)}
              </Typography>
            </Paper>
          </Grid>
        </Grid>
      ) : <Typography sx={{ mb: 4, color: tokens.text.tertiary, fontStyle: 'italic', fontSize: '13px' }}>No technical indicators generated. Click "Generate Deep Research" to compute.</Typography>}

      {/* Tier 4 & 5: Quarterly Earnings Market Impact & Social Sentiment Deck */}
      <ErrorBoundary fallbackTitle="Quarterly Market Impact Error">
        <QuarterlyMarketImpact company={company} />
      </ErrorBoundary>

      <ErrorBoundary fallbackTitle="Social Sentiment Error">
        <SocialSentimentCard company={company} />
      </ErrorBoundary>

      {/* Tier 6: Strategy Backtests */}
      <Typography variant="h6" sx={{ color: tokens.text.primary, mb: 2, fontSize: '16px', fontWeight: 700 }}>
        Quantitative Strategy Backtests & Event Study
      </Typography>
      {company.backtests && company.backtests.length > 0 ? (
        <Grid container spacing={2} mb={5}>
          {company.backtests.map((b: any, idx: number) => {
            const strategyMap: Record<string, {name: string, desc: string}> = {
              'A': { 
                name: 'Post-Earnings Drift (PEAD)', 
                desc: 'Trades continued momentum in the direction of earnings surprise over a 1-month horizon.' 
              },
              'B': { 
                name: 'Mean Reversion Fade', 
                desc: 'Fades extreme overreactions immediately after earnings, betting price will revert to pre-earnings mean.' 
              },
              'C': { 
                name: 'Volatility Breakout', 
                desc: 'Enters trades on abnormally high volume post-earnings, signaling institutional accumulation.' 
              },
              'D': { 
                name: 'Gap and Go', 
                desc: 'Capitalizes on strong opening gaps that sustain their momentum intraday.' 
              },
              'E': { 
                name: 'Pre-Earnings Run-Up', 
                desc: 'Anticipatory strategy trading implied volatility and speculation ramp-up before earnings announcement.' 
              },
              'F': { 
                name: 'Earnings Trap (Fakeout)', 
                desc: 'Waits for false breakdowns post-earnings that trap bears, then trades in the opposite direction.' 
              }
            };
            const meta = strategyMap[b.strategyName] || { name: `Strategy ${b.strategyName}`, desc: 'Quantitative backtest algorithm.' };
            
            return (
              <Grid item xs={12} sm={6} md={4} key={idx}>
                <Paper elevation={0} sx={{ p: 2.5, backgroundColor: tokens.background.paper, border: `1px solid ${tokens.border.main}`, borderRadius: '12px', height: '100%', transition: 'border-color 0.15s ease-in-out, transform 0.15s ease-in-out', '&:hover': { borderColor: tokens.border.light, transform: 'translateY(-2px)' } }}>
                  <Box display="flex" alignItems="center" justifyContent="space-between" mb={1}>
                    <Typography sx={{ color: tokens.text.primary, fontSize: '14px', fontWeight: 700 }}>{meta.name}</Typography>
                    <Tooltip title={meta.desc} arrow placement="top">
                      <IconButton size="small" sx={{ color: tokens.text.secondary, '&:hover': { color: tokens.text.primary } }}>
                        <InfoOutlinedIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </Box>
                  <Box display="flex" justifyContent="space-between" alignItems="center" mt={2} pt={1.5} borderTop={`1px solid ${tokens.border.main}`}>
                    <Typography sx={{ color: tokens.text.secondary, fontSize: '12px', fontWeight: 500 }}>
                      Win Rate: <span className="mono-font tabular-nums" style={{ color: Number(b.winRate || 0) >= 50 ? tokens.status.success.main : tokens.status.error.main, fontSize: '14px', fontWeight: 700, marginLeft: '4px' }}>{b.winRate != null && !isNaN(Number(b.winRate)) ? Number(b.winRate).toFixed(1) : '0.0'}%</span>
                    </Typography>
                    <Typography sx={{ color: tokens.text.secondary, fontSize: '12px', fontWeight: 500 }}>
                      Trades: <span className="mono-font tabular-nums" style={{ color: tokens.text.primary, fontSize: '14px', fontWeight: 700, marginLeft: '4px' }}>{b.totalTrades || 0}</span>
                    </Typography>
                  </Box>
                </Paper>
              </Grid>
            );
          })}
        </Grid>
      ) : <Typography sx={{ mb: 4, color: tokens.text.tertiary, fontStyle: 'italic', fontSize: '13px' }}>No quantitative backtests generated. Click "Generate Deep Research" to run algorithmic backtests.</Typography>}

      {/* Tier 7: Interactive Quantitative Analyst Report Suite */}
      <Paper elevation={0} sx={{ backgroundColor: tokens.background.paper, border: `1px solid ${tokens.border.main}`, borderRadius: '12px', overflow: 'hidden', mt: 4, boxShadow: tokens.shadows.card }}>
        <Box sx={{ backgroundColor: tokens.background.header, px: 3, pt: 2.5, borderBottom: `1px solid ${tokens.border.main}` }}>
          <Typography variant="h5" sx={{ color: tokens.text.primary, fontWeight: 700, fontSize: '18px', mb: 0.5 }}>
            Objective Quantitative Research & Risk Assessment Report
          </Typography>
          <Typography sx={{ color: tokens.text.secondary, mb: 2, fontSize: '13px' }}>
            Complete, transparent financial calculations and measurable statistics. No speculative signals or target predictions.
          </Typography>
          
          <Tabs 
            value={tabIndex} 
            onChange={(_, newValue) => setTabIndex(newValue)} 
            variant="scrollable" 
            scrollButtons="auto"
            sx={{
              '& .MuiTab-root': { color: tokens.text.secondary, fontWeight: 600, fontSize: '13px', textTransform: 'none', py: 1.5, minHeight: '44px' },
              '& .Mui-selected': { color: `${tokens.text.primary} !important`, fontWeight: 700 },
              '& .MuiTabs-indicator': { backgroundColor: tokens.primary.main, height: '3px', borderRadius: '3px 3px 0 0' }
            }}
          >
            <Tab icon={<AssessmentOutlinedIcon sx={{ mb: '0 !important', mr: 1, fontSize: 18 }} />} iconPosition="start" label="Health Score & Calculations" />
            <Tab icon={<TrendingUpOutlinedIcon sx={{ mb: '0 !important', mr: 1, fontSize: 18 }} />} iconPosition="start" label="Price, Trend & Momentum" />
            <Tab icon={<AccountBalanceOutlinedIcon sx={{ mb: '0 !important', mr: 1, fontSize: 18 }} />} iconPosition="start" label="Fundamentals & Valuation" />
            <Tab icon={<WarningAmberOutlinedIcon sx={{ mb: '0 !important', mr: 1, fontSize: 18 }} />} iconPosition="start" label="Risk Assessment Matrix" />
            <Tab icon={<HistoryOutlinedIcon sx={{ mb: '0 !important', mr: 1, fontSize: 18 }} />} iconPosition="start" label="Strategy Synthesis" />
            <Tab icon={<SummarizeOutlinedIcon sx={{ mb: '0 !important', mr: 1, fontSize: 18 }} />} iconPosition="start" label="Executive Summary" />
          </Tabs>
        </Box>

        <Box sx={{ p: { xs: 2, md: 4 } }}>
          {aiReport ? (
            <Box sx={markdownStyles}>
              <TabPanel value={tabIndex} index={0}>
                <FinancialHealthScorecard rawContent={aiReport.probabilityAnalysis || ''} />
              </TabPanel>

              <TabPanel value={tabIndex} index={1}>
                <Typography sx={{ color: tokens.text.primary, mb: 2, fontWeight: 700, fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  PRICE RETURN ESTIMATES, TREND CLASSIFICATION & MOMENTUM STATS
                </Typography>
                <ReactMarkdown rehypePlugins={[rehypeRaw]}>{formatMarkdownTables(aiReport.statisticalAnalysis)}</ReactMarkdown>
              </TabPanel>

              <TabPanel value={tabIndex} index={2}>
                <Typography sx={{ color: tokens.text.primary, mb: 2, fontWeight: 700, fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  FUNDAMENTALS & OBJECTIVE VALUATION CLASSIFICATION
                </Typography>
                <ReactMarkdown rehypePlugins={[rehypeRaw]}>{formatMarkdownTables(aiReport.patternRecognition)}</ReactMarkdown>
              </TabPanel>

              <TabPanel value={tabIndex} index={3}>
                <Typography sx={{ color: tokens.text.primary, mb: 2, fontWeight: 700, fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  MEASURABLE RISK ASSESSMENT MATRIX (LOW / MODERATE / HIGH)
                </Typography>
                <ReactMarkdown rehypePlugins={[rehypeRaw]}>{formatMarkdownTables(aiReport.riskAssessment)}</ReactMarkdown>
              </TabPanel>

              <TabPanel value={tabIndex} index={4}>
                <Typography sx={{ color: tokens.text.primary, mb: 2, fontWeight: 700, fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  HISTORICAL QUANTITATIVE STRATEGY SYNTHESIS
                </Typography>
                <ReactMarkdown rehypePlugins={[rehypeRaw]}>{formatMarkdownTables(aiReport.tradingPlan)}</ReactMarkdown>
              </TabPanel>

              <TabPanel value={tabIndex} index={5}>
                <Typography sx={{ color: tokens.text.primary, mb: 2, fontWeight: 700, fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  COMPANY OVERVIEW & STRICTLY FACTUAL OBSERVATIONS
                </Typography>
                <ReactMarkdown rehypePlugins={[rehypeRaw]}>{formatMarkdownTables(aiReport.finalVerdict)}</ReactMarkdown>
              </TabPanel>
            </Box>
          ) : (
            <Box sx={{ py: 6, textAlign: 'center' }}>
              <Typography sx={{ color: tokens.text.primary, mb: 1, fontSize: '16px', fontWeight: 700 }}>
                No quantitative research report available for this company.
              </Typography>
              <Typography sx={{ color: tokens.text.secondary, mb: 3, maxWidth: 600, mx: 'auto', fontSize: '13px' }}>
                Click the button below or in the header to initialize our professional quantitative models, calculate real-time technicals, run strategy backtests, and produce transparent financial score calculations.
              </Typography>
              <Button 
                variant="contained" 
                disabled={triggering}
                onClick={() => triggerAnalysis({ variables: { companyId: id } })}
                sx={{ backgroundColor: tokens.primary.main, color: isDark ? '#0A0A0C' : '#FFFFFF', fontWeight: 600, px: 4, py: 1.5, borderRadius: '8px', textTransform: 'none', '&:hover': { opacity: 0.88, backgroundColor: tokens.primary.main } }}
              >
                {triggering ? "Calculating Models..." : "Generate Deep Research"}
              </Button>
            </Box>
          )}
        </Box>
      </Paper>
    </Box>
  );
};

export default CompanyDetail;
