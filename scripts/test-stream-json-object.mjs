/**
 * Tests for the streaming JSON object walker used by large backup import.
 * Run: node --experimental-strip-types --test scripts/test-stream-json-object.mjs
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  findJsonValueEnd,
  parseJsonObjectStream,
  parseJsonArrayStream,
  peekJsonRootKind,
  stringChunks,
} from '../src/lib/stream-json-object.ts';

test('findJsonValueEnd handles scalars, strings, objects, arrays', () => {
  assert.equal(findJsonValueEnd('123,', 0), 3);
  assert.equal(findJsonValueEnd('true}', 0), 4);
  assert.equal(findJsonValueEnd('"a\\"b"', 0), 6);
  assert.equal(findJsonValueEnd('{"x":1}', 0), 7);
  assert.equal(findJsonValueEnd('[1,{"a":2}]', 0), 11);
  assert.equal(findJsonValueEnd('{"x":', 0), -1);
});

test('parseJsonObjectStream yields backup-shaped events across tiny chunks', async () => {
  const json = JSON.stringify({
    __lisse: 'backup',
    version: 5,
    exportedAt: 1,
    settings: { theme: 'light' },
    endpoints: [
      { id: 'e1', name: 'A' },
      { id: 'e2', name: 'B' },
    ],
    messages: [{ id: 'm1', content: 'hi' }],
  });

  const events = [];
  for await (const ev of parseJsonObjectStream(stringChunks(json, 7), {
    arrayBatchSize: 1,
  })) {
    events.push(ev);
  }

  assert.equal(events[0].type, 'start');
  assert.equal(events.at(-1).type, 'end');

  const values = Object.fromEntries(
    events.filter((e) => e.type === 'value').map((e) => [e.key, e.value]),
  );
  assert.equal(values.__lisse, 'backup');
  assert.equal(values.version, 5);
  assert.deepEqual(values.settings, { theme: 'light' });

  const endpointItems = events
    .filter((e) => e.type === 'array-items' && e.key === 'endpoints')
    .flatMap((e) => e.items);
  assert.equal(endpointItems.length, 2);
  assert.equal(endpointItems[0].id, 'e1');

  const messagesEnd = events.find(
    (e) => e.type === 'array-end' && e.key === 'messages',
  );
  assert.equal(messagesEnd.count, 1);
});

test('parseJsonObjectStream tolerates whitespace and empty arrays', async () => {
  const json = `{
    "__lisse" : "backup" ,
    "version" : 4 ,
    "personas" : [ ] ,
    "messages" : [ { "id" : "x" , "text" : "a,b,{c}" } ]
  }`;
  const events = [];
  for await (const ev of parseJsonObjectStream(stringChunks(json, 3), {
    arrayBatchSize: 10,
  })) {
    events.push(ev);
  }
  const personasEnd = events.find(
    (e) => e.type === 'array-end' && e.key === 'personas',
  );
  assert.equal(personasEnd.count, 0);
  const msgItems = events
    .filter((e) => e.type === 'array-items' && e.key === 'messages')
    .flatMap((e) => e.items);
  assert.equal(msgItems[0].text, 'a,b,{c}');
});

test('parseJsonObjectStream rejects truncated input', async () => {
  await assert.rejects(async () => {
    for await (const _ of parseJsonObjectStream(
      stringChunks('{"__lisse":"backup","messages":[{"id":'),
      { arrayBatchSize: 2 },
    )) {
      // drain
    }
  }, /不完整|格式不对/);
});

test('parseJsonArrayStream yields Claude-shaped conversation batches', async () => {
  const json = JSON.stringify([
    { uuid: 'c1', name: 'A', chat_messages: [{ sender: 'human', text: 'hi' }] },
    { uuid: 'c2', name: 'B', chat_messages: [] },
  ]);
  const events = [];
  for await (const ev of parseJsonArrayStream(stringChunks(json, 5), {
    arrayBatchSize: 1,
  })) {
    events.push(ev);
  }
  assert.equal(events[0].type, 'start');
  const items = events
    .filter((e) => e.type === 'items')
    .flatMap((e) => e.items);
  assert.equal(items.length, 2);
  assert.equal(items[0].uuid, 'c1');
  assert.equal(events.at(-1).type, 'end');
  assert.equal(events.at(-1).count, 2);
});

test('peekJsonRootKind distinguishes array vs object without losing bytes', async () => {
  const json = '  [{"uuid":"x"}]';
  const { kind, rest } = await peekJsonRootKind(stringChunks(json, 3));
  assert.equal(kind, 'array');
  let rebuilt = '';
  for await (const chunk of rest) rebuilt += chunk;
  assert.equal(rebuilt, json);
  const parsed = JSON.parse(rebuilt);
  assert.equal(parsed[0].uuid, 'x');
});
