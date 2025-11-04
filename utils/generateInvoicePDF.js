const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");

/**
 * Generates a professional PDF invoice for a brand purchase.
 * @param {Object} block - BrandBlock document.
 * @param {Object} user - User document (name, email, etc.).
 * @returns {Promise<string>} Path to the generated invoice file.
 */
const generateInvoicePDF = async (block, user) => {
  try {
    const invoicesDir = path.join(process.cwd(), "invoices");
    if (!fs.existsSync(invoicesDir)) fs.mkdirSync(invoicesDir);

    const invoicePath = path.join(
      invoicesDir,
      `invoice_${block._id}_${Date.now()}.pdf`
    );

    const doc = new PDFDocument({ margin: 50 });
    const stream = fs.createWriteStream(invoicePath);
    doc.pipe(stream);

    // HEADER
    doc.fontSize(22).text("Brands In India", { align: "center" });
    doc.moveDown(0.3);
    doc.fontSize(14).text("Official Invoice", { align: "center" });
    doc.moveDown(1);

    // CUSTOMER DETAILS
    doc.fontSize(12).text(`Invoice ID: INV-${Date.now()}`);
    doc.text(`Date: ${new Date().toLocaleString()}`);
    doc.moveDown();
    doc.text(`Customer: ${user.name || "Not provided"}`);
    doc.text(`Email: ${user.email || "Not provided"}`);
    doc.text(`Phone: ${user.phone || "Not provided"}`);
    doc.moveDown();

    // PURCHASE DETAILS
    doc.fontSize(14).text("Purchase Details", { underline: true });
    doc.moveDown(0.5);

    const details = [
      ["Brand Name", block.brandName],
      ["Tiles Purchased", block.totalBlocks],
      ["Setup Fee", `${(block.initialAmount || 0).toFixed(2)}/-`],
      ["Monthly Charge", `${(block.recurringAmount || 0).toFixed(2)}/-`],
      ["Plan Type", block.subsscriptionPlantType || "Monthly"],
      ["Payment Status", block.paymentStatus],
      ["Subscription ID", block.subscriptionId],
      ["Start Date", block.startAt?.toLocaleString() || "Not provided"],
      ["End Date", block.endAt?.toLocaleString() || "Not provided"],
      //   ["Next Billing Date", block.nextPaymentDate?.toLocaleString() || "N/A"],
      ["Total Amount Paid", `${(block.totalAmount || 0).toFixed(2)}/-`],
    ];

    details.forEach(([label, value]) => {
      doc
        .font("Helvetica")
        .fontSize(12)
        .text(`${label}: `, { continued: true });
      doc.font("Helvetica-Bold").text(value);
    });

    doc.moveDown(1);
    doc
      .font("Helvetica-Oblique")
      .fontSize(11)
      .text("Thank you for your business!", { align: "center" });
    doc.text("Brands In India", { align: "center" });

    doc.end();

    await new Promise((resolve) => stream.on("finish", resolve));

    return invoicePath;
  } catch (err) {
    console.error("Error generating invoice PDF:", err);
    throw new Error("Failed to generate invoice PDF");
  }
};

module.exports = { generateInvoicePDF };
