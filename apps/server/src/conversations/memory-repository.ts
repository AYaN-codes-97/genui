import { randomUUID } from 'node:crypto';
import {
  RepositoryError,
  type ConversationRepository,
  type MessagePatch,
  type StoredConversation,
  type StoredMessage,
} from './repository.ts';

export function createMemoryRepository(options: { now?: () => Date; newId?: () => string } = {}): ConversationRepository {
  const now = options.now ?? (() => new Date());
  const newId = options.newId ?? randomUUID;
  const conversations = new Map<string, StoredConversation>();

  function requireConversation(id: string): StoredConversation {
    const conversation = conversations.get(id);
    if (!conversation) throw new RepositoryError('not_found', 'Conversation not found');
    return conversation;
  }

  return {
    async create() {
      const id = newId();
      if (conversations.has(id)) throw new RepositoryError('conflict', 'Conversation already exists');
      const timestamp = now().toISOString();
      const conversation: StoredConversation = { id, createdAt: timestamp, updatedAt: timestamp, messages: [] };
      conversations.set(id, conversation);
      return structuredClone(conversation);
    },

    async get(id) {
      const conversation = conversations.get(id);
      return conversation ? structuredClone(conversation) : undefined;
    },

    async appendMessage(conversationId, message: StoredMessage) {
      const conversation = requireConversation(conversationId);
      if (conversation.messages.some((item) => item.message.id === message.message.id)) {
        throw new RepositoryError('conflict', 'Message already exists');
      }
      conversations.set(conversationId, {
        ...conversation,
        updatedAt: now().toISOString(),
        messages: [...conversation.messages, structuredClone(message)],
      });
    },

    async updateMessage(conversationId, messageId, patch: MessagePatch) {
      const conversation = requireConversation(conversationId);
      const index = conversation.messages.findIndex((item) => item.message.id === messageId);
      if (index === -1) throw new RepositoryError('not_found', 'Message not found');
      const { providerSteps, ...messagePatch } = structuredClone(patch);
      const previous = conversation.messages[index]!;
      const updated: StoredMessage = {
        ...previous,
        ...('providerSteps' in patch ? { providerSteps } : {}),
        message: { ...previous.message, ...messagePatch },
      };
      const messages = [...conversation.messages];
      messages[index] = updated;
      conversations.set(conversationId, { ...conversation, updatedAt: now().toISOString(), messages });
    },
  };
}
