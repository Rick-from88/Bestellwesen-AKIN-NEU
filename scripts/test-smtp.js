const nodemailer = require("nodemailer");

async function main() {
  const host = process.env.MAIL_HOST;
  const port = Number(process.env.MAIL_PORT || 587);
  const user = process.env.MAIL_USER;
  const pass = process.env.MAIL_PASS;
  const from = process.env.MAIL_FROM || user;
  const to = process.env.MAIL_TO || user;

  if (!host || !user || !pass) {
    console.error("Missing MAIL_HOST / MAIL_USER / MAIL_PASS");
    process.exit(2);
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465, // true for 465, false for other ports
    auth: { user, pass },
    tls: { rejectUnauthorized: false },
  });

  try {
    await transporter.verify();
    console.log("SMTP: connection ok");

    const info = await transporter.sendMail({
      from,
      to,
      subject: "Test-Mail vom Bestellwesen",
      text: "Dies ist eine Testmail.",
    });
    console.log("Message sent:", info.messageId || info.response);
    process.exit(0);
  } catch (err) {
    console.error("SMTP error:", err && err.message ? err.message : err);
    process.exit(3);
  }
}

main();
