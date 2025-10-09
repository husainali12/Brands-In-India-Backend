const sgMail = require("@sendgrid/mail");
sgMail.setApiKey(process.env.SENDGRID_API_KEY);
const sendEmail = async ({ to, subject, html, text, from }) => {
  const msg = {
    to,
    from: from || process.env.SENDGRID_FROM_EMAIL,
    subject,
    text: text || " ",
    html,
  };

  try {
    await sgMail.send(msg);
    console.log(`✅ Email sent to ${to}`);
    return true;
  } catch (error) {
    console.error("❌ SendGrid error:", error);
    if (error.response) {
      console.error(error.response.body);
    }
    throw new Error("Failed to send email");
  }
};

module.exports = sendEmail;
