'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from './client';

export function LogoutButton() {
  return (
    <button
      className="btn btn-quiet"
      onClick={async () => {
        await api('/api/auth/logout', {});
        window.location.href = '/login';
      }}
    >
      Log out
    </button>
  );
}

export function ErrorNote({ message }: { message: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="mt-3 rounded-md bg-weak-bg px-3 py-2 text-weak">
      {message}
    </p>
  );
}

/** A button that calls one API endpoint, shows progress, then refreshes or navigates. */
export function ActionButton(props: {
  label: string;
  busyLabel: string;
  path: string;
  body?: unknown;
  method?: string;
  confirm?: string;
  next?: string;
  primary?: boolean;
  quiet?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <span>
      <button
        className={`btn ${props.primary ? 'btn-primary' : ''} ${props.quiet ? 'btn-quiet' : ''}`}
        disabled={busy}
        onClick={async () => {
          if (props.confirm && !window.confirm(props.confirm)) return;
          setBusy(true);
          setError('');
          try {
            await api(props.path, props.body ?? {}, props.method ?? 'POST');
            if (props.next) router.push(props.next);
            router.refresh();
          } catch (e) {
            setError((e as Error).message);
          }
          setBusy(false);
        }}
      >
        {busy ? props.busyLabel : props.label}
      </button>
      <ErrorNote message={error} />
    </span>
  );
}
