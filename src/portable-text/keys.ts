/**
 * Portable Text の `_key` 生成器。
 *
 * WHY: `_key` は同一配列内で一意であれば十分。ランダムより決定的な連番の方がテストの
 * スナップショットが安定し、同じ入力に対する差分ノイズも減る。変換 1 回ごとに新しい
 * 生成器を作る。
 */
export function makeKeyGen(prefix = "k"): () => string {
	let n = 0;
	return () => `${prefix}${n++}`;
}
