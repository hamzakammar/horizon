import 'dotenv/config';
import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import path from 'node:path';

const notesMap = {
  "MATH119": ["/Users/hamzaammar/Documents/UW/1B/MATH119/MATH119Notes.pdf"],
  "ECE140": ["/Users/hamzaammar/Documents/UW/1B/ECE140/ECE140Notes.pdf"],
  "ECE124": ["/Users/hamzaammar/Documents/UW/1B/ECE124/ECE124Notes.pdf"],
  "Algorithms": ["/Users/hamzaammar/Documents/algorithms.pdf"]
};

async function testPdfParsing() {
  const require = createRequire(import.meta.url);
  const pdfParse = require("pdf-parse");

  for (const [course, entries] of Object.entries(notesMap)) {
    console.log(`\n${course}:`);
    for (const pdfPath of entries) {
      try {
        console.log(`  Testing ${path.basename(pdfPath)}...`);
        const buffer = await fs.readFile(pdfPath);
        const data = await pdfParse(buffer);
        const text = data?.text || '';
        console.log(`    ✓ Extracted ${text.length} characters`);
        if (!text) {
          console.log(`    ⚠ WARNING: No text extracted!`);
        }
      } catch (error) {
        console.log(`    ✗ ERROR: ${error.message}`);
      }
    }
  }
}

testPdfParsing();
