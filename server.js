const express = require("express");
const multer = require("multer");
const libre = require("libreoffice-convert");
const ExcelJS = require('exceljs');
const fs = require("fs");
const path = require("path");
const { PDFDocument } = require("pdf-lib");

const bodyParser = require('body-parser');

const app = express();
const upload = multer({ dest: "/tmp" }); // Use /tmp for serverless compatibility

app.use(bodyParser.json()); // Parse JSON bodies

// Serve index.html from root URL
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// Convert Word to PDF on POST request
app.post("/convert", upload.single("file"), (req, res) => {
  const filePath = req.file.path;
  const outputPath = path.join("/tmp", `${req.file.filename}.pdf`);

  fs.readFile(filePath, (err, data) => {
    if (err) return res.status(500).send("File reading error: " + err.message);

    libre.convert(data, ".pdf", undefined, (err, done) => {
      if (err) return res.status(500).send("Conversion error: " + err.message);

      fs.writeFile(outputPath, done, (err) => {
        if (err) return res.status(500).send("File saving error: " + err.message);

        res.download(outputPath, "converted.pdf", (err) => {
          if (err) res.status(500).send("File download error: " + err.message);
          fs.unlink(filePath, () => {}); // Cleanup original file
          fs.unlink(outputPath, () => {}); // Cleanup converted file
        });
      });
    });
  });
});

// Merge Excel files on POST request
app.post("/merge-excel", upload.array("files"), async (req, res) => {
  try {
    const workbooks = await Promise.all(
      req.files.map(async (file) => {
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.readFile(file.path);
        return workbook;
      })
    );

    const mergedWorkbook = new ExcelJS.Workbook();
    const mergedSheet = mergedWorkbook.addWorksheet("Merged Data");

    workbooks.forEach((workbook) => {
      workbook.eachSheet((sheet) => {
        sheet.eachRow((row, rowIndex) => {
          mergedSheet.addRow(row.values);
        });
      });
    });

    const outputPath = path.join("/tmp", "merged.xlsx");
    await mergedWorkbook.xlsx.writeFile(outputPath);

    res.download(outputPath, "merged.xlsx", () => {
      req.files.forEach((file) => fs.unlinkSync(file.path));
      fs.unlinkSync(outputPath);
    });
  } catch (error) {
    res.status(500).send("Error merging files: " + error.message);
  }
});

// Merge PDF files on POST request
app.post("/merge-pdf", upload.array("pdfs", 50), async (req, res) => {
  try {
    // Initialize PDFDocument to hold the merged PDFs
    const mergedPdf = await PDFDocument.create();

    // Loop through each uploaded PDF
    for (const file of req.files) {
      const pdfBytes = fs.readFileSync(file.path);
      const pdfDoc = await PDFDocument.load(pdfBytes);
      const pages = await mergedPdf.copyPages(pdfDoc, pdfDoc.getPageIndices());
      pages.forEach(page => mergedPdf.addPage(page));
    }

    // Write the merged PDF to a new file
    const outputPath = path.join("/tmp", "merged.pdf");
    const mergedPdfBytes = await mergedPdf.save();
    fs.writeFileSync(outputPath, mergedPdfBytes);

    // Send the merged PDF to the user for download
    res.download(outputPath, "merged.pdf", () => {
      req.files.forEach((file) => fs.unlinkSync(file.path));
      fs.unlinkSync(outputPath);
    });
  } catch (error) {
    res.status(500).send("Error merging PDFs: " + error.message);
  }
});

// Listen on the port defined by the environment variable (for Cloud Run)
const port = process.env.PORT || 8080;
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

module.exports = app;
