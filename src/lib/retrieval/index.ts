// Retrieval never calls the model; generation never reads the database.
import { q } from '../db';
import type { Chunk, Citation, DocKind } from '../types';
import { Bm25 } from './bm25';
import { cosine, embedTexts } from './embeddings';

export type Hit = { chunk: Chunk; score: number; lexical: number; semantic: number | null };

export type Corpus = { chunks: Chunk[]; bm25: Bm25; hasEmbeddings: boolean };

export async function loadCorpus(subjectId: string, kinds: DocKind[] = ['material']): Promise<Corpus> {
  const rows = await q(
    `select c.*, d.title as doc_title, d.kind as doc_kind from chunks c join documents d on d.id = c.document_id
     where c.subject_id = $1 order by d.created_at, c.idx`,
    [subjectId],
  );
  const chunks: Chunk[] = rows
    .filter((r) => kinds.includes(r.doc_kind))
    .map((r) => ({
      id: r.id,
      documentId: r.document_id,
      docTitle: r.doc_title,
      docKind: r.doc_kind,
      idx: r.idx,
      page: r.page,
      heading: r.heading,
      content: r.content,
      embedding: r.embedding ?? null,
      topicId: r.topic_id,
      subtopicId: r.subtopic_id,
      topicScore: r.topic_score,
    }));
  return {
    chunks,
    bm25: new Bm25(chunks.map((c) => `${c.heading ?? ''} ${c.content}`)),
    hasEmbeddings: chunks.length > 0 && chunks.every((c) => Array.isArray(c.embedding)),
  };
}

export function scoreAll(corpus: Corpus, query: string, queryEmbedding?: number[] | null): Hit[] {
  const lexical = corpus.bm25.scores(query);
  const maxLex = Math.max(...lexical, 0) || 1;
  const useSemantic = corpus.hasEmbeddings && Array.isArray(queryEmbedding);
  const semantic = useSemantic ? corpus.chunks.map((c) => cosine(c.embedding!, queryEmbedding!)) : null;
  const minSem = semantic ? Math.min(...semantic) : 0;
  const spanSem = semantic ? Math.max(...semantic) - minSem || 1 : 1;
  return corpus.chunks.map((chunk, i) => {
    const lex = lexical[i] / maxLex;
    const sem = semantic ? (semantic[i] - minSem) / spanSem : null;
    return { chunk, lexical: lexical[i], semantic: semantic ? semantic[i] : null, score: sem === null ? lex : 0.5 * lex + 0.5 * sem };
  });
}

export async function retrieve(corpus: Corpus, query: string, k = 6): Promise<Hit[]> {
  if (!corpus.chunks.length) return [];
  const queryEmbedding = corpus.hasEmbeddings ? (await embedTexts([query]))?.[0] : null;
  return scoreAll(corpus, query, queryEmbedding)
    .filter((h) => h.lexical > 0 || (h.semantic ?? 0) > 0.55)
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}

export const isRelevant = (hit: Hit | undefined) => Boolean(hit) && (hit!.lexical >= 1.2 || (hit!.semantic ?? 0) >= 0.6);

export function citationLabel(chunk: Pick<Chunk, 'docTitle' | 'page' | 'heading' | 'idx'>) {
  const where = chunk.page ? `p. ${chunk.page}` : `passage ${chunk.idx + 1}`;
  return chunk.heading ? `${chunk.docTitle}, ${chunk.heading} (${where})` : `${chunk.docTitle} (${where})`;
}

export const toCitation = (chunk: Chunk, evidence?: string): Citation => ({
  chunkId: chunk.id,
  label: citationLabel(chunk),
  passage: chunk.content,
  evidence,
});

const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// Reject evidence quotes that are not grounded in the supplied passage.
export function quoteIsInPassage(quote: string, passage: string) {
  const a = squash(quote);
  const b = squash(passage);
  if (a.length < 12) return false;
  if (b.includes(a)) return true;
  const words = a.split(' ');
  const present = words.filter((w) => b.includes(w)).length;
  return words.length >= 5 && present / words.length >= 0.9;
}
