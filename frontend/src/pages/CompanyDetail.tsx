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

  if (loading && !data) return <Box sx={{ display: 'flex', justifyContent: 'center', p: 10 }}><CircularProgress sx={{color: '#7c4dff'}} /></Box>;
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
    '& h1, & h2, & h3': { color: '#f8fafc', mt: 3, mb: 2, borderBottom: '1px solid #1e293b', pb: 1, fontSize: '1.25rem', fontWeight: 700 },
    '& h4, & h5': { color: '#a78bfa', mt: 2, mb: 1, fontSize: '1.05rem', fontWeight: 600 },
    '& p': { color: '#cbd5e1', lineHeight: 1.8, mb: 2, fontSize: '0.92rem' },
    '& ul, & ol': { color: '#cbd5e1', fontSize: '0.92rem', mb: 2, paddingLeft: '24px' },
    '& li': { mb: 1.2, lineHeight: 1.6 },
    '& strong': { color: '#f8fafc', fontWeight: 600 },
    '& table': { 
      width: '100%', 
      borderCollapse: 'collapse', 
      mt: 2, 
      mb: 3, 
      fontSize: '0.88rem',
      bgcolor: '#0f1219',
      border: '1px solid #1e293b',
      borderRadius: '8px',
      overflow: 'hidden'
    },
    '& th': { 
      bgcolor: '#1a1d26', 
      color: '#a78bfa', 
      fontWeight: 700, 
      textAlign: 'left', 
      p: 1.5, 
      borderBottom: '1px solid #334155' 
    },
    '& td': { 
      p: 1.5, 
      color: '#e2e8f0', 
      borderBottom: '1px solid #1e293b' 
    },
    '& tr:nth-of-type(even)': { bgcolor: '#131620' },
    '& tr:hover': { bgcolor: 'rgba(124, 77, 255, 0.08)' },
    '& blockquote': {
      borderLeft: '4px solid #7c4dff',
      pl: 2,
      py: 0.5,
      my: 2,
      bgcolor: 'rgba(124, 77, 255, 0.05)',
      color: '#cbd5e1',
      fontStyle: 'italic'
    }
  };

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#0a0b10', p: { xs: 2, md: 4 }, fontFamily: 'Inter, sans-serif', color: '#e2e8f0' }}>
      <Button 
        startIcon={<ArrowBackIcon />} 
        onClick={() => navigate('/')} 
        sx={{ color: '#64748b', mb: 3, '&:hover': { color: '#a78bfa' } }}
      >
        Back to Dashboard
      </Button>

      {/* Top Company Banner & Current Price Display */}
      <Paper sx={{ p: 3, bgcolor: '#11131a', border: '1px solid #1e293b', borderRadius: 2, mb: 4 }}>
        <Box display="flex" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={2}>
          <Box>
            <Stack direction="row" spacing={1.5} alignItems="center" mb={1}>
              <Typography variant="h4" sx={{ fontWeight: 800, color: '#f8fafc' }}>
                {company.name}
              </Typography>
              <Chip label={company.ticker} sx={{ bgcolor: 'rgba(124, 77, 255, 0.2)', color: '#a78bfa', fontWeight: 700, border: '1px solid #7c4dff' }} />
              {aiReport?.overallRating && (
                <Chip 
                  label={aiReport.overallRating} 
                  sx={{ 
                    bgcolor: 'rgba(16, 185, 129, 0.15)', 
                    color: '#34d399', 
                    fontWeight: 700, 
                    border: '1px solid #059669', 
                    px: 1, 
                    fontSize: '0.85rem',
                    boxShadow: '0 0 12px rgba(16, 185, 129, 0.2)'
                  }} 
                />
              )}
            </Stack>
            <Typography variant="subtitle2" sx={{ color: '#64748b' }}>
              NSE | {company.sector} &bull; Objective Quantitative Equity Analysis & Risk Assessment
            </Typography>
          </Box>

          <Box display="flex" alignItems="center" gap={4}>
            <Box textAlign="right" sx={{ bgcolor: 'rgba(15, 23, 42, 0.8)', p: 1.5, px: 2.5, borderRadius: 2, border: '1px solid #334155' }}>
              <Typography variant="caption" sx={{ color: '#94a3b8', textTransform: 'uppercase', fontWeight: 600, letterSpacing: 1 }}>
                Current Price
              </Typography>
              <Typography variant="h4" sx={{ fontWeight: 800, color: '#f8fafc', my: 0.2 }}>
                {formatIndianCurrency(company.currentPrice)}
              </Typography>
              <Typography variant="caption" sx={{ color: '#75b798' }}>
                &bull; Live NSE Quote
              </Typography>
            </Box>

            <Button 
              variant="contained" 
              disabled={triggering}
              onClick={() => triggerAnalysis({ variables: { companyId: id } })}
              sx={{ 
                bgcolor: '#7c4dff', 
                '&:hover': { bgcolor: '#651fff' }, 
                fontWeight: 700, 
                px: 3, 
                py: 1.5,
                borderRadius: 2,
                boxShadow: '0 4px 20px rgba(124, 77, 255, 0.3)'
              }}
            >
              {triggering ? "Calculating Models..." : "Generate Deep Research"}
            </Button>
          </Box>
        </Box>
      </Paper>

      {/* 8-Card Company Overview & Fundamental Snapshot */}
      <Typography variant="h6" sx={{ color: '#a78bfa', mb: 2, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1 }}>
        Company Overview & Fundamental Snapshot
      </Typography>
      <Grid container spacing={2} mb={4}>
        <Grid item xs={12} sm={6} md={3}>
          <Paper sx={{ p: 2.5, bgcolor: '#11131a', border: '1px solid #1e293b', borderRadius: 2, height: '100%' }}>
            <Typography color="#64748b" variant="caption" fontWeight={600} textTransform="uppercase">Market Cap</Typography>
            <Typography variant="h6" color="#f8fafc" fontWeight={700} mt={0.5}>{formatIndianLakhCr(company.marketCap)}</Typography>
            <Typography variant="caption" color="#94a3b8">NSE Total Market Valuation</Typography>
          </Paper>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Paper sx={{ p: 2.5, bgcolor: '#11131a', border: '1px solid #1e293b', borderRadius: 2, height: '100%' }}>
            <Typography color="#64748b" variant="caption" fontWeight={600} textTransform="uppercase">Enterprise Value</Typography>
            <Typography variant="h6" color="#f8fafc" fontWeight={700} mt={0.5}>{formatIndianLakhCr(company.enterpriseValue || company.marketCap)}</Typography>
            <Typography variant="caption" color="#94a3b8">Market Cap + Total Debt - Cash</Typography>
          </Paper>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Paper sx={{ p: 2.5, bgcolor: '#11131a', border: '1px solid #1e293b', borderRadius: 2, height: '100%' }}>
            <Typography color="#64748b" variant="caption" fontWeight={600} textTransform="uppercase">Valuation (P/E & P/B)</Typography>
            <Typography variant="h6" color="#f8fafc" fontWeight={700} mt={0.5}>
              {formatRatio(company.peRatio)} <span style={{ color: '#64748b', fontWeight: 400, fontSize: '0.9rem' }}>| P/B: {formatRatio(company.pbRatio)}</span>
            </Typography>
            <Typography variant="caption" color="#94a3b8">Earnings & Book Multiple</Typography>
          </Paper>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Paper sx={{ p: 2.5, bgcolor: '#11131a', border: '1px solid #1e293b', borderRadius: 2, height: '100%' }}>
            <Typography color="#64748b" variant="caption" fontWeight={600} textTransform="uppercase">Returns (ROE & ROCE)</Typography>
            <Typography variant="h6" color="#f8fafc" fontWeight={700} mt={0.5}>
              {formatPct(company.roe)} <span style={{ color: '#64748b', fontWeight: 400, fontSize: '0.9rem' }}>| ROCE: {formatPct(company.roce)}</span>
            </Typography>
            <Typography variant="caption" color="#94a3b8">Capital Efficiency & Profitability</Typography>
          </Paper>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Paper sx={{ p: 2.5, bgcolor: '#11131a', border: '1px solid #1e293b', borderRadius: 2, height: '100%' }}>
            <Typography color="#64748b" variant="caption" fontWeight={600} textTransform="uppercase">52 Week Range</Typography>
            <Typography variant="h6" color="#f8fafc" fontWeight={700} mt={0.5}>
              {formatIndianCurrency(company.low52w)} - {formatIndianCurrency(company.high52w)}
            </Typography>
            <Typography variant="caption" color="#94a3b8">Annual Price Extremes</Typography>
          </Paper>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Paper sx={{ p: 2.5, bgcolor: '#11131a', border: '1px solid #1e293b', borderRadius: 2, height: '100%' }}>
            <Typography color="#64748b" variant="caption" fontWeight={600} textTransform="uppercase">Debt & Solvency</Typography>
            <Typography variant="h6" color="#f8fafc" fontWeight={700} mt={0.5}>
              Debt/Eq: {formatRatio(company.debtToEquity)}
            </Typography>
            <Typography variant="caption" color="#94a3b8">Book Value: {formatIndianCurrency(company.bookValue)}</Typography>
          </Paper>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Paper sx={{ p: 2.5, bgcolor: '#11131a', border: '1px solid #1e293b', borderRadius: 2, height: '100%' }}>
            <Typography color="#64748b" variant="caption" fontWeight={600} textTransform="uppercase">Promoter Holding</Typography>
            <Typography variant="h6" color="#f8fafc" fontWeight={700} mt={0.5}>{formatPct(company.promoterHolding)}</Typography>
            <Typography variant="caption" color="#94a3b8">Insider & Founder Ownership</Typography>
          </Paper>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Paper sx={{ p: 2.5, bgcolor: '#11131a', border: '1px solid #1e293b', borderRadius: 2, height: '100%' }}>
            <Typography color="#64748b" variant="caption" fontWeight={600} textTransform="uppercase">Institutional Holding (FII)</Typography>
            <Typography variant="h6" color="#f8fafc" fontWeight={700} mt={0.5}>{formatPct(company.fiiHolding)}</Typography>
            <Typography variant="caption" color="#94a3b8">Foreign & Domestic Funds</Typography>
          </Paper>
        </Grid>
      </Grid>

      {/* Technical Analysis Indicator Deck */}
      <Typography variant="h6" sx={{ color: '#a78bfa', mb: 2, fontWeight: 700 }}>
        Technical Analysis & Momentum Deck
      </Typography>
      {tech ? (
        <Grid container spacing={2} mb={4}>
          <Grid item xs={12} sm={6} md={3}>
            <Paper sx={{ p: 2, bgcolor: '#11131a', border: '1px solid #1e293b', borderRadius: 2 }}>
              <Typography color="#64748b" variant="caption" fontWeight={600} textTransform="uppercase">Trend / Cross Status</Typography>
              <Typography variant="h6" color={tech.trend === 'Bullish' ? '#75b798' : '#ea868f'} fontWeight={700} mt={0.5}>
                {tech.trend || 'N/A'} / {tech.crossStatus || 'N/A'}
              </Typography>
            </Paper>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Paper sx={{ p: 2, bgcolor: '#11131a', border: '1px solid #1e293b', borderRadius: 2 }}>
              <Typography color="#64748b" variant="caption" fontWeight={600} textTransform="uppercase">RSI (14 Momentum)</Typography>
              <Typography variant="h6" color="#e2e8f0" fontWeight={700} mt={0.5}>{tech.rsi?.toFixed(2) || 'N/A'}</Typography>
            </Paper>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Paper sx={{ p: 2, bgcolor: '#11131a', border: '1px solid #1e293b', borderRadius: 2 }}>
              <Typography color="#64748b" variant="caption" fontWeight={600} textTransform="uppercase">MACD</Typography>
              <Typography variant="h6" color="#e2e8f0" fontWeight={700} mt={0.5}>{tech.macd?.toFixed(2) || 'N/A'}</Typography>
            </Paper>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Paper sx={{ p: 2, bgcolor: '#11131a', border: '1px solid #1e293b', borderRadius: 2 }}>
              <Typography color="#64748b" variant="caption" fontWeight={600} textTransform="uppercase">Imm Support / Resistance</Typography>
              <Typography variant="h6" color="#e2e8f0" fontWeight={700} mt={0.5}>
                {formatIndianCurrency(tech.immSupport)} / {formatIndianCurrency(tech.immResistance)}
              </Typography>
            </Paper>
          </Grid>
        </Grid>
      ) : <Typography sx={{ mb: 4, color: '#64748b', fontStyle: 'italic' }}>No technical indicators generated. Click "Generate Deep Research" to compute.</Typography>}

      {/* Quarterly Earnings Market Impact & Price Performance */}
      <QuarterlyMarketImpact company={company} />

      {/* Strategy Backtests */}
      <Typography variant="h6" sx={{ color: '#a78bfa', mb: 2, fontWeight: 700 }}>
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
                <Paper sx={{ p: 2.5, bgcolor: '#11131a', border: '1px solid #1e293b', borderRadius: 2, height: '100%', transition: 'all 0.2s', '&:hover': { borderColor: '#7c4dff', transform: 'translateY(-2px)' } }}>
                  <Box display="flex" alignItems="center" justifyContent="space-between" mb={1}>
                    <Typography color="#7c4dff" variant="subtitle2" fontWeight={700}>{meta.name}</Typography>
                    <Tooltip title={<Typography sx={{ whiteSpace: 'pre-line', fontSize: '0.85rem', p: 0.5 }}>{meta.desc}</Typography>} arrow placement="top">
                      <IconButton size="small" sx={{ color: '#64748b', '&:hover': { color: '#f8fafc' } }}>
                        <InfoOutlinedIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </Box>
                  <Box display="flex" justifyContent="space-between" alignItems="center" mt={2} pt={1.5} borderTop="1px solid #1e293b">
                    <Typography color="#94a3b8" variant="caption">Win Rate: <strong style={{ color: (b.winRate || 0) >= 50 ? '#75b798' : '#ea868f', fontSize: '0.9rem' }}>{(b.winRate || 0).toFixed(1)}%</strong></Typography>
                    <Typography color="#94a3b8" variant="caption">Total Trades: <strong style={{ color: '#f8fafc', fontSize: '0.9rem' }}>{b.totalTrades || 0}</strong></Typography>
                  </Box>
                </Paper>
              </Grid>
            );
          })}
        </Grid>
      ) : <Typography sx={{ mb: 4, color: '#64748b', fontStyle: 'italic' }}>No quantitative backtests generated. Click "Generate Deep Research" to run algorithmic backtests.</Typography>}

      {/* Interactive Quantitative Analyst Report Suite */}
      <Paper sx={{ bgcolor: '#11131a', border: '1px solid #1e293b', borderRadius: 3, overflow: 'hidden', mt: 4 }}>
        <Box sx={{ bgcolor: '#161923', px: 3, pt: 2, borderBottom: '1px solid #1e293b' }}>
          <Typography variant="h5" sx={{ color: '#f8fafc', fontWeight: 800, mb: 0.5 }}>
            Objective Quantitative Research & Risk Assessment Report
          </Typography>
          <Typography variant="body2" sx={{ color: '#64748b', mb: 2 }}>
            Complete, transparent financial calculations and measurable statistics. No speculative signals or target predictions.
          </Typography>
          
          <Tabs 
            value={tabIndex} 
            onChange={(_, newValue) => setTabIndex(newValue)} 
            variant="scrollable" 
            scrollButtons="auto"
            sx={{
              '& .MuiTab-root': { color: '#94a3b8', fontWeight: 600, fontSize: '0.75rem', textTransform: 'none', py: 1, minHeight: '38px' },
              '& .Mui-selected': { color: '#a78bfa !important' },
              '& .MuiTabs-indicator': { bgcolor: '#7c4dff', height: '2px' }
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
                <Typography variant="subtitle2" sx={{ color: '#7c4dff', mb: 2, fontWeight: 700 }}>
                  PRICE RETURN ESTIMATES, TREND CLASSIFICATION & MOMENTUM STATS
                </Typography>
                <ReactMarkdown rehypePlugins={[rehypeRaw]}>{formatMarkdownTables(aiReport.statisticalAnalysis)}</ReactMarkdown>
              </TabPanel>

              <TabPanel value={tabIndex} index={2}>
                <Typography variant="subtitle2" sx={{ color: '#7c4dff', mb: 2, fontWeight: 700 }}>
                  FUNDAMENTALS & OBJECTIVE VALUATION CLASSIFICATION
                </Typography>
                <ReactMarkdown rehypePlugins={[rehypeRaw]}>{formatMarkdownTables(aiReport.patternRecognition)}</ReactMarkdown>
              </TabPanel>

              <TabPanel value={tabIndex} index={3}>
                <Typography variant="subtitle2" sx={{ color: '#7c4dff', mb: 2, fontWeight: 700 }}>
                  MEASURABLE RISK ASSESSMENT MATRIX (LOW / MODERATE / HIGH)
                </Typography>
                <ReactMarkdown rehypePlugins={[rehypeRaw]}>{formatMarkdownTables(aiReport.riskAssessment)}</ReactMarkdown>
              </TabPanel>

              <TabPanel value={tabIndex} index={4}>
                <Typography variant="subtitle2" sx={{ color: '#7c4dff', mb: 2, fontWeight: 700 }}>
                  HISTORICAL QUANTITATIVE STRATEGY SYNTHESIS
                </Typography>
                <ReactMarkdown rehypePlugins={[rehypeRaw]}>{formatMarkdownTables(aiReport.tradingPlan)}</ReactMarkdown>
              </TabPanel>

              <TabPanel value={tabIndex} index={5}>
                <Typography variant="subtitle2" sx={{ color: '#7c4dff', mb: 2, fontWeight: 700 }}>
                  COMPANY OVERVIEW & STRICTLY FACTUAL OBSERVATIONS
                </Typography>
                <ReactMarkdown rehypePlugins={[rehypeRaw]}>{formatMarkdownTables(aiReport.finalVerdict)}</ReactMarkdown>
              </TabPanel>
            </Box>
          ) : (
            <Box sx={{ py: 6, textAlign: 'center' }}>
              <Typography variant="h6" sx={{ color: '#94a3b8', mb: 1 }}>
                No quantitative research report available for this company.
              </Typography>
              <Typography variant="body2" sx={{ color: '#64748b', mb: 3, maxWidth: 600, mx: 'auto' }}>
                Click the button below or in the header to initialize our professional quantitative models, calculate real-time technicals, run strategy backtests, and produce transparent financial score calculations.
              </Typography>
              <Button 
                variant="contained" 
                disabled={triggering}
                onClick={() => triggerAnalysis({ variables: { companyId: id } })}
                sx={{ bgcolor: '#7c4dff', '&:hover': { bgcolor: '#651fff' }, fontWeight: 700, px: 4, py: 1.5 }}
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
