import React, { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { BarChart3, TrendingUp, Users, Target, Download } from 'lucide-react';
import * as XLSX from 'xlsx';

const StatsDashboard: React.FC = () => {
  const [globalStats, setGlobalStats] = useState<any[]>([]);
  const [distribution, setDistribution] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedEcue, setSelectedEcue] = useState<number | null>(null);
  const [ecues, setEcues] = useState<any[]>([]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [resGlobal, resCurriculum] = await Promise.all([
          fetch('http://localhost:8000/stats'),
          fetch('http://localhost:8000/curriculum')
        ]);
        
        const stats = await resGlobal.json();
        const curriculum = await resCurriculum.json();
        
        setGlobalStats(stats.data);
        
        // Extraire tous les ECUEs pour le sélecteur
        const allEcues: any[] = [];
        curriculum.data.forEach((a: any) => 
          a.semestres.forEach((s: any) => 
            s.bcc.forEach((b: any) => 
              b.ue.forEach((u: any) => 
                u.ecue.forEach((e: any) => allEcues.push(e))
              )
            )
          )
        );
        setEcues(allEcues);
        if (allEcues.length > 0) setSelectedEcue(allEcues[0].id);

      } catch (error) {
        console.error("Erreur stats", error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  useEffect(() => {
    if (selectedEcue) {
      fetch(`http://localhost:8000/stats?action=distribution&ecue_id=${selectedEcue}`)
        .then(res => res.json())
        .then(res => setDistribution(res.data));
    }
  }, [selectedEcue]);

  const exportToExcel = () => {
    const ws = XLSX.utils.json_to_sheet(globalStats);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Statistiques Globales");
    XLSX.writeFile(wb, "MiageNote_Stats.xlsx");
  };

  if (loading) return <div className="p-12 text-center text-slate-400">Analyse des données en cours...</div>;

  return (
    <div className="space-y-8">
      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <div className="bg-blue-50 w-10 h-10 rounded-lg flex items-center justify-center mb-4 text-blue-600">
            <TrendingUp className="h-5 w-5" />
          </div>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Moyenne Générale</p>
          <p className="text-2xl font-black text-slate-900">12.45 <span className="text-xs font-normal text-slate-400">/ 20</span></p>
        </div>
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <div className="bg-green-50 w-10 h-10 rounded-lg flex items-center justify-center mb-4 text-green-600">
            <Target className="h-5 w-5" />
          </div>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Taux de Réussite</p>
          <p className="text-2xl font-black text-slate-900">78.2 <span className="text-xs font-normal text-slate-400">%</span></p>
        </div>
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <div className="bg-indigo-50 w-10 h-10 rounded-lg flex items-center justify-center mb-4 text-indigo-600">
            <Users className="h-5 w-5" />
          </div>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Étudiants Actifs</p>
          <p className="text-2xl font-black text-slate-900">142</p>
        </div>
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-center">
            <button 
                onClick={exportToExcel}
                className="flex items-center justify-center gap-2 bg-slate-900 text-white py-3 rounded-xl font-bold hover:bg-slate-800 transition-all shadow-lg"
            >
                <Download className="h-4 w-4" /> Exporter Rapport
            </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Moyennes par ECUE */}
        <div className="lg:col-span-2 bg-white p-8 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex justify-between items-center mb-8">
            <div>
              <h3 className="text-lg font-bold text-slate-800">Moyennes par Matière</h3>
              <p className="text-sm text-slate-400">Comparatif des performances par ECUE</p>
            </div>
            <BarChart3 className="text-slate-200 h-8 w-8" />
          </div>
          
          <div className="h-[400px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={globalStats}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="nom" axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 10}} />
                <YAxis domain={[0, 20]} axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 12}} />
                <Tooltip 
                  contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)'}}
                  cursor={{fill: '#f8fafc'}}
                />
                <Bar dataKey="moyenne" radius={[4, 4, 0, 0]}>
                  {globalStats.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.moyenne >= 10 ? '#3b82f6' : '#ef4444'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Distribution des notes */}
        <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm">
          <div className="mb-6">
            <h3 className="text-lg font-bold text-slate-800">Répartition des Notes</h3>
            <select 
              className="mt-4 w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
              value={selectedEcue || ''}
              onChange={(e) => setSelectedEcue(Number(e.target.value))}
            >
              {ecues.map(e => (
                <option key={e.id} value={e.id}>{e.nom}</option>
              ))}
            </select>
          </div>

          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={distribution} layout="vertical">
                <XAxis type="number" hide />
                <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 10}} />
                <Tooltip />
                <Bar dataKey="value" fill="#3b82f6" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          
          <div className="mt-6 pt-6 border-t border-slate-100 text-center">
            <p className="text-xs text-slate-400">Analyse univariée sur l'ensemble de la promotion.</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StatsDashboard;
