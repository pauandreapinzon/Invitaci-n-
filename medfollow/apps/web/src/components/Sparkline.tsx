'use client';

import { Box, useTheme } from '@mui/material';
import { RISK_COLORS } from '@/theme';
import type { RiskLevel } from '@/lib/types';

/**
 * Evolucion del puntaje de riesgo del paciente (una sola serie, sin ejes).
 * Trazo de 2 px y marcador final de 8 px sobre el valor vigente.
 */
export function Sparkline({ points, level }: { points: number[]; level: RiskLevel }) {
  const theme = useTheme();
  const width = 160;
  const height = 40;
  const padding = 5;

  if (points.length === 0) return null;
  const series = points.length === 1 ? [points[0], points[0]] : points;
  const max = Math.max(10, ...series);
  const stepX = (width - padding * 2) / (series.length - 1);
  const coords = series.map((value, index) => ({
    x: padding + index * stepX,
    y: height - padding - (value / max) * (height - padding * 2),
  }));
  const last = coords[coords.length - 1];

  return (
    <Box
      component="svg"
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`Evolucion del puntaje de riesgo: ${points.join(', ')}`}
      sx={{ width, height, display: 'block' }}
    >
      <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} stroke={theme.palette.divider} strokeWidth={1} />
      <polyline
        points={coords.map((c) => `${c.x},${c.y}`).join(' ')}
        fill="none"
        stroke={RISK_COLORS[level]}
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <circle cx={last.x} cy={last.y} r={4} fill={RISK_COLORS[level]} stroke={theme.palette.background.paper} strokeWidth={2} />
    </Box>
  );
}
