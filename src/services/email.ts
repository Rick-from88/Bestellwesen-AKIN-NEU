import nodemailer from "nodemailer";
import fs from "fs";
import path from "path";

const MAIL_HOST = process.env.MAIL_HOST || "smtp-mail.outlook.com";
const MAIL_PORT = process.env.MAIL_PORT ? Number(process.env.MAIL_PORT) : 587;
const MAIL_USER = process.env.MAIL_USER || process.env.MAIL_FROM || undefined;
const MAIL_PASS = process.env.MAIL_PASS || undefined;
const MAIL_FROM = process.env.MAIL_FROM || MAIL_USER || "no-reply@example.com";

let transporter: nodemailer.Transporter | null = null;
if (MAIL_USER && MAIL_PASS) {
    transporter = nodemailer.createTransport({
        host: MAIL_HOST,
        port: MAIL_PORT,
        secure: MAIL_PORT === 465, // true for 465, false for other ports
        auth: {
            user: MAIL_USER,
            pass: MAIL_PASS,
        },
    });
} else {
    console.warn(
        "Mail credentials not configured (MAIL_USER / MAIL_PASS). Falling back to log-only mode.",
    );
}

export const sendOrderEmail = async (
    to: string,
    subject: string,
    text: string,
    attachments?: { filename: string; path: string }[],
) => {
    const mailOptions: any = {
        from: MAIL_FROM,
        to,
        subject,
        text,
    };
    if (attachments && attachments.length) {
        mailOptions.attachments = attachments;
    }

    if (!transporter) {
        console.log("[mail-log] To:", to);
        console.log("[mail-log] Subject:", subject);
        console.log("[mail-log] Text:", text);
        if (attachments && attachments.length) {
            attachments.forEach((a) =>
                console.log(`[mail-log] Attachment: ${a.filename} -> ${a.path}`),
            );
        }
        return { accepted: [], rejected: [], info: "log-only" };
    }

    try {
        const info = await transporter.sendMail(mailOptions);
        console.log("E-Mail gesendet: %s", info.messageId);
        return info;
    } catch (error) {
        console.error("Fehler beim Senden der E-Mail:", error);
        throw error;
    }
};

export const ensureTmpDir = () => {
    const tmpDir = path.join(process.cwd(), "public", "tmp");
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
    return tmpDir;
};