// 実行: node tests/ui.test.mjs
import assert from 'node:assert/strict';
import { bezier, easeInOut, fmtTime, esc } from '../src/ui.js';

const near = (a, b) => Math.abs(a - b) < 0.002;
assert.ok(near(easeInOut(0), 0) && near(easeInOut(1), 1));
assert.ok(near(bezier(0, 0, 1, 1)(0.3), 0.3));      // 直線
assert.ok(near(easeInOut(0.5), 0.7756));              // cubic-bezier(.4,0,.2,1) の x=0.5（総当たりで求めた値）
assert.ok(easeInOut(0.1) < 0.1 && easeInOut(0.9) > 0.9);

assert.equal(fmtTime(0, 1), '0:00.0');
assert.equal(fmtTime(52.94, 1), '0:52.9');
assert.equal(fmtTime(81.4, 1), '1:21.4');
assert.equal(fmtTime(228), '3:48');
assert.equal(esc('<b>"x"</b>'), '&#60;b&#62;&#34;x&#34;&#60;/b&#62;');
console.log('ui OK');
