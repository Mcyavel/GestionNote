import React, { useState, useEffect } from 'react';
import { UserPlus, Search, Trash2, Mail, X, Save, GraduationCap, Edit2, History } from 'lucide-react';
import ImportWizard from './ImportWizard';

interface Student {
  id: number;
  nom: string;
  prenom: string;
  email: string;
  annee_inscription: number;
  annee_id: number | null;
  annee_nom?: string;
  provenance?: string;
  meta_data: Record<string, any> | null;
  has_history?: boolean;
}

const StudentManager: React.FC = () => {
  const [students, setStudents] = useState<Student[]>([]);
  const [annees, setAnnees] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showImport, setShowImport] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedHistoryStudent, setSelectedHistoryStudent] = useState<Student | null>(null);
  const [studentHistory, setStudentHistory] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // État pour la création et l'édition
  const [formData, setFormData] = useState({
    nom: '',
    prenom: '',
    email: '',
    annee_inscription: new Date().getFullYear(),
    annee_id: '' as string | number,
    provenance: ''
  });

  const fetchData = async () => {
    try {
      setLoading(true);
      const [resStudents, resCurriculum] = await Promise.all([
        fetch('/api/students'),
        fetch('/api/curriculum')
      ]);
      const dataS = await resStudents.json();
      const dataC = await resCurriculum.json();
      if (dataS.success) setStudents(dataS.data);
      if (dataC.success) setAnnees(dataC.data);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  useEffect(() => {
    if (!selectedHistoryStudent) {
      setStudentHistory([]);
      return;
    }
    const fetchHistory = async () => {
      try {
        setLoadingHistory(true);
        const res = await fetch(`/api/students?action=history&student_id=${selectedHistoryStudent.id}`);
        const data = await res.json();
        if (data.success) {
          setStudentHistory(data.data);
        }
      } catch (error) {
        console.error(error);
      } finally {
        setLoadingHistory(false);
      }
    };
    fetchHistory();
  }, [selectedHistoryStudent]);

  const handleCreateStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
        const response = await fetch('/api/students', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                action: 'create', 
                ...formData,
                annee_id: formData.annee_id === '' ? null : Number(formData.annee_id),
                provenance: formData.provenance === '' ? null : formData.provenance
            })
        });
        const result = await response.json();
        if (result.success) {
            setShowCreate(false);
            setFormData({ nom: '', prenom: '', email: '', annee_inscription: new Date().getFullYear(), annee_id: '', provenance: '' });
            fetchData();
        } else { alert(result.error); }
    } catch (error) { alert("Erreur réseau"); }
  };

  const handleStartEdit = (student: Student) => {
    setEditingId(student.id);
    setFormData({
        nom: student.nom,
        prenom: student.prenom || '',
        email: student.email,
        annee_inscription: student.annee_inscription,
        annee_id: student.annee_id || '',
        provenance: student.provenance || ''
    });
  };

  const handleUpdateStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
        const response = await fetch('/api/students', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                action: 'update', 
                id: editingId,
                ...formData,
                annee_id: formData.annee_id === '' ? null : Number(formData.annee_id),
                provenance: formData.provenance === '' ? null : formData.provenance
            })
        });
        const result = await response.json();
        if (result.success) {
            setEditingId(null);
            setFormData({ nom: '', prenom: '', email: '', annee_inscription: new Date().getFullYear(), annee_id: '', provenance: '' });
            fetchData();
        } else { alert(result.error); }
    } catch (error) { alert("Erreur réseau"); }
  };

  const handleQuickUpdateAnnee = async (studentId: number, anneeId: string) => {
    try {
        const response = await fetch('/api/students', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'update_annee', id: studentId, annee_id: anneeId === '' ? null : Number(anneeId) })
        });
        if ((await response.json()).success) fetchData();
    } catch (error) { alert("Erreur"); }
  };

  const handleDeleteStudent = async (id: number) => {
    if (!confirm("Supprimer cet étudiant ?")) return;
    try {
        const response = await fetch('/api/students', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id })
        });
        if ((await response.json()).success) fetchData();
    } catch (error) { alert("Erreur suppression"); }
  };

  const filteredStudents = students.filter(s => 
    s.nom.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.prenom?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (showImport) {
    return <ImportWizard type="students" onComplete={() => { setShowImport(false); fetchData(); }} onCancel={() => setShowImport(false)} />;
  }

  return (
    <div className="space-y-6">
      {/* Barre d'outils */}
      <div className="flex flex-wrap justify-between items-center gap-4 bg-white/5 p-4 rounded-xl border border-white/10">
        <div className="flex-1 min-w-[250px] relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
          <input 
            type="text" 
            placeholder="Rechercher un étudiant..."
            className="w-full pl-10 pr-4 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white focus:ring-2 focus:ring-blue-500 outline-none transition-all"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="flex gap-3">
          <button 
            onClick={() => { setShowCreate(!showCreate); setEditingId(null); }}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all border ${
                showCreate ? 'bg-red-500/20 text-red-300 border-red-500/30' : 'bg-white/10 text-white border-white/10 hover:bg-white/20'
            }`}
          >
            {showCreate ? <><X className="h-4 w-4" /> Annuler</> : <><UserPlus className="h-4 w-4" /> Ajouter</>}
          </button>
          <button onClick={() => setShowImport(true)} className="flex items-center gap-2 bg-blue-600/80 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-600 transition-colors shadow-lg border border-blue-400/30">
            <Save className="h-4 w-4" /> Importer
          </button>
        </div>
      </div>

      {/* Formulaire Création / Édition */}
      {(showCreate || editingId) && (
        <form onSubmit={editingId ? handleUpdateStudent : handleCreateStudent} className={`p-6 rounded-2xl border animate-in fade-in slide-in-from-top-4 duration-300 ${editingId ? 'bg-yellow-500/10 border-yellow-500/20' : 'bg-white/10 border-white/20'}`}>
            <h3 className="text-lg font-bold text-white mb-4">{editingId ? 'Modifier l\'Étudiant' : 'Nouvel Étudiant'}</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
                <div className="space-y-1">
                    <label className="text-[10px] uppercase text-white/40 font-bold ml-1">Nom</label>
                    <input required type="text" className="w-full px-4 py-2 bg-slate-900 border border-white/10 rounded-lg text-white outline-none focus:border-blue-500" value={formData.nom} onChange={e => setFormData({...formData, nom: e.target.value})} />
                </div>
                <div className="space-y-1">
                    <label className="text-[10px] uppercase text-white/40 font-bold ml-1">Prénom</label>
                    <input type="text" className="w-full px-4 py-2 bg-slate-900 border border-white/10 rounded-lg text-white outline-none focus:border-blue-500" value={formData.prenom} onChange={e => setFormData({...formData, prenom: e.target.value})} />
                </div>
                <div className="space-y-1">
                    <label className="text-[10px] uppercase text-white/40 font-bold ml-1">Email</label>
                    <input required type="email" className="w-full px-4 py-2 bg-slate-900 border border-white/10 rounded-lg text-white outline-none focus:border-blue-500" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} />
                </div>
                <div className="space-y-1">
                    <label className="text-[10px] uppercase text-white/40 font-bold ml-1">Promotion</label>
                    <input required type="number" className="w-full px-4 py-2 bg-slate-900 border border-white/10 rounded-lg text-white outline-none focus:border-blue-500" value={formData.annee_inscription} onChange={e => setFormData({...formData, annee_inscription: parseInt(e.target.value)})} />
                </div>
                <div className="space-y-1">
                    <label className="text-[10px] uppercase text-white/40 font-bold ml-1">Formation</label>
                    <select className="w-full px-4 py-2 bg-slate-900 border border-white/10 rounded-lg text-white outline-none focus:border-blue-500" value={formData.annee_id} onChange={e => setFormData({...formData, annee_id: e.target.value})}>
                        <option value="">Non assignée</option>
                        {annees.filter(a => a.is_maquette === 0 && (!a.archived || a.id === Number(formData.annee_id))).map(a => <option key={a.id} value={a.id}>{a.nom}</option>)}
                    </select>
                </div>
                <div className="space-y-1">
                    <label className="text-[10px] uppercase text-white/40 font-bold ml-1">Provenance</label>
                    <input type="text" className="w-full px-4 py-2 bg-slate-900 border border-white/10 rounded-lg text-white outline-none focus:border-blue-500" placeholder="ex: Aix, CPGE, IUT..." value={formData.provenance} onChange={e => setFormData({...formData, provenance: e.target.value})} />
                </div>
            </div>
            <div className="flex gap-3 mt-4">
                <button type="submit" className={`flex-1 py-2 rounded-lg font-bold transition-all shadow-lg ${editingId ? 'bg-yellow-500 text-black hover:bg-yellow-400' : 'bg-blue-500 text-white hover:bg-blue-600'}`}>
                    {editingId ? 'Mettre à jour' : 'Enregistrer'}
                </button>
                {editingId && (
                    <button type="button" onClick={() => { setEditingId(null); setFormData({ nom:'', prenom:'', email:'', annee_inscription:new Date().getFullYear(), annee_id:'', provenance:'' }); }} className="px-6 py-2 bg-white/5 text-white/40 font-bold rounded-lg hover:bg-white/10 transition-all">Annuler</button>
                )}
            </div>
        </form>
      )}

      {/* Liste */}
      <div className="bg-white/5 rounded-2xl border border-white/10 overflow-hidden shadow-2xl backdrop-blur-sm">
        <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
            <thead>
                <tr className="bg-white/5 border-b border-white/10 text-[10px] font-bold text-white/40 uppercase tracking-widest">
                <th className="px-6 py-4">Étudiant</th>
                <th className="px-6 py-4">Affectation Rapide</th>
                <th className="px-6 py-4">Détails</th>
                <th className="px-6 py-4 text-right">Actions</th>
                </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
                {loading ? (
                <tr><td colSpan={4} className="px-6 py-12 text-center text-white/20 uppercase text-xs font-bold animate-pulse">Chargement des dossiers...</td></tr>
                ) : filteredStudents.length === 0 ? (
                <tr><td colSpan={4} className="px-6 py-12 text-center text-white/20">Aucun étudiant trouvé</td></tr>
                ) : (
                filteredStudents.map(student => (
                    <tr key={student.id} className={`hover:bg-white/5 transition-colors group ${editingId === student.id ? 'bg-yellow-500/5' : ''}`}>
                    <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                        <div className={`h-10 w-10 rounded-xl flex items-center justify-center font-bold text-sm border ${editingId === student.id ? 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30' : 'bg-blue-500/20 text-blue-300 border-blue-500/20'}`}>
                            {student.nom[0]?.toUpperCase()}{student.prenom ? student.prenom[0]?.toUpperCase() : ''}
                        </div>
                        <div>
                            <p className="font-bold text-white/90 uppercase text-xs">{student.nom} <span className="capitalize font-medium text-white/60 ml-1">{student.prenom}</span></p>
                            <div className="flex items-center gap-1 text-[10px] text-white/30 font-medium"><Mail className="h-3 w-3" /> {student.email}</div>
                        </div>
                        </div>
                    </td>
                    <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                            <GraduationCap className="h-4 w-4 text-blue-400/50" />
                            <select 
                                className="bg-transparent text-white/70 text-[11px] outline-none focus:text-white transition-colors cursor-pointer font-medium"
                                value={student.annee_id || ''}
                                onChange={e => handleQuickUpdateAnnee(student.id, e.target.value)}
                            >
                                <option value="" className="bg-slate-900">Non assignée</option>
                                {annees.filter(a => a.is_maquette === 0 && (!a.archived || a.id === student.annee_id)).map(a => <option key={a.id} value={a.id} className="bg-slate-900">{a.nom}</option>)}
                            </select>
                        </div>
                    </td>
                    <td className="px-6 py-4">
                        <div className="flex flex-wrap items-center gap-1.5">
                            <span className="bg-white/5 text-white/30 px-2 py-0.5 rounded text-[10px] font-bold border border-white/5">PROMO {student.annee_inscription}</span>
                            {student.provenance && (
                                <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/25 px-2 py-0.5 rounded text-[10px] font-bold shadow-sm" title={`Provenance: ${student.provenance}`}>
                                    {student.provenance}
                                </span>
                            )}
                            {student.has_history && (
                                <button
                                    onClick={() => setSelectedHistoryStudent(student)}
                                    className="flex items-center gap-1 bg-violet-500/10 hover:bg-violet-500/20 text-violet-400 border border-violet-500/20 hover:border-violet-500/30 px-2 py-0.5 rounded text-[10px] font-bold transition-all shadow-sm"
                                    title="Voir le cursus historique de l'étudiant"
                                >
                                    <History className="h-3.5 w-3.5" /> Cursus
                                </button>
                            )}
                            {student.meta_data && Object.entries(student.meta_data).map(([key, val]) => (
                                <span key={key} className="bg-blue-500/5 text-blue-400/50 px-2 py-0.5 rounded text-[10px] font-medium border border-blue-500/10">
                                {val as string}
                                </span>
                            ))}
                        </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                        <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={() => handleStartEdit(student)} className="p-2 text-white/20 hover:text-yellow-400 hover:bg-yellow-400/10 rounded-lg transition-all" title="Modifier"><Edit2 className="h-4 w-4" /></button>
                            <button onClick={() => handleDeleteStudent(student.id)} className="p-2 text-white/10 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all" title="Supprimer"><Trash2 className="h-4 w-4" /></button>
                        </div>
                    </td>
                    </tr>
                ))
                )}
            </tbody>
            </table>
        </div>
      </div>

      {/* Modale Suivi Cursus */}
      {selectedHistoryStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-slate-900/95 border border-white/10 rounded-2xl max-w-2xl w-full p-6 shadow-2xl space-y-6 animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="text-xl font-bold text-white flex items-center gap-2">
                  <History className="h-5 w-5 text-violet-400" />
                  Suivi Cursus Académique
                </h3>
                <p className="text-sm text-white/50 mt-1">
                  Parcours et capitalisation pour <span className="text-white font-semibold uppercase">{selectedHistoryStudent.nom}</span> {selectedHistoryStudent.prenom}
                </p>
                <p className="text-xs text-white/30 flex items-center gap-1 mt-0.5">
                  <Mail className="h-3 w-3" /> {selectedHistoryStudent.email}
                </p>
              </div>
              <button 
                onClick={() => setSelectedHistoryStudent(null)}
                className="p-1.5 bg-white/5 hover:bg-white/10 rounded-lg text-white/60 hover:text-white transition-all border border-white/5"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="border-t border-white/10 pt-4 max-h-[60vh] overflow-y-auto pr-1">
              {loadingHistory ? (
                <div className="py-12 text-center text-white/20 uppercase text-xs font-bold animate-pulse">
                  Chargement de l'historique...
                </div>
              ) : studentHistory.length === 0 ? (
                <div className="py-12 text-center text-white/30 text-sm">
                  Aucun historique d'inscription trouvé.
                </div>
              ) : (
                <div className="relative border-l-2 border-white/10 pl-6 ml-3 space-y-6 my-2">
                  {studentHistory.map((reg) => {
                    let statusColor = "bg-white/5 text-white/60 border-white/10";
                    let statusLabel = reg.status || "INCONNU";
                    if (reg.status === 'ADMIS') {
                      statusColor = "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
                      statusLabel = "Admis";
                    } else if (reg.status === 'AJOURNÉ') {
                      statusColor = "bg-amber-500/10 text-amber-400 border-amber-500/20";
                      statusLabel = "Ajourné";
                    } else if (reg.status === 'INCOMPLET') {
                      statusColor = "bg-blue-500/10 text-blue-400 border-blue-500/20";
                      statusLabel = "Incomplet";
                    } else if (reg.status === 'DÉFAILLANT') {
                      statusColor = "bg-rose-500/10 text-rose-400 border-rose-500/20";
                      statusLabel = "Défaillant";
                    }

                    return (
                      <div key={reg.id} className="relative group">
                        {/* Point sur la ligne de temps */}
                        <div className="absolute -left-[31px] top-1.5 h-4 w-4 rounded-full bg-slate-900 border-2 border-violet-500 shadow-md group-hover:scale-125 transition-transform" />
                        
                        <div className="bg-white/5 hover:bg-white/10 p-4 rounded-xl border border-white/5 hover:border-white/10 transition-all space-y-2">
                          <div className="flex justify-between items-start">
                            <div>
                              <h4 className="font-bold text-white text-sm">
                                {reg.annee_nom || "Formation non assignée"}
                              </h4>
                              <p className="text-xs text-white/40 font-medium">
                                Inscription en {reg.annee_inscription}
                              </p>
                            </div>
                            <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded border ${statusColor}`}>
                              {statusLabel}
                            </span>
                          </div>
                          <div className="flex justify-between items-center text-xs">
                            <span className="text-white/40">Moyenne Annuelle :</span>
                            <span className="font-bold text-white">
                              {reg.average === 'DEF' ? 'DEF' : reg.average !== null ? `${reg.average} / 20` : '—'}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="flex justify-end pt-2 border-t border-white/5">
              <button 
                onClick={() => setSelectedHistoryStudent(null)}
                className="px-4 py-2 bg-white/5 hover:bg-white/10 text-white font-medium rounded-lg text-sm transition-all border border-white/10"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StudentManager;
