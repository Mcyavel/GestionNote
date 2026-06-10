const XLSX = require('../frontend/node_modules/xlsx');
const path = require('path');

// Normalization functions
const normalizeString = (str) => {
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
};

const getSortedTokens = (nom, prenom) => {
  const full = `${nom} ${prenom}`
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]/g, " ");
  const words = full.split(/\s+/).filter(w => w.length > 0);
  words.sort();
  return words.join("|");
};

async function runTest() {
  console.log("=== RUNNING COMPARATOR INTEGRATION TEST ===");

  // 1. Fetch Curriculum list to find year ID
  const curriculumUrl = "http://127.0.0.1/www/Miage_Noteold/api/curriculum";
  console.log("Fetching years from:", curriculumUrl);
  const yearsRes = await fetch(curriculumUrl);
  const yearsData = await yearsRes.json();
  
  if (!yearsData.success || yearsData.data.length === 0) {
    console.error("No academic years found in database.");
    process.exit(1);
  }

  // Find M1 AIX year ID (usually containing 'aix')
  const m1AixYear = yearsData.data.find(y => y.nom.toLowerCase().includes("aix")) || yearsData.data[0];
  const yearId = m1AixYear.id;
  console.log(`Using Year ID: ${yearId} (${m1AixYear.nom})`);

  // 2. Fetch global ledger for this year
  const ledgerUrl = `http://127.0.0.1/www/Miage_Noteold/api/stats?action=global_ledger&annee_id=${yearId}`;
  console.log("Fetching ledger from:", ledgerUrl);
  const ledgerRes = await fetch(ledgerUrl);
  const ledgerResult = await ledgerRes.json();

  if (!ledgerResult.success) {
    console.error("Failed to fetch ledger:", ledgerResult.error);
    process.exit(1);
  }
  const ledgerData = ledgerResult.data;
  console.log(`Fetched ${ledgerData.students.length} students from local DB.`);

  // 3. Read Excel file
  const filePath = path.join(__dirname, '../import note/M1MIAGEAIX - SUSem1 - Export APOGEE modif. jury v3.xlsm');
  console.log("Reading Apogée Excel file from:", filePath);
  const wb = XLSX.readFile(filePath);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rawData = XLSX.utils.sheet_to_json(ws, { header: 1 });

  // 4. Identify structure rows
  let typeRowIdx = -1;
  let studentHeaderIdx = -1;
  for (let i = 0; i < rawData.length; i++) {
    const row = rawData[i];
    if (!row) continue;
    if (row[0] && String(row[0]).trim() === 'Type Rés.') typeRowIdx = i;
    if (row[0] && row[1] && String(row[0]).trim() === 'Numéro' && String(row[1]).trim() === 'Nom') studentHeaderIdx = i;
  }

  if (typeRowIdx === -1 || studentHeaderIdx === -1) {
    console.error("Invalid Apogee file structure in test.");
    process.exit(1);
  }

  const typeRow = rawData[typeRowIdx];
  const elpRow = rawData[typeRowIdx + 1];

  // Map columns to DB elements
  const dbBccs = [];
  const dbUes = [];
  ledgerData.structure.bcc.forEach(b => {
    dbBccs.push(b);
    b.ue.forEach(u => {
      dbUes.push(u);
    });
  });

  const columnMappings = [];
  for (let col = 4; col < Math.max(typeRow.length, elpRow.length); col++) {
    if (typeRow[col] === 'N') {
      const headerStr = String(elpRow[col] || '');
      const match = headerStr.match(/^([A-Z0-9]+)\s*-\s*(.*)$/);
      const code = match ? match[1] : '';
      const name = match ? match[2].trim() : headerStr.trim();
      
      let targetType = 'ignore';
      let targetId = null;
      let targetName = 'Ignoré';

      const nameNorm = normalizeString(name);
      
      // Match BCC
      if (nameNorm.includes('bcc')) {
        const numMatch = name.match(/\d+/);
        if (numMatch) {
          const num = numMatch[0];
          const matchedBcc = dbBccs.find(b => normalizeString(b.nom).includes(num));
          if (matchedBcc) {
            targetType = 'bcc';
            targetId = matchedBcc.id;
            targetName = `[BCC] ${matchedBcc.nom}`;
          }
        }
      } else {
        // Match UE
        const matchedUe = dbUes.find(u => normalizeString(u.nom) === nameNorm || normalizeString(u.nom).includes(nameNorm));
        if (matchedUe) {
          targetType = 'ue';
          targetId = matchedUe.id;
          targetName = `[UE] ${matchedUe.nom}`;
        }
      }

      columnMappings.push({
        excelIndex: col,
        excelCode: code,
        excelName: name,
        targetType,
        targetId,
        targetName
      });
    }
  }

  console.log(`Mapped ${columnMappings.filter(m => m.targetType !== 'ignore').length} note columns out of ${columnMappings.length} total note columns.`);

  // Parse Excel students
  const excelStudents = [];
  for (let i = studentHeaderIdx + 1; i < rawData.length; i++) {
    const row = rawData[i];
    if (row && row[0] && /^\d{8}$/.test(String(row[0]).trim())) {
      excelStudents.push(row);
    }
  }

  // Perform student matching and comparison
  const dbStudentsMapDirect = {};
  const dbStudentsMapTokens = {};
  ledgerData.students.forEach(s => {
    dbStudentsMapDirect[normalizeString(s.nom) + '|' + normalizeString(s.prenom || '')] = s;
    dbStudentsMapDirect[normalizeString(s.prenom || '') + '|' + normalizeString(s.nom)] = s;
    dbStudentsMapTokens[getSortedTokens(s.nom, s.prenom || '')] = s;
  });

  let comparedCount = 0;
  let discrepancies = [];

  excelStudents.forEach(row => {
    const num = String(row[0]).trim();
    const nom = String(row[1]).trim();
    const prenom = String(row[2]).trim();

    const keyDirect = normalizeString(nom) + '|' + normalizeString(prenom);
    const keyInverted = normalizeString(prenom) + '|' + normalizeString(nom);
    const keyTokens = getSortedTokens(nom, prenom);

    const matchedS = dbStudentsMapDirect[keyDirect] || 
                     dbStudentsMapDirect[keyInverted] || 
                     dbStudentsMapTokens[keyTokens];

    if (matchedS) {
      comparedCount++;
      // Compare mapped columns
      columnMappings.forEach(map => {
        if (map.targetType === 'ignore') return;
        
        const excelCell = row[map.excelIndex];
        let excelVal = 'null';
        if (excelCell !== undefined && excelCell !== null && excelCell !== '') {
          const str = String(excelCell).trim();
          if (['ABI', 'ABJ', 'DEF'].includes(str)) excelVal = str;
          else if (!isNaN(Number(str.replace(',', '.')))) excelVal = parseFloat(Number(str.replace(',', '.')).toFixed(3));
          else excelVal = str;
        }

        const appCell = matchedS.grades[map.targetType]?.[map.targetId];
        let appVal = 'null';
        if (appCell !== undefined && appCell !== null) {
          if (['ABI', 'ABJ', 'DEF'].includes(String(appCell))) appVal = String(appCell);
          else if (!isNaN(Number(appCell))) appVal = parseFloat(Number(appCell).toFixed(3));
          else appVal = String(appCell);
        }

        let isMismatch = false;
        let diff = null;

        if (typeof excelVal === 'number' && typeof appVal === 'number') {
          diff = parseFloat((appVal - excelVal).toFixed(3));
          if (Math.abs(diff) > 0.01) isMismatch = true;
        } else if (excelVal !== appVal) {
          if (!(excelVal === 'null' && appVal === 'null')) {
            isMismatch = true;
          }
        }

        if (isMismatch) {
          discrepancies.push({
            student: `${matchedS.prenom} ${matchedS.nom}`,
            element: map.excelName,
            type: map.targetType,
            excelVal,
            appVal,
            diff
          });
        }
      });
    }
  });

  console.log(`Compared ${comparedCount} matched students.`);
  console.log(`Found ${discrepancies.length} discrepancy records.`);
  if (discrepancies.length > 0) {
    console.log("Sample discrepancies:");
    discrepancies.slice(0, 5).forEach(d => {
      console.log(`  - ${d.student} | ${d.element} (${d.type}): Apogée = ${d.excelVal}, App = ${d.appVal}, Diff = ${d.diff}`);
    });
  } else {
    console.log("✓ Success: No discrepancies found between matching elements.");
  }
  
  console.log("=== INTEGRATION TEST COMPLETE ===");
}

runTest().catch(console.error);
