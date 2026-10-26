'use client';

import { useEffect, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  AppBar,
  Box,
  Chip,
  Container,
  Divider,
  Drawer,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Stack,
  Toolbar,
  Tooltip,
  Typography,
} from '@mui/material';
import MonitorHeartIcon from '@mui/icons-material/MonitorHeart';
import DashboardIcon from '@mui/icons-material/Dashboard';
import GroupsIcon from '@mui/icons-material/Groups';
import NotificationsActiveIcon from '@mui/icons-material/NotificationsActive';
import RuleIcon from '@mui/icons-material/Rule';
import AssessmentIcon from '@mui/icons-material/Assessment';
import LogoutIcon from '@mui/icons-material/Logout';
import DarkModeIcon from '@mui/icons-material/DarkMode';
import LightModeIcon from '@mui/icons-material/LightMode';
import { useSession } from '@/app/providers';
import { getToken } from '@/lib/api';

const NAV = [
  { href: '/', label: 'Panel', icon: <DashboardIcon /> },
  { href: '/alerts', label: 'Alertas', icon: <NotificationsActiveIcon /> },
  { href: '/patients', label: 'Pacientes', icon: <GroupsIcon /> },
  { href: '/protocols', label: 'Protocolos', icon: <RuleIcon /> },
  // Los reportes institucionales son de direccion medica (ADMIN y DOCTOR).
  { href: '/reports', label: 'Reportes', icon: <AssessmentIcon />, roles: ['ADMIN', 'DOCTOR'] },
];

const ROLE_LABELS: Record<string, string> = { ADMIN: 'Administracion', DOCTOR: 'Medico', NURSE: 'Enfermeria' };
const DRAWER_WIDTH = 232;

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout, mode, toggleMode } = useSession();

  useEffect(() => {
    if (!getToken()) router.replace('/login');
  }, [router]);

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      <AppBar position="fixed" color="default" elevation={0} sx={{ zIndex: (t) => t.zIndex.drawer + 1, borderBottom: 1, borderColor: 'divider' }}>
        <Toolbar sx={{ gap: 1.5 }}>
          <MonitorHeartIcon color="primary" />
          <Typography variant="h2" sx={{ fontSize: '1.1rem' }}>
            MedFollow AI
          </Typography>
          <Chip size="small" variant="outlined" label="Seguimiento postconsulta" sx={{ display: { xs: 'none', sm: 'inline-flex' } }} />
          <Box sx={{ flexGrow: 1 }} />
          <Stack direction="row" spacing={1.5} alignItems="center">
            {user ? (
              <Box sx={{ textAlign: 'right', display: { xs: 'none', md: 'block' } }}>
                <Typography variant="body2" sx={{ fontWeight: 600, lineHeight: 1.2 }}>
                  {user.fullName}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {ROLE_LABELS[user.role] ?? user.role} · {user.hospital?.name}
                </Typography>
              </Box>
            ) : null}
            <Tooltip title={mode === 'light' ? 'Modo oscuro' : 'Modo claro'}>
              <IconButton onClick={toggleMode} size="small">
                {mode === 'light' ? <DarkModeIcon fontSize="small" /> : <LightModeIcon fontSize="small" />}
              </IconButton>
            </Tooltip>
            <Tooltip title="Cerrar sesion">
              <IconButton onClick={logout} size="small">
                <LogoutIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Stack>
        </Toolbar>
      </AppBar>

      <Drawer
        variant="permanent"
        sx={{
          width: DRAWER_WIDTH,
          flexShrink: 0,
          display: { xs: 'none', md: 'block' },
          '& .MuiDrawer-paper': { width: DRAWER_WIDTH, boxSizing: 'border-box', borderRight: 1, borderColor: 'divider' },
        }}
      >
        <Toolbar />
        <List sx={{ px: 1, pt: 1 }}>
          {NAV.filter((item) => !item.roles || !user || item.roles.includes(user.role)).map((item) => (
            <ListItemButton
              key={item.href}
              component={Link}
              href={item.href}
              selected={item.href === '/' ? pathname === '/' : pathname.startsWith(item.href)}
              sx={{ borderRadius: 2, mb: 0.5 }}
            >
              <ListItemIcon sx={{ minWidth: 38 }}>{item.icon}</ListItemIcon>
              <ListItemText primary={item.label} primaryTypographyProps={{ variant: 'body2', fontWeight: 600 }} />
            </ListItemButton>
          ))}
        </List>
        <Divider sx={{ mx: 2, my: 1 }} />
        <Box sx={{ px: 2.5 }}>
          <Typography variant="caption" color="text.secondary">
            La clasificacion de riesgo la realiza un motor determinista
            versionado; la IA interpreta el lenguaje del paciente y redacta los
            mensajes, no decide alertas.
          </Typography>
        </Box>
      </Drawer>

      <Box component="main" sx={{ flexGrow: 1, width: 0 }}>
        <Toolbar />
        <Container maxWidth="xl" sx={{ py: 3 }}>
          {children}
        </Container>
      </Box>
    </Box>
  );
}
