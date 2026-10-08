import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
config();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const NIL_UUID = '00000000-0000-0000-0000-000000000000';

async function main() {
  console.log('\n=== CoE-NNECT: Reset ===\n');
  console.log(
    'Wipes everything the demo seed writes. Leaves auth users + accounts intact.\n',
  );

  // ── 0. Detach users from faculty so we can delete faculty rows
  console.log('[0/6] Detaching users.faculty_id…');
  {
    const { error } = await supabase
      .from('users')
      .update({ faculty_id: null })
      .not('faculty_id', 'is', null);
    if (error) console.warn('  warn:', error.message);
  }

  // ── 1. Scheduling layer (children first)
  console.log('[1/6] Wiping scheduling data…');
  const schedulingTables: Array<[string, string]> = [
    ['schedule_version', 'version_id'],
    ['schedule', 'schedule_id'],
    ['minor_subject_schedule', 'minor_id'],
  ];
  for (const [table, idCol] of schedulingTables) {
    const { error } = await supabase.from(table).delete().neq(idCol, 0);
    if (error) console.warn(`  ${table}: ${error.message}`);
  }

  // ── 2. Requests + notifications
  console.log('[2/6] Wiping requests + notifications…');
  {
    const { error: e1 } = await supabase
      .from('faculty_request')
      .delete()
      .neq('request_id', 0);
    if (e1) console.warn('  faculty_request:', e1.message);

    const { error: e2 } = await supabase
      .from('cross_department_request')
      .delete()
      .neq('request_id', NIL_UUID);
    if (e2) console.warn('  cross_department_request:', e2.message);

    const { error: e3 } = await supabase
      .from('notification')
      .delete()
      .neq('notification_id', NIL_UUID);
    if (e3) console.warn('  notification:', e3.message);
  }

  // ── 3. Faculty children
  console.log('[3/6] Wiping faculty child tables…');
  const facultyChildTables: Array<[string, string]> = [
    ['faculty_commitment', 'commitment_id'],
    ['faculty_preference', 'preference_id'],
    ['faculty_qualification', 'qual_id'],
    ['subject_restriction', 'restriction_id'],
  ];
  for (const [table, idCol] of facultyChildTables) {
    const { error } = await supabase.from(table).delete().neq(idCol, 0);
    if (error) console.warn(`  ${table}: ${error.message}`);
  }

  // ── 4. Academic structure
  console.log('[4/6] Wiping academic structure…');
  const academicTables: Array<[string, string]> = [
    ['prospectus', 'prospectus_id'],
    ['section', 'section_id'],
    ['subject', 'subject_id'],
    ['faculty', 'faculty_id'],
  ];
  for (const [table, idCol] of academicTables) {
    const { error } = await supabase.from(table).delete().neq(idCol, 0);
    if (error) console.warn(`  ${table}: ${error.message}`);
  }

  // ── 5. Faculty preferences & quals re-check (in case FKs blocked above)
  console.log('[5/6] Re-checking faculty children…');
  await supabase.from('faculty_qualification').delete().neq('qual_id', 0);
  await supabase.from('faculty_preference').delete().neq('preference_id', 0);

  // ── 6. Terms + remaining demo-only data
  console.log('[6/6] Clearing terms + demo-only data…');
  {
    // Now that schedule / schedule_version / faculty_commitment /
    // minor_subject_schedule are gone, term has no children.
    const { error: termErr } = await supabase
      .from('term')
      .delete()
      .neq('term_id', 0);
    if (termErr) console.warn('  term:', termErr.message);

    const { error: auditErr } = await supabase
      .from('audit_trail')
      .delete()
      .neq('audit_id', 0);
    if (auditErr) console.warn('  audit_trail:', auditErr.message);
  }

  console.log('\n=== Reset complete ===\n');
  console.log('KEPT:');
  console.log('  - department, program, room, scheduling_setting, designation');
  console.log('  - users + auth.users (accounts untouched)');
  console.log('\nRun `pnpm --filter @coe-nnect/backend seed:demo` to repopulate.\n');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});