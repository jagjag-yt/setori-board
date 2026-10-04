// ブロックの区切り操作。blocks 配列を直接書き換える。
// 区切り k は blocks[k].start（= blocks[k-1].end）のこと。k は 1 〜 blocks.length-1
export const MIN_LEN = 0.5;                       // ブロックの最低の長さ（秒）

// ブロックの難易度（1 安定・2 普通・3 挑戦）。決めていないブロックは「普通」
export const BLOCK_DIFFS = ['', '安定', '普通', '挑戦'];
export const blockDiff = (b) => b.diff ?? 2;
// 色は技の難易度の色を借りる：安定＝緑（Lv.2）、普通＝青（Lv.3）、挑戦＝橙（Lv.5）
export const DIFF_LV = [0, 2, 3, 5];

// カードの開始時刻。ブロックの先頭のカードは、決めていなければブロックの頭から始まる
export const cardStart = (c, block) => c.start ?? (block.cards[0] === c ? block.start : null);
export const round1 = (t) => Math.round(t * 10) / 10; // 0.1 秒単位

// 時刻 t で、そこを含むブロックを 2 つに分ける。カードは前側に残す。
// できた区切りの番号 k を返す。短すぎて分けられなければ null
export function splitAt(blocks, t, newId) {
  t = round1(t);
  const i = blocks.findIndex((b) => t > b.start && t < b.end);
  if (i === -1) return null;
  const b = blocks[i];
  if (t - b.start < MIN_LEN || b.end - t < MIN_LEN) return null;
  blocks.splice(i + 1, 0, { id: newId, name: '新しいブロック', start: t, end: b.end, cards: [] });
  b.end = t;
  return i + 1;
}

// 区切り k を value に動かす（前後のブロックが MIN_LEN 未満にならない範囲に収める）
export function moveBoundary(blocks, k, value) {
  const lo = round1(blocks[k - 1].start + MIN_LEN);
  const hi = round1(blocks[k].end - MIN_LEN);
  const v = Math.min(hi, Math.max(lo, round1(value)));
  blocks[k - 1].end = blocks[k].start = v;
  return v;
}

// 区切り k を消して前後のブロックを結合する（カードは前・後の順）。次に選ぶ区切りの番号か null を返す
export function removeBoundary(blocks, k) {
  const [b] = blocks.splice(k, 1);
  blocks[k - 1].end = b.end;
  blocks[k - 1].cards.push(...b.cards);
  if (k - 1 >= 1) return k - 1;
  return blocks.length > 1 ? 1 : null;
}
