import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { Client } from 'pg';
import * as readline from 'readline';

config();

const databaseUrl = process.env.DATABASE_URL;
const supabaseUrl = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const preserveAuthUserId =
  process.env.PRESERVE_AUTH_USER_ID?.trim() || null;

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
  if (preserveAuthUserId) {
    console.log(
      '   - Every Supabase Auth user except the signed-in Dev Tools administrator',
    );
  } else {
    console.log('   - Every Supabase Auth user');
  }
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

type PreservedProfile = {
  user_id: string;
  username: string;
  email: string;
  employee_id: string | null;
  wmsu_id: string | null;
  role: string;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
};

/**
 * The Dev Tools reset runs while an administrator is signed in. Preserve that
 * auth user and its public profile so the in-flight job can keep polling and
 * the administrator is not logged out mid-reset. The demo seed will refresh
 * the profile afterwards.
 */
async function loadPreservedProfile(
  client: Client,
  userId: string,
): Promise<PreservedProfile | null> {
  const { rows } = await client.query<PreservedProfile>(
    `SELECT user_id, username, email, employee_id, wmsu_id, role,
            is_active, created_at, updated_at
       FROM public.users
      WHERE user_id = $1`,
    [userId],
  );
  return rows[0] ?? null;
}

async function restorePreservedProfile(
  client: Client,
  profile: PreservedProfile,
) {
  // Department/faculty rows are truncated, so clear those references. The
  // seed restores the dev account's (null) department afterwards.
  await client.query(
    `INSERT INTO public.users (
       user_id, username, email, employee_id, wmsu_id, role,
       dept_id, faculty_id, is_active, created_at, updated_at
     ) VALUES ($1, $2, $3, $4, $5, $6::public.user_role,
               NULL, NULL, $7, $8, $9)
     ON CONFLICT (user_id) DO UPDATE
       SET username = EXCLUDED.username,
           email = EXCLUDED.email,
           employee_id = EXCLUDED.employee_id,
           wmsu_id = EXCLUDED.wmsu_id,
           role = EXCLUDED.role,
           dept_id = NULL,
           faculty_id = NULL,
           is_active = EXCLUDED.is_active,
           updated_at = EXCLUDED.updated_at`,
    [
      profile.user_id,
      profile.username,
      profile.email,
      profile.employee_id,
      profile.wmsu_id,
      profile.role,
      profile.is_active,
      profile.created_at,
      profile.updated_at,
    ],
  );
  console.log(
    `  Preserved public profile for ${profile.email} (${profile.user_id}).`,
  );
}

async function deleteAllAuthUsers(preserveId: string | null) {
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

  const preserved = preserveId
    ? users.find((user) => user.id === preserveId)
    : undefined;
  const toDelete = preserveId
    ? users.filter((user) => user.id !== preserveId)
    : users;

  for (const user of toDelete) {
    const { error } = await supabase.auth.admin.deleteUser(user.id, false);
    if (error) {
      throw new Error(
        `Could not delete auth user ${user.email ?? user.id}: ${error.message}`,
      );
    }
  }

  console.log(`  Deleted ${toDelete.length} auth user(s).`);
  if (preserveId) {
    console.log(
      preserved
        ? `  Preserved signed-in auth user ${preserved.email ?? preserved.id}.`
        : `  Signed-in auth user ${preserveId} was not found; nothing preserved.`,
    );
  }
  return toDelete.length;
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

    const preservedProfile = preserveAuthUserId
      ? await loadPreservedProfile(client, preserveAuthUserId)
      : null;

    await truncatePublicSchema(client);
    if (preservedProfile) {
      await restorePreservedProfile(client, preservedProfile);
    }
    await restoreSystemStatus(client);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }

  await deleteAllAuthUsers(preserveAuthUserId);

  console.log('\n=== Reset complete ===\n');
  if (preserveAuthUserId) {
    console.log(
      'The database is empty except for the signed-in Dev Tools administrator.',
    );
  } else {
    console.log('The database is empty.');
  }
  console.log('Public identity columns will start at 1.');
  console.log('Run `pnpm --filter @coe-nnect/backend seed:demo` to create the');
  console.log('four departments and six demo user accounts.\n');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
