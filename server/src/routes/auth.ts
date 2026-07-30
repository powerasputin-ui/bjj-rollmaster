import crypto from 'node:crypto';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import { OAuth2Client } from 'google-auth-library';
import { getDb, createTimerConfigRow } from '../db/client.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { signSession } from '../lib/jwt.js';
import { slugify } from '../lib/slug.js';
import { sendPasswordResetEmail } from '../lib/email.js';

export const authRouter = Router();

const BCRYPT_ROUNDS = 10;
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

function isUniqueConstraintError(err: unknown, column: string): boolean {
  return err instanceof Error && err.message.includes('UNIQUE constraint failed') && err.message.includes(column);
}

// Brute-force / credential-stuffing protection. Keyed by IP (express-rate-limit's
// default), so one attacker can't hammer login for an unlimited number of guesses.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'too_many_attempts' },
});

// Looser — legitimate signups happen once per person, but shouldn't be
// throttled as tightly as login guesses.
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'too_many_attempts' },
});

// Also guards against using this endpoint to mass-trigger Resend sends.
const forgotPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'too_many_attempts' },
});

interface TournamentRow {
  id: string;
  name: string;
  slug: string;
}

interface UserRow {
  id: string;
  email: string;
  password_hash: string | null;
  google_id: string | null;
  tournament_id: string;
}

function isValidEmail(email: unknown): email is string {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function createTournamentAndUser(params: {
  email: string;
  tournamentName: string;
  passwordHash: string | null;
  googleId: string | null;
}): { userId: string; tournament: TournamentRow } {
  const db = getDb();
  const tournamentId = crypto.randomUUID();
  const userId = crypto.randomUUID();
  const slug = slugify(params.tournamentName);

  const tx = db.transaction(() => {
    db.prepare('INSERT INTO tournaments (id, name, slug) VALUES (?, ?, ?)').run(tournamentId, params.tournamentName, slug);
    createTimerConfigRow(tournamentId);
    db.prepare(
      'INSERT INTO users (id, email, password_hash, google_id, tournament_id) VALUES (?, ?, ?, ?, ?)'
    ).run(userId, params.email, params.passwordHash, params.googleId, tournamentId);
  });
  tx();

  return { userId, tournament: { id: tournamentId, name: params.tournamentName, slug } };
}

function tournamentForUser(tournamentId: string): TournamentRow {
  return getDb().prepare('SELECT id, name, slug FROM tournaments WHERE id = ?').get(tournamentId) as TournamentRow;
}

authRouter.post('/register', registerLimiter, async (req, res) => {
  const { email, password, tournamentName } = req.body as { email?: unknown; password?: unknown; tournamentName?: unknown };
  if (!isValidEmail(email)) {
    res.status(400).json({ error: 'invalid_email' });
    return;
  }
  if (typeof password !== 'string' || password.length < 8) {
    res.status(400).json({ error: 'weak_password' });
    return;
  }
  if (typeof tournamentName !== 'string' || !tournamentName.trim()) {
    res.status(400).json({ error: 'invalid_tournament_name' });
    return;
  }

  const existing = getDb().prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) {
    res.status(409).json({ error: 'email_taken' });
    return;
  }

  try {
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const { userId, tournament } = createTournamentAndUser({
      email,
      tournamentName: tournamentName.trim(),
      passwordHash,
      googleId: null,
    });

    const token = signSession({ sub: userId, tournamentId: tournament.id, email });
    res.status(201).json({ token, tournament });
  } catch (err) {
    // The SELECT check above has a TOCTOU gap — two concurrent registrations
    // with the same email can both pass it before either INSERT commits.
    if (isUniqueConstraintError(err, 'users.email')) {
      res.status(409).json({ error: 'email_taken' });
      return;
    }
    console.error('Registration failed', err);
    res.status(500).json({ error: 'internal_error' });
  }
});

authRouter.post('/login', loginLimiter, async (req, res) => {
  const { email, password } = req.body as { email?: unknown; password?: unknown };
  if (!isValidEmail(email) || typeof password !== 'string') {
    res.status(400).json({ error: 'invalid_credentials' });
    return;
  }

  try {
    const user = getDb().prepare('SELECT * FROM users WHERE email = ?').get(email) as UserRow | undefined;
    if (!user || !user.password_hash) {
      res.status(401).json({ error: 'invalid_credentials' });
      return;
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      res.status(401).json({ error: 'invalid_credentials' });
      return;
    }

    const token = signSession({ sub: user.id, tournamentId: user.tournament_id, email: user.email });
    res.json({ token, tournament: tournamentForUser(user.tournament_id) });
  } catch (err) {
    console.error('Login failed', err);
    res.status(500).json({ error: 'internal_error' });
  }
});

