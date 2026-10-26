'use client';

import { useEffect, useState } from 'react';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Chip,
  CircularProgress,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { AppShell } from '@/components/AppShell';
import { RiskChip } from '@/components/RiskChip';
import { apiFetch } from '@/lib/api';
import { ESCALATION_LABELS } from '@/lib/format';
import type { RiskLevel } from '@/lib/types';

interface ProtocolSummary {
  id: string;
  code: string;
  version: string;
  name: string;
  specialty: string;
  checkInDays: number[];
  questionCount: number;
  ruleCount: number;
  diagnosisKeywords: string[];
  redFlagsForPatient: string[];
}

interface GlobalRule {
  id: string;
  version: string;
  level: RiskLevel;
  score: number;
  title: string;
  rationale: string;
  action: string;
  escalation: string;
}

export default function ProtocolsPage() {
  const [protocols, setProtocols] = useState<ProtocolSummary[] | null>(null);
  const [rules, setRules] = useState<GlobalRule[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([apiFetch<ProtocolSummary[]>('/protocols'), apiFetch<GlobalRule[]>('/protocols/rules/global')])
      .then(([protocolsData, rulesData]) => {
        setProtocols(protocolsData);
        setRules(rulesData);
      })
      .catch((cause) => setError(cause instanceof Error ? cause.message : 'Error al cargar protocolos'));
  }, []);

  return (
    <AppShell>
      <Stack spacing={0.5} sx={{ mb: 2 }}>
        <Typography variant="h1">Protocolos y reglas clinicas</Typography>
        <Typography variant="body2" color="text.secondary">
          El motor de riesgo es determinista y versionado: estas son exactamente las reglas con las que se clasifica a
          cada paciente, en el orden en que se evaluan.
        </Typography>
      </Stack>

      {error ? <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert> : null}

      {!protocols ? (
        <Box sx={{ display: 'grid', placeItems: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      ) : (
        <Stack spacing={2.5}>
          <Paper variant="outlined" sx={{ overflowX: 'auto' }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Codigo</TableCell>
                  <TableCell>Protocolo</TableCell>
                  <TableCell>Version</TableCell>
                  <TableCell>Contactos</TableCell>
                  <TableCell>Preguntas</TableCell>
                  <TableCell>Reglas aplicables</TableCell>
                  <TableCell>Diagnosticos que mapea</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {protocols.map((protocol) => (
                  <TableRow key={protocol.id} hover>
                    <TableCell>{protocol.code}</TableCell>
                    <TableCell>{protocol.name}</TableCell>
                    <TableCell>v{protocol.version}</TableCell>
                    <TableCell>{protocol.checkInDays.length ? `dias ${protocol.checkInDays.join(', ')}` : '-'}</TableCell>
                    <TableCell>{protocol.questionCount}</TableCell>
                    <TableCell>{protocol.ruleCount}</TableCell>
                    <TableCell>
                      <Typography variant="caption" color="text.secondary">
                        {protocol.diagnosisKeywords.length ? protocol.diagnosisKeywords.slice(0, 4).join(', ') : 'protocolo general'}
                      </Typography>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Paper>

          <Box>
            <Typography variant="h2" sx={{ mb: 1 }}>
              Reglas globales (banderas rojas de medicina general)
            </Typography>
            {rules.map((rule) => (
              <Accordion key={rule.id} disableGutters variant="outlined" sx={{ '&:before': { display: 'none' }, mb: 1 }}>
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" sx={{ gap: 1 }}>
                    <RiskChip level={rule.level} />
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      {rule.title}
                    </Typography>
                    <Chip size="small" variant="outlined" label={`${rule.id} v${rule.version}`} />
                    <Chip size="small" variant="outlined" label={ESCALATION_LABELS[rule.escalation] ?? rule.escalation} />
                  </Stack>
                </AccordionSummary>
                <AccordionDetails>
                  <Typography variant="body2" sx={{ mb: 1 }}>
                    {rule.rationale}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Accion: {rule.action} · aporta {rule.score} puntos al puntaje de riesgo
                  </Typography>
                </AccordionDetails>
              </Accordion>
            ))}
          </Box>
        </Stack>
      )}
    </AppShell>
  );
}
