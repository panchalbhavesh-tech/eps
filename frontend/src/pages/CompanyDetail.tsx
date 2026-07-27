import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, gql } from '@apollo/client';
import { Box, Typography, Button, Card, CardContent, CircularProgress, Alert, Grid, Divider, Paper } from '@mui/material';
import ReactMarkdown from 'react-markdown';
import rehypeRaw from 'rehype-raw';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import Tooltip from '@mui/material/Tooltip';
import IconButton from '@mui/material/IconButton';

const COMPANY_DETAIL_QUERY = gql`
  query GetCompanyDetail($id: String!) {
    company(id: $id) {
      id
      ticker
      name
      sector
      marketCap
      enterpriseValue
      peRatio
      roe
      diiHolding
      fiiHolding
      promoterHolding
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

const CompanyDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data, loading, error, refetch } = useQuery(COMPANY_DETAIL_QUERY, { variables: { id }, pollInterval: 10000 });
  const [triggerAnalysis, { loading: triggering }] = useMutation(TRIGGER_ANALYSIS_MUTATION, {
    onCompleted: () => {
      alert("Deep research analysis queued in background! Give it a minute and refresh.");
    }
  });

  if (loading && !data) return <Box sx={{ display: 'flex', justifyContent: 'center', p: 10 }}><CircularProgress sx={{color: '#7c4dff'}} /></Box>;
  if (error) return <Alert severity="error">{error.message}</Alert>;
  if (!data?.company) return <Alert severity="warning">Company not found.</Alert>;

  const company = data.company;
  const aiReport = company.aiReports && company.aiReports.length > 0 ? company.aiReports[0] : null;
  const tech = company.technicalSnapshots && company.technicalSnapshots.length > 0 ? company.technicalSnapshots[0] : null;
  const eventStudy = company.eventStudies && company.eventStudies.length > 0 ? company.eventStudies[0] : null;

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#0a0b10', p: 4, fontFamily: 'Inter, sans-serif', color: '#e2e8f0' }}>
      <Button 
        startIcon={<ArrowBackIcon />} 
        onClick={() => navigate('/')} 
        sx={{ color: '#64748b', mb: 2 }}
      >
        Back to Dashboard
      </Button>

      <Box display="flex" justifyContent="space-between" alignItems="center" mb={4}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 700 }}>{company.name} ({company.ticker})</Typography>
          <Typography variant="subtitle1" sx={{ color: '#64748b' }}>{company.sector} | Quantitative Event Study Report</Typography>
        </Box>
        <Button 
          variant="contained" 
          disabled={triggering}
          onClick={() => triggerAnalysis({ variables: { companyId: id } })}
          sx={{ bgcolor: '#7c4dff', '&:hover': {bgcolor: '#651fff'}, fontWeight: 600 }}
        >
          {triggering ? "Processing..." : "Generate Deep Research"}
        </Button>
      </Box>

      {/* Current Stock Snapshot */}
      <Typography variant="h6" sx={{ color: '#94a3b8', mb: 2, borderBottom: '1px solid #1e293b', pb: 1 }}>Current Stock Snapshot</Typography>
      <Grid container spacing={2} mb={4}>
        <Grid item xs={3}><Paper sx={{p:2, bgcolor: '#13151a', border: '1px solid #1e293b'}}><Typography color="#64748b" variant="caption">Market Cap</Typography><Typography color="#e2e8f0">{company.marketCap || 'N/A'}</Typography></Paper></Grid>
        <Grid item xs={3}><Paper sx={{p:2, bgcolor: '#13151a', border: '1px solid #1e293b'}}><Typography color="#64748b" variant="caption">P/E Ratio</Typography><Typography color="#e2e8f0">{company.peRatio || 'N/A'}</Typography></Paper></Grid>
        <Grid item xs={3}><Paper sx={{p:2, bgcolor: '#13151a', border: '1px solid #1e293b'}}><Typography color="#64748b" variant="caption">ROE</Typography><Typography color="#e2e8f0">{company.roe || 'N/A'}</Typography></Paper></Grid>
        <Grid item xs={3}><Paper sx={{p:2, bgcolor: '#13151a', border: '1px solid #1e293b'}}><Typography color="#64748b" variant="caption">FII Holding</Typography><Typography color="#e2e8f0">{company.fiiHolding || 'N/A'}</Typography></Paper></Grid>
      </Grid>

      {/* Technical Analysis */}
      <Typography variant="h6" sx={{ color: '#94a3b8', mb: 2, borderBottom: '1px solid #1e293b', pb: 1 }}>Technical Analysis</Typography>
      {tech ? (
         <Grid container spacing={2} mb={4}>
            <Grid item xs={3}><Paper sx={{p:2, bgcolor: '#13151a', border: '1px solid #1e293b'}}><Typography color="#64748b" variant="caption">Trend / Cross</Typography><Typography color={tech.trend === 'Bullish' ? '#75b798' : '#ea868f'}>{tech.trend} / {tech.crossStatus}</Typography></Paper></Grid>
            <Grid item xs={3}><Paper sx={{p:2, bgcolor: '#13151a', border: '1px solid #1e293b'}}><Typography color="#64748b" variant="caption">RSI (14)</Typography><Typography color="#e2e8f0">{tech.rsi?.toFixed(2)}</Typography></Paper></Grid>
            <Grid item xs={3}><Paper sx={{p:2, bgcolor: '#13151a', border: '1px solid #1e293b'}}><Typography color="#64748b" variant="caption">MACD</Typography><Typography color="#e2e8f0">{tech.macd?.toFixed(2)}</Typography></Paper></Grid>
            <Grid item xs={3}><Paper sx={{p:2, bgcolor: '#13151a', border: '1px solid #1e293b'}}><Typography color="#64748b" variant="caption">Imm Support / Resistance</Typography><Typography color="#e2e8f0">{tech.immSupport?.toFixed(2)} / {tech.immResistance?.toFixed(2)}</Typography></Paper></Grid>
         </Grid>
      ) : <Typography sx={{mb: 4, color: '#64748b'}}>No technical data generated.</Typography>}

      {/* Strategy Backtests */}
      <Typography variant="h6" sx={{ color: '#94a3b8', mb: 2, borderBottom: '1px solid #1e293b', pb: 1 }}>Strategy Backtests</Typography>
      {company.backtests && company.backtests.length > 0 ? (
         <Grid container spacing={2} mb={4}>
            {company.backtests.map((b: any, idx: number) => {
               const strategyMap: Record<string, {name: string, desc: string}> = {
                 'A': { 
                   name: 'Post-Earnings Drift (PEAD)', 
                   desc: 'Trades the continued momentum of a stock in the direction of its earnings surprise over a 1-month horizon. \n\nExample: If the stock gaps up > 2% on the earnings day, we buy at the close of the earnings day and hold the position for 20 trading days to capture the delayed institutional buying.' 
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
                   desc: 'A purely anticipatory strategy that trades the implied volatility and speculation ramp-up before the actual earnings announcement. \n\nExample: We buy the stock exactly 10 trading days before the scheduled earnings date, and sell it the day before the announcement to avoid the actual earnings risk.' 
                 },
                 'F': { 
                   name: 'Earnings Trap (Fakeout)', 
                   desc: 'Waits for a false breakdown post-earnings that traps retail bears, then trades aggressively in the opposite direction. \n\nExample: If the stock gaps down > -2% on the open but rallies aggressively to close green on the day, we buy the close and hold for 5 days.' 
                 }
               };
               const meta = strategyMap[b.strategyName] || { name: `Strategy ${b.strategyName}`, desc: 'Quantitative backtest algorithm.' };
               
               return (
                 <Grid item xs={4} key={idx}>
                    <Paper sx={{p:2, bgcolor: '#13151a', border: '1px solid #1e293b'}}>
                       <Box display="flex" alignItems="center" justifyContent="space-between" mb={1}>
                         <Typography color="#7c4dff" variant="subtitle2">{meta.name}</Typography>
                         <Tooltip title={<Typography sx={{ whiteSpace: 'pre-line', fontSize: '0.85rem' }}>{meta.desc}</Typography>} arrow placement="top">
                           <IconButton size="small" sx={{ color: '#64748b' }}>
                             <InfoOutlinedIcon fontSize="small" />
                           </IconButton>
                         </Tooltip>
                       </Box>
                       <Typography color="#64748b" variant="caption">Win Rate: <span style={{color: '#e2e8f0'}}>{(b.winRate || 0).toFixed(1)}%</span></Typography><br/>
                       <Typography color="#64748b" variant="caption">Trades: <span style={{color: '#e2e8f0'}}>{b.totalTrades || 0}</span></Typography>
                    </Paper>
                 </Grid>
               );
            })}
         </Grid>
      ) : <Typography sx={{mb: 4, color: '#64748b'}}>No backtests generated.</Typography>}

      {/* AI SECTIONS */}
      {aiReport ? (
         <Box sx={{
            '& h3': { color: '#94a3b8', mt: 4, mb: 2, borderBottom: '1px solid #1e293b', pb: 1, fontSize: '1.25rem' },
            '& p': { color: '#cbd5e1', lineHeight: 1.7, mb: 2, fontSize: '0.9rem' },
            '& ul': { color: '#cbd5e1', fontSize: '0.9rem', mb: 2, paddingLeft: '20px' },
            '& li': { mb: 1 }
         }}>
            <ReactMarkdown rehypePlugins={[rehypeRaw]}>{aiReport.patternRecognition}</ReactMarkdown>
            <ReactMarkdown rehypePlugins={[rehypeRaw]}>{aiReport.riskAssessment}</ReactMarkdown>
            <ReactMarkdown rehypePlugins={[rehypeRaw]}>{aiReport.probabilityAnalysis}</ReactMarkdown>
            <ReactMarkdown rehypePlugins={[rehypeRaw]}>{aiReport.tradingPlan}</ReactMarkdown>
            <Box sx={{ bgcolor: 'rgba(124, 77, 255, 0.1)', border: '1px solid #7c4dff', p: 3, borderRadius: 2, mt: 4 }}>
               <ReactMarkdown rehypePlugins={[rehypeRaw]}>{aiReport.finalVerdict}</ReactMarkdown>
            </Box>
         </Box>
      ) : (
         <Box sx={{ mt: 5, p: 4, bgcolor: '#13151a', borderRadius: 2, textAlign: 'center', border: '1px dashed #334155' }}>
            <Typography sx={{ color: '#94a3b8' }}>
               No deep research report available. Click the "Generate Deep Research" button to queue the quantitative and AI analysis.
            </Typography>
         </Box>
      )}

    </Box>
  );
};

export default CompanyDetail;
