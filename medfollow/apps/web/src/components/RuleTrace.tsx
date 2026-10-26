'use client';

import { Accordion, AccordionDetails, AccordionSummary, Box, Chip, Paper, Stack, Typography } from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { RiskChip } from './RiskChip';
import { ESCALATION_LABELS, formatDateTime } from '@/lib/format';
import type { RiskScoreRecord } from '@/lib/types';

const MISSING_LABELS: Record<string, string> = {
  adherencia: 'adherencia al tratamiento',
  diaSeguimiento: 'dia de seguimiento',
};

function describeMissing(token: string): string {
  if (MISSING_LABELS[token]) return MISSING_LABELS[token];
  const [kind, value] = token.split(':');
  if (kind === 'signo') return `signo vital: ${value}`;
  if (kind === 'evolucion') return `evolucion de ${value}`;
  if (kind === 'severidad') return `severidad de ${value}`;
  return token;
}

/**
 * Trazabilidad de la decision del motor clinico: que reglas se dispararon,
 * con que evidencia y que version de motor y protocolo las evaluo.
 * Es la vista que permite auditar una alerta sin leer el codigo.
 */
export function RuleTrace({ record }: { record?: RiskScoreRecord }) {
  if (!record) {
    return (
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Typography variant="h3" sx={{ mb: 1 }}>
          Trazabilidad del riesgo
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Aun no se ha evaluado el riesgo de este paciente.
        </Typography>
      </Paper>
    );
  }

  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap" sx={{ mb: 1.5 }}>
        <Typography variant="h3">Trazabilidad del riesgo</Typography>
        <RiskChip level={record.level} score={record.score} />
        <Chip size="small" variant="outlined" label={ESCALATION_LABELS[record.escalation] ?? record.escalation} />
      </Stack>

      <Typography variant="caption" color="text.secondary" component="div" sx={{ mb: 1.5 }}>
        Motor determinista v{record.engineVersion} · protocolo {record.protocolCode} v{record.protocolVersion} ·
        evaluado {formatDateTime(record.evaluatedAt)}
      </Typography>

      {record.triggeredRules.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          Ninguna regla de riesgo se disparo en la ultima evaluacion.
        </Typography>
      ) : (
        <Box>
          {record.triggeredRules.map((rule) => (
            <Accordion key={rule.ruleId} disableGutters variant="outlined" sx={{ '&:before': { display: 'none' }, mb: 1 }}>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                  <RiskChip level={rule.level} />
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    {rule.title}
                  </Typography>
                  <Chip size="small" label={`${rule.ruleId} v${rule.ruleVersion}`} variant="outlined" />
                  <Chip size="small" label={`+${rule.score} pts`} variant="outlined" />
                </Stack>
              </AccordionSummary>
              <AccordionDetails>
                <Stack spacing={1}>
                  <Box>
                    <Typography variant="caption" color="text.secondary">
                      Evidencia que disparo la regla
                    </Typography>
                    <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
                      {rule.evidence.map((item) => (
                        <li key={item}>
                          <Typography variant="body2">{item}</Typography>
                        </li>
                      ))}
                    </ul>
                  </Box>
                  <Box>
                    <Typography variant="caption" color="text.secondary">
                      Justificacion clinica
                    </Typography>
                    <Typography variant="body2">{rule.rationale}</Typography>
                  </Box>
                  <Box>
                    <Typography variant="caption" color="text.secondary">
                      Accion esperada
                    </Typography>
                    <Typography variant="body2">{rule.action}</Typography>
                  </Box>
                </Stack>
              </AccordionDetails>
            </Accordion>
          ))}
        </Box>
      )}

      {record.missingData.length > 0 ? (
        <Box sx={{ mt: 1.5 }}>
          <Typography variant="caption" color="text.secondary">
            Datos que el seguimiento aun debe completar
          </Typography>
          <Stack direction="row" spacing={0.75} flexWrap="wrap" sx={{ mt: 0.5, gap: 0.75 }}>
            {record.missingData.map((token) => (
              <Chip key={token} size="small" variant="outlined" label={describeMissing(token)} />
            ))}
          </Stack>
        </Box>
      ) : null}
    </Paper>
  );
}
