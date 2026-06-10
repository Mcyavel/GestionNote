const XLSX = require('xlsx');
const path = require('path');

const filePath = path.join(__dirname, '../import note/M1MIAGEAIX - SUSem1 - Export APOGEE modif. jury v3.xlsm');
console.log('Reading file:', filePath);

const wb = XLSX.readFile(filePath);
const sheetName = wb.SheetNames[0];
const ws = wb.Sheets[sheetName];

const data = XLSX.utils.sheet_to_json(ws, { header: 1 });

console.log('Total rows:', data.length);

console.log('=== ROWS 5 to 15 (columns 0 to 35) ===');
for (let i = 5; i < Math.min(16, data.length); i++) {
    if (data[i]) {
        console.log(`Row ${i}:`, data[i].slice(0, 35));
    }
}

