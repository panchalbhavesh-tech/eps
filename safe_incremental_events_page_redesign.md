# Events Page Redesign — Safe & Incremental Implementation

## ⚠️ CRITICAL RULES (DO NOT BREAK THESE)

1. ✅ **Keep all data columns visible** — Do NOT hide, remove, or reorder any existing columns
2. ✅ **Preserve data binding** — All values (prices, badges, percentages) must come from backend data, NOT hardcoded
3. ✅ **Keep headers** — "COMPANY/TICKER", "PRICE", "MKTCAP", "HEALTH SCORE", "MOMENTUM PROB", etc. must remain visible
4. ✅ **Keep sidebar** — Right panel with "Avg Reaction", "Post Release Result", "Q4 EPS" etc. must stay intact
5. ✅ **Keep functionality** — Sorting, filtering, search, pagination, expand/collapse must work as before
6. ✅ **Only change styling** — This is a STYLING-ONLY update. No data structure changes.

---

## Implementation Plan: Step-by-Step

Follow these steps **in order**. After each step, test and verify nothing broke before moving to next step.

---

## STEP 1: Increase Row Height & Padding (5 minutes)

**What:** Make rows less cramped by increasing height and cell padding.

**Code change:**
```jsx
// Find the DataGrid component in Events.tsx

<DataGrid
  rows={data}
  columns={columns}
  rowHeight={48}  // ← CHANGE FROM 40 TO 48
  columnHeaderHeight={44}  // ← CHANGE FROM 40 TO 44
  sx={{
    '& .MuiDataGrid-cell': {
      padding: '12px 8px',  // ← CHANGE FROM 8px TO 12px 8px
      display: 'flex',
      alignItems: 'center',
    },
    '& .MuiDataGrid-columnHeader': {
      padding: '12px 8px',  // ← CHANGE FROM 8px TO 12px 8px
    },
  }}
/>
```

**Test:**
- [ ] Rows are taller (48px each)
- [ ] Headers are taller (44px)
- [ ] More spacing inside cells (breathing room)
- [ ] No data is cut off
- [ ] All columns still visible
- [ ] Sidebar still visible

---

## STEP 2: Add Company Name to Ticker Column (10 minutes)

**What:** Show full company name alongside ticker (e.g., "Websol Energy System Limited / WEBSOLAR NSE").

**Code change:**
Find the company/ticker column definition and update the cell renderer:

```jsx
// Current (before):
{
  field: 'ticker',
  headerName: 'COMPANY / TICKER',
  width: 160,
  renderCell: (params) => (
    <span>{params.row.ticker} {params.row.exchange}</span>
  ),
}

// Updated (after):
{
  field: 'ticker',
  headerName: 'COMPANY / TICKER',
  width: 220,  // ← INCREASED FROM 160 TO 220
  renderCell: (params) => (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
      <Box sx={{ fontSize: '12px', fontWeight: 500 }}>
        {params.row.companyName}  {/* ← ADD THIS LINE */}
      </Box>
      <Box sx={{ fontSize: '11px', color: 'rgba(255,255,255,0.60)' }}>
        {params.row.ticker} {params.row.exchange}
      </Box>
    </Box>
  ),
}
```

**Critical:** Make sure `params.row.companyName` exists in your data. If it doesn't, check backend GraphQL query.

**Test:**
- [ ] Company names are visible (line 1 of each row)
- [ ] Ticker + exchange still visible (line 2 of each row)
- [ ] No truncation (if truncated, increase width to 240–260px)
- [ ] Right sidebar "Avg Reaction" is still visible
- [ ] All other columns still visible
- [ ] No broken data binding

---

## STEP 3: Style Health Score as Badge (10 minutes)

**What:** Replace "77 PTS [B]" text with a clean colored badge chip.

**Current state:**
```
77 PTS [B]  ← Text format
```

**Target state:**
```
B  ← Colored chip badge
```

**Code change:**
Find the health score column and update:

