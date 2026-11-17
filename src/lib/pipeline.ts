/**
 * The diagnosis loop, step by step. Each function first RETRIEVES (picks
 * passages from the student's material in code), then hands only those
 * passages to GENERATION, then checks what came back before saving it.
 */
import { insertMany, newId, one, q } from './db';
import { analyseGaps, type Answered } from './analysis/gaps';
import { buildPlan } from './analysis/plan';
import { diagnoseTopics } from './generation/diagnosis';
import { gradeShortAnswers } from './generation/grading';
import { LlmError } from './generation/llm';
import { pickTopics } from './generation/paperMapping';
import { writeQuestions, type QuestionRequest } from './generation/quiz';
import { draftTopicMap } from './generation/topicMap';
import { getAttempt, getLatestPlan, getPaperQuestions, getPassages, getQuestions, getReports, getTopics, UserError, type Subject } from './repo';
import { Bm25, tokenize } from './retrieval/bm25';
import { chunkPages, splitQuestions, type PageText } from './retrieval/chunk';
import { embedTexts } from './retrieval/embeddings';
import { citationLabel, isRelevant, loadCorpus, quoteIsInPassage, retrieve, scoreAll } from './retrieval';
import type { Chunk, DocKind, GapReport, Plan, Topic } from './types';

const bulkUpdate = (sql: string, rows: unknown[]) => (rows.length ? q(sql, [JSON.stringify(rows)]) : Promise.resolve([]));

const topicQuery = (topic: Topic, all: Topic[]) =>
  [topic.name, topic.summary ?? '', topic.keywords.join(' '), ...all.filter((t) => t.parentId === topic.id).map((s) => `${s.name} ${s.keywords.join(' ')}`)].join(' ');

/* ---------------------------------------------------------------- upload */

export async function ingestDocument(subjectId: string, input: { kind: DocKind; title: string; pages: PageText[] }) {
  const text = input.pages.map((p) => p.text).join('\n\n');
  if (text.trim().length < 40) throw new UserError('No readable text found in that file. If it is a scanned PDF, paste the text instead.');
  if (text.length > 1_500_000) throw new UserError('That file is too large. Upload one chapter at a time (up to about 1.5 million characters).');

  const documentId = newId();
  const raw = chunkPages(input.pages);
  const pageCount = Math.max(1, ...input.pages.map((p) => p.page ?? 1));
  await q('insert into documents (id, subject_id, kind, title, page_count, char_count) values ($1,$2,$3,$4,$5,$6)', [
    documentId,
    subjectId,
    input.kind,
    input.title.slice(0, 120),
    pageCount,
    text.length,
  ]);
  // Optional semantic vectors (only when an embeddings key is configured).
  const vectors = input.kind === 'material' ? await embedTexts(raw.map((c) => `${c.heading ?? ''}\n${c.content}`)) : null;
  await insertMany(
    'chunks',
    ['id', 'subject_id', 'document_id', 'idx', 'page', 'heading', 'content', 'embedding'],
    raw.map((c, i) => [newId(), subjectId, documentId, i, c.page, c.heading, c.content, vectors?.[i] ?? null]),
    ['embedding'],
  );

  let questions = 0;
  if (input.kind === 'paper') {
    const found = splitQuestions(text);
    questions = found.length;
    await insertMany('paper_questions', ['id', 'subject_id', 'document_id', 'label', 'content'], found.map((f) => [newId(), subjectId, documentId, f.label, f.content]));
  }

  // If a topic map already exists, file the new upload under it straight away.
  if ((await getTopics(subjectId)).length) {
    if (input.kind === 'material') await assignPassages(subjectId);
    if (input.kind !== 'syllabus') await mapPaperQuestions(subjectId, input.kind === 'paper');
  }
  return { documentId, passages: raw.length, questions };
}

export async function deleteDocument(subjectId: string, documentId: string) {
  await q('delete from chunks where subject_id = $1 and document_id = $2', [subjectId, documentId]);
  await q('delete from paper_questions where subject_id = $1 and document_id = $2', [subjectId, documentId]);
  await q('delete from documents where subject_id = $1 and id = $2', [subjectId, documentId]);
}

/* ------------------------------------------------------------- topic map */

