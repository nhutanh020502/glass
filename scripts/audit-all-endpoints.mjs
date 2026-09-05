import { getV2Dashboard, getTestLabDashboard, getSalesDashboard } from '../db/v2';
import { getDashboard } from '../db/store';

async function auditAll() {
  console.log('--- STARTING COMPREHENSIVE AUDIT OF ALL API FUNCTIONS ---');

  console.log('\n1. Testing getTestLabDashboard()...');
  const testLab = await getTestLabDashboard();
  console.log('✓ getTestLabDashboard passed! Metrics:', testLab.metrics);
  console.log(`  - Test Inventory: ${testLab.inventory.length}`);
  console.log(`  - Test Orders: ${testLab.orders.length}`);
  console.log(`  - Test Events: ${testLab.events.length}`);

  console.log('\n2. Testing getV2Dashboard with scopes...');
  const scopes = [
    'overview',
    'inventory',
    'orders',
    'purchases',
    'lots',
    'movements',
    'customers',
    'defective',
    'all',
  ];

  for (const scope of scopes) {
    try {
      const data = await getV2Dashboard({ scope });
      console.log(`✓ Scope "${scope}" passed! Keys returned:`, Object.keys(data));
    } catch (e) {
      console.error(`✗ Scope "${scope}" FAILED:`, e);
      throw e;
    }
  }

  console.log('\n3. Testing getV2Dashboard with various filters...');
  const filteredData = await getV2Dashboard({
    scope: 'all',
    customer: 'Phạm',
    product: 'kính',
    sources: ['kho'],
    inventoryProduct: 'kính',
    inventorySources: ['kho'],
    inventoryFromDate: '2026-01-01',
    inventoryToDate: '2026-12-31',
    fromDate: '2026-01-01',
    toDate: '2026-12-31',
    status: 'COMPLETED',
  });
  console.log('✓ Filtered getV2Dashboard passed! Orders:', filteredData.orders?.length);

  console.log('\n4. Testing getSalesDashboard()...');
  const sales = await getSalesDashboard();
  console.log('✓ getSalesDashboard passed! Summary:', sales.summary);

  console.log('\n5. Testing getDashboard() (V1)...');
  const v1 = await getDashboard();
  console.log('✓ getDashboard passed! Metrics:', v1.metrics);

  console.log('\n=============================================================');
  console.log('ALL API FUNCTIONS AND SCOPES AUDITED AND PASSED 100% SUCCESS!');
  console.log('=============================================================\n');
  process.exit(0);
}

auditAll().catch(e => {
  console.error('\nAUDIT FAILED:', e);
  process.exit(1);
});
