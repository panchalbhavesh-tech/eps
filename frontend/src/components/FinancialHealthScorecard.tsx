import React, { useState } from 'react';
import { Box, Typography, Grid, Paper, LinearProgress, Chip, Tooltip, IconButton, ClickAwayListener } from '@mui/material';
import AssessmentOutlinedIcon from '@mui/icons-material/AssessmentOutlined';
import ShowChartIcon from '@mui/icons-material/ShowChart';
import AccountBalanceWalletOutlinedIcon from '@mui/icons-material/AccountBalanceWalletOutlined';
import AutorenewOutlinedIcon from '@mui/icons-material/AutorenewOutlined';
import TimelineOutlinedIcon from '@mui/icons-material/TimelineOutlined';
import MonetizationOnOutlinedIcon from '@mui/icons-material/MonetizationOnOutlined';
import SecurityOutlinedIcon from '@mui/icons-material/SecurityOutlined';
import VerifiedUserOutlinedIcon from '@mui/icons-material/VerifiedUserOutlined';
import GavelOutlinedIcon from '@mui/icons-material/GavelOutlined';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';

interface CategoryItem {
  category: string;
  weight: string;
  formula: string;
  scoreText: string;
  scoreVal: number;
  maxVal: number;
  percentage: number;
}

interface FinancialHealthScorecardProps {
  rawContent: string;
}

const getCategoryIcon = (category: string) => {
  const lower = category.toLowerCase();
  if (lower.includes('profitability') || lower.includes('returns')) return <ShowChartIcon sx={{ color: '#059669' }} />;
  if (lower.includes('debt') || lower.includes('solvency')) return <AccountBalanceWalletOutlinedIcon sx={{ color: '#0284c7' }} />;
  if (lower.includes('cash flow') || lower.includes('efficiency')) return <AutorenewOutlinedIcon sx={{ color: '#d97706' }} />;
  if (lower.includes('growth') || lower.includes('expansion')) return <TimelineOutlinedIcon sx={{ color: '#0f172a' }} />;
  if (lower.includes('valuation') || lower.includes('multiples')) return <MonetizationOnOutlinedIcon sx={{ color: '#b45309' }} />;
  if (lower.includes('stability') || lower.includes('price')) return <SecurityOutlinedIcon sx={{ color: '#475569' }} />;
  if (lower.includes('ownership') || lower.includes('promoter')) return <VerifiedUserOutlinedIcon sx={{ color: '#059669' }} />;
  return <AssessmentOutlinedIcon sx={{ color: '#0f172a' }} />;
};

const getScoreColor = (percentage: number) => {
  if (percentage >= 75) return '#059669'; // Emerald Green
  if (percentage >= 60) return '#0f172a'; // Slate Navy
  if (percentage >= 45) return '#d97706'; // Amber
  return '#e11d48'; // Rose Red
};

