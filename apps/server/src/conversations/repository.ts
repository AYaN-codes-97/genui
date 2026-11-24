import { ConversationSchema, type Conversation, type Message } from '@genui/shared';

export type StoredMessage = { readonly message: Message; readonly providerSteps?: unknown };

export type StoredConversation = {
  readonly id: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly messages: readonly StoredMessage[];
};

export type MessagePatch = Partial<Pick<Message, 'parts' | 'status' | 'metadata' | 'error'>> & {
  readonly providerSteps?: unknown;
};

export class RepositoryError extends Error {
  readonly code: 'not_found' | 'conflict';

  constructor(code: 'not_found' | 'conflict', message: string) {
    super(message);
    this.name = 'RepositoryError';
    this.code = code;
  }
}

export interface ConversationRepository {
  create(): Promise<StoredConversation>;
  get(id: string): Promise<StoredConversation | undefined>;
  appendMessage(conversationId: string, message: StoredMessage): Promise<void>;
  updateMessage(conversationId: string, messageId: string, patch: MessagePatch): Promise<void>;
}

export function toConversation(stored: StoredConversation): Conversation {
  return ConversationSchema.parse({
    id: stored.id,
    createdAt: stored.createdAt,
    updatedAt: stored.updatedAt,
    messages: stored.messages.map(({ message }) => message),
  });
}
