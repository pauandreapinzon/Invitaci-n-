export interface OutboundMessage {
  to: string;
  body: string;
}

export interface SendResult {
  providerMessageId: string;
  provider: string;
}

export interface InboundMessage {
  from: string;
  text: string;
  providerMessageId: string;
  provider: string;
  receivedAt: Date;
}

export interface WhatsAppChannelProvider {
  readonly name: string;
  readonly available: boolean;
  send(message: OutboundMessage): Promise<SendResult>;
}
