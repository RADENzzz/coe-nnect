import { createClient } from '@supabase/supabase-js';
import * as readline from 'readline';

// Initialize readline for taking input from the terminal
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const askQuestion = (query) => new Promise((resolve) => rl.question(query, resolve));

async function main() {
  console.log('\n--- Supabase Admin Account Creator ---\n');
  console.log('You will need your Supabase Project URL and SERVICE_ROLE_KEY.');
  console.log('You can find these in your Supabase Dashboard under Project Settings -> API.\n');

  const supabaseUrl = (await askQuestion('Enter Supabase Project URL: ')).trim();
  const serviceRoleKey = (await askQuestion('Enter Supabase SERVICE_ROLE_KEY: ')).trim();

  if (!supabaseUrl || !serviceRoleKey) {
    console.error('Error: URL and Service Role Key are required.');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });

  const email = (await askQuestion('\nEnter new admin Email (e.g., admin@wmsu.edu.ph): ')).trim();
  const password = (await askQuestion('Enter new admin Password (min 8 characters): ')).trim();
  const username = (await askQuestion('Enter new admin Username: ')).trim();

  console.log('\nCreating your master admin account...');

  // 1. Create the user using the Admin API
  // We pass the role and username in app_metadata so the database trigger can read them!
  const { data, error } = await supabase.auth.admin.createUser({
    email: email,
    password: password,
    email_confirm: true,
    app_metadata: { 
      role: 'administrator', 
      username: username 
    }
  });

  if (error) {
    console.error('❌ Error creating user:', error.message);
  } else {
    console.log('✅ Admin user successfully created!');
    console.log(`\nEmail: ${data.user.email}`);
    console.log(`Role: administrator`);
    console.log('\nYou can now log into your application with these credentials.');
  }

  rl.close();
}

main();
