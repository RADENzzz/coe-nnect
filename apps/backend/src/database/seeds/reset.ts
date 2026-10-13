import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import * as readline from 'readline';
config();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const NIL_UUID = '00000000-0000-0000-0000-000000000000';

async function confirmOrAbort() {
  if (process.env.SKIP_CONFIRM === '1') return;

  console.log('\n⚠️  WARNING: This will DELETE:');
  console.log('   - All schedules, unscheduled entries');
  console.log('   - All chat conversations and messages');
  console.log('   - All faculty requests, notifications');
  console.log('   - All faculty, subjects, sections, prospectus');
  console.log('   - All terms, audit trail');
  console.log('\n   It will KEEP:');
  console.log('   - Departments, programs, rooms, designations, settings');
  console.log('   - User accounts (auth.users + public.users)');
  console.log('\n   Set SKIP_CONFIRM=1 to bypass this prompt.\n');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const answer = await new Promise<string>((resolve) =>
    rl.question('Continue? (y/N) ', (a) => {
      rl.close();
      resolve(a.trim().toLowerCase());
    }),
  );

  if (answer !== 'y' && answer !== 'yes') {
    console.log('\nAborted.\n');
    process.exit(0);
  }
  console.log('');
}

async function main() {
  console.log('\n=== CoE-NNECT: Reset ===\n');
  console.log(
    'Wipes everything the demo seed writes. Leaves auth users + accounts intact.\n',
  );

  await confirmOrAbort();

  // ── 0. Detach users from faculty so we can delete faculty rows
  console.log('[0/7] Detaching users.faculty_id…');
  {
    const { error } = await supabase
      .from('users')
      .update({ faculty_id: null })
      .not('faculty_id', 'is', null);
    if (error) console.warn('  warn:', error.message);
  }

  // ── 1. Scheduling layer (children first)
  console.log('[1/7] Wiping scheduling data…');
  const schedulingTables: Array<[string, string]> = [
    ['schedule_unscheduled', 'unscheduled_id'],
    ['schedule_version', 'version_id'],
    ['schedule', 'schedule_id'],
    ['minor_subject_schedule', 'minor_id'],
  ];
  for (const [table, idCol] of schedulingTables) {
    const { error } = await supabase.from(table).delete().neq(idCol, 0);
    if (error) console.warn(`  ${table}: ${error.message}`);
  }

  // ── 2. Chat layer (cascade handles conversation_member + message)
  console.log('[2/7] Wiping chat data…');
  {
    const { error } = await supabase
      .from('conversation')
      .delete()
      .neq('conversation_id', 0);
    if (error) console.warn('  conversation:', error.message);
  }

  // ── 3. Requests + notifications
  console.log('[3/7] Wiping requests + notifications…');
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

    // Clear per-user trigger preferences so they don't reference
    // stale trigger keys after a reset.
    const { error: e4 } = await supabase
      .from('user_notification_setting')
      .delete()
      .neq('trigger_key', '__never_matches__');
    if (e4) console.warn('  user_notification_setting:', e4.message);
  }

  // ── 4. Faculty children
  console.log('[4/7] Wiping faculty child tables…');
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

  // ── 5. Academic structure
  console.log('[5/7] Wiping academic structure…');
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

  // ── 6. Re-check faculty children (in case FKs blocked above)
  console.log('[6/7] Re-checking faculty children…');
  await supabase.from('faculty_qualification').delete().neq('qual_id', 0);
  await supabase.from('faculty_preference').delete().neq('preference_id', 0);

  // ── 7. Terms + remaining demo-only data
  console.log('[7/7] Clearing terms + audit trail…');
  {
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
  console.log('\nWIPED:');
  console.log('  - schedule, schedule_version, schedule_unscheduled');
  console.log('  - conversation, conversation_member, message');
  console.log('  - faculty_request, cross_department_request, notification');
  console.log('  - faculty, faculty_qualification, faculty_preference, faculty_commitment');
  console.log('  - subject, subject_restriction, prospectus, section');
  console.log('  - term, audit_trail, minor_subject_schedule');
  console.log('\nRun `pnpm --filter @coe-nnect/backend seed:demo` to repopulate.\n');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});