// const sgMail = require("@sendgrid/mail");
// sgMail.setApiKey(process.env.SENDGRID_API_KEY);
// // emailer
// const sendEmail = async ({ to, subject, html, text, from }) => {
//   const msg = {
//     to,
//     from: from || process.env.SENDGRID_FROM_EMAIL,
//     subject,
//     text: text || " ",
//     html,
//   };

//   try {
//     await sgMail.send(msg);
//     console.log(`✅ Email sent to ${to}`);
//     return true;
//   } catch (error) {
//     console.error("❌ SendGrid error:", error);
//     if (error.response) {
//       console.error(error.response.body);
//     }
//     throw new Error("Failed to send email");
//   }
// };

// module.exports = sendEmail;
const { Resend } = require("resend");
const fs = require("fs");

const resend = new Resend(process.env.RESEND_API_KEY);

const sendEmail = async ({
  to,
  subject,
  html,
  text,
  from,
  attachments = [],
}) => {
  const fromEmail =
    from || process.env.RESEND_FROM_EMAIL || process.env.SENDGRID_FROM_EMAIL;

  const emailPayload = {
    from: fromEmail,
    to,
    subject,
    html,
    text: text || " ",
  };

  // Handle attachments if provided
  if (attachments.length > 0) {
    emailPayload.attachments = attachments.map((a) => ({
      filename: a.filename,
      content: fs.readFileSync(a.path).toString("base64"),
      contentType: a.type || "application/pdf",
    }));
  }

  try {
    await resend.emails.send(emailPayload);
    console.log(`✅ Email sent to ${to}`);
    return true;
  } catch (error) {
    console.error("❌ Resend error:", error);
    if (error?.response) {
      console.error(error.response);
    } else if (error?.message) {
      console.error(error.message);
    }
    throw new Error("Failed to send email");
  }
};

module.exports = sendEmail;
