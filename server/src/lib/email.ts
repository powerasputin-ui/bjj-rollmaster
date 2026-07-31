import { Resend } from 'resend';

let client: Resend | null = null;

function getClient(): Resend | null {
  if (!process.env.RESEND_API_KEY) return null;
  if (!client) client = new Resend(process.env.RESEND_API_KEY);
  return client;
}

export async function sendPasswordResetEmail(to: string, resetUrl: string): Promise<void> {
  const resend = getClient();
  if (!resend) {
    console.warn('RESEND_API_KEY not set — skipping password reset email send');
    return;
  }
  const from = process.env.RESEND_FROM || 'onboarding@resend.dev';
  try {
    await resend.emails.send({
      from,
      to,
      subject: 'BJJ RollMaster — Password Reset',
      html: `<p>Follow this link to reset your BJJ RollMaster password:</p><p><a href="${resetUrl}">${resetUrl}</a></p><p>This link expires in 1 hour. If you didn't request this, ignore this email.</p>`,
    });
  } catch (err) {
    console.error('Failed to send password reset email', err);
  }
}

// Doubles as the athlete's first login — clicking the link both confirms the
// email and signs them into their cabinet, so an unconfirmed registration
// never needs a separate "login" step for that first visit.
export async function sendRegistrationVerificationEmail(to: string, verifyUrl: string, tournamentName: string): Promise<void> {
  const resend = getClient();
  if (!resend) {
    console.warn('RESEND_API_KEY not set — skipping registration verification email send');
    return;
  }
  const from = process.env.RESEND_FROM || 'onboarding@resend.dev';
  try {
    await resend.emails.send({
      from,
      to,
      subject: `Confirm your registration for ${tournamentName}`,
      html: `<p>Confirm your email to complete your registration for <strong>${tournamentName}</strong>:</p><p><a href="${verifyUrl}">${verifyUrl}</a></p><p>The organizer won't see your request until you confirm. This link expires in 1 hour.</p>`,
    });
  } catch (err) {
    console.error('Failed to send registration verification email', err);
  }
}

export async function sendAthleteLoginEmail(to: string, loginUrl: string): Promise<void> {
  const resend = getClient();
  if (!resend) {
    console.warn('RESEND_API_KEY not set — skipping athlete login email send');
    return;
  }
  const from = process.env.RESEND_FROM || 'onboarding@resend.dev';
  try {
    await resend.emails.send({
      from,
      to,
      subject: 'Your BJJ RollMaster sign-in link',
      html: `<p>Click this link to view your registrations:</p><p><a href="${loginUrl}">${loginUrl}</a></p><p>This link expires in 1 hour. If you didn't request this, ignore this email.</p>`,
    });
  } catch (err) {
    console.error('Failed to send athlete login email', err);
  }
}

export async function sendRegistrationDecisionEmail(to: string, tournamentName: string, approved: boolean): Promise<void> {
  const resend = getClient();
  if (!resend) {
    console.warn('RESEND_API_KEY not set — skipping registration decision email send');
    return;
  }
  const from = process.env.RESEND_FROM || 'onboarding@resend.dev';
  const subject = approved ? `You're in! ${tournamentName}` : `Update on your ${tournamentName} registration`;
  const body = approved
    ? `<p>Good news — your registration for <strong>${tournamentName}</strong> has been approved.</p>`
    : `<p>Your registration for <strong>${tournamentName}</strong> was not accepted this time.</p>`;
  try {
    await resend.emails.send({ from, to, subject, html: body });
  } catch (err) {
    console.error('Failed to send registration decision email', err);
  }
}