```jsx
// Current (before):
{
  field: 'healthScore',
  headerName: 'HEALTH SCORE',
  width: 120,
  renderCell: (params) => (
    <span>{params.row.healthScore} PTS [{params.row.healthGrade}]</span>
  ),
}

// Updated (after):
{
  field: 'healthScore',
  headerName: 'HEALTH SCORE',
  width: 90,
  renderCell: (params) => {
    const grade = params.row.healthGrade; // A, B, C, D, E, F
    const colorMap = {
      'A': '#3DFFA2',
      'B': '#3DFFA2',
      'C': '#FFA502',
      'D': '#FFA502',
      'E': '#FF4757',
      'F': '#FF4757',
    };
    
    return (
      <Chip
        label={grade}
        size="small"
        sx={{
          fontSize: '12px',
          fontWeight: 600,
          backgroundColor: colorMap[grade],
          color: '#0A0A0C',  // Dark text on bright badge
          borderRadius: '6px',
          height: '28px',
          width: '32px',
          '& .MuiChip-label': {
            padding: 0,
          },
        }}
      />
    );
  },
}
```

**Test:**
- [ ] Health scores show as colored letter badges (A, B, C, etc.)
- [ ] Green for A/B
- [ ] Orange for C/D
- [ ] Red for E/F
- [ ] Column width is narrower (90px, more space for other columns)
- [ ] All other columns still visible
- [ ] No data loss

---

## STEP 4: Add Visual Progress Bar to Momentum Prob (10 minutes)

**What:** Show momentum probability as both a progress bar AND percentage label.

**Current state:**
```
25%  ← Just text
```

**Target state:**
```
[████░░░░]
   25%    ← Bar + text
```

**Code change:**
Find momentum probability column and update:

```jsx
// Current (before):
{
  field: 'momentumProb',
  headerName: 'MOMENTUM PROB',
  width: 100,
  renderCell: (params) => (
    <span>{params.row.momentumProb}%</span>
  ),
}

// Updated (after):
{
  field: 'momentumProb',
  headerName: 'MOMENTUM PROB',
  width: 100,
  renderCell: (params) => {
    const value = params.row.momentumProb; // 0-100
    
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
        <LinearProgress
          variant="determinate"
          value={value}
          sx={{
            width: '60px',
            height: '4px',
            borderRadius: '2px',
            backgroundColor: 'rgba(255,255,255,0.1)',
            '& .MuiLinearProgress-bar': {
              backgroundColor: '#3DFFA2',
              borderRadius: '2px',
            },
          }}
        />
        <Typography sx={{ fontSize: '12px', fontWeight: 500, fontFamily: 'JetBrains Mono' }}>
          {value}%
        </Typography>
      </Box>
    );
  },
}
```

**Required imports:**
```jsx
import { LinearProgress, Box, Typography } from '@mui/material';
```

**Test:**
- [ ] Green progress bar visible (shows momentum level)
- [ ] Percentage label below bar
- [ ] Bar width proportional to value (50% = half-filled, 100% = full)
- [ ] All other columns still visible
- [ ] No broken data

---

## STEP 5: Unify Status Badge Styling (15 minutes)

**What:** Make Pre-Release Signal and Post-Release Result badges use consistent styling.

**Create reusable badge component:**

