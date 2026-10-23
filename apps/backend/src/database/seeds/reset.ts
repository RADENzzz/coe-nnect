import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { Client } from 'pg';
import * as readline from 'readline';

config();

const databaseUrl = process.env.DATABASE_URL;
const supabaseUrl = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!databaseUrl || !supabaseUrl || !serviceKey) {
  console.error(
    'Missing DATABASE_URL, SUPABASE_URL, or SUPABASE_SERVICE_ROLE_KEY in .env',
  );
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const isLocalDatabase =
  /(^|@)(localhost|127\.0\.0\.1|\[::1\])(:|$)/i.test(databaseUrl) ||
  /@(db|postgres):\d+/i.test(databaseUrl);

if (!isLocalDatabase && process.env.ALLOW_REMOTE_RESET !== '1') {
  console.error(
    '\nRefusing to reset a remote database.\n' +
      'Set ALLOW_REMOTE_RESET=1 if you really mean to wipe the hosted database.\n',
  );
  process.exit(1);
}

function targetLabel() {
  try {
    const parsed = new URL(databaseUrl);
    return `${parsed.hostname}${parsed.pathname}`;
  } catch {
    return '(unparseable DATABASE_URL)';
  }
}

async function confirmOrAbort() {
  console.log('\n⚠️  WARNING: HARD DATABASE RESET');
  console.log(`   Target: ${targetLabel()}`);
  console.log('\n   This will permanently delete:');
  console.log('   - Every row in every public table');
  console.log('   - Every Supabase Auth user');
  console.log(
    '   - All schedules, subjects, faculty, programs, rooms, terms, chat,',
  );
  console.log('     notifications, audit history, and prospectus data');
  console.log('\n   Identity sequences will restart at 1.');
  console.log('   The reset re-creates only the disabled system_status row.');
  console.log('\n   Set SKIP_CONFIRM=1 to bypass this prompt.\n');

  if (process.env.SKIP_CONFIRM === '1') return;

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const answer = await new Promise<string>((resolve) =>
    rl.question('Type RESET to continue: ', (value) => {
      rl.close();
      resolve(value.trim());
    }),
  );

  if (answer !== 'RESET') {
    console.log('\nAborted.\n');
    process.exit(0);
  }
  console.log('');
}

async function truncatePublicSchema(client: Client) {
  const { rows } = await client.query<{ tables: string | null }>(`
    SELECT string_agg(
      format('%I.%I', schemaname, tablename),
      ', ' ORDER BY tablename
    ) AS tables
    FROM pg_tables
    WHERE schemaname = 'public'
  `);

  const tables = rows[0]?.tables;
  if (!tables) {
    console.log('  No public tables found.');
    return;
  }

  await client.query(`TRUNCATE TABLE ${tables} RESTART IDENTITY CASCADE`);
  console.log('  Truncated all public tables and restarted identities.');
}

async function restoreSystemStatus(client: Client) {
  await client.query(`
    DO $$
    BEGIN
      IF to_regclass('public.system_status') IS NOT NULL THEN
        INSERT INTO public.system_status (status_id, enabled, severity)
        VALUES (1, false, 'info')
        ON CONFLICT (status_id) DO UPDATE
        SET enabled = false,
            severity = 'info',
            title = NULL,
            message = NULL,
            suppress_until = NULL,
            updated_by = NULL,
            updated_at = now();
      END IF;
    END $$;
  `);
  console.log('  Restored the disabled system_status singleton.');
}

async function deleteAllAuthUsers() {
  const perPage = 1000;
  const users: Array<{ id: string; email?: string }> = [];
  let page = 1;

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage,
    });
    if (error) {
      throw new Error(`Could not list auth users: ${error.message}`);
    }

    const batch = data?.users ?? [];
    users.push(...batch);
    if (batch.length < perPage) break;
    page += 1;
  }

  for (const user of users) {
    const { error } = await supabase.auth.admin.deleteUser(user.id, false);
    if (error) {
      throw new Error(
        `Could not delete auth user ${user.email ?? user.id}: ${error.message}`,
      );
    }
  }

  console.log(`  Deleted ${users.length} auth user(s).`);
  return users.length;
}

async function main() {
  console.log('\n=== CoE-NNECT: Hard Reset ===\n');

  await confirmOrAbort();

  const useSsl =
    process.env.DATABASE_SSL?.trim().toLowerCase() !== 'false' &&
    !isLocalDatabase;

  const client = new Client({
    connectionString: databaseUrl,
    ssl: useSsl ? { rejectUnauthorized: false } : undefined,
  });

  await client.connect();
  try {
    await client.query('BEGIN');
    await truncatePublicSchema(client);
    await restoreSystemStatus(client);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }

  await deleteAllAuthUsers();

  console.log('\n=== Reset complete ===\n');
  console.log(
    'The database is empty. Public identity columns will start at 1.',
  );
  console.log('Run `pnpm --filter @coe-nnect/backend seed:demo` to create the');
  console.log('four departments and six demo user accounts.\n');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
