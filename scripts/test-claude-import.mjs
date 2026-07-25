/**
 * Tests for Claude export pure parsers (branch flatten, attachments, titles).
 * Run: node --experimental-strip-types --test scripts/test-claude-import.mjs
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CLAUDE_ROOT_PARENT,
  extractClaudeTextContent,
  extractClaudeThinking,
  flattenClaudeBranch,
  parseClaudeConversationMessages,
  titleForClaudeConversation,
} from '../src/lib/import/claude-parse.ts';

test('flattenClaudeBranch keeps only the latest regenerated reply', () => {
  const messages = [
    {
      uuid: 'msg-1',
      text: 'question',
      content: [{ type: 'text', text: 'question' }],
      sender: 'human',
      created_at: '2026-04-01T10:00:00.000Z',
      parent_message_uuid: CLAUDE_ROOT_PARENT,
    },
    {
      uuid: 'msg-2a',
      text: 'old answer',
      content: [{ type: 'text', text: 'old answer' }],
      sender: 'assistant',
      created_at: '2026-04-01T10:00:30.000Z',
      parent_message_uuid: 'msg-1',
    },
    {
      uuid: 'msg-2b',
      text: 'new answer',
      content: [{ type: 'text', text: 'new answer' }],
      sender: 'assistant',
      created_at: '2026-04-01T10:05:00.000Z',
      parent_message_uuid: 'msg-1',
    },
  ];
  const branch = flattenClaudeBranch(messages);
  assert.deepEqual(
    branch.map((m) => m.uuid),
    ['msg-1', 'msg-2b'],
  );
});

test('flattenClaudeBranch respects current_leaf_message_uuid', () => {
  const messages = [
    {
      uuid: 'u',
      text: 'hi',
      sender: 'human',
      created_at: '2026-04-01T10:00:00.000Z',
      parent_message_uuid: CLAUDE_ROOT_PARENT,
    },
    {
      uuid: 'a1',
      text: 'first',
      sender: 'assistant',
      created_at: '2026-04-01T10:01:00.000Z',
      parent_message_uuid: 'u',
    },
    {
      uuid: 'a2',
      text: 'second',
      sender: 'assistant',
      created_at: '2026-04-01T10:02:00.000Z',
      parent_message_uuid: 'u',
    },
  ];
  const branch = flattenClaudeBranch(messages, 'a1');
  assert.deepEqual(
    branch.map((m) => m.uuid),
    ['u', 'a1'],
  );
});

test('parseClaudeConversationMessages skips empty ghosts and mixes thinking', () => {
  const parsed = parseClaudeConversationMessages({
    uuid: 'c1',
    name: '',
    chat_messages: [
      {
        uuid: 'm1',
        text: '',
        content: [],
        sender: 'human',
        created_at: '2026-04-01T10:00:00.000Z',
        parent_message_uuid: CLAUDE_ROOT_PARENT,
        attachments: [
          {
            file_name: 'notes.txt',
            extracted_content: 'file body here',
          },
        ],
      },
      {
        uuid: 'm2',
        text: '',
        content: [
          { type: 'thinking', thinking: 'reason…' },
          { type: 'text', text: 'hello' },
        ],
        sender: 'assistant',
        created_at: '2026-04-01T10:00:05.000Z',
        parent_message_uuid: 'm1',
      },
      {
        uuid: 'm3',
        text: '',
        content: [{ type: 'tool_use', name: 'x', input: {} }],
        sender: 'assistant',
        created_at: '2026-04-01T10:00:06.000Z',
        parent_message_uuid: 'm2',
      },
    ],
  });
  assert.equal(parsed.length, 2);
  assert.match(parsed[0].content, /notes\.txt/);
  assert.match(parsed[0].content, /file body here/);
  assert.equal(parsed[1].content, 'hello');
  assert.equal(parsed[1].thinking, 'reason…');
});

test('extractClaudeThinking accepts thinking body in text field', () => {
  const thinking = extractClaudeThinking({
    content: [{ type: 'thinking', text: 'internal' }],
  });
  assert.equal(thinking, 'internal');
});

test('extractClaudeTextContent prefers content blocks over empty top-level text', () => {
  const text = extractClaudeTextContent({
    text: '',
    content: [{ type: 'text', text: 'from block' }],
  });
  assert.equal(text, 'from block');
});

test('titleForClaudeConversation uses first user line when untitled', () => {
  const title = titleForClaudeConversation(
    { name: '' },
    [
      { role: 'user', content: '帮我写一首诗关于紫藤', createdAt: 1 },
      { role: 'assistant', content: '好的', createdAt: 2 },
    ],
  );
  assert.equal(title, '帮我写一首诗关于紫藤');
});

test('titleForClaudeConversation replaces Untitled with snippet', () => {
  const title = titleForClaudeConversation(
    { name: 'Untitled' },
    [{ role: 'user', content: 'hello world from claude', createdAt: 1 }],
  );
  assert.equal(title, 'hello world from claude');
});

test('legacy linear export without parent links keeps array order', () => {
  const msgs = [
    { uuid: 'a', text: '1', sender: 'human', created_at: '2026-01-01T00:00:00Z' },
    {
      uuid: 'b',
      text: '2',
      sender: 'assistant',
      created_at: '2026-01-01T00:01:00Z',
    },
  ];
  const branch = flattenClaudeBranch(msgs);
  assert.deepEqual(
    branch.map((m) => m.uuid),
    ['a', 'b'],
  );
});
