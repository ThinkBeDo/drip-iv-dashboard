const XLSX = require('xlsx');

// Test the membership import process
async function testMembershipImport() {
  const membershipFile = 'Drip IV Active Memberships (4).xlsx';

  console.log('🔍 Testing membership file processing...');

  try {
    const workbook = XLSX.readFile(membershipFile);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet);

    console.log(`✅ Read ${data.length} rows from membership file`);
    console.log('📋 Columns:', Object.keys(data[0]));

    // Test the same logic as processMembershipData
    const membershipTotals = {
      total_drip_iv_members: 0,
      individual_memberships: 0,
      family_memberships: 0,
      family_concierge_memberships: 0,
      drip_concierge_memberships: 0,
      concierge_memberships: 0,
      corporate_memberships: 0,
      marketing_initiatives: 0
    };

    data.forEach(row => {
      const title = (row['Title'] || '').toLowerCase();
      if (title) {
        membershipTotals.total_drip_iv_members++;

        if (title.includes('individual')) {
          membershipTotals.individual_memberships++;
        } else if (title.includes('family') && title.includes('concierge')) {
          membershipTotals.family_concierge_memberships++;
        } else if (title.includes('family')) {
          membershipTotals.family_memberships++;
        } else if (title.includes('concierge') && title.includes('drip')) {
          membershipTotals.drip_concierge_memberships++;
        } else if (title.includes('concierge')) {
          membershipTotals.concierge_memberships++;
        } else if (title.includes('corporate')) {
          membershipTotals.corporate_memberships++;
        }
      }
    });

    console.log('\n📊 Membership counts calculated:');
    console.log(JSON.stringify(membershipTotals, null, 2));

    if (membershipTotals.total_drip_iv_members === 0) {
      console.log('\n❌ PROBLEM: No memberships counted!');
      console.log('This means the membership file processing is failing.');
    } else {
      console.log(`\n✅ SUCCESS: Found ${membershipTotals.total_drip_iv_members} total memberships`);
    }

    return membershipTotals;

  } catch (error) {
    console.error('❌ Error processing membership file:', error.message);
    return null;
  }
}

testMembershipImport();
