import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as api from './fulcra.mjs';
const parseResponse = api.parseResponse ?? (() => assert.fail('response parser not implemented'));
test('empty successful JSONL query returns an empty collection', () => {
  assert.deepEqual(parseResponse('', 'application/x-jsonl'), []);
});
test('JSONL query preserves every typed record', () => {
  assert.deepEqual(parseResponse('{"id":"one","evidence":"first"}\n{"id":"two","evidence":"second"}\n', 'application/x-jsonl'), [{id:'one',evidence:'first'},{id:'two',evidence:'second'}]);
});
test('ordinary API receipts remain JSON objects', () => {
  assert.deepEqual(parseResponse('{"upload_id":"receipt"}', 'application/json'), {upload_id:'receipt'});
});
