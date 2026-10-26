'use client';

import { Box, Paper, Stack, Tooltip, Typography, useTheme } from '@mui/material';
import { RISK_COLORS } from '@/theme';
import type { RiskLevel } from '@/lib/types';

export interface RankedItem {
  label: string;
  value: number;
  level?: RiskLevel;
  hint?: string;
}

/**
 * Ranking horizontal (una sola serie: no necesita leyenda).
 * El valor va escrito al final de cada barra, por lo que la lectura no
 * depende de estimar longitudes ni del color.
 */
export function RankedBars({ items, title, emptyLabel = 'Sin datos en el periodo' }: { items: RankedItem[]; title: string; emptyLabel?: string }) {
  const theme = useTheme();
  const max = Math.max(1, ...items.map((i) => i.value));

  return (
    <Paper variant="outlined" sx={{ p: 2, height: '100%' }}>
      <Typography variant="h3" sx={{ mb: 1.5 }}>
        {title}
      </Typography>
      {items.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          {emptyLabel}
        </Typography>
      ) : (
        <Stack spacing={1.25}>
          {items.map((item) => (
            <Box key={item.label}>
              <Stack direction="row" justifyContent="space-between" alignItems="baseline" spacing={1}>
                <Tooltip title={item.hint ?? item.label}>
                  <Typography variant="body2" noWrap sx={{ maxWidth: '78%' }}>
                    {item.label}
                  </Typography>
                </Tooltip>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  {item.value}
                </Typography>
              </Stack>
              <Box sx={{ mt: 0.5, height: 8, bgcolor: theme.palette.action.hover, borderRadius: 1 }}>
                <Box
                  sx={{
                    height: 8,
                    width: `${(item.value / max) * 100}%`,
                    minWidth: 6,
                    borderRadius: '0 4px 4px 0',
                    bgcolor: item.level ? RISK_COLORS[item.level] : theme.palette.primary.main,
                  }}
                />
              </Box>
            </Box>
          ))}
        </Stack>
      )}
    </Paper>
  );
}
