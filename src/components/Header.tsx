import Link from 'next/link';
import { LogoutButton } from './SmallClient';

export function Header({ userName, warning }: { userName: string; warning?: string | null }) {
  return (
    <header className="border-b border-line bg-surface">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-5 gap-y-1 px-5 py-3">
        <Link href="/subjects" className="font-display text-lg font-extrabold">
          GapFinder AI
        </Link>
        <Link href="/subjects" className="text-muted hover:text-ink">
          My subjects
        </Link>
        <Link href="/how-it-works" className="text-muted hover:text-ink">
          How the AI works
        </Link>
        <span className="ml-auto hidden text-muted sm:inline">{userName}</span>
        <span className="ml-auto sm:ml-0">
          <LogoutButton />
        </span>
      </div>
      {warning && <p className="bg-medium-bg px-5 py-2 text-center text-sm text-medium-ink">{warning}</p>}
    </header>
  );
}

export function setupWarning() {
  const missing: string[] = [];
  if (!process.env.GROQ_API_KEY) missing.push('GROQ_API_KEY is not set, so AI steps will fail');
  if (process.env.VERCEL && !process.env.DATABASE_URL) missing.push('DATABASE_URL is not set, so data will not be saved between visits');
  if (process.env.VERCEL && !process.env.AUTH_SECRET) missing.push('AUTH_SECRET is not set, so logins are signed with a public default key');
  return missing.length ? `Setup incomplete: ${missing.join('; ')}.` : null;
}
