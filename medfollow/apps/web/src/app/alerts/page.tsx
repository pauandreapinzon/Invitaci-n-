'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import { AppShell } from '@/components/AppShell';
import { AlertQueue } from '@/components/AlertQueue';
import { apiFetch } from '@/lib/api';
import type { AlertListItem } from '@/lib/types';

const FILTERS = [
  { value: 'OPEN', label: 'Abiertas' },
  { value: 'ACKNOWLEDGED', label: 'Tomadas' },
  { value: 'RESOLVED', label: 'Resueltas' },
  { value: 'ALL', label: 'Todas' },
];

export default function AlertsPage() {
  const [status, setStatus] = useState('OPEN');
  const [alerts, setAlerts] = useState<AlertListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resolving, setResolving] = useState<string | null>(null);
  const [note, setNote] = useState('Paciente contactado por enfermeria. Se verifico la conducta indicada.');

  const load = useCallback(() => {
    const query = status === 'ALL' ? '' : `status=${status}&`;
    apiFetch<{ items: AlertListItem[] }>(`/alerts?${query}take=100`)
      .then((data) => setAlerts(data.items))
      .catch((cause) => setError(cause instanceof Error ? cause.message : 'Error al cargar alertas'));
  }, [status]);

  useEffect(load, [load]);

  async function acknowledge(id: string) {
    await apiFetch(`/alerts/${id}/acknowledge`, { method: 'PATCH' });
    load();
  }

  async function confirmResolve() {
    if (!resolving) return;
    await apiFetch(`/alerts/${resolving}/resolve`, { method: 'PATCH', body: JSON.stringify({ resolutionNote: note }) });
    setResolving(null);
    load();
  }

  return (
    <AppShell>
      <Stack spacing={0.5} sx={{ mb: 2 }}>
        <Typography variant="h1">Gestion de alertas</Typography>
        <Typography variant="body2" color="text.secondary">
          Cada alerta registra la regla clinica que la genero, su evidencia y el escalamiento esperado.
        </Typography>
      </Stack>

      <ToggleButtonGroup
        size="small"
        exclusive
        value={status}
        onChange={(_, value) => value && setStatus(value)}
        sx={{ mb: 2 }}
      >
        {FILTERS.map((filter) => (
          <ToggleButton key={filter.value} value={filter.value}>
            {filter.label}
          </ToggleButton>
        ))}
      </ToggleButtonGroup>

      {error ? <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert> : null}

      {!alerts ? (
        <Box sx={{ display: 'grid', placeItems: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      ) : (
        <AlertQueue alerts={alerts} title={`${alerts.length} alertas`} onAcknowledge={acknowledge} onResolve={setResolving} />
      )}

      <Dialog open={Boolean(resolving)} onClose={() => setResolving(null)} fullWidth maxWidth="sm">
        <DialogTitle>Cerrar alerta</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            La nota de resolucion queda en la historia de seguimiento y en la bitacora de auditoria.
          </Typography>
          <TextField
            label="Nota de resolucion"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            multiline
            minRows={3}
            fullWidth
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setResolving(null)}>Cancelar</Button>
          <Button variant="contained" onClick={confirmResolve} disabled={note.trim().length < 5}>
            Cerrar alerta
          </Button>
        </DialogActions>
      </Dialog>
    </AppShell>
  );
}
