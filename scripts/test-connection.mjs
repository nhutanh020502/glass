import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env.local') });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

console.log('--- KIEM TRA KET NOI SUPABASE ---');
console.log('Project URL:', url);
console.log('Auth Key:', key ? `${key.slice(0, 15)}...${key.slice(-10)}` : 'MISSING');

const supabase = createClient(url, key);

async function test() {
  try {
    // Test 1: Root REST API
    const response = await fetch(`${url}/rest/v1/`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` }
    });
    console.log('1. Kiem tra HTTP API Gateway:', response.status === 200 ? 'OK (200)' : `Status ${response.status}`);

    // Test 2: Check schema / tables
    const { count, error } = await supabase.from('customers').select('*', { count: 'exact', head: true });
    if (error) {
      console.log('2. Kiem tra bang "customers":', error.message);
      if (error.message.includes('Could not find') || error.code === 'PGRST205' || error.message.includes('schema cache')) {
        console.log('\n[CHUA CO BANG TRONG POSTGRES]');
        console.log('-> Ket noi toi Supabase da HOAN TOAN DUNG va HOAT DONG 100%.');
        console.log('-> Hien tai database Postgres tren Supabase la database moi, chua duoc chay script tao bang.');
        console.log('-> Ban chi can vao Supabase SQL Editor, dan file supabase-init-full.sql va bam RUN la xong!\n');
      }
    } else {
      console.log('2. Kiem tra bang "customers": THANH CONG!');
      console.log(`   -> So luong khach hang hien tai trong database: ${count}`);
    }
  } catch (err) {
    console.error('Loi ket noi:', err);
  }
}

test();
