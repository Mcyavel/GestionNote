import { useState } from 'react'
import { Book, Shield, Calculator, FileText, CheckCircle, HelpCircle } from 'lucide-react'

export default function Documentation() {
  const [activeTab, setActiveTab] = useState<'screens' | 'rules' | 'roles' | 'dev'>('screens')

  const sections = {
    screens: [
      {
        title: "Tableau de Bord & Menu Principal",
        desc: "L'interface principale est conçue comme un bureau virtuel avec des fenêtres superposables et réductibles.",
        details: [
          "Barre des tâches en bas permettant de masquer, d'afficher ou de minimiser les fenêtres ouvertes.",
          "Indicateur de session en haut à droite avec le nom d'utilisateur, le rôle et un bouton de déconnexion sécurisé.",
          "Raccourcis sur le bureau pour ouvrir les modules selon les droits de l'utilisateur."
        ]
      },
      {
        title: "Gestion des Maquettes (Curriculum)",
        desc: "Permet de définir la structure pédagogique des enseignements.",
        details: [
          "Création d'Années Universitaires (ex: Master 1 Marseille, Master 2). Une année peut être configurée comme 'Maquette Pure' (modèle) ou affectée à des promotions actives.",
          "Structure hiérarchique stricte : Année -> Semestres (S1, S2...) -> BCC (Blocs de Connaissances et Compétences) -> UE (Unités d'Enseignement) -> ECUE (Éléments Constitutifs d'une Unité d'Enseignement).",
          "Association de BCC jumeaux : Permet de lier deux BCC d'un semestre à l'autre (ex: BCC1 du S1 lié au BCC1 du S2) pour effectuer la compensation annuelle.",
          "Définition des coefficients au niveau des UE.",
          "Affectation de maquettes à d'autres promotions en un clic."
        ]
      },
      {
        title: "Gestion des Étudiants",
        desc: "Module d'administration des effectifs étudiants.",
        details: [
          "Ajout, modification et suppression d'étudiants (Nom, Prénom, Email, N° Étudiant, Année/Promotion d'inscription).",
          "Importation en masse d'étudiants via des fichiers Excel.",
          "Gestion des redoublants : Détection automatique via l'adresse email et l'historique d'inscription dans des années du même type.",
          "Bouton de synchronisation des notes pour copier automatiquement les notes des UE validées l'année précédente."
        ]
      },
      {
        title: "Saisie des Notes",
        desc: "Interface de saisie et de suivi des notes par promotion et ECUE.",
        details: [
          "Sélection de la Promotion, du Semestre, de l'UE et de l'ECUE cible.",
          "Tableau de saisie en temps réel avec sauvegarde automatique.",
          "Prise en compte des statuts spéciaux : Note numérique (0-20), ABI (Absence Injustifiée, équivaut à 0/20 pour les calculs) et DEF (Défaillant, bloque le calcul de la moyenne de l'UE/BCC).",
          "Indicateur visuel de l'état de validation de la saisie."
        ]
      },
      {
        title: "Délibération du Jury",
        desc: "Module critique réservé aux administrateurs pour ajuster les notes et valider les semestres.",
        details: [
          "Attribution de points de jury (ajustements manuels) au niveau des ECUE, des UE ou des BCC pour un étudiant donné.",
          "Saisie des points Bonus / Malus appliqués directement sur la moyenne d'un BCC du semestre.",
          "Verrouillage/Validation définitive du jury pour un semestre : fige les notes et applique les points de jury dans les calculs de moyennes.",
          "Déverrouillage possible en cas d'erreur de saisie."
        ]
      },
      {
        title: "Le Grand Livre (Grade Ledger)",
        desc: "Vue d'ensemble complète et détaillée des résultats pour une promotion.",
        details: [
          "Affichage sous forme de grand tableau matriciel de toutes les notes d'ECUE, moyennes d'UE et moyennes de BCC pour chaque étudiant.",
          "Calcul en temps réel des moyennes annuelles globales et du statut de validation de l'année (ADMIS, AJOURNÉ, INCOMPLET, DÉFAILLANT).",
          "Coloration dynamique selon les performances (Admis en vert, sous le seuil de validation en orange/rouge).",
          "Exportation complète des résultats au format Excel."
        ]
      },
      {
        title: "Comparateur Apogée",
        desc: "Outil de réconciliation pour valider les notes locales par rapport à celles enregistrées dans le système Apogée.",
        details: [
          "Importation d'un fichier Excel extrait d'Apogée.",
          "Analyse automatique et comparaison des notes d'ECUE et moyennes.",
          "Mise en évidence visuelle des écarts : notes discordantes, étudiants manquants, ou notes non encore saisies d'un côté ou de l'autre."
        ]
      },
      {
        title: "Statistiques & Décisions",
        desc: "Tableau de bord décisionnel sur les performances de la promotion.",
        details: [
          "Taux de réussite global (Admis, Ajournés, Défaillants).",
          "Moyennes générales, minimales et maximales par UE et ECUE.",
          "Distribution des notes sous forme d'histogrammes.",
          "Liste des étudiants en situation d'échec ou sous condition de rattrapage."
        ]
      }
    ],
    rules: [
      {
        title: "1. Calcul des Moyennes d'UE",
        formula: "Moyenne UE = Somme(Notes ECUE) / Nombre d'ECUE dans l'UE",
        details: [
          "Les ECUE au sein d'une même UE ont toutes un coefficient équivalent (moyenne arithmétique simple).",
          "Si une ECUE a le statut 'ABI' (Absence Injustifiée), sa note est comptée comme 0.0.",
          "Si une ECUE a le statut 'DEF' (Défaillant), la moyenne de l'UE entière devient 'DEF'.",
          "Si des points de jury sont attribués à une ECUE, la note de l'ECUE est plafonnée à 20.0 avant le calcul de l'UE : Note_Finale = Min(20, Note_Saisie + Points_Jury).",
          "Si des points de jury sont attribués à l'UE, ils sont ajoutés après la moyenne des ECUE : Moyenne_UE_Finale = Min(20, Moyenne_UE_Calculée + Points_Jury_UE)."
        ]
      },
      {
        title: "2. Calcul des Moyennes de BCC (Semestriel)",
        formula: "Moyenne BCC = Somme(Moyenne UE * Coeff UE) / Somme(Coeff UE)",
        details: [
          "Moyenne pondérée des UE constituant le BCC.",
          "Si l'une des UE est 'DEF', la moyenne du BCC devient également 'DEF'.",
          "Le bonus/malus de semestre est appliqué sur la moyenne du BCC : Moyenne_BCC = Max(0, Min(20, Moyenne_BCC_Calculée + Bonus - Malus)).",
          "Si des points de jury sont attribués au BCC, ils s'ajoutent en dernier : Moyenne_BCC_Finale = Min(20, Moyenne_BCC + Points_Jury_BCC)."
        ]
      },
      {
        title: "3. Calcul des BCC Annuels",
        formula: "Moyenne Annuelle BCC = Somme(Moyenne UE * Coeff UE) / Somme(Coeff UE)",
        details: [
          "Se base sur le regroupement de toutes les UEs composant les deux BCC jumeaux configurés dans la maquette (ex: les UEs du BCC1 de S1 et du BCC1 de S2).",
          "Calcule la moyenne pondérée globale de toutes ces UEs réunies en fonction de leurs coefficients respectifs.",
          "Si l'une des UEs constitutives des deux BCC jumeaux a le statut 'DEF', le BCC annuel est marqué comme 'DEF'.",
          "S'il n'y a aucune note dans les UEs constitutives, le BCC annuel est 'INCOMPLET' (null)."
        ]
      },
      {
        title: "4. Règle de Validation de l'Année (Moyenne & Statuts)",
        formula: "Moyenne Générale = Moyenne de tous les BCC Annuels",
        details: [
          "Le statut de l'étudiant est déterminé selon les règles de validation enregistrées pour sa promotion (configurables dans l'écran de modification de l'année) :",
          "Seuil de validation d'un BCC : Généralement 10.0.",
          "Seuil minimal annuel toléré : Généralement 9.0 (note éliminatoire si un BCC annuel est en dessous).",
          "Nombre de BCC sous le seuil autorisés : Généralement 1 BCC.",
          "ADMIS : Si tous les BCC annuels sont >= au seuil de validation (10.0), OU si au plus N (ex: 1) BCC annuels sont sous le seuil (ex: >= 9.0) et qu'aucun n'est inférieur au seuil minimal (ex: < 9.0).",
          "AJOURNÉ : Si les critères d'admission ne sont pas remplis (ex: moyenne générale trop basse, trop de BCC sous le seuil, ou un BCC inférieur à la note éliminatoire).",
          "DÉFAILLANT : Si au moins une note/moyenne de BCC annuel est 'DEF'.",
          "INCOMPLET : S'il manque des notes empêchant le calcul complet de l'année."
        ]
      },
      {
        title: "5. Régulation des Étudiants Redoublants",
        formula: "Conservation des Unités d'Enseignement (UE) validées",
        details: [
          "Lorsqu'un étudiant se réinscrit dans une année du même type (détection par regex insensible à l'année et à la casse, ex: 'Master 1 Marseille 2024' vs 'Master 1 Marseille 2025'), le système identifie sa précédente inscription.",
          "Une UE de l'ancienne année est considérée comme VALIDÉE si sa moyenne finale était >= 10.0.",
          "Lors de la synchronisation, toutes les notes d'ECUE appartenant à cette UE validée sont recopiées dans la nouvelle année d'inscription de l'étudiant.",
          "Les UE non validées doivent être intégralement repassées (les notes d'ECUE associées ne sont pas conservées)."
        ]
      }
    ],
    roles: [
      {
        name: "ADMIN (Administrateur)",
        rights: [
          "Accès complet à tous les écrans et toutes les fonctionnalités.",
          "Gestion des utilisateurs, création de comptes et attribution des rôles.",
          "Création et édition des maquettes pédagogiques.",
          "Modification des règles de validation de chaque promotion.",
          "Saisie des points de jury, bonus/malus et validation définitive des semestres.",
          "Saisie et modification des notes, consultation du Grand Livre, comparateur Apogée et statistiques."
        ]
      },
      {
        name: "SCOLARITE (Gestionnaire Scolarité)",
        rights: [
          "Gestion des maquettes (création et édition).",
          "Gestion des étudiants (création, modification, imports Excel, synchronisation des redoublants).",
          "Accès au Grand Livre pour toutes les promotions (consultation et exports Excel).",
          "Accès au comparateur Apogée pour validation des notes.",
          "Consultation des statistiques de toutes les promotions.",
          "⚠️ Pas d'accès à la gestion des utilisateurs, aux délibérations de jury (points jury, bonus/malus, validation de semestre) ni à la saisie directe des notes."
        ]
      },
      {
        name: "ENSEIGNANT_GLOBAL (Enseignant à accès complet)",
        rights: [
          "Saisie des notes pour tous les enseignements de toutes les promotions.",
          "Consultation du Grand Livre et des statistiques pour toutes les promotions.",
          "⚠️ Aucun accès d'administration (maquettes, étudiants, délibérations jury, utilisateurs, configuration)."
        ]
      },
      {
        name: "ENSEIGNANT_PROMO (Enseignant limité à sa promotion)",
        rights: [
          "Saisie des notes uniquement pour les promotions auxquelles il est rattaché.",
          "Consultation du Grand Livre et des statistiques uniquement pour ses promotions rattachées.",
          "⚠️ Aucun accès d'administration."
        ]
      },
      {
        name: "LECTEUR_GLOBAL (Lecteur à accès complet)",
        rights: [
          "Consultation du Grand Livre et des statistiques pour toutes les promotions.",
          "⚠️ Aucun droit d'écriture (saisie de notes, édition d'étudiants, jury, etc.)."
        ]
      },
      {
        name: "LECTEUR_PROMO (Lecteur limité à sa promotion)",
        rights: [
          "Consultation du Grand Livre et des statistiques uniquement pour les promotions affectées.",
          "⚠️ Aucun droit d'écriture."
        ]
      }
    ],
    dev: [
      {
        title: "Sécurité & Authentification",
        details: [
          "Session PHP sécurisée avec attributs Cookie : Secure, HttpOnly, SameSite=Strict.",
          "Contrôle d'accès RBAC (Role-Based Access Control) côté serveur dans api/auth.php via requirePermission() et requirePromotionAccess().",
          "Protection CSRF : un jeton unique généré à la connexion et validé sur chaque requête POST/PUT/DELETE.",
          "Politique de premier changement de mot de passe obligatoire lors de la création d'un utilisateur."
        ]
      },
      {
        title: "Base de Données",
        details: [
          "Moteur relationnel MySQL/InnoDB assurant l'intégrité référentielle via des clés étrangères configurées en 'ON DELETE CASCADE'.",
          "Requêtes préparées systématiques avec PDO pour interdire les injections SQL.",
          "Tables indexées sur les clés de recherche principales pour optimiser les performances des calculs de moyennes massifs."
        ]
      }
    ]
  }

  return (
    <div className="h-full flex flex-col bg-gray-950/70 text-white rounded-2xl overflow-hidden backdrop-blur-md border border-white/10 font-sans">
      {/* Header */}
      <div className="p-5 border-b border-white/10 bg-white/5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Book className="w-6 h-6 text-blue-400 animate-pulse" />
          <div>
            <h2 className="text-lg font-bold tracking-wide">Guide d'Utilisation & Règles Métier</h2>
            <p className="text-xs text-white/50">Documentation complète du système de gestion des notes Miage Note</p>
          </div>
        </div>
        <div className="flex gap-1.5 bg-black/40 p-1 rounded-xl border border-white/5">
          <button 
            onClick={() => setActiveTab('screens')} 
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 ${activeTab === 'screens' ? 'bg-blue-600 text-white shadow-md' : 'text-white/60 hover:text-white hover:bg-white/5'}`}
          >
            <FileText className="w-3.5 h-3.5" />
            Écrans & Modules
          </button>
          <button 
            onClick={() => setActiveTab('rules')} 
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 ${activeTab === 'rules' ? 'bg-blue-600 text-white shadow-md' : 'text-white/60 hover:text-white hover:bg-white/5'}`}
          >
            <Calculator className="w-3.5 h-3.5" />
            Règles & Calculs
          </button>
          <button 
            onClick={() => setActiveTab('roles')} 
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 ${activeTab === 'roles' ? 'bg-blue-600 text-white shadow-md' : 'text-white/60 hover:text-white hover:bg-white/5'}`}
          >
            <Shield className="w-3.5 h-3.5" />
            Rôles & Droits
          </button>
          <button 
            onClick={() => setActiveTab('dev')} 
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 ${activeTab === 'dev' ? 'bg-blue-600 text-white shadow-md' : 'text-white/60 hover:text-white hover:bg-white/5'}`}
          >
            <CheckCircle className="w-3.5 h-3.5" />
            Sécurité & Architecture
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        
        {activeTab === 'screens' && (
          <div className="space-y-6">
            <div className="bg-blue-500/10 border border-blue-500/20 p-4 rounded-xl flex items-start gap-3">
              <HelpCircle className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
              <p className="text-xs text-blue-200 leading-relaxed">
                Retrouvez ici la description détaillée de chaque module disponible dans l'application. 
                Certains écrans ne s'affichent sur votre bureau qu'en fonction de votre rôle et de vos permissions d'accès.
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {sections.screens.map((s, idx) => (
                <div key={idx} className="bg-white/5 rounded-xl border border-white/10 p-5 hover:border-blue-500/30 transition-all hover:bg-white/10">
                  <h3 className="text-sm font-bold text-blue-300 mb-2">{s.title}</h3>
                  <p className="text-xs text-white/70 mb-4">{s.desc}</p>
                  <ul className="space-y-2">
                    {s.details.map((d, i) => (
                      <li key={i} className="text-[11px] text-white/50 flex items-start gap-2">
                        <span className="w-1.5 h-1.5 bg-blue-500 rounded-full mt-1.5 shrink-0" />
                        <span>{d}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'rules' && (
          <div className="space-y-6">
            <div className="bg-amber-500/10 border border-amber-500/20 p-4 rounded-xl flex items-start gap-3">
              <Calculator className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-200 leading-relaxed">
                Les règles de calcul appliquées respectent les statuts académiques et le principe de compensation semestrielle et annuelle.
                Toutes les opérations mathématiques de calculs de moyennes et de validations sont implémentées côté serveur pour garantir leur intégrité.
              </p>
            </div>
            <div className="space-y-4">
              {sections.rules.map((r, idx) => (
                <div key={idx} className="bg-white/5 rounded-xl border border-white/10 p-5 hover:border-amber-500/30 transition-all">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 mb-3 pb-3 border-b border-white/5">
                    <h3 className="text-sm font-bold text-amber-300">{r.title}</h3>
                    <span className="text-[10px] font-mono bg-black/40 text-amber-200 px-2.5 py-1 rounded-md border border-amber-500/20">{r.formula}</span>
                  </div>
                  <ul className="space-y-2.5">
                    {r.details.map((d, i) => (
                      <li key={i} className="text-[11px] text-white/60 flex items-start gap-2.5">
                        <span className="w-1.5 h-1.5 bg-amber-500 rounded-full mt-1.5 shrink-0" />
                        <span>{d}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'roles' && (
          <div className="space-y-6">
            <div className="bg-purple-500/10 border border-purple-500/20 p-4 rounded-xl flex items-start gap-3">
              <Shield className="w-5 h-5 text-purple-400 shrink-0 mt-0.5" />
              <p className="text-xs text-purple-200 leading-relaxed">
                Le système intègre un modèle de sécurité RBAC (Contrôle d'accès basé sur les rôles). 
                Chaque action de consultation ou de modification de données fait l'objet d'un contrôle strict côté serveur.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-4">
              {sections.roles.map((role, idx) => (
                <div key={idx} className="bg-white/5 rounded-xl border border-white/10 p-5 hover:border-purple-500/30 transition-all">
                  <h3 className="text-sm font-bold text-purple-300 mb-3 flex items-center gap-2">
                    <Shield className="w-4 h-4 text-purple-400" />
                    {role.name}
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {role.rights.map((right, i) => (
                      <div key={i} className="text-[11px] text-white/60 flex items-start gap-2 bg-black/25 p-2 rounded-lg border border-white/5">
                        <span className="text-purple-400 shrink-0">✓</span>
                        <span>{right}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'dev' && (
          <div className="space-y-6">
            <div className="bg-emerald-500/10 border border-emerald-500/20 p-4 rounded-xl flex items-start gap-3">
              <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
              <p className="text-xs text-emerald-200 leading-relaxed">
                Cette section décrit la conformité technique du système (normes de cybersécurité et structure BDD) conformément aux exigences d'audit.
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {sections.dev.map((dev, idx) => (
                <div key={idx} className="bg-white/5 rounded-xl border border-white/10 p-5 hover:border-emerald-500/30 transition-all">
                  <h3 className="text-sm font-bold text-emerald-300 mb-4">{dev.title}</h3>
                  <ul className="space-y-2.5">
                    {dev.details.map((detail, i) => (
                      <li key={i} className="text-[11px] text-white/60 flex items-start gap-2.5">
                        <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full mt-1.5 shrink-0" />
                        <span>{detail}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
