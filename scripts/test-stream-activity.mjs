import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  beginChatStream,
  endChatStream,
  hasActiveChatStream,
} from '../src/lib/stream-activity.ts';

describe('stream-activity', () => {
  it('tracks nested begin/end without going negative', () => {
    assert.equal(hasActiveChatStream(), false);
    beginChatStream();
    beginChatStream();
    assert.equal(hasActiveChatStream(), true);
    endChatStream();
    assert.equal(hasActiveChatStream(), true);
    endChatStream();
    assert.equal(hasActiveChatStream(), false);
    endChatStream();
    assert.equal(hasActiveChatStream(), false);
  });
});
