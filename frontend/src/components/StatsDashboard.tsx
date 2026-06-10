import React, { useState, useEffect, useRef } from 'react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  Tooltip, 
  ResponsiveContainer, 
  Cell, 
  PieChart, 
  Pie, 
  Legend, 
  CartesianGrid,
  LineChart,
  Line
} from 'recharts';
import { 
  MapPin, 
  Calendar, 
  Award, 
  TrendingUp, 
  Search, 
  GraduationCap, 
  Users, 
  BookOpen, 
  AlertCircle, 
  CheckCircle2, 
  XCircle, 
  History, 
  BarChart3, 
  ChevronRight,
  TrendingDown,
  LineChart as LineIcon,
  Check,
  ChevronDown
} from 'lucide-react';

interface Annee {
  id: number;
  nom: string;
  is_maquette: number;
  maquette_id: number | null;
  archived: number;
}

interface PromoStats {
  total_students: number;
  admis: number;
  ajourne: number;
  incomplet: number;
  defaillant: number;
  average: number | null;
  median?: number | null;
  stddev?: number | null;
  min?: number | null;
  max?: number | null;
}

interface ProvenanceStat {
  provenance: string;
  count: number;
  average: number | null;
  median?: number | null;
  stddev?: number | null;
  min?: number | null;
  max?: number | null;
  admis_rate: number;
}

interface EcueStat {
  id: string;
  nom: string;
  ue_nom: string;
  average: number | null;
  median?: number | null;
  stddev?: number | null;
  min?: number | null;
  max?: number | null;
  success_rate: number;
  count: number;
}

interface StudentProgressionItem {
  annee_nom: string;
  annee_inscription: number;
  average: number | null;
  status: string;
}

interface StudentHistory {
  nom: string;
  prenom: string;
  email: string;
  progression: StudentProgressionItem[];
}

interface AdvancedStatsData {
  provenance: ProvenanceStat[];
  promo: PromoStats;
  best_ecues: EcueStat[];
  worst_ecues: EcueStat[];
  student_progressions: StudentHistory[];
}

// Structures pour l'évolution temporelle
interface TemporalPoint {
  annee_id: number;
  annee_nom: string;
  year_inscr: number;
  average: number | null;
  median?: number | null;
  stddev?: number | null;
  min?: number | null;
  max?: number | null;
  admis_rate: number;
  bccs: Record<string, number>;
  ues: Record<string, number>;
}

interface TemporalEvolutionData {
  timeline: TemporalPoint[];
  all_bcc_names: string[];
  all_ue_names: string[];
}

