const express = require("express");
const multer = require("multer");
const libre = require("libreoffice-convert");
const ExcelJS = require('exceljs');
const fs = require("fs");
const path = require("path");
const axios = require('axios');
require('dotenv').config();

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

// GSTIN Processing - Upload Excel and Fetch Data
const API_BASE_URL = "https://apisetu.gov.in/gstn/v2/taxpayers/";
const CLIENT_ID = process.env.CLIENT_ID;
const API_KEYS = process.env.API_KEYS.split(',');

function getRandomApiKey() {
  return API_KEYS[Math.floor(Math.random() * API_KEYS.length)];
}

app.post("/api/gst/upload", upload.single("file"), async (req, res) => {
  try {
    const gstinList = await readGstinFromExcel(req.file.path);
    const results = await Promise.all(gstinList.map(fetchAndProcessData));

    // Cleanup uploaded file
    fs.unlinkSync(req.file.path);

    res.json(results);
  } catch (error) {
    console.error("Error processing GSTIN data:", error);
    res.status(500).json({ error: "Failed to process GSTIN data." });
  }
});

async function readGstinFromExcel(filePath) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const worksheet = workbook.getWorksheet(1);

  const gstinList = [];
  worksheet.eachRow((row, rowIndex) => {
    const gstin = row.getCell(1).value;
    if (gstin) gstinList.push(gstin);
  });
  return gstinList;
}

async function fetchAndProcessData(gstin) {
  const url = `${API_BASE_URL}${gstin}`;
  const headers = {
    "X-APISETU-CLIENTID": CLIENT_ID,
    "X-APISETU-APIKEY": getRandomApiKey()
  };

  try {
    const response = await axios.get(url, { headers });
    const data = response.data;
    if (!data) return { gstin, error: "No data found" };

    return { gstin, ...processData(data) };
  } catch (error) {
    console.error(`Error fetching data for GSTIN ${gstin}:`, error);
    return { gstin, error: "Failed to fetch data" };
  }
}

function processData(data) {
  let df1 = data.principalPlaceOfBusinessFields.principalPlaceOfBusinessAddress || {};
  df1['Count of Additional Place of Business'] = data.additionalPlaceOfBusinessFields ? data.additionalPlaceOfBusinessFields.length : 0;

  let nbaList = (data.natureOfBusinessActivity || []).join(', ');
  df1['Nature of Business Activity'] = nbaList;
  df1['Nature of Principal Place of Business'] = data.principalPlaceOfBusinessFields.natureOfPrincipalPlaceOfBusiness || '';

  const addressFields = ['floorNumber', 'buildingNumber', 'buildingName', 'streetName', 'location', 'districtName', 'landMark', 'stateName', 'pincode'];
  df1['Address'] = addressFields
    .map(field => df1[field] || "")
    .join(", ")
    .replace(/\s+/g, " ")
    .replace(/, ,/g, ", ")
    .replace(/^,|,$/g, '');

  return { ...data, ...df1 };
}

// Excel Merge Endpoint
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

// Listen on the port defined by the environment variable (for Cloud Run)
const port = process.env.PORT || 8080;
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

module.exports = app;