```jsx
// Add this to a new file: components/StatusBadge.tsx

import { Box } from '@mui/material';

export const StatusBadge = ({ status }) => {
  const colorMap = {
    'BUY PRE-RELEASE': {
      bg: 'rgba(61, 255, 162, 0.2)',
      text: '#3DFFA2',
      icon: '✓',
    },
    'AVOID PRE-RELEASE': {
      bg: 'rgba(255, 71, 87, 0.2)',
      text: '#FF4757',
      icon: '✕',
    },
    'NEUTRAL / HOLD': {
      bg: 'rgba(255, 165, 2, 0.2)',
      text: '#FFA502',
      icon: '⚠',
    },
    'TARGET HIT / WIN': {
      bg: 'rgba(61, 255, 162, 0.2)',
      text: '#3DFFA2',
      icon: '✓',
    },
    'PREDICTION FAILED': {
      bg: 'rgba(255, 71, 87, 0.2)',
      text: '#FF4757',
      icon: '✕',
    },
    'CONTRARY SURGE': {
      bg: 'rgba(255, 165, 2, 0.2)',
      text: '#FFA502',
      icon: '⚠',
    },
    'HOLD VALIDATED': {
      bg: 'rgba(0, 180, 216, 0.2)',
      text: '#00B4D8',
      icon: '◯',
    },
  };

  const style = colorMap[status] || {
    bg: 'transparent',
    text: '#999',
    icon: '—',
  };

  return (
    <Box
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        backgroundColor: style.bg,
        color: style.text,
        padding: '4px 12px',
        borderRadius: '6px',
        fontSize: '11px',
        fontWeight: 500,
        border: `1px solid ${style.text}40`,
        whiteSpace: 'nowrap',
      }}
    >
      <span>{style.icon}</span>
      <span>{status}</span>
    </Box>
  );
};
```

**Then update Pre-Release Signal column:**

```jsx
// Current (before):
{
  field: 'preReleaseSignal',
  headerName: 'PRE-RELEASE SIGNAL',
  width: 140,
  renderCell: (params) => (
    <span>{params.row.preReleaseSignal}</span>
  ),
}

// Updated (after):
{
  field: 'preReleaseSignal',
  headerName: 'PRE-RELEASE SIGNAL',
  width: 140,
  renderCell: (params) => (
    <StatusBadge status={params.row.preReleaseSignal} />
  ),
}
```

**And Post-Release Result column:**

```jsx
// Current (before):
{
  field: 'postReleaseResult',
  headerName: 'POST-RELEASE RESULT',
  width: 140,
  renderCell: (params) => (
    <span>{params.row.postReleaseResult}</span>
  ),
}

// Updated (after):
{
  field: 'postReleaseResult',
  headerName: 'POST-RELEASE RESULT',
  width: 140,
  renderCell: (params) => (
    <StatusBadge status={params.row.postReleaseResult || '—'} />
  ),
}
```

**Test:**
- [ ] Both columns use colored badge style
- [ ] Icons visible (✓, ✕, ⚠, etc.)
- [ ] Colors match status meaning
- [ ] Badges are centered
- [ ] Text is readable
- [ ] No wrapping (use whiteSpace: 'nowrap')

---

## STEP 6: Add Row Tinting (Optional, but Recommended — 10 minutes)

**What:** Add subtle color wash to entire row based on Pre-Release Signal or Post-Release Result.

**Code change:**

```jsx
<DataGrid
  rows={data}
  columns={columns}
  rowHeight={48}
  columnHeaderHeight={44}
  getRowClassName={(params) => {
    const postResult = params.row.postReleaseResult;
    const preSignal = params.row.preReleaseSignal;
    
    // Prioritize post-result if it exists
    const status = postResult || preSignal;
    
    if (status?.includes('BUY') || status?.includes('WIN')) {
      return 'row-tint-green';
    }
    if (status?.includes('AVOID') || status?.includes('FAILED')) {
      return 'row-tint-red';
    }
    if (status?.includes('NEUTRAL') || status?.includes('CONTRARY') || status?.includes('HOLD')) {
      return 'row-tint-amber';
    }
    
    return '';
  }}
  sx={{
    '& .row-tint-green': {
      backgroundColor: 'rgba(61, 255, 162, 0.08)',
    },
    '& .row-tint-red': {
      backgroundColor: 'rgba(255, 71, 87, 0.08)',
    },
    '& .row-tint-amber': {
      backgroundColor: 'rgba(255, 165, 2, 0.08)',
    },
    // ... other sx props
  }}
/>
```

