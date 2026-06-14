/**
 * Email utility using Resend (https://resend.com)
 * Free tier: 3,000 emails/month, 100/day
 * 
 * Setup:
 * 1. Sign up at https://resend.com (free)
 * 2. Get your API key from the dashboard
 * 3. Add RESEND_API_KEY to your .env file
 */

const RESEND_API_KEY = process.env.RESEND_API_KEY
const FROM_EMAIL = process.env.FROM_EMAIL || 'Spreetail <onboarding@resend.dev>'

interface SendEmailOptions {
  to: string
  subject: string
  html: string
}

export async function sendEmail({ to, subject, html }: SendEmailOptions): Promise<boolean> {
  if (!RESEND_API_KEY) {
    console.warn('[Email] RESEND_API_KEY not set — skipping email to:', to)
    return false
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to,
        subject,
        html,
      }),
    })

    if (!res.ok) {
      const err = await res.text()
      console.error('[Email] Failed to send:', err)
      return false
    }

    return true
  } catch (err) {
    console.error('[Email] Error:', err)
    return false
  }
}

// ─────────────────────────────────────────────
// Email Templates
// ─────────────────────────────────────────────

export function welcomeEmail(name: string): string {
  return `
    <div style="font-family: -apple-system, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px;">
      <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 32px;">
        <div style="width:32px;height:32px;background:#2563eb;border-radius:8px;display:flex;align-items:center;justify-content:center;color:white;font-weight:700;font-size:14px;">S</div>
        <span style="font-size:18px;font-weight:700;letter-spacing:-0.02em;">Spreetail</span>
      </div>
      
      <h1 style="font-size:22px;font-weight:700;color:#0f172a;margin-bottom:8px;">Welcome, ${name}! 🎉</h1>
      <p style="color:#475569;line-height:1.6;margin-bottom:24px;">
        Your Spreetail account is ready. Start tracking shared expenses with your flatmates — no more awkward "who paid for what" conversations!
      </p>
      
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:20px;margin-bottom:24px;">
        <p style="font-weight:600;color:#0f172a;margin:0 0 12px 0;">Get started in 3 steps:</p>
        <p style="color:#475569;margin:4px 0;">1️⃣ Create a group (e.g., "Flat 4B")</p>
        <p style="color:#475569;margin:4px 0;">2️⃣ Add your flatmates by email</p>
        <p style="color:#475569;margin:4px 0;">3️⃣ Log expenses and let Spreetail handle the maths</p>
      </div>
      
      <p style="color:#94a3b8;font-size:13px;margin-top:32px;">
        — The Spreetail Team
      </p>
    </div>
  `
}

export function groupInviteEmail(inviteeName: string, inviterName: string, groupName: string, appUrl: string): string {
  return `
    <div style="font-family: -apple-system, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px;">
      <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 32px;">
        <div style="width:32px;height:32px;background:#2563eb;border-radius:8px;display:flex;align-items:center;justify-content:center;color:white;font-weight:700;font-size:14px;">S</div>
        <span style="font-size:18px;font-weight:700;letter-spacing:-0.02em;">Spreetail</span>
      </div>
      
      <h1 style="font-size:22px;font-weight:700;color:#0f172a;margin-bottom:8px;">You've been added to a group! 🏠</h1>
      <p style="color:#475569;line-height:1.6;margin-bottom:24px;">
        Hi ${inviteeName}! <strong>${inviterName}</strong> has added you to the <strong>"${groupName}"</strong> expense group on Spreetail.
      </p>
      
      <p style="color:#475569;line-height:1.6;margin-bottom:24px;">
        You can now see shared expenses, track balances, and settle up with your groupmates.
      </p>
      
      <a href="${appUrl}/dashboard" 
         style="display:inline-block;background:#2563eb;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px;">
        View Group →
      </a>
      
      <p style="color:#94a3b8;font-size:13px;margin-top:32px;">
        — The Spreetail Team
      </p>
    </div>
  `
}
