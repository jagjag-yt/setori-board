// 波形ピークの計算。チャンネルごとの音声データ（-1〜1）から、
// 0.05 秒ごとのピーク（fine）と、曲全体を 376 本にしたピーク（overview）を 0〜1 で作る
export const FINE_STEP = 0.05;
export const OVERVIEW_BARS = 376;

export async function computePeaks(channels, sampleRate, onProgress) {
  const len = channels[0].length;
  const step = Math.round(sampleRate * FINE_STEP);
  const n = Math.ceil(len / step);
  const fine = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    const s = i * step, e = Math.min(s + step, len);
    let m = 0;
    for (const ch of channels) for (let j = s; j < e; j++) { const v = Math.abs(ch[j]); if (v > m) m = v; }
    fine[i] = m;
    // 長い曲で画面が固まらないよう、ときどき処理を譲って進捗を出す
    if (i % 200 === 0) { onProgress?.(i / n); await new Promise((r) => setTimeout(r)); }
  }
  const max = fine.reduce((a, b) => Math.max(a, b), 0) || 1;
  const norm = fine.map((v) => Math.round((v / max) * 1000) / 1000);
  const overview = Array.from({ length: OVERVIEW_BARS }, (_, k) => {
    const a = Math.floor((k * n) / OVERVIEW_BARS);
    const b = Math.max(a + 1, Math.floor(((k + 1) * n) / OVERVIEW_BARS));
    return norm.slice(a, b).reduce((x, y) => Math.max(x, y), 0);
  });
  onProgress?.(1);
  return { fineStep: FINE_STEP, fine: norm, overview };
}
