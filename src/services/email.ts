import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
    host: 'smtp.example.com', // SMTP-Server
    port: 587, // Port
    secure: false, // true für 465, false für andere Ports
    auth: {
        user: 'your-email@example.com', // E-Mail-Adresse
        pass: 'your-email-password', // Passwort
    },
});

export const sendOrderEmail = async (to: string, subject: string, text: string) => {
    const mailOptions = {
        from: '"Bestellwesen App" <your-email@example.com>', // Absenderadresse
        to, // Empfängeradresse
        subject, // Betreff
        text, // Textinhalt
    };

    try {
        const info = await transporter.sendMail(mailOptions);
        console.log('E-Mail gesendet: %s', info.messageId);
    } catch (error) {
        console.error('Fehler beim Senden der E-Mail:', error);
    }
};