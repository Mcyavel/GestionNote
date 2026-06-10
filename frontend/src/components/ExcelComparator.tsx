import React, { useState, useEffect, useCallback } from 'react';
import * as XLSX from 'xlsx';
import { 
  Upload, AlertTriangle, CheckCircle2, XCircle, Search, RefreshCw, 
  FileSpreadsheet, ArrowRight, GraduationCap, Info, GitCompare,
  ChevronUp, ChevronDown
} from 'lucide-react';

interface ExcelComparatorProps {}

interface Annee {
  id: number;
  nom: string;
  is_maquette: number;
  archived: number;
  maquette_id?: number | null;
  semestres?: { id: number; nom: string }[];
}

interface ColumnMapping {
  excelIndex: number;
  excelHeader: string;
  excelCode: string;
  excelName: string;
  targetType: 'bcc' | 'ue' | 'ecue' | 'ignore';
  targetId: number | null;
  targetName: string;
}

interface Discrepancy {
  studentName: string;
  studentNum: string;
  elementCode: string;
  elementName: string;
  elementType: 'bcc' | 'ue' | 'ecue';
  excelVal: string | number;
  appVal: string | number;
  diff: number | null;
  isStatusMismatch: boolean;
}

interface MissingStudent {
  source: 'excel' | 'app';
  name: string;
  num?: string;
  email?: string;
}

