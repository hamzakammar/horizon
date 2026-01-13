import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { OpenAI } from 'openai';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { homedir } from 'node:os';

const notesMap = {
  "MATH119": ["/Users/hamzaammar/Documents/UW/1B/MATH119/MATH119Notes.pdf"],
  "ECE140": ["/Users/hamzaammar/Documents/UW/1B/ECE140/ECE140Notes.pdf", "/Users/hamzaammar/Documents/UW/1B/ECE140/ECE140Textbook.pdf"],
  "ECE124": ["/Users/hamzaammar/Documents/UW/1B/ECE124/ECE124Notes.pdf", "/Users/hamzaammar/Documents/UW/1B/ECE124/124Textbook.pdf"],
  "Algorithms": ["/Users/hamzaammar/Documents/algorithms.pdf"]
};

function resolvePdfPath(entry, repoPath) {
  if (path.isAbsolute(entry)) {
    return { absolutePath: entry, relativePath: repoPath ? path.relative(repoPath, entry) : null };
  }
  const base = repoPath ? repoPath : homedir();
  const absolutePath = path.resolve(base, entry);
  const relativePath = repoPath ? path.relative(repoPath, absolutePath) : entry;
  return { absolutePath, relativePath };
}

async function test() {
  const repoPath = process.env.NOTES_REPO_PATH ? path.resolve(process.env.NOTES_REPO_PATH) : undefined;
  
  console.log('Testing PDF resolution and file existence:');
  console.log('REPO_PATH:', repoPath);
  console.log('');

  for (const [course, entries] of Object.entries(notesMap)) {
    console.log(`\n${course}:`);
    for (const entry of entries) {
      const { absolutePath } = resolvePdfPath(entry, repoPath);
      const exists = fsSync.existsSync(absolutePath);
      console.log(`  ${entry}`);
      console.log(`    -> ${absolutePath}`);
      console.log(`    -> EXISTS: ${exists}`);
    }
  }
}

test();
