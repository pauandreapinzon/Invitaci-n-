'use client';

import Link from 'next/link';
import {
  Box,
  Button,
  Chip,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import { RiskChip } from './RiskChip';
import { ALERT_STATUS_LABELS, ESCALATION_LABELS, relativeTime } from '@/lib/format';
import type { AlertListItem } from '@/lib/types';

/**
 * Cola de alertas ordenada por prioridad clinica (rojo primero) y antiguedad.
 * Cada fila expone el motivo y el escalamiento esperado, no solo el color.
 */
export function AlertQueue({
  alerts,
  title = 'Cola de alertas',
  onAcknowledge,
  onResolve,
  compact = false,
}: {
  alerts: AlertListItem[];
  title?: string;
  onAcknowledge?: (id: string) => void;
  onResolve?: (id: string) => void;
  compact?: boolean;
}) {
  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1.5 }}>
        <Typography variant="h3">{title}</Typography>
        {compact ? (
          <Button component={Link} href="/alerts" size="small" endIcon={<ArrowForwardIcon />}>
            Ver todas
          </Button>
        ) : null}
      </Stack>

      {alerts.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          No hay alertas pendientes.
        </Typography>
      ) : (
        <Box sx={{ overflowX: 'auto' }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Nivel</TableCell>
                <TableCell>Paciente</TableCell>
                <TableCell>Motivo clinico</TableCell>
                {!compact ? <TableCell>Escalamiento</TableCell> : null}
                <TableCell>Estado</TableCell>
                <TableCell>Detectada</TableCell>
                {onAcknowledge || onResolve ? <TableCell align="right">Acciones</TableCell> : null}
              </TableRow>
            </TableHead>
            <TableBody>
              {alerts.map((alert) => (
                <TableRow key={alert.id} hover>
                  <TableCell>
                    <RiskChip level={alert.level} />
                  </TableCell>
                  <TableCell>
                    <Button component={Link} href={`/patients/${alert.patient.id}`} size="small" sx={{ textTransform: 'none', p: 0, minWidth: 0 }}>
                      {alert.patient.fullName}
                    </Button>
                    {alert.plan ? (
                      <Typography variant="caption" color="text.secondary" display="block">
                        {alert.plan.diagnosisText}
                      </Typography>
                    ) : null}
                  </TableCell>
                  <TableCell sx={{ maxWidth: 360 }}>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      {alert.title}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {alert.summary.length > 160 ? `${alert.summary.slice(0, 160)}...` : alert.summary}
                    </Typography>
                  </TableCell>
                  {!compact ? (
                    <TableCell>
                      <Chip size="small" variant="outlined" label={ESCALATION_LABELS[alert.escalation] ?? alert.escalation} />
                    </TableCell>
                  ) : null}
                  <TableCell>
                    <Typography variant="body2">{ALERT_STATUS_LABELS[alert.status] ?? alert.status}</Typography>
                    {alert.assignedTo ? (
                      <Typography variant="caption" color="text.secondary">
                        {alert.assignedTo.fullName}
                      </Typography>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2">{relativeTime(alert.createdAt)}</Typography>
                  </TableCell>
                  {onAcknowledge || onResolve ? (
                  <TableCell align="right">
                    <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                      {onAcknowledge && alert.status === 'OPEN' ? (
                        <Button size="small" variant="outlined" onClick={() => onAcknowledge(alert.id)}>
                          Tomar
                        </Button>
                      ) : null}
                      {onResolve && alert.status !== 'RESOLVED' ? (
                        <Button size="small" variant="contained" onClick={() => onResolve(alert.id)}>
                          Cerrar
                        </Button>
                      ) : null}
                    </Stack>
                  </TableCell>
                  ) : null}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
      )}
    </Paper>
  );
}
