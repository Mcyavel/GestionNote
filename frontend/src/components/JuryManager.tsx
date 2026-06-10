import React, { useState, useEffect, useMemo } from 'react';
import { Calendar, Save, CheckCircle2, Lock, Unlock, AlertCircle, Info, RotateCcw } from 'lucide-react';

interface Semester {
  id: number;
  annee_id: number;
  nom: string;
  jury_valide: number;
}

interface Annee {
  id: number;
  nom: string;
  is_maquette: number;
  archived: number;
  maquette_id?: number | null;
  semestres: Semester[];
}

const JuryManager: React.FC = () => {
  const [annees, setAnnees] = useState<Annee[]>([]);
  const [selectedAnnee, setSelectedAnnee] = useState<number | null>(null);
  const [selectedSemestre, setSelectedSemestre] = useState<number | null>(null);
  const [sessionData, setSessionData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  
  // Working states for edits
  // Map of studentId -> ecueId -> note (string)
  const [draftNotes, setDraftNotes] = useState<Record<number, Record<number, string>>>({});
  // Map of studentId -> element_type|element_id -> points (string)
  const [draftPoints, setDraftPoints] = useState<Record<number, Record<string, string>>>({});
  
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch('/api/curriculum')
      .then((res) => res.json())
      .then((res) => {
        if (res.success && res.data.length > 0) {
          setAnnees(res.data);
          const activePromos = res.data.filter((a: any) => a.is_maquette === 0 && !a.archived);
          if (activePromos.length > 0) {
            const firstAnnee = activePromos[0];
            setSelectedAnnee(firstAnnee.id);
            if (firstAnnee.semestres && firstAnnee.semestres.length > 0) {
              setSelectedSemestre(firstAnnee.semestres[0].id);
            }
          } else {
            const firstAnnee = res.data[0];
            setSelectedAnnee(firstAnnee.id);
            if (firstAnnee.semestres && firstAnnee.semestres.length > 0) {
              setSelectedSemestre(firstAnnee.semestres[0].id);
            }
          }
        }
      });
  }, []);

  // Update selected semester when annee changes
  useEffect(() => {
    if (selectedAnnee) {
      const annee = annees.find((a) => a.id === selectedAnnee);
      if (annee && annee.semestres && annee.semestres.length > 0) {
        setSelectedSemestre(annee.semestres[0].id);
      } else {
        setSelectedSemestre(null);
      }
    }
  }, [selectedAnnee, annees]);

  // Load Jury Session Data
  const fetchJurySession = async () => {
    if (!selectedSemestre) return;
    setLoading(true);
    setStatusMsg(null);
    try {
      const res = await fetch(`/api/jury?action=get_session&semestre_id=${selectedSemestre}`);
      const result = await res.json();
      if (result.success) {
        setSessionData(result.data);
        
        // Initialize working state from draft (if exists) or current DB values
        const initialNotes: Record<number, Record<number, string>> = {};
        const initialPoints: Record<number, Record<string, string>> = {};

        result.data.students.forEach((student: any) => {
          const sId = student.id;
          initialNotes[sId] = {};
          initialPoints[sId] = {};

          // Load notes: use draft_notes if present, otherwise database notes
          const activeNotes = student.draft_notes !== null ? student.draft_notes : {};
          // Initialize with database notes as fallback
          Object.keys(student.notes || {}).forEach((ecueId) => {
            const n = student.notes[ecueId];
            const valStr = n.statut !== null ? n.statut : (n.valeur !== null ? String(n.valeur) : '');
            initialNotes[sId][Number(ecueId)] = valStr;
          });
          // Overlay draft notes
          Object.keys(activeNotes).forEach((ecueId) => {
            initialNotes[sId][Number(ecueId)] = activeNotes[ecueId] !== null ? String(activeNotes[ecueId]) : '';
          });

          // Load jury points: use draft_points if present, otherwise database jury_points
          const activePoints = student.draft_points !== null ? student.draft_points : {};
          
          // Initialize from DB
          if (student.jury_points) {
            Object.keys(student.jury_points).forEach((elemType) => {
              Object.keys(student.jury_points[elemType] || {}).forEach((elemId) => {
                const key = `${elemType}|${elemId}`;
                const pts = student.jury_points[elemType][elemId];
                initialPoints[sId][key] = pts > 0 ? String(pts) : '';
              });
            });
          }
          // Overlay draft points
          Object.keys(activePoints).forEach((key) => {
            initialPoints[sId][key] = activePoints[key] !== null && Number(activePoints[key]) > 0 ? String(activePoints[key]) : '';
          });
        });

        setDraftNotes(initialNotes);
        setDraftPoints(initialPoints);
      } else {
        setStatusMsg({ type: 'error', text: result.error || 'Erreur lors du chargement de la session.' });
      }
    } catch (e: any) {
      setStatusMsg({ type: 'error', text: e.message || 'Erreur réseau.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchJurySession();
  }, [selectedSemestre]);

  // Handle input changes
  const handleNoteChange = (studentId: number, ecueId: number, value: string) => {
    const uppercaseVal = value.toUpperCase();
    setDraftNotes((prev) => ({
      ...prev,
      [studentId]: {
        ...prev[studentId],
        [ecueId]: uppercaseVal,
      },
    }));
  };

  const handlePointsChange = (studentId: number, key: string, value: string) => {
    // Validate bounds locally
    let cleanVal = value.replace(',', '.');
    if (cleanVal !== '' && !isNaN(Number(cleanVal))) {
      const num = Number(cleanVal);
      if (num < 0) cleanVal = '0';
      if (num > 0.5) cleanVal = '0.5';
    }
    setDraftPoints((prev) => ({
      ...prev,
      [studentId]: {
        ...prev[studentId],
        [key]: cleanVal,
      },
    }));
  };

  // Live calculation of UE and BCC averages
  const liveCalculations = useMemo(() => {
    if (!sessionData) return null;

    const results: Record<number, {
      ecues: Record<number, { val: number | string; adjusted: number | string; pts: number }>;
      ues: Record<number, { val: number; adjusted: number; pts: number; isDef: boolean }>;
      bccs: Record<number, { val: number; adjusted: number; pts: number; isDef: boolean }>;
    }> = {};

    sessionData.students.forEach((student: any) => {
      const sId = student.id;
      results[sId] = { ecues: {}, ues: {}, bccs: {} };

      // Get bonus/malus for student in this semester
      const bm = student.bonus_malus?.[selectedSemestre!] || { bonus: null, malus: null };
      const bonus = bm.bonus !== null ? Number(bm.bonus) : 0;
      const malus = bm.malus !== null ? Number(bm.malus) : 0;

      sessionData.structure.bcc.forEach((bcc: any) => {
        let bccSum = 0;
        let bccCoeff = 0;
        let bccDef = false;

        bcc.ue.forEach((ue: any) => {
          let ueSum = 0;
          let ueCount = 0;
          let ueDef = false;

          ue.ecue.forEach((ecue: any) => {
            const rawInput = draftNotes[sId]?.[ecue.id];
            let ecueVal: number | string = '';
            
            if (rawInput !== undefined && rawInput !== '') {
              if (['ABI', 'ABJ', 'DEF'].includes(rawInput)) {
                ecueVal = rawInput;
              } else {
                ecueVal = isNaN(Number(rawInput)) ? '' : Number(rawInput);
              }
            }

            // Points jury
            const pts = parseFloat(draftPoints[sId]?.[`ecue|${ecue.id}`] || '0');

            let adjustedVal: number | string = ecueVal;
            if (typeof ecueVal === 'number') {
              adjustedVal = Math.min(20.0, ecueVal + pts);
              ueSum += adjustedVal;
              ueCount++;
            } else if (ecueVal === 'ABI') {
              adjustedVal = 'ABI';
              ueSum += 0.0;
              ueCount++;
            } else if (ecueVal === 'DEF') {
              adjustedVal = 'DEF';
              ueDef = true;
            } else if (ecueVal === 'ABJ') {
              adjustedVal = 'ABJ';
            }

            results[sId].ecues[ecue.id] = { val: ecueVal, adjusted: adjustedVal, pts };
          });

          // Calculate UE Average
          let calculatedUeAvg = 0;
          if (ueDef) {
            calculatedUeAvg = 0; // mark def
          } else if (ueCount > 0) {
            calculatedUeAvg = Math.round((ueSum / ueCount) * 100) / 100;
          }

          // UE points jury
          const ptsUe = parseFloat(draftPoints[sId]?.[`ue|${ue.id}`] || '0');
          let adjustedUeAvg = calculatedUeAvg;
          if (ueCount > 0 && !ueDef) {
            adjustedUeAvg = Math.min(20.0, calculatedUeAvg + ptsUe);
          }

          results[sId].ues[ue.id] = {
            val: calculatedUeAvg,
            adjusted: adjustedUeAvg,
            pts: ptsUe,
            isDef: ueDef,
          };

          if (ueDef) {
            bccDef = true;
          } else if (ueCount > 0) {
            bccSum += adjustedUeAvg * ue.coeff;
            bccCoeff += ue.coeff;
          }
        });

        // Calculate BCC Average (with bonus/malus)
        let calculatedBccAvg = 0;
        if (bccCoeff > 0 && !bccDef) {
          const rawAvg = bccSum / bccCoeff;
          calculatedBccAvg = Math.max(0.0, Math.min(20.0, rawAvg + bonus - malus));
        }

        // BCC points jury
        const ptsBcc = parseFloat(draftPoints[sId]?.[`bcc|${bcc.id}`] || '0');
        let adjustedBccAvg = calculatedBccAvg;
        if (bccCoeff > 0 && !bccDef) {
          adjustedBccAvg = Math.min(20.0, calculatedBccAvg + ptsBcc);
        }

        results[sId].bccs[bcc.id] = {
          val: calculatedBccAvg,
          adjusted: adjustedBccAvg,
          pts: ptsBcc,
          isDef: bccDef,
        };
      });
    });

    return results;
  }, [sessionData, draftNotes, draftPoints, selectedSemestre]);

  // Save Draft
  const saveDraft = async () => {
    if (!selectedSemestre || saving) return;
    setSaving(true);
    setStatusMsg(null);

    const payloads = sessionData.students.map((student: any) => {
      const sId = student.id;
      
      // Filter out empty draft values
      const studentNotes: Record<string, any> = {};
      Object.keys(draftNotes[sId] || {}).forEach((ecueId) => {
        const val = draftNotes[sId][Number(ecueId)];
        studentNotes[ecueId] = val === '' ? null : (isNaN(Number(val)) ? val : Number(val));
      });

      const studentPoints: Record<string, number | null> = {};
      Object.keys(draftPoints[sId] || {}).forEach((key) => {
        const pts = draftPoints[sId][key];
        studentPoints[key] = pts === '' || Number(pts) === 0 ? null : Number(pts);
      });

      return {
        etudiant_id: sId,
        draft_notes: studentNotes,
        draft_points: studentPoints,
      };
    });

    try {
      const response = await fetch('/api/jury', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save_draft',
          semestre_id: selectedSemestre,
          drafts: payloads,
        }),
      });
      const result = await response.json();
      if (result.success) {
        setStatusMsg({ type: 'success', text: 'Brouillon enregistré avec succès.' });
      } else {
        setStatusMsg({ type: 'error', text: result.error || 'Erreur lors de la sauvegarde.' });
      }
    } catch (e: any) {
      setStatusMsg({ type: 'error', text: e.message || 'Erreur réseau.' });
    } finally {
      setSaving(false);
    }
  };

  // Validate Jury
  const validateJury = async () => {
    if (!selectedSemestre || saving) return;
    if (!window.confirm('Voulez-vous vraiment valider cette délibération ? Cela enregistrera définitivement les nouvelles notes en base et verrouillera la saisie.')) return;
    
    setSaving(true);
    setStatusMsg(null);

    const payloads = sessionData.students.map((student: any) => {
      const sId = student.id;
      
      const studentNotes: Record<string, any> = {};
      Object.keys(draftNotes[sId] || {}).forEach((ecueId) => {
        const val = draftNotes[sId][Number(ecueId)];
        studentNotes[ecueId] = val === '' ? null : (isNaN(Number(val)) ? val : Number(val));
      });

      const studentPoints: Record<string, number | null> = {};
      Object.keys(draftPoints[sId] || {}).forEach((key) => {
        const pts = draftPoints[sId][key];
        studentPoints[key] = pts === '' || Number(pts) === 0 ? null : Number(pts);
      });

      return {
        etudiant_id: sId,
        draft_notes: studentNotes,
        draft_points: studentPoints,
      };
    });

    try {
      const response = await fetch('/api/jury', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'validate_jury',
          semestre_id: selectedSemestre,
          drafts: payloads,
        }),
      });
      const result = await response.json();
      if (result.success) {
        setStatusMsg({ type: 'success', text: 'Jury validé avec succès. Les résultats sont appliqués.' });
        fetchJurySession();
      } else {
        setStatusMsg({ type: 'error', text: result.error || 'Erreur lors de la validation.' });
      }
    } catch (e: any) {
      setStatusMsg({ type: 'error', text: e.message || 'Erreur réseau.' });
    } finally {
      setSaving(false);
    }
  };

  // Reopen Jury
  const reopenJury = async () => {
    if (!selectedSemestre || saving) return;
    if (!window.confirm('Voulez-vous vraiment réouvrir la délibération ? Cela repassera le jury en mode Brouillon.')) return;

    setSaving(true);
    setStatusMsg(null);

    try {
      const response = await fetch('/api/jury', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'reopen_jury',
          semestre_id: selectedSemestre,
        }),
      });
      const result = await response.json();
      if (result.success) {
        setStatusMsg({ type: 'success', text: 'Jury réouvert avec succès.' });
        fetchJurySession();
      } else {
        setStatusMsg({ type: 'error', text: result.error || 'Erreur lors de la réouverture.' });
      }
    } catch (e: any) {
      setStatusMsg({ type: 'error', text: e.message || 'Erreur réseau.' });
    } finally {
      setSaving(false);
    }
  };

  const isJuryValide = sessionData?.semestre?.jury_valide === 1;

  const currentAnnee = annees.find((a) => a.id === selectedAnnee);

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
              onChange={(e) => setSelectedAnnee(Number(e.target.value))}
            >
              {annees.filter(a => a.is_maquette === 0 && (!a.archived || a.id === selectedAnnee)).map((a) => (
                <option key={a.id} value={a.id} className="bg-slate-900">
                  {a.nom}
                </option>
              ))}
            </select>
          </div>
          <div className="h-6 w-[1px] bg-white/10"></div>
          <div className="flex items-center gap-2">
            <select
              className="bg-transparent text-white font-bold text-sm outline-none cursor-pointer"
              value={selectedSemestre || ''}
              onChange={(e) => setSelectedSemestre(Number(e.target.value))}
            >
              {currentAnnee?.semestres?.map((s) => (
                <option key={s.id} value={s.id} className="bg-slate-900">
                  {s.nom}
                </option>
              ))}
            </select>
          </div>
          <div className="h-6 w-[1px] bg-white/10"></div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-white/40 uppercase tracking-widest font-bold">Statut :</span>
            {isJuryValide ? (
              <span className="flex items-center gap-1.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2.5 py-0.5 rounded-full text-xs font-black uppercase tracking-wider">
                <Lock className="w-3.5 h-3.5" /> Validé
              </span>
            ) : (
              <span className="flex items-center gap-1.5 bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2.5 py-0.5 rounded-full text-xs font-black uppercase tracking-wider animate-pulse">
                <Unlock className="w-3.5 h-3.5" /> Brouillon
              </span>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-3">
          {isJuryValide ? (
            <button
              onClick={reopenJury}
              disabled={saving}
              className="flex items-center gap-2 bg-rose-600 hover:bg-rose-500 text-white text-xs font-black uppercase tracking-wider px-4 py-2 rounded-xl transition-all shadow-lg hover:scale-105 active:scale-95 disabled:opacity-50"
            >
              <RotateCcw className="w-4 h-4" /> Réouvrir le Jury
            </button>
          ) : (
            <>
              <button
                onClick={saveDraft}
                disabled={saving}
                className="flex items-center gap-2 bg-white/10 hover:bg-white/15 text-white border border-white/10 text-xs font-black uppercase tracking-wider px-4 py-2 rounded-xl transition-all hover:scale-105 active:scale-95 disabled:opacity-50"
              >
                <Save className="w-4 h-4" /> Brouillon
              </button>
              <button
                onClick={validateJury}
                disabled={saving}
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-black uppercase tracking-wider px-4 py-2 rounded-xl transition-all shadow-lg hover:scale-105 active:scale-95 disabled:opacity-50"
              >
                <CheckCircle2 className="w-4 h-4" /> Valider le Jury
              </button>
            </>
          )}
        </div>
      </div>

      {/* Notification Banner */}
      {statusMsg && (
        <div className={`p-4 rounded-xl border flex items-center gap-3 transition-all ${
          statusMsg.type === 'success' 
            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
            : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
        }`}>
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span className="text-sm font-semibold">{statusMsg.text}</span>
        </div>
      )}

      {/* Grid Container */}
      <div className="flex-1 bg-white/5 rounded-3xl border border-white/10 overflow-hidden flex flex-col shadow-2xl min-h-0">
        {loading ? (
          <div className="flex-1 flex items-center justify-center text-white/30 uppercase tracking-widest text-xs font-black animate-pulse">
            Chargement de la session...
          </div>
        ) : sessionData && sessionData.students.length > 0 ? (
          <div className="overflow-auto flex-1 custom-scrollbar">
            <table className="w-full text-left border-separate border-spacing-0">
              <thead className="sticky top-0 z-30 bg-[#0f172a]">
                {/* Row 1: BCC Names */}
                <tr className="bg-[#0f172a]">
                  <th rowSpan={3} className="px-6 py-4 text-[10px] font-bold text-white/30 uppercase tracking-wider sticky left-0 bg-[#0f172a] z-40 w-[200px] min-w-[200px] max-w-[200px] border-b border-white/10 align-middle">
                    Étudiant
                  </th>
                  {sessionData.structure.bcc.map((b: any) => (
                    <th
                      key={b.id}
                      colSpan={b.ue.reduce((acc: number, u: any) => acc + u.ecue.length + 1, 0) + 1}
                      className="px-2 py-2 text-[9px] font-bold text-blue-400 uppercase tracking-wider text-center border-b border-white/10 border-l border-white/5"
                    >
                      {b.nom}
                    </th>
                  ))}
                </tr>

                {/* Row 2: UE Names & Moy BCC Headers */}
                <tr className="bg-[#0f172a]">
                  {sessionData.structure.bcc.map((b: any) => (
                    <React.Fragment key={b.id}>
                      {b.ue.map((u: any) => (
                        <th
                          key={u.id}
                          colSpan={u.ecue.length + 1}
                          className="px-2 py-1 text-[8px] font-bold text-white/60 uppercase tracking-wider text-center border-b border-white/10 border-l border-white/5"
                        >
                          <div className="truncate max-w-[150px] mx-auto" title={u.nom}>{u.nom}</div>
                        </th>
                      ))}
                      <th
                        rowSpan={2}
                        className="px-2 py-2 text-[8px] font-bold text-white uppercase tracking-wider text-center bg-white/5 border-b border-white/10 border-l border-white/10 w-[95px] min-w-[95px] max-w-[95px] align-middle"
                      >
                        Calcul BCC
                      </th>
                    </React.Fragment>
                  ))}
                </tr>

                {/* Row 3: ECUE Headers & Moy UE Headers */}
                <tr className="bg-[#0f172a]">
                  {sessionData.structure.bcc.map((b: any) => (
                    <React.Fragment key={b.id}>
                      {b.ue.map((u: any) => (
                        <React.Fragment key={u.id}>
                          {u.ecue.map((ec: any) => (
                            <th
                              key={ec.id}
                              className="px-1 py-1 text-[7px] font-medium text-white/40 uppercase tracking-wider text-center border-b border-white/10 border-l border-white/5 w-[140px] min-w-[140px] max-w-[140px]"
                              title={ec.nom}
                            >
                              <div className="truncate max-w-[130px] mx-auto">{ec.nom}</div>
                            </th>
                          ))}
                          <th
                            className="px-1 py-1 text-[7px] font-bold text-emerald-400 uppercase tracking-wider text-center border-b border-white/10 border-l border-white/5 w-[95px] min-w-[95px] max-w-[95px]"
                          >
                            Calcul UE
                          </th>
                        </React.Fragment>
                      ))}
                    </React.Fragment>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 bg-slate-950/20">
                {sessionData.students.map((student: any) => {
                  const sId = student.id;
                  const live = liveCalculations?.[sId];
                  return (
                    <tr key={sId} className="hover:bg-white/5 transition-all group">
                      <td className="px-6 py-4 sticky left-0 bg-[#0f172a] group-hover:bg-[#1e293b] z-20 border-r border-white/5 shadow-xl w-[200px] min-w-[200px] max-w-[200px] truncate">
                        <p className="text-sm font-bold text-white/90 uppercase">{student.nom} <span className="capitalize font-medium text-white/60 ml-1">{student.prenom}</span></p>
                        <p className="text-[10px] text-white/20 italic">{student.provenance || 'Marseille'}</p>
                      </td>

                      {sessionData.structure.bcc.map((b: any) => (
                        <React.Fragment key={b.id}>
                          {b.ue.map((u: any) => {
                            const liveUe = live?.ues[u.id];
                            const isUeDef = liveUe?.isDef;
                            return (
                              <React.Fragment key={u.id}>
                                {u.ecue.map((ec: any) => {
                                  const rawVal = draftNotes[sId]?.[ec.id] ?? '';
                                  const ptsVal = draftPoints[sId]?.[`ecue|${ec.id}`] ?? '';
                                  
                                  const isAbs = ['ABI', 'ABJ', 'DEF'].includes(rawVal);
                                  
                                  return (
                                    <td key={ec.id} className="px-2 py-4 border-l border-white/5 w-[140px] min-w-[140px] max-w-[140px]">
                                      <div className="flex items-center gap-1.5 justify-center">
                                        {/* Note Input */}
                                        <input
                                          type="text"
                                          disabled={isJuryValide}
                                          placeholder="-"
                                          value={rawVal}
                                          onChange={(e) => handleNoteChange(sId, ec.id, e.target.value)}
                                          className={`w-14 h-8 bg-white/5 border text-center text-xs font-bold rounded-lg outline-none transition-all focus:border-blue-500 focus:bg-white/10 ${
                                            isAbs ? 'text-red-400 border-red-500/30' : 'text-white border-white/15'
                                          } disabled:opacity-50`}
                                        />
                                        
                                        {/* Jury points prefix '+' */}
                                        <div className="flex items-center gap-0.5">
                                          <span className="text-[10px] text-amber-500 font-bold">+</span>
                                          <input
                                            type="text"
                                            disabled={isJuryValide || isAbs || rawVal === ''}
                                            placeholder="0.0"
                                            value={ptsVal}
                                            onChange={(e) => handlePointsChange(sId, `ecue|${ec.id}`, e.target.value)}
                                            className="w-12 h-8 bg-amber-500/10 border border-amber-500/20 text-center text-xs font-black text-amber-400 rounded-lg outline-none transition-all focus:border-amber-500 focus:bg-amber-500/20 disabled:opacity-30 disabled:border-white/5 disabled:bg-transparent"
                                          />
                                        </div>
                                      </div>
                                    </td>
                                  );
                                })}
                                {/* UE calculated Average Cell */}
                                <td className={`px-2 py-4 text-center border-l border-white/5 w-[95px] min-w-[95px] max-w-[95px] ${isUeDef ? 'bg-red-500/20' : 'bg-emerald-500/5'}`}>
                                  <div className="flex flex-col items-center justify-center">
                                    <span className={`text-xs font-black ${isUeDef ? 'text-red-500 animate-pulse' : 'text-emerald-400'}`}>
                                      {isUeDef ? 'DEF' : (liveUe?.val !== undefined ? liveUe.val.toFixed(2) : '-')}
                                    </span>
                                    
                                    {/* UE Points Jury */}
                                    {!isUeDef && liveUe?.val !== undefined && (
                                      <div className="flex items-center gap-0.5 mt-1">
                                        <span className="text-[8px] text-amber-500 font-bold">+</span>
                                        <input
                                          type="text"
                                          disabled={isJuryValide}
                                          placeholder="0.0"
                                          value={draftPoints[sId]?.[`ue|${u.id}`] ?? ''}
                                          onChange={(e) => handlePointsChange(sId, `ue|${u.id}`, e.target.value)}
                                          className="w-10 h-5 bg-amber-500/5 border border-amber-500/10 text-center text-[10px] font-black text-amber-400 rounded outline-none transition-all focus:border-amber-500 focus:bg-amber-500/15 disabled:opacity-30"
                                        />
                                      </div>
                                    )}
                                  </div>
                                </td>
                              </React.Fragment>
                            );
                          })}
                          
                          {/* BCC calculated Average Cell */}
                          {(() => {
                            const liveBcc = live?.bccs[b.id];
                            const isBccDef = liveBcc?.isDef;
                            return (
                              <td className={`px-2 py-4 text-center border-l border-white/10 w-[95px] min-w-[95px] max-w-[95px] ${isBccDef ? 'bg-red-500/25' : 'bg-blue-500/10'}`}>
                                <div className="flex flex-col items-center justify-center">
                                  <span className={`text-xs font-black ${isBccDef ? 'text-red-500 animate-pulse' : 'text-blue-300'}`}>
                                    {isBccDef ? 'DEF' : (liveBcc?.val !== undefined ? liveBcc.val.toFixed(2) : '-')}
                                  </span>
                                  
                                  {/* BCC Points Jury */}
                                  {!isBccDef && liveBcc?.val !== undefined && (
                                    <div className="flex items-center gap-0.5 mt-1">
                                      <span className="text-[8px] text-amber-500 font-bold">+</span>
                                      <input
                                        type="text"
                                        disabled={isJuryValide}
                                        placeholder="0.0"
                                        value={draftPoints[sId]?.[`bcc|${b.id}`] ?? ''}
                                        onChange={(e) => handlePointsChange(sId, `bcc|${b.id}`, e.target.value)}
                                        className="w-10 h-5 bg-amber-500/5 border border-amber-500/10 text-center text-[10px] font-black text-amber-400 rounded outline-none transition-all focus:border-amber-500 focus:bg-amber-500/15 disabled:opacity-30"
                                      />
                                    </div>
                                  )}
                                </div>
                              </td>
                            );
                          })()}
                        </React.Fragment>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 text-white/20 uppercase tracking-widest text-xs font-black">
            <Info className="w-12 h-12 text-white/10 animate-bounce" />
            Aucune donnée pour ce semestre
          </div>
        )}
      </div>
    </div>
  );
};

export default JuryManager;
