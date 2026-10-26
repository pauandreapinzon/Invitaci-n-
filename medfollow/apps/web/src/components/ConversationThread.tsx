'use client';

import { useEffect, useRef } from 'react';
import { Box, Chip, Paper, Stack, Typography } from '@mui/material';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import PersonIcon from '@mui/icons-material/Person';
import { AUTHOR_LABELS, formatDateTime } from '@/lib/format';
import type { MessageItem } from '@/lib/types';

/**
 * Historial de la conversacion de WhatsApp.
 * Cada mensaje saliente indica si lo genero una plantilla determinista o un
 * modelo de lenguaje, requisito de trazabilidad clinica.
 */
export function ConversationThread({ messages, channel }: { messages: MessageItem[]; channel?: string }) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // El hilo se abre en el mensaje mas reciente, como cualquier chat.
  useEffect(() => {
    const node = scrollRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [messages]);

  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.5 }}>
        <Typography variant="h3">Conversacion</Typography>
        {channel ? <Chip size="small" variant="outlined" label={channel === 'WHATSAPP' ? 'WhatsApp' : 'Simulador'} /> : null}
        {messages.length ? (
          <Typography variant="caption" color="text.secondary">
            {messages.length} mensajes
          </Typography>
        ) : null}
      </Stack>

      {messages.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          Sin mensajes registrados.
        </Typography>
      ) : (
        <Stack ref={scrollRef} spacing={1.25} sx={{ maxHeight: 520, overflowY: 'auto', pr: 0.5 }}>
          {messages.map((message) => {
            const inbound = message.direction === 'INBOUND';
            const riskLevel = message.metadata?.riskLevel as string | undefined;
            return (
              <Box
                key={message.id}
                sx={{
                  alignSelf: inbound ? 'flex-start' : 'flex-end',
                  maxWidth: '86%',
                  bgcolor: inbound ? 'action.hover' : 'primary.main',
                  color: inbound ? 'text.primary' : 'primary.contrastText',
                  px: 1.5,
                  py: 1,
                  borderRadius: 2,
                  borderTopLeftRadius: inbound ? 4 : 16,
                  borderTopRightRadius: inbound ? 16 : 4,
                }}
              >
                <Stack direction="row" spacing={0.5} alignItems="center" sx={{ mb: 0.5, opacity: 0.85 }}>
                  {inbound ? <PersonIcon sx={{ fontSize: 14 }} /> : <SmartToyIcon sx={{ fontSize: 14 }} />}
                  <Typography variant="caption">
                    {AUTHOR_LABELS[message.author] ?? message.author} · {formatDateTime(message.createdAt)}
                  </Typography>
                </Stack>
                <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                  {message.body}
                </Typography>
                {!inbound ? (
                  <Typography variant="caption" sx={{ display: 'block', mt: 0.5, opacity: 0.8 }}>
                    {message.deterministic ? 'plantilla determinista' : `modelo ${message.aiModel ?? 'IA'}`}
                    {riskLevel ? ` · riesgo ${riskLevel}` : ''}
                    {message.aiLatencyMs ? ` · ${message.aiLatencyMs} ms` : ''}
                  </Typography>
                ) : null}
              </Box>
            );
          })}
        </Stack>
      )}
    </Paper>
  );
}
