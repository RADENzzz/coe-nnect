import { createClient } from '@supabase/supabase-js';
import * as readline from 'node:readline';
import { config } from 'dotenv';

config();

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const ask = (q: string) => new Promise<string>((resolve) => rl.question(q, resolve));

async function main() {
  console.log('\n--- CoE-NNECT: Create User Account ---\n');

  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
    process.exit(1);
  }

  const supabase = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const email = (await ask('Email: ')).trim();
  const password = (await ask('Password (min 8): ')).trim();
  const username = (await ask('Username: ')).trim();
  const role = (
    await ask('Role (administrator | college_dean | department_head | viewer): ')
  ).trim();
  const deptId = (await ask('Department ID (optional, blank if none): ')).trim();
  const facultyId = (await ask('Faculty ID (optional, blank if none): ')).trim();

  console.log('\nCreating user...\n');

  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: {
      role,
      username,
      dept_id: deptId || null,
      faculty_id: facultyId || null,
    },
  });

  if (error) {
    console.error(' Error:', error.message);
  } else {
    console.log(' User created');
    console.log(`   Email:    ${data.user.email}`);
    console.log(`   User ID:  ${data.user.id}`);
    console.log(`   Role:     ${role}`);
    console.log('\nThe trigger `handle_new_auth_user` populated public.users.');
  }

  rl.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});