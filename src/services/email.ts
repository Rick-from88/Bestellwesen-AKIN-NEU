import nodemailer from 'nodemailer';

const MAIL_HOST = process.env.MAIL_HOST || process.env.SMTP_HOST || '';
const MAIL_PORT = Number(process.env.MAIL_PORT || process.env.SMTP_PORT || 587);
const MAIL_USER = process.env.MAIL_USER || process.env.SMTP_USER || '';
const MAIL_PASS = process.env.MAIL_PASS || process.env.SMTP_PASS || '';
const MAIL_FROM = process.env.MAIL_FROM || MAIL_USER || '';

const transporter = nodemailer.createTransport({
    host: MAIL_HOST || 'smtp.example.com',
    port: MAIL_PORT,
    secure: MAIL_PORT === 465,
    auth: MAIL_USER && MAIL_PASS ? { user: MAIL_USER, pass: MAIL_PASS } : undefined,
    tls: { rejectUnauthorized: false },
});

export const sendOrderEmail = async (to: string, subject: string, text: string, html?: string) => {
    const from = MAIL_FROM || MAIL_USER || 'no-reply@example.com';
    const mailOptions: any = {
        from: `"Bestellwesen App" <${from}>`,
        to,
        subject,
        text,
    };
    if (html) mailOptions.html = html;

    try {
        const info = await transporter.sendMail(mailOptions);
        console.log('E-Mail gesendet: %s', info.messageId || info.response);
        return info;
    } catch (error) {
        console.error('Fehler beim Senden der E-Mail:', error && (error.stack || error));
        throw error;
    }
};