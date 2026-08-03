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
import { useThemeMode } from '../theme/ThemeContext';

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

const getCategoryIcon = (category: string, accentColor: string) => {
  const lower = category.toLowerCase();
  if (lower.includes('profitability') || lower.includes('returns')) return <ShowChartIcon sx={{ color: '#059669' }} />;
  if (lower.includes('debt') || lower.includes('solvency')) return <AccountBalanceWalletOutlinedIcon sx={{ color: '#0284c7' }} />;
  if (lower.includes('cash flow') || lower.includes('efficiency')) return <AutorenewOutlinedIcon sx={{ color: '#d97706' }} />;
  if (lower.includes('growth') || lower.includes('expansion')) return <TimelineOutlinedIcon sx={{ color: accentColor }} />;
  if (lower.includes('valuation') || lower.includes('multiples')) return <MonetizationOnOutlinedIcon sx={{ color: '#b45309' }} />;
  if (lower.includes('stability') || lower.includes('price')) return <SecurityOutlinedIcon sx={{ color: '#475569' }} />;
  if (lower.includes('ownership') || lower.includes('promoter')) return <VerifiedUserOutlinedIcon sx={{ color: '#059669' }} />;
  return <AssessmentOutlinedIcon sx={{ color: accentColor }} />;
};

const ClickableInfoTooltip: React.FC<{ formula: string }> = ({ formula }) => {
  const [open, setOpen] = useState(false);
  const { tokens } = useThemeMode();

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
              <Typography sx={{ fontSize: '11px', color: tokens.text.secondary, fontWeight: 700, textTransform: 'uppercase', mb: 0.5 }}>
                Normalization Math Formula:
              </Typography>
              <Typography sx={{ fontFamily: tokens.typography.fontFamily, fontSize: '12px', color: tokens.text.primary, wordBreak: 'break-word', lineHeight: 1.4 }} className="mono-font">
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
                backgroundColor: tokens.background.card,
                border: `1px solid ${tokens.border.main}`,
                boxShadow: tokens.shadows.dropdown,
                p: 1,
                borderRadius: '8px'
              }
            },
            arrow: {
              sx: { color: tokens.background.card }
            }
          }}
        >
          <IconButton
            size="small"
            onClick={handleClick}
            sx={{ 
              color: open ? tokens.text.primary : tokens.text.secondary, 
              p: 0.4,
              backgroundColor: open ? tokens.background.cardHover : 'transparent',
              transition: 'all 0.2s',
              '&:hover': { color: tokens.text.primary, backgroundColor: tokens.background.cardHover } 
            }}
          >
            <InfoOutlinedIcon sx={{ fontSize: 18 }} />
          </IconButton>
        </Tooltip>
      </Box>
    </ClickAwayListener>
  );
};