const StatsDashboard: React.FC = () => {
  const [annees, setAnnees] = useState<Annee[]>([]);
  const [selectedAnnees, setSelectedAnnees] = useState<number[]>([]);
  const [showPromoSelector, setShowPromoSelector] = useState(false);
  const promoSelectorRef = useRef<HTMLDivElement>(null);
  
  // Onglet principal de navigation
  const [activeTab, setActiveTab] = useState<'promo' | 'semesters' | 'provenance' | 'ecues' | 'progressions' | 'temporal'>('promo');
  
  // Sous-onglet pour la vue Semestres & BCC
  const [semestreTab, setSemestreTab] = useState<'s1' | 's2' | 'year'>('s1');

  const [loading, setLoading] = useState(false);
  
  // Données d'aperçu académique (BCCs, Semestres, moyennes) pour la promotion de référence
  const [academicData, setAcademicData] = useState<any>(null);
  const [referenceAnneeId, setReferenceAnneeId] = useState<number | null>(null);
  const [location, setLocation] = useState<string>('');
  
  // Données statistiques avancées (agrégées)
  const [advancedStats, setAdvancedStats] = useState<AdvancedStatsData | null>(null);

  // Données d'évolution temporelle
  const [temporalData, setTemporalData] = useState<TemporalEvolutionData | null>(null);
  const [selectedBccCompare, setSelectedBccCompare] = useState<string>('');
  
  const [temporalMode, setTemporalMode] = useState<'general' | 'bccs' | 'ues'>('general');
  const [selectedBccsToCompare, setSelectedBccsToCompare] = useState<string[]>([]);
  const [selectedUesToCompare, setSelectedUesToCompare] = useState<string[]>([]);
  const [startYearFilter, setStartYearFilter] = useState<number | ''>('');
  const [endYearFilter, setEndYearFilter] = useState<number | ''>('');

  // Recherche pour le suivi individuel
  const [searchStudent, setSearchStudent] = useState<string>('');
  const [selectedStudent, setSelectedStudent] = useState<StudentHistory | null>(null);

  // Charger les promotions disponibles (exclure les maquettes pures)
  useEffect(() => {
    fetch('/api/curriculum')
      .then(res => res.json())
      .then(res => {
        if (res.success && res.data.length > 0) {
          const onlyPromos = res.data.filter((a: Annee) => a.is_maquette === 0);
          setAnnees(onlyPromos);
          
          // Sélectionner par défaut toutes les promotions actives (non archivées)
          const activePromos = onlyPromos.filter((a: Annee) => !a.archived).map((a: Annee) => a.id);
          if (activePromos.length > 0) {
            setSelectedAnnees(activePromos);
            setReferenceAnneeId(activePromos[0]);
          } else if (onlyPromos.length > 0) {
            setSelectedAnnees([onlyPromos[0].id]);
            setReferenceAnneeId(onlyPromos[0].id);
          }
        }
      })
      .catch(err => console.error("Erreur lors de la récupération des années :", err));
  }, []);

  // Fermer le sélecteur si clic à l'extérieur
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (promoSelectorRef.current && !promoSelectorRef.current.contains(e.target as Node)) {
        setShowPromoSelector(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  // Charger les données lorsque les promotions sélectionnées changent
  useEffect(() => {
    if (selectedAnnees.length === 0) {
      setAdvancedStats(null);
      setTemporalData(null);
      return;
    }

    const fetchAllStats = async () => {
      setLoading(true);
      try {
        const idsStr = selectedAnnees.join(',');

        // 1. Charger les statistiques avancées (agrégées sur les promotions cochées)
        const advRes = await fetch(`/api/stats?action=advanced_stats&annee_ids=${idsStr}`);
        const advJson = await advRes.json();
        if (advJson.success) {
          setAdvancedStats(advJson.data);
          if (selectedStudent && advJson.data.student_progressions) {
            const updated = advJson.data.student_progressions.find(
              (p: StudentHistory) => p.email === selectedStudent.email
            );
            setSelectedStudent(updated || null);
          } else {
            setSelectedStudent(null);
          }
        }

        // 2. Charger les statistiques d'évolution temporelle
        const tempRes = await fetch(`/api/stats?action=temporal_evolution&annee_ids=${idsStr}`);
        const tempJson = await tempRes.json();
        if (tempJson.success) {
          setTemporalData(tempJson.data);
          if (tempJson.data.all_bcc_names.length > 0 && !tempJson.data.all_bcc_names.includes(selectedBccCompare)) {
            setSelectedBccCompare(tempJson.data.all_bcc_names[0]);
          }
          setSelectedBccsToCompare(tempJson.data.all_bcc_names || []);
          setSelectedUesToCompare(tempJson.data.all_ue_names || []);
          
          const years = (tempJson.data.timeline || []).map((p: any) => p.year_inscr).filter((y: number) => y > 0);
          if (years.length > 0) {
            setStartYearFilter(Math.min(...years));
            setEndYearFilter(Math.max(...years));
          } else {
            setStartYearFilter('');
            setEndYearFilter('');
          }
        }
      } catch (e) {
        console.error("Erreur lors du chargement des statistiques :", e);
      } finally {
        setLoading(false);
      }
    };

    fetchAllStats();
  }, [selectedAnnees]);

  // Charger l'overview académique pour la promotion de référence (Semestres & BCC)
  useEffect(() => {
    if (!referenceAnneeId) return;

    const calculateStats = (values: number[]) => {
      if (values.length === 0) return { average: 0, median: 0, stddev: 0, min: 0, max: 0 };
      
      const sum = values.reduce((a, b) => a + b, 0);
      const avg = Math.round((sum / values.length) * 100) / 100;
      
      // Median
      const sorted = [...values].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      const median = sorted.length % 2 !== 0 ? sorted[mid] : Math.round(((sorted[mid - 1] + sorted[mid]) / 2) * 100) / 100;
      
      // Std Dev
      const mean = sum / values.length;
      const sumSq = values.reduce((a, b) => a + Math.pow(b - mean, 2), 0);
      const stddev = Math.round(Math.sqrt(sumSq / values.length) * 100) / 100;
      
      const min = Math.min(...values);
      const max = Math.max(...values);
      
      return { average: avg, median, stddev, min, max };
    };

    const fetchAcademicOverview = async () => {
      try {
        const overviewUrl = `/api/stats?action=global_ledger&annee_id=${referenceAnneeId}${location ? `&location=${location}` : ''}`;
        const overviewRes = await fetch(overviewUrl);
        const overviewJson = await overviewRes.json();
        
        if (overviewJson.success && overviewJson.data) {
          const rawData = overviewJson.data;
          const semestersMap: { [key: number]: { nom: string; bcc: any[] } } = {};
          
          rawData.structure.bcc.forEach((bcc: any) => {
            const semId = bcc.semestre_id;
            if (!semestersMap[semId]) {
              semestersMap[semId] = {
                nom: semId === 1 || semId % 2 !== 0 ? "Semestre 1" : "Semestre 2",
                bcc: []
              };
            }
          });

          const bccAveragesMap: { [bccId: number]: { values: number[] } } = {};
          const semAveragesMap: { [semId: number]: { values: number[] } } = {};
          const yearAverages: number[] = [];

          rawData.students.forEach((student: any) => {
            Object.entries(student.grades.bcc).forEach(([bccIdStr, val]: [string, any]) => {
              const bccId = parseInt(bccIdStr);
              if (val !== null && val !== 'DEF') {
                if (!bccAveragesMap[bccId]) bccAveragesMap[bccId] = { values: [] };
                bccAveragesMap[bccId].values.push(val);
              }
            });

            const studentSemSum: { [semId: number]: { sum: number; coeff: number } } = {};
            rawData.structure.bcc.forEach((bcc: any) => {
              const semId = bcc.semestre_id;
              const val = student.grades.bcc[bcc.id];
              if (val !== null && val !== 'DEF') {
                if (!studentSemSum[semId]) studentSemSum[semId] = { sum: 0, coeff: 0 };
                studentSemSum[semId].sum += val;
                studentSemSum[semId].coeff++;
              }
            });

            let studentYearSum = 0;
            let studentYearCoeff = 0;
            Object.entries(studentSemSum).forEach(([semIdStr, sData]: [string, any]) => {
              const semId = parseInt(semIdStr);
              if (sData.coeff > 0) {
                const semAvg = sData.sum / sData.coeff;
                if (!semAveragesMap[semId]) semAveragesMap[semId] = { values: [] };
                semAveragesMap[semId].values.push(semAvg);

                studentYearSum += semAvg;
                studentYearCoeff++;
              }
            });

            if (studentYearCoeff > 0) {
              yearAverages.push(studentYearSum / studentYearCoeff);
            }
          });

          const semestresFormatted = Object.entries(semestersMap).map(([semIdStr, sMap]: [string, any]) => {
            const semId = parseInt(semIdStr);
            const semBccs = rawData.structure.bcc
              .filter((bcc: any) => bcc.semestre_id === semId)
              .map((bcc: any) => {
                const values = bccAveragesMap[bcc.id]?.values || [];
                const bccStats = calculateStats(values);
                return {
                  nom: bcc.nom,
                  ...bccStats
                };
              });

            const semValues = semAveragesMap[semId]?.values || [];
            const semStats = calculateStats(semValues);
            
            return {
              nom: sMap.nom + ` (Sem. ID ${semId})`,
              bcc: semBccs,
              count: semValues.length,
              ...semStats
            };
          });

          const yearStats = calculateStats(yearAverages);

          setAcademicData({
            semestres: semestresFormatted,
            total_year: yearStats
          });
        }
      } catch (e) {
        console.error(e);
      }
    };

    fetchAcademicOverview();
  }, [referenceAnneeId, location]);

  const round = (num: number, decimalPlaces: number) => {
    return Math.round(num * Math.pow(10, decimalPlaces)) / Math.pow(10, decimalPlaces);
  };

  const handleTogglePromoSelection = (id: number) => {
    setSelectedAnnees(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const handleSelectAll = () => {
    setSelectedAnnees(annees.map(a => a.id));
  };

  const handleSelectNone = () => {
    setSelectedAnnees([]);
  };

  const handleSelectActives = () => {
    setSelectedAnnees(annees.filter(a => !a.archived).map(a => a.id));
  };

  // ----------------------------------------------------
  // RENDU DE L'ONGLET : VUE D'ENSEMBLE (PROMOTION)
  // ----------------------------------------------------
  const renderPromoOverview = () => {
    if (!advancedStats) return null;
    const { promo } = advancedStats;

    const admisRate = promo.total_students > 0 ? round((promo.admis / promo.total_students) * 100, 1) : 0;
    
    const statusData = [
      { name: 'Admis', value: promo.admis, color: '#10b981' },
      { name: 'Ajourné', value: promo.ajourne, color: '#f59e0b' },
      { name: 'Incomplet', value: promo.incomplet, color: '#6366f1' },
      { name: 'Défaillant', value: promo.defaillant, color: '#ef4444' }
    ].filter(d => d.value > 0);

    return (
      <div className="space-y-6 animate-in fade-in duration-500">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white/5 border border-white/10 rounded-3xl p-6 flex items-center justify-between hover:bg-white/10 transition-all backdrop-blur-md">
            <div>
              <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest block mb-1">Effectif Total</span>
              <span className="text-4xl font-black text-white">{promo.total_students}</span>
              <p className="text-white/30 text-xs mt-1">Étudiants dans l'échantillon</p>
            </div>
            <div className="w-14 h-14 bg-blue-500/20 rounded-2xl flex items-center justify-center text-blue-400">
              <Users className="w-7 h-7" />
            </div>
          </div>

          <div className="bg-white/5 border border-white/10 rounded-3xl p-6 flex items-center justify-between hover:bg-white/10 transition-all backdrop-blur-md">
            <div>
              <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest block mb-1">Moyenne Générale</span>
              <span className="text-4xl font-black text-white">{promo.average !== null ? promo.average.toFixed(2) : '--'}</span>
              <p className="text-white/30 text-xs mt-1">Moyenne agrégée globale</p>
            </div>
            <div className="w-14 h-14 bg-indigo-500/20 rounded-2xl flex items-center justify-center text-indigo-400">
              <GraduationCap className="w-7 h-7" />
            </div>
          </div>

          <div className="bg-white/5 border border-white/10 rounded-3xl p-6 flex items-center justify-between hover:bg-white/10 transition-all backdrop-blur-md">
            <div>
              <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest block mb-1">Taux Global d'Admission</span>
              <span className="text-4xl font-black text-white">{admisRate}%</span>
              <p className="text-white/30 text-xs mt-1">Étudiants ayant validé l'année</p>
            </div>
            <div className="w-14 h-14 bg-emerald-500/20 rounded-2xl flex items-center justify-center text-emerald-400">
              <Award className="w-7 h-7" />
            </div>
          </div>
        </div>

        {/* Nouveaux indicateurs statistiques de promotion */}
        {(promo.median !== undefined || promo.stddev !== undefined) && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 animate-in fade-in duration-500">
            <div className="bg-white/5 border border-white/10 rounded-3xl p-5 hover:bg-white/10 transition-all backdrop-blur-md">
              <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest block mb-1">Médiane</span>
              <span className="text-2xl font-black text-white">{promo.median !== null && promo.median !== undefined ? promo.median.toFixed(2) : '--'}</span>
              <p className="text-white/30 text-[10px] mt-1">Note du milieu de l'effectif</p>
            </div>
            <div className="bg-white/5 border border-white/10 rounded-3xl p-5 hover:bg-white/10 transition-all backdrop-blur-md">
              <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest block mb-1">Écart-type</span>
              <span className="text-2xl font-black text-white">{promo.stddev !== null && promo.stddev !== undefined ? promo.stddev.toFixed(2) : '--'}</span>
              <p className="text-white/30 text-[10px] mt-1">Dispersion des résultats</p>
            </div>
            <div className="bg-white/5 border border-white/10 rounded-3xl p-5 hover:bg-white/10 transition-all backdrop-blur-md">
              <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest block mb-1">Note Minimale</span>
              <span className="text-2xl font-black text-white">{promo.min !== null && promo.min !== undefined ? promo.min.toFixed(2) : '--'}</span>
              <p className="text-white/30 text-[10px] mt-1">Note la plus basse obtenue</p>
            </div>
            <div className="bg-white/5 border border-white/10 rounded-3xl p-5 hover:bg-white/10 transition-all backdrop-blur-md">
              <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest block mb-1">Note Maximale</span>
              <span className="text-2xl font-black text-white">{promo.max !== null && promo.max !== undefined ? promo.max.toFixed(2) : '--'}</span>
              <p className="text-white/30 text-[10px] mt-1">Note la plus haute obtenue</p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          <div className="bg-white/5 border border-white/10 rounded-3xl p-6 lg:col-span-3 flex flex-col justify-between backdrop-blur-md">
            <div>
              <h3 className="text-lg font-bold text-white mb-1">Décisions du Jury Globale</h3>
              <p className="text-white/40 text-xs mb-6">Répartition cumulée sur l'échantillon sélectionné</p>
            </div>
            <div className="h-64 flex items-center justify-center">
              {statusData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={statusData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={90}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      {statusData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip 
                      contentStyle={{ background: '#1e293b', border: 'none', borderRadius: '12px', color: '#fff' }}
                      itemStyle={{ color: '#fff' }}
                    />
                    <Legend 
                      verticalAlign="bottom" 
                      height={36} 
                      formatter={(value) => <span className="text-xs text-white/70 font-semibold">{value}</span>}
                    />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-white/30 text-sm italic">Aucune donnée disponible.</p>
              )}
            </div>
          </div>

          <div className="bg-white/5 border border-white/10 rounded-3xl p-6 lg:col-span-2 flex flex-col justify-between backdrop-blur-md">
            <div>
              <h3 className="text-lg font-bold text-white mb-1">Effectifs par Statut</h3>
              <p className="text-white/40 text-xs mb-6">Détails des décisions cumulées</p>
            </div>
            <div className="space-y-4">
              {[
                { label: 'Admis', count: promo.admis, total: promo.total_students, colorClass: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' },
                { label: 'Ajournés', count: promo.ajourne, total: promo.total_students, colorClass: 'text-amber-400 bg-amber-500/10 border-amber-500/20' },
                { label: 'Incomplets', count: promo.incomplet, total: promo.total_students, colorClass: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20' },
                { label: 'Défaillants', count: promo.defaillant, total: promo.total_students, colorClass: 'text-red-400 bg-red-500/10 border-red-500/20' }
              ].map(status => {
                const percentage = status.total > 0 ? round((status.count / status.total) * 100, 1) : 0;
                return (
                  <div key={status.label} className={`p-4 rounded-2xl border ${status.colorClass} flex items-center justify-between`}>
                    <div>
                      <h4 className="text-sm font-bold text-white">{status.label}</h4>
                      <p className="text-white/40 text-[10px] mt-0.5">{status.count} étudiant{status.count > 1 ? 's' : ''}</p>
                    </div>
                    <div className="text-right">
                      <span className="text-lg font-black text-white">{percentage}%</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    );
  };

  // ----------------------------------------------------
  // RENDU DE L'ONGLET : SEMESTRES & BCCS (SUR LA PROMO DE RÉFÉRENCE)
  // ----------------------------------------------------
  const renderBccStats = (semIndex: number) => {
    if (!academicData || !academicData.semestres[semIndex]) {
      return (
        <div className="bg-white/5 border border-white/10 rounded-3xl p-8 text-center text-white/30 italic">
          Aucune donnée disponible.
        </div>
      );
    }
    const semestre = academicData.semestres[semIndex];

    return (
      <div className="space-y-6 animate-in fade-in duration-500">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {semestre.bcc.map((bcc: any) => (
            <div key={bcc.nom} className="bg-white/5 border border-white/10 rounded-2xl p-5 hover:bg-white/10 transition-all flex flex-col justify-between">
              <div>
                <div className="flex justify-between items-start mb-4">
                  <span className="text-[10px] font-bold text-white/30 uppercase tracking-widest">Bloc de Compétences</span>
                  <div className={`px-2 py-0.5 rounded text-[10px] font-bold ${bcc.average >= 10 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
                    {bcc.average >= 10 ? 'ADMIS' : 'AJOURNÉ'}
                  </div>
                </div>
                <h4 className="text-white font-bold mb-2 leading-tight h-10 overflow-hidden" title={bcc.nom}>{bcc.nom}</h4>
                <div className="flex items-end gap-2">
                  <span className="text-3xl font-black text-white">{bcc.average}</span>
                  <span className="text-white/30 text-xs mb-1.5">/ 20</span>
                </div>
                <div className="mt-4 w-full bg-white/5 h-1.5 rounded-full overflow-hidden">
                  <div 
                    className={`h-full transition-all duration-1000 ${bcc.average >= 10 ? 'bg-emerald-500' : 'bg-red-500'}`}
                    style={{ width: `${(bcc.average / 20) * 100}%` }}
                  ></div>
                </div>
              </div>

              <div className="grid grid-cols-4 gap-1 mt-4 text-[9px] text-white/40 border-t border-white/5 pt-2 font-mono">
                <div>
                  <span className="block text-white/20 font-bold">Med</span>
                  <span className="text-white/60 font-semibold">{bcc.median !== undefined ? bcc.median.toFixed(2) : '--'}</span>
                </div>
                <div>
                  <span className="block text-white/20 font-bold">Écart</span>
                  <span className="text-white/60 font-semibold">{bcc.stddev !== undefined ? bcc.stddev.toFixed(2) : '--'}</span>
                </div>
                <div>
                  <span className="block text-white/20 font-bold">Min</span>
                  <span className="text-white/60 font-semibold">{bcc.min !== undefined ? bcc.min.toFixed(2) : '--'}</span>
                </div>
                <div>
                  <span className="block text-white/20 font-bold">Max</span>
                  <span className="text-white/60 font-semibold">{bcc.max !== undefined ? bcc.max.toFixed(2) : '--'}</span>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="bg-white/5 border border-white/10 rounded-3xl p-8 flex flex-col lg:flex-row gap-8 items-center">
          <div className="flex-1 flex flex-col md:flex-row items-center gap-8 w-full">
            <div className="text-center md:text-left">
              <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest block mb-1">Moyenne du {semestre.nom}</span>
              <div className="flex items-baseline justify-center md:justify-start gap-2">
                <span className="text-7xl font-black text-white tracking-tighter">{semestre.average.toFixed(2)}</span>
                <span className="text-xl text-white/20 font-bold">/ 20</span>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 flex-1 w-full">
              <div className="bg-white/5 border border-white/5 rounded-2xl p-4 text-center md:text-left">
                <span className="text-[9px] uppercase tracking-widest text-white/30 font-bold block mb-0.5">Médiane</span>
                <span className="text-xl font-black text-white">{semestre.median !== undefined ? semestre.median.toFixed(2) : '--'}</span>
              </div>
              <div className="bg-white/5 border border-white/5 rounded-2xl p-4 text-center md:text-left">
                <span className="text-[9px] uppercase tracking-widest text-white/30 font-bold block mb-0.5">Écart-type</span>
                <span className="text-xl font-black text-white">{semestre.stddev !== undefined ? semestre.stddev.toFixed(2) : '--'}</span>
              </div>
              <div className="bg-white/5 border border-white/5 rounded-2xl p-4 text-center md:text-left">
                <span className="text-[9px] uppercase tracking-widest text-white/30 font-bold block mb-0.5">Minimum</span>
                <span className="text-xl font-black text-white">{semestre.min !== undefined ? semestre.min.toFixed(2) : '--'}</span>
              </div>
              <div className="bg-white/5 border border-white/5 rounded-2xl p-4 text-center md:text-left">
                <span className="text-[9px] uppercase tracking-widest text-white/30 font-bold block mb-0.5">Maximum</span>
                <span className="text-xl font-black text-white">{semestre.max !== undefined ? semestre.max.toFixed(2) : '--'}</span>
              </div>
            </div>
          </div>

          <div className="h-24 w-full lg:w-1/3">
            {semestre.bcc.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={semestre.bcc}>
                  <Bar dataKey="average">
                    {semestre.bcc.map((entry: any, index: number) => (
                      <Cell key={`cell-${index}`} fill={entry.average >= 10 ? '#10b981' : '#ef4444'} fillOpacity={0.6} />
                    ))}
                  </Bar>
                  <Tooltip 
                    contentStyle={{ background: '#1e293b', border: 'none', borderRadius: '12px', color: '#fff' }}
                    cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                  />
                </BarChart>
              </ResponsiveContainer>
            ) : null}
          </div>
        </div>
      </div>
    );
  };

  const renderYearStats = () => {
    if (!academicData) return null;
    return (
      <div className="space-y-8 animate-in zoom-in-95 duration-500">
        <div className="bg-gradient-to-br from-blue-600/20 to-indigo-600/20 border border-white/10 rounded-[2rem] p-10 flex flex-col items-center text-center">
          <Award className="w-16 h-16 text-yellow-400 mb-6 drop-shadow-[0_0_15px_rgba(250,204,21,0.5)]" />
          <h3 className="text-2xl font-bold text-white mb-2">Moyenne Annuelle de la Promo</h3>
          <p className="text-white/50 mb-8 max-w-md">Moyenne générale annuelle agrégée de la promotion de référence.</p>
          
          <div className="flex items-baseline gap-2">
            <span className="text-8xl font-black text-white tracking-tighter">{academicData.total_year.average.toFixed(2)}</span>
            <span className="text-2xl text-white/20 font-bold">/ 20</span>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-8 w-full max-w-lg">
            <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
              <span className="text-[9px] uppercase tracking-widest text-white/30 font-bold block mb-1">Médiane</span>
              <span className="text-lg font-black text-white">{academicData.total_year.median !== undefined ? academicData.total_year.median.toFixed(2) : '--'}</span>
            </div>
            <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
              <span className="text-[9px] uppercase tracking-widest text-white/30 font-bold block mb-1">Écart-type</span>
              <span className="text-lg font-black text-white">{academicData.total_year.stddev !== undefined ? academicData.total_year.stddev.toFixed(2) : '--'}</span>
            </div>
            <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
              <span className="text-[9px] uppercase tracking-widest text-white/30 font-bold block mb-1">Minimum</span>
              <span className="text-lg font-black text-white">{academicData.total_year.min !== undefined ? academicData.total_year.min.toFixed(2) : '--'}</span>
            </div>
            <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
              <span className="text-[9px] uppercase tracking-widest text-white/30 font-bold block mb-1">Maximum</span>
              <span className="text-lg font-black text-white">{academicData.total_year.max !== undefined ? academicData.total_year.max.toFixed(2) : '--'}</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-12 mt-12 w-full max-w-lg border-t border-white/10 pt-8">
            <div className="space-y-2">
              <p className="text-[10px] uppercase tracking-widest text-white/30 font-bold">{academicData.semestres[0]?.nom || 'S1'}</p>
              <p className="text-3xl font-bold text-white">{academicData.semestres[0]?.average || '--'}</p>
            </div>
            <div className="space-y-2">
              <p className="text-[10px] uppercase tracking-widest text-white/30 font-bold">{academicData.semestres[1]?.nom || 'S2'}</p>
              <p className="text-3xl font-bold text-white">{academicData.semestres[1]?.average || '--'}</p>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderSemestersAndBccsTab = () => {
    const selectedPromoObjects = annees.filter(a => selectedAnnees.includes(a.id));

    return (
      <div className="space-y-6">
        {/* Sous-Onglets pour Semestres & BCC */}
        <div className="flex flex-wrap gap-4 justify-between items-center bg-white/5 p-4 rounded-2xl border border-white/10">
          <div className="flex items-center gap-6 flex-wrap">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-white/30" />
              <span className="text-xs text-white/40 uppercase tracking-wider font-semibold mr-1">Promotion de référence :</span>
              <select 
                className="bg-transparent text-white font-bold text-xs outline-none cursor-pointer"
                value={referenceAnneeId || ''}
                onChange={e => setReferenceAnneeId(Number(e.target.value))}
              >
                {selectedPromoObjects.map(a => (
                  <option key={a.id} value={a.id} className="bg-slate-900">{a.nom} {a.archived ? '[Archivé]' : ''}</option>
                ))}
                {selectedPromoObjects.length === 0 && (
                  <option value="">Aucune promotion sélectionnée</option>
                )}
              </select>
            </div>

            <div className="h-6 w-[1px] bg-white/10 hidden md:block"></div>

            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-white/30" />
              <input 
                type="text" 
                placeholder="Filtrer par lieu (ex: Amiens)..."
                className="bg-transparent text-white text-xs outline-none placeholder:text-white/20 w-48"
                value={location}
                onChange={e => setLocation(e.target.value)}
              />
            </div>
          </div>

          <div className="flex bg-white/5 p-1 rounded-xl border border-white/5">
            <button 
              onClick={() => setSemestreTab('s1')}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${semestreTab === 's1' ? 'bg-white/10 text-white shadow-lg' : 'text-white/30 hover:text-white/60'}`}
            >
              Semestre 1
            </button>
            <button 
              onClick={() => setSemestreTab('s2')}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${semestreTab === 's2' ? 'bg-white/10 text-white shadow-lg' : 'text-white/30 hover:text-white/60'}`}
            >
              Semestre 2
            </button>
            <button 
              onClick={() => setSemestreTab('year')}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${semestreTab === 'year' ? 'bg-white/10 text-white shadow-lg' : 'text-white/30 hover:text-white/60'}`}
            >
              Année
            </button>
          </div>
        </div>

        {semestreTab === 's1' && renderBccStats(0)}
        {semestreTab === 's2' && renderBccStats(1)}
        {semestreTab === 'year' && renderYearStats()}
      </div>
    );
  };

  // ----------------------------------------------------
  // RENDU DE L'ONGLET : PROVENANCE & ORIGINES
  // ----------------------------------------------------
  const renderProvenanceTab = () => {
    if (!advancedStats || !advancedStats.provenance) return null;
    const { provenance } = advancedStats;

    const sortedProvenance = [...provenance].sort((a, b) => b.count - a.count);

    return (
      <div className="space-y-6 animate-in fade-in duration-500">
        <div>
          <h2 className="text-xl font-bold text-white mb-1">Analyse par Provenance / Origine</h2>
          <p className="text-white/40 text-xs">Analyse comparative cumulée selon l'établissement d'origine des étudiants de l'échantillon.</p>
        </div>

        <div className="bg-white/5 border border-white/10 rounded-3xl p-6 backdrop-blur-md">
          <h3 className="text-sm font-bold text-white mb-6 uppercase tracking-wider text-white/60">Comparatif des Performances Académiques par Origine</h3>
          <div className="h-72 w-full">
            {sortedProvenance.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={sortedProvenance} margin={{ bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="provenance" stroke="rgba(255,255,255,0.4)" tick={{ fontSize: 10 }} />
                  <YAxis stroke="rgba(255,255,255,0.4)" tick={{ fontSize: 10 }} />
                  <Tooltip 
                    contentStyle={{ background: '#1e293b', border: 'none', borderRadius: '12px', color: '#fff' }}
                  />
                  <Bar dataKey="average" name="Moyenne" radius={[4, 4, 0, 0]}>
                    {sortedProvenance.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={(entry.average && entry.average >= 10) ? '#10b981' : '#f59e0b'} fillOpacity={0.6} />
                    ))}
                  </Bar>
                  <Bar dataKey="admis_rate" name="Taux Réussite (%)" fill="#6366f1" fillOpacity={0.4} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-white/30 italic">Aucune donnée disponible.</div>
            )}
          </div>
        </div>

        <div className="bg-white/5 border border-white/10 rounded-3xl overflow-hidden backdrop-blur-md">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-white/10 text-white/40 text-[10px] font-bold uppercase tracking-wider bg-white/5">
                  <th className="py-4 px-6">Provenance</th>
                  <th className="py-4 px-6 text-center">Effectif</th>
                  <th className="py-4 px-6 text-center">Moyenne Générale</th>
                  <th className="py-4 px-6 text-center">Médiane</th>
                  <th className="py-4 px-6 text-center">Écart-type</th>
                  <th className="py-4 px-6 text-center">Min</th>
                  <th className="py-4 px-6 text-center">Max</th>
                  <th className="py-4 px-6 text-center">Taux d'Admission</th>
                  <th className="py-4 px-6">Réussite</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-sm text-white/80">
                {sortedProvenance.map((prov, i) => (
                  <tr key={i} className="hover:bg-white/5 transition-colors">
                    <td className="py-4 px-6 font-semibold text-white">{prov.provenance}</td>
                    <td className="py-4 px-6 text-center font-bold text-white/60">{prov.count}</td>
                    <td className="py-4 px-6 text-center font-black text-white">
                      {prov.average !== null ? prov.average.toFixed(2) : '--'}
                    </td>
                    <td className="py-4 px-6 text-center font-semibold text-white/70">
                      {prov.median !== null && prov.median !== undefined ? prov.median.toFixed(2) : '--'}
                    </td>
                    <td className="py-4 px-6 text-center font-semibold text-white/70">
                      {prov.stddev !== null && prov.stddev !== undefined ? prov.stddev.toFixed(2) : '--'}
                    </td>
                    <td className="py-4 px-6 text-center font-semibold text-white/70">
                      {prov.min !== null && prov.min !== undefined ? prov.min.toFixed(2) : '--'}
                    </td>
                    <td className="py-4 px-6 text-center font-semibold text-white/70">
                      {prov.max !== null && prov.max !== undefined ? prov.max.toFixed(2) : '--'}
                    </td>
                    <td className="py-4 px-6 text-center font-bold text-indigo-400">
                      {prov.admis_rate}%
                    </td>
                    <td className="py-4 px-6">
                      <div className="w-24 bg-white/5 h-2 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-indigo-500 transition-all duration-500" 
                          style={{ width: `${prov.admis_rate}%` }}
                        ></div>
                      </div>
                    </td>
                  </tr>
                ))}
                {sortedProvenance.length === 0 && (
                  <tr>
                    <td colSpan={9} className="py-8 text-center text-white/30 italic">Aucune provenance enregistrée.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  // ----------------------------------------------------
  // RENDU DE L'ONGLET : DISCIPLINES (TOPS / FLOPS ECUES)
  // ----------------------------------------------------
  const renderEcueStatsTab = () => {
    if (!advancedStats) return null;
    const { best_ecues, worst_ecues } = advancedStats;

    const renderEcueList = (list: EcueStat[], isBest: boolean) => {
      return (
        <div className="space-y-4">
          {list.map((ec, idx) => (
            <div 
              key={ec.id} 
              className="bg-white/5 border border-white/5 hover:border-white/10 rounded-2xl p-4 flex items-center justify-between hover:bg-white/10 transition-all"
            >
              <div className="flex items-center gap-4 min-w-0 flex-1">
                <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold text-xs ${
                  isBest 
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' 
                    : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                }`}>
                  #{idx + 1}
                </div>
                <div className="min-w-0 flex-1">
                  <h4 className="text-white font-bold text-sm truncate leading-tight">{ec.nom}</h4>
                  <p className="text-white/40 text-[10px] uppercase tracking-wider font-semibold truncate mt-0.5">{ec.ue_nom}</p>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1 text-[9px] text-white/30 font-mono">
                    <span>Med: <span className="text-white/60 font-semibold">{ec.median !== undefined && ec.median !== null ? ec.median.toFixed(2) : '--'}</span></span>
                    <span>Écart: <span className="text-white/60 font-semibold">{ec.stddev !== undefined && ec.stddev !== null ? ec.stddev.toFixed(2) : '--'}</span></span>
                    <span>Min: <span className="text-white/60 font-semibold">{ec.min !== undefined && ec.min !== null ? ec.min.toFixed(2) : '--'}</span></span>
                    <span>Max: <span className="text-white/60 font-semibold">{ec.max !== undefined && ec.max !== null ? ec.max.toFixed(2) : '--'}</span></span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-6 text-right ml-4">
                <div>
                  <span className="text-[9px] uppercase tracking-widest text-white/30 font-bold block">Moyenne</span>
                  <span className={`text-base font-black ${isBest ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {ec.average !== null ? ec.average.toFixed(2) : '--'}
                  </span>
                </div>
                <div className="w-20">
                  <span className="text-[9px] uppercase tracking-widest text-white/30 font-bold block">Taux Val.</span>
                  <span className="text-sm font-semibold text-indigo-300">{ec.success_rate}%</span>
                </div>
              </div>
            </div>
          ))}
          {list.length === 0 && (
            <div className="text-center py-8 text-white/20 italic text-sm">
              Aucune donnée d'ECUE disponible.
            </div>
          )}
        </div>
      );
    };

    return (
      <div className="space-y-6 animate-in fade-in duration-500">
        <div>
          <h2 className="text-xl font-bold text-white mb-1">Palmarès des Disciplines (ECUEs)</h2>
          <p className="text-white/40 text-xs">Classement cumulé des matières de la promotion de l'échantillon par moyenne générale.</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white/5 border border-white/10 rounded-3xl p-6 backdrop-blur-md">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 bg-emerald-500/20 text-emerald-400 rounded-xl flex items-center justify-center">
                <TrendingUp className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Tops 5 - Meilleures Moyennes</h3>
                <p className="text-white/30 text-[10px]">Matières avec les moyennes cumulées les plus élevées</p>
              </div>
            </div>
            {renderEcueList(best_ecues, true)}
          </div>

          <div className="bg-white/5 border border-white/10 rounded-3xl p-6 backdrop-blur-md">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 bg-rose-500/20 text-rose-400 rounded-xl flex items-center justify-center">
                <TrendingDown className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Flops 5 - Plus Faibles Moyennes</h3>
                <p className="text-white/30 text-[10px]">Matières les plus complexes pour les étudiants</p>
              </div>
            </div>
            {renderEcueList(worst_ecues, false)}
          </div>
        </div>
      </div>
    );
  };

  // ----------------------------------------------------
  // RENDU DE L'ONGLET : SUIVI DES CURSUS INDIVIDUELS
  // ----------------------------------------------------
  const renderCursusTab = () => {
    if (!advancedStats || !advancedStats.student_progressions) return null;
    const { student_progressions } = advancedStats;

    const filteredProgressions = student_progressions.filter(stud => {
      const fullName = `${stud.nom} ${stud.prenom}`.toLowerCase();
      const search = searchStudent.toLowerCase();
      return fullName.includes(search) || stud.email.toLowerCase().includes(search);
    });

    return (
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in fade-in duration-500">
        <div className="bg-white/5 border border-white/10 rounded-3xl p-6 flex flex-col h-[600px] backdrop-blur-md">
          <div className="mb-4">
            <h3 className="text-base font-bold text-white mb-1">Parcours Multi-Années</h3>
            <p className="text-white/40 text-[10px] mb-4">Liste des étudiants ayant effectué plusieurs inscriptions dans la base.</p>
            
            <div className="relative">
              <Search className="w-4 h-4 text-white/30 absolute left-3 top-1/2 -translate-y-1/2" />
              <input 
                type="text" 
                placeholder="Rechercher un étudiant..."
                className="w-full bg-white/5 border border-white/10 rounded-xl py-2 pl-9 pr-4 text-white text-xs outline-none focus:border-white/20 transition-all placeholder:text-white/20"
                value={searchStudent}
                onChange={e => setSearchStudent(e.target.value)}
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
            {filteredProgressions.map((stud, idx) => {
              const isSelected = selectedStudent?.email === stud.email;
              
              return (
                <button
                  key={idx}
                  onClick={() => setSelectedStudent(stud)}
                  className={`w-full text-left p-3 rounded-xl border transition-all flex items-center justify-between group ${
                    isSelected 
                      ? 'bg-blue-600/20 border-blue-500/40' 
                      : 'bg-white/5 border-white/5 hover:border-white/10 hover:bg-white/10'
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <h4 className="text-white font-bold text-xs truncate group-hover:text-blue-300 transition-colors">
                      {stud.nom.toUpperCase()} {stud.prenom}
                    </h4>
                    <p className="text-white/30 text-[9px] truncate mt-0.5">{stud.email}</p>
                    <span className="inline-block px-1.5 py-0.5 rounded text-[8px] font-bold bg-white/5 text-white/60 mt-1 border border-white/5">
                      {stud.progression.length} inscription{stud.progression.length > 1 ? 's' : ''}
                    </span>
                  </div>
                  <ChevronRight className={`w-4 h-4 transition-transform ${
                    isSelected ? 'text-blue-400 translate-x-1' : 'text-white/20 group-hover:text-white/50'
                  }`} />
                </button>
              );
            })}
            {filteredProgressions.length === 0 && (
              <div className="text-center py-12 text-white/20 italic text-xs">
                Aucun étudiant multi-années trouvé.
              </div>
            )}
          </div>
        </div>

        <div className="bg-white/5 border border-white/10 rounded-3xl p-6 lg:col-span-2 flex flex-col h-[600px] backdrop-blur-md">
          {selectedStudent ? (
            <div className="flex flex-col h-full">
              <div className="border-b border-white/10 pb-6 mb-8 flex justify-between items-start">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-gradient-to-tr from-blue-600 to-indigo-600 rounded-2xl flex items-center justify-center text-white font-black text-lg shadow-lg shadow-blue-500/20">
                    {selectedStudent.prenom[0]}{selectedStudent.nom[0]}
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-white leading-tight">
                      {selectedStudent.prenom} {selectedStudent.nom.toUpperCase()}
                    </h2>
                    <p className="text-white/40 text-xs mt-0.5">{selectedStudent.email}</p>
                  </div>
                </div>

                <div className="text-right">
                  <span className="text-[10px] uppercase tracking-widest text-white/30 font-bold block mb-1">Status Cursus</span>
                  <div className="flex items-center gap-1 text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-3 py-1 font-bold text-xs">
                    <History className="w-3.5 h-3.5" />
                    Suivi Actif
                  </div>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
                <div className="relative border-l-2 border-white/10 ml-6 pl-8 space-y-12 py-4">
                  {selectedStudent.progression.map((prog, idx) => {
                    const isAdmis = prog.status === 'ADMIS';
                    const isDef = prog.status === 'DÉFAILLANT';
                    const isAjourne = prog.status === 'AJOURNÉ';
                    
                    return (
                      <div key={idx} className="relative">
                        <div className={`absolute -left-[41px] top-1 w-6 h-6 rounded-full border-4 border-slate-950 flex items-center justify-center ${
                          isAdmis 
                            ? 'bg-emerald-500 text-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]' 
                            : isDef 
                            ? 'bg-red-500 text-red-500 shadow-[0_0_10px_rgba(239,68,68,0.5)]'
                            : isAjourne
                            ? 'bg-amber-500 text-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.5)]'
                            : 'bg-indigo-500 text-indigo-500 shadow-[0_0_10px_rgba(99,102,241,0.5)]'
                        }`}></div>

                        <div className="bg-white/5 border border-white/5 hover:border-white/10 hover:bg-white/10 p-5 rounded-2xl transition-all">
                          <div className="flex flex-wrap items-start justify-between gap-2 mb-4">
                            <div>
                              <span className="text-[10px] font-bold text-white/30 uppercase tracking-widest block mb-1">Année Inscription: {prog.annee_inscription}</span>
                              <h4 className="text-white font-bold text-base leading-tight">{prog.annee_nom}</h4>
                            </div>
                            
                            <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold border ${
                              isAdmis 
                                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
                                : isDef 
                                ? 'bg-red-500/10 text-red-400 border-red-500/20' 
                                : isAjourne
                                ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                                : 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20'
                            }`}>
                              {isAdmis && <CheckCircle2 className="w-3.5 h-3.5" />}
                              {(isDef || isAjourne) && <XCircle className="w-3.5 h-3.5" />}
                              {!isAdmis && !isDef && !isAjourne && <AlertCircle className="w-3.5 h-3.5" />}
                              {prog.status}
                            </div>
                          </div>

                          <div className="flex items-end gap-2">
                            <span className="text-[10px] font-bold text-white/30 uppercase tracking-widest pb-1.5 block">Moyenne Générale :</span>
                            <span className="text-3xl font-black text-white">{prog.average !== null ? prog.average : '--'}</span>
                            <span className="text-white/30 text-xs mb-1.5">/ 20</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-white/20">
              <History className="w-16 h-16 text-white/10 mb-4" />
              <h3 className="text-base font-bold text-white/40">Suivi Chronologique</h3>
              <p className="text-xs text-white/20 max-w-xs text-center mt-1">Sélectionnez un étudiant dans la liste de gauche pour visualiser sa progression temporelle.</p>
            </div>
          )}
        </div>
      </div>
    );
  };

  // ----------------------------------------------------
  // RENDU DE L'ONGLET : ÉVOLUTION TEMPORELLE
  // ----------------------------------------------------
  const renderTemporalTab = () => {
    if (selectedAnnees.length <= 1) {
      return (
        <div className="bg-white/5 border border-white/10 rounded-3xl p-10 text-center text-white/40 max-w-md mx-auto space-y-4">
          <LineIcon className="w-12 h-12 text-indigo-400/50 mx-auto" />
          <h3 className="font-bold text-white">Analyse Temporelle Indisponible</h3>
          <p className="text-xs leading-relaxed">Veuillez sélectionner au moins **2 promotions** dans le filtre de promotions en haut de la page pour pouvoir tracer la courbe d'évolution temporelle du niveau.</p>
        </div>
      );
    }

    if (!temporalData || !temporalData.timeline) return null;
    const { timeline, all_bcc_names, all_ue_names } = temporalData;

    // Récupérer toutes les années d'inscription uniques pour le filtre d'intervalle
    const uniqueYears = Array.from(
      new Set(timeline.map(p => p.year_inscr).filter(y => y > 0))
    ).sort((a, b) => a - b);

    // Filtrer la timeline selon l'intervalle d'années sélectionné
    const filteredTimeline = timeline.filter(point => {
      if (point.year_inscr === 0) return true; // Conserver les promos sans étudiants au cas où
      const start = startYearFilter === '' ? -Infinity : Number(startYearFilter);
      const end = endYearFilter === '' ? Infinity : Number(endYearFilter);
      return point.year_inscr >= start && point.year_inscr <= end;
    });

    // Palette de couleurs premium pour les courbes multiples
    const LINE_COLORS = [
      '#6366f1', // Indigo
      '#10b981', // Émeraude
      '#f59e0b', // Ambre
      '#ec4899', // Rose
      '#06b6d4', // Cyan
      '#ef4444', // Rouge
      '#8b5cf6', // Violet
      '#14b8a6', // Turquoise (Teal)
      '#f97316', // Orange
      '#3b82f6', // Bleu
    ];

    // Préparer les données du graphique selon le mode actif
    const chartData = filteredTimeline.map(point => {
      const dataObj: any = {
        name: point.annee_nom,
      };

      if (temporalMode === 'general') {
        dataObj["Moyenne Générale"] = point.average !== null ? round(point.average, 2) : null;
        dataObj["Taux d'Admission (%)"] = point.admis_rate;
      } else if (temporalMode === 'bccs') {
        all_bcc_names.forEach(bcc => {
          dataObj[bcc] = point.bccs[bcc] !== undefined ? round(point.bccs[bcc], 2) : null;
        });
      } else if (temporalMode === 'ues') {
        all_ue_names.forEach(ue => {
          dataObj[ue] = point.ues && point.ues[ue] !== undefined ? round(point.ues[ue], 2) : null;
        });
      }

      return dataObj;
    });

    return (
      <div className="space-y-6 animate-in fade-in duration-500">
        {/* Titre et Sélecteurs principaux */}
        <div className="flex flex-wrap items-center justify-between gap-6 bg-white/5 p-6 rounded-3xl border border-white/10 backdrop-blur-md">
          <div className="space-y-1">
            <h2 className="text-lg font-bold text-white">Évolution Temporelle des Résultats</h2>
            <p className="text-white/40 text-xs">Analysez chronologiquement le niveau des promotions globales ou par compétences.</p>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            {/* Filtre d'intervalle d'années */}
            <div className="flex items-center gap-2 bg-white/5 px-3 py-1.5 rounded-xl border border-white/5">
              <span className="text-[10px] text-white/40 font-bold uppercase tracking-wider">Période :</span>
              <select
                value={startYearFilter}
                onChange={e => setStartYearFilter(e.target.value === '' ? '' : Number(e.target.value))}
                className="bg-transparent text-white text-xs font-bold outline-none cursor-pointer"
              >
                <option value="" className="bg-slate-900">Début</option>
                {uniqueYears.map(y => (
                  <option key={y} value={y} className="bg-slate-900">{y}</option>
                ))}
              </select>
              <span className="text-white/20 text-xs">à</span>
              <select
                value={endYearFilter}
                onChange={e => setEndYearFilter(e.target.value === '' ? '' : Number(e.target.value))}
                className="bg-transparent text-white text-xs font-bold outline-none cursor-pointer"
              >
                <option value="" className="bg-slate-900">Fin</option>
                {uniqueYears.map(y => (
                  <option key={y} value={y} className="bg-slate-900">{y}</option>
                ))}
              </select>
            </div>

            {/* Toggle de Mode (Général, BCCs, UEs) */}
            <div className="flex bg-white/5 p-1 rounded-xl border border-white/5">
              <button
                onClick={() => setTemporalMode('general')}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                  temporalMode === 'general' ? 'bg-white/10 text-white shadow' : 'text-white/30 hover:text-white/60'
                }`}
              >
                Général
              </button>
              <button
                onClick={() => setTemporalMode('bccs')}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                  temporalMode === 'bccs' ? 'bg-white/10 text-white shadow' : 'text-white/30 hover:text-white/60'
                }`}
              >
                BCCs
              </button>
              <button
                onClick={() => setTemporalMode('ues')}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                  temporalMode === 'ues' ? 'bg-white/10 text-white shadow' : 'text-white/30 hover:text-white/60'
                }`}
              >
                UEs
              </button>
            </div>
          </div>
        </div>

        {/* Sélection des sous-éléments (uniquement si mode BCCs ou UEs actif) */}
        {temporalMode === 'bccs' && (
          <div className="bg-white/5 border border-white/10 rounded-3xl p-6 space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-[10px] font-black uppercase tracking-widest text-white/30">Sélectionner les BCCs à tracer :</span>
              <div className="flex gap-2">
                <button
                  onClick={() => setSelectedBccsToCompare(all_bcc_names)}
                  className="px-2 py-0.5 rounded bg-white/5 hover:bg-white/10 text-[9px] text-white/70 font-bold transition-all"
                >
                  Tout cocher
                </button>
                <button
                  onClick={() => setSelectedBccsToCompare([])}
                  className="px-2 py-0.5 rounded bg-white/5 hover:bg-white/10 text-[9px] text-white/70 font-bold transition-all"
                >
                  Tout décocher
                </button>
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {all_bcc_names.map((bccName, idx) => {
                const checked = selectedBccsToCompare.includes(bccName);
                const color = LINE_COLORS[idx % LINE_COLORS.length];
                return (
                  <label
                    key={bccName}
                    className={`flex items-center gap-3 p-3 rounded-2xl cursor-pointer border transition-all ${
                      checked 
                        ? 'bg-white/5 border-white/20 text-white' 
                        : 'bg-transparent border-white/5 text-white/30 hover:bg-white/5'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => {
                        if (checked) {
                          setSelectedBccsToCompare(selectedBccsToCompare.filter(x => x !== bccName));
                        } else {
                          setSelectedBccsToCompare([...selectedBccsToCompare, bccName]);
                        }
                      }}
                      className="rounded border-white/10 text-blue-600 focus:ring-0 focus:ring-offset-0 bg-transparent w-3.5 h-3.5 cursor-pointer"
                    />
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }}></span>
                      <span className="text-xs font-semibold truncate">{bccName}</span>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>
        )}

        {temporalMode === 'ues' && (
          <div className="bg-white/5 border border-white/10 rounded-3xl p-6 space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-[10px] font-black uppercase tracking-widest text-white/30">Sélectionner les UEs à tracer :</span>
              <div className="flex gap-2">
                <button
                  onClick={() => setSelectedUesToCompare(all_ue_names)}
                  className="px-2 py-0.5 rounded bg-white/5 hover:bg-white/10 text-[9px] text-white/70 font-bold transition-all"
                >
                  Tout cocher
                </button>
                <button
                  onClick={() => setSelectedUesToCompare([])}
                  className="px-2 py-0.5 rounded bg-white/5 hover:bg-white/10 text-[9px] text-white/70 font-bold transition-all"
                >
                  Tout décocher
                </button>
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {all_ue_names.map((ueName, idx) => {
                const checked = selectedUesToCompare.includes(ueName);
                const color = LINE_COLORS[idx % LINE_COLORS.length];
                return (
                  <label
                    key={ueName}
                    className={`flex items-center gap-3 p-3 rounded-2xl cursor-pointer border transition-all ${
                      checked 
                        ? 'bg-white/5 border-white/20 text-white' 
                        : 'bg-transparent border-white/5 text-white/30 hover:bg-white/5'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => {
                        if (checked) {
                          setSelectedUesToCompare(selectedUesToCompare.filter(x => x !== ueName));
                        } else {
                          setSelectedUesToCompare([...selectedUesToCompare, ueName]);
                        }
                      }}
                      className="rounded border-white/10 text-blue-600 focus:ring-0 focus:ring-offset-0 bg-transparent w-3.5 h-3.5 cursor-pointer"
                    />
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }}></span>
                      <span className="text-xs font-semibold truncate">{ueName}</span>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>
        )}

        {/* Graphique temporel */}
        <div className="bg-white/5 border border-white/10 rounded-3xl p-6 backdrop-blur-md">
          <div className="h-96 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="name" stroke="rgba(255,255,255,0.4)" tick={{ fontSize: 10 }} />
                
                {temporalMode === 'general' ? (
                  <>
                    <YAxis yAxisId="left" stroke="rgba(255,255,255,0.4)" domain={[0, 20]} label={{ value: 'Moyennes / 20', angle: -90, position: 'insideLeft', style: { fill: 'rgba(255,255,255,0.4)', fontSize: 10 } }} />
                    <YAxis yAxisId="right" orientation="right" stroke="rgba(255,255,255,0.4)" domain={[0, 100]} label={{ value: "Taux d'Admission (%)", angle: 90, position: 'insideRight', style: { fill: 'rgba(255,255,255,0.4)', fontSize: 10 } }} />
                    <Tooltip contentStyle={{ background: '#1e293b', border: 'none', borderRadius: '12px', color: '#fff' }} />
                    <Legend verticalAlign="top" height={36} formatter={(value) => <span className="text-xs text-white/70 font-semibold">{value}</span>} />
                    
                    <Line yAxisId="left" type="monotone" dataKey="Moyenne Générale" stroke="#10b981" strokeWidth={3} activeDot={{ r: 8 }} dot={{ strokeWidth: 2 }} connectNulls />
                    <Line yAxisId="right" type="monotone" dataKey="Taux d'Admission (%)" stroke="#6366f1" strokeWidth={2} strokeDasharray="5 5" connectNulls />
                  </>
                ) : temporalMode === 'bccs' ? (
                  <>
                    <YAxis stroke="rgba(255,255,255,0.4)" domain={[0, 20]} label={{ value: 'Moyennes BCC / 20', angle: -90, position: 'insideLeft', style: { fill: 'rgba(255,255,255,0.4)', fontSize: 10 } }} />
                    <Tooltip contentStyle={{ background: '#1e293b', border: 'none', borderRadius: '12px', color: '#fff' }} />
                    <Legend verticalAlign="top" height={36} formatter={(value) => <span className="text-xs text-white/70 font-semibold">{value}</span>} />
                    {selectedBccsToCompare.map((bccName) => {
                      const originIdx = all_bcc_names.indexOf(bccName);
                      return (
                        <Line
                          key={bccName}
                          type="monotone"
                          dataKey={bccName}
                          stroke={LINE_COLORS[originIdx % LINE_COLORS.length]}
                          strokeWidth={3}
                          dot={{ strokeWidth: 2 }}
                          activeDot={{ r: 6 }}
                          connectNulls
                        />
                      );
                    })}
                  </>
                ) : (
                  <>
                    <YAxis stroke="rgba(255,255,255,0.4)" domain={[0, 20]} label={{ value: 'Moyennes UE / 20', angle: -90, position: 'insideLeft', style: { fill: 'rgba(255,255,255,0.4)', fontSize: 10 } }} />
                    <Tooltip contentStyle={{ background: '#1e293b', border: 'none', borderRadius: '12px', color: '#fff' }} />
                    <Legend verticalAlign="top" height={36} formatter={(value) => <span className="text-xs text-white/70 font-semibold">{value}</span>} />
                    {selectedUesToCompare.map((ueName) => {
                      const originIdx = all_ue_names.indexOf(ueName);
                      return (
                        <Line
                          key={ueName}
                          type="monotone"
                          dataKey={ueName}
                          stroke={LINE_COLORS[originIdx % LINE_COLORS.length]}
                          strokeWidth={3}
                          dot={{ strokeWidth: 2 }}
                          activeDot={{ r: 6 }}
                          connectNulls
                        />
                      );
                    })}
                  </>
                )}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Tableau récapitulatif chronologique */}
        <div className="bg-white/5 border border-white/10 rounded-3xl overflow-x-auto backdrop-blur-md">
          <table className="w-full border-collapse text-left text-sm text-white/80 min-w-[600px]">
            <thead>
              <tr className="border-b border-white/10 text-white/40 text-[10px] font-bold uppercase tracking-wider bg-white/5">
                <th className="py-4 px-6">Promotion</th>
                <th className="py-4 px-6 text-center">Année Inscr.</th>
                {temporalMode === 'general' && (
                  <>
                    <th className="py-4 px-6 text-center">Moyenne Générale</th>
                    <th className="py-4 px-6 text-center">Médiane</th>
                    <th className="py-4 px-6 text-center">Écart-type</th>
                    <th className="py-4 px-6 text-center">Min</th>
                    <th className="py-4 px-6 text-center">Max</th>
                    <th className="py-4 px-6 text-center">Taux de Réussite</th>
                  </>
                )}
                {temporalMode === 'bccs' && selectedBccsToCompare.map(bcc => (
                  <th key={bcc} className="py-4 px-6 text-center">Moy. {bcc}</th>
                ))}
                {temporalMode === 'ues' && selectedUesToCompare.map(ue => (
                  <th key={ue} className="py-4 px-6 text-center">Moy. {ue}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filteredTimeline.map((point, idx) => (
                <tr key={idx} className="hover:bg-white/5 transition-colors">
                  <td className="py-4 px-6 font-semibold text-white">{point.annee_nom}</td>
                  <td className="py-4 px-6 text-center text-white/40">{point.year_inscr || '--'}</td>
                  
                  {temporalMode === 'general' && (
                    <>
                      <td className="py-4 px-6 text-center font-black text-emerald-400">
                        {point.average !== null ? point.average.toFixed(2) : '--'}
                      </td>
                      <td className="py-4 px-6 text-center font-semibold text-white/70">
                        {point.median !== null && point.median !== undefined ? point.median.toFixed(2) : '--'}
                      </td>
                      <td className="py-4 px-6 text-center font-semibold text-white/70">
                        {point.stddev !== null && point.stddev !== undefined ? point.stddev.toFixed(2) : '--'}
                      </td>
                      <td className="py-4 px-6 text-center font-semibold text-white/70">
                        {point.min !== null && point.min !== undefined ? point.min.toFixed(2) : '--'}
                      </td>
                      <td className="py-4 px-6 text-center font-semibold text-white/70">
                        {point.max !== null && point.max !== undefined ? point.max.toFixed(2) : '--'}
                      </td>
                      <td className="py-4 px-6 text-center font-bold text-indigo-400">{point.admis_rate}%</td>
                    </>
                  )}
                  
                  {temporalMode === 'bccs' && selectedBccsToCompare.map(bcc => {
                    const val = point.bccs[bcc];
                    return (
                      <td key={bcc} className="py-4 px-6 text-center font-bold text-blue-400">
                        {val !== undefined && val !== null ? val.toFixed(2) : '--'}
                      </td>
                    );
                  })}

                  {temporalMode === 'ues' && selectedUesToCompare.map(ue => {
                    const val = point.ues && point.ues[ue];
                    return (
                      <td key={ue} className="py-4 px-6 text-center font-bold text-purple-400">
                        {val !== undefined && val !== null ? val.toFixed(2) : '--'}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  return (
    <div className="h-full flex flex-col gap-6">
      {/* Barre d'entête & Sélecteur de promotions multiples */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white/5 p-4 rounded-2xl border border-white/10 backdrop-blur-md relative z-40">
        <div className="flex items-center gap-6" ref={promoSelectorRef}>
          {/* Sélecteur personnalisé multiples */}
          <div className="relative">
            <button 
              onClick={() => setShowPromoSelector(!showPromoSelector)}
              className="flex items-center gap-2 bg-white/5 border border-white/10 hover:border-white/20 rounded-xl px-4 py-2 text-white font-bold text-xs outline-none cursor-pointer transition-all active:scale-95"
            >
              <Calendar className="w-4 h-4 text-white/30" />
              <span>Promotions ({selectedAnnees.length} sélectionnée{selectedAnnees.length > 1 ? 's' : ''})</span>
              <ChevronDown className="w-3.5 h-3.5 text-white/30" />
            </button>

            {showPromoSelector && (
              <div className="absolute left-0 mt-2 bg-slate-900 border border-white/10 rounded-2xl p-4 shadow-2xl z-50 w-72 space-y-3 animate-in fade-in zoom-in-95 duration-200">
                <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest text-white/30 pb-2 border-b border-white/5">
                  <span>Sélection des Promotions</span>
                </div>
                
                {/* Raccourcis de sélection */}
                <div className="flex flex-wrap gap-1.5">
                  <button onClick={handleSelectAll} className="px-2 py-0.5 rounded bg-white/5 hover:bg-white/10 text-[9px] text-white/70 font-bold transition-all">Toutes</button>
                  <button onClick={handleSelectNone} className="px-2 py-0.5 rounded bg-white/5 hover:bg-white/10 text-[9px] text-white/70 font-bold transition-all">Aucune</button>
                  <button onClick={handleSelectActives} className="px-2 py-0.5 rounded bg-emerald-500/10 hover:bg-emerald-500/20 text-[9px] text-emerald-400 font-bold transition-all">Actives</button>
                </div>

                {/* Liste des promotions */}
                <div className="max-h-52 overflow-y-auto space-y-1 pr-1 custom-scrollbar">
                  {annees.map(a => {
                    const isChecked = selectedAnnees.includes(a.id);
                    return (
                      <label 
                        key={a.id} 
                        className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer hover:bg-white/5 transition-all ${a.archived ? 'opacity-40' : ''}`}
                      >
                        <input 
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => handleTogglePromoSelection(a.id)}
                          className="rounded border-white/10 text-blue-600 focus:ring-0 focus:ring-offset-0 bg-transparent w-3.5 h-3.5 cursor-pointer"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-xs text-white font-medium truncate">{a.nom}</p>
                          {a.archived === 1 && (
                            <span className="text-[7px] text-red-400 font-black tracking-widest uppercase">Archivée</span>
                          )}
                        </div>
                        {isChecked && <Check className="w-3.5 h-3.5 text-blue-400" />}
                      </label>
                    );
                  })}
                  {annees.length === 0 && (
                    <p className="text-center text-[10px] text-white/20 italic py-4">Aucune promotion disponible.</p>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Onglets Principaux */}
        <div className="flex bg-white/5 p-1 rounded-xl border border-white/5">
          <button 
            onClick={() => setActiveTab('promo')}
            className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
              activeTab === 'promo' ? 'bg-white/10 text-white shadow-lg' : 'text-white/30 hover:text-white/60'
            }`}
          >
            <BarChart3 className="w-3.5 h-3.5" />
            Promotion
          </button>
          <button 
            onClick={() => setActiveTab('semesters')}
            className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
              activeTab === 'semesters' ? 'bg-white/10 text-white shadow-lg' : 'text-white/30 hover:text-white/60'
            }`}
          >
            <TrendingUp className="w-3.5 h-3.5" />
            Semestres & BCC
          </button>
          <button 
            onClick={() => setActiveTab('provenance')}
            className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
              activeTab === 'provenance' ? 'bg-white/10 text-white shadow-lg' : 'text-white/30 hover:text-white/60'
            }`}
          >
            <MapPin className="w-3.5 h-3.5" />
            Provenance
          </button>
          <button 
            onClick={() => setActiveTab('ecues')}
            className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
              activeTab === 'ecues' ? 'bg-white/10 text-white shadow-lg' : 'text-white/30 hover:text-white/60'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            Tops / Flops
          </button>
          <button 
            onClick={() => setActiveTab('progressions')}
            className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
              activeTab === 'progressions' ? 'bg-white/10 text-white shadow-lg' : 'text-white/30 hover:text-white/60'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            Suivi Cursus
          </button>
          <button 
            onClick={() => setActiveTab('temporal')}
            className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
              activeTab === 'temporal' ? 'bg-white/10 text-white shadow-lg' : 'text-white/30 hover:text-white/60'
            }`}
          >
            <LineIcon className="w-3.5 h-3.5" />
            Évolution
          </button>
        </div>
      </div>

      {/* Zone principale d'affichage */}
      <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-64 text-white/20">
            <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mb-4"></div>
            <p className="text-xs font-bold uppercase tracking-widest">Calcul des statistiques en cours...</p>
          </div>
        ) : (
          <>
            {activeTab === 'promo' && renderPromoOverview()}
            {activeTab === 'semesters' && renderSemestersAndBccsTab()}
            {activeTab === 'provenance' && renderProvenanceTab()}
            {activeTab === 'ecues' && renderEcueStatsTab()}
            {activeTab === 'progressions' && renderCursusTab()}
            {activeTab === 'temporal' && renderTemporalTab()}
          </>
        )}
      </div>
    </div>
  );
};

export default StatsDashboard;
