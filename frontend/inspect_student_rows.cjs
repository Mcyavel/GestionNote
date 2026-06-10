const XLSX = require('xlsx');
const path = require('path');

const filePath = path.join(__dirname, '../import note/M1MIAGEAIX - SUSem1 - Export APOGEE modif. jury v3.xlsm');
console.log('Reading file:', filePath);

const wb = XLSX.readFile(filePath);
const sheetName = wb.SheetNames[0];
const ws = wb.Sheets[sheetName];

const data = XLSX.utils.sheet_to_json(ws, { header: 1 });

console.log('Total rows:', data.length);

// Let's find where student rows start
let studentStartIdx = -1;
for (let i = 0; i < data.length; i++) {
    const row = data[i];
    if (row && row[0] === 'Numéro' && row[1] === 'Nom') {
        studentStartIdx = i + 1;
        break;
    }
}

console.log('Student rows start at index:', studentStartIdx);
if (studentStartIdx !== -1) {
    // Print column headers from Row 13 (which contains Code - Name)
    const headers = data[13] || [];
    const typeRow = data[12] || [];
    
    // Print 3 students
    for (let i = studentStartIdx; i < studentStartIdx + 3; i++) {
        const row = data[i];
        if (!row) continue;
        console.log(`\n--- Student Row ${i}: ${row[0]} - ${row[1]} ${row[2]} ---`);
        for (let col = 0; col < row.length; col++) {
            if (row[col] !== undefined && row[col] !== '') {
                const header = headers[col] || `Col ${col}`;
                const type = typeRow[col] || '';
                console.log(`  Col ${col} (${type} | ${header}): ${row[col]}`);
            }
        }
    }
}
