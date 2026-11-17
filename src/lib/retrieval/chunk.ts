/**
 * Splits uploaded pages into passages of roughly 900 characters. Each passage
 * remembers its page and nearest heading, which is what a citation shows.
 */
export type PageText = { page: number | null; text: string };
export type RawChunk = { page: number | null; heading: string | null; content: string };

const TARGET = 900;
const MAX = 1300;

const SMALL = new Set(['a', 'an', 'and', 'as', 'at', 'by', 'for', 'from', 'in', 'into', 'of', 'on', 'or', 'the', 'to', 'vs', 'with']);

/** `alone` = the line stands by itself between blank lines, which is how headings usually sit. */
export function isHeading(line: string, alone = false) {
  const t = line.trim();
  if (t.length < 3 || t.length > 90) return false;
  if (/^#{1,6}\s+\S/.test(t)) return true;
  if (/[.?!,;:]$/.test(t)) return false;
  if (/^(chapter|unit|section|module|part|topic)\s+[\divxlc]+/i.test(t)) return true;
  if (/^\d+(\.\d+)*\.?\s+[A-Z]/.test(t) && t.split(/\s+/).length <= 10) return true;
  const words = t.split(/\s+/);
  if (words.length > 9) return false;
  const letters = t.replace(/[^A-Za-z]/g, '');
  if (letters.length >= 4 && letters === letters.toUpperCase()) return true;
  if (alone) return /^[A-Z0-9]/.test(t);
  const major = words.filter((w) => !SMALL.has(w.toLowerCase()));
  return words.length <= 7 && major.length > 0 && major.every((w) => /^[A-Z0-9]/.test(w)) && !/\d{3,}/.test(t);
}

function isStrictHeading(line: string) {
  const t = line.trim();
  if (t.length < 4 || t.length > 80 || /[.?!,;:]$/.test(t)) return false;
  if (/^#{1,6}\s+\S/.test(t) || /^(chapter|unit|section|module)\s+[\divxlc]+/i.test(t)) return true;
  if (/^\d+(\.\d+)+\s+[A-Z]/.test(t) && t.split(/\s+/).length <= 9) return true;
  const letters = t.replace(/[^A-Za-z]/g, '');
  return letters.length >= 6 && letters === letters.toUpperCase() && t.split(/\s+/).length <= 8;
}

const cleanHeading = (line: string) => line.trim().replace(/^#{1,6}\s+/, '').replace(/\s+/g, ' ');

function splitLong(text: string): string[] {
  if (text.length <= MAX) return [text];
  const sentences = text.match(/[^.!?]+[.!?]+["')\]]*\s*|[^.!?]+$/g) ?? [text];
  const out: string[] = [];
  let buf = '';
  for (const s of sentences) {
    if (buf.length + s.length > TARGET && buf.length > 200) {
      out.push(buf.trim());
      buf = '';
    }
    buf += s;
    while (buf.length > MAX) {
      out.push(buf.slice(0, TARGET).trim());
      buf = buf.slice(TARGET);
    }
  }
  if (buf.trim()) out.push(buf.trim());
  return out;
}

export function chunkPages(pages: PageText[]): RawChunk[] {
  const chunks: RawChunk[] = [];
  let heading: string | null = null;
  let buf = '';
  let bufPage: number | null = null;
  let bufHeading: string | null = null;

  const flush = () => {
    const content = buf.replace(/[ \t]+/g, ' ').trim();
    if (content.length >= 40) for (const part of splitLong(content)) chunks.push({ page: bufPage, heading: bufHeading, content: part });
    buf = '';
  };

  for (const { page, text } of pages) {
    const blocks = text.replace(/\r/g, '').split(/\n\s*\n|\n(?=\s*#{1,6}\s)/);
    for (const block of blocks) {
      const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
      let para: string[] = [];
      const commit = () => {
        const text = para.join(' ').trim();
        para = [];
        if (!text) return;
        if (buf && buf.length + text.length > TARGET) flush();
        if (!buf) {
          bufPage = page;
          bufHeading = heading;
        }
        buf += (buf ? '\n' : '') + text;
      };
      lines.forEach((line, i) => {
        // The first line of a block may be a loosely formatted heading; inside a
        // block only unmistakable ones count (PDF text has few blank lines).
        if (i === 0 ? isHeading(line, lines.length === 1) : isStrictHeading(line)) {
          commit();
          flush();
          heading = cleanHeading(line);
        } else para.push(line);
      });
      commit();
    }
  }
  flush();
  return chunks;
}

/** Pulls individual questions out of a past paper. */
export function splitQuestions(text: string): { label: string; content: string }[] {
  const lines = text.replace(/\r/g, '').split('\n').map((l) => l.trim()).filter(Boolean);
  const start = /^(?:Q(?:uestion)?\.?\s*)?(\d{1,3})\s*[.):\-]\s+(?=\S)|^Q(?:uestion)?\.?\s*(\d{1,3})\b[.):\-]?\s*/i;
  const found: { label: string; content: string }[] = [];
  let current: { label: string; content: string } | null = null;
  for (const line of lines) {
    const m = line.match(start);
    if (m) {
      if (current) found.push(current);
      current = { label: `Q${m[1] ?? m[2]}`, content: line.replace(start, '').trim() };
    } else if (current) {
      current.content += ' ' + line;
    }
  }
  if (current) found.push(current);
  let questions = found.filter((f) => f.content.length >= 15);
  if (questions.length < 3) {
    // No usable numbering: fall back to sentences that end in a question mark.
    const sentences = text.replace(/\s+/g, ' ').match(/[^.?!]{15,}\?/g) ?? [];
    questions = sentences.map((s, i) => ({ label: `Q${i + 1}`, content: s.trim() }));
  }
  return questions.slice(0, 80).map((f) => ({ label: f.label, content: f.content.slice(0, 600) }));
}
