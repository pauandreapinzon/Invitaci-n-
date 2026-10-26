import { Injectable, NotFoundException } from '@nestjs/common';
import { Channel, Conversation, ConversationStatus, Message, MessageAuthor, MessageDirection, Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { EncryptionService } from '../common/crypto/encryption.service';
import { AuditService } from '../common/audit/audit.service';
import { RequestUser } from '../common/decorators/current-user.decorator';

export interface AppendMessageInput {
  conversationId: string;
  direction: MessageDirection;
  author: MessageAuthor;
  body: string;
  senderUserId?: string | null;
  providerMessageId?: string | null;
  aiModel?: string | null;
  aiLatencyMs?: number | null;
  deterministic?: boolean;
  metadata?: Prisma.InputJsonValue;
}

export interface MessageView {
  id: string;
  direction: MessageDirection;
  author: MessageAuthor;
  body: string;
  aiModel: string | null;
  aiLatencyMs: number | null;
  deterministic: boolean;
  createdAt: Date;
  metadata: Prisma.JsonValue;
}

@Injectable()
export class ConversationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionService,
    private readonly audit: AuditService,
  ) {}

  /** El contenido clinico se guarda cifrado; se descifra solo al leerlo. */
  toView(message: Message): MessageView {
    return {
      id: message.id,
      direction: message.direction,
      author: message.author,
      body: this.encryption.decrypt(message.bodyEnc),
      aiModel: message.aiModel,
      aiLatencyMs: message.aiLatencyMs,
      deterministic: message.deterministic,
      createdAt: message.createdAt,
      metadata: message.metadata,
    };
  }

  async getOrCreateOpen(patientId: string, hospitalId: string, channel: Channel): Promise<Conversation> {
    const existing = await this.prisma.conversation.findFirst({
      where: { patientId, status: ConversationStatus.OPEN },
      orderBy: { lastMessageAt: 'desc' },
    });
    if (existing) return existing;
    return this.prisma.conversation.create({ data: { patientId, hospitalId, channel } });
  }

  async appendMessage(input: AppendMessageInput): Promise<Message> {
    const message = await this.prisma.message.create({
      data: {
        conversationId: input.conversationId,
        direction: input.direction,
        author: input.author,
        bodyEnc: this.encryption.encrypt(input.body),
        senderUserId: input.senderUserId ?? null,
        providerMessageId: input.providerMessageId ?? null,
        aiModel: input.aiModel ?? null,
        aiLatencyMs: input.aiLatencyMs ?? null,
        deterministic: input.deterministic ?? false,
        metadata: input.metadata ?? {},
      },
    });
    await this.prisma.conversation.update({
      where: { id: input.conversationId },
      data: { lastMessageAt: message.createdAt },
    });
    return message;
  }

  /** Ultimos mensajes en orden cronologico, para dar contexto al modelo. */
  async recentMessages(conversationId: string, take = 8): Promise<MessageView[]> {
    const messages = await this.prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'desc' },
      take,
    });
    return messages.reverse().map((m) => this.toView(m));
  }

  async listForPatient(patientId: string, user: RequestUser) {
    const conversations = await this.prisma.conversation.findMany({
      where: { patientId, hospitalId: user.hospitalId },
      orderBy: { lastMessageAt: 'desc' },
      include: { _count: { select: { messages: true } } },
    });
    await this.audit.record({
      hospitalId: user.hospitalId,
      actorId: user.id,
      actorRole: user.role,
      action: 'CONVERSATION_LIST',
      resource: 'Conversation',
      patientId,
    });
    return conversations;
  }

  async transcript(conversationId: string, user: RequestUser) {
    const conversation = await this.prisma.conversation.findFirst({
      where: { id: conversationId, hospitalId: user.hospitalId },
      include: {
        messages: { orderBy: { createdAt: 'asc' } },
        patient: { select: { id: true, fullName: true, currentRiskLevel: true } },
      },
    });
    if (!conversation) throw new NotFoundException('Conversacion no encontrada');

    await this.audit.record({
      hospitalId: user.hospitalId,
      actorId: user.id,
      actorRole: user.role,
      action: 'CONVERSATION_READ',
      resource: 'Conversation',
      resourceId: conversationId,
      patientId: conversation.patientId,
    });

    return {
      id: conversation.id,
      patient: conversation.patient,
      channel: conversation.channel,
      status: conversation.status,
      startedAt: conversation.startedAt,
      lastMessageAt: conversation.lastMessageAt,
      messages: conversation.messages.map((m) => this.toView(m)),
    };
  }

  /** Marca la conversacion como atendida por una persona (fin del modo automatico). */
  async handOver(conversationId: string, user: RequestUser) {
    const conversation = await this.prisma.conversation.findFirst({
      where: { id: conversationId, hospitalId: user.hospitalId },
    });
    if (!conversation) throw new NotFoundException('Conversacion no encontrada');

    const updated = await this.prisma.conversation.update({
      where: { id: conversationId },
      data: { status: ConversationStatus.HANDED_OVER, handedOverToId: user.id },
    });
    await this.audit.record({
      hospitalId: user.hospitalId,
      actorId: user.id,
      actorRole: user.role,
      action: 'CONVERSATION_HANDOVER',
      resource: 'Conversation',
      resourceId: conversationId,
      patientId: conversation.patientId,
    });
    return updated;
  }
}
