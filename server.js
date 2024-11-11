const express = require("express");
const multer = require("multer");
const libre = require("libreoffice-convert");
const ExcelJS = require('exceljs');
const fs = require("fs");
const path = require("path");
const { HfInference } = require('@huggingface/inference');
const bodyParser = require('body-parser');

const app = express();
const upload = multer({ dest: "/tmp" }); // Use /tmp for serverless compatibility
// const hf = new HfInference(process.env.HUGGING_FACE_API_KEY); // Ensure API key is set as an environment variable
const hf = "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"
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

// Text summarization on POST request
app.post("/summarize", async (req, res) => {
  const { text } = req.body;
  
  if (!text) {
    return res.status(400).send("No text provided for summarization.");
  }

  try {
    const response = await hf.request({
      model: 'Falconsai/text_summarization',  // Replace with your Hugging Face model name if different
      inputs: text,
    });

    res.json({ summary: response[0].summary_text });  // Extract summary text from response
  } catch (error) {
    res.status(500).send("Error in summarization: " + error.message);
  }
});

// Listen on the port defined by the environment variable (for Cloud Run)
const port = process.env.PORT || 8080;
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

module.exports = app;