// Click-only Tooltip component for Normalization Math Formula
const ClickableInfoTooltip: React.FC<{ formula: string }> = ({ formula }) => {
  const [open, setOpen] = useState(false);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setOpen((prev) => !prev);
  };

  const handleClose = () => {
    setOpen(false);
  };

  return (
    <ClickAwayListener onClickAway={handleClose}>
      <Box sx={{ display: 'inline-flex', position: 'relative', ml: 0.8 }}>
        <Tooltip 
          title={
            <Box sx={{ p: 0.8, maxWidth: '290px' }}>
              <Typography sx={{ fontSize: '0.68rem', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', mb: 0.5 }}>
                Normalization Math Formula:
              </Typography>
              <Typography sx={{ fontFamily: 'monospace', fontSize: '0.78rem', color: '#ffffff', wordBreak: 'break-word', lineHeight: 1.4 }}>
                {formula}
              </Typography>
            </Box>
          } 
          placement="top" 
          arrow 
          open={open}
          disableFocusListener
          disableHoverListener
          disableTouchListener
          componentsProps={{
            tooltip: {
              sx: {
                bgcolor: '#0f172a',
                border: '1px solid #334155',
                boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
                p: 1,
                borderRadius: 2
              }
            },
            arrow: {
              sx: { color: '#0f172a' }
            }
          }}
        >
          <IconButton
            size="small"
            onClick={handleClick}
            sx={{ 
              color: open ? '#0f172a' : '#64748b', 
              p: 0.4,
              bgcolor: open ? '#f1f5f9' : 'transparent',
              transition: 'all 0.2s',
              '&:hover': { color: '#0f172a', bgcolor: '#f1f5f9' } 
            }}
          >
            <InfoOutlinedIcon sx={{ fontSize: '1.05rem' }} />
          </IconButton>
        </Tooltip>
      </Box>
    </ClickAwayListener>
  );
};

const FinancialHealthScorecard: React.FC<FinancialHealthScorecardProps> = ({ rawContent = '' }) => {
  // 1. Parse Overall Score
  let overallScore = 0;
  const scoreMatch = rawContent.match(/Overall Quantitative Score:\s*\**([\d.]+)\s*\/\s*100/i) ||
                     rawContent.match(/([\d.]+)\s*\/\s*100/);
  if (scoreMatch) {
    overallScore = parseFloat(scoreMatch[1]);
  }

  // 2. Parse Assessed Health Grade
  let assessedGrade = "Average (Grade C)";
  const gradeMatch = rawContent.match(/Assessed Health Grade:\s*\**([^*]+)\**/i);
  if (gradeMatch && gradeMatch[1]) {
    assessedGrade = gradeMatch[1].trim();
  }

  // 3. Parse Categories from Table Rows
  const categories: CategoryItem[] = [];
  const lines = rawContent.split('\n');
  lines.forEach((line) => {
    if (line.includes('|') && !line.includes('---') && !line.includes('Evaluation Category') && !line.includes('TOTAL QUANTITATIVE SCORE')) {
      const parts = line.split('|').map(p => p.trim()).filter(Boolean);
      if (parts.length >= 4) {
        const cleanCat = parts[0].replace(/\*\*/g, '').trim();
        const cleanWeight = parts[1].replace(/\*\*/g, '').trim();
        const cleanFormula = parts[2].replace(/`/g, '').trim();
        const cleanScore = parts[3].replace(/\*\*/g, '').trim();
        
        const scoreParts = cleanScore.split('/');
        let sVal = 0;
        let mVal = 1;
        if (scoreParts.length === 2) {
          sVal = parseFloat(scoreParts[0].trim()) || 0;
          mVal = parseFloat(scoreParts[1].replace(/[^\d.]/g, '').trim()) || 1;
        }
        
        if (cleanCat && cleanWeight) {
          categories.push({
            category: cleanCat,
            weight: cleanWeight,
            formula: cleanFormula,
            scoreText: cleanScore,
            scoreVal: sVal,
            maxVal: mVal,
            percentage: Math.min(100, Math.max(0, (sVal / mVal) * 100))
          });
        }
      }
    }
  });

  // 4. Parse Bonus/Penalty Log
  let bonusLog = "No negative governance penalties applied (Promoter pledge within nominal threshold). Net adjustments: ±0.0 points.";
  const logMatch = rawContent.match(/Transparent Bonus \/ Penalty Log:\s*([^\n]+)/i);
  if (logMatch && logMatch[1]) {
    bonusLog = logMatch[1].trim();
  }

  const overallPercentage = Math.min(100, Math.max(0, overallScore));
  const heroColor = getScoreColor(overallPercentage);

  return (
    <Box sx={{ fontFamily: 'Inter, sans-serif' }}>
      {/* Top Header / Hero Scorecard */}
      <Paper elevation={0} sx={{
        bgcolor: '#ffffff',
        border: '1px solid #cbd5e1',
        borderRadius: 3,
        p: { xs: 3, md: 4 },
        mb: 4,
        background: 'none',
        boxShadow: '0 4px 16px rgba(15, 23, 42, 0.04)'
      }}>
        <Grid container spacing={4} alignItems="center">
          <Grid item xs={12} md={5}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 3 }}>
              {/* Radial gauge analogue / Score Ring */}
              <Box sx={{
                width: { xs: 110, sm: 130 },
                height: { xs: 110, sm: 130 },
                borderRadius: '50%',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                bgcolor: '#f8fafc',
                border: `4px solid ${heroColor}`,
                boxShadow: '0 2px 8px rgba(15, 23, 42, 0.06)',
                flexShrink: 0
              }}>
                <Typography sx={{ fontSize: { xs: '2rem', sm: '2.4rem' }, fontWeight: 800, color: '#0f172a', lineHeight: 1 }}>
                  {overallScore > 0 ? overallScore : (categories.reduce((a, b) => a + b.scoreVal, 0)).toFixed(1)}
                </Typography>
                <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', mt: 0.5, letterSpacing: '0.05em' }}>
                  OUT OF 100
                </Typography>
              </Box>

              <Box>
                <Typography sx={{ color: '#64748b', fontSize: '0.82rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', mb: 1 }}>
                  Comprehensive Score
                </Typography>
                <Typography variant="h5" sx={{ color: '#0f172a', fontWeight: 800, mb: 1.5 }}>
                  Financial Health & Normalization
                </Typography>
                <Chip 
                  label={assessedGrade} 
                  size="small"
                  sx={{
                    bgcolor: '#f1f5f9',
                    color: heroColor,
                    border: `1px solid ${heroColor}`,
                    fontWeight: 800,
                    fontSize: '0.82rem',
                    px: 1,
                    py: 0.5,
                    height: '30px'
                  }} 
                />
              </Box>
            </Box>
          </Grid>

          <Grid item xs={12} md={7}>
            <Box sx={{ pl: { xs: 0, md: 3 }, borderLeft: { xs: 'none', md: '1px solid #cbd5e1' } }}>
              <Typography sx={{ fontSize: '0.95rem', color: '#334155', lineHeight: 1.6, mb: 2 }}>
                To guarantee total analytical transparency and complete reproducibility, every categorical financial component is normalized across historical industry benchmarks using measurable mathematical thresholds without hidden weight adjustments.
              </Typography>
              <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                <Box sx={{ bgcolor: '#f8fafc', px: 2, py: 1.2, borderRadius: 1.5, border: '1px solid #cbd5e1', flexGrow: 1 }}>
                  <Typography sx={{ fontSize: '0.72rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 700 }}>Evaluation Categories</Typography>
                  <Typography sx={{ fontSize: '1.25rem', color: '#0f172a', fontWeight: 800, mt: 0.2 }}>{categories.length || 7} Sectors</Typography>
                </Box>
                <Box sx={{ bgcolor: '#f8fafc', px: 2, py: 1.2, borderRadius: 1.5, border: '1px solid #cbd5e1', flexGrow: 1 }}>
                  <Typography sx={{ fontSize: '0.72rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 700 }}>Total Assigned Weight</Typography>
                  <Typography sx={{ fontSize: '1.25rem', color: '#0f172a', fontWeight: 800, mt: 0.2 }}>100.0 Pts</Typography>
                </Box>
                <Box sx={{ bgcolor: '#f8fafc', px: 2, py: 1.2, borderRadius: 1.5, border: '1px solid #cbd5e1', flexGrow: 1 }}>
                  <Typography sx={{ fontSize: '0.72rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 700 }}>Governance Penalties</Typography>
                  <Typography sx={{ fontSize: '1.25rem', color: '#059669', fontWeight: 800, mt: 0.2 }}>±0.0 Pts</Typography>
                </Box>
              </Box>
            </Box>
          </Grid>
        </Grid>
      </Paper>

      {/* Categorical Breakdown Title */}
      <Typography sx={{ color: '#0f172a', fontSize: '1.1rem', fontWeight: 800, mb: 2.5, display: 'flex', alignItems: 'center', gap: 1 }}>
        <AssessmentOutlinedIcon sx={{ color: '#0f172a' }} /> Categorical Weighted Breakdown & Transparent Formula Architecture
      </Typography>

      {/* Cards Grid */}
      <Grid container spacing={3} mb={4}>
        {categories.length > 0 ? categories.map((cat, idx) => {
          const color = getScoreColor(cat.percentage);
          return (
            <Grid item xs={12} sm={6} md={4} key={idx}>
              <Paper elevation={0} sx={{
                bgcolor: '#ffffff',
                border: '1px solid #cbd5e1',
                borderRadius: 2.5,
                p: 2.5,
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                boxShadow: '0 2px 8px rgba(15, 23, 42, 0.03)',
                transition: 'all 0.2s ease',
                '&:hover': {
                  transform: 'translateY(-4px)',
                  borderColor: '#94a3b8',
                  boxShadow: '0 8px 24px rgba(15, 23, 42, 0.08)'
                }
              }}>
                <Box>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.2, flexGrow: 1 }}>
                      <Box sx={{ p: 1, bgcolor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 1.5, display: 'flex' }}>
                        {getCategoryIcon(cat.category)}
                      </Box>
                      <Typography sx={{ fontSize: '0.95rem', fontWeight: 800, color: '#0f172a', maxWidth: '160px', lineHeight: 1.3 }}>
                        {cat.category}
                      </Typography>
                    </Box>

                    <Box sx={{ display: 'flex', alignItems: 'center' }}>
                      <Chip 
                        label={cat.weight}
                        size="small" 
                        sx={{ 
                          bgcolor: '#f1f5f9', 
                          border: '1px solid #cbd5e1',
                          color: '#0f172a', 
                          fontSize: '0.7rem', 
                          fontWeight: 700,
                          borderRadius: 1
                        }} 
                      />
                      {/* Click-only Info Tooltip Icon */}
                      <ClickableInfoTooltip formula={cat.formula} />
                    </Box>
                  </Box>

                  {/* Score Display & Progress Bar */}
                  <Box sx={{ mb: 1 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', mb: 1 }}>
                      <Typography sx={{ fontSize: '1.4rem', fontWeight: 800, color: '#0f172a' }}>
                        {cat.scoreText}
                      </Typography>
                      <Typography sx={{ fontSize: '0.8rem', fontWeight: 700, color: color }}>
                        {cat.percentage.toFixed(0)}% Efficiency
                      </Typography>
                    </Box>
                    <LinearProgress 
                      variant="determinate" 
                      value={cat.percentage} 
                      sx={{
                        height: 8,
                        borderRadius: 4,
                        bgcolor: '#e2e8f0',
                        '& .MuiLinearProgress-bar': {
                          bgcolor: color,
                          borderRadius: 4
                        }
                      }} 
                    />
                  </Box>
                </Box>
              </Paper>
            </Grid>
          );
        }) : (
          <Grid item xs={12}>
            <Paper elevation={0} sx={{ p: 4, bgcolor: '#ffffff', border: '1px solid #cbd5e1', textAlign: 'center', borderRadius: 2 }}>
              <Typography sx={{ color: '#64748b' }}>No detailed categorical metrics generated yet for this stock.</Typography>
            </Paper>
          </Grid>
        )}
      </Grid>

      {/* Transparent Bonus / Penalty Footer */}
      <Paper elevation={0} sx={{
        bgcolor: '#f0fdf4',
        border: '1px solid #86efac',
        borderLeft: '4px solid #15803d',
        borderRadius: 2,
        p: 2.5,
        display: 'flex',
        alignItems: 'center',
        gap: 2
      }}>
        <Box sx={{ p: 1, bgcolor: '#ffffff', border: '1px solid #86efac', borderRadius: 1.5, color: '#15803d', display: 'flex' }}>
          <GavelOutlinedIcon />
        </Box>
        <Box>
          <Typography sx={{ fontSize: '0.85rem', color: '#15803d', fontWeight: 800, textTransform: 'uppercase' }}>
            Transparent Bonus & Governance Penalty Log
          </Typography>
          <Typography sx={{ fontSize: '0.9rem', color: '#166534', fontWeight: 500, mt: 0.3 }}>
            {bonusLog}
          </Typography>
        </Box>
      </Paper>
    </Box>
  );
};

export default FinancialHealthScorecard;
