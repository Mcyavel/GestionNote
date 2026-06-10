import { useState, useEffect } from 'react'
import { GraduationCap, LayoutDashboard, Users, FileSpreadsheet, BarChart3, Settings, BookOpen, Scale, GitCompare, LogOut, Shield, HelpCircle } from 'lucide-react'
import CurriculumManager from './components/CurriculumManager'
import StudentManager from './components/StudentManager'
import GradeEntry from './components/GradeEntry'
import StatsDashboard from './components/StatsDashboard'
import GradeLedger from './components/GradeLedger'
import JuryManager from './components/JuryManager'
import ExcelComparator from './components/ExcelComparator'
import Window from './components/Window'
import Login from './components/Login'
import ChangePassword from './components/ChangePassword'
import UserManager from './components/UserManager'
import Documentation from './components/Documentation'
import SettingsManager from './components/SettingsManager'



type WindowType = 'curriculum' | 'students' | 'grades' | 'stats' | 'settings' | 'ledger' | 'jury' | 'comparator' | 'users' | 'documentation'

interface WindowState {
  id: WindowType;
  isOpen: boolean;
  isMinimized: boolean;
  zIndex: number;
}

function App() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const [windows, setWindows] = useState<Record<WindowType, WindowState>>({
    curriculum: { id: 'curriculum', isOpen: false, isMinimized: false, zIndex: 10 },
    students: { id: 'students', isOpen: false, isMinimized: false, zIndex: 10 },
    grades: { id: 'grades', isOpen: false, isMinimized: false, zIndex: 10 },
    ledger: { id: 'ledger', isOpen: false, isMinimized: false, zIndex: 10 },
    jury: { id: 'jury', isOpen: false, isMinimized: false, zIndex: 10 },
    stats: { id: 'stats', isOpen: false, isMinimized: false, zIndex: 10 },
    comparator: { id: 'comparator', isOpen: false, isMinimized: false, zIndex: 10 },
    settings: { id: 'settings', isOpen: false, isMinimized: false, zIndex: 10 },
    users: { id: 'users', isOpen: false, isMinimized: false, zIndex: 10 },
    documentation: { id: 'documentation', isOpen: false, isMinimized: false, zIndex: 10 },
  })
  
  const [maxZIndex, setMaxZIndex] = useState(10)

  useEffect(() => {
    fetch('/api/auth.php?action=me')
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          localStorage.setItem('csrf_token', data.csrf_token);
          setUser(data.user);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  const handleLogout = async () => {
    await fetch('/api/auth.php?action=logout', { method: 'POST' });
    setUser(null);
    localStorage.removeItem('csrf_token');
  };

  if (loading) return <div className="h-screen bg-gray-900 flex items-center justify-center text-white">Chargement...</div>;

  if (!user) {
    return <Login onLoginSuccess={(userData, token) => {
      localStorage.setItem('csrf_token', token);
      setUser(userData);
    }} />;
  }

  if (user.must_change_password) {
    return <ChangePassword onSuccess={() => setUser({...user, must_change_password: false})} csrfToken={localStorage.getItem('csrf_token') || ''} />;
  }

  const allMenuItems = [
    { id: 'curriculum' as WindowType, label: 'Maquettes', icon: GraduationCap, roles: ['ADMIN', 'SCOLARITE'] },
    { id: 'students' as WindowType, label: 'Étudiants', icon: Users, roles: ['ADMIN', 'SCOLARITE'] },
    { id: 'grades' as WindowType, label: 'Saisie Notes', icon: FileSpreadsheet, roles: ['ADMIN', 'ENSEIGNANT_GLOBAL', 'ENSEIGNANT_PROMO'] },
    { id: 'jury' as WindowType, label: 'Délibération Jury', icon: Scale, roles: ['ADMIN'] },
    { id: 'ledger' as WindowType, label: 'Grand Livre', icon: BookOpen, roles: ['ADMIN', 'SCOLARITE', 'LECTEUR_GLOBAL', 'LECTEUR_PROMO', 'ENSEIGNANT_GLOBAL', 'ENSEIGNANT_PROMO'] },
    { id: 'comparator' as WindowType, label: 'Comparateur Apogée', icon: GitCompare, roles: ['ADMIN', 'SCOLARITE'] },
    { id: 'stats' as WindowType, label: 'Statistiques', icon: BarChart3, roles: ['ADMIN', 'SCOLARITE', 'LECTEUR_GLOBAL', 'LECTEUR_PROMO', 'ENSEIGNANT_GLOBAL', 'ENSEIGNANT_PROMO'] },
    { id: 'users' as WindowType, label: 'Utilisateurs', icon: Shield, roles: ['ADMIN'] },
    { id: 'documentation' as WindowType, label: 'Aide & Règles', icon: HelpCircle, roles: ['ADMIN', 'SCOLARITE', 'LECTEUR_GLOBAL', 'LECTEUR_PROMO', 'ENSEIGNANT_GLOBAL', 'ENSEIGNANT_PROMO'] },
    { id: 'settings' as WindowType, label: 'Configuration', icon: Settings, roles: ['ADMIN', 'SCOLARITE', 'LECTEUR_GLOBAL', 'LECTEUR_PROMO', 'ENSEIGNANT_GLOBAL', 'ENSEIGNANT_PROMO'] },
  ];

  const menuItems = allMenuItems.filter(item => item.roles.includes(user.role));

  const openWindow = (id: WindowType) => {
    const nextZ = maxZIndex + 1
    setMaxZIndex(nextZ)
    setWindows(prev => ({
      ...prev,
      [id]: { ...prev[id], isOpen: true, isMinimized: false, zIndex: nextZ }
    }))
  }

  const closeWindow = (id: WindowType) => {
    setWindows(prev => ({
      ...prev,
      [id]: { ...prev[id], isOpen: false }
    }))
  }

  const minimizeWindow = (id: WindowType) => {
    setWindows(prev => ({
      ...prev,
      [id]: { ...prev[id], isMinimized: true }
    }))
  }

  const focusWindow = (id: WindowType) => {
    const nextZ = maxZIndex + 1
    setMaxZIndex(nextZ)
    setWindows(prev => ({
      ...prev,
      [id]: { ...prev[id], isMinimized: false, zIndex: nextZ }
    }))
  }

  const toggleWindow = (id: WindowType) => {
    if (windows[id].isOpen && !windows[id].isMinimized) {
        minimizeWindow(id)
    } else {
        openWindow(id)
    }
  }

  const renderWindow = (id: WindowType) => {
    const state = windows[id]
    if (!state.isOpen || state.isMinimized) return null

    const item = menuItems.find(m => m.id === id) || { label: 'Fenêtre', icon: LayoutDashboard }
    
    let content = null
    switch (id) {
      case 'curriculum': content = <CurriculumManager />; break;
      case 'students': content = <StudentManager />; break;
      case 'grades': content = <GradeEntry />; break;
      case 'ledger': content = <GradeLedger />; break;
      case 'jury': content = <JuryManager />; break;
      case 'comparator': content = <ExcelComparator />; break;
      case 'stats': content = <StatsDashboard />; break;
      case 'users': content = <UserManager />; break;
      case 'documentation': content = <Documentation />; break;
      case 'settings': content = <SettingsManager currentUser={user} />; break;
      default: content = <div className="p-4">Paramètres en cours de développement...</div>
    }

    return (
      <Window 
        key={id}
        title={item.label}
        icon={item.icon as any}
        onClose={() => closeWindow(id)}
        onMinimize={() => minimizeWindow(id)}
        onFocus={() => focusWindow(id)}
        active={state.zIndex === maxZIndex}
        initialX={50 + menuItems.findIndex(m => m.id === id) * 30}
        initialY={50 + menuItems.findIndex(m => m.id === id) * 30}
      >
        <div 
          className={(id === 'ledger' || id === 'jury' || id === 'comparator' || id === 'documentation') ? "w-[1200px] h-[700px] max-w-[90vw] max-h-[80vh]" : "w-[900px] h-[600px] max-w-[90vw] max-h-[80vh]"}
          style={{ width: '100%', height: '100%' }}
        >
            {content}
        </div>
      </Window>
    )
  }

  return (
    <div className="relative h-screen w-screen desktop-bg overflow-hidden font-sans">
      <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1614850523296-d8c1af93d400?q=80&w=2070&auto=format&fit=crop')] bg-cover opacity-40 mix-blend-overlay"></div>
      
      <div className="relative z-10 h-full w-full p-8 flex flex-col">
        <header className="flex justify-between items-center mb-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-500/20">
              <GraduationCap className="text-white w-7 h-7" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white tracking-tight">Miage Note</h1>
              <p className="text-white/50 text-xs font-medium uppercase tracking-widest">Espace Académique</p>
            </div>
          </div>
          <div className="glass-panel px-6 py-3 rounded-2xl flex items-center gap-6 text-white/80">
            <div className="text-center border-r border-white/10 pr-6">
              <p className="text-[10px] uppercase text-white/40 mb-1">Utilisateur</p>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-blue-400">{user.username}</span>
                <span className="text-xs bg-white/10 px-1.5 py-0.5 rounded">{user.role}</span>
              </div>
            </div>
            <button onClick={handleLogout} className="flex flex-col items-center hover:text-red-400 transition-colors">
              <LogOut className="w-5 h-5 mb-1" />
              <span className="text-[10px] uppercase">Quitter</span>
            </button>
          </div>
        </header>

        <div className="flex flex-col flex-wrap gap-y-2 gap-x-4 mt-2 max-h-[calc(100vh-260px)] w-fit content-start">
          {menuItems.map((item) => (
            <button
              key={item.id}
              onClick={() => openWindow(item.id)}
              className="group flex flex-col items-center gap-1.5 w-24 p-2.5 rounded-2xl transition-all hover:bg-white/10"
            >
              <div className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-transform group-hover:scale-110 shadow-lg ${
                windows[item.id].isOpen ? 'bg-blue-500/80 text-white' : 'glass-panel text-white/70'
              }`}>
                <item.icon className="w-7 h-7" />
              </div>
              <span className="text-[11px] font-medium text-white/80 text-center shadow-sm leading-tight">{item.label}</span>
            </button>
          ))}
        </div>

        {menuItems.map(item => renderWindow(item.id))}

        <div className="mt-auto mx-auto mb-4">
          <div className="glass-panel p-2 rounded-3xl flex items-center gap-2 shadow-2xl border border-white/20">
            <div className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center hover:bg-white/20 transition-colors cursor-pointer">
               <LayoutDashboard className="text-white w-5 h-5" />
            </div>
            <div className="w-[1px] h-6 bg-white/10 mx-1"></div>
            {menuItems.map(item => (
              <button
                key={item.id}
                onClick={() => toggleWindow(item.id)}
                className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all relative ${
                  windows[item.id].isOpen 
                  ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/40 translate-y-[-4px]' 
                  : 'hover:bg-white/10 text-white/50 hover:text-white'
                }`}
              >
                <item.icon className="w-5 h-5" />
                {windows[item.id].isOpen && windows[item.id].isMinimized && (
                    <span className="absolute bottom-1 w-1 h-1 bg-white rounded-full"></span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export default App
