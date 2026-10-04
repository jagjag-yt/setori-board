// 実行: node tests/blocks.test.mjs
import assert from 'node:assert/strict';
import { splitAt, moveBoundary, removeBoundary } from '../src/blocks.js';

const make = () => [{ id: 'a', name: 'A', start: 0, end: 228, cards: [{ id: 'c1' }] }];
const ok = (bs) => bs.every((b, i) => i === 0 || bs[i - 1].end === b.start);

// 分ける：カードは前に残り、新しいブロックは後ろ。時刻は 0.1 秒に丸める
let bs = make();
assert.equal(splitAt(bs, 52.94, 'b'), 1);
assert.deepEqual(bs.map((b) => [b.name, b.start, b.end, b.cards.length]), [['A', 0, 52.9, 1], ['新しいブロック', 52.9, 228, 0]]);
assert.equal(splitAt(bs, 100, 'c'), 2);
assert.ok(ok(bs));

// 0.5 秒未満のブロックはできない
assert.equal(splitAt(bs, 52.6, 'x'), null);
assert.equal(splitAt(bs, 0.2, 'x'), null);
assert.equal(splitAt(bs, 52.9, 'x'), null); // 境界ちょうど
assert.equal(bs.length, 3);

// 動かす：前後のブロックが 0.5 秒未満にならない範囲に収まる
assert.equal(moveBoundary(bs, 1, 60.04), 60);
assert.equal(moveBoundary(bs, 1, 99.9), 99.5);
assert.equal(moveBoundary(bs, 1, -5), 0.5);
assert.ok(ok(bs));

// 消す：前後を結合し、カードは前・後の順につながる
bs[2].cards.push({ id: 'c2' });
assert.equal(removeBoundary(bs, 2), 1);
assert.deepEqual(bs.map((b) => [b.start, b.end]), [[0, 0.5], [0.5, 228]]);
assert.deepEqual(bs[1].cards.map((c) => c.id), ['c2']);
assert.equal(removeBoundary(bs, 1), null);
assert.deepEqual(bs.map((b) => [b.start, b.end, b.cards.map((c) => c.id).join()]), [[0, 228, 'c1,c2']]);

console.log('blocks OK');
