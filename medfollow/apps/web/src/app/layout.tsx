import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: 'MedFollow AI - Seguimiento clinico postconsulta',
  description:
    'Dashboard hospitalario de seguimiento postconsulta: pacientes monitoreados, cola de alertas clinicas y trazabilidad del motor de riesgo.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <body style={{ margin: 0 }}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
