'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Box, Button, Divider, Paper, Stack, TextField, Typography } from '@mui/material';
import MonitorHeartIcon from '@mui/icons-material/MonitorHeart';
import { login } from '@/lib/api';
import { useSession } from '@/app/providers';

const DEMO_ACCOUNTS = [
  { email: 'medico@hospital.gov.co', role: 'Medico' },
  { email: 'enfermeria@hospital.gov.co', role: 'Enfermeria' },
  { email: 'admin@hospital.gov.co', role: 'Administracion' },
];

export default function LoginPage() {
  const router = useRouter();
  const { setUser } = useSession();
  const [email, setEmail] = useState('enfermeria@hospital.gov.co');
  const [password, setPassword] = useState('MedFollow.2026');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const user = await login(email, password);
      setUser(user);
      router.replace('/');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No fue posible iniciar sesion');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center', px: 2, bgcolor: 'background.default' }}>
      <Paper variant="outlined" sx={{ p: 4, width: '100%', maxWidth: 420 }}>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
          <MonitorHeartIcon color="primary" />
          <Typography variant="h1" sx={{ fontSize: '1.35rem' }}>
            MedFollow AI
          </Typography>
        </Stack>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          Seguimiento clinico postconsulta. Acceso exclusivo para personal autorizado del hospital.
        </Typography>

        <form onSubmit={submit}>
          <Stack spacing={2}>
            <TextField
              label="Correo institucional"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
              required
              fullWidth
            />
            <TextField
              label="Contrasena"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
              fullWidth
            />
            {error ? <Alert severity="error">{error}</Alert> : null}
            <Button type="submit" variant="contained" size="large" disabled={loading}>
              {loading ? 'Verificando...' : 'Ingresar'}
            </Button>
          </Stack>
        </form>

        <Divider sx={{ my: 3 }} />
        <Typography variant="caption" color="text.secondary" component="div" sx={{ mb: 1 }}>
          Usuarios de demostracion (clave MedFollow.2026):
        </Typography>
        <Stack spacing={0.5}>
          {DEMO_ACCOUNTS.map((account) => (
            <Button
              key={account.email}
              size="small"
              variant="text"
              sx={{ justifyContent: 'flex-start', textTransform: 'none' }}
              onClick={() => {
                setEmail(account.email);
                setPassword('MedFollow.2026');
              }}
            >
              {account.role}: {account.email}
            </Button>
          ))}
        </Stack>
        <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 2 }}>
          Todo acceso a datos de pacientes queda registrado en la bitacora de auditoria.
        </Typography>
      </Paper>
    </Box>
  );
}
