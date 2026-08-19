import React from 'react';
import { Drawer, Box, Typography, IconButton, Chip, Divider, Link, Stack } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import LaunchIcon from '@mui/icons-material/Launch';
import { useThemeMode } from '../../theme/ThemeContext';
import { CatalystEvent } from '../../types/catalyst';
import { formatToIST } from '../../utils/dateUtils';

interface CatalystDetailDrawerProps {
  open: boolean;
  onClose: () => void;
  event: CatalystEvent | null;
}

export const CatalystDetailDrawer: React.FC<CatalystDetailDrawerProps> = ({ open, onClose, event }) => {
  const { tokens } = useThemeMode();

  if (!event) return null;

  const getTierColor = (tier: string) => {
    switch (tier) {
      case 'S-TIER': return tokens.status.error.main;
      case 'A-TIER': return tokens.status.warning.main;
      case 'B-TIER': return tokens.status.info.main;
      default: return tokens.text.secondary;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'EARLY': return tokens.status.success.main;
      case 'DEVELOPING': return tokens.status.warning.main;
      case 'EXTENDED': return tokens.status.error.main;
      case 'LATE': return tokens.status.error.main;
      default: return tokens.text.secondary;
    }
  };

  const generateRadarInterpretation = (evt: CatalystEvent) => {
    let text = `${evt.tier === 'S-TIER' ? 'Severe' : evt.tier === 'A-TIER' ? 'High' : evt.tier === 'B-TIER' ? 'Moderate' : 'Informational'}-impact ${evt.category.toLowerCase()} event`;
    
    if (evt.status === 'EARLY') {
      text += ' detected early.';
    } else if (evt.status === 'EXTENDED') {
      text += ' but already extended.';
    } else {
      text += ' detected.';
    }

    const react = evt.reactionPct ?? 0;
    const vol = evt.relativeVolume ?? 1;

    text += ` Price reaction so far: ${react > 0 ? '+' : ''}${react.toFixed(2)}%.`;
    
    if (vol > 3) {
      text += ` Volume is highly elevated (${vol.toFixed(1)}x normal).`;
    } else if (vol > 1.5) {
      text += ` Volume is somewhat elevated (${vol.toFixed(1)}x normal).`;
    } else {
      text += ` Volume is near normal.`;
    }

    if (react > 5 || react < -5) {
      text += ` The market is already showing a very strong reaction.`;
    } else if (react > 2 || react < -2) {
      text += ` The market is beginning to react.`;
    } else {
      text += ` The market has not yet shown a strong reaction.`;
    }

    return text;
  };

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      PaperProps={{
        sx: {
          width: { xs: '100%', sm: 480 },
          bgcolor: tokens.background.paper,
          borderLeft: `1px solid ${tokens.border.main}`,
          backgroundImage: 'none',
        }
      }}
    >
      <Box sx={{ p: 3, display: 'flex', flexDirection: 'column', height: '100%' }}>
        {/* Header */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
          <Box>
            <Typography sx={{ fontSize: '12px', fontWeight: 600, color: tokens.primary.main, mb: 0.5 }}>
              {event.ticker} • {event.category}
            </Typography>
            <Typography variant="h6" sx={{ fontWeight: 600, color: tokens.text.primary, lineHeight: 1.3 }}>
              {event.eventTitle}
            </Typography>
          </Box>
          <IconButton onClick={onClose} sx={{ color: tokens.text.secondary }}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </Box>

        <Stack direction="row" spacing={1} sx={{ mb: 3 }}>
          <Chip 
            label={event.tier} 
            size="small" 
            sx={{ 
              bgcolor: `${getTierColor(event.tier)}15`, 
              color: getTierColor(event.tier),
              fontWeight: 700,
              borderRadius: '4px'
            }} 
          />
          <Chip 
            label={event.status} 
            size="small" 
            sx={{ 
              bgcolor: `${getStatusColor(event.status)}15`, 
              color: getStatusColor(event.status),
              fontWeight: 600,
              borderRadius: '4px'
            }} 
          />
          <Chip 
            label={`CONFIDENCE: ${event.confidence}`} 
            size="small" 
            variant="outlined"
            sx={{ 
              color: tokens.text.secondary,
              borderColor: tokens.border.main,
              fontWeight: 600,
              borderRadius: '4px'
            }} 
          />
        </Stack>

        <Divider sx={{ borderColor: tokens.border.main, mb: 3 }} />

        {/* Intelligence / Why it matters */}
        <Box sx={{ mb: 4 }}>
          <Typography sx={{ fontSize: '11px', fontWeight: 700, color: tokens.text.tertiary, letterSpacing: '0.5px', mb: 1, textTransform: 'uppercase' }}>
            Intelligence Analysis
          </Typography>
          <Box sx={{ 
            p: 2, 
            bgcolor: tokens.background.card, 
            border: `1px solid ${tokens.border.main}`,
            borderRadius: '6px',
            borderLeft: `3px solid ${tokens.primary.main}`
          }}>
            <Typography sx={{ fontSize: '13px', color: tokens.text.primary, lineHeight: 1.5 }}>
              {event.whyItMatters || 'No analysis available.'}
            </Typography>
          </Box>
        </Box>

        {/* Radar Interpretation */}
        <Box sx={{ mb: 4 }}>
          <Typography sx={{ fontSize: '11px', fontWeight: 700, color: tokens.text.tertiary, letterSpacing: '0.5px', mb: 1, textTransform: 'uppercase' }}>
            Radar Interpretation
          </Typography>
          <Box sx={{ p: 2, bgcolor: tokens.background.card, borderRadius: '4px', border: `1px solid ${tokens.border.main}` }}>
            <Typography sx={{ fontSize: '13px', color: tokens.text.primary, fontWeight: 500, lineHeight: 1.5 }}>
              {generateRadarInterpretation(event)}
            </Typography>
            <Typography sx={{ fontSize: '11px', color: tokens.text.secondary, mt: 1, fontStyle: 'italic' }}>
              Measurement baseline: Close price strictly prior to publication.
            </Typography>
          </Box>
        </Box>

        {/* Market Reaction */}
        <Box sx={{ mb: 4 }}>
          <Typography sx={{ fontSize: '11px', fontWeight: 700, color: tokens.text.tertiary, letterSpacing: '0.5px', mb: 2, textTransform: 'uppercase' }}>
            Market Reaction & Scoring
          </Typography>
          
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, mb: 2 }}>
            <Box>
              <Typography sx={{ fontSize: '11px', color: tokens.text.secondary, mb: 0.5 }}>Pre-Event Context</Typography>
              <Typography sx={{ fontSize: '13px', fontWeight: 600, color: tokens.text.primary }}>
                {event.preEventPrice ? `₹${event.preEventPrice.toFixed(2)}` : 'N/A'} 
                {event.marketCapAtEvent ? ` • ₹${(event.marketCapAtEvent / 10000000).toFixed(0)}Cr` : ''}
              </Typography>
            </Box>
            <Box>
              <Typography sx={{ fontSize: '11px', color: tokens.text.secondary, mb: 0.5 }}>Relative Volume</Typography>
              <Typography sx={{ fontSize: '16px', fontWeight: 600, color: tokens.text.primary }}>
                {event.relativeVolume?.toFixed(1)}x
              </Typography>
            </Box>
          </Box>

          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr 1fr', gap: 1, mb: 3, p: 1.5, bgcolor: tokens.background.card, borderRadius: '6px', border: `1px solid ${tokens.border.main}` }}>
            <Box>
              <Typography sx={{ fontSize: '10px', color: tokens.text.secondary, mb: 0.5 }}>GAP</Typography>
              <Typography sx={{ fontSize: '14px', fontWeight: 600, color: (event.gapReactionPct ?? 0) > 0 ? tokens.status.success.main : ((event.gapReactionPct ?? 0) < 0 ? tokens.status.error.main : tokens.text.primary) }}>
                {event.gapReactionPct !== undefined && event.gapReactionPct !== null ? `${event.gapReactionPct > 0 ? '+' : ''}${event.gapReactionPct.toFixed(1)}%` : '-'}
              </Typography>
            </Box>
            <Box>
              <Typography sx={{ fontSize: '10px', color: tokens.text.secondary, mb: 0.5 }}>SESSION</Typography>
              <Typography sx={{ fontSize: '14px', fontWeight: 600, color: (event.sessionReactionPct ?? 0) > 0 ? tokens.status.success.main : ((event.sessionReactionPct ?? 0) < 0 ? tokens.status.error.main : tokens.text.primary) }}>
                {event.sessionReactionPct !== undefined && event.sessionReactionPct !== null ? `${event.sessionReactionPct > 0 ? '+' : ''}${event.sessionReactionPct.toFixed(1)}%` : '-'}
              </Typography>
            </Box>
            <Box>
              <Typography sx={{ fontSize: '10px', color: tokens.text.secondary, mb: 0.5 }}>1D</Typography>
              <Typography sx={{ fontSize: '14px', fontWeight: 600, color: (event.reaction1d ?? 0) > 0 ? tokens.status.success.main : ((event.reaction1d ?? 0) < 0 ? tokens.status.error.main : tokens.text.primary) }}>
                {event.reaction1d !== undefined && event.reaction1d !== null ? `${event.reaction1d > 0 ? '+' : ''}${event.reaction1d.toFixed(1)}%` : '-'}
              </Typography>
            </Box>
            <Box>
              <Typography sx={{ fontSize: '10px', color: tokens.text.secondary, mb: 0.5 }}>3D</Typography>
              <Typography sx={{ fontSize: '14px', fontWeight: 600, color: (event.reaction3d ?? 0) > 0 ? tokens.status.success.main : ((event.reaction3d ?? 0) < 0 ? tokens.status.error.main : tokens.text.primary) }}>
                {event.reaction3d !== undefined && event.reaction3d !== null ? `${event.reaction3d > 0 ? '+' : ''}${event.reaction3d.toFixed(1)}%` : '-'}
              </Typography>
            </Box>
            <Box>
              <Typography sx={{ fontSize: '10px', color: tokens.text.secondary, mb: 0.5 }}>5D</Typography>
              <Typography sx={{ fontSize: '14px', fontWeight: 600, color: (event.reaction5d ?? 0) > 0 ? tokens.status.success.main : ((event.reaction5d ?? 0) < 0 ? tokens.status.error.main : tokens.text.primary) }}>
                {event.reaction5d !== undefined && event.reaction5d !== null ? `${event.reaction5d > 0 ? '+' : ''}${event.reaction5d.toFixed(1)}%` : '-'}
              </Typography>
            </Box>
          </Box>

          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
            <Box>
              <Typography sx={{ fontSize: '11px', color: tokens.text.secondary, mb: 0.5 }}>Early Score</Typography>
              <Typography sx={{ fontSize: '16px', fontWeight: 600, color: (event.earlyScore ?? 0) > 80 ? tokens.status.success.main : tokens.text.primary }}>
                {event.earlyScore?.toFixed(0)}
              </Typography>
            </Box>
            <Box>
              <Typography sx={{ fontSize: '11px', color: tokens.text.secondary, mb: 0.5 }}>Impact Score</Typography>
              <Typography sx={{ fontSize: '16px', fontWeight: 600, color: tokens.text.primary }}>
                {event.impactScore?.toFixed(0)}
              </Typography>
            </Box>
          </Box>
        </Box>

        <Divider sx={{ borderColor: tokens.border.main, mb: 3 }} />

        {/* Sources & Lifecycle */}
        <Box sx={{ mb: 4 }}>
          <Typography sx={{ fontSize: '11px', fontWeight: 700, color: tokens.text.tertiary, letterSpacing: '0.5px', mb: 2, textTransform: 'uppercase' }}>
            Lifecycle & Sources
          </Typography>
          
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, mb: 3 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
              <Typography sx={{ fontSize: '12px', color: tokens.text.secondary }}>Published</Typography>
              <Typography sx={{ fontSize: '12px', color: tokens.text.primary, fontWeight: 500 }}>
                {event.publishedAt ? formatToIST(event.publishedAt).fullStr : 'Unknown'}
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
              <Typography sx={{ fontSize: '12px', color: tokens.text.secondary }}>Detected</Typography>
              <Typography sx={{ fontSize: '12px', color: tokens.text.primary, fontWeight: 500 }}>
                {event.detectedAt ? formatToIST(event.detectedAt).fullStr : 'Unknown'}
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
              <Typography sx={{ fontSize: '12px', color: tokens.text.secondary }}>Detection Lag</Typography>
              <Typography sx={{ fontSize: '12px', color: tokens.text.primary, fontWeight: 500 }}>
                {event.publishedAt && event.detectedAt 
                  ? (() => {
                      const pub = new Date(event.publishedAt).getTime();
                      const det = new Date(event.detectedAt).getTime();
                      const diffSecs = Math.abs(det - pub) / 1000;
                      if (diffSecs < 60) return `${Math.floor(diffSecs)} sec`;
                      if (diffSecs < 3600) return `${Math.floor(diffSecs / 60)} min`;
                      return `${Math.floor(diffSecs / 3600)} hours`;
                    })()
                  : 'N/A'
                }
              </Typography>
            </Box>
          </Box>

          <Typography sx={{ fontSize: '12px', color: tokens.text.secondary, mb: 1 }}>Sources:</Typography>
          <Stack spacing={1}>
            {event.sources?.map((src) => (
              <Box key={src.id} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', p: 1.5, bgcolor: tokens.background.default, borderRadius: '4px', border: `1px solid ${tokens.border.main}` }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  {src.isPrimary && (
                    <Chip label="PRIMARY" size="small" sx={{ height: 16, fontSize: '9px', bgcolor: tokens.primary.tint, color: tokens.primary.main, fontWeight: 700 }} />
                  )}
                  <Typography sx={{ fontSize: '12px', color: tokens.text.primary, fontWeight: 500 }}>
                    {src.sourceName}
                  </Typography>
                </Box>
                {src.url && (
                  <Link href={src.url} target="_blank" rel="noopener noreferrer" sx={{ color: tokens.primary.main, display: 'flex', alignItems: 'center' }}>
                    <LaunchIcon sx={{ fontSize: 14 }} />
                  </Link>
                )}
              </Box>
            ))}
            {(!event.sources || event.sources.length === 0) && (
              <Typography sx={{ fontSize: '12px', color: tokens.text.tertiary, fontStyle: 'italic' }}>
                No verifiable sources attached.
              </Typography>
            )}
          </Stack>
        </Box>

        {/* External Validation Links */}
        <Box sx={{ mt: 'auto', pt: 2 }}>
          <Divider sx={{ borderColor: tokens.border.main, mb: 3 }} />
          <Typography sx={{ fontSize: '11px', fontWeight: 700, color: tokens.text.tertiary, letterSpacing: '0.5px', mb: 2, textTransform: 'uppercase' }}>
            External Validation
          </Typography>
          <Stack direction="row" spacing={3}>
            <Link href={`https://www.tradingview.com/chart/?symbol=NSE%3A${event.ticker}`} target="_blank" rel="noopener noreferrer" sx={{ fontSize: '12px', color: tokens.primary.main, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 0.5, '&:hover': { textDecoration: 'underline' } }}>
              TradingView <LaunchIcon sx={{ fontSize: 14 }} />
            </Link>
            <Link href={`https://www.screener.in/company/${event.ticker}/`} target="_blank" rel="noopener noreferrer" sx={{ fontSize: '12px', color: tokens.primary.main, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 0.5, '&:hover': { textDecoration: 'underline' } }}>
              Screener.in <LaunchIcon sx={{ fontSize: 14 }} />
            </Link>
            <Link href={`https://finance.yahoo.com/quote/${event.ticker}.NS/`} target="_blank" rel="noopener noreferrer" sx={{ fontSize: '12px', color: tokens.primary.main, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 0.5, '&:hover': { textDecoration: 'underline' } }}>
              Yahoo Finance <LaunchIcon sx={{ fontSize: 14 }} />
            </Link>
          </Stack>
        </Box>

      </Box>
    </Drawer>
  );
};
