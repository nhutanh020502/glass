import { getV2Dashboard, getSalesDashboard } from '../db/v2';
import { getDashboard } from '../db/store';

async function testAll() {
  console.log('--- TESTING ALL DASHBOARD QUERIES ON SUPABASE ---');

  try {
    console.log('1. Testing getV2Dashboard()...');
    const v2Data = await getV2Dashboard();
    console.log('✓ getV2Dashboard SUCCESS! Metrics:', v2Data.metrics);
    console.log(`  - Orders: ${v2Data.orders.length}`);
    console.log(`  - Products: ${v2Data.products.length}`);
    console.log(`  - Customers: ${v2Data.customers.length}`);
    console.log(`  - Glasses Inventory: ${v2Data.glassesInventory.length}`);
    console.log(`  - Box Inventory: ${v2Data.boxInventory.length}`);

    console.log('2. Testing getSalesDashboard()...');
    const salesData = await getSalesDashboard();
    console.log('✓ getSalesDashboard SUCCESS! Summary:', salesData.summary);
    console.log(`  - Monthly rows: ${salesData.monthly.length}`);
    console.log(`  - Top glasses: ${salesData.topGlasses.length}`);

    console.log('3. Testing getDashboard() (V1)...');
    const v1Data = await getDashboard();
    console.log('✓ getDashboard SUCCESS! Metrics:', v1Data.metrics);
    console.log(`  - Orders: ${v1Data.orders.length}`);

    console.log('\n======================================================');
    console.log('ALL QUERIES PASSED WITH 100% SUCCESS ON SUPABASE!');
    console.log('======================================================\n');
    process.exit(0);
  } catch (err) {
    console.error('FAILED Query Error:', err);
    process.exit(1);
  }
}

testAll().catch(e => {
  console.error(e);
  process.exit(1);
});
