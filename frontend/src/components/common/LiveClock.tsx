import React, { useState, useEffect } from 'react';
import { Typography, Box } from '@mui/material';
import { keyframes } from '@mui/system';
import { useThemeMode } from '../../theme/ThemeContext';

const digitEnter = keyframes`
  0% {
    transform: translateY(-2px);
    opacity: 0.5;
    color: #3b82f6;
  }
  20% {
    opacity: 1;
    color: #60a5fa;
  }
  100% {
    transform: translateY(0);
    color: inherit;
  }
`;

export const LiveClock: React.FC = () => {
  const { tokens } = useThemeMode();
  const [time, setTime] = useState('');

  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Kolkata',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
      });
      // Ensure hour is 2 digits if the formatter doesn't strictly enforce it
      let formatted = formatter.format(now);
      // Sometimes it returns "4:30:00 PM" instead of "04:30:00 PM"
      const parts = formatted.split(':');
      if (parts[0].length === 1) {
        formatted = '0' + formatted;
      }
      setTime(formatted);
    };

    updateClock();
    const interval = setInterval(updateClock, 1000);

    return () => clearInterval(interval);
  }, []);

  if (!time) return null;

  return (
    <Box sx={{ display: 'flex', alignItems: 'center' }}>
      <Typography
        component="div"
        sx={{
          fontSize: '15px',
          fontWeight: 600,
          color: tokens.text.primary,
          fontVariantNumeric: 'tabular-nums',
          letterSpacing: '0.5px',
          userSelect: 'none',
          display: 'flex',
          alignItems: 'center',
          lineHeight: 1,
        }}
      >
        {time.split('').map((char, index) => {
          // Spaces don't need to animate or might cause tiny shifting if we give them transform
          const isSpace = char === ' ';
          return (
            <Box
              component="span"
              key={`${char}-${index}`}
              sx={{
                display: 'inline-block',
                animation: isSpace ? 'none' : `${digitEnter} 0.5s cubic-bezier(0.4, 0, 0.2, 1) forwards`,
                // Make sure colons or AM/PM also don't shift width
                minWidth: char === ':' ? '4px' : 'auto',
                textAlign: 'center',
              }}
            >
              {char}
            </Box>
          );
        })}
      </Typography>
    </Box>
  );
};
