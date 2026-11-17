/**
 * GAP ANALYSIS. Plain arithmetic over quiz results, with no model involved,
 * so the weak / medium / strong label on every topic is reproducible and can
 * be explained number by number.
 */
import type { GapReport, Status, TopicGap } from '../types';

export const WEAK_BELOW = 0.5;
export const STRONG_FROM = 0.8;

export type Answered = {
  topicId: string;
  subtopicName: string | null;
  attemptNumber: number;
  score: number; // 1 correct, 0.5 partial, 0 incorrect
  concept: string | null;
  chunkId: string;
  chunkLabel: string;
};

export type GapInput = {
  topics: { id: string; name: string }[];
  answered: Answered[];
  latestAttempt: number;
  examCounts: Record<string, number>;
  previous: GapReport | null;
};

const pct = (x: number) => `${Math.round(x * 100)}%`;
const marks = (x: number) => (Number.isInteger(x) ? String(x) : x.toFixed(1));

export function statusFor(mastery: number | null): Status {
  if (mastery === null) return 'untested';
  if (mastery < WEAK_BELOW) return 'weak';
  if (mastery < STRONG_FROM) return 'medium';
  return 'strong';
}

export function analyseGaps(input: GapInput): GapReport {
  const totalExam = Object.values(input.examCounts).reduce((a, b) => a + b, 0);
  const maxExam = Math.max(0, ...Object.values(input.examCounts));

  const topics: TopicGap[] = input.topics.map((topic) => {
    const mine = input.answered.filter((a) => a.topicId === topic.id);
    const latest = mine.filter((a) => a.attemptNumber === input.latestAttempt);

    // Recency-weighted mastery: each older attempt counts half as much as the next.
    let weighted = 0;
    let weightSum = 0;
    for (const a of mine) {
      const w = 0.5 ** (input.latestAttempt - a.attemptNumber);
      weighted += w * a.score;
      weightSum += w;
    }
    const mastery = weightSum ? weighted / weightSum : null;
    const status = statusFor(mastery);
    const previousMastery = input.previous?.topics.find((t) => t.topicId === topic.id)?.mastery ?? null;

    const examCount = input.examCounts[topic.id] ?? 0;
    const examShare = totalExam ? examCount / totalExam : 0;
    const examNorm = maxExam ? examCount / maxExam : 0;
    // An untested topic is an unknown, so it ranks between medium and weak.
    const gap = mastery === null ? 0.6 : 1 - mastery;
    const priority = totalExam ? gap * (0.55 + 0.45 * examNorm) : gap;

    // Where the marks were lost. Look at the latest attempt first, then history.
    const lostNow = latest.some((a) => a.score < 1);
    const misses = (lostNow ? latest : mine).filter((a) => a.score < 1);
    const bySubtopic = new Map<string, number>();
    for (const m of misses) if (m.subtopicName) bySubtopic.set(m.subtopicName, (bySubtopic.get(m.subtopicName) ?? 0) + 1);
    const weakSubtopics = [...bySubtopic.entries()].sort((a, b) => b[1] - a[1]).map(([name, missed]) => ({ name, missed }));
    const missedConcepts = [...new Set(misses.map((m) => m.concept).filter(Boolean) as string[])].slice(0, 4);
    const rereads = [...new Map(misses.map((m) => [m.chunkId, { chunkId: m.chunkId, label: m.chunkLabel }])).values()].slice(0, 3);

    const earned = latest.reduce((s, a) => s + a.score, 0);
    const parts: string[] = [];
    if (status === 'untested') {
      parts.push('Not tested yet, so there is no evidence either way. Your next quiz will include it.');
    } else {
      if (latest.length) parts.push(`Latest quiz: ${marks(earned)} of ${latest.length} right.`);
      else parts.push(`Not in the latest quiz. Earlier attempts put you at ${pct(mastery!)}.`);
      const where = weakSubtopics.length ? weakSubtopics.slice(0, 2).map((s) => s.name).join(' and ') : missedConcepts.slice(0, 2).join('; ');
      if (where && lostNow) parts.push(`Marks were lost mostly on ${where}.`);
      else if (where && status !== 'strong') parts.push(`Earlier misses on ${where} still count against it.`);
      if (previousMastery !== null && Math.abs(mastery! - previousMastery) >= 0.05) {
        parts.push(`${mastery! > previousMastery ? 'Up' : 'Down'} from ${pct(previousMastery)} to ${pct(mastery!)}.`);
      }
      if (mine.length < 2) parts.push('Based on a single question, so treat this as a first signal.');
    }
    if (examCount && status !== 'strong') parts.push(`It appears in ${examCount} of ${totalExam} past-paper questions.`);

    return {
      topicId: topic.id,
      name: topic.name,
      status,
      mastery,
      previousMastery,
      latest: { asked: latest.length, earned },
      totalAsked: mine.length,
      examCount,
      examShare,
      priority,
      reason: parts.join(' '),
      diagnosis: null,
      tip: null,
      weakSubtopics,
      missedConcepts,
      rereads,
    };
  });

  const latestAll = input.answered.filter((a) => a.attemptNumber === input.latestAttempt);
  return {
    attemptNumber: input.latestAttempt,
    overall: latestAll.length ? latestAll.reduce((s, a) => s + a.score, 0) / latestAll.length : 0,
    previousOverall: input.previous?.overall ?? null,
    topics: topics.sort((a, b) => b.priority - a.priority),
  };
}
