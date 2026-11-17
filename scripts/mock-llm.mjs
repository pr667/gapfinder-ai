import { createServer } from 'node:http';

const PORT = Number(process.env.MOCK_PORT || 4010);
const sentences = (text) => text.replace(/\s+/g, ' ').match(/[^.!?]+[.!?]/g)?.map((s) => s.trim()) ?? [text];

function topicMap(prompt) {
  const lines = prompt.split('\n').map((l) => l.trim());
  const topics = [];
  lines.forEach((line, i) => {
    const m = line.match(/^(\d+)\.\s+(.+)$/) || (/^[A-Z][A-Za-z ]{3,40}$/.test(line) && lines[i + 1]?.length > 60 ? [null, null, line] : null);
    if (!m) return;
    const body = lines[i + 1] ?? '';
    const subs = sentences(body).slice(0, 4).map((s) => s.replace(/[.:]$/, '').split(/[:,]/)[0].trim()).filter((s) => s.length > 3);
    const words = [...new Set(body.toLowerCase().match(/[a-z]{5,}/g) ?? [])].slice(0, 10);
    topics.push({ name: m[2], summary: body.slice(0, 140), keywords: words, subtopics: subs.map((name) => ({ name, keywords: name.toLowerCase().split(' ') })) });
  });
  // Outline mode accepts headings with their opening words.
  if (!topics.length) {
    for (const m of prompt.matchAll(/^## ([^:\n]+): (.*)$/gm)) {
      if (!topics.some((t) => t.name === m[1])) topics.push({ name: m[1], summary: m[2], keywords: m[2].toLowerCase().match(/[a-z]{5,}/g) ?? [], subtopics: [] });
    }
  }
  return { topics: topics.slice(0, 12) };
}

function quiz(prompt) {
  const questions = [];
  for (const m of prompt.matchAll(/<passage id="(P\d+)" type="(\w+)" topic="([^"]*)">\n([\s\S]*?)\n<\/passage>/g)) {
    const [, id, type, topic, passage] = m;
    const body = passage.split('\n').slice(passage.includes('\n') ? 1 : 0).join(' ');
    const picks = sentences(body).filter((s) => s.split(' ').length >= 7);
    const fact = picks[0] ?? body.slice(0, 120);
    const evidence = fact.split(' ').slice(0, 18).join(' ').replace(/[.,;]$/, '');
    // P4 uses a fake quote to test grounding rejection.
    const bad = id === 'P4' && !globalThis.__retried;
    if (id === 'P4') globalThis.__retried = true;
    questions.push({
      passage: id,
      question: `According to your notes on ${topic}, which statement is correct? (${id})`,
      options: type === 'mcq' ? [fact, 'The opposite of what the notes say.', 'Something about an unrelated organ.', 'None of the processes described.'] : [],
      correct_index: 0,
      answer: fact,
      explanation: `The notes state this directly: ${fact}`,
      evidence: bad ? 'this sentence was invented by the model and is nowhere in the passage' : evidence,
      concept: fact.split(' ').slice(0, 3).join(' '),
    });
  }
  return { questions };
}

function grading(prompt) {
  const grades = [];
  for (const m of prompt.matchAll(/<item ref="(A\d+)">[\s\S]*?Model answer: (.*)\nStudent answer: (.*)\n<\/item>/g)) {
    const want = new Set(m[2].toLowerCase().match(/[a-z]{4,}/g) ?? []);
    const got = new Set(m[3].toLowerCase().match(/[a-z]{4,}/g) ?? []);
    const share = [...want].filter((w) => got.has(w)).length / Math.max(1, want.size);
    const verdict = share > 0.6 ? 'correct' : share > 0.25 ? 'partial' : 'incorrect';
    grades.push({ ref: m[1], verdict, feedback: verdict === 'correct' ? 'You gave the key idea from the passage.' : `You left out the main point. The passage says: ${m[2].slice(0, 120)}` });
  }
  return { grades };
}

function respond(instructions, prompt) {
  const task = instructions.match(/\[task:(\w+)\]/)?.[1];
  if (task === 'topic_map') return JSON.stringify(topicMap(prompt));
  if (task === 'quiz') return '```json\n' + JSON.stringify(quiz(prompt)) + '\n```'; // fenced on purpose
  if (task === 'grading') return JSON.stringify(grading(prompt));
  if (task === 'paper_mapping') return JSON.stringify({ choices: [...prompt.matchAll(/Question (\d+):/g)].map((m) => ({ q: Number(m[1]), topic: 1 })) });
  if (task === 'diagnosis') {
    return JSON.stringify({ topics: [...prompt.matchAll(/<topic ref="(T\d+)" name="([^"]*)"/g)].map((m) => ({ ref: m[1], diagnosis: `You are mixing up two steps of ${m[2]}.`, tip: `Draw ${m[2]} as a flow chart from memory, then check it against your notes.` })) });
  }
  if (task === 'explain') {
    const first = instructions.match(/\[1\] \(.*\)\n([^\n]+)/)?.[1] ?? '';
    return `${sentences(first).slice(0, 2).join(' ')} [1]`;
  }
  return '{}';
}

createServer((req, res) => {
  let raw = '';
  req.on('data', (c) => (raw += c));
  req.on('end', () => {
    const body = raw ? JSON.parse(raw) : {};
    if (req.url.endsWith('/embeddings')) {
      // These vectors are meaningless but have the expected shape.
      const inputs = [].concat(body.input);
      const data = inputs.map((text, index) => {
        const v = new Array(64).fill(0);
        for (const w of String(text).toLowerCase().match(/[a-z]{4,}/g) ?? []) v[(w.charCodeAt(0) * 7 + w.charCodeAt(1) * 3 + w.length) % 64] += 1;
        return { object: 'embedding', index, embedding: v };
      });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ object: 'list', data, model: body.model, usage: { prompt_tokens: 1, total_tokens: 1 } }));
    }
    const messages = body.messages ?? [];
    const text = (m) => (typeof m?.content === 'string' ? m.content : (m?.content ?? []).map((p) => p.text ?? '').join(''));
    const instructions = messages.filter((m) => m.role === 'system').map(text).join('\n');
    const prompt = text(messages.filter((m) => m.role === 'user').at(-1));
    const content = respond(instructions, prompt);
    const base = { id: 'mock', created: Math.floor(Date.now() / 1000), model: body.model };
    console.log(`[mock] ${instructions.match(/\[task:(\w+)\]/)?.[1] ?? '?'} model=${body.model} stream=${Boolean(body.stream)} effort=${body.reasoning_effort ?? '-'}`);
    if (body.stream) {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      for (const piece of content.match(/.{1,24}/gs) ?? []) {
        res.write(`data: ${JSON.stringify({ ...base, object: 'chat.completion.chunk', choices: [{ index: 0, delta: { role: 'assistant', content: piece }, finish_reason: null }] })}\n\n`);
      }
      res.write(`data: ${JSON.stringify({ ...base, object: 'chat.completion.chunk', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } })}\n\n`);
      return res.end('data: [DONE]\n\n');
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ...base, object: 'chat.completion', choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } }));
  });
}).listen(PORT, () => console.log(`Mock LLM listening on http://localhost:${PORT}/v1`));
