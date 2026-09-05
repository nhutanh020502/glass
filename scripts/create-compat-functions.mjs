import postgres from 'postgres';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env.local') });

const sql = postgres(process.env.DATABASE_URL, { ssl: 'require' });

async function createHelpers() {
  console.log('--- CREATING SQLITE COMPATIBILITY FUNCTIONS IN POSTGRES ---');

  // 1. substr(date, int, int)
  await sql.unsafe(`
    CREATE OR REPLACE FUNCTION substr(d date, s int, l int)
    RETURNS text LANGUAGE sql IMMUTABLE AS $$
      SELECT substr(d::text, s, l);
    $$;
  `);
  console.log('✓ Created substr(date, int, int)');

  // 2. date(text)
  await sql.unsafe(`
    CREATE OR REPLACE FUNCTION date(t text)
    RETURNS text LANGUAGE sql IMMUTABLE AS $$
      SELECT CASE WHEN t = 'now' THEN CURRENT_DATE::text ELSE t END;
    $$;
  `);
  console.log('✓ Created date(text)');

  // 3. instr(text, text)
  await sql.unsafe(`
    CREATE OR REPLACE FUNCTION instr(str text, sub text)
    RETURNS integer LANGUAGE sql IMMUTABLE AS $$
      SELECT COALESCE(strpos(str, sub), 0);
    $$;
  `);
  console.log('✓ Created instr(text, text)');

  // 4. group_concat(text) and group_concat(text, text)
  await sql.unsafe(`
    CREATE OR REPLACE FUNCTION group_concat_state(state text, val text)
    RETURNS text LANGUAGE sql IMMUTABLE AS $$
      SELECT CASE WHEN state IS NULL OR state = '' THEN val ELSE state || ', ' || val END;
    $$;

    CREATE OR REPLACE AGGREGATE group_concat (text) (
      sfunc = group_concat_state,
      stype = text,
      initcond = ''
    );
  `);
  console.log('✓ Created group_concat(text)');

  await sql.unsafe(`
    CREATE OR REPLACE FUNCTION group_concat_state_delim(state text, val text, delim text)
    RETURNS text LANGUAGE sql IMMUTABLE AS $$
      SELECT CASE WHEN state IS NULL OR state = '' THEN val ELSE state || delim || val END;
    $$;

    CREATE OR REPLACE AGGREGATE group_concat (text, text) (
      sfunc = group_concat_state_delim,
      stype = text,
      initcond = ''
    );
  `);
  console.log('✓ Created group_concat(text, text)');

  // 5. max(numeric, numeric) and min(numeric, numeric) for SQLite scalar compatibility
  await sql.unsafe(`
    CREATE OR REPLACE FUNCTION max(a numeric, b numeric)
    RETURNS numeric LANGUAGE sql IMMUTABLE AS $$
      SELECT GREATEST(a, b);
    $$;

    CREATE OR REPLACE FUNCTION min(a numeric, b numeric)
    RETURNS numeric LANGUAGE sql IMMUTABLE AS $$
      SELECT LEAST(a, b);
    $$;
  `);
  console.log('✓ Created max and min scalar functions');

  // Test the exact failing query: substr(date('now'), 1, 7)
  const testRes = await sql.unsafe(`
    SELECT
      substr(date('now'), 1, 7) as month_profit_test,
      instr('hello,world', ',') as instr_test,
      group_concat(display_name, ', ') as group_concat_test
    FROM (SELECT display_name FROM customers LIMIT 3) c;
  `);
  console.log('Test res:', testRes);
  // Test the exact overview query that failed:
  const overviewRes = await sql.unsafe(`
    SELECT
      (SELECT COALESCE(SUM(remaining_qty),0) FROM glasses_lots WHERE stock_status='AVAILABLE') AS glasses_on_hand,
      (SELECT COALESCE(SUM(quantity),0) FROM inventory_reservations WHERE bucket='GLASSES' AND status='RESERVED') AS glasses_reserved,
      (SELECT COALESCE(SUM(remaining_qty),0) FROM box_lots) + (SELECT COALESCE(SUM(included_box_remaining),0) FROM glasses_lots WHERE stock_status='AVAILABLE') AS boxes_on_hand,
      (SELECT COALESCE(SUM(quantity),0) FROM inventory_reservations WHERE bucket IN ('LOOSE_BOX','ATTACHED_BOX') AND status='RESERVED') AS boxes_reserved,
      (SELECT COUNT(*) FROM purchase_orders WHERE status IN ('ORDERED','PARTIAL')) AS open_purchase_orders,
      (SELECT COUNT(*) FROM orders WHERE workflow_status IN ('WAITING_STOCK','DEPOSIT_RECEIVED','ORDERING_SUPPLIER','GOODS_RECEIVED','READY_TO_SHIP','SHIPPING')) AS active_sales_orders,
      (SELECT COUNT(*) FROM customers) AS customers,
      (SELECT COALESCE(SUM(profit),0) FROM orders WHERE workflow_status='COMPLETED' AND substr(order_date,1,7)=substr(date('now'),1,7)) AS monthly_profit
  `);
  console.log('✓ OVERVIEW METRICS QUERY PASSED PERFECTLY:');
  console.log(overviewRes);

  await sql.end();
}

createHelpers().catch(err => {
  console.error('Error creating helper functions:', err);
  process.exit(1);
});
