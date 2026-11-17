const BASE = process.env.BASE_URL || 'http://localhost:3000';
let cookie = '';
let failed = 0;

async function call(path, { method = 'GET', body } = {}) {
  const res = await fetch(BASE + path, {
    method,
    redirect: 'manual',
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const set = res.headers.getSetCookie?.() ?? [];
  if (set.length) cookie = set.map((c) => c.split(';')[0]).join('; ');
  const text = (await res.text()).replace(/<!-- -->/g, '');
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {}
  return { status: res.status, text, json };
}

function check(name, ok, detail = '') {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
}

const DISTRACTORS = ['The opposite of what the notes say.', 'Something about an unrelated organ.', 'None of the processes described.'];

async function takeQuiz(id, wrongTopicIds) {
  const gen = await call(`/api/subjects/${id}/quiz`, { method: 'POST', body: { size: 8 } });
  check('quiz generated', gen.status === 200 && gen.json.accepted >= 4, JSON.stringify(gen.json));
  const open = (await call(`/api/subjects/${id}/quiz`)).json;
  check('open quiz hides answers', open.questions.every((x) => !('answer' in x) && !('evidence' in x)));
  const answers = {};
  for (const x of open.questions) {
    const wrong = wrongTopicIds.includes(x.topicId);
    if (x.type === 'mcq') answers[x.id] = wrong ? x.options.find((o) => DISTRACTORS.includes(o)) : (x.options.find((o) => !DISTRACTORS.includes(o)) ?? x.options[0]);
    else answers[x.id] = wrong ? 'I am not sure about this one.' : 'placeholder';
  }
  const page = await call(`/s/${id}/quiz`);
  check('quiz page renders', page.status === 200 && page.text.includes('Submit answers'));
  const submit = await call(`/api/subjects/${id}/submit`, { method: 'POST', body: { attemptId: open.attempt.id, answers } });
  check('quiz submitted', submit.status === 200, JSON.stringify(submit.json));
  const review = await call(`/s/${id}/quiz?attempt=${open.attempt.id}`);
  check('review page shows sources', review.status === 200 && review.text.includes('Source') && review.text.includes('Why'));
  return { open, score: submit.json?.score, meta: gen.json };
}

const anon = await call('/api/subjects');
check('API rejects anonymous requests', anon.status === 401);
const bad = await call('/api/auth/login', { method: 'POST', body: { email: 'demo@gapfinder.app', password: 'wrong' } });
check('wrong password rejected', bad.status === 400);
const login = await call('/api/auth/demo', { method: 'POST', body: {} });
check('demo login', login.status === 200 && cookie.includes('gf_session'));

const created = await call('/api/subjects', { method: 'POST', body: { sample: true } });
check('sample subject created', created.status === 200, created.text.slice(0, 200));
const id = created.json.id;

const upload = await call(`/api/subjects/${id}/documents`, {
  method: 'POST',
  body: { kind: 'material', title: 'Extra notes', pages: [{ page: 1, text: 'Enzymes\n\nEnzymes are biological catalysts that speed up digestion. Salivary amylase breaks starch into sugar in the mouth, and pepsin digests proteins in the acidic stomach.' }, { page: 2, text: 'Lipase from the pancreas digests fats after bile has emulsified them into small droplets in the small intestine, which is alkaline.' }] },
});
check('extra upload indexed', upload.status === 200 && upload.json.passages >= 1, JSON.stringify(upload.json));
const empty = await call(`/api/subjects/${id}/documents`, { method: 'POST', body: { kind: 'material', title: 'Scan', pages: [{ page: 1, text: '  ' }] } });
check('empty file rejected with a clear message', empty.status === 400 && /readable text/.test(empty.json.error));

const early = await call(`/api/subjects/${id}/quiz`, { method: 'POST', body: { size: 8 } });
check('quiz before topic map is refused', early.status === 400);

const map = await call(`/api/subjects/${id}/topic-map`, { method: 'POST', body: {} });
check('topic map built', map.status === 200 && map.json.topics >= 4, JSON.stringify(map.json));
const topicsPage = await call(`/s/${id}/topics`);
check('topic map page renders', topicsPage.status === 200 && topicsPage.text.includes('Nutrition in Plants') && topicsPage.text.includes('In past papers'));
const materials = await call(`/s/${id}/materials`);
check('materials page renders', materials.status === 200 && materials.text.includes('passages indexed'));

const first = await call(`/api/subjects/${id}/quiz`, { method: 'POST', body: { size: 8 } });
const openOne = (await call(`/api/subjects/${id}/quiz`)).json;
const topicIds = [...new Set(openOne.questions.map((x) => x.topicId))];
check('first quiz covers several topics', topicIds.length >= 4, `${topicIds.length} topics, ${JSON.stringify(first.json)}`);
check('ungrounded draft was rejected then replaced', first.json.rejectedUngrounded >= 1, JSON.stringify(first.json));
const weakIds = topicIds.slice(0, 3);
const q1 = await takeQuiz(id, weakIds);

const report1 = await call(`/s/${id}/report`);
check('gap report renders with weak topics', report1.status === 200 && report1.text.includes('Weak') && report1.text.includes('Gap report after quiz 1'));
check('gap report includes diagnosis', report1.text.includes('mixing up two steps'));
const plan1 = await call(`/s/${id}/plan`);
check('plan renders', plan1.status === 200 && plan1.text.includes('Day 1') && plan1.text.includes('Minutes per topic'));
const replan = await call(`/api/subjects/${id}/plan`, { method: 'POST', body: { days: 3, hoursPerDay: 1.5 } });
const total = replan.json?.plan?.schedule?.reduce((s, d) => s + d.minutes, 0);
check('plan fits the time given', replan.status === 200 && total <= 3 * 90 && total >= 3 * 90 * 0.8, `${total} of 270 min`);
check('plan puts a weak topic first', weakIds.includes(replan.json.plan.ranking[0].topicId), replan.json.plan.ranking.map((r) => `${r.name}:${r.status}:${r.minutes}`).join(' | '));
const badPlan = await call(`/api/subjects/${id}/plan`, { method: 'POST', body: { days: 0, hoursPerDay: 2 } });
check('invalid plan settings rejected', badPlan.status === 400);

const explain = await call(`/api/subjects/${id}/explain`, { method: 'POST', body: { message: 'What does bile do in digestion?' } });
const [head, ...rest] = explain.text.split('\n');
const sources = JSON.parse(head).sources;
check('explain returns sources first, then a cited answer', sources.length > 0 && /bile/i.test(sources[0].passage) && rest.join('\n').includes('[1]'), rest.join(' ').slice(0, 120));
const off = await call(`/api/subjects/${id}/explain`, { method: 'POST', body: { message: 'Explain quantum chromodynamics and gluon confinement' } });
check('explain refuses when the notes do not cover it', JSON.parse(off.text.split('\n')[0]).sources.length === 0 && off.text.includes("doesn't cover"));

const q2 = await takeQuiz(id, []);
check('second score is higher', q2.score > q1.score, `${q1.score} -> ${q2.score}`);
const plan2 = await call(`/s/${id}/plan`);
check('plan lists what changed', plan2.text.includes('What changed since the last plan'));
const progress = await call(`/s/${id}/progress`);
check('progress page renders both quizzes', progress.status === 200 && progress.text.includes('Quiz 2') && progress.text.includes('Score per topic'));
const rebuild = await call(`/api/subjects/${id}/topic-map`, { method: 'POST', body: {} });
check('rebuilding the map with history needs confirmation', rebuild.status === 400);

await call('/api/auth/signup', { method: 'POST', body: { email: `other${Date.now()}@example.com`, password: 'secret12', name: 'Other' } });
const foreign = await call(`/api/subjects/${id}/quiz`);
check("another user cannot read this subject's data", foreign.status === 400);

console.log(failed ? `\n${failed} check(s) failed` : '\nAll checks passed');
console.log(`SUBJECT_ID=${id}`);
process.exit(failed ? 1 : 0);
