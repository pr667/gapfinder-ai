import { getUser, type User } from './auth';
import { LlmError } from './generation/llm';
import { UserError } from './repo';

type Ctx = { user: User; req: Request; params: Record<string, string>; body: any };

export const fail = (error: unknown) => {
  const status = error instanceof UserError ? 400 : error instanceof LlmError ? 502 : 500;
  if (status === 500) console.error(error);
  return Response.json({ error: error instanceof Error ? error.message : 'Something went wrong.' }, { status });
};

/** Wraps a route handler with the session check, JSON parsing and error mapping. */
export function route(handler: (ctx: Ctx) => Promise<unknown>) {
  return async (req: Request, context: { params: Promise<any> }) => {
    try {
      const user = await getUser();
      if (!user) return Response.json({ error: 'Log in first.' }, { status: 401 });
      const body = req.method === 'POST' || req.method === 'PUT' ? await req.json().catch(() => ({})) : {};
      const result = await handler({ user, req, params: await context.params, body });
      return result instanceof Response ? result : Response.json(result ?? { ok: true });
    } catch (error) {
      return fail(error);
    }
  };
}