const FinancialHealthScorecard: React.FC<FinancialHealthScorecardProps> = ({ rawContent = '' }) => {
  const { tokens } = useThemeMode();

  let overallScore = 0;
  const scoreMatch = rawContent.match(/Overall Quantitative Score:\s*\**([\d.]+)\s*\/\s*100/i) ||
                     rawContent.match(/([\d.]+)\s*\/\s*100/);
  if (scoreMatch) {
    overallScore = parseFloat(scoreMatch[1]);
  }

  let assessedGrade = "Average (Grade C)";
  const gradeMatch = rawContent.match(/Assessed Health Grade:\s*\**([^*]+)\**/i);
  if (gradeMatch && gradeMatch[1]) {
    assessedGrade = gradeMatch[1].trim();
  }

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

  let bonusLog = "No negative governance penalties applied (Promoter pledge within nominal threshold). Net adjustments: ±0.0 points.";
  const logMatch = rawContent.match(/Transparent Bonus \/ Penalty Log:\s*([^\n]+)/i);
  if (logMatch && logMatch[1]) {
    bonusLog = logMatch[1].trim();
  }

  const overallPercentage = Math.min(100, Math.max(0, overallScore));
  
  const getScoreColor = (percentage: number) => {
    if (percentage >= 75) return tokens.status.success.main;
    if (percentage >= 50) return tokens.status.warning.main;
    return tokens.status.error.main;
  };

  const heroColor = getScoreColor(overallPercentage);

  return (
    <Box sx={{ fontFamily: tokens.typography.fontFamily }}>
      {/* Top Header / Hero Scorecard */}
      <Paper elevation={0} sx={{
        backgroundColor: tokens.background.paper,
        border: `1px solid ${tokens.border.main}`,
        borderRadius: '12px',
        p: { xs: 3, md: 4 },
        mb: 4,
        boxShadow: tokens.shadows.card
      }}>
        <Grid container spacing={4} alignItems="center">
          <Grid item xs={12} md={5}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 3 }}>
              {/* Radial Score Ring */}
              <Box sx={{
                width: { xs: 110, sm: 130 },
                height: { xs: 110, sm: 130 },
                borderRadius: '50%',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: tokens.background.card,
                border: `4px solid ${heroColor}`,
                boxShadow: tokens.shadows.card,
                flexShrink: 0
              }}>
                <Typography className="mono-font tabular-nums" sx={{ fontSize: { xs: '28px', sm: '32px' }, fontWeight: 700, color: tokens.text.primary, lineHeight: 1 }}>
                  {overallScore > 0 ? overallScore : (categories.reduce((a, b) => a + b.scoreVal, 0)).toFixed(1)}
                </Typography>
                <Typography sx={{ fontSize: '11px', fontWeight: 600, color: tokens.text.secondary, mt: 0.5, letterSpacing: '0.5px' }}>
                  OUT OF 100
                </Typography>
              </Box>

              <Box>
                <Typography sx={{ color: tokens.text.secondary, fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', mb: 1 }}>
                  Comprehensive Score
                </Typography>
                <Typography variant="h5" sx={{ color: tokens.text.primary, fontWeight: 700, fontSize: '20px', mb: 1.5 }}>
                  Financial Health & Normalization
                </Typography>
                <Chip 
                  label={assessedGrade} 
                  size="small"
                  sx={{
                    backgroundColor: tokens.background.cardHover,
                    color: heroColor,
                    border: `1px solid ${heroColor}`,
                    fontWeight: 700,
                    fontSize: '12px',
                    px: 1,
                    py: 0.5,
                    height: '28px',
                    borderRadius: '6px'
                  }} 
                />
              </Box>
            </Box>
          </Grid>

          <Grid item xs={12} md={7}>
            <Box sx={{ pl: { xs: 0, md: 3 }, borderLeft: { xs: 'none', md: `1px solid ${tokens.border.main}` } }}>
              <Typography sx={{ fontSize: '13px', color: tokens.text.secondary, lineHeight: 1.6, mb: 2 }}>
                To guarantee total analytical transparency and complete reproducibility, every categorical financial component is normalized across historical industry benchmarks using measurable mathematical thresholds without hidden weight adjustments.
              </Typography>
              <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                <Box sx={{ backgroundColor: tokens.background.card, px: 2, py: 1.2, borderRadius: '8px', border: `1px solid ${tokens.border.main}`, flexGrow: 1 }}>
                  <Typography sx={{ fontSize: '11px', color: tokens.text.secondary, textTransform: 'uppercase', fontWeight: 600 }}>Evaluation Categories</Typography>
                  <Typography className="mono-font tabular-nums" sx={{ fontSize: '18px', color: tokens.text.primary, fontWeight: 700, mt: 0.2 }}>{categories.length || 7} Sectors</Typography>
                </Box>
                <Box sx={{ backgroundColor: tokens.background.card, px: 2, py: 1.2, borderRadius: '8px', border: `1px solid ${tokens.border.main}`, flexGrow: 1 }}>
                  <Typography sx={{ fontSize: '11px', color: tokens.text.secondary, textTransform: 'uppercase', fontWeight: 600 }}>Total Assigned Weight</Typography>
                  <Typography className="mono-font tabular-nums" sx={{ fontSize: '18px', color: tokens.text.primary, fontWeight: 700, mt: 0.2 }}>100.0 Pts</Typography>
                </Box>
                <Box sx={{ backgroundColor: tokens.background.card, px: 2, py: 1.2, borderRadius: '8px', border: `1px solid ${tokens.border.main}`, flexGrow: 1 }}>
                  <Typography sx={{ fontSize: '11px', color: tokens.text.secondary, textTransform: 'uppercase', fontWeight: 600 }}>Governance Penalties</Typography>
                  <Typography className="mono-font tabular-nums" sx={{ fontSize: '18px', color: tokens.status.success.main, fontWeight: 700, mt: 0.2 }}>±0.0 Pts</Typography>
                </Box>
              </Box>
            </Box>
          </Grid>
        </Grid>
      </Paper>

      {/* Categorical Breakdown Title */}
      <Typography sx={{ color: tokens.text.primary, fontSize: '16px', fontWeight: 700, mb: 2.5, display: 'flex', alignItems: 'center', gap: 1 }}>
        <AssessmentOutlinedIcon sx={{ color: tokens.accent.main }} /> Categorical Weighted Breakdown & Transparent Formula Architecture
      </Typography>

      {/* Cards Grid */}
      <Grid container spacing={2} mb={4}>
        {categories.length > 0 ? categories.map((cat, idx) => {
          const color = getScoreColor(cat.percentage);
          return (
            <Grid item xs={12} sm={6} md={4} key={idx}>
              <Paper elevation={0} sx={{
                backgroundColor: tokens.background.paper,
                border: `1px solid ${tokens.border.main}`,
                borderRadius: '12px',
                p: 2.5,
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                boxShadow: tokens.shadows.card,
                transition: 'all 0.2s ease',
                '&:hover': {
                  transform: 'translateY(-3px)',
                  borderColor: tokens.border.light,
                  boxShadow: tokens.shadows.dropdown
                }
              }}>
                <Box>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.2, flexGrow: 1 }}>
                      <Box sx={{ p: 1, backgroundColor: tokens.background.card, border: `1px solid ${tokens.border.main}`, borderRadius: '8px', display: 'flex' }}>
                        {getCategoryIcon(cat.category, tokens.accent.main)}
                      </Box>
                      <Typography sx={{ fontSize: '14px', fontWeight: 700, color: tokens.text.primary, maxWidth: '160px', lineHeight: 1.3 }}>
                        {cat.category}
                      </Typography>
                    </Box>

                    <Box sx={{ display: 'flex', alignItems: 'center' }}>
                      <Chip 
                        label={cat.weight}
                        size="small" 
                        sx={{ 
                          backgroundColor: tokens.background.cardHover, 
                          border: `1px solid ${tokens.border.main}`,
                          color: tokens.text.primary, 
                          fontSize: '11px', 
                          fontWeight: 600,
                          borderRadius: '6px'
                        }} 
                      />
                      <ClickableInfoTooltip formula={cat.formula} />
                    </Box>
                  </Box>

                  {/* Score Display & Progress Bar */}
                  <Box sx={{ mb: 1 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', mb: 1 }}>
                      <Typography className="mono-font tabular-nums" sx={{ fontSize: '20px', fontWeight: 700, color: tokens.text.primary }}>
                        {cat.scoreText}
                      </Typography>
                      <Typography className="mono-font tabular-nums" sx={{ fontSize: '12px', fontWeight: 600, color: color }}>
                        {cat.percentage.toFixed(0)}% Efficiency
                      </Typography>
                    </Box>
                    <LinearProgress 
                      variant="determinate" 
                      value={cat.percentage} 
                      sx={{
                        height: 6,
                        borderRadius: 3,
                        backgroundColor: tokens.border.main,
                        '& .MuiLinearProgress-bar': {
                          backgroundColor: color,
                          borderRadius: 3
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
            <Paper elevation={0} sx={{ p: 4, backgroundColor: tokens.background.paper, border: `1px solid ${tokens.border.main}`, textAlign: 'center', borderRadius: '12px' }}>
              <Typography sx={{ color: tokens.text.secondary }}>No detailed categorical metrics generated yet for this stock.</Typography>
            </Paper>
          </Grid>
        )}
      </Grid>

      {/* Transparent Bonus / Penalty Footer */}
      <Paper elevation={0} sx={{
        backgroundColor: tokens.status.success.pillBg,
        border: `1px solid ${tokens.status.success.border}`,
        borderRadius: '12px',
        p: 2.5,
        display: 'flex',
        alignItems: 'center',
        gap: 2
      }}>
        <Box sx={{ p: 1, backgroundColor: tokens.background.paper, border: `1px solid ${tokens.status.success.border}`, borderRadius: '8px', color: tokens.status.success.main, display: 'flex' }}>
          <GavelOutlinedIcon />
        </Box>
        <Box>
          <Typography sx={{ fontSize: '11px', color: tokens.status.success.main, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Transparent Bonus & Governance Penalty Log
          </Typography>
          <Typography sx={{ fontSize: '13px', color: tokens.text.primary, fontWeight: 500, mt: 0.3 }}>
            {bonusLog}
          </Typography>
        </Box>
      </Paper>
    </Box>
  );
};

export default FinancialHealthScorecard;
