import React, { useState, useEffect } from 'react';
import { MapPin, Calendar, Info, Link2 } from 'lucide-react';

const GradeLedger: React.FC = () => {
    const [annees, setAnnees] = useState<any[]>([]);
    const [selectedAnnee, setSelectedAnnee] = useState<number | null>(null);
    const [location, setLocation] = useState<string>('');
    const [ledgerData, setLedgerData] = useState<any>(null);
    const [loading, setLoading] = useState(false);
    const [activeTab, setActiveTab] = useState<'s1' | 's2' | 'annual'>('annual');
    const [sortBy, setSortBy] = useState<'alpha' | 'rank'>('alpha');

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
            });
    }, []);

    const fetchLedger = async () => {
        if (!selectedAnnee) return;
        setLoading(true);
        try {
            const url = `/api/stats?action=global_ledger&annee_id=${selectedAnnee}${location ? `&location=${location}` : ''}`;
            const response = await fetch(url);
            const result = await response.json();
            if (result.success) {
                setLedgerData(result.data);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchLedger();
    }, [selectedAnnee, location]);

    if (loading && !ledgerData) return <div className="p-12 text-center text-white/20 uppercase tracking-widest text-xs font-bold animate-pulse">Génération du grand livre...</div>;

    // Récupérer les BCC jumeaux pour la vue annuelle
    const getAnnualGroups = () => {
        if (!ledgerData) return [];
        const groups: any[] = [];
        const processedIds = new Set();

        ledgerData.structure.bcc.forEach((b: any) => {
            if (processedIds.has(b.id)) return;
            const twin = ledgerData.structure.bcc.find((t: any) => t.id === b.twin_id);
            if (twin) {
                groups.push({ type: 'annual', b1: b, b2: twin, nom: `${b.nom} / ${twin.nom}` });
                processedIds.add(b.id);
                processedIds.add(twin.id);
            } else {
                groups.push({ type: 'single', b1: b, nom: b.nom });
                processedIds.add(b.id);
            }
        });
        return groups;
    };

    const bccGroups = getAnnualGroups();

    const calculateStudentAnnualAverage = (student: any) => {
        if (!student || student.grades?.year === undefined) return null;
        return student.grades.year;
    };

    const computeStats = (grades: number[]) => {
        if (grades.length === 0) return { avg: null, med: null, std: null, min: null, max: null };
        const sum = grades.reduce((a, b) => a + b, 0);
        const avg = sum / grades.length;
        
        const sorted = [...grades].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        const med = sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
        
        const sumSq = grades.reduce((sumSq, val) => sumSq + Math.pow(val - avg, 2), 0);
        const std = Math.sqrt(sumSq / grades.length);
        
        const min = Math.min(...grades);
        const max = Math.max(...grades);
        
        return {
            avg,
            med,
            std,
            min,
            max
        };
    };

    const getColumnGrades = (
        type: 'ecue' | 'ue' | 'bcc' | 'bcc_annuel' | 'annualAvg' | 'bonus' | 'malus',
        id: number | string | null,
        semId?: number | null
    ): number[] => {
        if (!ledgerData) return [];
        return ledgerData.students.map((student: any) => {
            if (type === 'ecue') {
                return student.grades.ecue[id as number];
            } else if (type === 'ue') {
                return student.grades.ue[id as number];
            } else if (type === 'bcc') {
                return student.grades.bcc[id as number];
            } else if (type === 'bcc_annuel') {
                return student.grades.bcc_annuel[id as number];
            } else if (type === 'annualAvg') {
                return calculateStudentAnnualAverage(student);
            } else if (type === 'bonus') {
                if (!semId) return null;
                const bm = student.bonus_malus?.[semId];
                return bm ? bm.bonus : null;
            } else if (type === 'malus') {
                if (!semId) return null;
                const bm = student.bonus_malus?.[semId];
                return bm ? bm.malus : null;
            }
            return null;
        }).filter((v: any) => v !== null && v !== undefined && !isNaN(Number(v)) && v !== 'DEF' && v !== 'ABI' && v !== 'ABJ').map(Number);
    };

    const statsRows = [
        { label: 'Moyenne Promotion', key: 'avg' as const, colorClass: 'text-emerald-400 bg-emerald-500/5' },
        { label: 'Médiane', key: 'med' as const, colorClass: 'text-blue-400 bg-blue-500/5' },
        { label: 'Écart-type', key: 'std' as const, colorClass: 'text-purple-400 bg-purple-500/5' },
        { label: 'Minimum', key: 'min' as const, colorClass: 'text-red-400 bg-red-500/5' },
        { label: 'Maximum', key: 'max' as const, colorClass: 'text-indigo-400 bg-indigo-500/5' }
    ];

    const getRanksMap = () => {
        if (!ledgerData) return {};
        const studentAverages = ledgerData.students.map((s: any) => {
            const avg = calculateStudentAnnualAverage(s);
            return {
                studentId: s.id,
                average: typeof avg === 'number' ? avg : -1,
                isDef: avg === 'DEF' || avg === null
            };
        });

        const sortedAverages = [...studentAverages].sort((a, b) => {
            if (a.isDef && b.isDef) return 0;
            if (a.isDef) return 1;
            if (b.isDef) return -1;
            return b.average - a.average;
        });

        const ranksMap: Record<number, number> = {};
        let currentRank = 1;
        for (let i = 0; i < sortedAverages.length; i++) {
            const current = sortedAverages[i];
            if (current.isDef) {
                ranksMap[current.studentId] = -1;
                continue;
            }
            if (i > 0 && sortedAverages[i - 1].average === current.average) {
                ranksMap[current.studentId] = ranksMap[sortedAverages[i - 1].studentId];
            } else {
                ranksMap[current.studentId] = currentRank;
            }
            currentRank++;
        }
        return ranksMap;
    };

    const ranksMap = getRanksMap();

    const getSortedStudents = () => {
        if (!ledgerData) return [];
        const studentsWithData = ledgerData.students.map((student: any) => {
            const annualAvg = calculateStudentAnnualAverage(student);
            const rank = ranksMap[student.id] ?? -1;
            return {
                ...student,
                annualAvg,
                rank
            };
        });

        if (sortBy === 'alpha') {
            return [...studentsWithData].sort((a, b) => {
                const nameA = `${a.nom} ${a.prenom}`.toLowerCase();
                const nameB = `${b.nom} ${b.prenom}`.toLowerCase();
                return nameA.localeCompare(nameB);
            });
        } else {
            return [...studentsWithData].sort((a, b) => {
                if (a.rank === -1 && b.rank === -1) {
                    const nameA = `${a.nom} ${a.prenom}`.toLowerCase();
                    const nameB = `${b.nom} ${b.prenom}`.toLowerCase();
                    return nameA.localeCompare(nameB);
                }
                if (a.rank === -1) return 1;
                if (b.rank === -1) return -1;
                return a.rank - b.rank;
            });
        }
    };

    const getMention = (avg: any, status: string) => {
        if (typeof avg !== 'number' || status !== 'ADMIS') return '-';
        if (avg >= 16.0) return 'Très Bien';
        if (avg >= 14.0) return 'Bien';
        if (avg >= 12.0) return 'Assez Bien';
        if (avg >= 10.0) return 'Passable';
        return '-';
    };

    const currentAnnee = annees.find(a => a.id === selectedAnnee);
    const s1Nom = currentAnnee?.semestres?.[0]?.nom || 'Semestre 1';
    const s2Nom = currentAnnee?.semestres?.[1]?.nom || 'Semestre 2';

    const getFilteredBCCs = () => {
        if (!ledgerData) return [];
        if (!currentAnnee || !currentAnnee.semestres) return ledgerData.structure.bcc;
        
        if (activeTab === 's1') {
            const s1 = currentAnnee.semestres[0];
            return ledgerData.structure.bcc.filter((b: any) => b.semestre_id === s1?.id);
        } else if (activeTab === 's2') {
            const s2 = currentAnnee.semestres[1];
            return ledgerData.structure.bcc.filter((b: any) => b.semestre_id === s2?.id);
        }
        return ledgerData.structure.bcc;
    };

    return (
        <div className="h-full flex flex-col gap-6">
            {/* Toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-4 bg-white/5 p-4 rounded-2xl border border-white/10 backdrop-blur-md">
                <div className="flex items-center gap-6">
                    <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-white/30" />
                        <select 
                            className="bg-transparent text-white font-bold text-sm outline-none cursor-pointer"
                            value={selectedAnnee || ''}
                            onChange={e => setSelectedAnnee(Number(e.target.value))}
                            data-help="Sélectionner la promotion d'étudiants active"
                        >
                            {annees.filter(a => a.is_maquette === 0 && (!a.archived || a.id === selectedAnnee)).map(a => <option key={a.id} value={a.id} className="bg-slate-900">{a.nom}</option>)}
                        </select>
                    </div>
                    <div className="h-6 w-[1px] bg-white/10"></div>
                    <div className="flex items-center gap-2">
                        <MapPin className="w-4 h-4 text-white/30" />
                        <input 
                            type="text" 
                            placeholder="Lieu..."
                            className="bg-transparent text-white text-sm outline-none placeholder:text-white/20 w-32"
                            value={location}
                            onChange={e => setLocation(e.target.value)}
                            data-help="Filtrer les étudiants par provenance ou lieu (ex: Aix, Marseille)"
                        />
                    </div>
                </div>

                {/* Onglets */}
                <div className="flex bg-white/5 p-1 rounded-xl border border-white/5">
                    <button onClick={() => setActiveTab('s1')} className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 's1' ? 'bg-blue-600 text-white shadow-lg' : 'text-white/30 hover:text-white/60'}`} data-help="Afficher le détail des notes de toutes les matières pour le Semestre 1">{s1Nom}</button>
                    <button onClick={() => setActiveTab('s2')} className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 's2' ? 'bg-blue-600 text-white shadow-lg' : 'text-white/30 hover:text-white/60'}`} data-help="Afficher le détail des notes de toutes les matières pour le Semestre 2">{s2Nom}</button>
                    <button onClick={() => setActiveTab('annual')} className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'annual' ? 'bg-amber-600 text-white shadow-lg' : 'text-white/30 hover:text-white/60'}`} data-help="Afficher la vue récapitulative annuelle avec moyennes de BCC, moyenne générale, rangs, mentions et statuts de validation">Annuel</button>
                </div>

                {/* Tri (seulement en annuel) */}
                {activeTab === 'annual' && (
                    <div className="flex bg-white/5 p-1 rounded-xl border border-white/5 items-center gap-1.5">
                        <span className="text-[9px] font-black uppercase tracking-widest text-white/40 pl-2 pr-1">Trier par :</span>
                        <button 
                            onClick={() => setSortBy('alpha')}
                            className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${
                                sortBy === 'alpha' ? 'bg-amber-600 text-white shadow-lg' : 'text-white/30 hover:text-white/60'
                            }`}
                            data-help="Trier les étudiants par ordre alphabétique"
                        >
                            Nom
                        </button>
                        <button 
                            onClick={() => setSortBy('rank')}
                            className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${
                                sortBy === 'rank' ? 'bg-amber-600 text-white shadow-lg' : 'text-white/30 hover:text-white/60'
                            }`}
                            data-help="Trier les étudiants par leur rang dans la promotion"
                        >
                            Rang
                        </button>
                    </div>
                )}
                
                {ledgerData?.rules && activeTab === 'annual' && (
                    <div className="flex items-center gap-3 bg-blue-500/10 px-4 py-2 rounded-xl border border-blue-500/20">
                        <Info className="w-4 h-4 text-blue-400" />
                        <div className="text-[9px] text-blue-200 leading-tight">
                            <span className="font-bold block uppercase tracking-tighter text-blue-400/80">Règle de validation</span>
                            Seuil BCC Annuel: {ledgerData.rules.seuil_validation_bcc} | Tolérance: {ledgerData.rules.nb_bcc_autorises_sous_seuil} à {ledgerData.rules.seuil_minimal_annuel}
                        </div>
                    </div>
                )}
            </div>

            {/* Matrix View */}
            <div className="flex-1 bg-white/5 rounded-3xl border border-white/10 overflow-hidden flex flex-col shadow-2xl">
                <div className="overflow-auto flex-1 custom-scrollbar">
                    {ledgerData && ledgerData.students.length > 0 ? (
                        <table className="w-full text-left border-separate border-spacing-0">
                            {activeTab === 'annual' ? (
                                <thead className="sticky top-0 z-30 bg-[#0f172a]">
                                    <tr className="bg-[#0f172a]">
                                        <th className="px-6 py-4 text-[10px] font-bold text-white/30 uppercase tracking-wider sticky left-0 bg-[#0f172a] z-40 w-[220px] min-w-[220px] max-w-[220px] border-b border-white/10">Étudiant</th>
                                        {bccGroups.map((group, gIdx) => (
                                            <th key={gIdx} className="px-6 py-4 text-[10px] font-bold text-blue-400 uppercase tracking-wider text-center border-b border-white/10 border-l border-white/5">
                                                <div className="flex flex-col items-center gap-1">
                                                    <div className="flex items-center gap-1 opacity-50"><Link2 className="w-2.5 h-2.5" /> BCC Annuel</div>
                                                    <span className="text-white truncate max-w-[150px]" title={group.nom}>{group.nom}</span>
                                                </div>
                                            </th>
                                        ))}
                                        <th className="px-6 py-4 text-[10px] font-bold text-amber-500 uppercase tracking-wider text-center border-b border-white/10 border-l border-white/5">
                                            Moy. Annuelle
                                        </th>
                                        <th className="px-6 py-4 text-[10px] font-bold text-white/40 uppercase tracking-wider text-center border-b border-white/10 border-l border-white/5">
                                            Rang
                                        </th>
                                        <th className="px-6 py-4 text-[10px] font-bold text-white/40 uppercase tracking-wider text-center border-b border-white/10 border-l border-white/5">
                                            Mention
                                        </th>
                                        <th className="px-6 py-4 text-[10px] font-bold text-amber-400 uppercase tracking-wider text-center border-b border-white/10 border-l border-white/5 sticky right-0 bg-[#0f172a] z-40 min-w-[120px]">RÉSULTAT JURY</th>
                                    </tr>
                                </thead>
                            ) : (
                                <thead className="sticky top-0 z-30 bg-[#0f172a]">
                                    <tr className="bg-[#0f172a]">
                                        <th rowSpan={3} className="px-6 py-4 text-[10px] font-bold text-white/30 uppercase tracking-wider sticky left-0 bg-[#0f172a] z-40 w-[220px] min-w-[220px] max-w-[220px] border-b border-white/10 align-middle">
                                            Étudiant
                                        </th>
                                        {getFilteredBCCs().map((b: any) => (
                                            <th 
                                                key={b.id} 
                                                colSpan={b.ue.reduce((acc: number, u: any) => acc + u.ecue.length + 1, 0) + 1} 
                                                className="px-2 py-2 text-[9px] font-bold text-blue-400 uppercase tracking-wider text-center border-b border-white/10 border-l border-white/5"
                                            >
                                                {b.nom}
                                            </th>
                                        ))}
                                        <th rowSpan={3} className="px-2 py-2 text-[9px] font-bold text-emerald-400 uppercase tracking-wider text-center border-b border-white/10 border-l border-white/10 align-middle w-[85px] min-w-[85px] max-w-[85px]">
                                            Bonus
                                        </th>
                                        <th rowSpan={3} className="px-2 py-2 text-[9px] font-bold text-red-400 uppercase tracking-wider text-center border-b border-white/10 border-l border-white/5 align-middle w-[85px] min-w-[85px] max-w-[85px]">
                                            Malus
                                        </th>
                                    </tr>
                                    
                                    <tr className="bg-[#0f172a]">
                                        {getFilteredBCCs().map((b: any) => (
                                            <React.Fragment key={b.id}>
                                                {b.ue.map((u: any) => (
                                                    <th 
                                                        key={u.id} 
                                                        colSpan={u.ecue.length + 1} 
                                                        className="px-2 py-1 text-[8px] font-bold text-white/60 uppercase tracking-wider text-center border-b border-white/10 border-l border-white/5"
                                                    >
                                                        <div className="truncate max-w-[180px] mx-auto" title={u.nom}>{u.nom}</div>
                                                    </th>
                                                ))}
                                                <th 
                                                    rowSpan={2} 
                                                    className="px-2 py-2 text-[8px] font-bold text-white uppercase tracking-wider text-center bg-white/5 border-b border-white/10 border-l border-white/10 w-[85px] min-w-[85px] max-w-[85px] align-middle"
                                                >
                                                    Moy. BCC
                                                </th>
                                            </React.Fragment>
                                        ))}
                                    </tr>

                                    <tr className="bg-[#0f172a]">
                                        {getFilteredBCCs().map((b: any) => (
                                            <React.Fragment key={b.id}>
                                                {b.ue.map((u: any) => (
                                                    <React.Fragment key={u.id}>
                                                        {u.ecue.map((ec: any) => (
                                                            <th 
                                                                key={ec.id} 
                                                                className="px-1 py-1 text-[7px] font-medium text-white/40 uppercase tracking-wider text-center border-b border-white/10 border-l border-white/5 w-[85px] min-w-[85px] max-w-[85px] truncate"
                                                                title={ec.nom}
                                                            >
                                                                {ec.nom}
                                                            </th>
                                                        ))}
                                                        <th 
                                                            className="px-1 py-1 text-[7px] font-bold text-emerald-400 uppercase tracking-wider text-center border-b border-white/10 border-l border-white/5 w-[85px] min-w-[85px] max-w-[85px]"
                                                        >
                                                            MOY. UE
                                                        </th>
                                                    </React.Fragment>
                                                ))}
                                            </React.Fragment>
                                        ))}
                                    </tr>
                                </thead>
                            )}
                            <tbody className="divide-y divide-white/5">
                                {getSortedStudents().map((student: any) => (
                                    <tr key={student.id} className="hover:bg-white/5 transition-all group">
                                        <td className="px-6 py-4 sticky left-0 bg-[#0f172a] group-hover:bg-[#1e293b] z-20 border-r border-white/5 shadow-xl w-[220px] min-w-[220px] max-w-[220px] truncate">
                                            <p className="text-sm font-bold text-white/90 uppercase">{student.nom} <span className="capitalize font-medium text-white/60 ml-1">{student.prenom}</span></p>
                                            <p className="text-[10px] text-white/20 italic">{student.provenance || 'Promotion'}</p>
                                        </td>

                                        {activeTab === 'annual' ? (
                                            <>
                                                {bccGroups.map((group, gIdx) => {
                                                    const bccGrade = student.grades.bcc_annuel[group.b1.id];
                                                    const rawBccGrade = student.raw_grades?.bcc_annuel?.[group.b1.id] ?? bccGrade;
                                                    const isDef = bccGrade === 'DEF';
                                                    const threshold = ledgerData?.rules?.seuil_validation_bcc ?? 10.0;
                                                    const isValid = !isDef && bccGrade !== null && Number(bccGrade) >= Number(threshold);
                                                    const isCompensated = !isDef && bccGrade !== null && Number(bccGrade) < Number(threshold) && student.validation.status === 'ADMIS';
                                                    const isBelow = !isDef && bccGrade !== null && Number(bccGrade) < Number(threshold) && !isCompensated;
                                                    
                                                    const hasJuryPoints = bccGrade !== null && rawBccGrade !== null && bccGrade !== 'DEF' && rawBccGrade !== 'DEF' && Number(bccGrade) !== Number(rawBccGrade);
                                                    const diff = hasJuryPoints ? Number(bccGrade) - Number(rawBccGrade) : 0;

                                                    return (
                                                        <td key={gIdx} className={`px-6 py-4 text-center border-l border-white/5 ${isDef ? 'text-red-500 font-extrabold animate-pulse bg-red-500/20' : isCompensated ? 'text-amber-400 bg-amber-500/15' : isBelow ? 'text-red-400 bg-red-500/20' : isValid ? 'text-emerald-400 bg-emerald-500/10' : ''} font-black text-sm`}>
                                                            {isDef ? (
                                                                'DEF'
                                                            ) : bccGrade !== null ? (
                                                                hasJuryPoints ? (
                                                                    <div className="flex flex-col items-center justify-center">
                                                                        <span className="text-[10px] text-white/40 font-medium">{Number(rawBccGrade).toFixed(2)}</span>
                                                                        <span className="text-[9px] text-amber-400 font-bold leading-none">+{diff.toFixed(2)} jury</span>
                                                                        <span className="text-sm font-black mt-0.5">{Number(bccGrade).toFixed(2)}</span>
                                                                    </div>
                                                                ) : (
                                                                    Number(bccGrade).toFixed(2)
                                                                )
                                                            ) : (
                                                                '-'
                                                            )}
                                                        </td>
                                                    );
                                                })}
                                                {(() => {
                                                    const avg = student.annualAvg;
                                                    const isDef = avg === 'DEF';
                                                    const isBelow = !isDef && avg !== null && Number(avg) < 10.0;
                                                    const isValid = !isDef && avg !== null && Number(avg) >= 10.0;
                                                    const mention = getMention(avg, student.validation.status);

                                                    return (
                                                        <>
                                                            <td className={`px-6 py-4 text-center border-l border-white/5 ${isDef ? 'text-red-500 font-extrabold bg-red-500/20' : isBelow ? 'text-red-400 bg-red-500/20' : isValid ? 'text-emerald-400 bg-emerald-500/10' : ''} font-black text-sm`}>
                                                                {isDef ? 'DEF' : avg !== null ? Number(avg).toFixed(2) : '-'}
                                                            </td>
                                                            <td className="px-6 py-4 text-center border-l border-white/5 text-sm font-semibold text-white/70">
                                                                {student.rank === -1 ? '-' : student.rank === 1 ? '1er' : `${student.rank}e`}
                                                                {/* (out of total) omitted for clean design */}
                                                            </td>
                                                            <td className="px-6 py-4 text-center border-l border-white/5">
                                                                {mention === '-' ? (
                                                                    <span className="text-white/20">-</span>
                                                                ) : (
                                                                    <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider ${
                                                                        mention === 'Très Bien' ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30' :
                                                                        mention === 'Bien' ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30' :
                                                                        mention === 'Assez Bien' ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30' :
                                                                        'bg-slate-500/20 text-slate-300 border border-slate-500/30'
                                                                    }`}>
                                                                        {mention}
                                                                    </span>
                                                                )}
                                                            </td>
                                                        </>
                                                    );
                                                })()}
                                            </>
                                        ) : (
                                            <>
                                                {getFilteredBCCs().map((b: any) => (
                                                    <React.Fragment key={b.id}>
                                                        {b.ue.map((u: any) => {
                                                            const ueVal = student.grades.ue[u.id];
                                                            const isUeDef = ueVal === 'DEF';
                                                            return (
                                                                <React.Fragment key={u.id}>
                                                                    {u.ecue.map((ec: any) => {
                                                                        const val = student.grades.ecue[ec.id];
                                                                        const rawVal = student.raw_grades?.ecue?.[ec.id] ?? val;
                                                                        const isDefOrAbi = val === 'DEF' || val === 'ABI';
                                                                        const isAbj = val === 'ABJ';
                                                                        const semId = b.semestre_id;
                                                                        const isJuryValide = ledgerData?.semesters_jury_valide?.[semId] === 1;
                                                                        const pts = isJuryValide ? (ledgerData?.jury_points?.[student.id]?.[semId]?.['ecue']?.[ec.id] ?? 0) : 0;
                                                                        const hasPoints = pts > 0;

                                                                        return (
                                                                            <td key={ec.id} className="px-2 py-4 text-center border-l border-white/5 w-[85px] min-w-[85px] max-w-[85px] truncate">
                                                                                {hasPoints ? (
                                                                                    <div className="flex flex-col items-center justify-center">
                                                                                        <span className="text-[9px] text-white/40">{Number(rawVal).toFixed(2)}</span>
                                                                                        <span className="text-[8px] text-amber-400 font-bold leading-none">+{pts.toFixed(2)}</span>
                                                                                        <span className="text-[11px] text-white/90 font-bold mt-0.5">{Number(val).toFixed(2)}</span>
                                                                                    </div>
                                                                                ) : (
                                                                                    <span className={`text-[11px] ${isDefOrAbi ? 'text-red-400 font-bold' : isAbj ? 'text-white/30 italic' : 'text-white/60'}`}>
                                                                                        {val !== null && val !== undefined && !isNaN(Number(val)) ? Number(val).toFixed(2) : (val ?? '-')}
                                                                                    </span>
                                                                                )}
                                                                            </td>
                                                                        );
                                                                    })}
                                                                    {(() => {
                                                                        const semId = b.semestre_id;
                                                                        const isJuryValide = ledgerData?.semesters_jury_valide?.[semId] === 1;
                                                                        const ptsUe = isJuryValide ? (ledgerData?.jury_points?.[student.id]?.[semId]?.['ue']?.[u.id] ?? 0) : 0;
                                                                        const hasPointsUe = ptsUe > 0;
                                                                        const rawUeVal = student.raw_grades?.ue?.[u.id] ?? ueVal;

                                                                        return (
                                                                            <td className={`px-2 py-4 text-center border-l border-white/5 w-[85px] min-w-[85px] max-w-[85px] truncate ${isUeDef ? 'bg-red-500/10' : 'bg-emerald-500/5'}`}>
                                                                                {hasPointsUe ? (
                                                                                    <div className="flex flex-col items-center justify-center">
                                                                                        <span className="text-[9px] text-white/40">{Number(rawUeVal).toFixed(2)}</span>
                                                                                        <span className="text-[8px] text-amber-400 font-bold leading-none">+{ptsUe.toFixed(2)}</span>
                                                                                        <span className="text-[11px] font-bold text-emerald-400 mt-0.5">{Number(ueVal).toFixed(2)}</span>
                                                                                    </div>
                                                                                ) : (
                                                                                    <span className={`text-[11px] font-bold ${isUeDef ? 'text-red-500 font-extrabold' : 'text-emerald-400/80'}`}>
                                                                                        {ueVal !== null && ueVal !== undefined && !isNaN(Number(ueVal)) ? Number(ueVal).toFixed(2) : (ueVal ?? '-')}
                                                                                    </span>
                                                                                )}
                                                                            </td>
                                                                        );
                                                                    })()}
                                                                </React.Fragment>
                                                            );
                                                        })}
                                                        {(() => {
                                                            const bccVal = student.grades.bcc[b.id];
                                                            const isBccDef = bccVal === 'DEF';
                                                            const threshold = ledgerData?.rules?.seuil_validation_bcc ?? 10.0;
                                                            const isBccValid = !isBccDef && bccVal !== null && bccVal !== undefined && Number(bccVal) >= Number(threshold);
                                                            const isBccCompensated = !isBccDef && bccVal !== null && bccVal !== undefined && Number(bccVal) < Number(threshold) && student.validation.status === 'ADMIS';
                                                            const isBccBelowThreshold = !isBccDef && bccVal !== null && bccVal !== undefined && Number(bccVal) < Number(threshold) && !isBccCompensated;
                                                            
                                                            const semId = b.semestre_id;
                                                            const isJuryValide = ledgerData?.semesters_jury_valide?.[semId] === 1;
                                                            const ptsBcc = isJuryValide ? (ledgerData?.jury_points?.[student.id]?.[semId]?.['bcc']?.[b.id] ?? 0) : 0;
                                                            const hasPointsBcc = ptsBcc > 0;
                                                            const rawBccVal = student.raw_grades?.bcc?.[b.id] ?? bccVal;

                                                            return (
                                                                <td className={`px-2 py-4 text-center border-l border-white/10 w-[85px] min-w-[85px] max-w-[85px] truncate ${isBccDef || isBccBelowThreshold ? 'bg-red-500/20' : isBccCompensated ? 'bg-amber-500/15' : isBccValid ? 'bg-emerald-500/10' : 'bg-blue-500/10'}`}>
                                                                    {hasPointsBcc ? (
                                                                        <div className="flex flex-col items-center justify-center">
                                                                            <span className="text-[9px] text-white/40">{Number(rawBccVal).toFixed(2)}</span>
                                                                            <span className="text-[8px] text-amber-400 font-bold leading-none">+{ptsBcc.toFixed(2)}</span>
                                                                            <span className={`text-[11px] font-black mt-0.5 ${isBccDef ? 'text-red-500 font-extrabold animate-pulse' : isBccBelowThreshold ? 'text-red-400' : isBccCompensated ? 'text-amber-400' : isBccValid ? 'text-emerald-400' : 'text-blue-300'}`}>{Number(bccVal).toFixed(2)}</span>
                                                                        </div>
                                                                    ) : (
                                                                        <span className={`text-[11px] font-black ${isBccDef ? 'text-red-500 font-extrabold animate-pulse' : isBccBelowThreshold ? 'text-red-400' : isBccCompensated ? 'text-amber-400' : isBccValid ? 'text-emerald-400' : 'text-blue-300'}`}>
                                                                            {bccVal !== null && bccVal !== undefined && !isNaN(Number(bccVal)) ? Number(bccVal).toFixed(2) : (bccVal ?? '-')}
                                                                        </span>
                                                                    )}
                                                                </td>
                                                            );
                                                        })()}
                                                    </React.Fragment>
                                                ))}
                                                {(() => {
                                                    const filteredBccs = getFilteredBCCs();
                                                    const semId = filteredBccs.length > 0 ? filteredBccs[0].semestre_id : null;
                                                    const bm = semId && student.bonus_malus && student.bonus_malus[semId] ? student.bonus_malus[semId] : { bonus: null, malus: null };
                                                    const bonusText = bm.bonus !== null && bm.bonus !== undefined ? `+${bm.bonus}` : '-';
                                                    const malusText = bm.malus !== null && bm.malus !== undefined ? `-${bm.malus}` : '-';
                                                    return (
                                                        <React.Fragment>
                                                            <td className="px-2 py-4 text-center border-l border-white/10 w-[85px] min-w-[85px] max-w-[85px] bg-emerald-500/5">
                                                                <span className="text-[11px] font-bold text-emerald-400">
                                                                    {bonusText}
                                                                </span>
                                                            </td>
                                                            <td className="px-2 py-4 text-center border-l border-white/5 w-[85px] min-w-[85px] max-w-[85px] bg-red-500/5">
                                                                <span className="text-[11px] font-bold text-red-400">
                                                                    {malusText}
                                                                </span>
                                                            </td>
                                                        </React.Fragment>
                                                    );
                                                })()}
                                            </>
                                        )}

                                        {activeTab === 'annual' && (
                                            <td className="px-6 py-4 text-center sticky right-0 bg-[#0f172a] group-hover:bg-[#1e293b] z-20 border-l border-white/10 shadow-[-10px_0_15px_rgba(0,0,0,0.2)]">
                                                <div className={`px-3 py-1 rounded-full text-[10px] font-black tracking-widest border transition-all ${
                                                    student.validation.status === 'ADMIS' ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : 
                                                    student.validation.status === 'DÉFAILLANT' ? 'bg-red-600/30 text-red-400 border-red-500/50 animate-pulse font-extrabold shadow-[0_0_15px_rgba(239,68,68,0.2)]' : 
                                                    (student.validation.status === 'INCOMPLET' ? 'bg-white/5 text-white/30 border-white/10' : 'bg-red-500/20 text-red-500 border-red-500/30')
                                                }`}>
                                                    {student.validation.status}
                                                </div>
                                            </td>
                                        )}
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot className="sticky bottom-0 z-30 bg-[#0f172a] border-t-2 border-white/20 shadow-[0_-5px_15px_rgba(0,0,0,0.3)]">
                                {statsRows.map((row) => (
                                    <tr key={row.key} className="bg-[#0f172a] border-b border-white/5 last:border-0 hover:bg-white/5 transition-all">
                                        <td className="px-6 py-3 sticky left-0 bg-[#0f172a] border-r border-white/5 shadow-xl font-bold text-xs text-white/70">{row.label}</td>
                                        {activeTab === 'annual' ? (
                                            <>
                                                {bccGroups.map((group, gIdx) => {
                                                    const grades = getColumnGrades('bcc_annuel', group.b1.id);
                                                    const val = computeStats(grades)[row.key];
                                                    return (
                                                        <td key={gIdx} className={`px-6 py-3 text-center font-bold text-xs border-l border-white/5 ${row.colorClass}`}>
                                                            {val !== null ? val.toFixed(2) : '-'}
                                                        </td>
                                                    );
                                                })}
                                                {(() => {
                                                    const grades = getColumnGrades('annualAvg', null);
                                                    const val = computeStats(grades)[row.key];
                                                    return (
                                                        <td className={`px-6 py-3 text-center font-bold text-xs border-l border-white/5 ${row.colorClass}`}>
                                                            {val !== null ? val.toFixed(2) : '-'}
                                                        </td>
                                                    );
                                                })()}
                                                <td className="px-6 py-3 text-center border-l border-white/5 text-xs text-white/20">-</td>
                                                <td className="px-6 py-3 text-center border-l border-white/5 text-xs text-white/20">-</td>
                                                <td className="px-6 py-3 text-center sticky right-0 bg-[#0f172a] border-l border-white/10 text-xs text-white/20">-</td>
                                            </>
                                        ) : (
                                            <>
                                                {getFilteredBCCs().map((b: any) => (
                                                    <React.Fragment key={b.id}>
                                                        {b.ue.map((u: any) => (
                                                            <React.Fragment key={u.id}>
                                                                {u.ecue.map((ec: any) => {
                                                                    const grades = getColumnGrades('ecue', ec.id);
                                                                    const val = computeStats(grades)[row.key];
                                                                    return (
                                                                        <td key={ec.id} className={`px-1 py-3 text-center font-bold text-xs border-l border-white/5 w-[85px] min-w-[85px] max-w-[85px] ${row.colorClass}`}>
                                                                            {val !== null ? val.toFixed(2) : '-'}
                                                                        </td>
                                                                    );
                                                                })}
                                                                {(() => {
                                                                    const grades = getColumnGrades('ue', u.id);
                                                                    const val = computeStats(grades)[row.key];
                                                                    return (
                                                                        <td className={`px-1 py-3 text-center font-bold text-xs border-l border-white/5 w-[85px] min-w-[85px] max-w-[85px] bg-emerald-500/5 ${row.colorClass}`}>
                                                                            {val !== null ? val.toFixed(2) : '-'}
                                                                        </td>
                                                                    );
                                                                })()}
                                                            </React.Fragment>
                                                        ))}
                                                        {(() => {
                                                            const grades = getColumnGrades('bcc', b.id);
                                                            const val = computeStats(grades)[row.key];
                                                            return (
                                                                <td className={`px-2 py-3 text-center font-bold text-xs border-l border-white/10 w-[85px] min-w-[85px] max-w-[85px] bg-blue-500/10 ${row.colorClass}`}>
                                                                    {val !== null ? val.toFixed(2) : '-'}
                                                                </td>
                                                            );
                                                        })()}
                                                    </React.Fragment>
                                                ))}
                                                {(() => {
                                                    const filteredBccs = getFilteredBCCs();
                                                    const semId = filteredBccs.length > 0 ? filteredBccs[0].semestre_id : null;
                                                    const bonusGrades = getColumnGrades('bonus', null, semId);
                                                    const malusGrades = getColumnGrades('malus', null, semId);
                                                    const valBonus = computeStats(bonusGrades)[row.key];
                                                    const valMalus = computeStats(malusGrades)[row.key];
                                                    return (
                                                        <React.Fragment>
                                                            <td className={`px-2 py-3 text-center border-l border-white/10 w-[85px] min-w-[85px] max-w-[85px] bg-emerald-500/5 font-bold text-xs ${row.colorClass}`}>
                                                                {valBonus !== null ? valBonus.toFixed(2) : '-'}
                                                            </td>
                                                            <td className={`px-2 py-3 text-center border-l border-white/5 w-[85px] min-w-[85px] max-w-[85px] bg-red-500/5 font-bold text-xs ${row.colorClass}`}>
                                                                {valMalus !== null ? valMalus.toFixed(2) : '-'}
                                                            </td>
                                                        </React.Fragment>
                                                    );
                                                })()}
                                            </>
                                        )}
                                    </tr>
                                ))}
                            </tfoot>
                        </table>
                    ) : (
                        <div className="flex flex-col items-center justify-center h-64 text-white/10 uppercase tracking-widest font-bold text-xs">Aucune donnée disponible</div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default GradeLedger;
