import React, { useState, useEffect } from 'react';
import { Plus, Trash2, ChevronRight, ChevronDown, FileJson } from 'lucide-react';

interface ECUE {
  id?: number;
  nom: string;
  credits: number;
  heures: number;
}

interface UE {
  id?: number;
  nom: string;
  coefficient: number;
  ecue: ECUE[];
}

interface BCC {
  id?: number;
  nom: string;
  bcc_annuel_lie_id?: number | null;
  ue: UE[];
}

interface Semestre {
  id?: number;
  nom: string;
  bcc: BCC[];
}

interface Annee {
  id?: number;
  nom: string;
  semestres: Semestre[];
}

const CurriculumManager: React.FC = () => {
  const [data, setData] = useState<Annee[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const fetchCurriculum = async () => {
    try {
      setLoading(true);
      const response = await fetch('http://localhost:8000/curriculum');
      const result = await response.json();
      if (result.success) {
        setData(result.data);
      }
    } catch (error) {
      console.error("Erreur lors du chargement de la maquette", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCurriculum();
  }, []);

  const toggleExpand = (id: string) => {
    setExpanded(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const handleImportJson = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const json = JSON.parse(event.target?.result as string);
        const response = await fetch('http://localhost:8000/curriculum', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ maquette: json })
        });
        const result = await response.json();
        if (result.success) {
          alert("Maquette importée avec succès !");
          fetchCurriculum();
        } else {
          alert("Erreur lors de l'import : " + result.error);
        }
      } catch (error) {
        alert("Fichier JSON invalide");
      }
    };
    reader.readAsText(file);
  };

  if (loading) return <div className="flex justify-center p-12">Chargement de la maquette...</div>;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center bg-white p-4 rounded-xl border border-slate-200">
        <div className="flex gap-4">
          <label className="flex items-center gap-2 bg-blue-50 text-blue-700 px-4 py-2 rounded-lg text-sm font-medium cursor-pointer hover:bg-blue-100 transition-colors">
            <FileJson className="h-4 w-4" />
            Importer JSON
            <input type="file" accept=".json" onChange={handleImportJson} className="hidden" />
          </label>
        </div>
        <button className="flex items-center gap-2 bg-slate-900 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-800 transition-colors">
          <Plus className="h-4 w-4" />
          Nouvelle Année
        </button>
      </div>

      <div className="space-y-4">
        {data.length === 0 && (
          <div className="text-center p-12 bg-white rounded-2xl border border-dashed border-slate-300 text-slate-500">
            Aucune maquette configurée. Importez un fichier JSON ou commencez à en créer une.
          </div>
        )}

        {data.map((annee) => (
          <div key={annee.id} className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
            <div className="bg-slate-50 p-4 flex items-center justify-between border-b border-slate-100">
              <div className="flex items-center gap-3">
                <button onClick={() => toggleExpand(`a-${annee.id}`)} className="text-slate-400 hover:text-slate-600">
                  {expanded[`a-${annee.id}`] ? <ChevronDown /> : <ChevronRight />}
                </button>
                <h3 className="font-bold text-slate-800">{annee.nom}</h3>
              </div>
              <div className="flex gap-2">
                <button className="p-2 text-slate-400 hover:text-blue-600"><Plus className="h-4 w-4" /></button>
                <button className="p-2 text-slate-400 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
              </div>
            </div>

            {expanded[`a-${annee.id}`] && (
              <div className="p-4 space-y-4">
                {annee.semestres.map((semestre) => (
                  <div key={semestre.id} className="border-l-2 border-blue-200 ml-4 pl-6 py-2 space-y-4">
                    <div className="flex items-center justify-between">
                      <h4 className="font-semibold text-blue-800 text-sm uppercase tracking-wider">{semestre.nom}</h4>
                      <button className="text-xs bg-blue-50 text-blue-600 px-2 py-1 rounded hover:bg-blue-100">Ajouter BCC</button>
                    </div>

                    <div className="grid grid-cols-1 gap-4">
                      {semestre.bcc.map((bcc) => (
                        <div key={bcc.id} className="bg-slate-50/50 rounded-xl p-4 border border-slate-100">
                          <div className="flex justify-between items-center mb-3">
                            <span className="text-xs font-bold text-slate-500">BCC : {bcc.nom}</span>
                            {bcc.bcc_annuel_lie_id && (
                              <span className="text-[10px] bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-bold">ANNUEL</span>
                            )}
                          </div>

                          <div className="space-y-2">
                            {bcc.ue.map((ue) => (
                              <div key={ue.id} className="bg-white p-3 rounded-lg border border-slate-200 flex justify-between items-center group">
                                <div>
                                  <p className="text-sm font-medium text-slate-700">{ue.nom}</p>
                                  <p className="text-[10px] text-slate-400">Coeff: {ue.coefficient} • {ue.ecue.length} ECUE</p>
                                </div>
                                <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                                  <button className="p-1 text-slate-300 hover:text-blue-600"><Plus className="h-3 w-3" /></button>
                                  <button className="p-1 text-slate-300 hover:text-red-600"><Trash2 className="h-3 w-3" /></button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default CurriculumManager;
