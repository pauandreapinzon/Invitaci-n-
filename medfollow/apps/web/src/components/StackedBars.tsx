'use client';

import { useState } from 'react';
import {
  Box,
  Button,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
  useTheme,
} from '@mui/material';
import TableRowsIcon from '@mui/icons-material/TableRows';
import BarChartIcon from '@mui/icons-material/BarChart';
import { RISK_COLORS, RISK_LABELS } from '@/theme';

export interface DailyAlerts {
  date: string;
  RED: number;
  YELLOW: number;
  GREEN?: number;
}

const WIDTH = 720;
const HEIGHT = 210;
const PADDING = { top: 18, right: 8, bottom: 26, left: 30 };
const SEGMENT_GAP = 2;
const BAR_MAX = 18;
const SERIES: Array<'RED' | 'YELLOW'> = ['RED', 'YELLOW'];

/**
 * Alertas por dia y nivel (barras apiladas).
 *
 * Decisiones de la grafica:
 *  - un solo eje de valor; la altura codifica cantidad de alertas;
 *  - separacion de 2 px del color de fondo entre segmentos apilados;
 *  - extremo superior redondeado 4 px, anclado a la linea base;
 *  - leyenda con etiqueta de texto y total escrito sobre cada barra, de modo
 *    que el amarillo (bajo contraste sobre fondo claro) nunca informa solo;
 *  - vista de tabla equivalente para lectura exacta y lectores de pantalla.
 */
export function StackedBars({ data, title }: { data: DailyAlerts[]; title: string }) {
  const theme = useTheme();
  const [view, setView] = useState<'chart' | 'table'>('chart');

  const totals = data.map((d) => d.RED + d.YELLOW);
  const maxTotal = Math.max(1, ...totals);
  const plotWidth = WIDTH - PADDING.left - PADDING.right;
  const plotHeight = HEIGHT - PADDING.top - PADDING.bottom;
  const slot = plotWidth / Math.max(1, data.length);
  const barWidth = Math.min(BAR_MAX, slot * 0.6);
  const scale = (value: number) => (value / maxTotal) * plotHeight;
  const baseline = PADDING.top + plotHeight;

  return (
    <Paper variant="outlined" sx={{ p: 2, height: '100%' }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
        <Typography variant="h3">{title}</Typography>
        <Button
          size="small"
          startIcon={view === 'chart' ? <TableRowsIcon /> : <BarChartIcon />}
          onClick={() => setView(view === 'chart' ? 'table' : 'chart')}
        >
          {view === 'chart' ? 'Ver tabla' : 'Ver grafica'}
        </Button>
      </Stack>

      <Stack direction="row" spacing={2} sx={{ mb: 1 }}>
        {SERIES.map((level) => (
          <Stack key={level} direction="row" spacing={0.75} alignItems="center">
            <Box aria-hidden sx={{ width: 10, height: 10, borderRadius: level === 'RED' ? 0 : '50%', bgcolor: RISK_COLORS[level] }} />
            <Typography variant="caption" color="text.secondary">
              {RISK_LABELS[level]}
            </Typography>
          </Stack>
        ))}
      </Stack>

      {view === 'table' ? (
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Fecha</TableCell>
              <TableCell align="right">{RISK_LABELS.RED}</TableCell>
              <TableCell align="right">{RISK_LABELS.YELLOW}</TableCell>
              <TableCell align="right">Total</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {data.map((row) => (
              <TableRow key={row.date}>
                <TableCell>{row.date}</TableCell>
                <TableCell align="right">{row.RED}</TableCell>
                <TableCell align="right">{row.YELLOW}</TableCell>
                <TableCell align="right">{row.RED + row.YELLOW}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <Box
          component="svg"
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          role="img"
          aria-label={`${title}. Serie diaria de alertas rojas y amarillas.`}
          sx={{ width: '100%', height: 'auto', display: 'block' }}
        >
          {/* Eje de referencia discreto */}
          <line x1={PADDING.left} y1={baseline} x2={WIDTH - PADDING.right} y2={baseline} stroke={theme.palette.divider} strokeWidth={1} />
          <line x1={PADDING.left} y1={PADDING.top} x2={WIDTH - PADDING.right} y2={PADDING.top} stroke={theme.palette.divider} strokeWidth={1} strokeDasharray="2 4" />
          <text x={PADDING.left - 6} y={PADDING.top + 4} textAnchor="end" fontSize="10" fill={theme.palette.text.secondary}>
            {maxTotal}
          </text>
          <text x={PADDING.left - 6} y={baseline + 3} textAnchor="end" fontSize="10" fill={theme.palette.text.secondary}>
            0
          </text>

          {data.map((row, index) => {
            const x = PADDING.left + slot * index + (slot - barWidth) / 2;
            const total = row.RED + row.YELLOW;
            let cursor = baseline;
            const label = row.date.slice(5);

            return (
              <g key={row.date}>
                {SERIES.map((level, seriesIndex) => {
                  const value = row[level];
                  if (!value) return null;
                  const rawHeight = scale(value);
                  const height = Math.max(2, rawHeight - (seriesIndex === 0 ? 0 : SEGMENT_GAP));
                  const y = cursor - height;
                  cursor -= rawHeight;
                  // El extremo redondeado va solo en el segmento superior de la pila.
                  const isTop = SERIES.slice(seriesIndex + 1).every((s) => !row[s]);
                  return (
                    <Tooltip key={level} title={`${label}: ${value} ${RISK_LABELS[level].toLowerCase()}`} followCursor>
                      <rect
                        x={x}
                        y={y}
                        width={barWidth}
                        height={height}
                        rx={isTop ? 4 : 0}
                        fill={RISK_COLORS[level]}
                      />
                    </Tooltip>
                  );
                })}
                {total > 0 ? (
                  <text x={x + barWidth / 2} y={baseline - scale(total) - 6} textAnchor="middle" fontSize="10" fontWeight="600" fill={theme.palette.text.primary}>
                    {total}
                  </text>
                ) : null}
                {index % 2 === 0 ? (
                  <text x={x + barWidth / 2} y={HEIGHT - 8} textAnchor="middle" fontSize="10" fill={theme.palette.text.secondary}>
                    {label}
                  </text>
                ) : null}
              </g>
            );
          })}
        </Box>
      )}
    </Paper>
  );
}
