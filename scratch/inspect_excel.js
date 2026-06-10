const XLSX = require('xlsx');
const path = require('path');

const filePath = path.join(__dirname, '../import note/M1MIAGEAIX - SUSem1 - Export APOGEE modif. jury v3.xlsm');
console.log('Reading file:', filePath);

const wb = XLSX.readFile(filePath);
const sheetName = wb.SheetNames[0];
const ws = wb.Sheets[sheetName];

const data = XLSX.utils.sheet_to_json(ws, { header: 1 });

console.log('Total rows:', data.length);

// Dump first 10 rows
console.log('=== FIRST 10 ROWS ===');
for (let i = 0; i < Math.min(10, data.length); i++) {
    console.log(`Row ${i}:`, data[i].slice(0, 15));
}
