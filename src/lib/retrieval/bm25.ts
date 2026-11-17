/**
 * BM25 lexical ranking, implemented from scratch so every retrieval score in
 * the app can be explained. No model is involved anywhere in this file.
 */
const STOP = new Set(
  'a an and are as at be been but by can could did do does for from had has have how if in into is it its of on or that the their them then there these they this to was were what when where which who why will with would you your about above after all also any because between both each more most other over same some such than through under up very not no only own so too which while during before once here just may might must shall should'.split(' '),
);

export function stem(word: string) {
  if (word.length > 5 && word.endsWith('ies')) return word.slice(0, -3) + 'y';
  if (word.length > 5 && word.endsWith('ing')) return word.slice(0, -3);
  if (word.length > 4 && word.endsWith('ed')) return word.slice(0, -2);
  if (word.length > 4 && word.endsWith('es')) return word.slice(0, -2);
  if (word.length > 3 && word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1);
  return word;
}

export function tokenize(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter((w) => w.length > 1 && !STOP.has(w)).map(stem);
}

export class Bm25 {
  private tf: Map<string, number>[] = [];
  private len: number[] = [];
  private df = new Map<string, number>();
  private avg = 0;

  constructor(texts: string[]) {
    for (const text of texts) {
      const counts = new Map<string, number>();
      const tokens = tokenize(text);
      for (const t of tokens) counts.set(t, (counts.get(t) ?? 0) + 1);
      for (const t of counts.keys()) this.df.set(t, (this.df.get(t) ?? 0) + 1);
      this.tf.push(counts);
      this.len.push(tokens.length);
    }
    this.avg = this.len.reduce((a, b) => a + b, 0) / Math.max(1, this.len.length);
  }

  /** Raw BM25 score of the query against every document, in document order. */
  scores(query: string): number[] {
    const k1 = 1.4;
    const b = 0.75;
    const n = this.tf.length;
    const terms = [...new Set(tokenize(query))];
    return this.tf.map((counts, i) => {
      let score = 0;
      for (const term of terms) {
        const f = counts.get(term);
        if (!f) continue;
        const df = this.df.get(term) ?? 0;
        const idf = Math.log(1 + (n - df + 0.5) / (df + 0.5));
        score += (idf * f * (k1 + 1)) / (f + k1 * (1 - b + (b * this.len[i]) / (this.avg || 1)));
      }
      return score;
    });
  }
}
