import 'dotenv/config';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { homedir } from 'node:os';
import { createRequire } from 'node:module';
import { supabase } from './dist/utils/supabase.js';

const notesMap = {
  "MATH119": ["/Users/hamzaammar/Documents/UW/1B/MATH119/MATH119Notes.pdf"],
  "ECE140": ["/Users/hamzaammar/Documents/UW/1B/ECE140/ECE140Notes.pdf", "/Users/hamzaammar/Documents/UW/1B/ECE140/ECE140Textbook.pdf"],
  "ECE124": ["/Users/hamzaammar/Documents/UW/1B/ECE124/ECE124Notes.pdf", "/Users/hamzaammar/Documents/UW/1B/ECE124/124Textbook.pdf"],
  "Algorithms": ["/Users/hamzaammar/Documents/algorithms.pdf"]
};

const CHUNK_SIZE = 2500;
const CHUNK_OVERLAP = 250;
const PREVIEW_LENGTH = 200;
const INSERT_BATCH_SIZE = 500;

function resolvePdfPath(entry, repoPath) {
  if (path.isAbsolute(entry)) {
    return { absolutePath: entry, relativePath: repoPath ? path.relative(repoPath, entry) : null };
  }
  const base = repoPath ? repoPath : homedir();
  const absolutePath = path.resolve(base, entry);
  const relativePath = repoPath ? path.relative(repoPath, absolutePath) : entry;
  return { absolutePath, relativePath };
}

function slugifyPdfName(name) {
  return name.toLowerCase().replace(/\s+/g, '-').replace(/\.pdf$/i, '');
}

function buildUrl(absolutePath, relativePath, webBase) {
  if (webBase && relativePath) {
    const normalizedBase = webBase.endsWith("/") ? webBase : `${webBase}/`;
    return `${normalizedBase}${relativePath.replace(/\\\\/g, "/")}`;
  }
  return absolutePath;
}

function normalizeWhitespace(text) {
  return text
    .replace(/\\u([0-9a-fA-F]{4})/g, '')
    .replace(/[\x00-\x1F\x7F-\x9F]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

async function parsePdfText(filePath) {
  const buffer = await fs.readFile(filePath);
  const require = createRequire(import.meta.url);
  const pdfParse = require("pdf-parse");
  const data = await pdfParse(buffer);
  const text = data?.text || '';
  console.log(`[PDF] Extracted ${text.length} characters from ${path.basename(filePath)}`);
  if (!text) {
    console.log(`[PDF] Warning: No text extracted from ${filePath}`);
  }
  return normalizeWhitespace(text);
}

function chunkText(text) {
  const chunks = [];
  for (let i = 0; i < text.length; i += CHUNK_SIZE - CHUNK_OVERLAP) {
    chunks.push(text.slice(i, i + CHUNK_SIZE));
  }
  return chunks;
}

async function testSync() {
  const repoPath = process.env.NOTES_REPO_PATH ? path.resolve(process.env.NOTES_REPO_PATH) : undefined;
  
  console.log('Starting notes_sync simulation...\n');
  
  let totalCourses = 0;
  let totalPdfs = 0;
  let totalChunks = 0;
  const courseResults = [];

  for (const [course, pdfEntries] of Object.entries(notesMap)) {
    console.log(`\nProcessing ${course}...`);
    
    if (!pdfEntries || pdfEntries.length === 0) {
      courseResults.push({ course, pdfs: 0, chunks: 0, status: "skipped", reason: "No PDFs listed" });
      console.log(`  Skipped: No PDFs listed`);
      continue;
    }

    totalCourses += 1;
    let processedPdfCount = 0;
    let courseChunkCount = 0;
    const rows = [];

    for (const entry of pdfEntries) {
      try {
        const { absolutePath, relativePath } = resolvePdfPath(entry, repoPath);
        
        // Check if file exists before attempting to parse
        if (!fsSync.existsSync(absolutePath)) {
          courseResults.push({
            course,
            pdf: entry,
            status: "error",
            error: `File not found: ${absolutePath}`,
          });
          console.log(`  ✗ ${path.basename(entry)}: File not found`);
          continue;
        }
        
        const pdfName = path.basename(absolutePath);
        const pdfSlug = slugifyPdfName(pdfName);
        const url = buildUrl(absolutePath, relativePath, undefined);
        const text = await parsePdfText(absolutePath);
        const chunks = chunkText(text);

        chunks.forEach((chunk, idx) => {
          rows.push({
            course_id: course,
            title: `${pdfName} — Chunk ${idx + 1}`,
            anchor: `${pdfSlug}-chunk-${idx + 1}`,
            url,
            preview: chunk.slice(0, PREVIEW_LENGTH),
            content: chunk,
          });
        });

        processedPdfCount += 1;
        courseChunkCount += chunks.length;
        console.log(`  ✓ ${pdfName}: ${chunks.length} chunks`);
      } catch (error) {
        courseResults.push({
          course,
          pdf: entry,
          status: "error",
          error: error instanceof Error ? error.message : String(error),
        });
        console.log(`  ✗ ${entry}: ${error.message}`);
      }
    }

    if (rows.length > 0) {
      console.log(`  Upserting ${rows.length} rows...`);
      
      // Simulate the upsert
      let upserted = 0;
      for (let i = 0; i < rows.length; i += INSERT_BATCH_SIZE) {
        const batch = rows.slice(i, i + INSERT_BATCH_SIZE);
        console.log(`    Batch ${Math.floor(i / INSERT_BATCH_SIZE) + 1}: ${batch.length} rows`);
        upserted += batch.length;
      }
      
      totalPdfs += processedPdfCount;
      totalChunks += courseChunkCount;
      courseResults.push({ course, pdfs: processedPdfCount, chunks: courseChunkCount, status: "synced" });
      console.log(`  ✓ Synced: ${processedPdfCount} PDFs, ${courseChunkCount} chunks`);
    } else {
      courseResults.push({ course, pdfs: processedPdfCount, chunks: courseChunkCount, status: "skipped", reason: "No rows generated" });
      console.log(`  Skipped: No rows generated`);
    }
  }

  console.log('\n--- SYNC SUMMARY ---');
  console.log(`Total courses processed: ${totalCourses}`);
  console.log(`Total PDFs: ${totalPdfs}`);
  console.log(`Total chunks: ${totalChunks}`);
  console.log('\nDetails:');
  console.log(JSON.stringify(courseResults, null, 2));
}

testSync().catch(console.error);
