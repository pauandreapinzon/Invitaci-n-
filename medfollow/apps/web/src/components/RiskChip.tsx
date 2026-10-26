'use client';

import { Box, Chip, Tooltip } from '@mui/material';
import { RISK_COLORS, RISK_LABELS } from '@/theme';
import type { RiskLevel } from '@/lib/types';

const RISK_HINTS: Record<RiskLevel, string> = {
  GREEN: 'Evolucion esperada: continua el seguimiento automatico',
  YELLOW: 'Requiere seguimiento humano en el turno',
  RED: 'Requiere contacto inmediato o remision',
};

/**
 * El nivel de riesgo se comunica con forma, color y texto a la vez.
 * Nunca solo con color (requisito de accesibilidad y de seguridad clinica).
 */
export function RiskChip({ level, score, size = 'small' }: { level: RiskLevel; score?: number; size?: 'small' | 'medium' }) {
  const label = score === undefined ? RISK_LABELS[level] : `${RISK_LABELS[level]} · ${score}`;
  return (
    <Tooltip title={RISK_HINTS[level]}>
      <Chip
        size={size}
        variant="outlined"
        label={label}
        icon={
          <Box
            component="span"
            aria-hidden
            sx={{
              width: 10,
              height: 10,
              borderRadius: level === 'RED' ? 0 : '50%',
              transform: level === 'RED' ? 'rotate(45deg)' : 'none',
              bgcolor: RISK_COLORS[level],
              ml: 1,
            }}
          />
        }
        sx={{ borderColor: RISK_COLORS[level], fontWeight: 600 }}
      />
    </Tooltip>
  );
}
