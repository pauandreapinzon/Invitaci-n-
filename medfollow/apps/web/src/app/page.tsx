'use client';

import { useEffect, useState } from 'react';
import { Alert, Box, CircularProgress, Grid, Stack, Typography } from '@mui/material';
import { AppShell } from '@/components/AppShell';
import { KpiTile } from '@/components/KpiTile';
import { StackedBars, type DailyAlerts } from '@/components/StackedBars';
import { RankedBars, type RankedItem } from '@/components/RankedBars';
import { AlertQueue } from '@/components/AlertQueue';
import { apiFetch } from '@/lib/api';
import { RISK_COLORS } from '@/theme';
import type { AlertListItem, Overview, RiskLevel } from '@/lib/types';

interface TopRule {
  ruleId: string;
  title: string;
  level: RiskLevel;
  count: number;
}

export default function DashboardPage() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [series, setSeries] = useState<DailyAlerts[]>([]);
  const [topRules, setTopRules] = useState<TopRule[]>([]);
  const [alerts, setAlerts] = useState<AlertListItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      apiFetch<Overview>('/metrics/overview'),
      apiFetch<DailyAlerts[]>('/metrics/alerts-timeseries?days=14'),
      apiFetch<TopRule[]>('/metrics/top-rules?days=30'),
      apiFetch<{ items: AlertListItem[] }>('/alerts?status=OPEN&take=6'),
    ])
      .then(([overviewData, seriesData, rulesData, alertsData]) => {
        setOverview(overviewData);
        setSeries(seriesData);
        setTopRules(rulesData);
        setAlerts(alertsData.items);
      })
      .catch((cause) => setError(cause instanceof Error ? cause.message : 'Error al cargar el panel'));
  }, []);

  const rankedRules: RankedItem[] = topRules.map((rule) => ({
    label: rule.title,
    value: rule.count,
    level: rule.level,
    hint: `${rule.ruleId}: ${rule.title}`,
  }));

  return (
    <AppShell>
      <Stack spacing={0.5} sx={{ mb: 2.5 }}>
        <Typography variant="h1">Pacientes monitoreados</Typography>
        <Typography variant="body2" color="text.secondary">
          Estado del programa de seguimiento postconsulta de medicina general.
        </Typography>
      </Stack>

      {error ? <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert> : null}

      {!overview ? (
        <Box sx={{ display: 'grid', placeItems: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      ) : (
        <Stack spacing={2.5}>
          <Grid container spacing={2}>
            <Grid item xs={12} sm={6} md={3}>
              <KpiTile label="Pacientes activos" value={overview.patients.active} detail="En seguimiento automatizado" />
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <KpiTile
                label="Verdes"
                value={overview.patients.green}
                accent={RISK_COLORS.GREEN}
                detail="Evolucion esperada"
              />
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <KpiTile
                label="Amarillos"
                value={overview.patients.yellow}
                accent={RISK_COLORS.YELLOW}
                detail="Seguimiento humano en el turno"
              />
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <KpiTile
                label="Rojos"
                value={overview.patients.red}
                accent={RISK_COLORS.RED}
                detail="Contacto inmediato o remision"
              />
            </Grid>
          </Grid>

          <Grid container spacing={2}>
            <Grid item xs={12} sm={6} md={3}>
              <KpiTile
                label="Contacto efectivo"
                value={overview.followUps.contactRate}
                suffix="%"
                detail={`${overview.followUps.checkInsAnswered} de ${overview.followUps.checkInsSent} seguimientos respondidos`}
                hint="Meta institucional: mas del 80% de contacto efectivo"
              />
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <KpiTile
                label="Alertas abiertas"
                value={overview.alerts.open}
                detail={`${overview.alerts.red} rojas · ${overview.alerts.yellow} amarillas`}
              />
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <KpiTile
                label="Adherencia reportada"
                value={overview.adherence.adherenceRate}
                suffix="%"
                detail={`${overview.adherence.reports} reportes de tratamiento`}
                hint="Porcentaje de reportes sin dosis omitidas"
              />
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <KpiTile
                label="Respuesta a alertas"
                value={overview.alerts.avgTimeToAckMinutes === null ? '-' : Math.round(overview.alerts.avgTimeToAckMinutes)}
                suffix="min"
                detail={`${overview.alerts.resolved7d} alertas cerradas en 7 dias`}
                hint="Tiempo promedio entre la deteccion y la toma de la alerta por el equipo"
              />
            </Grid>
          </Grid>

          <Grid container spacing={2}>
            <Grid item xs={12} md={7}>
              <StackedBars data={series} title="Alertas generadas por dia" />
            </Grid>
            <Grid item xs={12} md={5}>
              <RankedBars
                title="Reglas clinicas que mas se disparan (30 dias)"
                items={rankedRules}
                emptyLabel="Aun no se han disparado reglas de riesgo"
              />
            </Grid>
          </Grid>

          <AlertQueue alerts={alerts} title="Alertas de alta prioridad" compact />

          <Typography variant="caption" color="text.secondary">
            Canal: {overview.channel.messagesIn7d} mensajes recibidos y {overview.channel.messagesOut7d} enviados en los
            ultimos 7 dias. {overview.channel.deterministic} respuestas se generaron con plantillas deterministas y{' '}
            {overview.channel.aiGenerated} con modelo de lenguaje.
          </Typography>
        </Stack>
      )}
    </AppShell>
  );
}
