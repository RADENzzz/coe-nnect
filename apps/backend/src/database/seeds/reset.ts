import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
config();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

async function main() {
  console.log('Resetting demo-mutable tables…');
  // Order matters for FK dependencies
  await supabase.from('schedule').delete().neq('schedule_id', 0);
  await supabase.from('faculty_request').delete().neq('request_id', 0);
  await supabase.from('faculty_commitment').delete().neq('commitment_id', 0);
  await supabase.from('minor_subject_schedule').delete().neq('minor_id', 0);
  await supabase.from('subject_restriction').delete().neq('restriction_id', 0);
  await supabase.from('faculty_preference').delete().neq('preference_id', 0);
  await supabase.from('faculty_qualification').delete().neq('qual_id', 0);
  console.log('Done. Run `pnpm seed:demo` to repopulate.');
}

main().catch(console.error);