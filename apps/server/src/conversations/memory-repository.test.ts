import { describe, expect, it } from 'vitest';
import { ConversationSchema, IdSchema, type Message } from '@genui/shared';
import { createMemoryRepository } from './memory-repository.ts';
import { RepositoryError, toConversation, type StoredMessage } from './repository.ts';

const conversationId = '7f1e2d3c-4b5a-4c6d-8e7f-9a0b1c2d3e4f';
const messageId = '1f1e2d3c-4b5a-4c6d-8e7f-9a0b1c2d3e4f';
const missingId = '2f1e2d3c-4b5a-4c6d-8e7f-9a0b1c2d3e4f';
const firstTime = '2026-11-24T09:00:00.000Z';
const secondTime = '2026-11-24T09:01:00.000Z';
const thirdTime = '2026-11-24T09:02:00.000Z';

function message(): Message {
  return {
    id: messageId,
    conversationId,
    role: 'assistant',
    parts: [{ type: 'text', text: 'hello' }],
    status: 'streaming',
    createdAt: firstTime,
  };
}

function repository() {
  const times = [firstTime, secondTime, thirdTime];
  return createMemoryRepository({
    newId: () => conversationId,
    now: () => new Date(times.shift() ?? thirdTime),
  });
}

function isSteps(value: unknown): value is { signature: string }[] {
  return Array.isArray(value) && value.every((step: unknown) =>
    typeof step === 'object' && step !== null && 'signature' in step && typeof step.signature === 'string');
}

describe('memory conversation repository', () => {
  it('creates an empty conversation with a UUID and matching timestamps', async () => {
    const repo = repository();
    expect(await repo.create()).toEqual({
      id: conversationId,
      createdAt: firstTime,
      updatedAt: firstTime,
      messages: [],
    });
    expect(IdSchema.safeParse((await createMemoryRepository().create()).id).success).toBe(true);
    expect(await repo.get(missingId)).toBeUndefined();
  });

  it('appends and patches messages, preserving provider steps and bumping updatedAt', async () => {
    const repo = repository();
    await repo.create();
    await repo.appendMessage(conversationId, { message: message(), providerSteps: [{ signature: 'first' }] });
    expect(await repo.get(conversationId)).toMatchObject({
      updatedAt: secondTime,
      messages: [{ message: { status: 'streaming' }, providerSteps: [{ signature: 'first' }] }],
    });

    await repo.updateMessage(conversationId, messageId, {
      parts: [{ type: 'text', text: 'finished' }],
      status: 'complete',
      metadata: { model: 'fake' },
      providerSteps: [{ signature: 'second' }],
    });
    const stored = await repo.get(conversationId);
    expect(stored).toMatchObject({
      updatedAt: thirdTime,
      messages: [{
        message: { id: messageId, status: 'complete', parts: [{ type: 'text', text: 'finished' }], metadata: { model: 'fake' } },
        providerSteps: [{ signature: 'second' }],
      }],
    });
    if (!stored) throw new Error('conversation missing');
    const conversation = toConversation(stored);
    expect(ConversationSchema.parse(conversation)).toEqual(conversation);
    expect(conversation.messages[0]).not.toHaveProperty('providerSteps');
    expect(JSON.stringify(conversation)).not.toContain('signature');
  });

  it('reports missing conversations and messages, and duplicate message ids', async () => {
    const repo = repository();
    const storedMessage = { message: message() };
    await expect(repo.appendMessage(missingId, storedMessage)).rejects.toMatchObject({ code: 'not_found' });
    await expect(repo.updateMessage(missingId, messageId, { status: 'complete' })).rejects.toMatchObject({ code: 'not_found' });
    await repo.create();
    await expect(repo.updateMessage(conversationId, missingId, { status: 'complete' })).rejects.toBeInstanceOf(RepositoryError);
    await expect(repo.updateMessage(conversationId, missingId, { status: 'complete' })).rejects.toMatchObject({ code: 'not_found' });
    await repo.appendMessage(conversationId, storedMessage);
    await expect(repo.appendMessage(conversationId, storedMessage)).rejects.toMatchObject({ code: 'conflict' });
    expect((await repo.get(conversationId))?.updatedAt).toBe(secondTime);
  });

  it('retains provider steps when a patch omits them and strips extra message fields from the projection', async () => {
    const repo = repository();
    await repo.create();
    const withExtraField = Object.assign(message(), { providerSteps: ['private'] });
    await repo.appendMessage(conversationId, { message: withExtraField, providerSteps: [{ signature: 'original' }] });
    await repo.updateMessage(conversationId, messageId, {
      status: 'error',
      error: { code: 'internal', message: 'failed' },
    });
    const stored = await repo.get(conversationId);
    if (!stored) throw new Error('conversation missing');
    expect(stored.messages[0]).toMatchObject({
      message: { status: 'error', error: { code: 'internal', message: 'failed' } },
      providerSteps: [{ signature: 'original' }],
    });
    expect(toConversation(stored).messages[0]).not.toHaveProperty('providerSteps');
  });

  it('isolates nested data passed in and returned by the repository and projection', async () => {
    const repo = repository();
    const created = await repo.create();
    const inputSteps = [{ signature: 'original' }];
    const input: StoredMessage = { message: message(), providerSteps: inputSteps };
    await repo.appendMessage(conversationId, input);
    input.message.parts[0]!.text = 'changed input';
    inputSteps[0]!.signature = 'changed input';

    const first = await repo.get(conversationId);
    if (!first) throw new Error('conversation missing');
    expect(first.messages[0]).toMatchObject({
      message: { parts: [{ text: 'hello' }] },
      providerSteps: [{ signature: 'original' }],
    });
    first.messages[0]!.message.parts[0]!.text = 'changed result';
    const steps = first.messages[0]!.providerSteps;
    if (!isSteps(steps)) throw new Error('provider steps missing');
    steps[0]!.signature = 'changed result';
    expect((await repo.get(conversationId))?.messages[0]).toMatchObject({
      message: { parts: [{ text: 'hello' }] },
      providerSteps: [{ signature: 'original' }],
    });
    const patch = { parts: [{ type: 'text' as const, text: 'patched' }], providerSteps: [{ signature: 'patched' }] };
    await repo.updateMessage(conversationId, messageId, patch);
    patch.parts[0]!.text = 'changed patch';
    patch.providerSteps[0]!.signature = 'changed patch';

    const second = await repo.get(conversationId);
    if (!second) throw new Error('conversation missing');
    expect(created.messages).toEqual([]);
    expect(second.messages[0]).toMatchObject({
      message: { parts: [{ text: 'patched' }] },
      providerSteps: [{ signature: 'patched' }],
    });
    const publicConversation = toConversation(second);
    publicConversation.messages[0]!.parts[0]!.text = 'changed projection';
    expect((await repo.get(conversationId))?.messages[0]?.message.parts[0]?.text).toBe('patched');
  });
});
