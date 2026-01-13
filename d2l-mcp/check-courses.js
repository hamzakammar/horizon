import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const client = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Check each course individually
const courses = ['MATH119', 'ECE140', 'ECE124', 'Algorithms'];

for (const course of courses) {
  const { data, count } = await client
    .from('note_sections')
    .select('id', { count: 'exact' })
    .eq('course_id', course);
  
  console.log(`${course}: ${count} rows`);
}
