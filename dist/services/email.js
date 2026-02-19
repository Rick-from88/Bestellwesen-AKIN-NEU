"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.testSmtpConnection = exports.sendOrderEmail = exports.createTransporter = void 0;
const nodemailer_1 = __importDefault(require("nodemailer"));
const MAIL_HOST = process.env.MAIL_HOST || process.env.SMTP_HOST || "";
const MAIL_PORT = Number(process.env.MAIL_PORT || process.env.SMTP_PORT || 587);
const MAIL_USER = process.env.MAIL_USER || process.env.SMTP_USER || "";
const MAIL_PASS = process.env.MAIL_PASS || process.env.SMTP_PASS || "";
const MAIL_FROM = process.env.MAIL_FROM || MAIL_USER || "";
const transporter = nodemailer_1.default.createTransport({
    host: MAIL_HOST || "smtp.example.com",
    port: MAIL_PORT,
    secure: MAIL_PORT === 465,
    auth: MAIL_USER && MAIL_PASS ? { user: MAIL_USER, pass: MAIL_PASS } : undefined,
    tls: { rejectUnauthorized: false },
});
const createTransporter = (cfg) => {
    var _a;
    const host = String(cfg.host || MAIL_HOST || "smtp.example.com");
    const port = Number((_a = cfg.port) !== null && _a !== void 0 ? _a : MAIL_PORT);
    const user = String(cfg.user || MAIL_USER || "");
    const pass = String(cfg.pass || MAIL_PASS || "");
    return nodemailer_1.default.createTransport({
        host,
        port,
        secure: port === 465,
        auth: user && pass ? { user, pass } : undefined,
        tls: { rejectUnauthorized: false },
    });
};
exports.createTransporter = createTransporter;
const sendOrderEmail = (to, subject, text, html) => __awaiter(void 0, void 0, void 0, function* () {
    const from = MAIL_FROM || MAIL_USER || "no-reply@example.com";
    const mailOptions = {
        from: `"Bestellwesen App" <${from}>`,
        to,
        subject,
        text,
    };
    if (html)
        mailOptions.html = html;
    try {
        const info = yield transporter.sendMail(mailOptions);
        console.log("E-Mail gesendet: %s", info.messageId || info.response);
        return info;
    }
    catch (error) {
        const errAny = error;
        console.error("Fehler beim Senden der E-Mail (erste Versuch):", errAny && (errAny.stack || errAny));
        // If sending failed due to SendAs/SendOnBehalf rights, retry with authenticated user as from
        const msg = String(errAny && (errAny.message || errAny.response || ""));
        if ((MAIL_USER && msg.includes("SendAsDenied")) ||
            msg.toLowerCase().includes("not allowed to send as")) {
            try {
                const fallbackFrom = MAIL_USER;
                const fallbackOptions = Object.assign(Object.assign({}, mailOptions), { from: `"Bestellwesen App" <${fallbackFrom}>` });
                console.warn("SendAs denied, retrying with MAIL_USER as from");
                const info2 = yield transporter.sendMail(fallbackOptions);
                console.log("E-Mail gesendet (Fallback): %s", info2.messageId || info2.response);
                return info2;
            }
            catch (err2) {
                const e2 = err2;
                console.error("Fehler beim Senden der E-Mail (Fallback):", e2 && (e2.stack || e2));
                throw err2;
            }
        }
        throw errAny;
    }
});
exports.sendOrderEmail = sendOrderEmail;
const testSmtpConnection = (override) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    // if override provided, create a temporary transporter
    if (override &&
        (override.host || override.port || override.user || override.pass)) {
        const t = (0, exports.createTransporter)({
            host: override.host,
            port: override.port,
            user: override.user,
            pass: override.pass,
        });
        try {
            yield t.verify();
            return {
                ok: true,
                used: {
                    host: override.host || MAIL_HOST,
                    port: Number((_a = override.port) !== null && _a !== void 0 ? _a : MAIL_PORT),
                    user: override.user || MAIL_USER,
                    from: override.from || MAIL_FROM,
                },
            };
        }
        catch (err) {
            const e = err;
            return {
                ok: false,
                error: e && (e.message || e),
                used: {
                    host: override.host || MAIL_HOST,
                    port: Number((_b = override.port) !== null && _b !== void 0 ? _b : MAIL_PORT),
                    user: override.user || MAIL_USER,
                    from: override.from || MAIL_FROM,
                },
            };
        }
    }
    try {
        yield transporter.verify();
        return {
            ok: true,
            used: {
                host: MAIL_HOST,
                port: MAIL_PORT,
                user: MAIL_USER,
                from: MAIL_FROM,
            },
        };
    }
    catch (err) {
        const e = err;
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
});
exports.testSmtpConnection = testSmtpConnection;
