import React, { useState, useEffect } from 'react';
import { Save, Search, FileSpreadsheet, CheckCircle, AlertTriangle, GraduationCap, Upload } from 'lucide-react';
import ImportWizard from './ImportWizard';

interface StudentGrade {
  student_id: number;
  nom: string;
  prenom: string;
  email: string;
  valeur: number | string | null;
}

const GradeEntry: React.FC = () => {
  const [annees, setAnnees] = useState<any[]>([]);
  const [selectedAnneeId, setSelectedAnneeId] = useState<number | null>(null);
  const [selectedSemestreId, setSelectedSemestreId] = useState<number | null>(null);
  const [selectedEcue, setSelectedEcue] = useState<number | string | null>(null);
  const [selectedEcueName, setSelectedEcueName] = useState<string>('');
  const [students, setStudents] = useState<StudentGrade[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [showImport, setShowImport] = useState(false);

  useEffect(() => {
    if (annees.length > 0 && !selectedAnneeId) {
      const activePromos = annees.filter(a => a.is_maquette === 0 && !a.archived);
      if (activePromos.length > 0) {
        setSelectedAnneeId(Number(activePromos[0].id));
        if (activePromos[0].semestres?.length > 0) {
          setSelectedSemestreId(Number(activePromos[0].semestres[0].id));
        }
      }
    }
  }, [annees]);

  const fetchCurriculum = async () => {
    try {
      const response = await fetch('/api/curriculum');
      const result = await response.json();
      if (result.success) setAnnees(result.data);
    } catch (e) { console.error(e); }
  };

  useEffect(() => { fetchCurriculum(); }, []);

  const fetchGrades = async (ecueId: number | string) => {
    setLoading(true);
    try {
      const response = await fetch(`/api/grades?ecue_id=${ecueId}`);
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

  const handleEcueChange = (id: number | string, name: string) => {
    setSelectedEcue(id);
    setSelectedEcueName(name);
    fetchGrades(id);
  };

  const handleGradeChange = (studentId: number, value: string) => {
    const cleanValue = value.trim().toUpperCase();
    if (cleanValue === 'ABI' || cleanValue === 'ABJ' || cleanValue === 'DEF' || cleanValue === '') {
      setStudents(prev => prev.map(s => 
        s.student_id === studentId ? { ...s, valeur: cleanValue } : s
      ));
      return;
    }

    const numVal = parseFloat(value.replace(',', '.'));
    if (value !== '' && (isNaN(numVal) || numVal < 0 || numVal > 20)) return;
    
    setStudents(prev => prev.map(s => 
      s.student_id === studentId ? { ...s, valeur: value } : s
    ));
  };

  const saveGrades = async () => {
    if (!selectedEcue) return;
    setSaving(true);
    try {
      const notesToSave = students
        .map(s => ({
          etudiant_id: s.student_id,
          ecue_id: selectedEcue,
          valeur: s.valeur !== null ? s.valeur.toString().replace(',', '.').trim().toUpperCase() : ''
        }));

      const response = await fetch('/api/grades', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'save', notes: notesToSave })
      });
      const result = await response.json();
      if (result.success) {
        alert("Notes enregistrées avec succès !");
        fetchGrades(selectedEcue);
      }
    } catch (error) { alert("Erreur lors de la sauvegarde"); } finally { setSaving(false); }
  };

  const filteredStudents = students.filter(s => 
    s.nom.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.prenom?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const currentAnnee = annees.find(a => Number(a.id) === Number(selectedAnneeId));
  const currentSemestre = currentAnnee?.semestres?.find((s: any) => Number(s.id) === Number(selectedSemestreId));
  
  const getEcuesForSemestre = (semestre: any) => {
    if (!semestre || !semestre.bcc) return [];
    const ecues: any[] = [];
    semestre.bcc.forEach((b: any) => {
      if (b.ue) {
        b.ue.forEach((u: any) => {
          if (u.ecue) {
            u.ecue.forEach((e: any) => {
              ecues.push(e);
            });
          }
        });
      }
    });
    return ecues;
  };

  let ecuesList = getEcuesForSemestre(currentSemestre);
  if (selectedSemestreId) {
    ecuesList = [
      ...ecuesList,
      { id: `bonus_${selectedSemestreId}`, nom: '★ BONUS SEMESTRIEL' },
      { id: `malus_${selectedSemestreId}`, nom: '⚠ MALUS SEMESTRIEL' }
    ];
  }

  if (showImport) {
    return <ImportWizard type="grades" ecueId={selectedEcue} onComplete={() => { setShowImport(false); if (selectedEcue) fetchGrades(selectedEcue); }} onCancel={() => setShowImport(false)} />;
  }

  return (
    <div className="h-full flex flex-col gap-6">
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 flex-1 min-h-0">
        <div className="lg:col-span-1 flex flex-col gap-4 min-h-0">
          <div className="bg-white/5 rounded-2xl border border-white/10 p-5 flex flex-col gap-5 min-h-0 backdrop-blur-xl">
            <h4 className="text-xs font-black text-white/40 uppercase tracking-[0.2em] flex items-center gap-2 border-b border-white/5 pb-2">
              <GraduationCap className="h-4 w-4 text-blue-400" /> Sélection
            </h4>
            
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-[10px] text-white/40 font-black uppercase tracking-wider">Année</label>
                <select 
                  value={selectedAnneeId || ''} 
                  onChange={e => {
                    const val = e.target.value ? Number(e.target.value) : null;
                    setSelectedAnneeId(val);
                    const annee = annees.find(a => Number(a.id) === Number(val));
                    const firstSemId = annee?.semestres?.[0]?.id ? Number(annee.semestres[0].id) : null;
                    setSelectedSemestreId(firstSemId);
                    setSelectedEcue(null);
                    setSelectedEcueName('');
                    setStudents([]);
                  }}
                  className="w-full bg-slate-900 border border-white/10 rounded-xl px-4 py-2.5 text-xs text-white outline-none focus:border-blue-500 transition-all cursor-pointer"
                >
                  <option value="" className="text-white/30">Choisir une année...</option>
                  {annees.filter(a => a.is_maquette === 0 && (!a.archived || a.id === selectedAnneeId)).map(a => <option key={a.id} value={a.id} className="bg-slate-900">{a.nom}</option>)}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] text-white/40 font-black uppercase tracking-wider">Semestre</label>
                <select
                  value={selectedSemestreId || ''}
                  disabled={!selectedAnneeId}
                  onChange={e => {
                    const val = e.target.value ? Number(e.target.value) : null;
                    setSelectedSemestreId(val);
                    setSelectedEcue(null);
                    setSelectedEcueName('');
                    setStudents([]);
                  }}
                  className="w-full bg-slate-900 border border-white/10 rounded-xl px-4 py-2.5 text-xs text-white outline-none focus:border-blue-500 transition-all cursor-pointer disabled:opacity-50"
                >
                  <option value="" className="text-white/30">Choisir un semestre...</option>
                  {currentAnnee?.semestres?.map((s: any) => (
                    <option key={s.id} value={s.id} className="bg-slate-900">{s.nom}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] text-white/40 font-black uppercase tracking-wider">Matière (ECUE)</label>
                <select
                  value={selectedEcue || ''}
                  disabled={!selectedSemestreId}
                  onChange={e => {
                    const val = e.target.value;
                    if (val) {
                      const ecue = ecuesList.find((item: any) => String(item.id) === String(val));
                      handleEcueChange(val, ecue?.nom || '');
                    } else {
                      setSelectedEcue(null);
                      setSelectedEcueName('');
                      setStudents([]);
                    }
                  }}
                  className="w-full bg-slate-900 border border-white/10 rounded-xl px-4 py-2.5 text-xs text-white outline-none focus:border-blue-500 transition-all cursor-pointer disabled:opacity-50"
                >
                  <option value="" className="text-white/30">Choisir un ECUE...</option>
                  {ecuesList.map((e: any) => (
                    <option key={e.id} value={e.id} className="bg-slate-900">{e.nom}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </div>

        <div className="lg:col-span-3 flex flex-col gap-4 min-h-0">
          {!selectedEcue ? (
            <div className="flex-1 bg-white/5 rounded-3xl border border-dashed border-white/10 flex flex-col items-center justify-center text-white/10 p-12 relative overflow-hidden">
                <div className="absolute inset-0 bg-blue-500/5 animate-pulse"></div>
                <div className="relative z-10 flex flex-col items-center">
                    <FileSpreadsheet className="h-16 w-16 mb-4 opacity-10" />
                    <p className="text-sm font-medium mb-8">Sélectionnez une matière pour commencer</p>
                    <button onClick={() => setShowImport(true)} className="flex items-center gap-3 bg-white/10 text-white px-8 py-3 rounded-2xl font-bold hover:bg-white/20 transition-all border border-white/10 shadow-2xl">
                        <Upload className="w-5 h-5 text-blue-400" /> Import Global de Notes
                    </button>
                </div>
            </div>
          ) : (
            <>
              <div className="bg-white/5 p-4 rounded-2xl border border-white/10 flex items-center justify-between gap-4 backdrop-blur-md">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-blue-500/20 rounded-lg text-blue-300"><FileSpreadsheet className="w-5 h-5" /></div>
                    <div><h3 className="text-white font-bold text-sm uppercase tracking-tight">{selectedEcueName}</h3><p className="text-[9px] text-white/30 uppercase font-black tracking-widest">Saisie des notes</p></div>
                </div>
                <div className="flex items-center gap-3 flex-1 max-w-xs relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/20" />
                  <input type="text" placeholder="Filtrer promotion..." className="w-full pl-10 pr-4 py-2 bg-slate-900/50 border border-white/10 rounded-xl text-xs text-white outline-none focus:border-blue-500/50 transition-all" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                </div>
                <div className="flex gap-2">
                    {typeof selectedEcue !== 'string' && (
                        <button onClick={() => setShowImport(true)} className="p-2 bg-white/5 text-white/40 hover:text-white rounded-xl transition-all border border-white/10" title="Importer"><Upload className="w-5 h-5" /></button>
                    )}
                    <button onClick={saveGrades} disabled={saving} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-6 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all shadow-lg disabled:opacity-50">
                        <Save className="h-4 w-4" /> {saving ? '...' : 'Sauvegarder'}
                    </button>
                </div>
              </div>

              <div className="flex-1 bg-white/5 rounded-3xl border border-white/10 overflow-hidden flex flex-col shadow-2xl backdrop-blur-sm">
                <div className="overflow-y-auto max-h-[380px] lg:max-h-[calc(100vh-330px)] flex-1 custom-scrollbar">
                    <table className="w-full text-left border-separate border-spacing-0">
                    <thead>
                        <tr className="bg-[#0f172a]/80 sticky top-0 z-10 backdrop-blur-xl">
                        <th className="px-6 py-4 text-[10px] font-black text-white/20 uppercase tracking-[0.2em] border-b border-white/5">Étudiant</th>
                        <th className="px-6 py-4 text-[10px] font-black text-white/20 uppercase tracking-[0.2em] w-32 text-center border-b border-white/5">Note / 20</th>
                        <th className="px-6 py-4 text-[10px] font-black text-white/20 uppercase tracking-[0.2em] border-b border-white/5">Statut</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                        {loading ? (
                        <tr><td colSpan={3} className="px-6 py-20 text-center text-white/10 uppercase text-xs font-black animate-pulse">Synchronisation...</td></tr>
                        ) : filteredStudents.length === 0 ? (
                        <tr><td colSpan={3} className="px-6 py-20 text-center text-white/20 font-medium">Aucun étudiant assigné</td></tr>
                        ) : filteredStudents.map(student => (
                        <tr key={student.student_id} className="hover:bg-white/5 transition-all group">
                            <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                                <div className="h-8 w-8 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-300 flex items-center justify-center font-black text-[10px] uppercase">
                                {student.nom[0]}{student.prenom ? student.prenom[0] : ''}
                                </div>
                                <div>
                                <p className="text-xs font-black text-white/80 uppercase">{student.nom} <span className="capitalize font-medium text-white/40 ml-1">{student.prenom}</span></p>
                                <p className="text-[9px] text-white/20 font-medium">{student.email}</p>
                                </div>
                            </div>
                            </td>
                            <td className="px-6 py-4 text-center">
                            <input type="text" className="w-20 text-center py-1.5 bg-slate-900 border border-white/10 rounded-lg font-black text-white focus:border-blue-500/50 outline-none transition-all placeholder:text-white/5 text-sm" value={student.valeur || ''} onChange={(e) => handleGradeChange(student.student_id, e.target.value)} placeholder="--" />
                            </td>
                            <td className="px-6 py-4">
                            {student.valeur !== '' ? (
                                <div className="flex items-center gap-2 text-emerald-400 text-[10px] font-black uppercase tracking-widest"><CheckCircle className="h-3 w-3" /> Validé</div>
                            ) : (
                                <div className="flex items-center gap-2 text-white/10 text-[10px] font-medium italic"><AlertTriangle className="h-3 w-3" /> En attente</div>
                            )}
                            </td>
                        </tr>
                        ))}
                    </tbody>
                    </table>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default GradeEntry;