const ExcelComparator: React.FC<ExcelComparatorProps> = () => {
  const [annees, setAnnees] = useState<Annee[]>([]);
  const [selectedAnnee, setSelectedAnnee] = useState<number | null>(null);
  const [ledgerData, setLedgerData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Excel state
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileData, setFileData] = useState<any[][]>([]);
  const [excelStudents, setExcelStudents] = useState<any[]>([]);
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Column matching & Comparison settings
  const [mappings, setMappings] = useState<ColumnMapping[]>([]);
  const [compareMode, setCompareMode] = useState<'raw' | 'final'>('final');
  
  // Results
  const [discrepancies, setDiscrepancies] = useState<Discrepancy[]>([]);
  const [missingStudents, setMissingStudents] = useState<MissingStudent[]>([]);
  const [comparedStudentsCount, setComparedStudentsCount] = useState(0);
  
  // Filters & Search
  const [filterType, setFilterType] = useState<'all' | 'errors' | 'missing_excel' | 'missing_app'>('errors');
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedStudent, setExpandedStudent] = useState<string | null>(null);
  const [studentDetails, setStudentDetails] = useState<Record<string, {
    elements: {
      name: string;
      code: string;
      type: 'bcc' | 'ue' | 'ecue';
      excelVal: string | number;
      appVal: string | number;
      diff: number | null;
      status: 'ok' | 'mismatch' | 'ignored';
    }[];
  }>>({});

  // Fetch years on mount
  useEffect(() => {
    fetch('/api/curriculum')
      .then(res => res.json())
      .then(res => {
        if (res.success && res.data.length > 0) {
          setAnnees(res.data);
          const activePromos = res.data.filter((a: any) => a.is_maquette === 0 && !a.archived);
          if (activePromos.length > 0) {
            setSelectedAnnee(activePromos[0].id);
          } else {
            setSelectedAnnee(res.data[0].id);
          }
        }
      })
      .catch(() => setErrorMsg("Impossible de charger les maquettes de formation"));
  }, []);

  // Fetch Ledger data when year changes
  const fetchLedger = useCallback(async () => {
    if (!selectedAnnee) return;
    setLoading(true);
    setErrorMsg(null);
    try {
      const response = await fetch(`/api/stats?action=global_ledger&annee_id=${selectedAnnee}`);
      const result = await response.json();
      if (result.success) {
        setLedgerData(result.data);
      } else {
        setErrorMsg("Erreur lors de la récupération des données de la promotion: " + result.error);
      }
    } catch (e) {
      setErrorMsg("Erreur réseau lors du chargement du Grand Livre");
    } finally {
      setLoading(false);
    }
  }, [selectedAnnee]);

  useEffect(() => {
    fetchLedger();
  }, [selectedAnnee, fetchLedger]);

  // Helper for normalizations
  const normalizeString = (str: string): string => {
    return str
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]/g, "");
  };

  const getSortedTokens = (nom: string, prenom: string): string => {
    const full = `${nom} ${prenom}`
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9 ]/g, " ");
    const words = full.split(/\s+/).filter(w => w.length > 0);
    words.sort();
    return words.join("|");
  };



  // Parse Excel File
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setLoading(true);
    setErrorMsg(null);

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        
        const data = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];
        if (data.length < 10) {
          throw new Error("Le fichier Excel semble trop court ou vide.");
        }
        
        setFileData(data);
        processExcelStructure(data);
      } catch (err: any) {
        setErrorMsg("Erreur lors de la lecture du fichier Excel : " + err.message);
        setLoading(false);
      }
    };
    reader.onerror = () => {
      setErrorMsg("Erreur de lecture du fichier.");
      setLoading(false);
    };
    reader.readAsBinaryString(file);
  };

  // Find structure in Excel raw rows
  const processExcelStructure = (data: any[][]) => {
    let typeRowIdx = -1;
    let studentHeaderIdx = -1;

    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      if (!row) continue;
      if (row[0] && String(row[0]).trim() === 'Type Rés.') {
        typeRowIdx = i;
      }
      if (row[0] && row[1] && String(row[0]).trim() === 'Numéro' && String(row[1]).trim() === 'Nom') {
        studentHeaderIdx = i;
      }
    }

    if (typeRowIdx === -1 || studentHeaderIdx === -1) {
      throw new Error("Structure de fichier Apogée invalide (lignes 'Type Rés.' ou 'Numéro/Nom' introuvables).");
    }

    const typeRow = data[typeRowIdx];
    const elpRow = data[typeRowIdx + 1];

    if (!typeRow || !elpRow) {
      throw new Error("Impossible de lire la ligne des matières (ELP).");
    }

    // Extract note columns ('N')
    const noteCols: ColumnMapping[] = [];
    const maxCols = Math.max(typeRow.length, elpRow.length);
    
    // Student list starts at studentHeaderIdx + 1
    const studentsList: any[] = [];
    for (let i = studentHeaderIdx + 1; i < data.length; i++) {
      const row = data[i];
      if (row && row[0] && /^\d{8}$/.test(String(row[0]).trim())) {
        studentsList.push(row);
      }
    }
    setExcelStudents(studentsList);

    for (let col = 4; col < maxCols; col++) {
      if (typeRow[col] === 'N') {
        const headerStr = String(elpRow[col] || '');
        const match = headerStr.match(/^([A-Z0-9]+)\s*-\s*(.*)$/);
        const code = match ? match[1] : '';
        const name = match ? match[2].trim() : headerStr.trim();

        noteCols.push({
          excelIndex: col,
          excelHeader: headerStr,
          excelCode: code,
          excelName: name,
          targetType: 'ignore',
          targetId: null,
          targetName: 'Ignoré'
        });
      }
    }

    if (noteCols.length === 0) {
      throw new Error("Aucune colonne de type note ('N') n'a été détectée.");
    }

    // Attempt Auto-matching
    if (ledgerData) {
      autoMatchColumns(noteCols);
    } else {
      setMappings(noteCols);
      setStep(2);
      setLoading(false);
    }
  };

  // Run automatic matching between noteCols and local curriculum elements
  const autoMatchColumns = (noteCols: ColumnMapping[]) => {
    if (!ledgerData) return;

    // Collect DB elements
    const dbBccs: any[] = [];
    const dbUes: any[] = [];

    ledgerData.structure.bcc.forEach((bcc: any) => {
      dbBccs.push(bcc);
      bcc.ue.forEach((ue: any) => {
        dbUes.push(ue);
      });
    });

    const matchedCols = noteCols.map(col => {
      const nameNorm = normalizeString(col.excelName);
      const codeNorm = normalizeString(col.excelCode);

      // 1. Try to Match BCC
      if (nameNorm.includes('bcc') || codeNorm.includes('bcc')) {
        const matchDigits = col.excelName.match(/\d+/);
        if (matchDigits) {
          const num = matchDigits[0];
          const matchedBcc = dbBccs.find(b => normalizeString(b.nom).includes(num));
          if (matchedBcc) {
            return {
              ...col,
              targetType: 'bcc' as const,
              targetId: matchedBcc.id,
              targetName: `[BCC] ${matchedBcc.nom}`
            };
          }
        }
      }

      // 2. Try to Match UE
      let bestUe: any = null;
      let bestUeScore = 999;
      for (const ue of dbUes) {
        const dbUeNorm = normalizeString(ue.nom);
        if (dbUeNorm === nameNorm) {
          bestUe = ue;
          bestUeScore = 0;
          break;
        }
        if (dbUeNorm.includes(nameNorm) || nameNorm.includes(dbUeNorm)) {
          bestUe = ue;
          bestUeScore = 1;
          continue;
        }
        // Token match for UE
        const elpTokens = nameNorm.split(/[^a-z0-9]/).filter(t => t.length > 2);
        const ueTokens = dbUeNorm.split(/[^a-z0-9]/).filter(t => t.length > 2);
        let matches = 0;
        elpTokens.forEach(et => {
          if (ueTokens.some(ut => ut.includes(et) || et.includes(ut))) {
            matches++;
          }
        });
        if (elpTokens.length > 0 && matches >= elpTokens.length * 0.5) {
          bestUe = ue;
          bestUeScore = 2;
          continue;
        }
      }

      if (bestUe && bestUeScore < 3) {
        return {
          ...col,
          targetType: 'ue' as const,
          targetId: bestUe.id,
          targetName: `[UE] ${bestUe.nom}`
        };
      }

      // Default to ignore if not matched
      return col;
    });

    setMappings(matchedCols);
    setStep(2);
    setLoading(false);
  };

  // Run auto-match when ledger data gets fetched if we are in Step 1/2 with loaded file
  useEffect(() => {
    if (ledgerData && fileData.length > 0 && step === 1) {
      processExcelStructure(fileData);
    }
  }, [ledgerData]);

  // Handle manual adjustment of mappings
  const updateMapping = (index: number, targetType: 'bcc' | 'ue' | 'ecue' | 'ignore', targetId: number | null) => {
    setMappings(prev => prev.map((m, idx) => {
      if (idx !== index) return m;
      if (targetType === 'ignore') {
        return { ...m, targetType, targetId: null, targetName: 'Ignoré' };
      }
      // find name
      let targetName = 'Inconnu';
      if (ledgerData) {
        if (targetType === 'bcc') {
          const item = ledgerData.structure.bcc.find((b: any) => b.id === targetId);
          if (item) targetName = `[BCC] ${item.nom}`;
        } else if (targetType === 'ue') {
          for (const b of ledgerData.structure.bcc) {
            const item = b.ue.find((u: any) => u.id === targetId);
            if (item) {
              targetName = `[UE] ${item.nom}`;
              break;
            }
          }
        } else if (targetType === 'ecue') {
          for (const b of ledgerData.structure.bcc) {
            for (const u of b.ue) {
              const item = u.ecue.find((e: any) => e.id === targetId);
              if (item) {
                targetName = `[ECUE] ${item.nom}`;
                break;
              }
            }
          }
        }
      }
      return { ...m, targetType, targetId, targetName };
    }));
  };

  // Run Comparison
  const runComparison = () => {
    if (!ledgerData || excelStudents.length === 0) return;

    setLoading(true);
    setErrorMsg(null);

    const activeMappings = mappings.filter(m => m.targetType !== 'ignore' && m.targetId !== null);
    
    // Index DB students for fast lookup
    const dbStudents = ledgerData.students;
    const dbStudentsMapDirect: Record<string, any> = {};
    const dbStudentsMapTokens: Record<string, any> = {};
    const dbStudentsMapLastName: Record<string, any> = {};

    dbStudents.forEach((s: any) => {
      const directKey = normalizeString(s.nom) + '|' + normalizeString(s.prenom || '');
      dbStudentsMapDirect[directKey] = s;

      const invertedKey = normalizeString(s.prenom || '') + '|' + normalizeString(s.nom);
      dbStudentsMapDirect[invertedKey] = s;

      const tokensKey = getSortedTokens(s.nom, s.prenom || '');
      dbStudentsMapTokens[tokensKey] = s;

      const lastNameKey = normalizeString(s.nom);
      dbStudentsMapLastName[lastNameKey] = s;
    });

    const discResult: Discrepancy[] = [];
    const missingInDb: MissingStudent[] = [];
    const comparedDbStudentIds = new Set<number>();
    
    const detailsMap: Record<string, any> = {};

    // 1. Process Excel Students
    excelStudents.forEach(row => {
      const numEtudiant = String(row[0] || '').trim();
      const nom = String(row[1] || '').trim();
      const prenom = String(row[2] || '').trim();

      const keyDirect = normalizeString(nom) + '|' + normalizeString(prenom);
      const keyInverted = normalizeString(prenom) + '|' + normalizeString(nom);
      const keyTokens = getSortedTokens(nom, prenom);

      let matchedS = dbStudentsMapDirect[keyDirect] || 
                     dbStudentsMapDirect[keyInverted] || 
                     dbStudentsMapTokens[keyTokens];

      if (!matchedS) {
        // Fallback: match by last name if unique
        const lastName = normalizeString(nom);
        const matches = dbStudents.filter((s: any) => normalizeString(s.nom) === lastName);
        if (matches.length === 1) {
          matchedS = matches[0];
        }
      }

      const studName = `${nom} ${prenom}`;

      if (!matchedS) {
        missingInDb.push({
          source: 'excel',
          name: studName,
          num: numEtudiant
        });
        return;
      }

      // Mark matched in DB
      comparedDbStudentIds.add(matchedS.id);
      
      const detailsList: any[] = [];

      // Compare mapped columns
      activeMappings.forEach(map => {
        const excelCell = row[map.excelIndex];
        let excelVal: string | number = '';
        if (excelCell !== undefined && excelCell !== null && excelCell !== '') {
          const cellStr = String(excelCell).trim();
          if (['ABI', 'ABJ', 'DEF'].includes(cellStr)) {
            excelVal = cellStr;
          } else {
            const cleanNum = cellStr.replace(',', '.');
            if (!isNaN(Number(cleanNum))) {
              excelVal = parseFloat(Number(cleanNum).toFixed(3));
            } else {
              excelVal = cellStr;
            }
          }
        } else {
          excelVal = 'null';
        }

        // Get App Val
        const type = map.targetType;
        const id = map.targetId!;
        const studentGrades = compareMode === 'final' ? matchedS.grades : matchedS.raw_grades;
        const appCell = studentGrades[type]?.[id];

        let appVal: string | number = '';
        if (appCell !== undefined && appCell !== null) {
          if (['ABI', 'ABJ', 'DEF'].includes(String(appCell))) {
            appVal = String(appCell);
          } else if (!isNaN(Number(appCell))) {
            appVal = parseFloat(Number(appCell).toFixed(3));
          } else {
            appVal = String(appCell);
          }
        } else {
          appVal = 'null';
        }

        // Check difference
        let isMismatch = false;
        let diff: number | null = null;
        let isStatusMismatch = false;

        if (typeof excelVal === 'number' && typeof appVal === 'number') {
          diff = parseFloat((appVal - excelVal).toFixed(3));
          if (Math.abs(diff) > 0.01) {
            isMismatch = true;
          }
        } else if (excelVal !== appVal) {
          // One is number, other is status, or different statuses
          // Note: if excel has 'null' and app has 'null', they match.
          // Note: if student didn't follow an option, it might be null in Excel and missing in app (null).
          if (!(excelVal === 'null' && appVal === 'null')) {
            isMismatch = true;
            isStatusMismatch = true;
          }
        }

        if (isMismatch) {
          discResult.push({
            studentName: `${matchedS.prenom} ${matchedS.nom}`,
            studentNum: numEtudiant,
            elementCode: map.excelCode,
            elementName: map.excelName,
            elementType: map.targetType as any,
            excelVal,
            appVal,
            diff,
            isStatusMismatch
          });
        }

        detailsList.push({
          name: map.excelName,
          code: map.excelCode,
          type: map.targetType,
          excelVal,
          appVal,
          diff,
          status: isMismatch ? 'mismatch' : 'ok'
        });
      });

      detailsMap[`${matchedS.prenom} ${matchedS.nom}`] = {
        elements: detailsList
      };
    });

    // 2. Identify students in DB but not in Excel
    const missingInExcel: MissingStudent[] = [];
    dbStudents.forEach((s: any) => {
      if (!comparedDbStudentIds.has(s.id)) {
        missingInExcel.push({
          source: 'app',
          name: `${s.prenom} ${s.nom}`,
          email: s.email
        });
      }
    });

    setComparedStudentsCount(comparedDbStudentIds.size);
    setDiscrepancies(discResult);
    setMissingStudents([...missingInDb, ...missingInExcel]);
    setStudentDetails(detailsMap);
    setStep(3);
    setLoading(false);
  };

  // Re-run comparison if compareMode changes
  useEffect(() => {
    if (step === 3) {
      runComparison();
    }
  }, [compareMode]);

  // Reset comparator
  const handleReset = () => {
    setFileName(null);
    setFileData([]);
    setExcelStudents([]);
    setMappings([]);
    setDiscrepancies([]);
    setMissingStudents([]);
    setStudentDetails({});
    setStep(1);
    setErrorMsg(null);
  };

  // Filter lists based on options
  const getFilteredData = () => {
    let result = discrepancies;
    
    // Search filter
    if (searchTerm) {
      const searchNorm = normalizeString(searchTerm);
      result = result.filter(d => 
        normalizeString(d.studentName).includes(searchNorm) || 
        normalizeString(d.studentNum).includes(searchNorm) ||
        normalizeString(d.elementName).includes(searchNorm)
      );
    }
    return result;
  };

  const currentYearName = annees.find(a => a.id === selectedAnnee)?.nom || 'Formation';

  return (
    <div className="h-full flex flex-col gap-6 p-1">
      {/* Title / Action bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white/5 p-4 rounded-2xl border border-white/10 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-amber-500/20 text-amber-400 rounded-xl flex items-center justify-center shadow-lg border border-amber-500/30">
            <GitCompare className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white leading-tight">Comparateur de calculs Apogée</h2>
            <p className="text-white/40 text-[10px] uppercase font-black tracking-wider">Audit de conformité académique</p>
          </div>
        </div>

        {/* Selected Year selection */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <GraduationCap className="w-4 h-4 text-white/30" />
            <select 
              className="bg-transparent text-white font-bold text-sm outline-none cursor-pointer"
              value={selectedAnnee || ''}
              disabled={step > 1}
              onChange={e => setSelectedAnnee(Number(e.target.value))}
              data-help="Sélectionner la promotion de cours à comparer avec le fichier Excel"
            >
              {annees.filter(a => a.is_maquette === 0 && (!a.archived || a.id === selectedAnnee)).map(a => <option key={a.id} value={a.id} className="bg-slate-900">{a.nom}</option>)}
            </select>
          </div>
          {step > 1 && (
            <button 
              onClick={handleReset}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-black uppercase bg-white/10 text-white/80 hover:bg-white/20 transition-all"
              data-help="Annuler l'analyse actuelle et revenir au chargement de fichier"
            >
              <RefreshCw className="w-3 h-3" />
              Réinitialiser
            </button>
          )}
        </div>
      </div>

      {errorMsg && (
        <div className="bg-red-500/10 border border-red-500/20 text-red-300 p-4 rounded-2xl flex items-start gap-3 text-xs leading-relaxed">
          <XCircle className="w-5 h-5 text-red-400 shrink-0" />
          <div>
            <span className="font-bold block uppercase tracking-wide text-[10px] text-red-400">Erreur critique</span>
            {errorMsg}
          </div>
        </div>
      )}

      {/* Main workspace */}
      <div className="flex-1 bg-white/5 rounded-3xl border border-white/10 overflow-hidden flex flex-col shadow-2xl relative">
        
        {/* Step 1: Upload */}
        {step === 1 && (
          <div className="flex-1 flex flex-col justify-center items-center p-12 max-w-xl mx-auto text-center space-y-8">
            <div className="w-20 h-20 bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded-3xl flex items-center justify-center shadow-xl">
              <Upload className="w-10 h-10 animate-bounce" />
            </div>
            
            <div className="space-y-2">
              <h3 className="text-xl font-bold text-white">Comparer un fichier Apogée</h3>
              <p className="text-white/40 text-xs leading-relaxed">
                Importez le fichier Excel officiel d'Apogée (`.xlsx` ou `.xlsm`). L'outil fera une simulation de calcul des moyennes des UEs et BCCs pour identifier instantanément les divergences avec la base locale.
              </p>
            </div>

            <div 
              className="w-full flex flex-col items-center justify-center p-8 border-2 border-dashed border-white/10 rounded-3xl hover:border-amber-500/50 hover:bg-amber-500/5 transition-all cursor-pointer relative group"
              data-help="Glissez-déposez ou cliquez ici pour charger le fichier Excel d'export Apogée contenant les notes officielles"
            >
              <input 
                type="file" 
                accept=".xlsx,.xlsm" 
                onChange={handleFileUpload} 
                className="absolute inset-0 opacity-0 cursor-pointer" 
                disabled={loading}
              />
              <FileSpreadsheet className="h-8 w-8 text-white/30 group-hover:scale-110 transition-transform mb-3" />
              <p className="font-bold text-white/80 text-sm">Déposer ou cliquer pour charger le document Excel</p>
              <p className="text-[10px] text-white/30 mt-1 uppercase tracking-wider">Formats acceptés : xlsx, xlsm</p>
            </div>

            <div className="flex items-center gap-3 bg-blue-500/10 p-4 rounded-2xl border border-blue-500/20 max-w-md text-left">
              <Info className="w-5 h-5 text-blue-400 shrink-0" />
              <p className="text-[11px] text-blue-200 leading-relaxed">
                Le comparateur effectuera un appariement automatique. Vous pourrez vérifier et adapter les correspondances des colonnes à l'étape suivante avant de valider l'analyse.
              </p>
            </div>
          </div>
        )}

        {/* Step 2: Mapping Review */}
        {step === 2 && (
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="bg-white/5 p-4 border-b border-white/10 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-white">Validation du Mapping des Colonnes</h3>
                <p className="text-white/40 text-[10px] uppercase font-black">Fichier chargé : {fileName}</p>
              </div>
              <button 
                onClick={runComparison}
                className="bg-amber-500 hover:bg-amber-600 text-slate-950 px-6 py-2 rounded-xl text-xs font-black uppercase tracking-widest flex items-center gap-2 shadow-lg transition-all"
                data-help="Démarrer la comparaison ligne par ligne entre le fichier Excel et la base de données de l'application"
              >
                Lancer la comparaison
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-auto custom-scrollbar p-6 space-y-4">
              <div className="flex items-center gap-3 bg-amber-500/10 p-4 rounded-2xl border border-amber-500/20 text-xs text-amber-200 leading-relaxed">
                <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
                <p>
                  Vérifiez ci-dessous si le système a correctement associé chaque colonne de note Apogée (gauche) à l'élément correspondant dans la maquette locale (droite). Modifiez si nécessaire.
                </p>
              </div>

              <div className="bg-white/5 rounded-2xl border border-white/10 overflow-hidden">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-white/5 border-b border-white/10">
                      <th className="px-6 py-3 text-[10px] font-bold text-white/30 uppercase tracking-wider w-1/2">Colonne Excel (Apogée)</th>
                      <th className="px-6 py-3 text-[10px] font-bold text-white/30 uppercase tracking-wider w-1/2">Correspondance locale (Maquette {currentYearName})</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {mappings.map((map, index) => {
                      // Prepare dropdown options from curriculum structure
                      const options = [<option key="ignore" value="ignore" className="bg-slate-900">Ignorer cette colonne</option>];
                      
                      if (ledgerData) {
                        ledgerData.structure.bcc.forEach((b: any) => {
                          options.push(<option key={`bcc-${b.id}`} value={`bcc|${b.id}`} className="bg-slate-900">[BCC] {b.nom}</option>);
                          b.ue.forEach((u: any) => {
                            options.push(<option key={`ue-${u.id}`} value={`ue|${u.id}`} className="bg-slate-900">[UE] {u.nom}</option>);
                          });
                        });
                      }

                      const selectVal = map.targetType === 'ignore' ? 'ignore' : `${map.targetType}|${map.targetId}`;

                      return (
                        <tr key={index} className="hover:bg-white/5 transition-colors">
                          <td className="px-6 py-4">
                            <div className="flex flex-col">
                              <span className="text-xs font-bold text-white">{map.excelName}</span>
                              <span className="text-[9px] text-white/30 font-mono mt-0.5">{map.excelCode} (Idx: {map.excelIndex})</span>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <select 
                              className={`w-full max-w-md bg-slate-900 border text-xs rounded-xl px-3 py-2 outline-none transition-all cursor-pointer ${
                                map.targetType === 'ignore' ? 'border-white/10 text-white/40' : 'border-blue-500/40 text-blue-300 font-semibold'
                              }`}
                              value={selectVal}
                              onChange={(e) => {
                                const val = e.target.value;
                                if (val === 'ignore') {
                                  updateMapping(index, 'ignore', null);
                                } else {
                                  const [type, id] = val.split('|');
                                  updateMapping(index, type as any, Number(id));
                                }
                              }}
                              data-help="Associer cette colonne Excel Apogée à un BCC ou une UE de la maquette locale"
                            >
                              {options}
                            </select>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Step 3: Comparison View */}
        {step === 3 && (
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Top Toolbar */}
            <div className="bg-white/5 p-4 border-b border-white/10 flex flex-wrap justify-between items-center gap-4">
              <div className="flex items-center gap-6">
                <div>
                  <h3 className="text-sm font-bold text-white">Rapport d'audit de conformité</h3>
                  <p className="text-white/40 text-[9px] uppercase font-black">Matières mappées : {mappings.filter(m => m.targetType !== 'ignore').length} | Étudiants : {excelStudents.length}</p>
                </div>
                
                {/* Note Toggle */}
                <div className="flex bg-white/5 p-1 rounded-xl border border-white/5">
                  <button 
                    onClick={() => setCompareMode('final')}
                    className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${
                      compareMode === 'final' ? 'bg-amber-500 text-slate-950 shadow-lg' : 'text-white/30 hover:text-white/60'
                    }`}
                    data-help="Comparer avec les moyennes finales après application des décisions du jury"
                  >
                    Moyennes finales (Jury incl.)
                  </button>
                  <button 
                    onClick={() => setCompareMode('raw')}
                    className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${
                      compareMode === 'raw' ? 'bg-amber-500 text-slate-950 shadow-lg' : 'text-white/30 hover:text-white/60'
                    }`}
                    data-help="Comparer uniquement avec les notes brutes avant compensation ou décision de jury"
                  >
                    Notes brutes (avant jury)
                  </button>
                </div>
              </div>

              {/* Filters / Search */}
              <div className="flex items-center gap-4">
                <div className="relative">
                  <Search className="w-4 h-4 text-white/30 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input 
                    type="text"
                    placeholder="Rechercher étudiant..."
                    className="bg-slate-950 border border-white/10 rounded-xl pl-9 pr-4 py-1.5 text-xs text-white placeholder:text-white/20 w-44 outline-none focus:border-amber-500/50"
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    data-help="Rechercher un étudiant par son nom ou son numéro étudiant dans le rapport"
                  />
                </div>
                
                <div className="flex bg-white/5 p-1 rounded-xl border border-white/5 text-[9px] font-black uppercase tracking-widest">
                  <button 
                    onClick={() => setFilterType('errors')}
                    className={`px-3 py-1.5 rounded-lg transition-all ${filterType === 'errors' ? 'bg-red-600/30 text-red-300 border border-red-500/20' : 'text-white/30 hover:text-white/60'}`}
                    data-help="Filtrer pour n'afficher que les étudiants présentant des différences de notes"
                  >
                    Divergences ({discrepancies.length})
                  </button>
                  <button 
                    onClick={() => setFilterType('all')}
                    className={`px-3 py-1.5 rounded-lg transition-all ${filterType === 'all' ? 'bg-blue-600/30 text-blue-300 border border-blue-500/20' : 'text-white/30 hover:text-white/60'}`}
                    data-help="Afficher tous les étudiants comparés"
                  >
                    Tous les étudiants ({comparedStudentsCount})
                  </button>
                  <button 
                    onClick={() => setFilterType('missing_excel')}
                    className={`px-3 py-1.5 rounded-lg transition-all ${filterType === 'missing_excel' ? 'bg-orange-600/30 text-orange-300 border border-orange-500/20' : 'text-white/30 hover:text-white/60'}`}
                    data-help="Afficher les étudiants présents dans l'application mais absents du fichier Excel"
                  >
                    Absents Apogée ({missingStudents.filter(s => s.source === 'app').length})
                  </button>
                  <button 
                    onClick={() => setFilterType('missing_app')}
                    className={`px-3 py-1.5 rounded-lg transition-all ${filterType === 'missing_app' ? 'bg-purple-600/30 text-purple-300 border border-purple-500/20' : 'text-white/30 hover:text-white/60'}`}
                    data-help="Afficher les étudiants présents dans le fichier Excel mais absents de l'application"
                  >
                    Absents App ({missingStudents.filter(s => s.source === 'excel').length})
                  </button>
                </div>
              </div>
            </div>

            {/* Content list */}
            <div className="flex-1 overflow-auto custom-scrollbar p-6">
              {/* Divergences list */}
              {filterType === 'errors' && (
                <div className="space-y-4">
                  {discrepancies.length === 0 ? (
                    <div className="p-12 text-center border border-dashed border-white/10 rounded-2xl">
                      <CheckCircle2 className="w-10 h-10 text-green-400 mx-auto mb-3" />
                      <h4 className="text-white font-bold text-sm">Zéro divergence détectée !</h4>
                      <p className="text-white/40 text-xs mt-1">Toutes les moyennes et notes du fichier Excel correspondent parfaitement à la base de données.</p>
                    </div>
                  ) : (
                    <div className="bg-white/5 rounded-2xl border border-white/10 overflow-hidden">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-white/5 border-b border-white/10 text-[9px] font-bold text-white/30 uppercase tracking-wider">
                            <th className="px-6 py-3 w-1/4">Étudiant</th>
                            <th className="px-6 py-3 w-1/4">Élément (BCC/UE/ECUE)</th>
                            <th className="px-6 py-3 text-center">Note Apogée</th>
                            <th className="px-6 py-3 text-center">Note Application</th>
                            <th className="px-6 py-3 text-center">Écart</th>
                            <th className="px-6 py-3 text-right">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5 text-xs">
                          {getFilteredData().map((d, index) => (
                            <tr key={index} className="hover:bg-white/5 transition-colors">
                              <td className="px-6 py-3">
                                <div className="flex flex-col">
                                  <span className="font-bold text-white">{d.studentName}</span>
                                  <span className="text-[9px] text-white/30">N° {d.studentNum}</span>
                                </div>
                              </td>
                              <td className="px-6 py-3">
                                <div className="flex flex-col">
                                  <span className="font-semibold text-white/80">{d.elementName}</span>
                                  <span className="text-[9px] text-white/40 uppercase font-mono">{d.elementType} • {d.elementCode}</span>
                                </div>
                              </td>
                              <td className="px-6 py-3 text-center font-semibold text-white">
                                {d.excelVal === 'null' ? '-' : d.excelVal}
                              </td>
                              <td className="px-6 py-3 text-center font-semibold text-white">
                                {d.appVal === 'null' ? '-' : d.appVal}
                              </td>
                              <td className="px-6 py-3 text-center">
                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                  d.isStatusMismatch 
                                    ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30' 
                                    : 'bg-red-500/20 text-red-300 border border-red-500/30'
                                }`}>
                                  {d.isStatusMismatch 
                                    ? 'Incohérence Statut' 
                                    : `${d.diff! > 0 ? '+' : ''}${d.diff}`}
                                </span>
                              </td>
                              <td className="px-6 py-3 text-right">
                                <button 
                                  onClick={() => setExpandedStudent(expandedStudent === d.studentName ? null : d.studentName)}
                                  className="text-[10px] font-bold text-blue-400 hover:text-blue-300"
                                >
                                  {expandedStudent === d.studentName ? 'Masquer Détails' : 'Voir Détails'}
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* All compared Students */}
              {filterType === 'all' && (
                <div className="space-y-3">
                  {excelStudents.map((row, index) => {
                    const nom = String(row[1] || '').trim();
                    const prenom = String(row[2] || '').trim();
                    const studName = `${prenom} ${nom}`;
                    const details = studentDetails[studName];
                    const discCount = discrepancies.filter(d => d.studentName === studName).length;

                    return (
                      <div key={index} className="bg-white/5 rounded-2xl border border-white/5 overflow-hidden transition-all">
                        <div 
                          className="p-4 flex items-center justify-between cursor-pointer hover:bg-white/5"
                          onClick={() => setExpandedStudent(expandedStudent === studName ? null : studName)}
                        >
                          <div className="flex items-center gap-3">
                            <span className="text-xs font-bold text-white">{studName}</span>
                            <span className="text-[10px] text-white/30 font-mono">N° {row[0]}</span>
                          </div>
                          <div className="flex items-center gap-3">
                            {discCount > 0 ? (
                              <span className="bg-red-500/20 text-red-300 text-[9px] font-bold px-2 py-0.5 rounded border border-red-500/20">
                                {discCount} Écart{discCount > 1 ? 's' : ''}
                              </span>
                            ) : (
                              <span className="bg-green-500/20 text-green-300 text-[9px] font-bold px-2 py-0.5 rounded border border-green-500/20">
                                Conforme
                              </span>
                            )}
                            <span className="text-white/20">
                              {expandedStudent === studName ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                            </span>
                          </div>
                        </div>

                        {expandedStudent === studName && details && (
                          <div className="px-4 pb-4 border-t border-white/5 bg-slate-950/20">
                            <table className="w-full text-left border-collapse text-xs mt-3">
                              <thead>
                                <tr className="text-[9px] font-bold text-white/20 uppercase tracking-wider border-b border-white/5">
                                  <th className="py-2">Matière / Code</th>
                                  <th className="py-2 text-center">Note Apogée</th>
                                  <th className="py-2 text-center">Note App</th>
                                  <th className="py-2 text-center">Écart</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-white/5">
                                {details.elements.map((el: any, elIdx: number) => (
                                  <tr key={elIdx} className="hover:bg-white/5 transition-colors">
                                    <td className="py-2">
                                      <div className="flex flex-col">
                                        <span className="font-medium text-white/80">{el.name}</span>
                                        <span className="text-[9px] text-white/30 uppercase font-mono">{el.type} • {el.code}</span>
                                      </div>
                                    </td>
                                    <td className="py-2 text-center text-white">{el.excelVal === 'null' ? '-' : el.excelVal}</td>
                                    <td className="py-2 text-center text-white">{el.appVal === 'null' ? '-' : el.appVal}</td>
                                    <td className="py-2 text-center">
                                      {el.status === 'mismatch' ? (
                                        <span className={`px-2 py-0.5 rounded text-[9px] font-bold ${
                                          el.diff === null 
                                            ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30' 
                                            : 'bg-red-500/20 text-red-300 border border-red-500/30'
                                        }`}>
                                          {el.diff === null ? 'Statut' : `${el.diff > 0 ? '+' : ''}${el.diff}`}
                                        </span>
                                      ) : (
                                        <span className="text-green-400 font-bold text-[10px]">✓</span>
                                      )}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Missing Excel Students (In database but not in uploaded sheet) */}
              {filterType === 'missing_excel' && (
                <div className="space-y-4">
                  {missingStudents.filter(s => s.source === 'app').length === 0 ? (
                    <div className="p-12 text-center border border-dashed border-white/10 rounded-2xl">
                      <CheckCircle2 className="w-10 h-10 text-green-400 mx-auto mb-3" />
                      <h4 className="text-white font-bold text-sm">Aucun étudiant manquant dans Apogée</h4>
                      <p className="text-white/40 text-xs mt-1">Tous les étudiants de la base sont bien présents dans le document Excel.</p>
                    </div>
                  ) : (
                    <div className="bg-white/5 rounded-2xl border border-white/10 overflow-hidden">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="bg-white/5 border-b border-white/10 text-[9px] font-bold text-white/30 uppercase tracking-wider">
                            <th className="px-6 py-3">Étudiant en Base locale</th>
                            <th className="px-6 py-3">Email</th>
                            <th className="px-6 py-3 text-right">Statut Audit</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                          {missingStudents.filter(s => s.source === 'app').map((s, index) => (
                            <tr key={index} className="hover:bg-white/5 transition-colors">
                              <td className="px-6 py-3 font-bold text-white">{s.name}</td>
                              <td className="px-6 py-3 text-white/50">{s.email || '-'}</td>
                              <td className="px-6 py-3 text-right">
                                <span className="bg-orange-500/20 text-orange-300 text-[9px] font-bold px-2 py-0.5 rounded border border-orange-500/20">
                                  Absent de l'Export Apogée
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* Missing App Students (In sheet but not in local database) */}
              {filterType === 'missing_app' && (
                <div className="space-y-4">
                  {missingStudents.filter(s => s.source === 'excel').length === 0 ? (
                    <div className="p-12 text-center border border-dashed border-white/10 rounded-2xl">
                      <CheckCircle2 className="w-10 h-10 text-green-400 mx-auto mb-3" />
                      <h4 className="text-white font-bold text-sm">Aucun étudiant manquant en base locale</h4>
                      <p className="text-white/40 text-xs mt-1">Tous les étudiants présents dans le fichier Excel existent bien dans l'application.</p>
                    </div>
                  ) : (
                    <div className="bg-white/5 rounded-2xl border border-white/10 overflow-hidden">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="bg-white/5 border-b border-white/10 text-[9px] font-bold text-white/30 uppercase tracking-wider">
                            <th className="px-6 py-3">Numéro Étudiant</th>
                            <th className="px-6 py-3">Nom / Prénom (Fichier Excel)</th>
                            <th className="px-6 py-3 text-right">Statut Audit</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                          {missingStudents.filter(s => s.source === 'excel').map((s, index) => (
                            <tr key={index} className="hover:bg-white/5 transition-colors">
                              <td className="px-6 py-3 font-mono font-semibold text-white/80">{s.num}</td>
                              <td className="px-6 py-3 font-bold text-white">{s.name}</td>
                              <td className="px-6 py-3 text-right">
                                <span className="bg-purple-500/20 text-purple-300 text-[9px] font-bold px-2 py-0.5 rounded border border-purple-500/20">
                                  Absent de la Base locale
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Sticky summary footer */}
            <div className="bg-slate-950 p-4 border-t border-white/10 flex flex-wrap items-center justify-between gap-4 text-xs">
              <div className="flex gap-6">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-blue-500"></span>
                  <span className="text-white/60">Étudiants comparés : <strong className="text-white">{comparedStudentsCount}</strong></span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`w-2.5 h-2.5 rounded-full ${discrepancies.length > 0 ? 'bg-red-500 animate-pulse' : 'bg-green-500'}`}></span>
                  <span className="text-white/60">Discordances : <strong className={discrepancies.length > 0 ? 'text-red-400' : 'text-green-400'}>{discrepancies.length}</strong></span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-orange-400"></span>
                  <span className="text-white/60">Absents Apogée : <strong className="text-white">{missingStudents.filter(s => s.source === 'app').length}</strong></span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-purple-400"></span>
                  <span className="text-white/60">Absents App : <strong className="text-white">{missingStudents.filter(s => s.source === 'excel').length}</strong></span>
                </div>
              </div>

              <div className="flex gap-3">
                <button 
                  onClick={() => setStep(2)}
                  className="bg-white/5 text-white border border-white/10 hover:bg-white/10 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all"
                >
                  Retour au Mapping
                </button>
                <button 
                  onClick={handleReset}
                  className="bg-white text-slate-950 hover:bg-slate-200 px-5 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider shadow-lg transition-all"
                >
                  Charger un autre fichier
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Global Loading overlay */}
        {loading && (
          <div className="absolute inset-0 bg-[#0f172a]/80 backdrop-blur-md flex flex-col justify-center items-center gap-4 z-50">
            <RefreshCw className="w-8 h-8 text-amber-500 animate-spin" />
            <span className="text-xs font-bold text-white/80 uppercase tracking-widest animate-pulse">Traitement de l'audit en cours...</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default ExcelComparator;
