/**
 * Tests for ChatGPT export parsers — aligned with
 * Fedor22515/chat_viewer_manager.
 * Run: node --experimental-strip-types --test scripts/test-chatgpt-import.mjs
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  flattenChatGPTParts,
  normalizeChatGPTMessage,
  parseChatGPTConversationMessages,
  titleForChatGPTConversation,
} from '../src/lib/import/chatgpt-parse.ts';

test('flattenChatGPTParts joins strings and typed objects like the viewer', () => {
  const text = flattenChatGPTParts([
    'hello',
    { text: 'world' },
    { content: 'from content' },
    {
      content_type: 'tether_browsing_display',
      title: 'Result',
      description: 'details here',
    },
    { content_type: 'image_asset_pointer', asset_pointer: 'x' },
  ]);
  assert.match(text, /hello/);
  assert.match(text, /world/);
  assert.match(text, /from content/);
  assert.match(text, /Result/);
  assert.match(text, /details here/);
  assert.match(text, /\[image_asset_pointer\]/);
});

test('parseChatGPTConversationMessages linearizes ALL dialogue nodes (not a short leaf)', () => {
  // Regenerated assistant replies = siblings under the same user parent.
  // Old importer following current_node alone could look fine; following a
  // broken leaf / skipping multimodal empties left "only a little" content.
  // Viewer iterates every mapping key and keeps all non-empty dialogue.
  const parsed = parseChatGPTConversationMessages({
    title: 'Long chat',
    conversation_id: 'c1',
    current_node: 'a1', // points at the *first* short reply
    mapping: {
      root: {
        id: 'root',
        message: {
          id: 'root',
          author: { role: 'system' },
          content: { content_type: 'text', parts: [''] },
        },
        parent: null,
        children: ['u1'],
      },
      u1: {
        id: 'u1',
        message: {
          id: 'u1',
          author: { role: 'user' },
          create_time: 1000,
          content: { content_type: 'text', parts: ['question 1'] },
        },
        parent: 'root',
        children: ['a1', 'a2'],
      },
      a1: {
        id: 'a1',
        message: {
          id: 'a1',
          author: { role: 'assistant' },
          create_time: 1001,
          content: { content_type: 'text', parts: ['short answer'] },
        },
        parent: 'u1',
        children: [],
      },
      a2: {
        id: 'a2',
        message: {
          id: 'a2',
          author: { role: 'assistant' },
          create_time: 1002,
          content: {
            content_type: 'text',
            parts: [
              'long regenerated answer paragraph one',
              { text: 'paragraph two with object part' },
            ],
          },
        },
        parent: 'u1',
        children: ['u2'],
      },
      u2: {
        id: 'u2',
        message: {
          id: 'u2',
          author: { role: 'user' },
          create_time: 1003,
          content: { content_type: 'text', parts: ['follow up'] },
        },
        parent: 'a2',
        children: ['a3'],
      },
      a3: {
        id: 'a3',
        message: {
          id: 'a3',
          author: { role: 'assistant' },
          create_time: 1004,
          content: { content_type: 'text', parts: ['final reply'] },
        },
        parent: 'u2',
        children: [],
      },
      tool: {
        id: 'tool',
        message: {
          id: 'tool',
          author: { role: 'tool', name: 'browser' },
          create_time: 1001.5,
          content: { content_type: 'text', parts: ['tool noise'] },
        },
        parent: 'u1',
        children: [],
      },
    },
  });

  // Dialogue mode: user/assistant only, ALL of them (including both a1 and a2).
  assert.deepEqual(
    parsed.map((m) => m.content.split('\n\n')[0]),
    [
      'question 1',
      'short answer',
      'long regenerated answer paragraph one',
      'follow up',
      'final reply',
    ],
  );
  assert.match(parsed[2].content, /paragraph two/);
});

test('normalizeChatGPTMessage extracts user_editable_context custom text', () => {
  const nm = normalizeChatGPTMessage(
    {
      author: { role: 'user' },
      content: {
        content_type: 'user_editable_context',
        user_instructions: '```\nBe concise.\n```',
        parts: [],
      },
    },
    0,
  );
  assert.equal(nm.content, 'Be concise.');
  assert.equal(nm.hintCategory, 'custom');
});

test('dialogue mode skips custom/memory; all mode keeps them as system', () => {
  const conv = {
    title: 'ctx',
    mapping: {
      c: {
        id: 'c',
        message: {
          id: 'c',
          author: { role: 'user' },
          content: {
            content_type: 'user_editable_context',
            user_instructions: 'About me: likes tea',
            parts: [],
          },
        },
        parent: null,
        children: ['u'],
      },
      u: {
        id: 'u',
        message: {
          id: 'u',
          author: { role: 'user' },
          content: { content_type: 'text', parts: ['hi'] },
        },
        parent: 'c',
        children: [],
      },
    },
  };
  const dialogue = parseChatGPTConversationMessages(conv, { mode: 'dialogue' });
  assert.deepEqual(
    dialogue.map((m) => m.content),
    ['hi'],
  );
  const all = parseChatGPTConversationMessages(conv, { mode: 'all' });
  assert.equal(all.length, 2);
  assert.equal(all[0].role, 'system');
  assert.match(all[0].content, /likes tea/);
});

test('titleForChatGPTConversation falls back to first user line', () => {
  const title = titleForChatGPTConversation({ title: 'New chat' }, [
    { role: 'user', content: 'hello from gpt export', createdAt: 1, category: 'dialogue', seqIndex: 0 },
  ]);
  assert.equal(title, 'hello from gpt export');
});
