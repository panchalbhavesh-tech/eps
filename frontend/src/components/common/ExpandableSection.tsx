import React, { useState } from 'react';
import { Box, Typography, Collapse, IconButton } from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { useThemeMode } from '../../theme/ThemeContext';

export interface ExpandableSectionProps {
  title: React.ReactNode;
  defaultExpanded?: boolean;
  children: React.ReactNode;
}

export const ExpandableSection: React.FC<ExpandableSectionProps> = ({ 
  title, 
  defaultExpanded = false, 
  children 
}) => {
  const { tokens } = useThemeMode();
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <Box sx={{ mb: 3 }}>
      {/* Header Area */}
      <Box 
        onClick={() => setExpanded(!expanded)}
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          cursor: 'pointer',
          py: 1.25,
          px: 2,
          mb: expanded ? 0 : 0,
          backgroundColor: expanded ? 'rgba(255,255,255,0.02)' : 'transparent',
          borderBottom: `1px solid ${tokens.border.main}`,
          borderLeft: `3px solid ${expanded ? tokens.primary.main : 'transparent'}`,
          transition: 'all 0.2s ease-in-out',
          '&:hover': {
            backgroundColor: 'rgba(255,255,255,0.04)',
            borderLeft: `3px solid ${expanded ? tokens.primary.main : tokens.border.main}`
          }
        }}
      >
        <Typography 
          variant="h6" 
          sx={{ 
            color: expanded ? tokens.primary.main : tokens.text.primary, 
            fontSize: '12px', 
            fontWeight: 800, 
            textTransform: 'uppercase', 
            letterSpacing: '0.5px',
            display: 'flex',
            alignItems: 'center',
            gap: 1.5,
            transition: 'color 0.2s'
          }}
        >
          {title}
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center' }}>
          <Typography sx={{ color: tokens.text.secondary, fontSize: '10px', textTransform: 'uppercase', fontWeight: 600, mr: 1, opacity: expanded ? 0 : 0.5, transition: 'opacity 0.2s' }}>
            {expanded ? '' : 'Expand'}
          </Typography>
          <IconButton 
            size="small" 
            sx={{ 
              p: 0, 
              color: expanded ? tokens.primary.main : tokens.text.secondary,
              transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
              transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
            }}
          >
            <ExpandMoreIcon fontSize="small" />
          </IconButton>
        </Box>
      </Box>

      {/* Expandable Content Area */}
      <Collapse in={expanded} timeout="auto" unmountOnExit>
        <Box sx={{ mt: 1 }}>
          {children}
        </Box>
      </Collapse>
    </Box>
  );
};
