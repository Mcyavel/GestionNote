import React, { useState, useEffect } from 'react';
import { Save, Search, FileSpreadsheet, CheckCircle, AlertTriangle } from 'lucide-react';

interface StudentGrade {
  student_id: number;
  nom: string;
  email: string;
  valeur: number | string | null;
}

const GradeEntry: React.FC = () => {
  const [annees, setAnnees] = useState<any[]>([]);
  const [selectedEcue, setSelectedEcue] = useState<number | null>(null);
  const [students, setStudents] = useState<StudentGrade[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    fetch('http://localhost:8000/curriculum')
      .then(res => res.json())
      .then(res => setAnnees(res.data));
  }, []);

  const fetchGrades = async (ecueId: number) => {
    setLoading(true);
    try {
      const response = await fetch(`http://localhost:8000/grades?ecue_id=${ecueId}`);
      const result = await response.json();
      if (result.success) {
        setStudents(result.data.map((s: any) => ({
          ...s,
          valeur: s.valeur !== null ? s.valeur : ''
        })));
      }
    } catch (error) {
      console.error("Erreur chargement notes", error);
    } finally {
      setLoading(false);
    }
  };

  const handleEcueChange = (id: number) => {
    setSelectedEcue(id);
    fetchGrades(id);
  };

  const handleGradeChange = (studentId: number, value: string) => {
    setStudents(prev => prev.map(s => 
      s.student_id === studentId ? { ...s, valeur: value } : s
    ));
  };

  const saveGrades = async () => {
    if (!selectedEcue) return;
    setSaving(true);
    try {
      const notesToSave = students
        .filter(s => s.valeur !== '')
        .map(s => ({
          etudiant_id: s.student_id,
          ecue_id: selectedEcue,
          valeur: s.valeur
        }));

      const response = await fetch('http://localhost:8000/grades', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: notesToSave })
      });
      const result = await response.json();
      if (result.success) {
        alert(result.message);
      }
    } catch (error) {
      alert("Erreur lors de la sauvegarde");
    } finally {
      setSaving(false);
    }
  };

  const filteredStudents = students.filter(s => 
    s.nom.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Sélecteur de Matière */}
        <div className="lg:col-span-1 space-y-4">
          <div className="bg-white p-4 rounded-xl border border-slate-200">
            <h4 className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-2">
              <FileSpreadsheet className="h-4 w-4 text-blue-600" />
              Choisir une matière
            </h4>
            <div className="space-y-1 max-h-[600px] overflow-auto pr-2 custom-scrollbar">
              {annees.map(annee => (
                <div key={annee.id} className="space-y-1">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-3 mb-1">{annee.nom}</p>
                  {annee.semestres.map((s: any) => (
                    <div key={s.id} className="space-y-1 ml-2">
                      <p className="text-[10px] font-semibold text-slate-500">{s.nom}</p>
                      {s.bcc.map((b: any) => (
                        <div key={b.id} className="space-y-1">
                          {b.ue.map((u: any) => (
                            <div key={u.id} className="space-y-1">
                              {u.ecue.map((e: any) => (
                                <button
                                  key={e.id}
                                  onClick={() => handleEcueChange(e.id)}
                                  className={`w-full text-left px-3 py-2 rounded-lg text-xs transition-colors ${
                                    selectedEcue === e.id 
                                      ? 'bg-blue-600 text-white shadow-md font-medium' 
                                      : 'text-slate-600 hover:bg-slate-100'
                                  }`}
                                >
                                  {e.nom}
                                </button>
                              ))}
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Table de Saisie */}
        <div className="lg:col-span-3 space-y-4">
          {!selectedEcue ? (
            <div className="bg-white p-12 rounded-2xl border border-dashed border-slate-200 text-center text-slate-400">
              <FileSpreadsheet className="h-12 w-12 mx-auto mb-4 opacity-20" />
              Sélectionnez un ECUE dans la liste de gauche pour commencer la saisie.
            </div>
          ) : (
            <>
              <div className="flex flex-wrap justify-between items-center gap-4 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <input 
                    type="text" 
                    placeholder="Chercher un étudiant..."
                    className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
                <button 
                  onClick={saveGrades}
                  disabled={saving}
                  className="flex items-center gap-2 bg-slate-900 text-white px-6 py-2 rounded-lg text-sm font-bold hover:bg-slate-800 transition-all shadow-lg disabled:opacity-50"
                >
                  <Save className="h-4 w-4" />
                  {saving ? 'Enregistrement...' : 'Sauvegarder tout'}
                </button>
              </div>

              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100">
                      <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Étudiant</th>
                      <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider w-32 text-center">Note / 20</th>
                      <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {loading ? (
                      <tr><td colSpan={3} className="px-6 py-12 text-center text-slate-400">Chargement des étudiants...</td></tr>
                    ) : filteredStudents.map(student => (
                      <tr key={student.student_id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="h-8 w-8 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center font-bold text-[10px]">
                              {student.nom.split(' ').map(n => n[0]).join('')}
                            </div>
                            <div>
                              <p className="text-sm font-bold text-slate-700">{student.nom}</p>
                              <p className="text-[10px] text-slate-400">{student.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <input 
                            type="number"
                            min="0"
                            max="20"
                            step="0.25"
                            className="w-full text-center py-2 bg-slate-50 border border-slate-200 rounded-lg font-bold text-slate-800 focus:ring-2 focus:ring-blue-500 outline-none"
                            value={student.valeur || ''}
                            onChange={(e) => handleGradeChange(student.student_id, e.target.value)}
                            placeholder="-"
                          />
                        </td>
                        <td className="px-6 py-4">
                          {student.valeur !== '' ? (
                            <div className="flex items-center gap-2 text-green-600 text-xs font-medium">
                              <CheckCircle className="h-3 w-3" /> Note saisie
                            </div>
                          ) : (
                            <div className="flex items-center gap-2 text-slate-300 text-xs">
                              <AlertTriangle className="h-3 w-3" /> En attente
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default GradeEntry;
