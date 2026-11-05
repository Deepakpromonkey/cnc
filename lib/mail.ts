import "server-only";
import nodemailer, { type Transporter } from "nodemailer";
import pino from "pino";

const log = pino({ name: "mail" });

let transport: Transporter | null = null;
function tx() {
  if (!process.env.SMTP_HOST) return null;
  transport ??= nodemailer.createTransport({
    host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT || 587),
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
  });
  return transport;
}

/** Sends via CNC's Workspace SMTP; in dev (no SMTP_HOST) logs the mail instead. */
export async function sendMail(m: { to: string | string[]; subject: string; text: string; attachments?: { filename: string; content: Buffer }[] }) {
  const t = tx();
  if (!t) {
    log.info({ to: m.to, subject: m.subject, text: m.text }, "mail (dev, not sent)");
    return;
  }
  await t.sendMail({ from: process.env.MAIL_FROM, ...m });
}
