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
