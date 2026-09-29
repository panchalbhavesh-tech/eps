import React from 'react';
import { Box, Tooltip, Typography } from '@mui/material';
import { useThemeMode } from '../../theme/ThemeContext';
import { fmtPct } from '../events/preReleaseTypes';
import { Action, ImpactEvent } from './impactfulTypes';

export const ActionChip: React.FC<{ a: Action; big?: boolean }> = ({ a, big }) => {
  const { tokens } = useThemeMode();
  const c = a === 'BUY' ? tokens.status.success.main : a === 'AVOID' ? tokens.status.error.main : tokens.text.secondary;
  return (
    <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', alignSelf: 'flex-start', px: big ? 1.5 : 1, height: big ? 30 : 22,
      borderRadius: '6px', fontSize: big ? '15px' : '11.5px', fontWeight: 800, letterSpacing: '0.5px', color: c, border: `1px solid ${c}`,
      backgroundColor: a === 'BUY' ? tokens.status.success.wash : a === 'AVOID' ? tokens.status.error.wash : 'transparent', whiteSpace: 'nowrap' }}>
      {a}
    </Box>
  );
};

/** What happened the last times: this stock's own moves as ▲/▼, or similar events when the stock has little history. */
export const PastRecord: React.FC<{ e: ImpactEvent }> = ({ e }) => {
  const { tokens } = useThemeMode();
  const green = tokens.status.success.main, red = tokens.status.error.main, muted = tokens.text.secondary;
  const own = e.own || { n: 0, moves: [] };
  if (own.n >= 3) {
    const moves = own.moves.slice(-6);
    return (
      <Tooltip arrow title={`${e.ticker} last ${moves.length} times: ${moves.map((m) => fmtPct(m)).join(', ')}`}>
        <Box sx={{ lineHeight: 1.3 }}>
          <Typography sx={{ fontSize: '14px', letterSpacing: '1px', lineHeight: 1.2 }}>
            {moves.map((m, i) => <span key={i} style={{ color: m > 0 ? green : red }}>{m > 0 ? '▲' : '▼'}</span>)}
          </Typography>
          <Typography noWrap sx={{ fontSize: '12px', color: muted }}>
            Rose {own.up} of {own.n} · avg <span style={{ color: (own.mean ?? 0) >= 0 ? green : red }}>{fmtPct(own.mean)}</span>
          </Typography>
        </Box>
      </Tooltip>
    );
  }
  const g = e.group || {};
  if (!g.n) return <Typography sx={{ fontSize: '12px', color: muted }}>No history</Typography>;
  return (
    <Box sx={{ lineHeight: 1.3 }}>
      <Typography noWrap sx={{ fontSize: '13px', fontWeight: 700, color: (g.mean ?? 0) >= 0 ? green : red }}>{fmtPct(g.mean)} avg</Typography>
      <Typography noWrap sx={{ fontSize: '12px', color: muted }}>Similar events · {g.hit}% rose</Typography>
    </Box>
  );
};
