import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  Trash2, 
  ChevronRight, 
  ChevronDown, 
  Link, 
  Settings2, 
  Edit2, 
  Check, 
  X, 
  Copy,
  Archive,
  Layers,
  GraduationCap,
  FolderSync
} from 'lucide-react';

interface ECUE { id: number; nom: string; credits: number; heures: number; }
interface UE { id: number; nom: string; coefficient: number; ecue: ECUE[]; }
interface BCC { id: number; nom: string; semestre_id: number; bcc_annuel_lie_id?: number | null; ue: UE[]; }
interface Semestre { id: number; nom: string; bcc: BCC[]; }
interface Annee { 
  id: number; 
  nom: string; 
  is_maquette: number;
  maquette_id: number | null;
  archived: number;
  rules: any; 
  semestres: Semestre[]; 
}

const CurriculumManager: React.FC = () => {
  const [data, setData] = useState<Annee[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [editingRules, setEditingRules] = useState<number | null>(null);
  
  // Onglets : maquettes ou promotions
  const [activeTab, setActiveTab] = useState<'maquettes' | 'promotions'>('maquettes');

  // État pour la création d'une promotion
  const [showCreatePromo, setShowCreatePromo] = useState(false);
  const [newPromoNom, setNewPromoNom] = useState('');
  const [selectedMaquetteId, setSelectedMaquetteId] = useState<number | null>(null);

  // États pour l'édition en ligne de texte
  const [editingItem, setEditingItem] = useState<{ type: string, id: number, field: string } | null>(null);
  const [editValue, setEditValue] = useState<string>("");
  const [editCoeff, setEditCoeff] = useState<string>("");

  const fetchCurriculum = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/curriculum');
      const result = await response.json();
      if (result.success) {
        setData(result.data);
        // Sélectionner par défaut la première maquette dans le formulaire
        const activeMaquettes = result.data.filter((a: Annee) => a.is_maquette && !a.archived);
        if (activeMaquettes.length > 0) {
          setSelectedMaquetteId(activeMaquettes[0].id);
        }
      }
    } catch (error) { 
      console.error(error); 
    } finally { 
      setLoading(false); 
    }
  };

  useEffect(() => { 
    fetchCurriculum(); 
  }, []);

  const toggleExpand = (id: string) => setExpanded(prev => ({ ...prev, [id]: !prev[id] }));

  // Ajouter une Maquette ou un élément de sous-maquette
  const handleAddItem = async (type: string, parentId?: number) => {
    let nom = ""; 
    let extra: any = {};
    
    switch (type) {
      case 'annee': 
        nom = prompt("Nom de la nouvelle maquette (ex: Master 1 MIAGE, Licence 3) :") || ""; 
        break;
      case 'semestre': 
        nom = prompt("Nom du semestre (ex: S1) :") || ""; 
        extra = { annee_id: parentId }; 
        break;
      case 'bcc': 
        nom = prompt("Nom du BCC :") || ""; 
        extra = { semestre_id: parentId }; 
        break;
      case 'ue': 
        nom = prompt("Nom de l'UE :") || ""; 
        extra = { 
          bcc_id: parentId, 
          coefficient: parseFloat(prompt("Coefficient UE :", "1") || "1") 
        }; 
        break;
      case 'ecue': 
        nom = prompt("Nom de la Matière (ECUE) :") || ""; 
        extra = { 
          ue_id: parentId, 
          credits: parseInt(prompt("ECTS :", "3") || "3"),
          heures: parseInt(prompt("Volume Horaire (Heures) :", "30") || "30")
        }; 
        break;
    }

    if (!nom) return;

    const response = await fetch('/api/curriculum', { 
      method: 'POST', 
      headers: { 'Content-Type': 'application/json' }, 
      body: JSON.stringify({ type, nom, ...extra }) 
    });
    
    if ((await response.json()).success) fetchCurriculum();
  };

  // Création d'une promotion basée sur une maquette
  const handleCreatePromotion = async () => {
    if (!newPromoNom || !selectedMaquetteId) {
      alert("Veuillez saisir le nom de la promotion et choisir une maquette modèle.");
      return;
    }

    try {
      setLoading(true);
      const response = await fetch('/api/curriculum', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create_promotion',
          annee_id: selectedMaquetteId, // ID de la maquette modèle à dupliquer
          nom: newPromoNom
        })
      });
      const result = await response.json();
      if (result.success) {
        setNewPromoNom('');
        setShowCreatePromo(false);
        fetchCurriculum();
      } else {
        alert("Erreur lors de la création de la promotion : " + result.error);
      }
    } catch (e) {
      console.error(e);
      alert("Une erreur est survenue.");
    } finally {
      setLoading(false);
    }
  };

  const handleStartEdit = (type: string, item: any) => {
    setEditingItem({ type, id: item.id, field: 'nom' });
    setEditValue(item.nom);
    setEditCoeff(item.coefficient || item.credits || "");
  };

  const handleUpdateItem = async () => {
    if (!editingItem) return;
    const extra: any = {};
    if (editingItem.type === 'ue') extra.coefficient = parseFloat(editCoeff.replace(',', '.'));
    if (editingItem.type === 'ecue') extra.credits = parseInt(editCoeff);

    const response = await fetch('/api/curriculum', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        action: 'update', 
        type: editingItem.type, 
        id: editingItem.id, 
        nom: editValue,
        ...extra 
      })
    });
    if ((await response.json()).success) {
      setEditingItem(null);
      fetchCurriculum();
    }
  };

  // Archiver ou Désarchiver une Maquette/Promotion
  const handleToggleArchive = async (item: Annee) => {
    const response = await fetch('/api/curriculum', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'update',
        type: 'annee',
        id: item.id,
        archived: item.archived ? 0 : 1
      })
    });
    if ((await response.json()).success) {
      fetchCurriculum();
    }
  };

  const handleLinkBcc = async (bccId: number, twinId: string) => {
    const response = await fetch('/api/curriculum', { 
      method: 'POST', 
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'link_bcc', bcc_id: bccId, twin_id: twinId }) 
    });
    if ((await response.json()).success) fetchCurriculum();
  };

  const handleUpdateRules = async (anneeId: number, rules: any) => {
    const cleanedRules = {
      ...rules,
      seuil_validation_bcc: parseFloat(rules.seuil_validation_bcc.toString().replace(',', '.')),
      seuil_minimal_annuel: parseFloat(rules.seuil_minimal_annuel.toString().replace(',', '.'))
    };
    const response = await fetch('/api/curriculum', { 
      method: 'POST', 
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'update_rules', annee_id: anneeId, ...cleanedRules }) 
    });
    if ((await response.json()).success) { 
      setEditingRules(null); 
      fetchCurriculum(); 
    }
  };

  const handleDeleteItem = async (type: string, id: number) => {
    if (!confirm("Voulez-vous vraiment supprimer cet élément ? Cela supprimera toute la structure dépendante.")) return;
    await fetch('/api/curriculum', { 
      method: 'DELETE', 
      headers: { 'Content-Type': 'application/json' }, 
      body: JSON.stringify({ type, id }) 
    });
    fetchCurriculum();
  };

  const handleDuplicateAnnee = async (anneeId: number, currentNom: string) => {
    const newNom = prompt(`Nom de la nouvelle copie de ${currentNom} :`, `${currentNom} - Copie`);
    if (!newNom) return;
    try {
      setLoading(true);
      const response = await fetch('/api/curriculum', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'duplicate', annee_id: anneeId, nom: newNom })
      });
      const result = await response.json();
      if (result.success) {
        fetchCurriculum();
      } else {
        alert(`Erreur lors de la duplication : ${result.error}`);
      }
    } catch (error) {
      console.error(error);
      alert("Une erreur est survenue lors de la duplication.");
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div className="p-12 text-center text-white/20 uppercase tracking-widest text-[10px] animate-pulse">Chargement en cours...</div>;

  const renderInlineEdit = () => (
    <div className="flex items-center gap-2 animate-in fade-in duration-300">
      <input 
        autoFocus
        className="bg-slate-900 border border-yellow-500/50 rounded px-2 py-0.5 text-xs text-white outline-none min-w-[200px]"
        value={editValue}
        onChange={e => setEditValue(e.target.value)}
      />
      {(editingItem?.type === 'ue' || editingItem?.type === 'ecue') && (
        <input 
          placeholder={editingItem.type === 'ue' ? 'Coeff' : 'ECTS'}
          className="bg-slate-900 border border-yellow-500/50 rounded px-2 py-0.5 text-[10px] text-white w-16 outline-none"
          value={editCoeff}
          onChange={e => setEditCoeff(e.target.value)}
        />
      )}
      <button onClick={handleUpdateItem} className="p-1 bg-emerald-500 text-white rounded hover:bg-emerald-600"><Check className="w-3 h-3" /></button>
      <button onClick={() => setEditingItem(null)} className="p-1 bg-white/10 text-white/50 rounded hover:bg-white/20"><X className="w-3 h-3" /></button>
    </div>
  );

  // Séparation maquettes / promotions
  const maquettes = data.filter(a => a.is_maquette === 1);
  const promotions = data.filter(a => a.is_maquette === 0);

  // Rendu global de la structure d'une année
  const renderYearStructure = (annee: Annee) => {
    return (
      <div key={annee.id} className={`bg-white/5 rounded-3xl border border-white/10 overflow-hidden shadow-2xl backdrop-blur-sm transition-opacity ${annee.archived ? 'opacity-50' : ''}`}>
        <div className="bg-white/5 p-5 flex items-center justify-between border-b border-white/5">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => toggleExpand(`a-${annee.id}`)} 
              className="text-white/40 hover:text-white transition-colors"
              data-help="Déplier ou replier la structure des semestres, BCC et UE pour cette maquette/promotion"
            >
              {expanded[`a-${annee.id}`] ? <ChevronDown /> : <ChevronRight />}
            </button>
            {editingItem?.type === 'annee' && editingItem.id === annee.id ? renderInlineEdit() : (
              <div>
                <h3 className="font-black text-white text-lg tracking-tight flex items-center gap-2">
                  {annee.nom}
                  {annee.archived === 1 && (
                    <span className="text-[9px] bg-red-500/20 text-red-400 border border-red-500/30 px-2 py-0.5 rounded font-black tracking-widest uppercase">Archivée</span>
                  )}
                  {annee.is_maquette === 0 && (
                    <span className="text-[9px] bg-blue-500/20 text-blue-400 border border-blue-500/30 px-2 py-0.5 rounded font-black tracking-widest uppercase">
                      Promo ({maquettes.find(m => m.id === annee.maquette_id)?.nom || 'Maquette inconnue'})
                    </span>
                  )}
                </h3>
                <div className="flex gap-4 mt-0.5">
                  <span className="text-[9px] text-emerald-400/80 font-bold uppercase tracking-wider">Validation: {annee.rules.seuil_validation_bcc}</span>
                  <span className="text-[9px] text-amber-400/80 font-bold uppercase tracking-wider">Tolérance: {annee.rules.nb_bcc_autorises_sous_seuil} à {annee.rules.seuil_minimal_annuel}</span>
                </div>
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <button 
              onClick={() => handleStartEdit('annee', annee)} 
              className="p-2 text-white/20 hover:text-yellow-400" 
              title="Modifier le Nom"
              data-help="Modifier le nom de cette maquette ou promotion"
            >
              <Edit2 className="h-4 w-4" />
            </button>
            <button 
              onClick={() => setEditingRules(annee.id)} 
              className="p-2 text-white/20 hover:text-yellow-400 hover:bg-yellow-400/10 rounded-xl transition-all" 
              title="Configuration Jury"
              data-help="Configurer les règles de validation du jury (seuil de validation, tolérance de BCC sous le seuil, note minimale annuelle)"
            >
              <Settings2 className="h-4 w-4" />
            </button>
            <button 
              onClick={() => handleAddItem('semestre', annee.id)} 
              className="p-2 text-white/20 hover:text-blue-400 hover:bg-blue-400/10 rounded-xl transition-all" 
              title="Nouveau Semestre"
              data-help="Ajouter un nouveau semestre (ex: S1) à cette maquette/promotion"
            >
              <Plus className="h-4 w-4" />
            </button>
            <button 
              onClick={() => handleDuplicateAnnee(annee.id, annee.nom)} 
              className="p-2 text-white/20 hover:text-emerald-400 hover:bg-emerald-400/10 rounded-xl transition-all" 
              title="Dupliquer"
              data-help="Dupliquer la structure complète de cette maquette/promotion"
            >
              <Copy className="h-4 w-4" />
            </button>
            
            {/* Bouton Archiver / Désarchiver */}
            <button 
              onClick={() => handleToggleArchive(annee)} 
              className={`p-2 rounded-xl transition-all ${
                annee.archived ? 'text-red-400 hover:bg-red-400/10' : 'text-white/20 hover:text-amber-400 hover:bg-amber-400/10'
              }`}
              title={annee.archived ? "Désarchiver" : "Archiver"}
              data-help="Archiver ou désarchiver. Les promotions archivées ne sont plus affichées par défaut."
            >
              <Archive className="h-4 w-4" />
            </button>

            <button 
              onClick={() => handleDeleteItem('annee', annee.id)} 
              className="p-2 text-white/10 hover:text-red-400 hover:bg-red-400/10 rounded-xl transition-all" 
              title="Supprimer"
              data-help="Supprimer définitivement cette maquette ou promotion et toute sa structure interne"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>

        {editingRules === annee.id && (
          <div className="p-6 bg-yellow-500/5 border-b border-white/5 flex flex-wrap items-end gap-6">
            <div className="flex-1 min-w-[150px] space-y-1.5">
              <label className="text-[10px] text-yellow-500/50 font-black uppercase tracking-widest">Seuil Validation</label>
              <input 
                type="text" 
                defaultValue={annee.rules.seuil_validation_bcc} 
                id={`s-${annee.id}`} 
                className="w-full bg-slate-900/50 border border-white/10 rounded-xl px-4 py-2 text-white text-sm focus:border-yellow-500 outline-none" 
                data-help="Seuil de moyenne requis pour valider automatiquement un BCC (généralement 10)"
              />
            </div>
            <div className="flex-1 min-w-[150px] space-y-1.5">
              <label className="text-[10px] text-yellow-500/50 font-black uppercase tracking-widest">Nombre Toléré</label>
              <input 
                type="number" 
                defaultValue={annee.rules.nb_bcc_autorises_sous_seuil} 
                id={`n-${annee.id}`} 
                className="w-full bg-slate-900/50 border border-white/10 rounded-xl px-4 py-2 text-white text-sm focus:border-yellow-500 outline-none" 
                data-help="Nombre maximal de BCC non validés (sous la moyenne) tolérés pour compenser l'année"
              />
            </div>
            <div className="flex-1 min-w-[150px] space-y-1.5">
              <label className="text-[10px] text-yellow-500/50 font-black uppercase tracking-widest">Note Minimale</label>
              <input 
                type="text" 
                defaultValue={annee.rules.seuil_minimal_annuel} 
                id={`m-${annee.id}`} 
                className="w-full bg-slate-900/50 border border-white/10 rounded-xl px-4 py-2 text-white text-sm focus:border-yellow-500 outline-none" 
                data-help="Note plancher en dessous de laquelle aucune compensation de BCC n'est autorisée par le jury"
              />
            </div>
            <button 
              onClick={() => handleUpdateRules(annee.id, {
                seuil_validation_bcc: (document.getElementById(`s-${annee.id}`) as HTMLInputElement).value,
                nb_bcc_autorises_sous_seuil: (document.getElementById(`n-${annee.id}`) as HTMLInputElement).value,
                seuil_minimal_annuel: (document.getElementById(`m-${annee.id}`) as HTMLInputElement).value
              })}
              className="bg-yellow-500 text-black px-8 py-2 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-yellow-400 transition-all shadow-lg"
              data-help="Sauvegarder les règles de validation pour cette promotion ou maquette"
            >
              Appliquer
            </button>
            <button onClick={() => setEditingRules(null)} className="px-4 py-2 text-white/20 text-xs font-bold hover:text-white transition-colors">Annuler</button>
          </div>
        )}

        {expanded[`a-${annee.id}`] && (
          <div className="p-6 space-y-8">
            {annee.semestres.map((semestre) => (
              <div key={semestre.id} className="border-l-2 border-blue-500/20 ml-4 pl-8 space-y-4">
                <div className="flex items-center justify-between">
                  {editingItem?.type === 'semestre' && editingItem.id === semestre.id ? renderInlineEdit() : (
                    <h4 className="font-black text-blue-300 text-[10px] uppercase tracking-[0.2em] flex items-center gap-2 group">
                      {semestre.nom}
                      <button onClick={() => handleStartEdit('semestre', semestre)} className="opacity-0 group-hover:opacity-100 p-1 hover:text-white transition-opacity"><Edit2 className="w-2.5 h-2.5" /></button>
                    </h4>
                  )}
                  <button 
                    onClick={() => handleAddItem('bcc', semestre.id)} 
                    className="text-[10px] font-bold bg-blue-500/10 text-blue-400 px-3 py-1 rounded-lg border border-blue-500/20 hover:bg-blue-500/20 transition-all"
                    data-help="Ajouter un Bloc de Connaissances et de Compétences (BCC) dans ce semestre"
                  >
                    + AJOUTER BCC
                  </button>
                </div>

                <div className="grid grid-cols-1 gap-4">
                  {semestre.bcc.map((bcc) => {
                    const isLinked = !!bcc.bcc_annuel_lie_id;
                    return (
                      <div key={bcc.id} className={`bg-white/5 rounded-2xl p-5 border transition-all ${isLinked ? 'border-blue-500/30 bg-blue-500/5' : 'border-white/5'}`}>
                        <div className="flex justify-between items-center mb-4">
                          <div className="flex items-center gap-4">
                            {editingItem?.type === 'bcc' && editingItem.id === bcc.id ? renderInlineEdit() : (
                              <span className="text-xs font-black text-white/90 uppercase tracking-tight flex items-center gap-2 group">
                                {bcc.nom}
                                <button onClick={() => handleStartEdit('bcc', bcc)} className="opacity-0 group-hover:opacity-100 p-1 hover:text-yellow-400 transition-opacity"><Edit2 className="w-3 h-3" /></button>
                              </span>
                            )}
                            <div 
                              className="flex items-center gap-2 bg-slate-900/50 px-3 py-1.5 rounded-xl border border-white/5 shadow-inner"
                              data-help="Jumeler ce BCC avec un BCC de l'autre semestre pour calculer une moyenne jumeau"
                            >
                              <Link className={`w-3 h-3 ${isLinked ? 'text-blue-400' : 'text-white/20'}`} />
                              <select 
                                className="bg-transparent text-[10px] text-white/50 outline-none cursor-pointer hover:text-white transition-colors max-w-[150px] font-bold"
                                value={bcc.bcc_annuel_lie_id || ''}
                                onChange={(e) => handleLinkBcc(bcc.id, e.target.value)}
                              >
                                <option value="" className="bg-slate-900 text-white/30">Non jumelé</option>
                                {annee.semestres
                                  .filter(s => s.id !== semestre.id)
                                  .flatMap(s => s.bcc.map(b => ({ ...b, semestreNom: s.nom })))
                                  .filter(b => !b.bcc_annuel_lie_id || b.id === bcc.bcc_annuel_lie_id)
                                  .map(b => (
                                    <option key={b.id} value={b.id} className="bg-slate-900 text-white">[{b.semestreNom}] {b.nom}</option>
                                  ))
                                }
                              </select>
                            </div>
                          </div>
                          <div className="flex gap-2 items-center">
                            <button 
                              onClick={() => handleAddItem('ue', bcc.id)} 
                              className="text-[10px] font-black bg-emerald-500/10 text-emerald-400 px-3 py-1 rounded-lg border border-emerald-500/20 hover:bg-emerald-500/20 transition-all"
                              data-help="Ajouter une nouvelle Unité d'Enseignement (UE) au BCC"
                            >
                              + UE
                            </button>
                            <button 
                              onClick={() => handleDeleteItem('bcc', bcc.id)} 
                              className="p-1.5 text-white/10 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-all"
                              data-help="Supprimer définitivement ce BCC et ses UE dépendantes"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {bcc.ue.map((ue) => (
                            <div key={ue.id} className="bg-white/5 p-4 rounded-xl border border-white/5 flex justify-between items-center group hover:bg-white/10 transition-all">
                              <div className="flex-1">
                                {editingItem?.type === 'ue' && editingItem.id === ue.id ? renderInlineEdit() : (
                                  <div className="flex items-center gap-2 group/uename">
                                    <p className="text-xs font-bold text-white/70">{ue.nom}</p>
                                    <span className="text-[8px] bg-white/5 text-white/30 px-1.5 py-0.5 rounded uppercase font-black tracking-tighter">Coeff {ue.coefficient}</span>
                                    <button onClick={() => handleStartEdit('ue', ue)} className="opacity-0 group-hover/uename:opacity-100 p-1 hover:text-yellow-400 transition-opacity"><Edit2 className="w-2.5 h-2.5" /></button>
                                  </div>
                                )}
                                <div className="mt-2 ml-4 space-y-1.5 border-l border-white/10 pl-4">
                                  {ue.ecue.map(ecue => (
                                    <div key={ecue.id} className="flex justify-between items-center text-[10px] text-white/30 group/ecue">
                                      {editingItem?.type === 'ecue' && editingItem.id === ecue.id ? renderInlineEdit() : (
                                        <div className="flex items-center gap-2 w-full">
                                          <span className="flex-1 hover:text-white/60 transition-colors cursor-default">• {ecue.nom}</span>
                                          <span className="text-[8px] opacity-40 font-bold">{ecue.credits} ECTS / {ecue.heures || 0}H</span>
                                          <button onClick={() => handleStartEdit('ecue', ecue)} className="opacity-0 group-hover/ecue:opacity-100 p-0.5 hover:text-yellow-400 transition-all"><Edit2 className="w-2.5 h-2.5" /></button>
                                          <button 
                                            onClick={() => handleDeleteItem('ecue', ecue.id)} 
                                            className="opacity-0 group-hover/ecue:opacity-100 hover:text-red-400 transition-all"
                                            data-help="Supprimer cette matière (ECUE)"
                                          >
                                            <Trash2 className="h-2.5 w-2.5" />
                                          </button>
                                        </div>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              </div>
                              <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button 
                                  onClick={() => handleAddItem('ecue', ue.id)} 
                                  className="p-1.5 bg-white/5 text-white/20 hover:text-blue-400 hover:bg-blue-400/10 rounded-lg transition-all"
                                  data-help="Ajouter une matière (ECUE) à cette UE"
                                >
                                  <Plus className="h-3 w-3" />
                                </button>
                                <button 
                                  onClick={() => handleDeleteItem('ue', ue.id)} 
                                  className="p-1.5 bg-white/5 text-white/20 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-all"
                                  data-help="Supprimer cette UE et ses matières associées"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Navigation par Onglets (Maquettes vs Promotions) */}
      <div className="flex justify-between items-center bg-white/5 p-4 rounded-xl border border-white/10 backdrop-blur-md">
        <div className="flex bg-white/5 p-1 rounded-xl border border-white/5">
          <button 
            onClick={() => { setActiveTab('maquettes'); setShowCreatePromo(false); }}
            className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
              activeTab === 'maquettes' ? 'bg-white/10 text-white shadow-lg' : 'text-white/30 hover:text-white/60'
            }`}
            data-help="Afficher l'éditeur de Maquettes Pédagogiques (le canevas des cours et coefficients)"
          >
            <Layers className="w-3.5 h-3.5" />
            Maquettes Pédagogiques
          </button>
          <button 
            onClick={() => { setActiveTab('promotions'); }}
            className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
              activeTab === 'promotions' ? 'bg-white/10 text-white shadow-lg' : 'text-white/30 hover:text-white/60'
            }`}
            data-help="Afficher la liste des Promotions Actives (les instances de cours sur lesquelles sont inscrits les étudiants)"
          >
            <GraduationCap className="w-3.5 h-3.5" />
            Promotions Actives
          </button>
        </div>

        {/* Boutons d'action contextuels */}
        {activeTab === 'maquettes' ? (
          <button 
            onClick={() => handleAddItem('annee')} 
            className="bg-blue-600 text-white px-6 py-2 rounded-xl text-xs font-black uppercase tracking-wider hover:bg-blue-500 transition-all shadow-lg shadow-blue-500/20 flex items-center gap-1.5"
            data-help="Créer une toute nouvelle maquette d'année vide (ex: Master 2 MIAGE)"
          >
            <Plus className="w-4 h-4" /> Nouvelle Maquette
          </button>
        ) : (
          <button 
            onClick={() => setShowCreatePromo(!showCreatePromo)} 
            className="bg-emerald-600 text-white px-6 py-2 rounded-xl text-xs font-black uppercase tracking-wider hover:bg-emerald-500 transition-all shadow-lg shadow-emerald-500/20 flex items-center gap-1.5"
            data-help="Créer une promotion en instanciant une maquette existante"
          >
            <Plus className="w-4 h-4" /> Appliquer à une Promotion
          </button>
        )}
      </div>

      {/* Formulaire popup pour créer une promotion à partir d'une maquette */}
      {showCreatePromo && activeTab === 'promotions' && (
        <div className="bg-white/5 border border-emerald-500/20 rounded-3xl p-6 space-y-4 backdrop-blur-md animate-in slide-in-from-top duration-300">
          <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm">
            <FolderSync className="w-4 h-4" />
            Créer une Promotion (Instancier une Maquette)
          </div>
          <p className="text-white/40 text-xs">Saisissez le nom de la promotion (ex: Marseille 2026) et sélectionnez la maquette de cours correspondante. La structure de cours sera automatiquement clonée pour cette promotion.</p>
          <div className="flex flex-wrap gap-4 items-end">
            <div className="flex-1 min-w-[200px] space-y-1.5">
              <label className="text-[10px] text-white/40 font-black uppercase tracking-widest">Nom de la Promotion</label>
              <input 
                type="text" 
                placeholder="Ex: Marseille 2026..."
                className="w-full bg-slate-900/50 border border-white/10 rounded-xl px-4 py-2 text-white text-xs outline-none focus:border-emerald-500" 
                value={newPromoNom}
                onChange={e => setNewPromoNom(e.target.value)}
                data-help="Saisissez un nom unique pour identifier cette promotion (ex: Marseille Alternance 2026)"
              />
            </div>
            <div className="flex-1 min-w-[200px] space-y-1.5">
              <label className="text-[10px] text-white/40 font-black uppercase tracking-widest">Maquette Pédagogique Modèle</label>
              <select 
                className="w-full bg-slate-900/80 border border-white/10 rounded-xl px-4 py-2 text-white text-xs outline-none cursor-pointer focus:border-emerald-500"
                value={selectedMaquetteId || ''}
                onChange={e => setSelectedMaquetteId(Number(e.target.value))}
                data-help="Choisissez la maquette modèle dont la structure sera copiée pour cette nouvelle promotion"
              >
                {maquettes.filter(m => !m.archived).map(m => (
                  <option key={m.id} value={m.id} className="bg-slate-900">{m.nom}</option>
                ))}
                {maquettes.filter(m => !m.archived).length === 0 && (
                  <option value="">Aucune maquette active disponible</option>
                )}
              </select>
            </div>
            <div className="flex gap-2">
              <button 
                onClick={handleCreatePromotion}
                className="bg-emerald-600 text-white px-6 py-2 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-emerald-500 transition-all shadow-lg"
                data-help="Créer la promotion active dans le système avec la structure sélectionnée"
              >
                Créer la Promotion
              </button>
              <button 
                onClick={() => setShowCreatePromo(false)} 
                className="px-4 py-2 text-white/30 text-xs font-bold hover:text-white transition-colors"
              >
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Liste filtrée selon l'onglet actif */}
      <div className="space-y-4">
        {activeTab === 'maquettes' ? (
          <>
            {maquettes.map(annee => renderYearStructure(annee))}
            {maquettes.length === 0 && (
              <div className="text-center py-12 text-white/20 italic text-sm">
                Aucune maquette pédagogique créée. Cliquez sur "+ Nouvelle Maquette" ci-dessus pour commencer.
              </div>
            )}
          </>
        ) : (
          <>
            {promotions.map(annee => renderYearStructure(annee))}
            {promotions.length === 0 && (
              <div className="text-center py-12 text-white/20 italic text-sm">
                Aucune promotion active créée. Cliquez sur "Appliquer à une Promotion" ci-dessus pour en créer une.
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default CurriculumManager;
