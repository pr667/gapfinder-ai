export type DocKind = 'syllabus' | 'material' | 'paper';
export type Status = 'weak' | 'medium' | 'strong' | 'untested';

export type Chunk = {
  id: string;
  documentId: string;
  docTitle: string;
  docKind: DocKind;
  idx: number;
  page: number | null;
  heading: string | null;
  content: string;
  embedding: number[] | null;
  topicId: string | null;
  subtopicId: string | null;
  topicScore: number | null;
};

export type Topic = {
  id: string;
  parentId: string | null;
  name: string;
  summary: string | null;
  keywords: string[];
  position: number;
};

/** A citation always points at a stored passage, never at text the model wrote. */
export type Citation = { chunkId: string; label: string; passage: string; evidence?: string };

export type QuizQuestion = {
  id: string;
  attemptId: string;
  topicId: string;
  subtopicId: string | null;
  position: number;
  type: 'mcq' | 'short';
  prompt: string;
  options: string[] | null;
  answer: string;
  explanation: string;
  concept: string | null;
  chunkId: string;
  evidence: string;
  response: string | null;
  result: 'correct' | 'partial' | 'incorrect' | null;
  score: number | null;
  feedback: string | null;
};

export type TopicGap = {
  topicId: string;
  name: string;
  status: Status;
  mastery: number | null; // 0..1, recency-weighted across attempts
  previousMastery: number | null;
  latest: { asked: number; earned: number };
  totalAsked: number;
  examCount: number;
  examShare: number; // share of mapped past-paper questions
  priority: number; // 0..1, drives the plan order
  reason: string; // computed from the numbers
  diagnosis: string | null; // model-written reading of the wrong answers
  tip: string | null; // model-written revision action, used by the plan
  weakSubtopics: { name: string; missed: number }[];
  missedConcepts: string[];
  rereads: { chunkId: string; label: string }[];
};

export type GapReport = {
  attemptNumber: number;
  overall: number;
  previousOverall: number | null;
  topics: TopicGap[];
};

export type PlanSession = {
  kind: 'learn' | 'second-pass' | 'review' | 'retest';
  topicId: string | null;
  title: string;
  minutes: number;
  status: Status | null;
  focus: string;
  rereads: { chunkId: string; label: string }[];
  practice: string[];
};

export type Plan = {
  days: number;
  hoursPerDay: number;
  basedOnAttempt: number | null;
  schedule: { day: number; minutes: number; sessions: PlanSession[] }[];
  ranking: { topicId: string; name: string; status: Status; minutes: number; priority: number }[];
  changes: string[];
  dropped: string[];
};
