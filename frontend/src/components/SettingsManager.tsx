import { useState, useEffect } from 'react'
import { Settings, Shield, HardDrive, Layout, Save, RefreshCw, Check, Sparkles } from 'lucide-react'

interface SettingsManagerProps {
  currentUser: {
    username: string;
    role: string;
  }
}

export default function SettingsManager({ currentUser }: SettingsManagerProps) {
  const [activeTab, setActiveTab] = useState<'system' | 'academic' | 'security' | 'preferences'>('preferences')
  const [loading, setLoading] = useState(false)
  const [successMsg, setSuccessMsg] = useState('')

  // Prefs (Available to all)
  const [theme, setTheme] = useState(localStorage.getItem('pref_theme') || 'dark')
  const [density, setDensity] = useState(localStorage.getItem('pref_density') || 'comfortable')
  const [compactLedger, setCompactLedger] = useState(localStorage.getItem('pref_compact_ledger') === 'true')

  // Academic settings (Admin and Scolarité)
  const [defMinSeuil, setDefMinSeuil] = useState(10.0)
  const [defMinEliminatoire, setDefMinEliminatoire] = useState(9.0)
  const [defMaxBccSousSeuil, setDefMaxBccSousSeuil] = useState(1)

  // Security settings (Admin only)
  const [sessionTimeout, setSessionTimeout] = useState(30)
  const [passwordMinLength, setPasswordMinLength] = useState(8)
  const [requireSpecialChar, setRequireSpecialChar] = useState(true)

  const userRole = currentUser?.role || 'LECTEUR_GLOBAL'

  const [contextualHelp, setContextualHelp] = useState(localStorage.getItem('pref_contextual_help') !== 'false')

  // Set initial tab based on role permissions
  useEffect(() => {
    if (userRole === 'ADMIN') {
      setActiveTab('academic')
    } else if (userRole === 'SCOLARITE') {
      setActiveTab('academic')
    } else {
      setActiveTab('preferences')
    }
  }, [userRole])

  const handleSavePreferences = () => {
    setLoading(true)
    setTimeout(() => {
      localStorage.setItem('pref_theme', theme)
      localStorage.setItem('pref_density', density)
      localStorage.setItem('pref_compact_ledger', compactLedger ? 'true' : 'false')
      localStorage.setItem('pref_contextual_help', contextualHelp ? 'true' : 'false')
      window.dispatchEvent(new Event('settings-updated'))
      setLoading(false)
      setSuccessMsg('Préférences enregistrées avec succès !')
      setTimeout(() => setSuccessMsg(''), 3000)
    }, 500)
  }

  const handleSaveAcademic = () => {
    setLoading(true)
    setTimeout(() => {
      // Simulation of saving global academic rules configurations
      setLoading(false)
      setSuccessMsg('Règles académiques par défaut enregistrées !')
      setTimeout(() => setSuccessMsg(''), 3000)
    }, 600)
  }

  const handleSaveSecurity = () => {
    setLoading(true)
    setTimeout(() => {
      // Simulation of saving system security policies
      setLoading(false)
      setSuccessMsg('Paramètres de sécurité mis à jour !')
      setTimeout(() => setSuccessMsg(''), 3000)
    }, 600)
  }

  return (
    <div className="h-full flex bg-gray-950/60 text-white rounded-2xl overflow-hidden backdrop-blur-md border border-white/10 font-sans">
      {/* Sidebar navigation */}
      <div className="w-64 border-r border-white/10 bg-black/40 p-4 flex flex-col justify-between">
        <div className="space-y-6">
          <div className="flex items-center gap-2.5 px-2">
            <Settings className="w-5 h-5 text-blue-400" />
            <div>
              <h3 className="text-sm font-bold tracking-wide">Configuration</h3>
              <p className="text-[10px] text-white/40">Paramètres système & visuels</p>
            </div>
          </div>

          <div className="space-y-1">
            {(userRole === 'ADMIN' || userRole === 'SCOLARITE') && (
              <button
                onClick={() => setActiveTab('academic')}
                className={`w-full text-left px-3 py-2 text-xs font-semibold rounded-lg transition-all flex items-center gap-2.5 ${
                  activeTab === 'academic' 
                    ? 'bg-blue-600/80 text-white shadow-md' 
                    : 'text-white/60 hover:text-white hover:bg-white/5'
                }`}
              >
                <Sparkles className="w-4 h-4" />
                Règles Académiques
              </button>
            )}

            {userRole === 'ADMIN' && (
              <button
                onClick={() => setActiveTab('security')}
                className={`w-full text-left px-3 py-2 text-xs font-semibold rounded-lg transition-all flex items-center gap-2.5 ${
                  activeTab === 'security' 
                    ? 'bg-blue-600/80 text-white shadow-md' 
                    : 'text-white/60 hover:text-white hover:bg-white/5'
                }`}
              >
                <Shield className="w-4 h-4" />
                Sécurité & Comptes
              </button>
            )}

            {userRole === 'ADMIN' && (
              <button
                onClick={() => setActiveTab('system')}
                className={`w-full text-left px-3 py-2 text-xs font-semibold rounded-lg transition-all flex items-center gap-2.5 ${
                  activeTab === 'system' 
                    ? 'bg-blue-600/80 text-white shadow-md' 
                    : 'text-white/60 hover:text-white hover:bg-white/5'
                }`}
              >
                <HardDrive className="w-4 h-4" />
                Sauvegardes Système
              </button>
            )}

            <button
              onClick={() => setActiveTab('preferences')}
              className={`w-full text-left px-3 py-2 text-xs font-semibold rounded-lg transition-all flex items-center gap-2.5 ${
                activeTab === 'preferences' 
                  ? 'bg-blue-600/80 text-white shadow-md' 
                  : 'text-white/60 hover:text-white hover:bg-white/5'
              }`}
            >
              <Layout className="w-4 h-4" />
              Préférences Visuelles
            </button>
          </div>
        </div>

        <div className="bg-white/5 p-3 rounded-xl border border-white/5 text-[10px] text-white/50 space-y-1">
          <p>Utilisateur : <span className="font-semibold text-blue-400">{currentUser.username}</span></p>
          <p>Rôle : <span className="font-semibold text-purple-400">{userRole}</span></p>
        </div>
      </div>

      {/* Settings Panel Content */}
      <div className="flex-1 flex flex-col bg-gray-900/40">
        <div className="flex-1 p-6 overflow-y-auto">
          {successMsg && (
            <div className="mb-4 bg-emerald-500/10 border border-emerald-500/20 text-emerald-200 text-xs px-4 py-2.5 rounded-xl flex items-center gap-2 animate-fade-in">
              <Check className="w-4 h-4 shrink-0" />
              {successMsg}
            </div>
          )}

          {/* Academic Tab */}
          {activeTab === 'academic' && (
            <div className="space-y-6">
              <div>
                <h4 className="text-sm font-bold text-white mb-1">Règles académiques par défaut</h4>
                <p className="text-[11px] text-white/50">Configurez les valeurs par défaut qui seront injectées lors de la création d'une nouvelle promotion.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[11px] font-semibold text-white/70">Moyenne de validation de BCC par défaut</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="20"
                    value={defMinSeuil}
                    onChange={(e) => setDefMinSeuil(parseFloat(e.target.value))}
                    className="w-full bg-black/40 border border-white/10 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[11px] font-semibold text-white/70">Note minimale éliminatoire de BCC par défaut</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="20"
                    value={defMinEliminatoire}
                    onChange={(e) => setDefMinEliminatoire(parseFloat(e.target.value))}
                    className="w-full bg-black/40 border border-white/10 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[11px] font-semibold text-white/70">Nombre maximum de BCC sous le seuil autorisé</label>
                  <input
                    type="number"
                    min="0"
                    max="5"
                    value={defMaxBccSousSeuil}
                    onChange={(e) => setDefMaxBccSousSeuil(parseInt(e.target.value))}
                    className="w-full bg-black/40 border border-white/10 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <button
                onClick={handleSaveAcademic}
                disabled={loading}
                className="bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs px-4 py-2 rounded-xl flex items-center gap-2 transition-colors disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                Enregistrer les paramètres académiques
              </button>
            </div>
          )}

          {/* Security Tab */}
          {activeTab === 'security' && (
            <div className="space-y-6">
              <div>
                <h4 className="text-sm font-bold text-white mb-1">Stratégie de sécurité & Contrôle des accès</h4>
                <p className="text-[11px] text-white/50">Ajustez la robustesse du système et la politique de rétention.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[11px] font-semibold text-white/70">Durée d'inactivité avant déconnexion (minutes)</label>
                  <input
                    type="number"
                    min="5"
                    max="120"
                    value={sessionTimeout}
                    onChange={(e) => setSessionTimeout(parseInt(e.target.value))}
                    className="w-full bg-black/40 border border-white/10 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[11px] font-semibold text-white/70">Longueur minimale des mots de passe</label>
                  <input
                    type="number"
                    min="6"
                    max="30"
                    value={passwordMinLength}
                    onChange={(e) => setPasswordMinLength(parseInt(e.target.value))}
                    className="w-full bg-black/40 border border-white/10 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div className="flex items-center gap-3 py-2 col-span-2">
                  <input
                    type="checkbox"
                    id="reqSpecial"
                    checked={requireSpecialChar}
                    onChange={(e) => setRequireSpecialChar(e.target.checked)}
                    className="w-4 h-4 rounded bg-black/40 border border-white/10 text-blue-600 focus:ring-0"
                  />
                  <label htmlFor="reqSpecial" className="text-xs text-white/80 cursor-pointer">
                    Exiger au moins un caractère spécial et un chiffre dans le mot de passe
                  </label>
                </div>
              </div>

              <button
                onClick={handleSaveSecurity}
                disabled={loading}
                className="bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs px-4 py-2 rounded-xl flex items-center gap-2 transition-colors disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                Enregistrer la politique de sécurité
              </button>
            </div>
          )}

          {/* System/Backup Tab */}
          {activeTab === 'system' && (
            <div className="space-y-6">
              <div>
                <h4 className="text-sm font-bold text-white mb-1">Sauvegardes et Maintenance BDD</h4>
                <p className="text-[11px] text-white/50">Générez des points de restauration pour prémunir le système contre les pertes de données.</p>
              </div>

              <div className="p-4 bg-white/5 rounded-xl border border-white/5 space-y-4">
                <div className="flex justify-between items-center">
                  <div>
                    <h5 className="text-xs font-bold text-white">Créer un instantané (Backup SQL)</h5>
                    <p className="text-[10px] text-white/40">Génère un dump SQL complet contenant la structure et les notes actuelles.</p>
                  </div>
                  <button
                    onClick={() => {
                      alert("Génération de l'export SQL en cours de traitement...")
                    }}
                    className="bg-white/10 hover:bg-white/15 text-white text-xs px-3.5 py-2 rounded-xl font-medium border border-white/10 flex items-center gap-2 transition-colors"
                  >
                    <RefreshCw className="w-4 h-4" />
                    Exporter la base de données
                  </button>
                </div>
              </div>

              <div className="p-4 bg-red-500/5 rounded-xl border border-red-500/20 space-y-4">
                <div>
                  <h5 className="text-xs font-bold text-red-400">Zone de Danger</h5>
                  <p className="text-[10px] text-white/40">Actions irréversibles impactant l'ensemble de l'application.</p>
                </div>
                <div className="flex justify-between items-center">
                  <div>
                    <span className="text-[11px] font-semibold text-white/70">Vider tous les brouillons de jury</span>
                  </div>
                  <button
                    onClick={() => {
                      if (confirm("Voulez-vous vraiment vider tous les brouillons de délibérations de jury ?")) {
                        alert("Brouillons vidés.")
                      }
                    }}
                    className="bg-red-600/20 hover:bg-red-600 text-red-200 text-xs px-3.5 py-2 rounded-xl font-medium border border-red-500/20 transition-all"
                  >
                    Réinitialiser les brouillons
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Preferences Tab */}
          {activeTab === 'preferences' && (
            <div className="space-y-6">
              <div>
                <h4 className="text-sm font-bold text-white mb-1">Préférences Personnelles de l'Interface</h4>
                <p className="text-[11px] text-white/50">Ces préférences sont stockées localement dans votre navigateur et s'appliquent à votre session.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[11px] font-semibold text-white/70">Thème Visuel</label>
                  <select
                    value={theme}
                    onChange={(e) => setTheme(e.target.value)}
                    className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-blue-500"
                  >
                    <option value="dark" className="bg-gray-900">Glassmorphism Dark (Recommandé)</option>
                    <option value="classic" className="bg-gray-900">Classic Slate Gray</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[11px] font-semibold text-white/70">Densité d'affichage des tableaux</label>
                  <select
                    value={density}
                    onChange={(e) => setDensity(e.target.value)}
                    className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-blue-500"
                  >
                    <option value="comfortable" className="bg-gray-900">Confortable (Grandes cellules)</option>
                    <option value="compact" className="bg-gray-900">Compact (Dense, pour petits écrans)</option>
                  </select>
                </div>

                <div className="flex items-center gap-3 py-2 col-span-2">
                  <input
                    type="checkbox"
                    id="compactLedgerCheckbox"
                    checked={compactLedger}
                    onChange={(e) => setCompactLedger(e.target.checked)}
                    className="w-4 h-4 rounded bg-black/40 border border-white/10 text-blue-600 focus:ring-0"
                  />
                  <label htmlFor="compactLedgerCheckbox" className="text-xs text-white/80 cursor-pointer">
                    Toujours condenser le Grand Livre en affichage réduit
                  </label>
                </div>

                <div className="flex items-center gap-3 py-2 col-span-2">
                  <input
                    type="checkbox"
                    id="contextualHelpCheckbox"
                    checked={contextualHelp}
                    onChange={(e) => setContextualHelp(e.target.checked)}
                    className="w-4 h-4 rounded bg-black/40 border border-white/10 text-blue-600 focus:ring-0"
                  />
                  <label htmlFor="contextualHelpCheckbox" className="text-xs text-white/80 cursor-pointer">
                    Activer l'aide contextuelle au survol des éléments de l'interface
                  </label>
                </div>
              </div>

              <button
                onClick={handleSavePreferences}
                disabled={loading}
                className="bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs px-4 py-2 rounded-xl flex items-center gap-2 transition-colors disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                Appliquer et Enregistrer
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
