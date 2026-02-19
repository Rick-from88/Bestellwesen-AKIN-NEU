import { sendOrderEmail } from "../src/services/email";

async function main() {
  const to =
    process.env.MAIL_TO ||
    process.env.MAIL_USER ||
    "patrick@akin-pulverbeschichtungen.de";
  const subject = "Test-E-Mail vom Bestellwesen";
  const text = "Dies ist eine Test-E-Mail (Text).";
  const html = "<p>Dies ist eine <strong>Test-E-Mail</strong> (HTML).</p>";

  try {
    const info = await sendOrderEmail(to, subject, text, html);
    console.log(
      "sendOrderEmail result:",
      info && (info.messageId || info.response),
    );
    process.exit(0);
  } catch (err) {
    const e: any = err;
    console.error("sendOrderEmail failed:", e && (e.message || e));
    process.exit(2);
  }
}

main();
