import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const client = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const { data, count } = await client
  .from('note_sections')
  .select('course_id', { count: 'exact' });

const courseMap = {};
(data || []).forEach(row => {
  courseMap[row.course_id] = (courseMap[row.course_id] || 0) + 1;
});

console.log('Total rows (count):', count);
console.log('Total rows (actual):', data.length);
console.log('\nCourses:');
Object.entries(courseMap).sort().forEach(([course, cnt]) => {
  console.log(`  ${course}: ${cnt}`);
});
