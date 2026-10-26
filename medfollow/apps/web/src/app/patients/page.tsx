'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import { AppShell } from '@/components/AppShell';
import { RiskChip } from '@/components/RiskChip';
import { apiFetch } from '@/lib/api';
import { relativeTime } from '@/lib/format';
import type { PatientListItem } from '@/lib/types';

const RISK_FILTERS = [
  { value: 'ALL', label: 'Todos' },
  { value: 'RED', label: 'Rojos' },
  { value: 'YELLOW', label: 'Amarillos' },
  { value: 'GREEN', label: 'Verdes' },
];

export default function PatientsPage() {
  const [patients, setPatients] = useState<PatientListItem[] | null>(null);
  const [riskLevel, setRiskLevel] = useState('ALL');
  const [search, setSearch] = useState('');
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    const params = new URLSearchParams({ take: '100' });
    if (riskLevel !== 'ALL') params.set('riskLevel', riskLevel);
    if (search.trim()) params.set('search', search.trim());
    apiFetch<{ items: PatientListItem[]; total: number }>(`/patients?${params.toString()}`)
      .then((data) => {
        setPatients(data.items);
        setTotal(data.total);
      })
      .catch((cause) => setError(cause instanceof Error ? cause.message : 'Error al cargar pacientes'));
  }, [riskLevel, search]);

  useEffect(() => {
    const timer = setTimeout(load, 200);
    return () => clearTimeout(timer);
  }, [load]);

  return (
    <AppShell>
      <Stack spacing={0.5} sx={{ mb: 2 }}>
        <Typography variant="h1">Pacientes en seguimiento</Typography>
        <Typography variant="body2" color="text.secondary">
          Ordenados por puntaje de riesgo. Los datos de contacto se almacenan cifrados y se muestran enmascarados.
        </Typography>
      </Stack>

      {/* Los filtros van en una sola fila sobre la tabla. */}
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mb: 2 }} alignItems={{ sm: 'center' }}>
        <ToggleButtonGroup size="small" exclusive value={riskLevel} onChange={(_, value) => value && setRiskLevel(value)}>
          {RISK_FILTERS.map((filter) => (
            <ToggleButton key={filter.value} value={filter.value}>
              {filter.label}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
        <TextField
          size="small"
          label="Buscar por nombre"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          sx={{ minWidth: 240 }}
        />
        <Box sx={{ flexGrow: 1 }} />
        <Typography variant="body2" color="text.secondary">
          {total} pacientes
        </Typography>
      </Stack>

      {error ? <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert> : null}

      {!patients ? (
        <Box sx={{ display: 'grid', placeItems: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      ) : (
        <Paper variant="outlined" sx={{ overflowX: 'auto' }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Riesgo</TableCell>
                <TableCell>Paciente</TableCell>
                <TableCell>Edad</TableCell>
                <TableCell>Comorbilidades</TableCell>
                <TableCell>Telefono</TableCell>
                <TableCell>Ultimo contacto</TableCell>
                <TableCell align="right" />
              </TableRow>
            </TableHead>
            <TableBody>
              {patients.map((patient) => (
                <TableRow key={patient.id} hover>
                  <TableCell>
                    <RiskChip level={patient.currentRiskLevel} score={patient.currentRiskScore} />
                  </TableCell>
                  <TableCell>{patient.fullName}</TableCell>
                  <TableCell>{patient.ageYears}</TableCell>
                  <TableCell>
                    <Typography variant="body2" color="text.secondary">
                      {patient.comorbidities.length ? patient.comorbidities.join(', ') : 'ninguna registrada'}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" color="text.secondary">
                      {patient.phoneMasked}
                    </Typography>
                  </TableCell>
                  <TableCell>{relativeTime(patient.lastContactAt)}</TableCell>
                  <TableCell align="right">
                    <Button component={Link} href={`/patients/${patient.id}`} size="small">
                      Abrir
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Paper>
      )}
    </AppShell>
  );
}
