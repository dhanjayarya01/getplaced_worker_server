import dotenv from 'dotenv'
dotenv.config()

import { Resend } from 'resend'

// ── Resend Setup ──────────────────────────────────────────────────────────────
const resend = new Resend(process.env.RESEND_API_KEY)

/**
 * Send "Your Daily Job Matches" email to a user.
 * @param {{ email: string, name: string }} user
 * @param {{ title: string, company: string, matchScore: number, url: string }[]} jobs
 */
export async function sendJobMatchEmail(user, jobs) {
    if (!process.env.RESEND_API_KEY) {
        console.warn('[Email] ⚠️  Resend API key not set — skipping email')
        return
    }

    if (!jobs.length) return

    const topJobs = jobs.slice(0, 8) // max 8 jobs in the email

    const jobRows = topJobs.map(j => `
        <tr style="border-bottom: 1px solid #1e293b;">
            <td style="padding: 12px 16px;">
                <div style="font-weight: 600; color: #f1f5f9;">${j.title}</div>
                <div style="font-size: 13px; color: #94a3b8;">${j.company}</div>
            </td>

            <td style="padding: 12px 16px; text-align: right;">
                <span style="
                    background: ${j.matchScore >= 0.85 ? '#22c55e' : '#3b82f6'};
                    color: white;
                    font-size: 12px;
                    font-weight: 700;
                    padding: 3px 10px;
                    border-radius: 999px;
                ">
                    ${Math.round(j.matchScore * 100)}% match
                </span>
            </td>

            <td style="padding: 12px 16px; text-align: right;">
                <a
                    href="${process.env.FRONTEND_URL}/jobs?q=${encodeURIComponent(j.title)}"
                    style="
                        color: #818cf8;
                        text-decoration: none;
                        font-size: 13px;
                    "
                >
                    View Job →
                </a>
            </td>
        </tr>
    `).join('')

    const html = `
    <!DOCTYPE html>
    <html>
    <body style="
        background: #0f172a;
        font-family: -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
        margin: 0;
        padding: 20px;
    ">

        <div style="max-width: 600px; margin: 0 auto;">

            <!-- Header -->
            <div style="
                background: linear-gradient(135deg, #6366f1, #8b5cf6);
                border-radius: 16px 16px 0 0;
                padding: 32px;
                text-align: center;
            ">
                <h1 style="
                    color: white;
                    margin: 0;
                    font-size: 28px;
                ">
                    🎯 Your Daily Job Matches
                </h1>

                <p style="
                    color: rgba(255,255,255,0.8);
                    margin: 8px 0 0;
                ">
                    AI-powered recommendations just for you,
                    ${user.name?.split(' ')[0] || 'there'}
                </p>
            </div>

            <!-- Body -->
            <div style="
                background: #1e293b;
                padding: 32px;
                border-radius: 0 0 16px 16px;
            ">

                <p style="
                    color: #94a3b8;
                    margin: 0 0 20px;
                ">
                    Our ML model analyzed your resume against
                    <strong style="color: #f1f5f9;">
                        ${jobs.length} new jobs
                    </strong>
                    posted today and found these top matches:
                </p>

                <table style="
                    width: 100%;
                    border-collapse: collapse;
                    background: #0f172a;
                    border-radius: 12px;
                    overflow: hidden;
                ">
                    <thead>
                        <tr style="background: #1e293b;">
                            <th style="
                                padding: 12px 16px;
                                text-align: left;
                                color: #64748b;
                                font-size: 12px;
                                text-transform: uppercase;
                            ">
                                Position
                            </th>

                            <th style="
                                padding: 12px 16px;
                                text-align: right;
                                color: #64748b;
                                font-size: 12px;
                                text-transform: uppercase;
                            ">
                                Match
                            </th>

                            <th style="
                                padding: 12px 16px;
                                text-align: right;
                                color: #64748b;
                                font-size: 12px;
                                text-transform: uppercase;
                            ">
                            </th>
                        </tr>
                    </thead>

                    <tbody>
                        ${jobRows}
                    </tbody>
                </table>

                <!-- CTA -->
                <div style="text-align: center; margin-top: 28px;">
                    <a
                        href="${process.env.FRONTEND_URL || 'https://getplaced.tech'}/jobs"
                        style="
                            background: linear-gradient(135deg, #6366f1, #8b5cf6);
                            color: white;
                            text-decoration: none;
                            padding: 14px 32px;
                            border-radius: 10px;
                            font-weight: 600;
                            display: inline-block;
                        "
                    >
                        View All ${jobs.length} Recommendations →
                    </a>
                </div>

                <p style="
                    color: #475569;
                    font-size: 12px;
                    text-align: center;
                    margin-top: 24px;
                ">
                    You're receiving this because you have a resume on GetPlaced.
                    <br>

                    <a
                        href="${process.env.FRONTEND_URL || 'https://getplaced.tech'}/settings"
                        style="color: #6366f1;"
                    >
                        Manage preferences
                    </a>
                </p>
            </div>
        </div>
    </body>
    </html>
    `

    try {
        const { data, error } = await resend.emails.send({
            from: process.env.EMAIL_FROM || 'GetPlaced <onboarding@resend.dev>',
            to: user.email,
            subject: `🎯 ${jobs.length} new job matches for you today — GetPlaced`,
            html,
        })

        if (error) {
            console.error('[Email] ❌ Resend error:', error)
            return
        }

        console.log(
            `[Email] ✉️  Sent job matches to ${user.email} (${jobs.length} jobs)`
        )

        return data

    } catch (error) {
        console.error(
            `[Email] ❌ Failed to send to ${user.email}:`,
            error.message
        )
    }
}

/**
 * Send a custom admin email to a user.
 * @param {string} toEmail
 * @param {string} subject
 * @param {string} html
 */
export async function sendCustomEmail(toEmail, subject, html) {

    if (!process.env.RESEND_API_KEY) {
        console.warn('[Email] ⚠️  Resend API key not set')
        return false
    }

    try {

        const { error } = await resend.emails.send({
            from: process.env.EMAIL_FROM || 'GetPlaced <onboarding@resend.dev>',
            to: toEmail,
            subject,
            html,
        })

        if (error) {
            console.error(
                `[Email] ❌ Failed to send to ${toEmail}:`,
                error
            )
            return false
        }

        console.log(`[Email] 📧 Sent custom email to ${toEmail}`)

        return true

    } catch (error) {

        console.error(
            `[Email] ❌ Failed to send to ${toEmail}:`,
            error.message
        )

        return false
    }
}