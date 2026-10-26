import { ConfigService } from '@nestjs/config';
import { createHmac } from 'crypto';
import { WhatsAppService } from './whatsapp.service';
import { ConsoleWhatsAppProvider } from './providers/console.provider';

const APP_SECRET = 'secreto-de-prueba';

function buildService(values: Record<string, unknown> = {}): WhatsAppService {
  const config = {
    get: (key: string) =>
      ({
        'whatsapp.provider': 'console',
        'whatsapp.meta.verifyToken': 'token-verificacion',
        'whatsapp.meta.appSecret': APP_SECRET,
        ...values,
      })[key],
  } as unknown as ConfigService;
  return new WhatsAppService(config, new ConsoleWhatsAppProvider());
}

describe('WhatsAppService', () => {
  it('usa el canal de consola cuando no hay credenciales', () => {
    expect(buildService().providerName).toBe('console');
  });

  it('valida el handshake de verificacion de Meta', () => {
    const service = buildService();
    expect(service.verifyMetaChallenge('subscribe', 'token-verificacion')).toBe(true);
    expect(service.verifyMetaChallenge('subscribe', 'otro-token')).toBe(false);
    expect(service.verifyMetaChallenge('unsubscribe', 'token-verificacion')).toBe(false);
  });

  it('acepta solo webhooks con firma valida', () => {
    const service = buildService();
    const body = Buffer.from(JSON.stringify({ entry: [] }));
    const signature = `sha256=${createHmac('sha256', APP_SECRET).update(body).digest('hex')}`;

    expect(service.verifyMetaSignature(body, signature)).toBe(true);
    expect(service.verifyMetaSignature(body, 'sha256=firmafalsa')).toBe(false);
    expect(service.verifyMetaSignature(body, undefined)).toBe(false);
  });

  it('normaliza los mensajes entrantes de Meta', () => {
    const service = buildService();
    const messages = service.parseMetaPayload({
      entry: [
        {
          changes: [
            {
              value: {
                messages: [
                  { from: '573001112233', id: 'wamid.1', type: 'text', text: { body: 'Tengo fiebre' }, timestamp: '1760000000' },
                  { from: '573001112233', id: 'wamid.2', type: 'image' },
                  { from: '573001112233', id: 'wamid.3', type: 'text', text: { body: '   ' } },
                ],
              },
            },
          ],
        },
      ],
    });

    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({ from: '+573001112233', text: 'Tengo fiebre', providerMessageId: 'wamid.1' });
  });

  it('normaliza los mensajes entrantes de Twilio', () => {
    const service = buildService();
    const message = service.parseTwilioPayload({
      From: 'whatsapp:+573001112233',
      Body: 'Olvide una dosis',
      MessageSid: 'SM123',
    });
    expect(message).toMatchObject({ from: '+573001112233', text: 'Olvide una dosis', providerMessageId: 'SM123' });
    expect(service.parseTwilioPayload({ From: '', Body: '' })).toBeUndefined();
  });
});
