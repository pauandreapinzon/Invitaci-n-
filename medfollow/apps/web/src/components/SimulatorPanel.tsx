'use client';

import { useState } from 'react';
import { Alert, Button, Chip, Paper, Stack, TextField, Typography } from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import { apiFetch } from '@/lib/api';
import { RiskChip } from './RiskChip';
import type { RiskLevel, TriggeredRule } from '@/lib/types';

interface SimulationResult {
  reply?: string;
  intent: string;
  alertId?: string;
  evaluation?: { level: RiskLevel; score: number; triggered: TriggeredRule[]; recommendedAction: string };
}

const EXAMPLES = [
  'Tengo fiebre de 39 grados y me cuesta respirar, me siento peor',
  'Estoy mucho mejor, ya casi no me duele la garganta',
  'Olvide dos dosis del medicamento',
  'Me duele el pecho desde esta manana',
];

/**
 * Simulador de mensajes del paciente.
 * Ejecuta el mismo flujo que el canal de WhatsApp (extraccion de senales,
 * motor de riesgo, alertas y respuesta), lo que permite validar protocolos
 * con el equipo clinico sin usar el canal real.
 */
export function SimulatorPanel({ patientId, onSent }: { patientId: string; onSent: () => void }) {
  const [text, setText] = useState(EXAMPLES[0]);
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  async function send() {
    setSending(true);
    setError(null);
    try {
      const response = await apiFetch<SimulationResult>('/simulator/messages', {
        method: 'POST',
        body: JSON.stringify({ patientId, text }),
      });
      setResult(response);
      onSent();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No fue posible simular el mensaje');
    } finally {
      setSending(false);
    }
  }

  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Typography variant="h3" sx={{ mb: 0.5 }}>
        Simulador de mensaje del paciente
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
        Ejecuta el mismo pipeline del canal de WhatsApp: extraccion de senales, motor clinico, alertas y respuesta.
      </Typography>

      <Stack direction="row" spacing={0.75} flexWrap="wrap" sx={{ mb: 1.5, gap: 0.75 }}>
        {EXAMPLES.map((example) => (
          <Chip key={example} size="small" variant="outlined" label={example} onClick={() => setText(example)} />
        ))}
      </Stack>

      <Stack spacing={1.5}>
        <TextField
          label="Mensaje del paciente"
          value={text}
          onChange={(event) => setText(event.target.value)}
          multiline
          minRows={2}
          fullWidth
        />
        <Button variant="contained" startIcon={<SendIcon />} onClick={send} disabled={sending || text.trim().length === 0}>
          {sending ? 'Procesando...' : 'Enviar como paciente'}
        </Button>

        {error ? <Alert severity="error">{error}</Alert> : null}

        {result ? (
          <Stack spacing={1}>
            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" sx={{ gap: 1 }}>
              {result.evaluation ? <RiskChip level={result.evaluation.level} score={result.evaluation.score} /> : null}
              <Chip size="small" variant="outlined" label={`intencion: ${result.intent}`} />
              {result.alertId ? <Chip size="small" color="warning" label="alerta generada" /> : null}
            </Stack>
            {result.evaluation?.triggered.length ? (
              <Typography variant="caption" color="text.secondary">
                Reglas disparadas: {result.evaluation.triggered.map((rule) => rule.ruleId).join(', ')}
              </Typography>
            ) : null}
            {result.reply ? (
              <Alert severity="info" icon={false}>
                <Typography variant="caption" color="text.secondary" display="block">
                  Respuesta enviada al paciente
                </Typography>
                <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                  {result.reply}
                </Typography>
              </Alert>
            ) : null}
          </Stack>
        ) : null}
      </Stack>
    </Paper>
  );
}
