import * as XLSX from 'xlsx';
import * as fs from 'fs';

const filePath = 'C:/xampp/htdocs/www/Miage_Noteold/import note/M1MIAGEMRS - SUSem1 - Export APOGEE modif. jury v3.xlsm';
const buf = fs.readFileSync(filePath);
const wb = XLSX.read(buf, { type: 'buffer' });
const ws = wb.Sheets[wb.SheetNames[0]];
const data = XLSX.utils.sheet_to_json(ws, { header: 1 });

console.log("Searching for status cells in MRS file...");
let found = 0;
for (let r = 17; r < data.length; r++) {
    const row = data[r] || [];
    row.forEach((cell, c) => {
        if (cell === 'ABI' || cell === 'ABJ' || cell === 'DEF') {
            console.log(`Found status '${cell}' at Row ${r}, Col ${c} (Student: ${row[1]} ${row[2]})`);
            found++;
        }
    });
}
console.log(`Search complete. Total status cells found: ${found}`);
