import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import postgres from 'postgres';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env.local') });

const connectionString = process.env.DATABASE_URL || process.env.DIRECT_URL;

if (!connectionString || connectionString.includes('[YOUR_PASSWORD]')) {
  console.log('\n[!] Vui long dien mat khau database (DATABASE_PASSWORD) vao file .env.local hoac chay script voi tham so mat khau:\n');
  console.log('    node scripts/seed-supabase.mjs <YOUR_PASSWORD>\n');
  console.log('    Hoac ban co the mo file supabase-init-full.sql va copy paste truc tiep vao Supabase SQL Editor.\n');
  process.exit(1);
}

const passwordArg = process.argv[2];
const finalConn = passwordArg 
  ? connectionString.replace(/\[YOUR_PASSWORD\]|:[^@:]*@/, `:${passwordArg}@`)
  : connectionString;

console.log('Connecting to Supabase PostgreSQL...');
const sql = postgres(finalConn, { ssl: 'require', max: 1 });

async function run() {
  try {
    const [{ version }] = await sql`SELECT version()`;
    console.log('Connected successfully to:', version);

    const sqlPath = path.resolve(__dirname, '../../supabase-init-full.sql');
    console.log('Reading migration file:', sqlPath);
    const scriptContent = fs.readFileSync(sqlPath, 'utf8');

    console.log('Executing schema & data insertion (this may take 10-20 seconds)...');
    await sql.unsafe(scriptContent);

    console.log('Migration & seeding completed successfully!');
  } catch (err) {
    console.error('Error during migration:', err);
  } finally {
    await sql.end();
  }
}

run();