export async function buildTopicMap(subjectId: string, reset: boolean) {
  const attempts = await one('select count(*) as n from attempts where subject_id = $1', [subjectId]);
  if (Number(attempts?.n) > 0 && !reset) {
    throw new UserError('Rebuilding the topic map clears the quiz history for this subject, because results are stored per topic. Confirm to rebuild.');
  }
  const corpus = await loadCorpus(subjectId, ['syllabus', 'material']);
  const syllabus = corpus.chunks.filter((c) => c.docKind === 'syllabus');
  const material = corpus.chunks.filter((c) => c.docKind === 'material');
  if (!syllabus.length && !material.length) throw new UserError('Upload a syllabus or some notes first.');

  // GENERATION: the model reads the syllabus text and structures it. Without
  // a syllabus it gets an outline (headings + opening words) of the notes.
  const source = syllabus.length
    ? syllabus.map((c) => `${c.heading ? c.heading + '\n' : ''}${c.content}`).join('\n').slice(0, 9000)
    : material.map((c) => `${c.heading ? `## ${c.heading}: ` : ''}${c.content.slice(0, 140)}`).join('\n').slice(0, 9000);
  const draft = await draftTopicMap(source, syllabus.length ? 'syllabus' : 'outline');

  for (const table of ['plans', 'reports', 'questions', 'attempts', 'topics']) await q(`delete from ${table} where subject_id = $1`, [subjectId]);
  const rows: unknown[][] = [];
  draft.topics.forEach((topic, i) => {
    const id = newId();
    rows.push([id, subjectId, null, topic.name.trim(), topic.summary, topic.keywords, i * 100]);
    topic.subtopics.forEach((sub, j) => rows.push([newId(), subjectId, id, sub.name.trim(), null, sub.keywords, i * 100 + j + 1]));
  });
  await insertMany('topics', ['id', 'subject_id', 'parent_id', 'name', 'summary', 'keywords', 'position'], rows, ['keywords']);

  await assignPassages(subjectId);
  await mapPaperQuestions(subjectId, true);
  return { topics: draft.topics.length };
}

/**
 * RETRIEVAL only: files every passage of the notes under the topic whose
 * query it matches best, and under that topic's best-matching subtopic.
 */
export async function assignPassages(subjectId: string) {
  const topics = await getTopics(subjectId);
  const top = topics.filter((t) => !t.parentId);
  const corpus = await loadCorpus(subjectId);
  if (!top.length || !corpus.chunks.length) return;

  const queries = top.map((t) => topicQuery(t, topics));
  const vectors = corpus.hasEmbeddings ? await embedTexts(queries) : null;
  const perTopic = queries.map((query, i) => scoreAll(corpus, query, vectors?.[i]));
  const subs = topics.filter((t) => t.parentId);
  const perSub = new Map(subs.map((s) => [s.id, corpus.bm25.scores(`${s.name} ${s.keywords.join(' ')}`)]));

  const updates = corpus.chunks.map((chunk, ci) => {
    let best = -1;
    let bestScore = 0;
    perTopic.forEach((hits, ti) => {
      const h = hits[ci];
      if ((h.lexical > 0 || (h.semantic ?? 0) > 0.6) && h.score > bestScore) [best, bestScore] = [ti, h.score];
    });
    if (best < 0 || bestScore < 0.12) return { id: chunk.id, topic_id: null, subtopic_id: null, score: null };
    let sub: string | null = null;
    let subScore = 0;
    for (const s of subs.filter((x) => x.parentId === top[best].id)) {
      const score = perSub.get(s.id)![ci];
      if (score > subScore) [sub, subScore] = [s.id, score];
    }
    return { id: chunk.id, topic_id: top[best].id, subtopic_id: sub, score: bestScore };
  });
  await bulkUpdate(
    `update chunks c set topic_id = v.topic_id, subtopic_id = v.subtopic_id, topic_score = v.score
     from jsonb_to_recordset($1::jsonb) as v(id text, topic_id text, subtopic_id text, score real) where c.id = v.id`,
    updates,
  );
}

/**
 * Past-paper question -> topic. RETRIEVAL shortlists up to three topics per
 * question by matching it against each topic's profile (its syllabus wording
 * plus its best passages). GENERATION then only picks among the shortlist.
 * If the model is unavailable the top retrieval match is kept.
 */
export async function mapPaperQuestions(subjectId: string, useModel: boolean) {
  const questions = await getPaperQuestions(subjectId);
  const topics = await getTopics(subjectId);
  const top = topics.filter((t) => !t.parentId);
  if (!questions.length || !top.length) return;
  const corpus = await loadCorpus(subjectId);
  const profiles = top.map((t) => {
    const passages = corpus.chunks.filter((c) => c.topicId === t.id).sort((a, b) => (b.topicScore ?? 0) - (a.topicScore ?? 0)).slice(0, 5);
    return `${topicQuery(t, topics)} ${passages.map((p) => p.content.slice(0, 600)).join(' ')}`;
  });
  const index = new Bm25(profiles);
  const shortlists = questions.map((pq) => {
    const scores = index.scores(pq.content);
    return scores.map((score, i) => ({ score, i })).filter((s) => s.score > 0).sort((a, b) => b.score - a.score).slice(0, 3).map((s) => s.i);
  });

  const picks: (number | null)[] = shortlists.map((s) => s[0] ?? null);
  let method = 'retrieval';
  const ambiguous = shortlists.map((s, i) => ({ s, i })).filter((x) => x.s.length > 1);
  if (useModel && ambiguous.length) {
    try {
      for (let b = 0; b < ambiguous.length; b += 20) {
        const batch = ambiguous.slice(b, b + 20);
        const chosen = await pickTopics(batch.map((x) => ({ question: questions[x.i].content, candidates: x.s.map((ti) => top[ti].name) })));
        chosen.forEach((c, k) => (picks[batch[k].i] = c === -1 ? null : batch[k].s[c]));
      }
      method = 'retrieval + model';
    } catch (error) {
      console.warn('[paper mapping] model step skipped:', (error as Error).message);
    }
  }
  await bulkUpdate(
    `update paper_questions p set topic_id = v.topic_id, method = v.method
     from jsonb_to_recordset($1::jsonb) as v(id text, topic_id text, method text) where p.id = v.id`,
    questions.map((pq, i) => ({ id: pq.id, topic_id: picks[i] === null ? null : top[picks[i]!].id, method })),
  );
}

/* ------------------------------------------------------------------ quiz */

function allocate(weights: number[], caps: number[], n: number) {
  const out = weights.map(() => 0);
  let left = Math.min(n, caps.reduce((a, b) => a + b, 0));
  const order = weights.map((_, i) => i).sort((a, b) => weights[b] - weights[a]);
  for (const i of order) if (left > 0 && caps[i] > 0) (out[i] = 1), left--; // every topic gets tested first
  while (left > 0) {
    let best = -1;
    let bestValue = -1;
    weights.forEach((w, i) => {
      const value = w / (out[i] + 1);
      if (out[i] < caps[i] && value > bestValue) [best, bestValue] = [i, value];
    });
    if (best < 0) break;
    out[best]++;
    left--;
  }
  return out;
}

const shuffle = <T,>(items: T[]) => {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

export async function generateQuiz(subjectId: string, size: number) {
  size = Math.min(15, Math.max(4, Math.round(size) || 8));
  const topics = await getTopics(subjectId);
  const top = topics.filter((t) => !t.parentId);
  if (!top.length) throw new UserError('Build the topic map first.');
  const corpus = await loadCorpus(subjectId);
  const usable = (t: Topic) => corpus.chunks.filter((c) => c.topicId === t.id && c.content.length >= 160);
  const testable = top.filter((t) => usable(t).length);
  if (!testable.length) throw new UserError('None of your notes matched the topic map yet. Upload notes or textbook chapters for this syllabus.');

  // RETRIEVAL: decide which topics to test and which passages to test them on.
  const report = (await getReports(subjectId)).at(-1) ?? null;
  const exam = await q('select topic_id, count(*) as n from paper_questions where subject_id = $1 and topic_id is not null group by topic_id', [subjectId]);
  const maxExam = Math.max(1, ...exam.map((e) => Number(e.n)));
  const weights = testable.map((t) => {
    const gap = report?.topics.find((g) => g.topicId === t.id);
    const need = !report ? 0.5 : !gap || gap.mastery === null ? 0.8 : 1 - gap.mastery;
    return 0.2 + need + 0.5 * (Number(exam.find((e) => e.topic_id === t.id)?.n ?? 0) / maxExam);
  });
  const counts = allocate(weights, testable.map((t) => usable(t).length), size);
  const usedRows = await q('select chunk_id, count(*) as n from questions where subject_id = $1 group by chunk_id', [subjectId]);
  const used = new Map(usedRows.map((r) => [r.chunk_id as string, Number(r.n)]));

  const picked: { chunk: Chunk; topic: Topic }[] = [];
  testable.forEach((topic, i) => {
    const pool = usable(topic).sort((a, b) => (used.get(a.id) ?? 0) - (used.get(b.id) ?? 0) || (b.topicScore ?? 0) - (a.topicScore ?? 0));
    for (const chunk of pool.slice(0, counts[i])) picked.push({ chunk, topic });
  });
  const requests: (QuestionRequest & { chunk: Chunk; topic2: Topic })[] = picked.map((p, i) => ({
    ref: `P${i + 1}`,
    type: i % 3 === 2 ? 'short' : 'mcq',
    topic: p.topic.name,
    passage: `${p.chunk.heading ? p.chunk.heading + '\n' : ''}${p.chunk.content}`.slice(0, 1400),
    chunk: p.chunk,
    topic2: p.topic,
  }));

  // GENERATION, then VERIFICATION of every question against its passage.
  const accepted = new Map<string, unknown[]>();
  const meta = { requested: requests.length, accepted: 0, rejectedUngrounded: 0, rejectedInvalid: 0, cutShort: '' };
  const attemptId = newId();

  const run = async (batch: typeof requests) => {
    const drafts = await writeQuestions(batch.map(({ ref, type, topic, passage }) => ({ ref, type, topic, passage })));
    for (const draft of drafts) {
      const request = batch.find((r) => r.ref.toLowerCase() === draft.passage.trim().toLowerCase());
      if (!request || accepted.has(request.ref)) continue;
      if (!quoteIsInPassage(draft.evidence, request.passage)) {
        meta.rejectedUngrounded++;
        continue;
      }
      let options: string[] | null = null;
      let answer = draft.answer.trim();
      if (request.type === 'mcq') {
        const cleaned = draft.options.map((o) => o.trim()).filter(Boolean);
        const index = Math.round(draft.correct_index);
        if (cleaned.length !== 4 || new Set(cleaned.map((o) => o.toLowerCase())).size !== 4 || index < 0 || index > 3) {
          meta.rejectedInvalid++;
          continue;
        }
        answer = cleaned[index];
        options = shuffle(cleaned); // models favour option A; shuffle in code
      } else if (answer.length < 3) {
        meta.rejectedInvalid++;
        continue;
      }
      accepted.set(request.ref, [
        newId(), attemptId, subjectId, request.topic2.id, request.chunk.subtopicId, 0, request.type, draft.question.trim(),
        options, answer, draft.explanation.trim(), draft.concept.trim() || null, request.chunk.id, draft.evidence.trim(),
      ]);
    }
  };

  let failure: Error | null = null;
  for (let i = 0; i < requests.length; i += 4) {
    try {
      await run(requests.slice(i, i + 4));
    } catch (error) {
      failure = error as Error;
      if (!(error instanceof LlmError)) throw error;
      break;
    }
  }
  const missing = requests.filter((r) => !accepted.has(r.ref));
  if (!failure && missing.length && missing.length <= 5) await run(missing).catch(() => undefined); // one retry for rejects
  if (!accepted.size) throw failure ?? new LlmError('No question passed the grounding check this time. Try again.');

  meta.accepted = accepted.size;
  if (failure) meta.cutShort = failure.message;
  const rows = requests.filter((r) => accepted.has(r.ref)).map((r, i) => {
    const row = accepted.get(r.ref)!;
    row[5] = i;
    return row;
  });
  const open = await q(`select id from attempts where subject_id = $1 and status = 'open'`, [subjectId]);
  for (const o of open) {
    await q('delete from questions where attempt_id = $1', [o.id]);
    await q('delete from attempts where id = $1', [o.id]);
  }
  const last = await one('select coalesce(max(number), 0) as n from attempts where subject_id = $1', [subjectId]);
  await q('insert into attempts (id, subject_id, number, status, meta) values ($1,$2,$3,$4,$5::jsonb)', [attemptId, subjectId, Number(last?.n) + 1, 'open', JSON.stringify(meta)]);
  await insertMany(
    'questions',
    ['id', 'attempt_id', 'subject_id', 'topic_id', 'subtopic_id', 'position', 'type', 'prompt', 'options', 'answer', 'explanation', 'concept', 'chunk_id', 'evidence'],
    rows,
    ['options'],
  );
  return { attemptId, ...meta };
}

/* ---------------------------------------------- submit -> report -> plan */

function overlapGrade(model: string, student: string) {
  const want = new Set(tokenize(model));
  const got = new Set(tokenize(student));
  const share = want.size ? [...want].filter((t) => got.has(t)).length / want.size : 0;
  return share >= 0.6 ? 'correct' : share >= 0.3 ? 'partial' : 'incorrect';
}

export async function submitAttempt(subject: Subject, attemptId: string, answers: Record<string, string>) {
  const attempt = await getAttempt(attemptId);
  if (!attempt || attempt.subjectId !== subject.id) throw new UserError('Quiz not found.');
  if (attempt.status !== 'open') throw new UserError('This quiz was already submitted.');
  const questions = await getQuestions(attemptId);
  const passages = await getPassages(questions.map((x) => x.chunkId));

  type Marked = { id: string; response: string; result: 'correct' | 'partial' | 'incorrect'; score: number; feedback: string };
  const marked: Marked[] = [];
  const toGrade: typeof questions = [];
  for (const question of questions) {
    const response = (answers[question.id] ?? '').trim().slice(0, 1200);
    if (question.type === 'mcq') {
      const right = response === question.answer;
      marked.push({
        id: question.id,
        response,
        result: right ? 'correct' : 'incorrect',
        score: right ? 1 : 0,
        feedback: `${response ? '' : 'No answer given. '}${question.explanation}`,
      });
    } else if (!response) {
      marked.push({ id: question.id, response, result: 'incorrect', score: 0, feedback: `No answer given. A full answer: ${question.answer}` });
    } else toGrade.push(question);
  }

  if (toGrade.length) {
    // GENERATION: mark free-text answers against the stored source passage.
    let grades: Awaited<ReturnType<typeof gradeShortAnswers>> = [];
    try {
      grades = await gradeShortAnswers(
        toGrade.map((x, i) => ({
          ref: `A${i + 1}`,
          question: x.prompt,
          passage: (passages.get(x.chunkId)?.passage ?? x.evidence).slice(0, 1400),
          modelAnswer: x.answer,
          studentAnswer: answers[x.id].trim().slice(0, 1200),
        })),
      );
    } catch (error) {
      console.warn('[grading] model unavailable, using keyword overlap:', (error as Error).message);
    }
    toGrade.forEach((x, i) => {
      const response = answers[x.id].trim().slice(0, 1200);
      const grade = grades.find((g) => g.ref.toLowerCase() === `a${i + 1}`);
      const result = grade?.verdict ?? overlapGrade(x.answer, response);
      marked.push({
        id: x.id,
        response,
        result,
        score: result === 'correct' ? 1 : result === 'partial' ? 0.5 : 0,
        feedback: grade?.feedback ?? `Marked by keyword overlap because the grader was unavailable. A full answer: ${x.answer}`,
      });
    });
  }

  await bulkUpdate(
    `update questions t set response = v.response, result = v.result, score = v.score, feedback = v.feedback
     from jsonb_to_recordset($1::jsonb) as v(id text, response text, result text, score real, feedback text) where t.id = v.id`,
    marked,
  );
  const score = marked.reduce((s, m) => s + m.score, 0) / Math.max(1, marked.length);
  await q(`update attempts set status = 'submitted', score = $2, submitted_at = now() where id = $1`, [attemptId, score]);

  const report = await buildReport(subject.id, attemptId, attempt.number);
  await rebuildPlan(subject);
  return { score, report };
}

async function buildReport(subjectId: string, attemptId: string, attemptNumber: number): Promise<GapReport> {
  const topics = await getTopics(subjectId);
  const rows = await q(
    `select t.*, a.number as attempt_number from questions t join attempts a on a.id = t.attempt_id
     where t.subject_id = $1 and a.status = 'submitted'`,
    [subjectId],
  );
  const passages = await getPassages(rows.map((r) => r.chunk_id));
  const answered: (Answered & { row: any })[] = rows.map((r) => ({
    topicId: r.topic_id,
    subtopicName: topics.find((t) => t.id === r.subtopic_id)?.name ?? null,
    attemptNumber: r.attempt_number,
    score: r.score ?? 0,
    concept: r.concept,
    chunkId: r.chunk_id,
    chunkLabel: passages.get(r.chunk_id)?.label ?? 'source passage (document removed)',
    row: r,
  }));
  const exam = await q('select topic_id, count(*) as n from paper_questions where subject_id = $1 and topic_id is not null group by topic_id', [subjectId]);
  const previous = (await getReports(subjectId)).at(-1) ?? null;

  // ANALYSIS in code: scores, labels, priorities.
  const report = analyseGaps({
    topics: topics.filter((t) => !t.parentId),
    answered,
    latestAttempt: attemptNumber,
    examCounts: Object.fromEntries(exam.map((e) => [e.topic_id, Number(e.n)])),
    previous,
  });

  // GENERATION: a one-line reading of the wrong answers, per topic that lost marks.
  const needing = report.topics.filter((t) => t.latest.asked > 0 && t.latest.earned < t.latest.asked).slice(0, 6);
  if (needing.length) {
    try {
      const diagnoses = await diagnoseTopics(
        needing.map((t, i) => ({
          ref: `T${i + 1}`,
          topic: t.name,
          stats: `${t.latest.earned} of ${t.latest.asked}`,
          misses: answered
            .filter((a) => a.topicId === t.topicId && a.attemptNumber === attemptNumber && a.score < 1)
            .slice(0, 3)
            .map((a) => ({ question: a.row.prompt, studentAnswer: a.row.response ?? '', correctAnswer: a.row.answer, concept: a.concept ?? '' })),
        })),
      );
      needing.forEach((t, i) => {
        const d = diagnoses.find((x) => x.ref.toLowerCase() === `t${i + 1}`);
        if (d) [t.diagnosis, t.tip] = [d.diagnosis, d.tip];
      });
    } catch (error) {
      console.warn('[diagnosis] skipped:', (error as Error).message);
    }
  }
  await q('insert into reports (id, subject_id, attempt_id, data) values ($1,$2,$3,$4::jsonb)', [newId(), subjectId, attemptId, JSON.stringify(report)]);
  return report;
}

export async function rebuildPlan(subject: Subject, settings?: { days: number; hoursPerDay: number }): Promise<Plan | null> {
  if (settings) {
    if (!(settings.days >= 1 && settings.days <= 60) || !(settings.hoursPerDay >= 0.25 && settings.hoursPerDay <= 14)) {
      throw new UserError('Enter 1 to 60 days and 0.25 to 14 hours a day.');
    }
    await q('update subjects set plan_days = $2, plan_hours = $3 where id = $1', [subject.id, Math.round(settings.days), settings.hoursPerDay]);
  }
  const report = (await getReports(subject.id)).at(-1);
  if (!report) return null;
  const practice: Record<string, string[]> = {};
  for (const pq of await getPaperQuestions(subject.id)) if (pq.topicId) (practice[pq.topicId] ??= []).push(`${pq.docTitle} ${pq.label}`);
  const plan = buildPlan({
    report,
    days: settings?.days ?? subject.planDays,
    hoursPerDay: settings?.hoursPerDay ?? subject.planHours,
    practice,
    previous: await getLatestPlan(subject.id),
  });
  const attempt = await one(`select id from attempts where subject_id = $1 and status = 'submitted' order by number desc limit 1`, [subject.id]);
  await q('insert into plans (id, subject_id, attempt_id, data) values ($1,$2,$3,$4::jsonb)', [newId(), subject.id, attempt?.id ?? null, JSON.stringify(plan)]);
  return plan;
}

/* --------------------------------------------------------------- explain */

export async function retrieveForExplain(subjectId: string, message: string, topicId: string | null) {
  const topic = topicId ? ((await getTopics(subjectId)).find((t) => t.id === topicId) ?? null) : null;
  const corpus = await loadCorpus(subjectId);
  const query = topic ? `${message} ${topic.name} ${message.length < 40 ? topic.keywords.join(' ') : ''}` : message;
  // Keep the best match and anything at least a third as strong; drop the long tail.
  const hits = (await retrieve(corpus, query, 5)).filter((h, i) => i === 0 || h.score >= 0.34);
  if (!isRelevant(hits[0])) return { topic, passages: [] };
  return {
    topic,
    passages: hits.map((h, i) => ({ n: i + 1, chunkId: h.chunk.id, label: citationLabel(h.chunk), text: h.chunk.content })),
  };
}