**Test:**
- [ ] Rows with "BUY/WIN" have green wash
- [ ] Rows with "AVOID/FAILED" have red wash
- [ ] Rows with "NEUTRAL/HOLD/CONTRARY" have amber wash
- [ ] Tint is subtle (not overwhelming)
- [ ] Text is still readable
- [ ] Hover effect still works

---

## STEP 7: Increase Grid Height to Show More Rows (5 minutes)

**What:** Make grid taller so ~50 rows fit on page without scrolling (depending on viewport).

**Code change:**

```jsx
<DataGrid
  rows={data}
  columns={columns}
  rowHeight={48}
  columnHeaderHeight={44}
  pageSizeOptions={[20, 50, 100]}
  initialState={{
    pagination: {
      paginationModel: {
        pageSize: 50,  // ← Default to 50 rows per page
        page: 0,
      },
    },
  }}
  sx={{
    height: 'calc(100vh - 160px)',  // ← Fill viewport, account for top bar + filter + pagination
    // ... other sx props
  }}
/>
```

**Test:**
- [ ] 50 rows fit with default pagination
- [ ] Pagination dropdown shows options: [20, 50, 100]
- [ ] Vertical scrolling works within grid
- [ ] All columns still visible (horizontal scroll if needed)
- [ ] Sidebar still visible on right

---

## SUMMARY: Before & After

| Aspect | Before | After |
|--------|--------|-------|
| Row Height | 40px (cramped) | 48px (breathing room) |
| Company Name | Hidden/truncated | Fully visible (2-line format) |
| Health Score | "77 PTS [B]" (text) | "B" (colored badge) |
| Momentum | "25%" (text only) | Progress bar + "25%" |
| Status Badges | Inconsistent styling | Unified template (icon + color) |
| Row Styling | Plain | Subtle color wash by status |
| Pagination | Fixed rows | 50 rows default, options [20/50/100] |

---

## Testing Checklist

After all steps, verify:

- [ ] **Data Integrity:**
  - [ ] All column data visible (no missing values)
  - [ ] Prices formatted correctly (₹, 2 decimals)
  - [ ] Market cap abbreviated (Cr)
  - [ ] Percentages correct (momentum, reactions)
  - [ ] Badges show correct status text

- [ ] **Layout:**
  - [ ] Row height is 48px (not cramped)
  - [ ] Headers are 44px (prominent)
  - [ ] Company names fully visible
  - [ ] All columns visible (no hidden columns)
  - [ ] Right sidebar visible (Avg Reaction, Q4 EPS, etc.)

- [ ] **Functionality:**
  - [ ] Sort works (click column header)
  - [ ] Search works (type in search bar)
  - [ ] Filters work (quick-filter pills)
  - [ ] Pagination works (next/previous pages)
  - [ ] Row expand works (if applicable)

- [ ] **Visual Polish:**
  - [ ] Health score badges are colored
  - [ ] Momentum bars are visible
  - [ ] Status badges have icons and colors
  - [ ] Row tinting is subtle (not overwhelming)
  - [ ] No text overflow or wrapping
  - [ ] No console errors/warnings

- [ ] **Light/Dark Mode:**
  - [ ] Light mode looks good (if applicable)
  - [ ] Dark mode looks good
  - [ ] Colors are readable in both modes

---

## If Something Breaks

If after a step something breaks:
1. **Stop** — don't proceed to next step
2. **Revert** — undo that step's changes
3. **Screenshot** — take screenshot of error
4. **Report** — tell me what broke and show screenshot

Do NOT continue to next steps if current step is broken.

---

## Expected Final Result

The grid should look **crisp, clean, and professional**:
- ✅ Proper spacing (breathing room)
- ✅ Clear visual hierarchy (colors, icons, typography)
- ✅ All data visible and readable
- ✅ Functionality intact (no broken features)
- ✅ Consistent styling (unified badge template)
- ✅ Subtle visual enhancements (row tinting, progress bars)

This is an **incremental, safe redesign** that improves the look without breaking functionality.
