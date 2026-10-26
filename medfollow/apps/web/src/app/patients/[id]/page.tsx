'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import {
  Alert,
  Box,
  Chip,
  CircularProgress,
  Divider,
  Grid,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import { AppShell } from '@/components/AppShell';
import { RiskChip } from '@/components/RiskChip';
import { RuleTrace } from '@/components/RuleTrace';
import { ConversationThread } from '@/components/ConversationThread';
import { SimulatorPanel } from '@/components/SimulatorPanel';
import { Sparkline } from '@/components/Sparkline';
import { apiFetch } from '@/lib/api';
import { CHECKIN_STATUS_LABELS, PLAN_STATUS_LABELS, SOURCE_LABELS, formatDate, formatDateTime, relativeTime } from '@/lib/format';
import type { ConversationDetail, PatientDetail } from '@/lib/types';

const TREND_LABELS: Record<string, string> = {
  IMPROVING: 'mejorando',
  STABLE: 'igual',
  WORSENING: 'empeorando',
};
const SEVERITY_LABELS: Record<string, string> = { MILD: 'leve', MODERATE: 'moderado', SEVERE: 'severo' };

export default function PatientDetailPage() {
  const params = useParams<{ id: string }>();
  const patientId = params.id;
  const [patient, setPatient] = useState<PatientDetail | null>(null);
  const [conversation, setConversation] = useState<ConversationDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    apiFetch<PatientDetail>(`/patients/${patientId}`)
      .then(setPatient)
      .catch((cause) => setError(cause instanceof Error ? cause.message : 'Error al cargar el paciente'));

    apiFetch<Array<{ id: string }>>(`/conversations?patientId=${patientId}`)
      .then(async (conversations) => {
        if (conversations.length === 0) {
          setConversation(null);
          return;
        }
        setConversation(await apiFetch<ConversationDetail>(`/conversations/${conversations[0].id}`));
      })
      .catch(() => setConversation(null));
  }, [patientId]);

  useEffect(load, [load]);

  if (error) {
    return (
      <AppShell>
        <Alert severity="error">{error}</Alert>
      </AppShell>
    );
  }

  if (!patient) {
    return (
      <AppShell>
        <Box sx={{ display: 'grid', placeItems: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      </AppShell>
    );
  }

  const plan = patient.plans[0];
  const riskHistory = [...patient.riskScores].reverse().map((score) => score.score);

  return (
    <AppShell>
      <Paper variant="outlined" sx={{ p: 2.5, mb: 2.5 }}>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} justifyContent="space-between">
          <Box>
            <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap" sx={{ gap: 1 }}>
              <Typography variant="h1">{patient.fullName}</Typography>
              <RiskChip level={patient.currentRiskLevel} score={patient.currentRiskScore} size="medium" />
            </Stack>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              {patient.ageYears} anos · {patient.sex ?? 'sexo no registrado'}
              {patient.pregnant ? ' · en embarazo' : ''} · {patient.phoneMasked} · ultimo contacto{' '}
              {relativeTime(patient.lastContactAt)}
            </Typography>
            <Stack direction="row" spacing={0.75} sx={{ mt: 1, gap: 0.75 }} flexWrap="wrap">
              {patient.comorbidities.map((comorbidity) => (
                <Chip key={comorbidity} size="small" variant="outlined" label={comorbidity} />
              ))}
              {patient.consents[0] ? (
                <Chip
                  size="small"
                  variant="outlined"
                  color={patient.consents[0].status === 'GRANTED' ? 'success' : 'default'}
                  label={`consentimiento ${patient.consents[0].status === 'GRANTED' ? 'otorgado' : patient.consents[0].status.toLowerCase()} v${patient.consents[0].textVersion}`}
                />
              ) : null}
            </Stack>
          </Box>
          {riskHistory.length > 0 ? (
            <Box>
              <Typography variant="caption" color="text.secondary">
                Puntaje de riesgo en el tiempo
              </Typography>
              <Sparkline points={riskHistory} level={patient.currentRiskLevel} />
            </Box>
          ) : null}
        </Stack>
      </Paper>

      <Grid container spacing={2.5}>
        <Grid item xs={12} lg={7}>
          <Stack spacing={2.5}>
            <RuleTrace record={patient.riskScores[0]} />

            {plan ? (
              <Paper variant="outlined" sx={{ p: 2 }}>
                <Typography variant="h3" sx={{ mb: 1 }}>
                  Plan de seguimiento
                </Typography>
                <Typography variant="body2">
                  <strong>{plan.diagnosisText}</strong>
                  {plan.diagnosisCode ? ` (${plan.diagnosisCode})` : ''} · protocolo {plan.protocolCode} v
                  {plan.protocolVersion}
                </Typography>
                <Typography variant="caption" color="text.secondary" component="div" sx={{ mb: 1.5 }}>
                  Consulta del {formatDate(plan.consultationAt)}
                  {plan.doctor ? ` · ${plan.doctor.fullName}` : ''} · estado {PLAN_STATUS_LABELS[plan.status] ?? plan.status.toLowerCase()}
                </Typography>

                {plan.instructions ? (
                  <Typography variant="body2" sx={{ mb: 1.5 }}>
                    Indicaciones: {plan.instructions}
                  </Typography>
                ) : null}

                <Typography variant="caption" color="text.secondary">
                  Tratamiento
                </Typography>
                <Table size="small" sx={{ mb: 2 }}>
                  <TableHead>
                    <TableRow>
                      <TableCell>Medicamento</TableCell>
                      <TableCell>Dosis</TableCell>
                      <TableCell>Frecuencia</TableCell>
                      <TableCell>Duracion</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {plan.medications.map((medication) => (
                      <TableRow key={medication.id}>
                        <TableCell>{medication.name}</TableCell>
                        <TableCell>{medication.dose}</TableCell>
                        <TableCell>cada {medication.frequencyHours} h</TableCell>
                        <TableCell>{medication.durationDays} dias</TableCell>
                      </TableRow>
                    ))}
                    {plan.medications.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4}>
                          <Typography variant="body2" color="text.secondary">
                            Sin medicamentos formulados
                          </Typography>
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </TableBody>
                </Table>

                <Typography variant="caption" color="text.secondary">
                  Contactos programados
                </Typography>
                <Stack direction="row" spacing={0.75} sx={{ mt: 0.5, gap: 0.75 }} flexWrap="wrap">
                  {plan.checkIns.map((checkIn) => (
                    <Chip
                      key={checkIn.id}
                      size="small"
                      variant="outlined"
                      label={`dia ${checkIn.dayOffset}: ${CHECKIN_STATUS_LABELS[checkIn.status] ?? checkIn.status}`}
                    />
                  ))}
                </Stack>

                {plan.plainLanguageExplanation ? (
                  <>
                    <Divider sx={{ my: 2 }} />
                    <Typography variant="caption" color="text.secondary">
                      Explicacion enviada al paciente
                    </Typography>
                    <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', mt: 0.5 }}>
                      {plan.plainLanguageExplanation}
                    </Typography>
                  </>
                ) : null}
              </Paper>
            ) : null}

            <Paper variant="outlined" sx={{ p: 2 }}>
              <Typography variant="h3" sx={{ mb: 1.5 }}>
                Senales clinicas registradas
              </Typography>
              <Box sx={{ overflowX: 'auto' }}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Sintoma</TableCell>
                      <TableCell>Estado</TableCell>
                      <TableCell>Severidad</TableCell>
                      <TableCell>Evolucion</TableCell>
                      <TableCell>Origen</TableCell>
                      <TableCell>Reportado</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {patient.symptoms.slice(0, 12).map((symptom) => (
                      <TableRow key={symptom.id}>
                        <TableCell>{symptom.label}</TableCell>
                        <TableCell>{symptom.present ? 'presente' : 'ausente'}</TableCell>
                        <TableCell>{symptom.severity ? SEVERITY_LABELS[symptom.severity] ?? symptom.severity : '-'}</TableCell>
                        <TableCell>{symptom.trend ? TREND_LABELS[symptom.trend] ?? symptom.trend : '-'}</TableCell>
                        <TableCell>{SOURCE_LABELS[symptom.source] ?? symptom.source}</TableCell>
                        <TableCell>{formatDateTime(symptom.reportedAt)}</TableCell>
                      </TableRow>
                    ))}
                    {patient.symptoms.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6}>
                          <Typography variant="body2" color="text.secondary">
                            Sin sintomas registrados
                          </Typography>
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </TableBody>
                </Table>
              </Box>

              {patient.vitals.length > 0 ? (
                <Stack direction="row" spacing={0.75} sx={{ mt: 1.5, gap: 0.75 }} flexWrap="wrap">
                  {patient.vitals.slice(0, 8).map((vital) => (
                    <Chip key={vital.id} size="small" label={`${vital.metric}: ${vital.value} ${vital.unit}`} variant="outlined" />
                  ))}
                </Stack>
              ) : null}
            </Paper>
          </Stack>
        </Grid>

        <Grid item xs={12} lg={5}>
          <Stack spacing={2.5}>
            <ConversationThread messages={conversation?.messages ?? []} channel={conversation?.channel} />
            <SimulatorPanel patientId={patientId} onSent={load} />
          </Stack>
        </Grid>
      </Grid>
    </AppShell>
  );
}
