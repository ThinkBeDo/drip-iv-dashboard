// Test revenue separation logic
const fs = require('fs');

// Parse MHTML file
function parseMHTMLFile(filePath) {
  const fileContent = fs.readFileSync(filePath, 'utf8');
  
  if (!fileContent.includes('MIME-Version:')) {
    return null;
  }
  
  const parts = fileContent.split(/--[\w-]+/);
  
  for (let i = 0; i < parts.length; i++) {
    if (parts[i].includes('<table') && parts[i].includes('<tr')) {
      let tableHtml = parts[i];
      tableHtml = tableHtml.replace(/=3D/g, '=');
      tableHtml = tableHtml.replace(/=\r?\n/g, '');
      
      const rowMatches = tableHtml.match(/<tr[^>]*>[\s\S]*?<\/tr>/g);
      if (!rowMatches) return null;
      
      const data = [];
      let previousRowData = {};
      
      for (let rowIndex = 1; rowIndex < rowMatches.length; rowIndex++) {
        const row = rowMatches[rowIndex];
        const cellMatches = row.match(/<t[dh][^>]*>[\s\S]*?<\/t[dh]>/g);
        
        if (!cellMatches) continue;
        
        const values = cellMatches.map(cell => {
          let text = cell
            .replace(/<[^>]+>/g, '')
            .replace(/&nbsp;/g, ' ')
            .replace(/&amp;/g, '&')
            .replace(/&#\d+;/g, '')
            .trim();
          return text;
        });
        
        const rowData = {};
        
        if (values.length === 16) {
          rowData['Date'] = values[1];
          rowData['Patient'] = values[3];
          rowData['Charge Desc'] = values[8];
          rowData['Calculated Payment (Line)'] = values[13];
        } else if (values.length === 13) {
          rowData['Date'] = previousRowData['Date'];
          rowData['Patient'] = values[0];
          rowData['Charge Desc'] = values[5];
          rowData['Calculated Payment (Line)'] = values[10];
        } else if (values.length === 15) {
          rowData['Date'] = values[0];
          rowData['Patient'] = values[2];
          rowData['Charge Desc'] = values[7];
          rowData['Calculated Payment (Line)'] = values[12];
        }
        
        if (rowData['Date']) {
          previousRowData = { ...rowData };
        }
        
        if (rowData['Calculated Payment (Line)']) {
          data.push(rowData);
        }
      }
      
      return data;
    }
  }
  
  return null;
}

// Clean currency
function cleanCurrency(value) {
  if (!value) return 0;
  const cleaned = value.toString().replace(/[$,]/g, '');
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

// Categorize services
function getServiceCategory(chargeDesc) {
  const lowerDesc = chargeDesc.toLowerCase();
  
  if (lowerDesc.includes('membership')) return 'membership';
  if (lowerDesc.includes('consultation') || lowerDesc.includes('hormone')) return 'consultation';
  if (lowerDesc.includes('semaglutide') || lowerDesc.includes('tirzepatide')) return 'weight_loss';
  if (lowerDesc.includes(' iv') || lowerDesc.includes('nad') || lowerDesc.includes('infusion')) return 'iv_therapy';
  if (lowerDesc.includes('b12') && lowerDesc.includes('injection')) return 'other_injection';
  return 'other';
}

// Process the file
const data = parseMHTMLFile('Patient Analysis (Charge Details & Payments) - V3  - With COGS.xls');

if (data) {
  console.log('Total rows:', data.length);
  
  // Categorize revenue
  const revenue = {
    iv_therapy: 0,
    weight_loss: 0,
    other_injection: 0,
    consultation: 0,
    membership: 0,
    other: 0
  };
  
  const services = {
    iv_therapy: [],
    weight_loss: [],
    consultation: []
  };
  
  data.forEach(row => {
    if (!row['Date'] || !row['Date'].includes('8/')) return; // Only August data
    
    const amount = cleanCurrency(row['Calculated Payment (Line)']);
    const category = getServiceCategory(row['Charge Desc']);
    
    revenue[category] += amount;
    
    if (category === 'iv_therapy' && services.iv_therapy.length < 3) {
      services.iv_therapy.push({ desc: row['Charge Desc'], amount });
    }
    if (category === 'weight_loss' && services.weight_loss.length < 3) {
      services.weight_loss.push({ desc: row['Charge Desc'], amount });
    }
    if (category === 'consultation' && services.consultation.length < 3) {
      services.consultation.push({ desc: row['Charge Desc'], amount });
    }
  });
  
  console.log('\n=== REVENUE BY CATEGORY ===');
  console.log('IV Therapy:      $' + revenue.iv_therapy.toFixed(2));
  console.log('Weight Loss:     $' + revenue.weight_loss.toFixed(2));
  console.log('Other Injection: $' + revenue.other_injection.toFixed(2));
  console.log('Consultation:    $' + revenue.consultation.toFixed(2));
  console.log('Membership:      $' + revenue.membership.toFixed(2));
  console.log('Other:           $' + revenue.other.toFixed(2));
  console.log('----------------------------');
  console.log('TOTAL:           $' + Object.values(revenue).reduce((a, b) => a + b, 0).toFixed(2));
  
  console.log('\n=== SAMPLE SERVICES ===');
  console.log('\nIV Therapy:');
  services.iv_therapy.forEach(s => console.log('  - ' + s.desc + ': $' + s.amount.toFixed(2)));
  console.log('\nWeight Loss:');
  services.weight_loss.forEach(s => console.log('  - ' + s.desc + ': $' + s.amount.toFixed(2)));
  console.log('\nConsultations:');
  services.consultation.forEach(s => console.log('  - ' + s.desc + ': $' + s.amount.toFixed(2)));
}