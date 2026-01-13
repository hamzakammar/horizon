import 'dotenv/config';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

// Import the built dist version
import('./dist/study/src/notes.js').then(async (module) => {
  // The module has the tools exported
  console.log('Available exports:', Object.keys(module));
}).catch(err => {
  console.error('Failed to import:', err);
});
