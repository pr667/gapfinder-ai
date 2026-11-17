'use client';

import { useState } from 'react';
import { api } from './client';

export function LoginForm({ demo }: { demo: { email: string; password: string } }) {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function go(action: string, body?: unknown) {
    setBusy(true);
    setError('');
    try {
      await api(`/api/auth/${action}`, body ?? {});
      window.location.href = '/subjects';
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="panel p-6">
      <div className="rounded-md bg-paper p-4">
        <p className="font-bold">Try it with the demo account</p>
        <p className="note mt-1">
          Email <code className="text-ink">{demo.email}</code>, password <code className="text-ink">{demo.password}</code>
        </p>
        <button className="btn btn-primary mt-3 w-full" disabled={busy} onClick={() => go('demo')}>
          Log in as demo student
        </button>
      </div>

      <form
        className="mt-6 space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          go(mode, form);
        }}
      >
        <h2 className="text-xl font-bold">{mode === 'login' ? 'Log in' : 'Create an account'}</h2>
        {mode === 'signup' && (
          <label className="block">
            <span className="note">Name</span>
            <input className="field" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoComplete="name" />
          </label>
        )}
        <label className="block">
          <span className="note">Email</span>
          <input className="field" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} autoComplete="email" />
        </label>
        <label className="block">
          <span className="note">Password</span>
          <input
            className="field"
            type="password"
            required
            minLength={6}
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          />
        </label>
        {error && (
          <p role="alert" className="rounded-md bg-weak-bg px-3 py-2 text-weak">
            {error}
          </p>
        )}
        <button className="btn w-full" disabled={busy}>
          {mode === 'login' ? 'Log in' : 'Create account'}
        </button>
      </form>
      <button className="btn btn-quiet mt-2" onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}>
        {mode === 'login' ? 'New here? Create an account' : 'Have an account? Log in'}
      </button>
    </div>
  );
}
