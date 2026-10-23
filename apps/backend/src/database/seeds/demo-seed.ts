import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

config();

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ─────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────
const DEMO_PASSWORD = 'Demo!2345';

const DEPARTMENTS = [
  {
    dept_code: 'CPE',
    dept_name: 'Computer Engineering',
    description: 'Department of Computer Engineering',
  },
  {
    dept_code: 'EE',
    dept_name: 'Electrical Engineering',
    description: 'Department of Electrical Engineering',
  },
  {
    dept_code: 'GE',
    dept_name: 'Geodetic Engineering',
    description: 'Department of Geodetic Engineering',
  },
  {
    dept_code: 'ENVE',
    dept_name: 'Environmental Engineering',
    description: 'Department of Environmental Engineering',
  },
];

const USERS = [
  {
    email: 'dev-admin@wmsu.edu.ph',
    username: 'dev-admin',
    role: 'administrator',
    dept_code: null,
  },
  {
    email: 'head.cpe@wmsu.edu.ph',
    username: 'head.cpe',
    role: 'department_head',
    dept_code: 'CPE',
  },
  {
    email: 'head.ee@wmsu.edu.ph',
    username: 'head.ee',
    role: 'department_head',
    dept_code: 'EE',
  },
  {
    email: 'head.ge@wmsu.edu.ph',
    username: 'head.ge',
    role: 'department_head',
    dept_code: 'GE',
  },
  {
    email: 'head.enve@wmsu.edu.ph',
    username: 'head.enve',
    role: 'department_head',
    dept_code: 'ENVE',
  },
  {
    email: 'dean@wmsu.edu.ph',
    username: 'dean',
    role: 'college_dean',
    dept_code: null,
  },
];

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────
async function findAuthUserByEmail(email: string) {
  let page = 1;
  const perPage = 1000;

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage,
    });
    if (error) {
      throw new Error(`Could not list auth users: ${error.message}`);
    }

    const users = data?.users ?? [];
    const match = users.find(
      (user) =>
        (user as { email?: string }).email?.toLowerCase() ===
        email.toLowerCase(),
    );
    if (match) return match;
    if (users.length < perPage) return null;

    page += 1;
  }
}

async function ensureDepartment(dept: (typeof DEPARTMENTS)[number]) {
  const { data: existing, error: findError } = await supabase
    .from('department')
    .select('dept_id')
    .eq('dept_code', dept.dept_code)
    .maybeSingle();

  if (findError) {
    throw new Error(
      `Could not read department ${dept.dept_code}: ${findError.message}`,
    );
  }

  if (existing) {
    const { error } = await supabase
      .from('department')
      .update({
        dept_name: dept.dept_name,
        description: dept.description,
        is_active: true,
      })
      .eq('dept_id', existing.dept_id);

    if (error) {
      throw new Error(
        `Could not update department ${dept.dept_code}: ${error.message}`,
      );
    }

    return String(existing.dept_id);
  }

  const { data, error } = await supabase
    .from('department')
    .insert({
      dept_code: dept.dept_code,
      dept_name: dept.dept_name,
      description: dept.description,
      is_active: true,
    })
    .select('dept_id')
    .single();

  if (error || !data) {
    throw new Error(
      `Could not create department ${dept.dept_code}: ${error?.message}`,
    );
  }

  return String(data.dept_id);
}

async function ensureUser(
  user: (typeof USERS)[number],
  deptIds: Record<string, string>,
) {
  const deptId = user.dept_code ? deptIds[user.dept_code] : null;
  if (user.dept_code && !deptId) {
    throw new Error(`Department ${user.dept_code} was not created`);
  }

  const appMetadata = {
    role: user.role,
    username: user.username,
    dept_id: deptId,
    faculty_id: null,
    first_name: user.username,
  };

  const existing = await findAuthUserByEmail(user.email);

  let userId: string;
  if (existing) {
    const { data, error } = await supabase.auth.admin.updateUserById(
      existing.id,
      {
        password: DEMO_PASSWORD,
        email_confirm: true,
        app_metadata: appMetadata,
      },
    );
    if (error || !data.user) {
      throw new Error(`Could not update user ${user.email}: ${error?.message}`);
    }
    userId = data.user.id;
    console.log(`  ${user.email} — updated (password reset)`);
  } else {
    const { data, error } = await supabase.auth.admin.createUser({
      email: user.email,
      password: DEMO_PASSWORD,
      email_confirm: true,
      app_metadata: appMetadata,
    });
    if (error || !data.user) {
      throw new Error(`Could not create user ${user.email}: ${error?.message}`);
    }
    userId = data.user.id;
    console.log(`  ${user.email} — created`);
  }

  // The auth trigger creates public.users. Upserting keeps the public profile
  // in sync even if the trigger was added after the auth user already existed.
  const { data: profile, error: profileError } = await supabase
    .from('users')
    .upsert(
      {
        user_id: userId,
        username: user.username,
        email: user.email,
        role: user.role,
        dept_id: deptId,
        faculty_id: null,
        wmsu_id: null,
        employee_id: null,
        is_active: true,
      },
      { onConflict: 'user_id' },
    )
    .select('user_id');

  if (profileError) {
    throw new Error(
      `Could not update public.users for ${user.email}: ${profileError.message}`,
    );
  }
  if (!profile?.length) {
    throw new Error(`public.users row missing for ${user.email}`);
  }
}

// ─────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────
async function main() {
  console.log('\n=== CoE-NNECT: Demo Seed ===\n');
  console.log('Seeding departments and user accounts only.\n');

  console.log('[1/2] Upserting departments…');
  const deptIds: Record<string, string> = {};
  for (const dept of DEPARTMENTS) {
    deptIds[dept.dept_code] = await ensureDepartment(dept);
    console.log(`  ${dept.dept_code} — ${dept.dept_name}`);
  }

  console.log('\n[2/2] Ensuring users…');
  for (const user of USERS) {
    await ensureUser(user, deptIds);
  }

  console.log('\n=== Seed complete ===\n');
  console.log('Demo credentials:');
  console.log(`  Password (all users): ${DEMO_PASSWORD}`);
  console.log('');
  console.log('  Dev Admin          dev-admin@wmsu.edu.ph');
  console.log('  College Dean       dean@wmsu.edu.ph');
  console.log('  CPE Dept Head      head.cpe@wmsu.edu.ph');
  console.log('  EE Dept Head       head.ee@wmsu.edu.ph');
  console.log('  GE Dept Head       head.ge@wmsu.edu.ph');
  console.log('  ENVE Dept Head     head.enve@wmsu.edu.ph');
  console.log('');
  console.log('Departments: CPE, EE, GE, ENVE');
  console.log('');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
