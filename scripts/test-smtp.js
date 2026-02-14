const nodemailer = require('nodemailer');

const host = process.env.MAIL_HOST || 'smtp-mail.outlook.com';
const port = process.env.MAIL_PORT ? Number(process.env.MAIL_PORT) : 587;
const user = process.env.MAIL_USER;
const pass = process.env.MAIL_PASS;
const from = process.env.MAIL_FROM || user;
const to = process.env.MAIL_TO || user;

if (!user || !pass) {
  console.error('MAIL_USER and MAIL_PASS must be set in environment');
  process.exit(1);
}

async function sendTest() {
  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });

  const info = await transporter.sendMail({
    from,
    to,
    subject: 'Testmail Bestellwesen App',
    text: `Dies ist eine Test-E-Mail von der Bestellwesen-App. Zeit: ${new Date().toISOString()}`,
  });

  console.log('Send result:', info);
}

sendTest().catch((err) => {
  console.error('Fehler beim Senden:', err);
  process.exit(1);
});
