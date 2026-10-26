'use client';

import { Box, Paper, Stack, Tooltip, Typography } from '@mui/material';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import type { ReactNode } from 'react';

/**
 * Tarjeta de indicador: el numero es el protagonista (jerarquia tipografica),
 * la etiqueta lo nombra y el color solo acompana.
 */
export function KpiTile({
  label,
  value,
  suffix,
  detail,
  accent,
  hint,
  icon,
}: {
  label: string;
  value: string | number;
  suffix?: string;
  detail?: string;
  accent?: string;
  hint?: string;
  icon?: ReactNode;
}) {
  return (
    <Paper variant="outlined" sx={{ p: 2, height: '100%', position: 'relative' }}>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
        {accent ? (
          <Box aria-hidden sx={{ width: 4, height: 18, borderRadius: 1, bgcolor: accent }} />
        ) : null}
        <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>
          {label}
        </Typography>
        {icon}
        {hint ? (
          <Tooltip title={hint}>
            <InfoOutlinedIcon sx={{ fontSize: 15, color: 'text.secondary' }} />
          </Tooltip>
        ) : null}
      </Stack>
      <Stack direction="row" spacing={0.5} alignItems="baseline">
        <Typography component="p" sx={{ fontSize: '2rem', fontWeight: 650, lineHeight: 1.1 }}>
          {value}
        </Typography>
        {suffix ? (
          <Typography variant="body2" color="text.secondary">
            {suffix}
          </Typography>
        ) : null}
      </Stack>
      {detail ? (
        <Typography variant="caption" color="text.secondary">
          {detail}
        </Typography>
      ) : null}
    </Paper>
  );
}
