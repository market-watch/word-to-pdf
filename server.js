const express = require("express");
const multer = require("multer");
const libre = require("libreoffice-convert");
const XLSX = require("xlsx");
const fs = require("fs");
const path = require("path");

const app = express();
const upload = multer({ dest: "/tmp" }); // Use /tmp for serverless compatibility

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

// Listen on the port defined by the environment variable (for Cloud Run)
const port = process.env.PORT || 8080;
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

// Excel files merging route
app.post("/merge-excel", upload.array("files"), (req, res) => {
  try {
    const workbooks = req.files.map((file) => {
      const filePath = file.path;
      const workbook = XLSX.readFile(filePath);
      fs.unlinkSync(filePath); // Clean up each uploaded file after reading
      return workbook;
    });

    // Create a new workbook for the merged content
    const mergedWorkbook = XLSX.utils.book_new();

    // Append each file's sheets into the merged workbook
    workbooks.forEach((workbook, index) => {
      workbook.SheetNames.forEach((sheetName) => {
        const sheetData = workbook.Sheets[sheetName];
        XLSX.utils.book_append_sheet(mergedWorkbook, sheetData, `${sheetName}_${index + 1}`);
      });
    });

    // Save merged workbook to a temporary file
    const outputPath = path.join("/tmp", "merged.xlsx");
    XLSX.writeFile(mergedWorkbook, outputPath);

    // Send the merged file to the client
    res.download(outputPath, "merged.xlsx", (err) => {
      if (err) res.status(500).send("File download error: " + err.message);
      fs.unlinkSync(outputPath); // Clean up the merged file
    });
  } catch (err) {
    console.error("Error merging files:", err);
    res.status(500).send("Error merging Excel files");
  }
});

module.exports = app;
