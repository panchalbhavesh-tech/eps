import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, gql } from '@apollo/client';
import { 
  Box, Typography, Button, Tooltip, Dialog, DialogTitle, 
  DialogContent, DialogActions, TextField, MenuItem as SelectOption, Grid, Chip, 
  Paper, Divider, Alert, Snackbar
} from '@mui/material';
import { DataGrid, GridColDef, GridRenderCellParams } from '@mui/x-data-grid';
import BiotechIcon from '@mui/icons-material/Biotech';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import RefreshIcon from '@mui/icons-material/Refresh';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import ShieldIcon from '@mui/icons-material/Shield';

import { StatusBadge, SearchInput, MobileCardList } from '../components/common';
import type { MobileSortOption } from '../components/common';
import { useIsMobile } from '../hooks/useResponsive';
import { SmartCron } from '../components/common/SmartCron';
import { useThemeMode } from '../theme/ThemeContext';

const GET_RESEARCH_HYPOTHESES = gql`
  query GetResearchHypotheses($stageFilter: String) {
    researchHypotheses(stageFilter: $stageFilter) {
      id
      name
      author
      economicMechanism
      economicRationaleText
      alphaExpression
      targetUniverse
      holdingHorizonDays
      currentStage
      createdAt
      decommissionedAt
      decommissionReason
      experiments {
        id
        executionDate
        totalTrialsInFamily
        classicSharpe
        deflatedSharpe
        spearmanIcMean
        spearmanIcTstat
        isStatisticallyValid
        failureModeTag
      }
    }
  }
`;

const REGISTER_RESEARCH_HYPOTHESIS = gql`
  mutation RegisterResearchHypothesis(
    $name: String!,
    $economicMechanism: String!,
    $economicRationaleText: String!,
    $alphaExpression: String!,
    $author: String,
    $targetUniverse: String,
    $holdingHorizonDays: Int
  ) {
    registerResearchHypothesis(
      name: $name,
      economicMechanism: $economicMechanism,
      economicRationaleText: $economicRationaleText,
      alphaExpression: $alphaExpression,
      author: $author,
      targetUniverse: $targetUniverse,
      holdingHorizonDays: $holdingHorizonDays
    )
  }
`;

const GET_LIVE_SIGNALS = gql`
  query GetLiveSignals {
    latestLiveSignals {
      id
      hypothesisId
      ticker
      tradeDate
      factorScore
      rankPercentile
      direction
    }
  }
`;


interface HypothesisSignal {
  id: string;
  hypothesisId: string;
  ticker: string;
  tradeDate: string;
  factorScore: number;
  rankPercentile: number;
  direction: string;
}

interface HypothesisExperiment {
  id: string;
  executionDate: string;
  totalTrialsInFamily: number;
  classicSharpe?: number;
  deflatedSharpe?: number;
  spearmanIcMean?: number;
  spearmanIcTstat?: number;
  isStatisticallyValid: boolean;
  failureModeTag?: string;
}

interface ResearchHypothesis {
  id: string;
  name: string;
  author: string;
  economicMechanism: string;
  economicRationaleText: string;
  alphaExpression: string;
  targetUniverse: string;
  holdingHorizonDays: number;
  currentStage: string;
  createdAt: string;
  decommissionedAt?: string;
  decommissionReason?: string;
  experiments: HypothesisExperiment[];
}

