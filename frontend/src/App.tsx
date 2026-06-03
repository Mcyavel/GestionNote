import { useState } from 'react'
import { GraduationCap, LayoutDashboard, Users, FileSpreadsheet, BarChart3, Settings } from 'lucide-react'

function App() {
  const [activeTab, setActiveTab] = useState('dashboard')

  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'curriculum', label: 'Maquettes', icon: GraduationCap },
    { id: 'students', label: 'Étudiants', icon: Users },
    { id: 'grades', label: 'Notes', icon: FileSpreadsheet },
    { id: 'stats', label: 'Statistiques', icon: BarChart3 },
    { id: 'settings', label: 'Configuration', icon: Settings },
  ]

  return (
    <div className="flex h-screen bg-slate-50 text-slate-900 w-full">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-slate-200 flex flex-col">
        <div className="p-6 flex items-center gap-3 border-b border-slate-100">
          <GraduationCap className="text-blue-600 h-8 w-8" />
          <h1 className="text-xl font-bold tracking-tight text-slate-800">Miage Note</h1>
        </div>
        
        <nav className="flex-1 p-4 space-y-1">
          {menuItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                activeTab === item.id
                  ? 'bg-blue-50 text-blue-700 shadow-sm'
                  : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
              }`}
            >
              <item.icon className={`h-5 w-5 ${activeTab === item.id ? 'text-blue-600' : 'text-slate-400'}`} />
              {item.label}
            </button>
          ))}
        </nav>

        <div className="p-4 border-t border-slate-100">
          <div className="bg-slate-900 rounded-2xl p-4 text-white">
            <p className="text-xs text-slate-400 mb-1">Session</p>
            <p className="text-sm font-medium">Administrateur</p>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto p-8">
        <header className="mb-8 flex justify-between items-center">
          <div>
            <h2 className="text-3xl font-bold text-slate-900">
              {menuItems.find(i => i.id === activeTab)?.label}
            </h2>
            <p className="text-slate-500 mt-1">
              Bienvenue dans votre espace de gestion des notes.
            </p>
          </div>
          <div className="flex gap-3">
            <button className="bg-white border border-slate-200 px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors">
              Aide
            </button>
            <button className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors shadow-sm">
              Nouvelle Note
            </button>
          </div>
        </header>

        {/* Content Placeholder */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
            <h3 className="text-lg font-semibold mb-4 text-slate-800">Status de l'API</h3>
            <div className="flex items-center gap-2 text-green-600 bg-green-50 px-3 py-1 rounded-full w-fit text-xs font-bold uppercase tracking-wider">
              <span className="h-2 w-2 bg-green-500 rounded-full animate-pulse"></span>
              En ligne
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}

export default App
