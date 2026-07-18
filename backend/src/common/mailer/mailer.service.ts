import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

export interface SentMail {
  to: string;
  subject: string;
  /** Token resetu — przechwytywany TYLKO poza produkcją (do testów e2e). */
  token?: string;
  link?: string;
}

/**
 * Wysyłka maili. Gdy skonfigurowano SMTP (`SMTP_HOST`), wysyła realnie przez
 * nodemailer; w przeciwnym razie tylko loguje treść (świadoma luka dla devu).
 * Cała logika tokenów (generowanie, hash, wygaśnięcie, jednorazowość) działa
 * niezależnie od transportu.
 */
@Injectable()
export class MailerService {
  private readonly logger = new Logger(MailerService.name);
  private readonly transporter: Transporter | null;
  private readonly from: string;

  /** Ostatnio „wysłany" mail — dostępny tylko poza produkcją (test/dev). */
  lastSent: SentMail | null = null;

  constructor(private readonly config: ConfigService) {
    this.from =
      this.config.get<string>('smtp.from') ??
      'DocuGraph <no-reply@docugraph.local>';
    const host = this.config.get<string>('smtp.host');
    if (host) {
      const user = this.config.get<string>('smtp.user');
      const pass = this.config.get<string>('smtp.pass');
      this.transporter = nodemailer.createTransport({
        host,
        port: this.config.get<number>('smtp.port') ?? 587,
        secure: this.config.get<boolean>('smtp.secure') ?? false,
        auth: user ? { user, pass } : undefined,
      });
      this.logger.log(`SMTP transport configured (${host})`);
    } else {
      this.transporter = null;
      this.logger.warn('No SMTP_HOST — emails will be logged, not delivered.');
    }
  }

  async sendPasswordReset(
    to: string,
    token: string,
    link: string,
  ): Promise<void> {
    const subject = 'Reset your DocuGraph password';
    const text =
      `You requested a password reset.\n\n` +
      `Open this link to choose a new password (valid for 1 hour):\n${link}\n\n` +
      `If you didn't request this, you can ignore this email.`;
    const html = this.resetHtml(link);
    await this.deliver({ to, subject, token, link }, text, html);
  }

  /** E-mail o zmianie obserwowanego dokumentu (kind → czasownik w treści). */
  async sendWatchNotification(
    to: string,
    opts: {
      actorName: string;
      verb: string;
      filePath: string;
      title: string;
      link: string;
    },
  ): Promise<void> {
    const { actorName, verb, filePath, title, link } = opts;
    const subject = `${actorName} ${verb} "${title}"`;
    const text =
      `${actorName} ${verb} a document you're watching.\n\n` +
      `${title} (${filePath})\n\n` +
      `Open it: ${link}\n`;
    const html = this.watchHtml({ actorName, verb, filePath, title, link });
    await this.deliver({ to, subject, link }, text, html);
  }

  private watchHtml(opts: {
    actorName: string;
    verb: string;
    filePath: string;
    title: string;
    link: string;
  }): string {
    const { actorName, verb, filePath, title, link } = opts;
    return `<!doctype html><html><body style="font-family:system-ui,Segoe UI,Arial,sans-serif;background:#0b0f19;padding:32px;color:#e6e8ee">
  <div style="max-width:480px;margin:0 auto;background:#11151f;border:1px solid #222838;border-radius:14px;padding:28px">
    <p style="font-size:13px;color:#9aa3b2;margin:0 0 6px">${actorName} ${verb} a document you're watching</p>
    <h1 style="font-size:18px;margin:0 0 4px">${title}</h1>
    <p style="font-family:ui-monospace,monospace;font-size:12px;color:#6b7280;margin:0 0 20px">${filePath}</p>
    <a href="${link}" style="display:inline-block;background:#7c5cff;color:#fff;text-decoration:none;font-weight:600;font-size:14px;padding:11px 18px;border-radius:10px">Open document</a>
    <p style="font-size:12px;color:#6b7280;margin:20px 0 0">
      You're receiving this because you watch this document. Turn off email notifications in DocuGraph → Notifications.
    </p>
  </div>
</body></html>`;
  }

  /** Dzienny digest nieprzeczytanych powiadomień. */
  async sendDigest(
    to: string,
    items: { title: string; filePath: string; verb: string }[],
    link: string,
  ): Promise<void> {
    const subject = `Your DocuGraph digest — ${items.length} update${items.length === 1 ? '' : 's'}`;
    const lines = items.map((i) => `• ${i.title} — ${i.verb} (${i.filePath})`);
    const text = `You have ${items.length} unread update(s):\n\n${lines.join('\n')}\n\nOpen DocuGraph: ${link}\n`;
    const rows = items
      .map(
        (i) =>
          `<li style="margin:0 0 10px"><strong style="color:#e6e8ee">${i.title}</strong><br><span style="font-size:12px;color:#9aa3b2">${i.verb} · <span style="font-family:ui-monospace,monospace">${i.filePath}</span></span></li>`,
      )
      .join('');
    const html = `<!doctype html><html><body style="font-family:system-ui,Segoe UI,Arial,sans-serif;background:#0b0f19;padding:32px;color:#e6e8ee">
  <div style="max-width:520px;margin:0 auto;background:#11151f;border:1px solid #222838;border-radius:14px;padding:28px">
    <h1 style="font-size:18px;margin:0 0 16px">${items.length} unread update${items.length === 1 ? '' : 's'}</h1>
    <ul style="list-style:none;padding:0;margin:0 0 20px">${rows}</ul>
    <a href="${link}" style="display:inline-block;background:#7c5cff;color:#fff;text-decoration:none;font-weight:600;font-size:14px;padding:11px 18px;border-radius:10px">Open DocuGraph</a>
    <p style="font-size:12px;color:#6b7280;margin:20px 0 0">Turn off the daily digest in DocuGraph → Notifications.</p>
  </div>
</body></html>`;
    await this.deliver({ to, subject, link }, text, html);
  }

  private async deliver(
    mail: SentMail,
    text: string,
    html: string,
  ): Promise<void> {
    if (this.transporter) {
      await this.transporter.sendMail({
        from: this.from,
        to: mail.to,
        subject: mail.subject,
        text,
        html,
      });
      this.logger.log(`[mail] sent to ${mail.to} via SMTP`);
    } else {
      this.logger.log(
        `[mail] (log-only) To: ${mail.to} · ${mail.subject}${mail.link ? ` · ${mail.link}` : ''}`,
      );
    }
    if (this.config.get<string>('nodeEnv') !== 'production') {
      this.lastSent = mail;
    }
  }

  private resetHtml(link: string): string {
    return `<!doctype html><html><body style="font-family:system-ui,Segoe UI,Arial,sans-serif;background:#0b0f19;padding:32px;color:#e6e8ee">
  <div style="max-width:480px;margin:0 auto;background:#11151f;border:1px solid #222838;border-radius:14px;padding:28px">
    <h1 style="font-size:18px;margin:0 0 8px">Reset your password</h1>
    <p style="font-size:14px;color:#9aa3b2;margin:0 0 20px">
      Click the button below to choose a new password. This link expires in an hour.
    </p>
    <a href="${link}" style="display:inline-block;background:#7c5cff;color:#fff;text-decoration:none;font-weight:600;font-size:14px;padding:11px 18px;border-radius:10px">Choose a new password</a>
    <p style="font-size:12px;color:#6b7280;margin:20px 0 0">
      If you didn't request this, you can safely ignore this email.
    </p>
  </div>
</body></html>`;
  }
}
