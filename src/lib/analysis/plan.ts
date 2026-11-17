/**
 * REVISION PLAN. Deterministic scheduling from the gap report and the time
 * the student has. Minutes go to topics in proportion to priority (how weak x
 * how often examined). The model contributes only the per-topic study tip.
 */
import type { GapReport, Plan, PlanSession, TopicGap } from '../types';

const BLOCK = 50; // longest single sitting on one topic
const MIN = 15; // shortest useful sitting
const RETEST = 20;
const round5 = (n: number) => Math.max(5, Math.round(n / 5) * 5);

function defaultFocus(gap: TopicGap) {
  const where = gap.weakSubtopics.length ? ` Start with ${gap.weakSubtopics.slice(0, 2).map((s) => s.name).join(' and ')}.` : '';
  if (gap.status === 'weak') return `Relearn from the source passages, then redo the questions you missed.${where}`;
  if (gap.status === 'medium') return `Close the specific gaps rather than re-reading everything.${where}`;
  if (gap.status === 'untested') return 'Skim the notes, then test yourself so this topic gets a real score.';
  return 'Quick recall check only. Do not spend more time here.';
}

export function buildPlan(input: {
  report: GapReport;
  days: number;
  hoursPerDay: number;
  practice: Record<string, string[]>;
  previous: Plan | null;
}): Plan {
  const { report } = input;
  const days = Math.min(60, Math.max(1, Math.round(input.days)));
  const perDay = Math.max(15, Math.round(input.hoursPerDay * 60));
  const total = days * perDay;

  const retestDays = total < 120 ? [] : days >= 4 ? [Math.ceil(days / 2), days] : [days];
  const budget = total - retestDays.length * RETEST;

  // 1. Share out the minutes. Weak, exam-heavy topics get the most.
  let pool = [...report.topics].sort((a, b) => b.priority - a.priority);
  const dropped: string[] = [];
  let minutes = new Map<string, number>();
  while (pool.length) {
    const weight = (t: TopicGap) => t.priority + (t.status === 'strong' ? 0.04 : 0.15);
    const sum = pool.reduce((s, t) => s + weight(t), 0);
    minutes = new Map(pool.map((t) => [t.topicId, (budget * weight(t)) / sum]));
    const smallest = pool[pool.length - 1];
    if (pool.length > 1 && (minutes.get(smallest.topicId) ?? 0) < MIN) {
      dropped.push(smallest.name);
      pool = pool.slice(0, -1);
    } else break;
  }

  // 2. Turn each topic's minutes into sittings. Weak topics come back for a second pass.
  const first: PlanSession[] = [];
  const second: PlanSession[] = [];
  for (const gap of pool) {
    const mins = round5(minutes.get(gap.topicId) ?? MIN);
    const base = {
      topicId: gap.topicId,
      status: gap.status,
      rereads: gap.rereads,
      practice: (input.practice[gap.topicId] ?? []).slice(0, 4),
    };
    const split = (gap.status === 'weak' || gap.status === 'untested') && mins >= 50;
    const firstMins = split ? round5(mins * 0.65) : mins;
    first.push({
      ...base,
      kind: gap.status === 'strong' ? 'review' : 'learn',
      title: gap.name,
      minutes: firstMins,
      focus: gap.tip ?? defaultFocus(gap),
    });
    if (split) {
      second.push({
        ...base,
        kind: 'second-pass',
        title: gap.name,
        minutes: mins - firstMins,
        focus: 'Second pass, from memory: write down what you recall before opening the notes, then check it against the source.',
        rereads: [],
      });
    }
  }

  // 3. Lay the sittings out across the days in priority order.
  const queue = [...first, ...second];
  const schedule: Plan['schedule'] = [];
  for (let day = 1; day <= days; day++) {
    const hasRetest = retestDays.includes(day);
    let room = perDay - (hasRetest ? RETEST : 0);
    const sessions: PlanSession[] = [];
    while (queue.length && room >= MIN) {
      const next = queue[0];
      const take = Math.min(next.minutes, room, BLOCK);
      const rest = next.minutes - take;
      if (rest > 0 && rest < MIN && next.minutes <= room) {
        sessions.push(queue.shift()!);
        room -= next.minutes;
        continue;
      }
      sessions.push({ ...next, minutes: take });
      room -= take;
      queue.shift();
      // Put what is left of a long topic behind the next one, so the day alternates.
      if (rest >= MIN) queue.splice(Math.min(1, queue.length), 0, { ...next, minutes: rest });
    }
    if (hasRetest) {
      sessions.push({
        kind: 'retest',
        topicId: null,
        title: 'Re-test with a new quiz',
        minutes: RETEST,
        status: null,
        focus: 'Take a fresh quiz. Topics you have fixed drop down this plan and the time moves to what is still weak.',
        rereads: [],
        practice: [],
      });
    }
    schedule.push({ day, minutes: sessions.reduce((s, x) => s + x.minutes, 0), sessions });
  }

  const ranking = pool.map((t) => ({
    topicId: t.topicId,
    name: t.name,
    status: t.status,
    priority: t.priority,
    minutes: schedule.flatMap((d) => d.sessions).filter((s) => s.topicId === t.topicId).reduce((s, x) => s + x.minutes, 0),
  }));

  // 4. Say what moved since the last plan, so the update is visible.
  const changes: string[] = [];
  const prev = input.previous;
  if (prev) {
    if (prev.days !== days || prev.hoursPerDay !== input.hoursPerDay) {
      changes.push(`Time available changed from ${prev.days} days x ${prev.hoursPerDay} h to ${days} days x ${input.hoursPerDay} h.`);
    }
    ranking.forEach((now, i) => {
      const beforeIndex = prev.ranking.findIndex((r) => r.topicId === now.topicId);
      if (beforeIndex === -1) return void changes.push(`${now.name} is new in the plan.`);
      const before = prev.ranking[beforeIndex];
      if (before.status !== now.status) {
        changes.push(`${now.name}: ${before.status} to ${now.status}, ${before.minutes} to ${now.minutes} min, now #${i + 1} (was #${beforeIndex + 1}).`);
      } else if (Math.abs(before.minutes - now.minutes) >= 15 || Math.abs(beforeIndex - i) >= 2) {
        changes.push(`${now.name}: still ${now.status}, ${before.minutes} to ${now.minutes} min, now #${i + 1} (was #${beforeIndex + 1}).`);
      }
    });
    for (const before of prev.ranking) if (!ranking.some((r) => r.topicId === before.topicId)) changes.push(`${before.name} dropped out to make room for weaker topics.`);
  }

  return { days, hoursPerDay: input.hoursPerDay, basedOnAttempt: report.attemptNumber, schedule, ranking, changes, dropped };
}
