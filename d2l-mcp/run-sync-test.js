import 'dotenv/config';

const { supabase } = await import('./dist/utils/supabase.js');
const notesModule = await import('./dist/study/src/notes.js');

// Get the notes_sync tool
const notesSyncTool = Object.values(notesModule).find(
  item => typeof item === 'object' && item?.notes_sync
);

if (!notesSyncTool) {
  console.error('Could not find notes_sync tool');
  process.exit(1);
}

console.log('Found notes_sync tool, executing...\n');

const result = await notesSyncTool.notes_sync.handler({});
console.log(result);
