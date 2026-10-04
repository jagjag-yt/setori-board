// 実行: node tests/peaks.test.mjs
import assert from 'node:assert/strict';
import { computePeaks, OVERVIEW_BARS } from '../src/peaks.js';

// 10 秒・1000Hz のダミー音声。前半は小さく(0.25)、後半は大きく(-0.5、負の値も拾うか)
const sr = 1000;
const left = new Float32Array(sr * 10).map((_, i) => (i < sr * 5 ? 0.25 : -0.5));
const right = new Float32Array(sr * 10); // 無音
const p = await computePeaks([left, right], sr);

assert.equal(p.fine.length, 200);              // 10 秒 ÷ 0.05 秒
assert.equal(p.fine[0], 0.5);                  // 0.25 / 最大 0.5
assert.equal(p.fine[199], 1);
assert.equal(p.overview.length, OVERVIEW_BARS);
assert.ok(p.overview.every((v) => v >= 0 && v <= 1));

// 短い曲（fine が 376 本未満）でも overview は 376 本で、空区間が出ない
const short = await computePeaks([new Float32Array(sr * 2).fill(0.1)], sr);
assert.equal(short.overview.length, OVERVIEW_BARS);
assert.ok(short.overview.every((v) => v === 1));

console.log('peaks OK');
