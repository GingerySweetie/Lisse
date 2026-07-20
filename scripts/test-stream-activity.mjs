import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  beginActiveWork,
  beginChatStream,
  endActiveWork,
  endChatStream,
  hasActiveChatStream,
  hasActiveWork,
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

  it('hasActiveWork covers chat streams and import/export work', () => {
    assert.equal(hasActiveWork(), false);
    beginActiveWork();
    assert.equal(hasActiveWork(), true);
    endActiveWork();
    assert.equal(hasActiveWork(), false);
    beginChatStream();
    assert.equal(hasActiveWork(), true);
    endChatStream();
    assert.equal(hasActiveWork(), false);
  });
});
