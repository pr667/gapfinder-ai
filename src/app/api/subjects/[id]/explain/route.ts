import { streamExplanation } from '@/lib/generation/explain';
import { friendly } from '@/lib/generation/llm';
import { route } from '@/lib/http';
import { retrieveForExplain } from '@/lib/pipeline';
import { requireSubject, UserError } from '@/lib/repo';

export const maxDuration = 60;

/**
 * Response format: the first line is JSON listing the retrieved sources, then
 * the answer streams as plain text. The sources are sent before a single word
 * is generated, which makes the retrieve-then-generate order visible.
 */
export const POST = route(async ({ user, params, body }) => {
  await requireSubject(user.id, params.id);
  const message = String(body.message ?? '').trim().slice(0, 600);
  if (!message) throw new UserError('Ask a question first.');
  const history = (Array.isArray(body.history) ? body.history : [])
    .filter((m: any) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .map((m: any) => ({ role: m.role, content: m.content.slice(0, 1500) }));

  // RETRIEVAL
  const { topic, passages } = await retrieveForExplain(params.id, message, body.topicId || null);
  const encoder = new TextEncoder();
  const head = JSON.stringify({ sources: passages.map((p) => ({ n: p.n, chunkId: p.chunkId, label: p.label, passage: p.text })) }) + '\n';

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(encoder.encode(head));
      try {
        if (!passages.length) {
          // Nothing relevant was retrieved, so the model is not called at all.
          controller.enqueue(encoder.encode("Your uploaded material doesn't cover this, so I can't explain it from your notes. Try rephrasing, or upload the chapter that covers it."));
        } else {
          // GENERATION, limited to the retrieved passages
          const { textStream, failure } = streamExplanation({ question: message, topic: topic?.name ?? null, passages, history });
          for await (const delta of textStream) controller.enqueue(encoder.encode(delta));
          if (failure.error) controller.enqueue(encoder.encode(`\n\n[${failure.error.message}]`));
        }
      } catch (error) {
        controller.enqueue(encoder.encode(`\n\n[${friendly(error).message}]`));
      }
      controller.close();
    },
  });
  return new Response(stream, { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });
});