const HypothesisLaboratory: React.FC = () => {
  const { mode, tokens } = useThemeMode();
  const isMobile = useIsMobile();
  const isDark = mode === 'dark';

  const { loading, data, refetch } = useQuery(GET_RESEARCH_HYPOTHESES, {
    pollInterval: 10000,
    fetchPolicy: 'network-only'
  });

  const [registerHypothesis, { loading: creating }] = useMutation(REGISTER_RESEARCH_HYPOTHESIS, {
    onCompleted: (res) => {
      setSnackbarMsg(res.registerResearchHypothesis || "Hypothesis registered successfully.");
      setSnackbarOpen(true);
      setOpenCreateModal(false);
      refetch();
    },
    onError: (err) => {
      setSnackbarMsg(`Error: ${err.message}`);
      setSnackbarOpen(true);
    }
  });

  
  const { data: signalsData } = useQuery(GET_LIVE_SIGNALS, { pollInterval: 15000, fetchPolicy: 'network-only' });
  const liveSignals: HypothesisSignal[] = signalsData?.latestLiveSignals || [];
  const [openSignalsModal, setOpenSignalsModal] = useState(false);
  const [openCreateModal, setOpenCreateModal] = useState(false);
  const [selectedHypothesis, setSelectedHypothesis] = useState<ResearchHypothesis | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [stageFilter, setStageFilter] = useState('ALL');
  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [snackbarMsg, setSnackbarMsg] = useState('');

  // Form states for new hypothesis
  const [formName, setFormName] = useState('');
  const [formMechanism, setFormMechanism] = useState('MICROSTRUCTURE');
  const [formRationale, setFormRationale] = useState('');
  const [formExpression, setFormExpression] = useState('');
  const [formHorizon, setFormHorizon] = useState('5');

  const hypotheses: ResearchHypothesis[] = data?.researchHypotheses || [];

  // Filtered rows
  const filteredRows = useMemo(() => {
    return hypotheses.filter((h) => {
      const matchesStage = stageFilter === 'ALL' ? true : h.currentStage === stageFilter;
      const q = searchQuery.toLowerCase();
      const matchesSearch = !q || h.name.toLowerCase().includes(q) || h.author.toLowerCase().includes(q) || h.economicMechanism.toLowerCase().includes(q) || h.alphaExpression.toLowerCase().includes(q);
      return matchesStage && matchesSearch;
    });
  }, [hypotheses, stageFilter, searchQuery]);

  // KPIs
  const kpis = useMemo(() => {
    const total = hypotheses.length;
    let totalDsr = 0;
    let dsrCount = 0;
    let activeStream = 0;
    let falseDiscoveriesAvoided = 0;

    hypotheses.forEach((h) => {
      if (['OUT_OF_SAMPLE_SHADOW', 'LIVE_ALPHA_STREAM'].includes(h.currentStage)) {
        activeStream++;
      }
      if (h.currentStage === 'ARCHIVE_FAILED') {
        falseDiscoveriesAvoided++;
      }
      if (h.experiments && h.experiments.length > 0) {
        const lastExp = h.experiments[0];
        if (lastExp && lastExp.deflatedSharpe !== undefined && lastExp.deflatedSharpe !== null) {
          totalDsr += lastExp.deflatedSharpe;
          dsrCount++;
        }
      }
    });

    const avgDsr = dsrCount > 0 ? (totalDsr / dsrCount) : 0.0;
    return { total, avgDsr, activeStream, falseDiscoveriesAvoided };
  }, [hypotheses]);

  const handleSubmitHypothesis = (e: React.FormEvent) => {
    e.preventDefault();
    if (formRationale.trim().length < 20) {
      setSnackbarMsg("Institutional rationale required: Please provide at least 20 characters explaining why this anomaly persists.");
      setSnackbarOpen(true);
      return;
    }
    registerHypothesis({
      variables: {
        name: formName,
        economicMechanism: formMechanism,
        economicRationaleText: formRationale,
        alphaExpression: formExpression,
        author: "HUMAN_QUANT_ANALYST",
        targetUniverse: "NIFTY500",
        holdingHorizonDays: parseInt(formHorizon) || 5
      }
    });
  };

  const stageOptions = [
    { label: 'All Stages', value: 'ALL' },
    { label: 'Drafts', value: 'DRAFT_HYPOTHESIS' },
    { label: 'In-Sample Audit', value: 'IN_SAMPLE_AUDIT' },
    { label: 'Shadow Probation', value: 'OUT_OF_SAMPLE_SHADOW' },
    { label: 'Live Alpha Stream', value: 'LIVE_ALPHA_STREAM' },
    { label: 'Rejected / Decayed Archive', value: 'ARCHIVE_FAILED' }
  ];

  const columns: GridColDef[] = [
    {
      field: 'name',
      headerName: 'Hypothesis Factor & Author',
      flex: 1.6,
      minWidth: 220,
      renderCell: (params: GridRenderCellParams) => {
        const row = params.row as ResearchHypothesis;
        return (
          <Box sx={{ py: 1 }}>
            <Typography sx={{ fontWeight: 600, fontSize: '13px', color: tokens.text.primary, lineHeight: 1.3 }}>
              {row.name}
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.8, mt: 0.4 }}>
              <Chip 
                label={row.author} 
                size="small" 
                sx={{ 
                  height: 18, 
                  fontSize: '10px', 
                  fontWeight: 700, 
                  bgcolor: row.author.includes('AI') ? (isDark ? 'rgba(168, 85, 247, 0.2)' : '#e9d5ff') : (isDark ? 'rgba(59, 130, 246, 0.2)' : '#dbeafe'),
                  color: row.author.includes('AI') ? (isDark ? '#c084fc' : '#7e22ce') : (isDark ? '#60a5fa' : '#1d4ed8'),
                  borderRadius: '4px'
                }} 
              />
              <Typography sx={{ fontSize: '11px', color: tokens.text.tertiary }}>
                {row.targetUniverse} ({row.holdingHorizonDays}d)
              </Typography>
            </Box>
          </Box>
        );
      }
    },
    {
      field: 'economicMechanism',
      headerName: 'A Priori Mechanism',
      flex: 1.1,
      minWidth: 150,
      renderCell: (params: GridRenderCellParams) => {
        const val = String(params.value || '');
        let color = isDark ? '#94a3b8' : '#64748b';
        let bg = isDark ? 'rgba(148, 163, 184, 0.15)' : '#f1f5f9';
        if (val === 'MICROSTRUCTURE') { color = isDark ? '#38bdf8' : '#0284c7'; bg = isDark ? 'rgba(56, 189, 248, 0.15)' : '#e0f2fe'; }
        if (val === 'BEHAVIORAL') { color = isDark ? '#f472b6' : '#db2777'; bg = isDark ? 'rgba(244, 114, 182, 0.15)' : '#fce7f3'; }
        if (val === 'RISK_PREMIUM') { color = isDark ? '#34d399' : '#059669'; bg = isDark ? 'rgba(52, 211, 153, 0.15)' : '#d1fae5'; }
        return (
          <Box sx={{ display: 'flex', alignItems: 'center', height: '100%' }}>
            <Box sx={{ px: 1, py: 0.4, borderRadius: '4px', bgcolor: bg, color: color, fontWeight: 700, fontSize: '11px', border: `1px solid ${color}44` }}>
              {val}
            </Box>
          </Box>
        );
      }
    },
    {
      field: 'alphaExpression',
      headerName: 'Vector Alpha Expression',
      flex: 1.4,
      minWidth: 200,
      renderCell: (params: GridRenderCellParams) => (
        <Box sx={{ display: 'flex', alignItems: 'center', height: '100%' }}>
          <Box sx={{ 
            fontFamily: 'Consolas, monospace', fontSize: '11px', color: isDark ? '#e2e8f0' : '#334155',
            bgcolor: isDark ? '#0f172a' : '#f8fafc', px: 1.2, py: 0.5, borderRadius: '4px', border: `1px solid ${tokens.border.main}`,
            maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
          }}>
            {String(params.value || '')}
          </Box>
        </Box>
      )
    },
    {
      field: 'currentStage',
      headerName: 'FSM Lifecycle Stage',
      flex: 1.2,
      minWidth: 160,
      renderCell: (params: GridRenderCellParams) => {
        const stage = String(params.value || 'DRAFT');
        let badgeType: "SUCCESS" | "FAILURE" | "WARNING" | "NEUTRAL" | "INFO" = "NEUTRAL";
        let label = stage;
        if (stage === 'LIVE_ALPHA_STREAM') { badgeType = 'SUCCESS'; label = 'LIVE ALPHA'; }
        else if (stage === 'OUT_OF_SAMPLE_SHADOW') { badgeType = 'INFO'; label = 'SHADOW PROBATION'; }
        else if (stage === 'ARCHIVE_FAILED' || stage === 'ALPHA_DECAY_ARCHIVE') { badgeType = 'FAILURE'; label = stage === 'ARCHIVE_FAILED' ? 'REJECTED (P-HACK PROTECT)' : 'DECAY RETIRED'; }
        else if (stage === 'IN_SAMPLE_AUDIT') { badgeType = 'WARNING'; label = 'STATISTICAL AUDIT'; }
        return (
          <Box sx={{ display: 'flex', alignItems: 'center', height: '100%' }}>
            <StatusBadge status={badgeType} label={label} size="small" />
          </Box>
        );
      }
    },
    {
      field: 'deflatedSharpe',
      headerName: 'Deflated Sharpe (DSR)',
      width: 150,
      renderCell: (params: GridRenderCellParams) => {
        const row = params.row as ResearchHypothesis;
        const exps = row.experiments;
        if (!exps || exps.length === 0) {
          return <Typography sx={{ color: tokens.text.tertiary, fontSize: '12px', fontStyle: 'italic' }}>Pending Audit...</Typography>;
        }
        const last = exps[0];
        const dsr = last.deflatedSharpe ?? 0;
        const passed = dsr >= 0.85;
        return (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.8, height: '100%' }}>
            <Typography sx={{ fontWeight: 700, fontSize: '13px', color: passed ? (isDark ? '#4ade80' : '#16a34a') : (isDark ? '#f87171' : '#dc2626') }}>
              {dsr.toFixed(4)}
            </Typography>
            <Tooltip title={`Classic Sharpe: ${last.classicSharpe?.toFixed(2) ?? '0.00'} | Family Trials (N): ${last.totalTrialsInFamily} | Threshold: >= 0.85`}>
              {passed ? <CheckCircleIcon sx={{ fontSize: 16, color: '#22c55e' }} /> : <ErrorOutlineIcon sx={{ fontSize: 16, color: '#ef4444' }} />}
            </Tooltip>
          </Box>
        );
      }
    },
    {
      field: 'spearmanIcMean',
      headerName: 'Spearman IC (t-stat)',
      width: 150,
      renderCell: (params: GridRenderCellParams) => {
        const row = params.row as ResearchHypothesis;
        const exps = row.experiments;
        if (!exps || exps.length === 0 || exps[0].spearmanIcMean === undefined) {
          return <Typography sx={{ color: tokens.text.tertiary, fontSize: '12px' }}>—</Typography>;
        }
        const ic = exps[0].spearmanIcMean ?? 0;
        const tstat = exps[0].spearmanIcTstat ?? 0;
        const significant = Math.abs(tstat) >= 1.96;
        return (
          <Box sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', height: '100%' }}>
            <Typography sx={{ fontSize: '13px', fontWeight: 600, color: tokens.text.primary }}>
              {ic > 0 ? `+${ic.toFixed(4)}` : ic.toFixed(4)}
            </Typography>
            <Typography sx={{ fontSize: '10px', color: significant ? tokens.text.secondary : (isDark ? '#f87171' : '#dc2626') }}>
              t = {tstat.toFixed(2)} {significant ? '✓' : '(insig)'}
            </Typography>
          </Box>
        );
      }
    },
    {
      field: 'actions',
      headerName: 'Rationale & Audit',
      width: 140,
      sortable: false,
      renderCell: (params: GridRenderCellParams) => {
        const row = params.row as ResearchHypothesis;
        return (
          <Box sx={{ display: 'flex', alignItems: 'center', height: '100%' }}>
            <Button
              size="small"
              variant="outlined"
              onClick={() => setSelectedHypothesis(row)}
              sx={{
                fontSize: '11px',
                textTransform: 'none',
                borderColor: tokens.border.main,
                color: tokens.text.primary,
                '&:hover': { bgcolor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)', borderColor: tokens.text.secondary }
              }}
            >
              Deep Inspect
            </Button>
          </Box>
        );
      }
    }
  ];

  // ── Phone card: factor & author → mechanism + lifecycle stage → DSR & IC → expression; tap = Deep Inspect ──
  const stageBadge = (stage: string) => {
    let badgeType: "SUCCESS" | "FAILURE" | "WARNING" | "NEUTRAL" | "INFO" = "NEUTRAL";
    let label = stage;
    if (stage === 'LIVE_ALPHA_STREAM') { badgeType = 'SUCCESS'; label = 'LIVE ALPHA'; }
    else if (stage === 'OUT_OF_SAMPLE_SHADOW') { badgeType = 'INFO'; label = 'SHADOW PROBATION'; }
    else if (stage === 'ARCHIVE_FAILED' || stage === 'ALPHA_DECAY_ARCHIVE') { badgeType = 'FAILURE'; label = stage === 'ARCHIVE_FAILED' ? 'REJECTED' : 'DECAY RETIRED'; }
    else if (stage === 'IN_SAMPLE_AUDIT') { badgeType = 'WARNING'; label = 'STATISTICAL AUDIT'; }
    return <StatusBadge status={badgeType} label={label} size="small" />;
  };
  const mobileSortOptions: MobileSortOption[] = [
    { key: 'dsr', label: 'Deflated Sharpe', get: (r) => r.experiments?.[0]?.deflatedSharpe },
    { key: 'ic', label: 'Spearman IC', get: (r) => r.experiments?.[0]?.spearmanIcMean },
    { key: 'name', label: 'Name (A–Z)', desc: false, get: (r) => r.name },
  ];
  const renderHypothesisCard = (row: any) => {
    const last = row.experiments?.[0];
    const dsr = last?.deflatedSharpe;
    const ic = last?.spearmanIcMean, t = last?.spearmanIcTstat ?? 0;
    const good = isDark ? '#4ade80' : '#16a34a', bad = isDark ? '#f87171' : '#dc2626';
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
        <Typography sx={{ fontWeight: 700, fontSize: '14px', color: tokens.text.primary, lineHeight: '19px' }}>{row.name}</Typography>
        <Typography sx={{ fontSize: '12px', color: tokens.text.secondary }}>{row.author} · {row.targetUniverse} ({row.holdingHorizonDays}d) · {row.economicMechanism}</Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
          {stageBadge(String(row.currentStage || 'DRAFT'))}
          {last ? (
            <Typography sx={{ fontSize: '12px', color: tokens.text.secondary }}>
              DSR <b style={{ color: (dsr ?? 0) >= 0.85 ? good : bad }}>{(dsr ?? 0).toFixed(3)}</b>
              {ic !== undefined && <> · IC <b style={{ color: tokens.text.primary }}>{ic > 0 ? '+' : ''}{Number(ic).toFixed(3)}</b> <span style={{ color: Math.abs(t) >= 1.96 ? tokens.text.secondary : bad }}>(t {t.toFixed(1)})</span></>}
            </Typography>
          ) : <Typography sx={{ fontSize: '12px', color: tokens.text.tertiary, fontStyle: 'italic' }}>Pending audit</Typography>}
        </Box>
        <Box sx={{ fontFamily: 'Consolas, monospace', fontSize: '12px', color: isDark ? '#e2e8f0' : '#334155', bgcolor: isDark ? '#0f172a' : '#f8fafc',
          px: 1, py: 0.5, borderRadius: '4px', border: `1px solid ${tokens.border.main}`, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {String(row.alphaExpression || '')}
        </Box>
      </Box>
    );
  };

  return (
    <Box sx={{ p: { xs: 1.5, md: 3 }, maxWidth: 1600, mx: 'auto', display: 'flex', flexDirection: 'column', gap: { xs: 2, md: 3 } }}>
      {/* Top Header Banner */}
      <Box sx={{ 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'space-between', 
        flexWrap: 'wrap', 
        gap: 2,
        p: { xs: 1.5, md: 2.5 }, 
        borderRadius: 3, 
        background: isDark ? 'linear-gradient(135deg, rgba(15, 23, 42, 0.9) 0%, rgba(30, 41, 59, 0.8) 100%)' : 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)',
        border: `1px solid ${tokens.border.main}`,
        boxShadow: tokens.shadows.card
      }}>
        <Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Box sx={{ p: 1, borderRadius: 2, bgcolor: isDark ? 'rgba(99, 102, 241, 0.2)' : '#e0e7ff', color: isDark ? '#818cf8' : '#4f46e5', display: 'flex' }}>
              <BiotechIcon sx={{ fontSize: 26 }} />
            </Box>
            <Box>
              <Typography variant="h5" sx={{ fontWeight: 800, color: tokens.text.primary, letterSpacing: '-0.02em', fontSize: { xs: '17px', md: undefined } }}>
                Quantitative Hypothesis Laboratory (QHLM)
              </Typography>
              <Typography variant="caption" sx={{ display: { xs: 'none', sm: 'block' }, color: tokens.text.secondary, fontSize: '12px' }}>
                Bailey & Lopez de Prado Deflated Sharpe Verification • Multiple Testing Variance Shield
              </Typography>
            </Box>
          </Box>
        </Box>
        
        <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: 1, md: 1.5 }, flexWrap: { xs: 'wrap', md: 'nowrap' }, width: { xs: '100%', md: 'auto' } }}>
          <Button
            variant="outlined"
            onClick={() => refetch()}
            aria-label="Refresh lab"
            startIcon={<RefreshIcon />}
            sx={{ textTransform: 'none', borderColor: tokens.border.main, color: tokens.text.primary, height: 40, minWidth: { xs: 44, md: 64 }, '& .MuiButton-startIcon': { mr: { xs: 0, md: 1 } } }}
          >
            {isMobile ? '' : 'Refresh Lab'}
          </Button>
          <SmartCron page="hypothesis" />
          
          <Button
            variant="contained"
            onClick={() => setOpenSignalsModal(true)}
            sx={{ 
              textTransform: 'none', 
              background: isDark ? '#047857' : '#059669',
              color: '#ffffff', 
              fontWeight: 700,
              height: 40,
              flex: { xs: '1 1 40%', md: 'none' },
              '&:hover': { background: isDark ? '#065f46' : '#047857' }
            }}
          >
            Live Signals ({liveSignals.length})
          </Button>
          <Button
            variant="contained"
            onClick={() => setOpenCreateModal(true)}
            startIcon={<AddCircleOutlineIcon />}
            sx={{ 
              textTransform: 'none', 
              background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
              color: '#ffffff', 
              fontWeight: 700,
              height: 40,
              flex: { xs: '1 1 40%', md: 'none' },
              boxShadow: '0 4px 12px rgba(99, 102, 241, 0.3)',
              '&:hover': { background: 'linear-gradient(135deg, #4f46e5 0%, #4338ca 100%)' }
            }}
          >
            {isMobile ? 'New Alpha' : 'Formulate Candidate Alpha'}
          </Button>
        </Box>
      </Box>

      {/* Executive Quant KPI Cards */}
      <Grid container spacing={{ xs: 1.25, md: 2.5 }}>
        <Grid item xs={6} sm={6} md={3}>
          <Paper sx={{ 
            p: { xs: 1.5, md: 2.5 }, borderRadius: 3, border: `1px solid ${tokens.border.main}`, 
            bgcolor: tokens.background.card, boxShadow: tokens.shadows.card,
            position: 'relative', overflow: 'hidden', transition: 'transform 0.2s', '&:hover': { transform: 'translateY(-2px)' }
          }}>
            <Typography sx={{ fontSize: { xs: '11px', md: '12px' }, fontWeight: 600, color: tokens.text.secondary, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Total Research Hypotheses
            </Typography>
            <Typography sx={{ fontSize: { xs: '22px', md: '28px' }, fontWeight: 800, color: tokens.text.primary, mt: 1 }}>
              {kpis.total}
            </Typography>
            <Typography sx={{ fontSize: '11px', color: tokens.text.tertiary, mt: 0.5 }}>
              Tracked across 5 FSM stages
            </Typography>
          </Paper>
        </Grid>

        <Grid item xs={6} sm={6} md={3}>
          <Paper sx={{ 
            p: { xs: 1.5, md: 2.5 }, borderRadius: 3, border: `1px solid ${tokens.border.main}`, 
            bgcolor: tokens.background.card, boxShadow: tokens.shadows.card,
            position: 'relative', overflow: 'hidden', transition: 'transform 0.2s', '&:hover': { transform: 'translateY(-2px)' }
          }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Typography sx={{ fontSize: { xs: '11px', md: '12px' }, fontWeight: 600, color: tokens.text.secondary, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Mean Deflated Sharpe (DSR)
              </Typography>
              <Tooltip title="DSR measures probability that expected Sharpe ratio exceeds zero after penalizing for family trial variance and non-normal kurtosis.">
                <InfoOutlinedIcon sx={{ fontSize: 16, color: tokens.text.tertiary }} />
              </Tooltip>
            </Box>
            <Typography sx={{ fontSize: { xs: '22px', md: '28px' }, fontWeight: 800, color: kpis.avgDsr >= 0.85 ? (isDark ? '#4ade80' : '#16a34a') : (isDark ? '#e879f9' : '#a21caf'), mt: 1 }}>
              {kpis.avgDsr.toFixed(4)}
            </Typography>
            <Typography sx={{ fontSize: '11px', color: tokens.text.tertiary, mt: 0.5 }}>
              Institutional confidence barrier: 0.8500
            </Typography>
          </Paper>
        </Grid>

        <Grid item xs={6} sm={6} md={3}>
          <Paper sx={{ 
            p: { xs: 1.5, md: 2.5 }, borderRadius: 3, border: `1px solid ${tokens.border.main}`, 
            bgcolor: tokens.background.card, boxShadow: tokens.shadows.card,
            position: 'relative', overflow: 'hidden', transition: 'transform 0.2s', '&:hover': { transform: 'translateY(-2px)' }
          }}>
            <Typography sx={{ fontSize: { xs: '11px', md: '12px' }, fontWeight: 600, color: tokens.text.secondary, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Live & Shadow Alpha Streams
            </Typography>
            <Typography sx={{ fontSize: { xs: '22px', md: '28px' }, fontWeight: 800, color: isDark ? '#38bdf8' : '#0284c7', mt: 1 }}>
              {kpis.activeStream}
            </Typography>
            <Typography sx={{ fontSize: '11px', color: tokens.text.tertiary, mt: 0.5 }}>
              Approved out-of-sample forward signals
            </Typography>
          </Paper>
        </Grid>

        <Grid item xs={6} sm={6} md={3}>
          <Paper sx={{ 
            p: { xs: 1.5, md: 2.5 }, borderRadius: 3, border: `1px solid ${isDark ? 'rgba(248, 113, 113, 0.3)' : '#fca5a5'}`, 
            bgcolor: isDark ? 'rgba(239, 68, 68, 0.04)' : '#fef2f2', boxShadow: tokens.shadows.card,
            position: 'relative', overflow: 'hidden', transition: 'transform 0.2s', '&:hover': { transform: 'translateY(-2px)' }
          }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Typography sx={{ fontSize: '12px', fontWeight: 600, color: isDark ? '#f87171' : '#dc2626', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                False Discoveries Avoided
              </Typography>
              <ShieldIcon sx={{ fontSize: 18, color: isDark ? '#f87171' : '#dc2626' }} />
            </Box>
            <Typography sx={{ fontSize: { xs: '22px', md: '28px' }, fontWeight: 800, color: isDark ? '#f87171' : '#dc2626', mt: 1 }}>
              {kpis.falseDiscoveriesAvoided}
            </Typography>
            <Typography sx={{ fontSize: '11px', color: isDark ? '#fca5a5' : '#b91c1c', mt: 0.5 }}>
              P-Hacked factors blocked from trading
            </Typography>
          </Paper>
        </Grid>
      </Grid>

      {/* Filter and Search Section */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 2 }}>
        <Box sx={{ display: 'flex', gap: 1, flexWrap: { xs: 'nowrap', sm: 'wrap' }, overflowX: { xs: 'auto', sm: 'visible' }, maxWidth: '100%',
          scrollbarWidth: 'none', '&::-webkit-scrollbar': { display: 'none' } }}>
          {stageOptions.map((opt) => (
            <Chip
              key={opt.value}
              label={opt.label}
              onClick={() => setStageFilter(opt.value)}
              sx={{
                height: 32,
                flexShrink: 0,
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
                bgcolor: stageFilter === opt.value ? (isDark ? '#3b82f6' : '#2563eb') : (isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.06)'),
                color: stageFilter === opt.value ? '#ffffff' : tokens.text.secondary,
                border: `1px solid ${stageFilter === opt.value ? 'transparent' : tokens.border.main}`,
                '&:hover': { bgcolor: stageFilter === opt.value ? (isDark ? '#2563eb' : '#1d4ed8') : (isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)') }
              }}
            />
          ))}
        </Box>
        <Box sx={{ width: { xs: '100%', md: 320 } }}>
          <SearchInput 
            value={searchQuery} 
            onChange={(val) => setSearchQuery(val)} 
            placeholder="Search by factor name, author, equation..." 
          />
        </Box>
      </Box>

      {/* Main Table View */}
      <Paper sx={{ 
        height: { xs: 'auto', sm: 620 }, width: '100%', borderRadius: 3, border: `1px solid ${tokens.border.main}`, 
        bgcolor: tokens.background.card, overflow: 'hidden', boxShadow: tokens.shadows.card
      }}>
        {isMobile ? (
          <MobileCardList rows={filteredRows} renderCard={renderHypothesisCard} sortOptions={mobileSortOptions} loading={loading}
            emptyText="No hypotheses in this stage." onRowClick={(p: any) => setSelectedHypothesis(p.row)} />
        ) : (
        <DataGrid
          rows={filteredRows}
          columns={columns}
          loading={loading}
          rowHeight={64}
          disableRowSelectionOnClick
          sx={{
            border: 0,
            color: tokens.text.primary,
            fontFamily: tokens.typography.fontFamily,
            '& .MuiDataGrid-columnHeaders': {
              bgcolor: tokens.background.header,
              borderBottom: `1px solid ${tokens.border.main}`,
              fontWeight: 700,
              fontSize: '12px',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              color: tokens.text.secondary
            },
            '& .MuiDataGrid-cell': {
              borderBottom: `1px solid ${tokens.border.main}`,
              fontSize: '13px'
            },
            '& .MuiDataGrid-row:hover': {
              bgcolor: isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)'
            },
            '& .MuiDataGrid-footerContainer': {
              borderTop: `1px solid ${tokens.border.main}`,
              bgcolor: tokens.background.header,
              color: tokens.text.secondary
            }
          }}
        />
        )}
      </Paper>

      {/* Live Signals Modal */}
      <Dialog open={openSignalsModal} onClose={() => setOpenSignalsModal(false)} maxWidth="lg" fullWidth fullScreen={isMobile} PaperProps={{
        sx: { bgcolor: tokens.background.paper, border: `1px solid ${tokens.border.main}`, borderRadius: 3, height: '80vh' }
      }}>
        <DialogTitle sx={{ fontWeight: 800, fontSize: '18px', color: tokens.text.primary, borderBottom: `1px solid ${tokens.border.main}` }}>
          Live Alpha Stream Signals
        </DialogTitle>
        <DialogContent sx={{ p: 0 }}>
          {isMobile ? (
            <MobileCardList rows={liveSignals} emptyText="No live signals."
              sortOptions={[{ key: 'rank', label: 'Rank', get: (r) => r.rankPercentile }, { key: 'date', label: 'Newest', get: (r) => new Date(r.tradeDate).getTime() }]}
              renderCard={(r: any) => (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography sx={{ fontSize: '14px', fontWeight: 700, color: tokens.text.primary }}>{r.ticker}</Typography>
                    <Typography sx={{ fontSize: '12px', color: tokens.text.secondary }}>
                      Rank {r.rankPercentile?.toFixed(3)} · score {r.factorScore?.toFixed(4)} · {new Date(r.tradeDate).toLocaleDateString()}
                    </Typography>
                  </Box>
                  <Chip size="small" label={r.direction} sx={{ bgcolor: r.direction === 'LONG' ? '#22c55e' : '#ef4444', color: '#fff', fontWeight: 'bold' }} />
                </Box>
              )} />
          ) : (
          <DataGrid
            rows={liveSignals}
            columns={[
              { field: 'ticker', headerName: 'Ticker', width: 120 },
              { field: 'direction', headerName: 'Direction', width: 120, renderCell: (params) => (
                <Chip size="small" label={params.value} sx={{ bgcolor: params.value === 'LONG' ? '#22c55e' : '#ef4444', color: '#fff', fontWeight: 'bold' }} />
              )},
              { field: 'rankPercentile', headerName: 'Rank', width: 120, valueFormatter: (params: any) => params.value?.toFixed(3) },
              { field: 'factorScore', headerName: 'Factor Score', width: 150, valueFormatter: (params: any) => params.value?.toFixed(4) },
              { field: 'tradeDate', headerName: 'Trade Date', width: 200, valueFormatter: (params: any) => new Date(params.value).toLocaleDateString() },
              { field: 'hypothesisId', headerName: 'Hypothesis ID', width: 300 }
            ]}
            rowHeight={48}
            disableRowSelectionOnClick
            sx={{ border: 0, color: tokens.text.primary }}
          />
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2, borderTop: `1px solid ${tokens.border.main}` }}>
          <Button onClick={() => setOpenSignalsModal(false)} variant="contained" sx={{ textTransform: 'none' }}>
            Close
          </Button>
        </DialogActions>
      </Dialog>

      {/* Create New Hypothesis Modal */}
      <Dialog open={openCreateModal} onClose={() => setOpenCreateModal(false)} maxWidth="md" fullWidth fullScreen={isMobile} PaperProps={{
        sx: { bgcolor: tokens.background.paper, border: `1px solid ${tokens.border.main}`, borderRadius: 3 }
      }}>
        <DialogTitle sx={{ fontWeight: 800, fontSize: '18px', color: tokens.text.primary, borderBottom: `1px solid ${tokens.border.main}` }}>
          Formulate A Priori Candidate Alpha
        </DialogTitle>
        <form onSubmit={handleSubmitHypothesis}>
          <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, py: 3 }}>
            <Alert severity="info" sx={{ fontSize: '12px', borderRadius: 2, bgcolor: isDark ? 'rgba(59, 130, 246, 0.1)' : '#eff6ff', color: isDark ? '#93c5fd' : '#1e40af', border: `1px solid ${isDark ? 'rgba(59, 130, 246, 0.3)' : '#bfdbfe'}` }}>
              <b>Scientific Mandate:</b> To guard against data dredging, every proposed quantitative hypothesis must be justified by an explicit institutional economic mechanism prior to running empirical returns backtesting.
            </Alert>

            <Grid container spacing={2}>
              <Grid item xs={12} sm={8}>
                <TextField
                  label="Candidate Alpha Name"
                  placeholder="e.g., Order Book Liquidity Absorption Differential V1"
                  fullWidth
                  required
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  InputProps={{ sx: { bgcolor: tokens.background.default, borderRadius: 2 } }}
                />
              </Grid>
              <Grid item xs={12} sm={4}>
                <TextField
                  label="A Priori Mechanism"
                  select
                  fullWidth
                  required
                  value={formMechanism}
                  onChange={(e) => setFormMechanism(e.target.value)}
                  InputProps={{ sx: { bgcolor: tokens.background.default, borderRadius: 2 } }}
                >
                  <SelectOption value="MICROSTRUCTURE">Microstructure Friction</SelectOption>
                  <SelectOption value="BEHAVIORAL">Behavioral Over/Underreaction</SelectOption>
                  <SelectOption value="RISK_PREMIUM">Systematic Risk Premium</SelectOption>
                </TextField>
              </Grid>
            </Grid>

            <TextField
              label="Vector Alpha Formula Expression"
              placeholder="e.g., rank(volume_5d) / (volatility_20d + 0.0001)"
              helperText="Supported token vector variables: close, volume, high, low, volatility_20d, volume_5d, delta, rank"
              fullWidth
              required
              value={formExpression}
              onChange={(e) => setFormExpression(e.target.value)}
              InputProps={{ sx: { fontFamily: 'Consolas, monospace', bgcolor: tokens.background.default, borderRadius: 2 } }}
            />

            <TextField
              label="Institutional Economic Rationale Text (Min 20 chars)"
              placeholder="Explain why this mispricing occurs in the Indian equity markets and why quantitative hedge funds or market makers haven't instantaneously arbitraged it away..."
              multiline
              rows={4}
              required
              value={formRationale}
              onChange={(e) => setFormRationale(e.target.value)}
              InputProps={{ sx: { bgcolor: tokens.background.default, borderRadius: 2 } }}
            />

            <TextField
              label="Holding Horizon (Days)"
              type="number"
              fullWidth
              value={formHorizon}
              onChange={(e) => setFormHorizon(e.target.value)}
              InputProps={{ sx: { bgcolor: tokens.background.default, borderRadius: 2 } }}
            />
          </DialogContent>
          <DialogActions sx={{ px: 3, py: 2, borderTop: `1px solid ${tokens.border.main}` }}>
            <Button onClick={() => setOpenCreateModal(false)} sx={{ textTransform: 'none', color: tokens.text.secondary }}>
              Cancel
            </Button>
            <Button type="submit" variant="contained" disabled={creating} sx={{ 
              textTransform: 'none', fontWeight: 700, px: 3,
              background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)', color: '#fff' 
            }}>
              {creating ? "Submitting to Audit Queue..." : "Submit to Deflated Sharpe Engine"}
            </Button>
          </DialogActions>
        </form>
      </Dialog>

      {/* Hypothesis Deep Inspect Drawer / Dialog */}
      <Dialog open={!!selectedHypothesis} onClose={() => setSelectedHypothesis(null)} maxWidth="md" fullWidth fullScreen={isMobile} PaperProps={{
        sx: { bgcolor: tokens.background.paper, border: `1px solid ${tokens.border.main}`, borderRadius: 3 }
      }}>
        {selectedHypothesis && (
          <>
            <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: `1px solid ${tokens.border.main}`, pb: 2 }}>
              <Box>
                <Typography sx={{ fontWeight: 800, fontSize: '18px', color: tokens.text.primary }}>
                  {selectedHypothesis.name}
                </Typography>
                <Typography sx={{ fontSize: '12px', color: tokens.text.secondary }}>
                  Created by {selectedHypothesis.author} on {selectedHypothesis.createdAt ? new Date(selectedHypothesis.createdAt).toLocaleString() : 'N/A'}
                </Typography>
              </Box>
              <StatusBadge status={selectedHypothesis.currentStage === 'LIVE_ALPHA_STREAM' ? 'SUCCESS' : selectedHypothesis.currentStage === 'ARCHIVE_FAILED' ? 'FAILURE' : 'NEUTRAL'} label={selectedHypothesis.currentStage} />
            </DialogTitle>
            <DialogContent sx={{ py: 3, display: 'flex', flexDirection: 'column', gap: 3 }}>
              <Box>
                <Typography sx={{ fontSize: '11px', fontWeight: 700, color: tokens.text.secondary, textTransform: 'uppercase', letterSpacing: '0.5px', mb: 0.5 }}>
                  A Priori Economic Rationale ({selectedHypothesis.economicMechanism})
                </Typography>
                <Paper sx={{ p: 2, bgcolor: isDark ? 'rgba(255,255,255,0.02)' : '#f8fafc', borderRadius: 2, border: `1px solid ${tokens.border.main}` }}>
                  <Typography sx={{ fontSize: '13px', lineHeight: 1.6, color: tokens.text.primary }}>
                    {selectedHypothesis.economicRationaleText}
                  </Typography>
                </Paper>
              </Box>

              <Box>
                <Typography sx={{ fontSize: '11px', fontWeight: 700, color: tokens.text.secondary, textTransform: 'uppercase', letterSpacing: '0.5px', mb: 0.5 }}>
                  Vector Alpha Expression & Target Parameter
                </Typography>
                <Paper sx={{ p: 2, bgcolor: isDark ? '#0f172a' : '#f1f5f9', borderRadius: 2, border: `1px solid ${tokens.border.main}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Typography sx={{ fontFamily: 'Consolas, monospace', fontSize: '14px', fontWeight: 700, color: isDark ? '#38bdf8' : '#0284c7' }}>
                    {selectedHypothesis.alphaExpression}
                  </Typography>
                  <Chip label={`Universe: ${selectedHypothesis.targetUniverse} | Horizon: ${selectedHypothesis.holdingHorizonDays}d`} size="small" sx={{ fontSize: '11px', bgcolor: 'transparent', border: `1px solid ${tokens.border.main}`, color: tokens.text.secondary }} />
                </Paper>
              </Box>

              <Divider sx={{ borderColor: tokens.border.main }} />

              <Box>
                <Typography sx={{ fontSize: '13px', fontWeight: 700, color: tokens.text.primary, mb: 1 }}>
                  Empirical Verification & Deflated Sharpe Audit History
                </Typography>
                {selectedHypothesis.experiments && selectedHypothesis.experiments.length > 0 ? (
                  <Grid container spacing={2}>
                    {selectedHypothesis.experiments.map((ex, i) => (
                      <Grid item xs={12} key={ex.id || i}>
                        <Paper sx={{ p: 2, borderRadius: 2, border: `1px solid ${ex.isStatisticallyValid ? (isDark ? 'rgba(74, 222, 128, 0.3)' : '#bbf7d0') : (isDark ? 'rgba(248, 113, 113, 0.3)' : '#fecaca')}`, bgcolor: ex.isStatisticallyValid ? (isDark ? 'rgba(74, 222, 128, 0.03)' : '#f0fdf4') : (isDark ? 'rgba(239, 68, 68, 0.03)' : '#fef2f2') }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
                            <Typography sx={{ fontSize: '12px', fontWeight: 700, color: tokens.text.secondary }}>
                              Experiment Trial Run #{i + 1} • {ex.executionDate ? new Date(ex.executionDate).toLocaleDateString() : ''}
                            </Typography>
                            <Chip label={ex.isStatisticallyValid ? "STATISTICAL PASS" : `REJECTED: ${ex.failureModeTag}`} size="small" sx={{ fontWeight: 700, fontSize: '10px', bgcolor: ex.isStatisticallyValid ? '#22c55e' : '#ef4444', color: '#fff' }} />
                          </Box>
                          <Grid container spacing={2}>
                            <Grid item xs={6} sm={3}>
                              <Typography sx={{ fontSize: '11px', color: tokens.text.tertiary }}>Classic Sharpe</Typography>
                              <Typography sx={{ fontSize: '16px', fontWeight: 700, color: tokens.text.primary }}>{ex.classicSharpe?.toFixed(2) ?? 'N/A'}</Typography>
                            </Grid>
                            <Grid item xs={6} sm={3}>
                              <Typography sx={{ fontSize: '11px', color: tokens.text.tertiary }}>Deflated Sharpe (DSR)</Typography>
                              <Typography sx={{ fontSize: '16px', fontWeight: 800, color: ex.deflatedSharpe && ex.deflatedSharpe >= 0.85 ? '#22c55e' : '#ef4444' }}>{ex.deflatedSharpe?.toFixed(4) ?? 'N/A'}</Typography>
                            </Grid>
                            <Grid item xs={6} sm={3}>
                              <Typography sx={{ fontSize: '11px', color: tokens.text.tertiary }}>Spearman IC Mean</Typography>
                              <Typography sx={{ fontSize: '16px', fontWeight: 700, color: tokens.text.primary }}>{ex.spearmanIcMean?.toFixed(4) ?? 'N/A'}</Typography>
                            </Grid>
                            <Grid item xs={6} sm={3}>
                              <Typography sx={{ fontSize: '11px', color: tokens.text.tertiary }}>IC Student t-stat</Typography>
                              <Typography sx={{ fontSize: '16px', fontWeight: 700, color: ex.spearmanIcTstat && Math.abs(ex.spearmanIcTstat) >= 1.96 ? tokens.text.primary : '#ef4444' }}>{ex.spearmanIcTstat?.toFixed(2) ?? 'N/A'}</Typography>
                            </Grid>
                          </Grid>
                        </Paper>
                      </Grid>
                    ))}
                  </Grid>
                ) : (
                  <Alert severity="warning" sx={{ fontSize: '12px', borderRadius: 2 }}>
                    No experimental walk-forward runs completed yet. Celery worker is scheduled to evaluate this candidate overnight.
                  </Alert>
                )}
              </Box>
            </DialogContent>
            <DialogActions sx={{ px: 3, py: 2, borderTop: `1px solid ${tokens.border.main}` }}>
              <Button onClick={() => setSelectedHypothesis(null)} variant="contained" sx={{ textTransform: 'none', px: 3 }}>
                Close Inspector
              </Button>
            </DialogActions>
          </>
        )}
      </Dialog>

      <Snackbar open={snackbarOpen} autoHideDuration={5000} onClose={() => setSnackbarOpen(false)} anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}>
        <Alert onClose={() => setSnackbarOpen(false)} severity="info" sx={{ width: '100%', fontWeight: 600, boxShadow: tokens.shadows.card }}>
          {snackbarMsg}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default HypothesisLaboratory;
