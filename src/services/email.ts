import nodemailer from "nodemailer";

const MAIL_HOST = process.env.MAIL_HOST || process.env.SMTP_HOST || "";
const MAIL_PORT = Number(process.env.MAIL_PORT || process.env.SMTP_PORT || 587);
const MAIL_USER = process.env.MAIL_USER || process.env.SMTP_USER || "";
const MAIL_PASS = process.env.MAIL_PASS || process.env.SMTP_PASS || "";
const MAIL_FROM = process.env.MAIL_FROM || MAIL_USER || "";

const transporter = nodemailer.createTransport({
  host: MAIL_HOST || "smtp.example.com",
  port: MAIL_PORT,
  secure: MAIL_PORT === 465,
  auth:
    MAIL_USER && MAIL_PASS ? { user: MAIL_USER, pass: MAIL_PASS } : undefined,
  tls: { rejectUnauthorized: false },
});

export const createTransporter = (cfg: {
  host?: string;
  port?: number | string;
  user?: string;
  pass?: string;
}) => {
  const host = String(cfg.host || MAIL_HOST || "smtp.example.com");
  const port = Number(cfg.port ?? MAIL_PORT);
  const user = String(cfg.user || MAIL_USER || "");
  const pass = String(cfg.pass || MAIL_PASS || "");
  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: user && pass ? { user, pass } : undefined,
    tls: { rejectUnauthorized: false },
  });
};

export const sendOrderEmail = async (
  to: string,
  subject: string,
  text: string,
  html?: string,
) => {
  const from = MAIL_FROM || MAIL_USER || "no-reply@example.com";
  const mailOptions: any = {
    from: `"Bestellwesen App" <${from}>`,
    to,
    subject,
    text,
  };
  if (html) mailOptions.html = html;

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log("E-Mail gesendet: %s", info.messageId || info.response);
    return info;
  } catch (error) {
    const errAny = error as any;
    console.error(
      "Fehler beim Senden der E-Mail (erste Versuch):",
      errAny && (errAny.stack || errAny),
    );

    // If sending failed due to SendAs/SendOnBehalf rights, retry with authenticated user as from
    const msg = String(errAny && (errAny.message || errAny.response || ""));
    if (
      (MAIL_USER && msg.includes("SendAsDenied")) ||
      msg.toLowerCase().includes("not allowed to send as")
    ) {
      try {
        const fallbackFrom = MAIL_USER;
        const fallbackOptions = {
          ...mailOptions,
          from: `"Bestellwesen App" <${fallbackFrom}>`,
        };
        console.warn("SendAs denied, retrying with MAIL_USER as from");
        const info2 = await transporter.sendMail(fallbackOptions);
        console.log(
          "E-Mail gesendet (Fallback): %s",
          info2.messageId || info2.response,
        );
        return info2;
      } catch (err2) {
        const e2: any = err2;
        console.error(
          "Fehler beim Senden der E-Mail (Fallback):",
          e2 && (e2.stack || e2),
        );
        throw err2;
      }
    }

    throw errAny;
  }
};

export const testSmtpConnection = async (override?: {
  host?: string;
  port?: number | string;
  user?: string;
  pass?: string;
  from?: string;
}) => {
  // if override provided, create a temporary transporter
  if (
    override &&
    (override.host || override.port || override.user || override.pass)
  ) {
    const t = createTransporter({
      host: override.host,
      port: override.port,
      user: override.user,
      pass: override.pass,
    });
    try {
      await t.verify();
      return {
        ok: true,
        used: {
          host: override.host || MAIL_HOST,
          port: Number(override.port ?? MAIL_PORT),
          user: override.user || MAIL_USER,
          from: override.from || MAIL_FROM,
        },
      };
    } catch (err) {
      const e: any = err;
      return {
        ok: false,
        error: e && (e.message || e),
        used: {
          host: override.host || MAIL_HOST,
          port: Number(override.port ?? MAIL_PORT),
          user: override.user || MAIL_USER,
          from: override.from || MAIL_FROM,
        },
      };
    }
  }

  try {
    await transporter.verify();
    return {
      ok: true,
      used: {
        host: MAIL_HOST,
        port: MAIL_PORT,
        user: MAIL_USER,
        from: MAIL_FROM,
      },
    };
  } catch (err) {
    const e: any = err;
    return {
      ok: false,
      error: e && (e.message || e),
      used: {
        host: MAIL_HOST,
        port: MAIL_PORT,
        user: MAIL_USER,
        from: MAIL_FROM,
      },
    };
  }
};