authRouter.post('/google', loginLimiter, async (req, res) => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    res.status(501).json({ error: 'google_not_configured' });
    return;
  }

  const { credential, tournamentName } = req.body as { credential?: unknown; tournamentName?: unknown };
  if (typeof credential !== 'string' || !credential) {
    res.status(400).json({ error: 'invalid_credential' });
    return;
  }

  let payload: { sub: string; email?: string } | undefined;
  try {
    const client = new OAuth2Client(clientId);
    const ticket = await client.verifyIdToken({ idToken: credential, audience: clientId });
    const p = ticket.getPayload();
    if (p?.sub && p.email) payload = { sub: p.sub, email: p.email };
  } catch {
    res.status(401).json({ error: 'invalid_credential' });
    return;
  }
  if (!payload) {
    res.status(401).json({ error: 'invalid_credential' });
    return;
  }

  try {
    const db = getDb();
    let user = db.prepare('SELECT * FROM users WHERE google_id = ?').get(payload.sub) as UserRow | undefined;

    if (!user) {
      const existingByEmail = db.prepare('SELECT * FROM users WHERE email = ?').get(payload.email) as UserRow | undefined;
      if (existingByEmail) {
        db.prepare('UPDATE users SET google_id = ? WHERE id = ?').run(payload.sub, existingByEmail.id);
        user = { ...existingByEmail, google_id: payload.sub };
      }
    }

    if (!user) {
      if (typeof tournamentName !== 'string' || !tournamentName.trim()) {
        res.status(400).json({ error: 'tournament_name_required' });
        return;
      }
      const { userId, tournament } = createTournamentAndUser({
        email: payload.email,
        tournamentName: tournamentName.trim(),
        passwordHash: null,
        googleId: payload.sub,
      });
      const token = signSession({ sub: userId, tournamentId: tournament.id, email: payload.email });
      res.status(201).json({ token, tournament });
      return;
    }

    const token = signSession({ sub: user.id, tournamentId: user.tournament_id, email: user.email });
    res.json({ token, tournament: tournamentForUser(user.tournament_id) });
  } catch (err) {
    // Same TOCTOU window as /register (and here also possible on the
    // google_id UNIQUE column, e.g. two concurrent first-time sign-ins).
    if (isUniqueConstraintError(err, 'users.email') || isUniqueConstraintError(err, 'users.google_id')) {
      res.status(409).json({ error: 'email_taken' });
      return;
    }
    console.error('Google sign-in failed', err);
    res.status(500).json({ error: 'internal_error' });
  }
});

authRouter.post('/forgot-password', forgotPasswordLimiter, async (req, res) => {
  const { email } = req.body as { email?: unknown };
  try {
    if (isValidEmail(email)) {
      const db = getDb();
      const user = db.prepare('SELECT id FROM users WHERE email = ?').get(email) as { id: string } | undefined;
      if (user) {
        const token = crypto.randomBytes(32).toString('hex');
        const expires = new Date(Date.now() + RESET_TOKEN_TTL_MS).toISOString();
        db.prepare('UPDATE users SET reset_token = ?, reset_token_expires = ? WHERE id = ?').run(token, expires, user.id);
        const baseUrl = process.env.PUBLIC_APP_URL || 'http://localhost:3000';
        await sendPasswordResetEmail(email, `${baseUrl}/?resetToken=${token}`);
        if (process.env.NODE_ENV !== 'production') {
          res.json({ ok: true, devResetToken: token });
          return;
        }
      }
    }
  } catch (err) {
    console.error('Forgot-password failed', err);
    // Fall through to the generic response below — still no user enumeration,
    // and no need to fail the request just because, e.g., the email send hiccuped.
  }
  // Always the same response whether or not the email exists — no user enumeration.
  res.json({ ok: true });
});

authRouter.post('/reset-password', loginLimiter, async (req, res) => {
  const { token, newPassword } = req.body as { token?: unknown; newPassword?: unknown };
  if (typeof token !== 'string' || !token || typeof newPassword !== 'string' || newPassword.length < 8) {
    res.status(400).json({ error: 'invalid_request' });
    return;
  }

  try {
    const db = getDb();
    const user = db
      .prepare("SELECT id FROM users WHERE reset_token = ? AND reset_token_expires > datetime('now')")
      .get(token) as { id: string } | undefined;
    if (!user) {
      res.status(400).json({ error: 'invalid_or_expired_token' });
      return;
    }

    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    db.prepare('UPDATE users SET password_hash = ?, reset_token = NULL, reset_token_expires = NULL WHERE id = ?').run(
      passwordHash,
      user.id
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('Reset-password failed', err);
    res.status(500).json({ error: 'internal_error' });
  }
});

authRouter.get('/me', requireAuth, (req, res) => {
  const user = getDb().prepare('SELECT email FROM users WHERE id = ?').get(req.userId) as { email: string } | undefined;
  if (!user) {
    res.status(404).json({ error: 'not_found' });
    return;
  }
  res.json({ email: user.email, tournament: tournamentForUser(req.tournamentId) });
});
