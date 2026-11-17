import { cookies } from 'next/headers';
import { SignJWT, jwtVerify } from 'jose';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { newId, one, q } from './db';

export const DEMO = { email: 'demo@gapfinder.app', password: 'demo1234', name: 'Demo Student' };
const COOKIE = 'gf_session';
const secret = () => new TextEncoder().encode(process.env.AUTH_SECRET || 'dev-only-secret-change-me-in-production');

export type User = { id: string; email: string; name: string };

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(password, salt, 32).toString('hex')}`;
}

export function checkPassword(password: string, stored: string) {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const candidate = scryptSync(password, salt, 32);
  const known = Buffer.from(hash, 'hex');
  return candidate.length === known.length && timingSafeEqual(candidate, known);
}

export async function startSession(user: User) {
  const token = await new SignJWT({ email: user.email, name: user.name })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(user.id)
    .setExpirationTime('30d')
    .sign(secret());
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production' && !process.env.INSECURE_COOKIES,
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function endSession() {
  (await cookies()).delete(COOKIE);
}

export async function getUser(): Promise<User | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    return { id: payload.sub as string, email: payload.email as string, name: payload.name as string };
  } catch {
    return null;
  }
}

export async function signup(email: string, password: string, name: string): Promise<User> {
  email = email.trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error('Enter a valid email address.');
  if (password.length < 6) throw new Error('Use a password of at least 6 characters.');
  if (await one('select id from users where email = $1', [email])) throw new Error('An account with this email already exists. Log in instead.');
  const user = { id: newId(), email, name: name.trim() || email.split('@')[0] };
  await q('insert into users (id, email, name, password_hash) values ($1,$2,$3,$4)', [user.id, user.email, user.name, hashPassword(password)]);
  return user;
}

export async function login(email: string, password: string): Promise<User> {
  email = email.trim().toLowerCase();
  let row = await one('select * from users where email = $1', [email]);
  // The demo account is created on first use so judges never hit a missing login.
  if (!row && email === DEMO.email && password === DEMO.password) {
    await signup(DEMO.email, DEMO.password, DEMO.name);
    row = await one('select * from users where email = $1', [email]);
  }
  if (!row || !checkPassword(password, row.password_hash)) throw new Error('Email or password is incorrect.');
  return { id: row.id, email: row.email, name: row.name };
}
