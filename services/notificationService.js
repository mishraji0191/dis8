const nodemailer = require("nodemailer");

function getTransporter() {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    return null;
  }

  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === "true",
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

async function sendEmail({ to, subject, text }) {
  const transporter = getTransporter();

  if (!transporter) {
    if (process.env.NODE_ENV !== "production") {
      console.log(`[mail:dev] To: ${to}\nSubject: ${subject}\n${text}`);
    }

    return false;
  }

  await transporter.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to,
    subject,
    text,
  });

  return true;
}

async function sendOtpEmail({ user, otp, purpose }) {
  const subject =
    purpose === "two_factor" ? "Your DIS8 two-factor code" : "Verify your DIS8 account";

  return sendEmail({
    to: user.email,
    subject,
    text: `Your DIS8 verification code is ${otp}. It expires in 10 minutes.`,
  });
}

async function sendPasswordResetEmail({ user, resetToken }) {
  const resetBaseUrl = process.env.PASSWORD_RESET_URL || "http://localhost:5173/reset-password";
  const separator = resetBaseUrl.includes("?") ? "&" : "?";
  const resetUrl = `${resetBaseUrl}${separator}token=${resetToken}`;

  return sendEmail({
    to: user.email,
    subject: "Reset your DIS8 password",
    text: `Use this secure link to reset your DIS8 password: ${resetUrl}\nThis link expires in 30 minutes.`,
  });
}

module.exports = {
  sendOtpEmail,
  sendPasswordResetEmail,
};
