import 'dotenv/config';
import { NotesTools } from './dist/study/src/notes.js';

console.log('Testing notes_sync...\n');

const result = await NotesTools.notes_sync.handler({});
const parsed = JSON.parse(result);

console.log(JSON.stringify(parsed, null, 2));

if (parsed.details) {
  console.log('\nCourse-by-course breakdown:');
  parsed.details.forEach(d => {
    if (d.status === 'error') {
      console.log(`  ✗ ${d.course}: ERROR - ${d.error}`);
    } else if (d.status === 'skipped') {
      console.log(`  ⊘ ${d.course}: SKIPPED - ${d.reason}`);
    } else {
      console.log(`  ✓ ${d.course}: ${d.pdfs} PDFs, ${d.chunks} chunks`);
    }
  });
}
