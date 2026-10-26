import { Injectable, InternalServerErrorException, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const PREFIX = 'v1';

/**
 * Cifrado de datos sensibles de salud en reposo (AES-256-GCM) y
 * seudonimizacion de identificadores para busqueda (HMAC-SHA256).
 *
 * Formato almacenado: v1:<iv_b64>:<tag_b64>:<ciphertext_b64>
 * La clave vive fuera de la base de datos (variable de entorno o Key Vault),
 * de modo que un volcado de la base no revela PHI.
 */
@Injectable()
export class EncryptionService implements OnModuleInit {
  private readonly logger = new Logger(EncryptionService.name);
  private key!: Buffer;
  private hashKey!: Buffer;

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    const encodedKey = this.config.get<string>('phi.encryptionKey') ?? '';
    const encodedHashKey = this.config.get<string>('phi.hashKey') ?? '';
    const isProduction = this.config.get<string>('env') === 'production';

    if (!encodedKey || !encodedHashKey) {
      if (isProduction) {
        throw new InternalServerErrorException(
          'PHI_ENCRYPTION_KEY y PHI_HASH_KEY son obligatorias en produccion',
        );
      }
      this.logger.warn('Claves PHI no configuradas: se generan claves efimeras de desarrollo');
      this.key = randomBytes(32);
      this.hashKey = randomBytes(32);
      return;
    }

    this.key = Buffer.from(encodedKey, 'base64');
    this.hashKey = Buffer.from(encodedHashKey, 'base64');
    if (this.key.length !== 32) {
      throw new InternalServerErrorException('PHI_ENCRYPTION_KEY debe ser de 32 bytes en base64');
    }
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv(ALGORITHM, this.key, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return [PREFIX, iv.toString('base64'), tag.toString('base64'), ciphertext.toString('base64')].join(':');
  }

  decrypt(payload: string): string {
    if (!payload) return '';
    const parts = payload.split(':');
    if (parts.length !== 4 || parts[0] !== PREFIX) {
      // Tolerante con datos migrados en claro; no interrumpe la operacion clinica.
      this.logger.warn('Valor sin formato de cifrado esperado: se devuelve tal cual');
      return payload;
    }
    const [, iv, tag, ciphertext] = parts;
    const decipher = createDecipheriv(ALGORITHM, this.key, Buffer.from(iv, 'base64'));
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(ciphertext, 'base64')), decipher.final()]).toString('utf8');
  }

  /** HMAC estable para buscar por telefono sin almacenarlo en claro. */
  hash(value: string): string {
    return createHmac('sha256', this.hashKey).update(this.normalizePhone(value)).digest('hex');
  }

  /** Comparacion en tiempo constante de hashes. */
  hashEquals(a: string, b: string): boolean {
    const bufferA = Buffer.from(a, 'hex');
    const bufferB = Buffer.from(b, 'hex');
    return bufferA.length === bufferB.length && timingSafeEqual(bufferA, bufferB);
  }

  /** Normaliza a E.164 asumiendo Colombia (+57) cuando no hay indicativo. */
  normalizePhone(raw: string): string {
    const digits = (raw ?? '').replace(/[^\d+]/g, '');
    if (digits.startsWith('+')) return digits;
    if (digits.startsWith('57') && digits.length >= 12) return `+${digits}`;
    if (digits.length === 10) return `+57${digits}`;
    return digits ? `+${digits}` : '';
  }

  /** Enmascara un telefono para mostrarlo sin exponer el dato completo. */
  maskPhone(phone: string): string {
    const normalized = this.normalizePhone(phone);
    if (normalized.length <= 4) return '****';
    return `${normalized.slice(0, 4)}****${normalized.slice(-2)}`;
  }
}
