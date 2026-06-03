import React, { useState, useEffect } from 'react';
import { UserPlus, Search, Filter, MoreVertical, Mail, Calendar, MapPin } from 'lucide-react';
import ImportWizard from './ImportWizard';

interface Student {
  id: number;
  nom: string;
  email: string;
  annee_inscription: number;
  meta_data: Record<string, any> | null;
}

const StudentManager: React.FC = () => {
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [showImport, setShowImport] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const fetchStudents = async () => {
    try {
      setLoading(true);
      const response = await fetch('http://localhost:8000/students');
      const result = await response.json();
      if (result.success) {
        setStudents(result.data);
      }
    } catch (error) {
      console.error("Erreur lors du chargement des étudiants", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStudents();
  }, []);

  const filteredStudents = students.filter(s => 
    s.nom.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (showImport) {
    return <ImportWizard 
      onComplete={() => { setShowImport(false); fetchStudents(); }} 
      onCancel={() => setShowImport(false)} 
    />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap justify-between items-center gap-4 bg-white p-4 rounded-xl border border-slate-200">
        <div className="flex-1 min-w-[300px] relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input 
            type="text" 
            placeholder="Rechercher un étudiant (nom, email...)"
            className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="flex gap-3">
          <button className="flex items-center gap-2 px-4 py-2 border border-slate-200 rounded-lg text-sm font-medium hover:bg-slate-50">
            <Filter className="h-4 w-4" /> Filtrer
          </button>
          <button 
            onClick={() => setShowImport(true)}
            className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors shadow-sm"
          >
            <UserPlus className="h-4 w-4" /> Importer des étudiants
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-100">
              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Étudiant</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Année d'inscription</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Détails / Provenance</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr><td colSpan={4} className="px-6 py-12 text-center text-slate-400">Chargement...</td></tr>
            ) : filteredStudents.length === 0 ? (
              <tr><td colSpan={4} className="px-6 py-12 text-center text-slate-400">Aucun étudiant trouvé</td></tr>
            ) : (
              filteredStudents.map(student => (
                <tr key={student.id} className="hover:bg-slate-50/50 transition-colors group">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-sm">
                        {student.nom.split(' ').map(n => n[0]).join('')}
                      </div>
                      <div>
                        <p className="font-bold text-slate-800">{student.nom}</p>
                        <div className="flex items-center gap-1 text-xs text-slate-400">
                          <Mail className="h-3 w-3" /> {student.email}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2 text-slate-600 text-sm">
                      <Calendar className="h-4 w-4 text-slate-400" />
                      {student.annee_inscription}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-wrap gap-1">
                      {student.meta_data && Object.entries(student.meta_data).map(([key, val]) => (
                        <span key={key} className="inline-flex items-center gap-1 bg-slate-100 text-slate-600 px-2 py-0.5 rounded text-[10px] font-medium">
                           {key === 'Provenance' || key === 'provenance' ? <MapPin className="h-2 w-2" /> : null}
                           {val}
                        </span>
                      ))}
                      {!student.meta_data && <span className="text-slate-300 text-xs italic">Aucune donnée</span>}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <button className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100">
                      <MoreVertical className="h-5 w-5" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default StudentManager;
