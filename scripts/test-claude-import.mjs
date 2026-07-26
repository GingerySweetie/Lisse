/**
 * Tests for Claude export pure parsers — aligned with
 * SsssssSynqa/claude-conversation-viewer format rules.
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

test('parseClaudeConversationMessages uses linear chat_messages like the viewer', () => {
  const parsed = parseClaudeConversationMessages({
    uuid: 'conv-branch',
    name: 'Branch test',
    chat_messages: [
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
    ],
  });
  // Viewer walks chat_messages linearly — keep both regenerated replies.
  assert.deepEqual(
    parsed.map((m) => m.content),
    ['question', 'old answer', 'new answer'],
  );
});

test('thinking uses item.thinking only (not item.text)', () => {
  assert.equal(
    extractClaudeThinking({
      content: [{ type: 'thinking', text: 'wrong-field', thinking: 'correct' }],
    }),
    'correct',
  );
  // Viewer critical rule: empty thinking field → no thinking, even if text set.
  assert.equal(
    extractClaudeThinking({
      content: [{ type: 'thinking', text: 'should-be-ignored' }],
    }),
    undefined,
  );
});

test('prefers content[] over contentBlocks; raw.text only when no content items', () => {
  assert.equal(
    extractClaudeTextContent({
      text: 'top-level',
      content: [{ type: 'text', text: 'from content' }],
      contentBlocks: [{ type: 'text', text: 'from blocks' }],
    }),
    'from content',
  );
  // content[] present with only thinking → no text (viewer does not fall back)
  assert.equal(
    extractClaudeTextContent({
      text: 'top-level fallback',
      content: [{ type: 'thinking', thinking: 'only thinking' }],
    }),
    '',
  );
  // empty / missing content → raw.text
  assert.equal(
    extractClaudeTextContent({
      text: 'top-level fallback',
      content: [],
    }),
    'top-level fallback',
  );
});

test('tool_use / tool_result pairing across turns (viewer algorithm)', () => {
  const parsed = parseClaudeConversationMessages({
    uuid: 'c-tools',
    name: 'tools',
    chat_messages: [
      {
        uuid: 'u1',
        sender: 'human',
        created_at: '2026-04-01T10:00:00.000Z',
        content: [{ type: 'text', text: 'search something' }],
      },
      {
        uuid: 'a1',
        sender: 'assistant',
        created_at: '2026-04-01T10:00:01.000Z',
        content: [
          {
            type: 'tool_use',
            id: 'toolu_1',
            name: 'web_search',
            input: { q: 'wisteria' },
            message: 'Searching…',
          },
        ],
      },
      {
        uuid: 'u2',
        sender: 'human',
        created_at: '2026-04-01T10:00:02.000Z',
        // Official export injects tool_result on the next human turn.
        content: [
          {
            type: 'tool_result',
            content: 'search hits…',
          },
        ],
      },
      {
        uuid: 'a2',
        sender: 'assistant',
        created_at: '2026-04-01T10:00:03.000Z',
        content: [
          { type: 'thinking', thinking: 'based on results…' },
          { type: 'text', text: 'here is the answer' },
        ],
      },
    ],
  });

  // Human tool_result-only turn is absorbed into prior tool_use → skipped.
  assert.equal(parsed.length, 3);
  assert.equal(parsed[0].content, 'search something');
  assert.equal(parsed[1].role, 'assistant');
  assert.equal(parsed[1].content, '');
  assert.ok(parsed[1].toolCalls);
  assert.equal(parsed[1].toolCalls[0].name, 'web_search');
  assert.equal(parsed[1].toolCalls[0].result, 'search hits…');
  assert.equal(parsed[2].content, 'here is the answer');
  assert.equal(parsed[2].thinking, 'based on results…');
});

test('attachments / files become notes; extracted_content inlined', () => {
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
        files: [{ file_name: 'photo.png' }],
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
      },
    ],
  });
  assert.equal(parsed.length, 2);
  assert.match(parsed[0].content, /photo\.png/);
  assert.match(parsed[0].content, /notes\.txt/);
  assert.match(parsed[0].content, /file body here/);
  assert.equal(parsed[1].content, 'hello');
  assert.equal(parsed[1].thinking, 'reason…');
});

test('prefers chat_messages over empty messages array', () => {
  const parsed = parseClaudeConversationMessages({
    uuid: 'c',
    name: 'x',
    messages: [],
    chat_messages: [
      {
        uuid: 'm',
        sender: 'human',
        content: [{ type: 'text', text: 'kept' }],
        created_at: '2026-04-01T10:00:00.000Z',
      },
    ],
  });
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].content, 'kept');
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

test('flattenClaudeBranch helper still available for leaf walks', () => {
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
