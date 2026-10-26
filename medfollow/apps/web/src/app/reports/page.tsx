'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Grid,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';
import { AppShell } from '@/components/AppShell';
import { KpiTile } from '@/components/KpiTile';
import { ApiError, apiFetch } from '@/lib/api';
import { ALERT_STATUS_LABELS, CHECKIN_STATUS_LABELS, formatDate } from '@/lib/format';
import { RISK_COLORS, RISK_LABELS } from '@/theme';
import type { Overview, RiskLevel } from '@/lib/types';

interface ReportPayload {
  period: { from: string; to: string };
  followUpPlans: number;
  alerts: Array<{ level: RiskLevel; status: string; count: number }>;
  checkIns: Array<{ status: string; count: number }>;
  riskEvaluations: Array<{ level: RiskLevel; count: number }>;
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export default function ReportsPage() {
  const [from, setFrom] = useState(toIsoDate(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)));
  const [to, setTo] = useState(toIsoDate(new Date()));
  const [report, setReport] = useState<ReportPayload | null>(null);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    Promise.all([
      apiFetch<ReportPayload>(`/reports/followup?from=${from}&to=${to}`),
      apiFetch<Overview>('/metrics/overview'),
    ])
      .then(([reportData, overviewData]) => {
        setReport(reportData);
        setOverview(overviewData);
      })
      .catch((cause) => {
        const forbidden = cause instanceof ApiError && cause.status === 403;
        setError(
          forbidden
            ? 'Los reportes institucionales estan disponibles para los roles de direccion medica (administracion y medico).'
            : cause instanceof Error
              ? cause.message
              : 'Error al generar el reporte',
        );
      });
  }, [from, to]);

  useEffect(load, [load]);

  function downloadCsv() {
    if (!report) return;
    const rows: string[][] = [
      ['seccion', 'clave', 'valor'],
      ['periodo', 'desde', report.period.from],
      ['periodo', 'hasta', report.period.to],
      ['seguimientos', 'planes creados', String(report.followUpPlans)],
      ...report.alerts.map((a) => ['alertas', `${RISK_LABELS[a.level]} / ${ALERT_STATUS_LABELS[a.status] ?? a.status}`, String(a.count)]),
      ...report.checkIns.map((c) => ['contactos', CHECKIN_STATUS_LABELS[c.status] ?? c.status, String(c.count)]),
      ...report.riskEvaluations.map((r) => ['evaluaciones de riesgo', RISK_LABELS[r.level], String(r.count)]),
    ];
    const csv = rows.map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `medfollow-reporte-${report.period.from.slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <AppShell>
      <Stack spacing={0.5} sx={{ mb: 2 }}>
        <Typography variant="h1">Reportes del programa</Typography>
        <Typography variant="body2" color="text.secondary">
          Indicadores de operacion y resultado para la direccion medica y la auditoria institucional.
        </Typography>
      </Stack>

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mb: 2.5 }} alignItems={{ sm: 'center' }}>
        <TextField size="small" type="date" label="Desde" value={from} onChange={(e) => setFrom(e.target.value)} InputLabelProps={{ shrink: true }} />
        <TextField size="small" type="date" label="Hasta" value={to} onChange={(e) => setTo(e.target.value)} InputLabelProps={{ shrink: true }} />
        <Box sx={{ flexGrow: 1 }} />
        <Button startIcon={<DownloadIcon />} variant="outlined" onClick={downloadCsv} disabled={!report}>
          Exportar CSV
        </Button>
      </Stack>

      {error ? <Alert severity="info" sx={{ mb: 2 }}>{error}</Alert> : null}

      {error ? null : !report || !overview ? (
        <Box sx={{ display: 'grid', placeItems: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      ) : (
        <Stack spacing={2.5}>
          <Grid container spacing={2}>
            <Grid item xs={12} sm={6} md={3}>
              <KpiTile label="Planes de seguimiento" value={report.followUpPlans} detail={`Periodo ${formatDate(report.period.from)} a ${formatDate(report.period.to)}`} />
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <KpiTile label="Contacto efectivo" value={overview.followUps.contactRate} suffix="%" detail="Seguimientos respondidos sobre enviados" />
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <KpiTile label="Adherencia reportada" value={overview.adherence.adherenceRate} suffix="%" detail={`${overview.adherence.reports} reportes`} />
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <KpiTile
                label="Alertas rojas abiertas"
                value={overview.alerts.red}
                accent={RISK_COLORS.RED}
                detail={`${overview.alerts.resolved7d} cerradas en 7 dias`}
              />
            </Grid>
          </Grid>

          <Grid container spacing={2}>
            <Grid item xs={12} md={4}>
              <Paper variant="outlined" sx={{ p: 2, height: '100%' }}>
                <Typography variant="h3" sx={{ mb: 1 }}>
                  Alertas del periodo
                </Typography>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Nivel</TableCell>
                      <TableCell>Estado</TableCell>
                      <TableCell align="right">Total</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {report.alerts.map((row) => (
                      <TableRow key={`${row.level}-${row.status}`}>
                        <TableCell>{RISK_LABELS[row.level]}</TableCell>
                        <TableCell>{ALERT_STATUS_LABELS[row.status] ?? row.status}</TableCell>
                        <TableCell align="right">{row.count}</TableCell>
                      </TableRow>
                    ))}
                    {report.alerts.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={3}>
                          <Typography variant="body2" color="text.secondary">
                            Sin alertas en el periodo
                          </Typography>
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </TableBody>
                </Table>
              </Paper>
            </Grid>
            <Grid item xs={12} md={4}>
              <Paper variant="outlined" sx={{ p: 2, height: '100%' }}>
                <Typography variant="h3" sx={{ mb: 1 }}>
                  Contactos de seguimiento
                </Typography>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Estado</TableCell>
                      <TableCell align="right">Total</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {report.checkIns.map((row) => (
                      <TableRow key={row.status}>
                        <TableCell>{CHECKIN_STATUS_LABELS[row.status] ?? row.status}</TableCell>
                        <TableCell align="right">{row.count}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Paper>
            </Grid>
            <Grid item xs={12} md={4}>
              <Paper variant="outlined" sx={{ p: 2, height: '100%' }}>
                <Typography variant="h3" sx={{ mb: 1 }}>
                  Evaluaciones de riesgo
                </Typography>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Nivel</TableCell>
                      <TableCell align="right">Total</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {report.riskEvaluations.map((row) => (
                      <TableRow key={row.level}>
                        <TableCell>{RISK_LABELS[row.level]}</TableCell>
                        <TableCell align="right">{row.count}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Paper>
            </Grid>
          </Grid>
        </Stack>
      )}
    </AppShell>
  );
}
