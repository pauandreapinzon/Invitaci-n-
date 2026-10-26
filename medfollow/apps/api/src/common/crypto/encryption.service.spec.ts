import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import { EncryptionService } from './encryption.service';

function buildService(overrides: Record<string, unknown> = {}): EncryptionService {
  const values: Record<string, unknown> = {
    'phi.encryptionKey': randomBytes(32).toString('base64'),
    'phi.hashKey': randomBytes(32).toString('base64'),
    env: 'test',
    ...overrides,
  };
  const config = { get: (key: string) => values[key] } as unknown as ConfigService;
  const service = new EncryptionService(config);
  service.onModuleInit();
  return service;
}

describe('EncryptionService', () => {
  it('cifra y descifra datos sensibles sin perder informacion', () => {
    const service = buildService();
    const plaintext = 'Juan Perez Gomez - CC 1020304050';
    const encrypted = service.encrypt(plaintext);

    expect(encrypted).not.toContain('Juan');
    expect(encrypted.startsWith('v1:')).toBe(true);
    expect(service.decrypt(encrypted)).toBe(plaintext);
  });

  it('produce un criptograma distinto en cada cifrado (vector de inicializacion aleatorio)', () => {
    const service = buildService();
    expect(service.encrypt('mismo dato')).not.toBe(service.encrypt('mismo dato'));
  });

  it('falla al descifrar si el contenido fue alterado (autenticidad AES-GCM)', () => {
    const service = buildService();
    const [prefix, iv, tag, ciphertext] = service.encrypt('dato clinico').split(':');
    const tampered = [prefix, iv, tag, Buffer.from('otro contenido').toString('base64')].join(':');
    expect(() => service.decrypt(tampered)).toThrow();
  });

  it('genera un hash estable del telefono para buscar sin almacenarlo en claro', () => {
    const service = buildService();
    const hash = service.hash('+57 300 111 2233');
    expect(hash).toHaveLength(64);
    expect(service.hash('3001112233')).toBe(hash);
    expect(service.hashEquals(hash, service.hash('+573001112233'))).toBe(true);
    expect(service.hashEquals(hash, service.hash('+573009999999'))).toBe(false);
  });

  it('normaliza telefonos colombianos a formato E.164', () => {
    const service = buildService();
    expect(service.normalizePhone('3001112233')).toBe('+573001112233');
    expect(service.normalizePhone('+57 300 111 2233')).toBe('+573001112233');
    expect(service.normalizePhone('573001112233')).toBe('+573001112233');
  });

  it('enmascara el telefono para mostrarlo en el dashboard', () => {
    const service = buildService();
    expect(service.maskPhone('+573001112233')).toBe('+573****33');
  });

  it('exige claves configuradas en produccion', () => {
    expect(() =>
      buildService({ 'phi.encryptionKey': '', 'phi.hashKey': '', env: 'production' }),
    ).toThrow(/obligatorias en produccion/);
  });
});
