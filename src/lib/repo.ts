/** Read/write helpers over the tables. No retrieval logic and no model calls. */
import { one, q } from './db';
import type { DocKind, GapReport, Plan, QuizQuestion, Topic } from './types';

export class UserError extends Error {}

const iso = (d: unknown) => (d ? new Date(d as string).toISOString() : null);

export type Subject = { id: string; name: string; planDays: number; planHours: number; createdAt: string | null };

export async function requireSubject(userId: string, id: string): Promise<Subject> {
  const r = await one('select * from subjects where id = $1 and user_id = $2', [id, userId]);
  if (!r) throw new UserError('Subject not found.');
  return { id: r.id, name: r.name, planDays: r.plan_days, planHours: r.plan_hours, createdAt: iso(r.created_at) };
}

export async function listSubjects(userId: string) {
  const rows = await q(
    `select s.*,
       (select count(*) from documents d where d.subject_id = s.id) as docs,
       (select count(*) from topics t where t.subject_id = s.id and t.parent_id is null) as topics,
       (select count(*) from attempts a where a.subject_id = s.id and a.status = 'submitted') as attempts,
       (select score from attempts a where a.subject_id = s.id and a.status = 'submitted' order by number desc limit 1) as last_score
     from subjects s where s.user_id = $1 order by s.created_at desc`,
    [userId],
  );
  return rows.map((r) => ({
    id: r.id as string,
    name: r.name as string,
    docs: Number(r.docs),
    topics: Number(r.topics),
    attempts: Number(r.attempts),
    lastScore: r.last_score === null ? null : Number(r.last_score),
  }));
}

export async function deleteSubject(id: string) {
  for (const t of ['plans', 'reports', 'questions', 'attempts', 'paper_questions', 'topics', 'chunks', 'documents']) {
    await q(`delete from ${t} where subject_id = $1`, [id]);
  }
  await q('delete from subjects where id = $1', [id]);
}

export type Doc = { id: string; kind: DocKind; title: string; pageCount: number; charCount: number; passages: number; questions: number };

export async function getDocuments(subjectId: string): Promise<Doc[]> {
  const rows = await q(
    `select d.*, (select count(*) from chunks c where c.document_id = d.id) as passages,
       (select count(*) from paper_questions p where p.document_id = d.id) as questions
     from documents d where d.subject_id = $1 order by d.created_at`,
    [subjectId],
  );
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    title: r.title,
    pageCount: r.page_count,
    charCount: r.char_count,
    passages: Number(r.passages),
    questions: Number(r.questions),
  }));
}

export async function getTopics(subjectId: string): Promise<Topic[]> {
  const rows = await q('select * from topics where subject_id = $1 order by position', [subjectId]);
  return rows.map((r) => ({ id: r.id, parentId: r.parent_id, name: r.name, summary: r.summary, keywords: r.keywords ?? [], position: r.position }));
}

export type PaperQuestion = { id: string; label: string; content: string; topicId: string | null; method: string | null; docTitle: string };

export async function getPaperQuestions(subjectId: string): Promise<PaperQuestion[]> {
  const rows = await q(
    `select p.*, d.title as doc_title from paper_questions p join documents d on d.id = p.document_id
     where p.subject_id = $1 order by d.created_at, p.label`,
    [subjectId],
  );
  return rows.map((r) => ({ id: r.id, label: r.label, content: r.content, topicId: r.topic_id, method: r.method, docTitle: r.doc_title }));
}

export type Attempt = {
  id: string;
  number: number;
  status: 'open' | 'submitted';
  score: number | null;
  meta: { requested?: number; accepted?: number; rejectedUngrounded?: number; rejectedInvalid?: number; cutShort?: string };
  createdAt: string | null;
  submittedAt: string | null;
};

const toAttempt = (r: any): Attempt => ({
  id: r.id,
  number: r.number,
  status: r.status,
  score: r.score,
  meta: r.meta ?? {},
  createdAt: iso(r.created_at),
  submittedAt: iso(r.submitted_at),
});

export async function getAttempts(subjectId: string): Promise<Attempt[]> {
  return (await q('select * from attempts where subject_id = $1 order by number', [subjectId])).map(toAttempt);
}

export async function getAttempt(id: string) {
  const r = await one('select * from attempts where id = $1', [id]);
  return r ? { ...toAttempt(r), subjectId: r.subject_id as string } : null;
}

export async function getQuestions(attemptId: string): Promise<QuizQuestion[]> {
  const rows = await q('select * from questions where attempt_id = $1 order by position', [attemptId]);
  return rows.map((r) => ({
    id: r.id,
    attemptId: r.attempt_id,
    topicId: r.topic_id,
    subtopicId: r.subtopic_id,
    position: r.position,
    type: r.type,
    prompt: r.prompt,
    options: r.options,
    answer: r.answer,
    explanation: r.explanation,
    concept: r.concept,
    chunkId: r.chunk_id,
    evidence: r.evidence,
    response: r.response,
    result: r.result,
    score: r.score,
    feedback: r.feedback,
  }));
}

export async function getReports(subjectId: string): Promise<GapReport[]> {
  const rows = await q('select data from reports where subject_id = $1 order by created_at', [subjectId]);
  return rows.map((r) => r.data as GapReport);
}

export async function getLatestPlan(subjectId: string): Promise<Plan | null> {
  const r = await one('select data from plans where subject_id = $1 order by created_at desc limit 1', [subjectId]);
  return (r?.data as Plan) ?? null;
}

/** Passages by id, with the label a citation shows. */
export async function getPassages(ids: string[]) {
  if (!ids.length) return new Map<string, { label: string; passage: string }>();
  const rows = await q(
    `select c.id, c.idx, c.page, c.heading, c.content, d.title from chunks c join documents d on d.id = c.document_id
     where c.id in (select jsonb_array_elements_text($1::jsonb))`,
    [JSON.stringify([...new Set(ids)])],
  );
  const { citationLabel } = await import('./retrieval');
  return new Map(
    rows.map((r) => [r.id as string, { label: citationLabel({ docTitle: r.title, page: r.page, heading: r.heading, idx: r.idx }), passage: r.content as string }]),
  );
}
