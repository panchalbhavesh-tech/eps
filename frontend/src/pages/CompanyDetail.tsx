import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, gql } from '@apollo/client';
import { Box, Typography, Button, CircularProgress, Alert, Grid, Paper, Tabs, Tab, Chip, Stack } from '@mui/material';
import ReactMarkdown from 'react-markdown';
import rehypeRaw from 'rehype-raw';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import Tooltip from '@mui/material/Tooltip';
import IconButton from '@mui/material/IconButton';
import AssessmentOutlinedIcon from '@mui/icons-material/AssessmentOutlined';
import TrendingUpOutlinedIcon from '@mui/icons-material/TrendingUpOutlined';
import AccountBalanceOutlinedIcon from '@mui/icons-material/AccountBalanceOutlined';
import WarningAmberOutlinedIcon from '@mui/icons-material/WarningAmberOutlined';
import HistoryOutlinedIcon from '@mui/icons-material/HistoryOutlined';
import SummariseOutlinedIcon from '@mui/icons-material/SummarizeOutlined';
import FinancialHealthScorecard from '../components/FinancialHealthScorecard';
import QuarterlyMarketImpact from '../components/QuarterlyMarketImpact';
import { saasTokens } from '../theme/theme';

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
  const [tabIndex, setTabIndex] = useState(0);
  const { data, loading, error } = useQuery(COMPANY_DETAIL_QUERY, { variables: { id }, pollInterval: 10000 });
  const [triggerAnalysis, { loading: triggering }] = useMutation(TRIGGER_ANALYSIS_MUTATION, {
    onCompleted: () => {
      alert("Quantitative research analysis queued! Please give it 30–60 seconds and refresh.");
    }
  });

  if (loading && !data) return <Box sx={{ display: 'flex', justifyContent: 'center', p: 10 }}><CircularProgress sx={{color: '#0f172a'}} /></Box>;
  if (error) return <Alert severity="error">{error.message}</Alert>;
  if (!data?.company) return <Alert severity="warning">Company not found.</Alert>;

  const company = data.company;
  const aiReport = company.aiReports && company.aiReports.length > 0 ? company.aiReports[0] : null;
  const tech = company.technicalSnapshots && company.technicalSnapshots.length > 0 ? company.technicalSnapshots[0] : null;

  // Indian Number Formatting Helpers
  const formatIndianCurrency = (val: number | string | null | undefined) => {
    if (val == null || val === '') return 'N/A';
    const num = typeof val === 'string' ? parseFloat(val) : val;
    if (isNaN(num) || num === 0) return 'N/A';
    return `₹${num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const formatIndianLakhCr = (val: number | string | null | undefined) => {
    if (val == null || val === '') return 'N/A';
    const num = typeof val === 'string' ? parseFloat(val) : val;
    if (isNaN(num) || num === 0) return 'N/A';
    const absVal = Math.abs(num);
    if (absVal >= 100000000000) {
      return `₹${(num / 100000000000).toFixed(2)} Lakh Cr`;
    }
    if (absVal >= 100000) {
      return `₹${(num / 10000000).toFixed(2)} Cr`;
    }
    return formatIndianCurrency(num);
  };

  const formatPct = (val: number | string | null | undefined) => {
    if (val == null || val === '') return 'N/A';
    const num = typeof val === 'string' ? parseFloat(val) : val;
    if (isNaN(num)) return 'N/A';
    return `${num.toFixed(2)}%`;
  };

  const formatRatio = (val: number | string | null | undefined) => {
    if (val == null || val === '') return 'N/A';
    const num = typeof val === 'string' ? parseFloat(val) : val;
    if (isNaN(num) || num === 0) return 'N/A';
    return `${num.toFixed(2)}x`;
  };

  const formatMarkdownTables = (text: string = '') => {
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
        // ignore markdown table delimiter line
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
  };

  const markdownStyles = {
    '& h1, & h2, & h3': { color: saasTokens.text.primary, mt: 3, mb: 2, borderBottom: `1px solid ${saasTokens.border.main}`, pb: 1, fontSize: '1.25rem', fontWeight: 700 },
    '& h4, & h5': { color: saasTokens.text.primary, mt: 2, mb: 1, fontSize: '1.05rem', fontWeight: 600 },
    '& p': { color: saasTokens.text.primary, lineHeight: 1.8, mb: 2, fontSize: '0.92rem' },
    '& ul, & ol': { color: saasTokens.text.primary, fontSize: '0.92rem', mb: 2, paddingLeft: '24px' },
    '& li': { mb: 1.2, lineHeight: 1.6 },
    '& strong': { color: saasTokens.text.primary, fontWeight: 700 },
    '& table': { 
      width: '100%', 
      borderCollapse: 'collapse', 
      mt: 2, 
      mb: 3, 
      fontSize: '0.88rem',
      bgcolor: '#ffffff',
      border: `1px solid ${saasTokens.border.main}`,
      borderRadius: '8px',
      overflow: 'hidden',
      boxShadow: '0 2px 8px rgba(15, 23, 42, 0.03)'
    },
    '& th': { 
      bgcolor: saasTokens.background.header, 
      color: saasTokens.text.secondary, 
      fontWeight: 700, 
      textAlign: 'left', 
      p: 1.5, 
      borderBottom: `1px solid ${saasTokens.border.main}` 
    },
    '& td': { 
      p: 1.5, 
      color: saasTokens.text.primary, 
      borderBottom: `1px solid ${saasTokens.border.main}` 
    },
    '& tr:nth-of-type(even)': { bgcolor: '#f8fafc' },
    '& tr:hover': { bgcolor: '#f1f5f9' },
    '& blockquote': {
      borderLeft: '4px solid #0f172a',
      pl: 2,
      py: 0.5,
      my: 2,
      bgcolor: '#f8fafc',
      color: saasTokens.text.secondary,
      fontStyle: 'italic'
    }
  };

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: saasTokens.background.default, p: { xs: 2, md: 4 }, fontFamily: 'Inter, sans-serif', color: saasTokens.text.primary }}>
      <Button 
        startIcon={<ArrowBackIcon />} 
        onClick={() => navigate('/')} 
        sx={{ color: saasTokens.text.secondary, mb: 3, textTransform: 'none', fontWeight: 600, '&:hover': { color: saasTokens.text.primary } }}
      >
        Back to Dashboard
      </Button>

      {/* Top Company Banner & Current Price Display */}
      <Paper elevation={0} sx={{ p: 3, bgcolor: '#ffffff', border: `1px solid ${saasTokens.border.main}`, borderRadius: 3, mb: 4, boxShadow: '0 4px 16px rgba(15, 23, 42, 0.04)' }}>
        <Box display="flex" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={2}>
          <Box>
            <Stack direction="row" spacing={1.5} alignItems="center" mb={1}>
              <Typography variant="h4" sx={{ fontWeight: 800, color: saasTokens.text.primary }}>
                {company.name}
              </Typography>
              <Chip label={company.ticker} size="small" sx={{ bgcolor: '#f1f5f9', color: '#0f172a', fontWeight: 700, border: `1px solid ${saasTokens.border.main}` }} />
              {aiReport?.overallRating && (
                <Chip 
                  label={aiReport.overallRating} 
                  size="small"
                  sx={{ 
                    bgcolor: '#d1fae5', 
                    color: '#065f46', 
                    fontWeight: 700, 
                    border: '1px solid #a7f3d0', 
                    px: 1, 
                    fontSize: '0.85rem'
                  }} 
                />
              )}
            </Stack>
            <Typography variant="subtitle2" sx={{ color: saasTokens.text.secondary }}>
              NSE | {company.sector} &bull; Objective Quantitative Equity Analysis & Risk Assessment
            </Typography>
          </Box>

          <Box display="flex" alignItems="center" gap={3}>
            <Box textAlign="right" sx={{ bgcolor: '#f8fafc', p: 1.5, px: 2.5, borderRadius: 2, border: `1px solid ${saasTokens.border.main}` }}>
              <Typography variant="caption" sx={{ color: saasTokens.text.secondary, textTransform: 'uppercase', fontWeight: 700, letterSpacing: 0.5 }}>
                Current Price
              </Typography>
              <Typography variant="h4" sx={{ fontWeight: 800, color: saasTokens.text.primary, my: 0.2 }}>
                {formatIndianCurrency(company.currentPrice)}
              </Typography>
              <Typography variant="caption" sx={{ color: '#059669', fontWeight: 600 }}>
                &bull; Live NSE Quote
              </Typography>
            </Box>

            <Button 
              variant="contained" 
              disabled={triggering}
              onClick={() => triggerAnalysis({ variables: { companyId: id } })}
              sx={{ 
                bgcolor: '#0f172a', 
                color: '#ffffff',
                '&:hover': { bgcolor: '#1e293b' }, 
                fontWeight: 700, 
                px: 3, 
                py: 1.5,
                borderRadius: 2.5,
                textTransform: 'none',
                boxShadow: '0 4px 16px rgba(15, 23, 42, 0.12)'
              }}
            >
              {triggering ? "Calculating Models..." : "Generate Deep Research"}
            </Button>
          </Box>
        </Box>
      </Paper>

      {/* 8-Card Company Overview & Fundamental Snapshot */}
      <Typography variant="h6" sx={{ color: saasTokens.text.primary, mb: 2, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 1 }}>
        Company Overview & Fundamental Snapshot
      </Typography>
      <Grid container spacing={2} mb={4}>
        <Grid item xs={12} sm={6} md={3}>
          <Paper elevation={0} sx={{ p: 2.5, bgcolor: '#ffffff', border: `1px solid ${saasTokens.border.main}`, borderRadius: 2.5, height: '100%', boxShadow: '0 2px 8px rgba(15, 23, 42, 0.03)' }}>
            <Typography color={saasTokens.text.secondary} variant="caption" fontWeight={700} textTransform="uppercase">Market Cap</Typography>
            <Typography variant="h6" color={saasTokens.text.primary} fontWeight={800} mt={0.5}>{formatIndianLakhCr(company.marketCap)}</Typography>
            <Typography variant="caption" color={saasTokens.text.disabled}>NSE Total Market Valuation</Typography>
          </Paper>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Paper elevation={0} sx={{ p: 2.5, bgcolor: '#ffffff', border: `1px solid ${saasTokens.border.main}`, borderRadius: 2.5, height: '100%', boxShadow: '0 2px 8px rgba(15, 23, 42, 0.03)' }}>
            <Typography color={saasTokens.text.secondary} variant="caption" fontWeight={700} textTransform="uppercase">Enterprise Value</Typography>
            <Typography variant="h6" color={saasTokens.text.primary} fontWeight={800} mt={0.5}>{formatIndianLakhCr(company.enterpriseValue || company.marketCap)}</Typography>
            <Typography variant="caption" color={saasTokens.text.disabled}>Market Cap + Total Debt - Cash</Typography>
          </Paper>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Paper elevation={0} sx={{ p: 2.5, bgcolor: '#ffffff', border: `1px solid ${saasTokens.border.main}`, borderRadius: 2.5, height: '100%', boxShadow: '0 2px 8px rgba(15, 23, 42, 0.03)' }}>
            <Typography color={saasTokens.text.secondary} variant="caption" fontWeight={700} textTransform="uppercase">Valuation (P/E & P/B)</Typography>
            <Typography variant="h6" color={saasTokens.text.primary} fontWeight={800} mt={0.5}>
              {formatRatio(company.peRatio)} <span style={{ color: saasTokens.text.secondary, fontWeight: 500, fontSize: '0.9rem' }}>| P/B: {formatRatio(company.pbRatio)}</span>
            </Typography>
            <Typography variant="caption" color={saasTokens.text.disabled}>Earnings & Book Multiple</Typography>
          </Paper>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Paper elevation={0} sx={{ p: 2.5, bgcolor: '#ffffff', border: `1px solid ${saasTokens.border.main}`, borderRadius: 2.5, height: '100%', boxShadow: '0 2px 8px rgba(15, 23, 42, 0.03)' }}>
            <Typography color={saasTokens.text.secondary} variant="caption" fontWeight={700} textTransform="uppercase">Returns (ROE & ROCE)</Typography>
            <Typography variant="h6" color={saasTokens.text.primary} fontWeight={800} mt={0.5}>
              {formatPct(company.roe)} <span style={{ color: saasTokens.text.secondary, fontWeight: 500, fontSize: '0.9rem' }}>| ROCE: {formatPct(company.roce)}</span>
            </Typography>
            <Typography variant="caption" color={saasTokens.text.disabled}>Capital Efficiency & Profitability</Typography>
          </Paper>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Paper elevation={0} sx={{ p: 2.5, bgcolor: '#ffffff', border: `1px solid ${saasTokens.border.main}`, borderRadius: 2.5, height: '100%', boxShadow: '0 2px 8px rgba(15, 23, 42, 0.03)' }}>
            <Typography color={saasTokens.text.secondary} variant="caption" fontWeight={700} textTransform="uppercase">52 Week Range</Typography>
            <Typography variant="h6" color={saasTokens.text.primary} fontWeight={800} mt={0.5}>
              {formatIndianCurrency(company.low52w)} - {formatIndianCurrency(company.high52w)}
            </Typography>
            <Typography variant="caption" color={saasTokens.text.disabled}>Annual Price Extremes</Typography>
          </Paper>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Paper elevation={0} sx={{ p: 2.5, bgcolor: '#ffffff', border: `1px solid ${saasTokens.border.main}`, borderRadius: 2.5, height: '100%', boxShadow: '0 2px 8px rgba(15, 23, 42, 0.03)' }}>
            <Typography color={saasTokens.text.secondary} variant="caption" fontWeight={700} textTransform="uppercase">Debt & Solvency</Typography>
            <Typography variant="h6" color={saasTokens.text.primary} fontWeight={800} mt={0.5}>
              Debt/Eq: {formatRatio(company.debtToEquity)}
            </Typography>
            <Typography variant="caption" color={saasTokens.text.disabled}>Book Value: {formatIndianCurrency(company.bookValue)}</Typography>
          </Paper>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Paper elevation={0} sx={{ p: 2.5, bgcolor: '#ffffff', border: `1px solid ${saasTokens.border.main}`, borderRadius: 2.5, height: '100%', boxShadow: '0 2px 8px rgba(15, 23, 42, 0.03)' }}>
            <Typography color={saasTokens.text.secondary} variant="caption" fontWeight={700} textTransform="uppercase">Promoter Holding</Typography>
            <Typography variant="h6" color={saasTokens.text.primary} fontWeight={800} mt={0.5}>{formatPct(company.promoterHolding)}</Typography>
            <Typography variant="caption" color={saasTokens.text.disabled}>Insider & Founder Ownership</Typography>
          </Paper>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Paper elevation={0} sx={{ p: 2.5, bgcolor: '#ffffff', border: `1px solid ${saasTokens.border.main}`, borderRadius: 2.5, height: '100%', boxShadow: '0 2px 8px rgba(15, 23, 42, 0.03)' }}>
            <Typography color={saasTokens.text.secondary} variant="caption" fontWeight={700} textTransform="uppercase">Institutional Holding (FII)</Typography>
            <Typography variant="h6" color={saasTokens.text.primary} fontWeight={800} mt={0.5}>{formatPct(company.fiiHolding)}</Typography>
            <Typography variant="caption" color={saasTokens.text.disabled}>Foreign & Domestic Funds</Typography>
          </Paper>
        </Grid>
      </Grid>

      {/* Technical Analysis Indicator Deck */}
      <Typography variant="h6" sx={{ color: saasTokens.text.primary, mb: 2, fontWeight: 800 }}>
        Technical Analysis & Momentum Deck
      </Typography>
      {tech ? (
        <Grid container spacing={2} mb={4}>
          <Grid item xs={12} sm={6} md={3}>
            <Paper elevation={0} sx={{ p: 2, bgcolor: '#ffffff', border: `1px solid ${saasTokens.border.main}`, borderRadius: 2.5, boxShadow: '0 2px 8px rgba(15, 23, 42, 0.03)' }}>
              <Typography color={saasTokens.text.secondary} variant="caption" fontWeight={700} textTransform="uppercase">Trend / Cross Status</Typography>
              <Typography variant="h6" color={tech.trend === 'Bullish' ? '#059669' : '#e11d48'} fontWeight={800} mt={0.5}>
                {tech.trend || 'N/A'} / {tech.crossStatus || 'N/A'}
              </Typography>
            </Paper>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Paper elevation={0} sx={{ p: 2, bgcolor: '#ffffff', border: `1px solid ${saasTokens.border.main}`, borderRadius: 2.5, boxShadow: '0 2px 8px rgba(15, 23, 42, 0.03)' }}>
              <Typography color={saasTokens.text.secondary} variant="caption" fontWeight={700} textTransform="uppercase">RSI (14 Momentum)</Typography>
              <Typography variant="h6" color={saasTokens.text.primary} fontWeight={800} mt={0.5}>{tech?.rsi != null && !isNaN(Number(tech.rsi)) ? Number(tech.rsi).toFixed(2) : 'N/A'}</Typography>
            </Paper>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Paper elevation={0} sx={{ p: 2, bgcolor: '#ffffff', border: `1px solid ${saasTokens.border.main}`, borderRadius: 2.5, boxShadow: '0 2px 8px rgba(15, 23, 42, 0.03)' }}>
              <Typography color={saasTokens.text.secondary} variant="caption" fontWeight={700} textTransform="uppercase">MACD</Typography>
              <Typography variant="h6" color={saasTokens.text.primary} fontWeight={800} mt={0.5}>{tech?.macd != null && !isNaN(Number(tech.macd)) ? Number(tech.macd).toFixed(2) : 'N/A'}</Typography>
            </Paper>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Paper elevation={0} sx={{ p: 2, bgcolor: '#ffffff', border: `1px solid ${saasTokens.border.main}`, borderRadius: 2.5, boxShadow: '0 2px 8px rgba(15, 23, 42, 0.03)' }}>
              <Typography color={saasTokens.text.secondary} variant="caption" fontWeight={700} textTransform="uppercase">Imm Support / Resistance</Typography>
              <Typography variant="h6" color={saasTokens.text.primary} fontWeight={800} mt={0.5}>
                {formatIndianCurrency(tech.immSupport)} / {formatIndianCurrency(tech.immResistance)}
              </Typography>
            </Paper>
          </Grid>
        </Grid>
      ) : <Typography sx={{ mb: 4, color: saasTokens.text.secondary, fontStyle: 'italic' }}>No technical indicators generated. Click "Generate Deep Research" to compute.</Typography>}

      {/* Quarterly Earnings Market Impact & Price Performance */}
      <QuarterlyMarketImpact company={company} />

      {/* Strategy Backtests */}
      <Typography variant="h6" sx={{ color: saasTokens.text.primary, mb: 2, fontWeight: 800 }}>
        Quantitative Strategy Backtests & Event Study
      </Typography>
      {company.backtests && company.backtests.length > 0 ? (
        <Grid container spacing={2} mb={5}>
          {company.backtests.map((b: any, idx: number) => {
            const strategyMap: Record<string, {name: string, desc: string}> = {
              'A': { 
                name: 'Post-Earnings Drift (PEAD)', 
                desc: 'Trades the continued momentum of a stock in the direction of its earnings surprise over a 1-month horizon. \n\nExample: If the stock gaps up > 2% on the earnings day, we buy at the close of the earnings day and hold the position for 20 trading days to capture delayed institutional buying.' 
              },
              'B': { 
                name: 'Mean Reversion Fade', 
                desc: 'Fades extreme overreactions immediately after earnings, betting the price will revert to its pre-earnings mean. \n\nExample: If the stock violently gaps up > 5% at open, we short the stock at the close of the day and cover the position 3 days later, profiting from the pullback.' 
              },
              'C': { 
                name: 'Volatility Breakout', 
                desc: 'Enters trades when a stock exhibits abnormally high volume post-earnings, signaling major institutional accumulation. \n\nExample: If the stock volume on earnings day is greater than 2x its 20-day average volume, we buy the close and hold for 10 trading days to ride the liquidity wave.' 
              },
              'D': { 
                name: 'Gap and Go', 
                desc: 'Capitalizes on strong opening gaps that sustain their momentum intraday. \n\nExample: If the stock gaps up > 2% and closes near the high of the day (top 20% of the daily range), we buy at the open of the very next day and hold for 5 days.' 
              },
              'E': { 
                name: 'Pre-Earnings Run-Up', 
                desc: 'A purely anticipatory strategy that trades the implied volatility and speculation ramp-up before the actual earnings announcement. \n\nExample: We buy the stock exactly 10 trading days before the scheduled earnings date, and sell it the day before the announcement to avoid actual earnings risk.' 
              },
              'F': { 
                name: 'Earnings Trap (Fakeout)', 
                desc: 'Waits for a false breakdown post-earnings that traps retail bears, then trades aggressively in the opposite direction. \n\nExample: If the stock gaps down > -2% on the open but rallies aggressively to close green on the day, we buy the close and hold for 5 days.' 
              }
            };
            const meta = strategyMap[b.strategyName] || { name: `Strategy ${b.strategyName}`, desc: 'Quantitative backtest algorithm.' };
            
            return (
              <Grid item xs={12} sm={6} md={4} key={idx}>
                <Paper elevation={0} sx={{ p: 2.5, bgcolor: '#ffffff', border: `1px solid ${saasTokens.border.main}`, borderRadius: 2.5, height: '100%', boxShadow: '0 2px 8px rgba(15, 23, 42, 0.03)', transition: 'all 0.2s', '&:hover': { borderColor: '#cbd5e1', transform: 'translateY(-2px)', boxShadow: '0 8px 24px rgba(15, 23, 42, 0.08)' } }}>
                  <Box display="flex" alignItems="center" justifyContent="space-between" mb={1}>
                    <Typography color={saasTokens.text.primary} variant="subtitle2" fontWeight={800}>{meta.name}</Typography>
                    <Tooltip title={<Typography sx={{ whiteSpace: 'pre-line', fontSize: '0.85rem', p: 0.5 }}>{meta.desc}</Typography>} arrow placement="top">
                      <IconButton size="small" sx={{ color: saasTokens.text.secondary, '&:hover': { color: saasTokens.text.primary } }}>
                        <InfoOutlinedIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </Box>
                  <Box display="flex" justifyContent="space-between" alignItems="center" mt={2} pt={1.5} borderTop={`1px solid ${saasTokens.border.main}`}>
                    <Typography color={saasTokens.text.secondary} variant="caption" fontWeight={600}>Win Rate: <strong style={{ color: Number(b.winRate || 0) >= 50 ? '#059669' : '#e11d48', fontSize: '0.9rem', fontWeight: 800 }}>{b.winRate != null && !isNaN(Number(b.winRate)) ? Number(b.winRate).toFixed(1) : '0.0'}%</strong></Typography>
                    <Typography color={saasTokens.text.secondary} variant="caption" fontWeight={600}>Total Trades: <strong style={{ color: saasTokens.text.primary, fontSize: '0.9rem', fontWeight: 800 }}>{b.totalTrades || 0}</strong></Typography>
                  </Box>
                </Paper>
              </Grid>
            );
          })}
        </Grid>
      ) : <Typography sx={{ mb: 4, color: saasTokens.text.secondary, fontStyle: 'italic' }}>No quantitative backtests generated. Click "Generate Deep Research" to run algorithmic backtests.</Typography>}

      {/* Interactive Quantitative Analyst Report Suite */}
      <Paper elevation={0} sx={{ bgcolor: '#ffffff', border: `1px solid ${saasTokens.border.main}`, borderRadius: 3, overflow: 'hidden', mt: 4, boxShadow: '0 4px 16px rgba(15, 23, 42, 0.04)' }}>
        <Box sx={{ bgcolor: saasTokens.background.header, px: 3, pt: 2.5, borderBottom: `1px solid ${saasTokens.border.main}` }}>
          <Typography variant="h5" sx={{ color: saasTokens.text.primary, fontWeight: 800, mb: 0.5 }}>
            Objective Quantitative Research & Risk Assessment Report
          </Typography>
          <Typography variant="body2" sx={{ color: saasTokens.text.secondary, mb: 2 }}>
            Complete, transparent financial calculations and measurable statistics. No speculative signals or target predictions.
          </Typography>
          
          <Tabs 
            value={tabIndex} 
            onChange={(_, newValue) => setTabIndex(newValue)} 
            variant="scrollable" 
            scrollButtons="auto"
            sx={{
              '& .MuiTab-root': { color: saasTokens.text.secondary, fontWeight: 600, fontSize: '0.8rem', textTransform: 'none', py: 1.5, minHeight: '42px' },
              '& .Mui-selected': { color: '#0f172a !important', fontWeight: 700 },
              '& .MuiTabs-indicator': { bgcolor: '#0f172a', height: '2.5px' }
            }}
          >
            <Tab icon={<AssessmentOutlinedIcon sx={{ mb: '0 !important', mr: 0.8, fontSize: '1.1rem' }} />} iconPosition="start" label="Health Score & Calculations" />
            <Tab icon={<TrendingUpOutlinedIcon sx={{ mb: '0 !important', mr: 0.8, fontSize: '1.1rem' }} />} iconPosition="start" label="Price, Trend & Momentum" />
            <Tab icon={<AccountBalanceOutlinedIcon sx={{ mb: '0 !important', mr: 0.8, fontSize: '1.1rem' }} />} iconPosition="start" label="Fundamentals & Valuation" />
            <Tab icon={<WarningAmberOutlinedIcon sx={{ mb: '0 !important', mr: 0.8, fontSize: '1.1rem' }} />} iconPosition="start" label="Risk Assessment Matrix" />
            <Tab icon={<HistoryOutlinedIcon sx={{ mb: '0 !important', mr: 0.8, fontSize: '1.1rem' }} />} iconPosition="start" label="Strategy Synthesis" />
            <Tab icon={<SummariseOutlinedIcon sx={{ mb: '0 !important', mr: 0.8, fontSize: '1.1rem' }} />} iconPosition="start" label="Executive Summary" />
          </Tabs>
        </Box>

        <Box sx={{ p: { xs: 2, md: 4 } }}>
          {aiReport ? (
            <Box sx={markdownStyles}>
              <TabPanel value={tabIndex} index={0}>
                <FinancialHealthScorecard rawContent={aiReport.probabilityAnalysis || ''} />
              </TabPanel>

              <TabPanel value={tabIndex} index={1}>
                <Typography variant="subtitle2" sx={{ color: '#0f172a', mb: 2, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  PRICE RETURN ESTIMATES, TREND CLASSIFICATION & MOMENTUM STATS
                </Typography>
                <ReactMarkdown rehypePlugins={[rehypeRaw]}>{formatMarkdownTables(aiReport.statisticalAnalysis)}</ReactMarkdown>
              </TabPanel>

              <TabPanel value={tabIndex} index={2}>
                <Typography variant="subtitle2" sx={{ color: '#0f172a', mb: 2, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  FUNDAMENTALS & OBJECTIVE VALUATION CLASSIFICATION
                </Typography>
                <ReactMarkdown rehypePlugins={[rehypeRaw]}>{formatMarkdownTables(aiReport.patternRecognition)}</ReactMarkdown>
              </TabPanel>

              <TabPanel value={tabIndex} index={3}>
                <Typography variant="subtitle2" sx={{ color: '#0f172a', mb: 2, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  MEASURABLE RISK ASSESSMENT MATRIX (LOW / MODERATE / HIGH)
                </Typography>
                <ReactMarkdown rehypePlugins={[rehypeRaw]}>{formatMarkdownTables(aiReport.riskAssessment)}</ReactMarkdown>
              </TabPanel>

              <TabPanel value={tabIndex} index={4}>
                <Typography variant="subtitle2" sx={{ color: '#0f172a', mb: 2, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  HISTORICAL QUANTITATIVE STRATEGY SYNTHESIS
                </Typography>
                <ReactMarkdown rehypePlugins={[rehypeRaw]}>{formatMarkdownTables(aiReport.tradingPlan)}</ReactMarkdown>
              </TabPanel>

              <TabPanel value={tabIndex} index={5}>
                <Typography variant="subtitle2" sx={{ color: '#0f172a', mb: 2, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  COMPANY OVERVIEW & STRICTLY FACTUAL OBSERVATIONS
                </Typography>
                <ReactMarkdown rehypePlugins={[rehypeRaw]}>{formatMarkdownTables(aiReport.finalVerdict)}</ReactMarkdown>
              </TabPanel>
            </Box>
          ) : (
            <Box sx={{ py: 6, textAlign: 'center' }}>
              <Typography variant="h6" sx={{ color: saasTokens.text.primary, mb: 1, fontWeight: 700 }}>
                No quantitative research report available for this company.
              </Typography>
              <Typography variant="body2" sx={{ color: saasTokens.text.secondary, mb: 3, maxWidth: 600, mx: 'auto' }}>
                Click the button below or in the header to initialize our professional quantitative models, calculate real-time technicals, run strategy backtests, and produce transparent financial score calculations.
              </Typography>
              <Button 
                variant="contained" 
                disabled={triggering}
                onClick={() => triggerAnalysis({ variables: { companyId: id } })}
                sx={{ bgcolor: '#0f172a', '&:hover': { bgcolor: '#1e293b' }, fontWeight: 700, px: 4, py: 1.5, borderRadius: 2.5, textTransform: 'none' }}
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
