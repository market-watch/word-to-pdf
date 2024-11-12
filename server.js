const express = require("express");
const multer = require("multer");
const libre = require("libreoffice-convert");
const ExcelJS = require("exceljs");
const fs = require("fs");
const path = require("path");
const { PDFDocument } = require("pdf-lib");
const bodyParser = require("body-parser");

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

// Convert images to PDF on POST request
app.post("/images-to-pdf", upload.array("images", 100), async (req, res) => {
  try {
    const pdfDoc = await PDFDocument.create();

    for (const file of req.files) {
      const imageBytes = fs.readFileSync(file.path);
      let img;

      // Embed the image based on its MIME type
      if (file.mimetype === "image/jpeg") {
        img = await pdfDoc.embedJpg(imageBytes);
      } else if (file.mimetype === "image/png") {
        img = await pdfDoc.embedPng(imageBytes);
      } else {
        console.error(`Unsupported file format: ${file.originalname}`);
        continue;
      }

      const { width, height } = img;
      const page = pdfDoc.addPage([width, height]);
      page.drawImage(img, {
        x: 0,
        y: 0,
        width: width,
        height: height,
      });
    }

    const pdfBytes = await pdfDoc.save();
    const outputPath = path.join("/tmp", "images.pdf");
    fs.writeFileSync(outputPath, pdfBytes);

    res.download(outputPath, "images.pdf", () => {
      req.files.forEach((file) => fs.unlinkSync(file.path)); // Cleanup uploaded images
      fs.unlinkSync(outputPath); // Cleanup PDF
    });
  } catch (error) {
    res.status(500).send("Error converting images to PDF: " + error.message);
  }
});

// Listen on the port defined by the environment variable (for Cloud Run)
const port = process.env.PORT || 8080;
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

module.exports = app;
