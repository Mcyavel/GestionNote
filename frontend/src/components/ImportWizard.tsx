import React, { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import Papa from 'papaparse';
import { Upload, ArrowRight, Check, AlertCircle, Table, FileSpreadsheet } from 'lucide-react';

interface ImportWizardProps {
  type: 'students' | 'grades';
  ecueId?: number | string | null;
  onComplete: () => void;
  onCancel: () => void;
}

const ImportWizard: React.FC<ImportWizardProps> = ({ type, ecueId, onComplete, onCancel }) => {
  const [step, setStep] = useState(1);
  const [importMode, setImportMode] = useState<'simple' | 'apogee'>(type === 'grades' && !ecueId ? 'apogee' : 'simple');
  const [fileData, setFileData] = useState<any[]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [annees, setAnnees] = useState<any[]>([]);

  // Définition des champs cibles
  const dbFields = type === 'students' ? [
    { id: 'nom', label: 'Nom complet (ou Nom)' },
    { id: 'prenom', label: 'Prénom (optionnel)' },
    { id: 'email', label: 'Adresse Email' },
    { id: 'annee_inscription', label: 'Année d\'inscription' },
    { id: 'annee_id', label: 'Formation (Année ID)' },
    { id: 'provenance', label: 'Provenance / Origine (optionnel)' },
  ] : [
    { id: 'nom', label: 'Nom de l\'étudiant' },
    { id: 'prenom', label: 'Prénom (optionnel)' },
    { id: 'email', label: 'Email (si dispo)' },
    { id: 'valeur', label: 'Note (sur 20)' },
    ...(!ecueId ? [{ id: 'ecue_id', label: 'ID de la matière' }] : [])
  ];

  useEffect(() => {
    fetch('/api/curriculum')
      .then(res => res.json())
      .then(res => { if (res.success) setAnnees(res.data); });
  }, []);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const extension = file.name.split('.').pop()?.toLowerCase();

    if (extension === 'csv') {
      Papa.parse(file, {
        header: importMode !== 'apogee',
        skipEmptyLines: true,
        complete: (results) => {
          setFileData(results.data);
          if (importMode === 'apogee') {
            setStep(3);
          } else {
            setColumns(Object.keys(results.data[0] || {}));
            setStep(2);
          }
        }
      });
    } else {
      const reader = new FileReader();
      reader.onload = (evt) => {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        
        if (importMode === 'apogee') {
          const data = XLSX.utils.sheet_to_json(ws, { header: 1 });
          setFileData(data);
          setStep(3);
        } else {
          const data = XLSX.utils.sheet_to_json(ws);
          setFileData(data);
          setColumns(Object.keys(data[0] || {}));
          setStep(2);
        }
      };
      reader.readAsBinaryString(file);
    }
  };

  const handleMappingChange = (fileCol: string, dbField: string) => {
    setMapping(prev => ({ ...prev, [fileCol]: dbField }));
  };

  const startImport = async (fixMismatched?: boolean) => {
    setLoading(true);
    try {
      const endpoint = type === 'students' ? '/api/students' : '/api/grades';
      const bodyPayload = importMode === 'apogee' ? {
        action: 'import_apogee',
        data: fileData,
        ...(fixMismatched !== undefined ? { fix_mismatched_years: fixMismatched } : {})
      } : {
        action: 'import',
        data: fileData,
        mapping: mapping,
        ...(ecueId ? { ecue_id: ecueId } : {})
      };

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyPayload)
      });
      
      const result = await response.json();
      if (result.success) {
        if (result.need_confirmation) {
          const names = result.mismatched_students.map((s: any) => `• ${s.prenom} ${s.nom} (Promotion actuelle : ${s.current_annee_nom})`).join('\n');
          const confirmFix = window.confirm(
            `Certains étudiants sont affectés à d'autres promotions dans la base de données :\n\n${names}\n\nVoulez-vous corriger automatiquement leur affectation vers "${result.target_annee_nom}" et importer leurs notes ?\n\n(Cliquez sur Annuler pour importer les autres étudiants en ignorant ceux-ci)`
          );
          startImport(confirmFix);
          return;
        }

        if (importMode === 'apogee' && result.mapping) {
          let summaryMsg = result.message + "\n\nCorrespondance des matières :\n";
          result.mapping.forEach((m: any) => {
            summaryMsg += `• ${m.column} ➔ ${m.ecue} ${m.matched ? '✅' : '❌'}\n`;
          });
          if (result.not_found && result.not_found.length > 0) {
            summaryMsg += `\nÉtudiants non trouvés ou ignorés (${result.not_found.length}) :\n` + result.not_found.join(', ');
          }
          alert(summaryMsg);
        } else {
          alert(result.message || "Importation réussie !");
        }
        onComplete();
      } else {
        alert("Erreur: " + result.error);
      }
    } catch (error) {
      alert("Erreur de communication avec le serveur");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white/5 border border-white/10 rounded-3xl shadow-2xl overflow-hidden max-w-4xl mx-auto backdrop-blur-xl">
      <div className="bg-white/5 p-6 border-b border-white/10 flex items-center justify-between">
        <div className="flex items-center gap-4">
            <div className={`p-3 rounded-2xl ${importMode === 'apogee' ? 'bg-amber-500/20 text-amber-400' : 'bg-blue-500/20 text-blue-400'}`}>
                {type === 'students' ? <Upload className="w-6 h-6" /> : <FileSpreadsheet className="w-6 h-6" />}
            </div>
            <div>
                <h3 className="text-xl font-bold text-white">Assistant {type === 'students' ? 'Étudiants' : 'Notes'}</h3>
                <p className="text-sm text-white/40">
                  {importMode === 'apogee' ? 'Importation automatique Apogée' : 'Identification par Email ou Nom/Prénom'}
                </p>
            </div>
        </div>
        <div className="flex gap-2">
          {[1, 2, 3].map(s => (
            <div key={s} className={`h-2 w-8 rounded-full ${step >= s ? (importMode === 'apogee' ? 'bg-amber-500' : 'bg-blue-500') : 'bg-white/10'}`} />
          ))}
        </div>
      </div>

      <div className="p-8">
        {step === 1 && (
          <div className="space-y-6">
            {type === 'grades' && (
              <div className="flex gap-4 p-1 bg-white/5 rounded-2xl border border-white/10">
                <button
                  type="button"
                  onClick={() => setImportMode('simple')}
                  className={`flex-1 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${importMode === 'simple' ? 'bg-blue-600 text-white shadow-lg' : 'text-white/40 hover:text-white'}`}
                >
                  Import Simple (Monocanal)
                </button>
                <button
                  type="button"
                  onClick={() => setImportMode('apogee')}
                  className={`flex-1 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${importMode === 'apogee' ? 'bg-amber-600 text-white shadow-lg' : 'text-white/40 hover:text-white'}`}
                >
                  Import Global Apogée (Multi-matières)
                </button>
              </div>
            )}
            
            <div className="flex flex-col items-center justify-center py-16 border-2 border-dashed border-white/10 rounded-3xl hover:border-blue-500/50 hover:bg-blue-500/5 transition-all cursor-pointer relative group">
              <input type="file" accept=".csv,.xlsx,.xls,.xlsm" onChange={handleFileUpload} className="absolute inset-0 opacity-0 cursor-pointer" />
              <div className={`${importMode === 'apogee' ? 'bg-amber-500/20 text-amber-400' : 'bg-blue-500/20 text-blue-400'} p-5 rounded-2xl mb-4 group-hover:scale-110 transition-transform`}>
                <Upload className="h-10 w-10" />
              </div>
              <p className="font-bold text-white/80">Cliquez ou déposez votre fichier ici</p>
              <p className="text-xs text-white/30 mt-2 uppercase">xlsx, xls, xlsm ou csv</p>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-6">
            <div className="flex items-center gap-3 text-blue-300 bg-blue-500/10 p-4 rounded-2xl text-xs font-bold uppercase tracking-wider border border-blue-500/20">
              <AlertCircle className="h-5 w-5" />
              Reliez les colonnes de votre fichier aux champs correspondants.
            </div>

            <div className="grid grid-cols-1 gap-3 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
              {columns.map(col => (
                <div key={col} className="flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/5 hover:bg-white/10 transition-colors">
                  <div className="flex items-center gap-3">
                    <Table className="h-5 w-5 text-white/20" />
                    <span className="font-bold text-white/80 text-sm">{col}</span>
                  </div>
                  <ArrowRight className="h-4 w-4 text-white/10" />
                  <select 
                    className="bg-slate-900 border border-white/10 rounded-xl px-4 py-2 text-sm text-white/80 outline-none focus:border-blue-500 transition-all cursor-pointer"
                    value={mapping[col] || ''}
                    onChange={(e) => handleMappingChange(col, e.target.value)}
                  >
                    <option value="">Ignorer / Meta-donnée</option>
                    {dbFields.map(f => (
                      <option key={f.id} value={f.id}>{f.label}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
            
            <div className="bg-white/5 p-4 rounded-2xl border border-white/5">
                <p className="text-[10px] font-bold text-white/30 uppercase mb-2">Guide des Formations :</p>
                <div className="flex flex-wrap gap-2">
                    {annees.map(a => (
                        <span key={a.id} className="text-[9px] bg-white/10 px-2 py-1 rounded text-white/60">
                            {a.nom}: <b className="text-blue-400">{a.id}</b>
                        </span>
                    ))}
                </div>
            </div>

            <div className="flex justify-end gap-3 pt-6">
              <button onClick={onCancel} className="px-6 py-2 text-white/40 font-bold hover:text-white transition-colors">Annuler</button>
              <button onClick={() => setStep(3)} className="bg-blue-600 text-white px-8 py-2 rounded-xl font-bold hover:bg-blue-500 transition-all shadow-lg">
                Suivant
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="text-center py-12 space-y-8">
            <div className={`w-24 h-24 rounded-full flex items-center justify-center mx-auto border ${importMode === 'apogee' ? 'bg-amber-500/20 border-amber-500/30 text-amber-400' : 'bg-emerald-500/20 border-emerald-500/30 text-emerald-400'}`}>
                <Check className="h-12 w-12" />
            </div>
            <div>
              <h4 className="text-3xl font-black text-white">Prêt pour l'importation</h4>
              <p className="text-white/40 mt-2 font-medium">{fileData.length} lignes à traiter.</p>
            </div>
            
            {importMode === 'apogee' ? (
              <div className="max-w-md mx-auto text-left bg-amber-500/10 p-6 rounded-3xl border border-amber-500/20 space-y-3">
                <p className="font-black text-amber-400 uppercase tracking-widest text-[10px]">Import Automatique Apogée :</p>
                <p className="text-xs text-white/70 leading-relaxed">
                  Le système va lire la structure de votre fichier d'export Apogée et associer automatiquement les colonnes aux ECUEs de la base de données (ex: <i>POO</i>, <i>BDR av.</i>, <i>GRH</i>).
                </p>
                <p className="text-xs text-white/50 leading-relaxed font-bold">
                  Les absences et défaillances (ABI, ABJ, DEF) seront également importées.
                </p>
              </div>
            ) : (
              <div className="max-w-sm mx-auto text-left bg-white/5 p-6 rounded-3xl border border-white/10 space-y-3">
                <p className="font-black text-white/20 uppercase tracking-widest text-[10px]">Résumé du mapping :</p>
                {Object.entries(mapping).map(([k, v]) => (
                  <div key={k} className="flex justify-between items-center text-sm">
                    <span className="text-white/40">{k}</span>
                    <span className="font-bold text-blue-400">{dbFields.find(f => f.id === v)?.label}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="flex justify-center gap-4 pt-6">
              <button onClick={() => setStep(importMode === 'apogee' ? 1 : 2)} className="px-8 py-3 text-white/30 font-bold hover:text-white">Retour</button>
              <button onClick={() => startImport()} disabled={loading} className={`px-12 py-3 rounded-2xl font-black shadow-2xl transition-all disabled:opacity-50 ${importMode === 'apogee' ? 'bg-amber-600 text-white hover:bg-amber-500' : 'bg-white text-slate-950 hover:bg-blue-50'}`}>
                {loading ? 'Traitement...' : 'Importer maintenant'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ImportWizard;
