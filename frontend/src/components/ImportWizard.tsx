import React, { useState } from 'react';
import * as XLSX from 'xlsx';
import Papa from 'papaparse';
import { Upload, ArrowRight, Check, AlertCircle, Table } from 'lucide-react';

interface ImportWizardProps {
  onComplete: () => void;
  onCancel: () => void;
}

const ImportWizard: React.FC<ImportWizardProps> = ({ onComplete, onCancel }) => {
  const [step, setStep] = useState(1);
  const [fileData, setFileData] = useState<any[]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  const dbFields = [
    { id: 'nom', label: 'Nom complet' },
    { id: 'email', label: 'Adresse Email' },
    { id: 'annee_inscription', label: 'Année d\'inscription' },
    { id: 'meta_data', label: 'Donnée complémentaire' },
  ];

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const extension = file.name.split('.').pop()?.toLowerCase();

    if (extension === 'csv') {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          setFileData(results.data);
          setColumns(Object.keys(results.data[0] || {}));
          setStep(2);
        }
      });
    } else {
      const reader = new FileReader();
      reader.onload = (evt) => {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws);
        setFileData(data);
        setColumns(Object.keys(data[0] || {}));
        setStep(2);
      };
      reader.readAsBinaryString(file);
    }
  };

  const handleMappingChange = (fileCol: string, dbField: string) => {
    setMapping(prev => ({ ...prev, [fileCol]: dbField }));
  };

  const startImport = async () => {
    setLoading(true);
    try {
      const response = await fetch('http://localhost:8000/students', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'import',
          data: fileData,
          mapping: mapping
        })
      });
      const result = await response.json();
      if (result.success) {
        alert(result.message);
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
    <div className="bg-white rounded-2xl border border-slate-200 shadow-xl overflow-hidden max-w-4xl mx-auto">
      {/* Header */}
      <div className="bg-slate-50 p-6 border-b border-slate-100 flex items-center justify-between">
        <div>
          <h3 className="text-xl font-bold text-slate-800">Assistant d'importation</h3>
          <p className="text-sm text-slate-500">Importez vos étudiants depuis Excel ou CSV</p>
        </div>
        <div className="flex gap-2">
          {[1, 2, 3].map(s => (
            <div key={s} className={`h-2 w-8 rounded-full ${step >= s ? 'bg-blue-600' : 'bg-slate-200'}`} />
          ))}
        </div>
      </div>

      <div className="p-8">
        {step === 1 && (
          <div className="flex flex-col items-center justify-center py-12 border-2 border-dashed border-slate-200 rounded-2xl hover:border-blue-400 transition-colors cursor-pointer relative">
            <input type="file" accept=".csv,.xlsx,.xls" onChange={handleFileUpload} className="absolute inset-0 opacity-0 cursor-pointer" />
            <div className="bg-blue-50 p-4 rounded-full mb-4">
              <Upload className="h-8 w-8 text-blue-600" />
            </div>
            <p className="font-semibold text-slate-700">Cliquez ou déposez votre fichier ici</p>
            <p className="text-xs text-slate-400 mt-2">Supporte .xlsx, .xls et .csv</p>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-6">
            <div className="flex items-center gap-3 text-amber-600 bg-amber-50 p-4 rounded-xl text-sm">
              <AlertCircle className="h-5 w-5" />
              Associez les colonnes de votre fichier aux champs de l'application.
            </div>

            <div className="grid grid-cols-1 gap-4">
              {columns.map(col => (
                <div key={col} className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-100">
                  <div className="flex items-center gap-3">
                    <Table className="h-5 w-5 text-slate-400" />
                    <span className="font-medium text-slate-700">{col}</span>
                  </div>
                  <ArrowRight className="h-4 w-4 text-slate-300" />
                  <select 
                    className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                    value={mapping[col] || ''}
                    onChange={(e) => handleMappingChange(col, e.target.value)}
                  >
                    <option value="">Ignorer ou Meta-donnée</option>
                    {dbFields.map(f => (
                      <option key={f.id} value={f.id}>{f.label}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>

            <div className="flex justify-end gap-3 pt-6">
              <button onClick={onCancel} className="px-6 py-2 text-slate-600 font-medium hover:text-slate-800">Annuler</button>
              <button onClick={() => setStep(3)} className="bg-blue-600 text-white px-8 py-2 rounded-xl font-bold shadow-lg shadow-blue-200 hover:bg-blue-700 transition-all">
                Suivant
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="text-center py-12 space-y-6">
            <div className="bg-green-50 w-20 h-20 rounded-full flex items-center justify-center mx-auto">
              <Check className="h-10 w-10 text-green-600" />
            </div>
            <div>
              <h4 className="text-2xl font-bold text-slate-800">Prêt pour l'importation</h4>
              <p className="text-slate-500 mt-2">{fileData.length} étudiants détectés dans le fichier.</p>
            </div>
            
            <div className="max-w-xs mx-auto text-left bg-slate-50 p-4 rounded-xl text-xs space-y-2">
              <p className="font-bold text-slate-700 uppercase tracking-wider">Résumé du mapping :</p>
              {Object.entries(mapping).map(([k, v]) => (
                <div key={k} className="flex justify-between">
                  <span className="text-slate-500">{k}</span>
                  <span className="font-bold text-blue-600">{dbFields.find(f => f.id === v)?.label}</span>
                </div>
              ))}
            </div>

            <div className="flex justify-center gap-3 pt-6">
              <button onClick={() => setStep(2)} className="px-6 py-2 text-slate-600 font-medium">Retour</button>
              <button 
                onClick={startImport}
                disabled={loading}
                className="bg-slate-900 text-white px-12 py-3 rounded-xl font-bold shadow-xl hover:bg-slate-800 transition-all disabled:opacity-50"
              >
                {loading ? 'Importation en cours...' : 'Lancer l\'importation'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ImportWizard;
