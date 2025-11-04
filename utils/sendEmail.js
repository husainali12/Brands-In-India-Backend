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
const sgMail = require("@sendgrid/mail");
const fs = require("fs");
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

const sendEmail = async ({
  to,
  subject,
  html,
  text,
  from,
  attachments = [],
}) => {
  const msg = {
    to,
    from: from || process.env.SENDGRID_FROM_EMAIL,
    subject,
    text: text || " ",
    html,
  };

  // Handle attachments if provided
  if (attachments.length > 0) {
    msg.attachments = attachments.map((a) => ({
      content: fs.readFileSync(a.path).toString("base64"),
      filename: a.filename,
      type: a.type || "application/pdf",
      disposition: "attachment",
    }));
  }

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
