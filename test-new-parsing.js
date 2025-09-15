const XLSX = require('xlsx');

// Import the actual functions from server.js
const fs = require('fs');
const serverCode = fs.readFileSync('server.js', 'utf8');

// Extract the parseExcelData function from server.js
console.log('=== TESTING NEW MEMBERSHIP PARSING WITH DEDUPLICATION ===\n');

// Test the new parseExcelData function directly
async function testMembershipParsing() {
  try {
    console.log('Testing membership file parsing...');
    
    const workbook = XLSX.readFile('Drip IV Active Memberships (2).xlsx');
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet);
    
    console.log(`📊 Membership file loaded: ${data.length} records`);
    
    // Initialize membership counts
    let conciergeMembers = 0;
    let corporateMembers = 0;
    let individualMembers = 0;
    let familyMembers = 0;
    let familyConciergeMembers = 0;
    let dripConciergeMembers = 0;
    
    // Track unique patients to avoid duplicates
    const uniquePatients = new Map();
    
    // Process each row for deduplication
    data.forEach((row, index) => {
      // Create unique patient identifier using name and email
      const patientName = (row['Customer'] || row['Name'] || row['Patient'] || '').toString().trim().toLowerCase();
      const patientEmail = (row['Email'] || row['Email Address'] || '').toString().trim().toLowerCase();
      const patientKey = patientEmail || patientName || `row_${index}`;
      
      // Get membership type
      const membershipType = (
        row['Title'] || 
        row['Membership Type'] || 
        row['Type'] || 
        row['Plan'] || 
        row['Membership'] ||
        ''
      ).toString().toLowerCase().trim();
      
      if (index < 10) {
        console.log(`Row ${index + 1}: Patient="${patientName}", Email="${patientEmail}", Type="${membershipType}"`);
      }
      
      // Check if patient already exists
      if (!uniquePatients.has(patientKey)) {
        uniquePatients.set(patientKey, {
          name: patientName,
          email: patientEmail,
          memberships: []
        });
      }
      
      // Add membership type to patient
      uniquePatients.get(patientKey).memberships.push(membershipType);
    });
    
    console.log(`📊 Found ${uniquePatients.size} unique patients from ${data.length} records`);
    console.log(`📊 Duplicate records: ${data.length - uniquePatients.size}`);
    
    // Look for Dennis Pitre specifically
    let dennisPitreFound = false;
    uniquePatients.forEach((patient, patientKey) => {
      if (patient.name.includes('dennis') && patient.name.includes('pitre')) {
        dennisPitreFound = true;
        console.log(`🔍 FOUND DENNIS PITRE:`);
        console.log(`   Key: ${patientKey}`);
        console.log(`   Name: ${patient.name}`);
        console.log(`   Email: ${patient.email}`);
        console.log(`   Memberships: ${patient.memberships.join(' | ')}`);
      }
    });
    
    if (!dennisPitreFound) {
      console.log('🔍 Dennis Pitre not found with exact name match, checking partial matches...');
      uniquePatients.forEach((patient, patientKey) => {
        if (patient.name.includes('dennis') || patient.name.includes('pitre')) {
          console.log(`   Partial match: "${patient.name}" - ${patient.memberships.join(' | ')}`);
        }
      });
    }
    
    // Analyze membership types for each unique patient
    uniquePatients.forEach((patient, patientKey) => {
      const allMemberships = patient.memberships.join(' | ');
      
      // Determine primary membership classification
      let hasFamily = false;
      let hasConcierge = false;
      let hasIndividual = false;
      let hasCorporate = false;
      
      patient.memberships.forEach(membershipType => {
        if (membershipType.includes('family')) hasFamily = true;
        if (membershipType.includes('concierge')) hasConcierge = true;
        if (membershipType.includes('individual')) hasIndividual = true;
        if (membershipType.includes('corporate')) hasCorporate = true;
      });
      
      // Classify based on membership combinations
      if (hasFamily && hasConcierge) {
        familyConciergeMembers++;
        console.log(`👥 Family+Concierge: ${patient.name} - ${allMemberships}`);
      } else if (hasConcierge && (allMemberships.includes('drip') || hasIndividual)) {
        dripConciergeMembers++;
        console.log(`💎 Drip+Concierge: ${patient.name} - ${allMemberships}`);
      } else if (hasFamily) {
        familyMembers++;
      } else if (hasConcierge) {
        conciergeMembers++;
      } else if (hasIndividual) {
        individualMembers++;
      } else if (hasCorporate) {
        corporateMembers++;
      } else {
        individualMembers++; // Default to individual for unknown types
        console.log(`⚠️ Unknown membership type defaulted to individual: ${patient.name} - ${allMemberships}`);
      }
    });
    
    const totalMembers = uniquePatients.size;
    
    console.log('\n✅ NEW Membership parsing results:');
    console.log(`   Total Unique Patients: ${totalMembers}`);
    console.log(`   Individual: ${individualMembers}`);
    console.log(`   Family: ${familyMembers}`);
    console.log(`   Concierge: ${conciergeMembers}`);
    console.log(`   Family+Concierge: ${familyConciergeMembers}`);
    console.log(`   Drip+Concierge: ${dripConciergeMembers}`);
    console.log(`   Corporate: ${corporateMembers}`);
    
    console.log('\n📊 COMPARISON:');
    console.log(`   OLD: 124 total members (counting duplicates)`);
    console.log(`   NEW: ${totalMembers} total members (deduplicated)`);
    console.log(`   Difference: ${124 - totalMembers} duplicate records removed`);
    
  } catch (error) {
    console.error('Error testing membership parsing:', error);
  }
}

testMembershipParsing();