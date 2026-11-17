import { DEMO, endSession, login, signup, startSession } from '@/lib/auth';

export async function POST(req: Request, { params }: { params: Promise<{ action: string }> }) {
  const { action } = await params;
  const body = await req.json().catch(() => ({}));
  try {
    if (action === 'logout') {
      await endSession();
      return Response.json({ ok: true });
    }
    const user =
      action === 'demo'
        ? await login(DEMO.email, DEMO.password)
        : action === 'signup'
          ? await signup(String(body.email ?? ''), String(body.password ?? ''), String(body.name ?? ''))
          : await login(String(body.email ?? ''), String(body.password ?? ''));
    await startSession(user);
    return Response.json({ user });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 400 });
  }
}
