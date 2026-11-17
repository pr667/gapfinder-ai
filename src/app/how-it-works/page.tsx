import Link from 'next/link';
import { Header } from '@/components/Header';
import { getUser } from '@/lib/auth';

const STEPS = [
  {
    step: 'Upload',
    retrieval: 'Files are split into passages of about 900 characters. Each keeps its file, page and heading; that is what a citation shows. Passages are indexed for keyword search (BM25) and, if an embeddings key is set, for semantic search.',
    generation: 'None.',
    check: 'None needed.',
  },
  {
    step: 'Topic map',
    retrieval: 'Every passage of the notes is filed under the topic it matches best. Each past-paper question is matched against the topics and the three closest become its shortlist.',
    generation: 'The model reads the syllabus text and structures it into topics and subtopics. For past-paper questions with more than one candidate, it picks one from the shortlist.',
    check: 'The model can only choose a topic from the shortlist retrieval produced, or "none".',
  },
  {
    step: 'Quiz',
    retrieval: 'Code decides which topics to test (all of them first, then weak and exam-heavy ones more) and picks the passages, preferring ones not used before.',
    generation: 'The model writes one question per passage and must copy a short quote from the passage that proves the answer.',
    check: 'If the quote is not found in the passage, the question is thrown away. The citation is the passage the code picked, never a reference the model wrote. Answer options are shuffled in code.',
  },
  {
    step: 'Marking',
    retrieval: 'The passage each question was written from is loaded again by its id.',
    generation: 'Multiple-choice answers are marked in code. Written answers are marked by the model against the passage, with a reason.',
    check: 'Verdicts are reduced to correct, partly correct or incorrect. If the model is unavailable, a keyword-overlap fallback marks the answer and says so.',
  },
  {
    step: 'Gap report',
    retrieval: 'None. The inputs are quiz results and past-paper counts.',
    generation: 'Scores, weak / medium / strong labels and priorities are arithmetic in code. The model adds one sentence per topic on what the wrong answers have in common.',
    check: 'The model never sets a score or a label.',
  },
  {
    step: 'Plan',
    retrieval: 'Passages behind missed questions become the "re-read" links. Past-paper questions on the topic become practice.',
    generation: 'Minutes per topic and the day-by-day order are calculated from priority and the time available. The model contributes one study tip per topic.',
    check: 'Rebuilt after every quiz, with a list of what moved.',
  },
  {
    step: 'Explain a topic',
    retrieval: 'The question is searched against the notes and the top five passages are sent to the browser before any answer is written.',
    generation: 'The model answers using only those passages and cites them by number.',
    check: 'If no passage is a real match, the model is not called and the app says the material does not cover it.',
  },
];

export default async function HowItWorks() {
  const user = await getUser();
  return (
    <>
      {user ? <Header userName={user.name} /> : null}
      <main className="mx-auto max-w-5xl px-5 py-8">
        {!user && (
          <Link href="/login" className="text-pen underline">
            Back to log in
          </Link>
        )}
        <h1 className="mt-2 text-4xl font-extrabold">How the AI works</h1>
        <p className="mt-3 max-w-[70ch] text-lg text-muted">
          GapFinder uses retrieval-augmented generation. Retrieval means looking up passages in your uploaded files. Generation means a
          language model writing text. The two are kept in separate parts of the code, and the model only ever sees passages that retrieval
          handed to it.
        </p>
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <div className="panel p-5">
            <h2 className="text-xl font-bold">Retrieval</h2>
            <p className="mt-1 text-muted">
              Code in <code>src/lib/retrieval</code>. Ranks passages with BM25 keyword scoring, optionally blended with embedding similarity.
              It never calls a language model.
            </p>
          </div>
          <div className="panel p-5">
            <h2 className="text-xl font-bold">Generation</h2>
            <p className="mt-1 text-muted">
              Code in <code>src/lib/generation</code>. Calls Groq through the Vercel AI SDK. These functions cannot read the database; they
              receive passages as arguments and return JSON that is validated before use.
            </p>
          </div>
        </div>
        <div className="panel mt-6 overflow-x-auto">
          <table className="w-full min-w-[46rem] text-left align-top text-[0.94rem]">
            <thead>
              <tr className="border-b border-line text-muted">
                <th className="px-4 py-3 font-normal">Step</th>
                <th className="px-4 py-3 font-normal">Retrieval (code)</th>
                <th className="px-4 py-3 font-normal">Generation (model)</th>
                <th className="px-4 py-3 font-normal">Check</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {STEPS.map((s) => (
                <tr key={s.step} className="align-top">
                  <th className="px-4 py-3 font-bold whitespace-nowrap">{s.step}</th>
                  <td className="px-4 py-3">{s.retrieval}</td>
                  <td className="px-4 py-3">{s.generation}</td>
                  <td className="px-4 py-3">{s.check}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </>
  );
}
