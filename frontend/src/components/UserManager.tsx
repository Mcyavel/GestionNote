import { useState, useEffect } from 'react';
import { Users, Shield, Plus, Trash2, Edit, Save, X, RefreshCw } from 'lucide-react';

export default function UserManager() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [promos, setPromos] = useState<any[]>([]);
  
  // New User Form State
  const [showAdd, setShowAdd] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState('LECTEUR_GLOBAL');
  const [newAnneeIds, setNewAnneeIds] = useState<number[]>([]);

  // Edit State
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editRole, setEditRole] = useState('');
  const [editAnneeIds, setEditAnneeIds] = useState<number[]>([]);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/users.php');
      const data = await res.json();
      if (data.success) {
        setUsers(data.data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const fetchPromos = async () => {
    try {
      const res = await fetch('/api/curriculum.php');
      const data = await res.json();
      if (data.success) {
        setPromos(data.data.filter((a: any) => !a.is_maquette));
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchUsers();
    fetchPromos();
  }, []);

  const handleCreate = async () => {
    try {
      const res = await fetch('/api/users.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create',
          username: newUsername,
          password: newPassword,
          role: newRole,
          annee_ids: newAnneeIds
        })
      });
      const data = await res.json();
      if (data.success) {
        setShowAdd(false);
        setNewUsername('');
        setNewPassword('');
        setNewRole('LECTEUR_GLOBAL');
        setNewAnneeIds([]);
        fetchUsers();
      } else {
        alert(data.error);
      }
    } catch (e) {
      alert("Erreur réseau");
    }
  };

  const handleUpdate = async (id: number) => {
    try {
      const res = await fetch('/api/users.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update',
          id,
          role: editRole,
          annee_ids: editAnneeIds
        })
      });
      const data = await res.json();
      if (data.success) {
        setEditingId(null);
        fetchUsers();
      } else {
        alert(data.error);
      }
    } catch (e) {
      alert("Erreur réseau");
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Voulez-vous vraiment supprimer cet utilisateur ?")) return;
    try {
      const res = await fetch('/api/users.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete', id })
      });
      const data = await res.json();
      if (data.success) {
        fetchUsers();
      } else {
        alert(data.error);
      }
    } catch (e) {
      alert("Erreur réseau");
    }
  };

  const handleResetPassword = async (id: number) => {
    const newPass = prompt("Nouveau mot de passe pour cet utilisateur :");
    if (!newPass) return;
    try {
      const res = await fetch('/api/users.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reset_password', id, password: newPass })
      });
      const data = await res.json();
      if (data.success) {
        alert("Mot de passe réinitialisé. L'utilisateur devra le changer à la connexion.");
        fetchUsers();
      } else {
        alert(data.error);
      }
    } catch (e) {
      alert("Erreur réseau");
    }
  };

  const startEdit = (user: any) => {
    setEditingId(user.id);
    setEditRole(user.role);
    setEditAnneeIds(user.annee_ids || []);
  };

  const togglePromo = (id: number, currentList: number[], setList: (list: number[]) => void) => {
    if (currentList.includes(id)) {
      setList(currentList.filter(x => x !== id));
    } else {
      setList([...currentList, id]);
    }
  };

  return (
    <div className="flex-1 bg-gray-900 overflow-y-auto p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-white flex items-center gap-2">
              <Shield className="w-6 h-6 text-blue-400" />
              Gestion des Utilisateurs
            </h2>
            <p className="text-gray-400 text-sm mt-1">Créez et gérez les droits d'accès (RBAC).</p>
          </div>
          <button
            onClick={() => setShowAdd(!showAdd)}
            className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors"
            data-help="Créer un nouvel utilisateur avec un rôle et des droits spécifiques"
          >
            <Plus className="w-4 h-4" /> Nouvel Utilisateur
          </button>
        </div>

        {showAdd && (
          <div className="bg-gray-800 p-6 rounded-xl border border-gray-700 shadow-lg mb-6">
            <h3 className="text-lg font-semibold text-white mb-4">Ajouter un utilisateur</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <input
                type="text"
                placeholder="Nom d'utilisateur"
                value={newUsername}
                onChange={e => setNewUsername(e.target.value)}
                className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white outline-none focus:border-blue-500"
                data-help="Saisissez l'identifiant de connexion unique de l'utilisateur"
              />
              <input
                type="password"
                placeholder="Mot de passe provisoire"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white outline-none focus:border-blue-500"
                data-help="Saisissez un mot de passe provisoire que l'utilisateur devra modifier lors de sa première connexion"
              />
              <select
                value={newRole}
                onChange={e => {
                  setNewRole(e.target.value);
                  if (!e.target.value.includes('PROMO')) setNewAnneeIds([]);
                }}
                className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white outline-none focus:border-blue-500"
                data-help="Sélectionnez le niveau d'autorisation (rôle) pour cet utilisateur afin de restreindre ses actions"
              >
                <option value="ADMIN">ADMIN</option>
                <option value="SCOLARITE">SCOLARITE</option>
                <option value="ENSEIGNANT_GLOBAL">ENSEIGNANT GLOBAL</option>
                <option value="ENSEIGNANT_PROMO">ENSEIGNANT PROMO</option>
                <option value="LECTEUR_GLOBAL">LECTEUR GLOBAL</option>
                <option value="LECTEUR_PROMO">LECTEUR PROMO</option>
              </select>
              <button
                onClick={handleCreate}
                className="bg-green-600 hover:bg-green-500 text-white rounded-lg flex items-center justify-center gap-2 py-2"
                data-help="Créer le compte utilisateur et l'enregistrer dans le système"
              >
                <Save className="w-4 h-4" /> Créer
              </button>
            </div>
            {newRole.includes('PROMO') && (
              <div className="mt-4 p-4 border border-gray-700 rounded-lg bg-gray-900">
                <p className="text-sm font-medium text-gray-300 mb-3">Sélectionnez les promotions :</p>
                {promos.length === 0 ? (
                  <p className="text-sm text-amber-400 italic">Aucune promotion trouvée. Assurez-vous d'avoir des années configurées qui ne sont pas des maquettes pures.</p>
                ) : (
                  <div className="flex flex-wrap gap-3">
                    {promos.map(p => (
                      <label key={p.id} className="flex items-center gap-2 cursor-pointer bg-gray-800 px-3 py-1.5 rounded border border-gray-700 hover:border-blue-500 transition-colors">
                        <input
                          type="checkbox"
                          checked={newAnneeIds.includes(p.id)}
                          onChange={() => togglePromo(p.id, newAnneeIds, setNewAnneeIds)}
                          className="w-4 h-4 text-blue-600 rounded bg-gray-900 border-gray-700"
                        />
                        <span className="text-sm text-gray-300">{p.nom}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {loading ? (
          <div className="text-center py-10 text-gray-400">Chargement...</div>
        ) : (
          <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden shadow-lg">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-900/50 text-gray-400 text-sm">
                  <th className="p-4 font-medium border-b border-gray-700">Utilisateur</th>
                  <th className="p-4 font-medium border-b border-gray-700">Rôle</th>
                  <th className="p-4 font-medium border-b border-gray-700">Promotions Restreintes</th>
                  <th className="p-4 font-medium border-b border-gray-700">Statut MDP</th>
                  <th className="p-4 font-medium border-b border-gray-700 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700/50">
                {users.map(user => (
                  <tr key={user.id} className="hover:bg-gray-750 transition-colors">
                    <td className="p-4 text-white font-medium flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-400">
                        <Users className="w-4 h-4" />
                      </div>
                      {user.username}
                    </td>
                    <td className="p-4">
                      {editingId === user.id ? (
                        <select
                          value={editRole}
                          onChange={e => {
                            setEditRole(e.target.value);
                            if (!e.target.value.includes('PROMO')) setEditAnneeIds([]);
                          }}
                          className="bg-gray-900 border border-gray-700 rounded p-1 text-white"
                        >
                          <option value="ADMIN">ADMIN</option>
                          <option value="SCOLARITE">SCOLARITE</option>
                          <option value="ENSEIGNANT_GLOBAL">ENSEIGNANT GLOBAL</option>
                          <option value="ENSEIGNANT_PROMO">ENSEIGNANT PROMO</option>
                          <option value="LECTEUR_GLOBAL">LECTEUR GLOBAL</option>
                          <option value="LECTEUR_PROMO">LECTEUR PROMO</option>
                        </select>
                      ) : (
                        <span className={`px-2 py-1 rounded text-xs font-medium bg-gray-700 text-gray-300`}>
                          {user.role}
                        </span>
                      )}
                    </td>
                    <td className="p-4 text-gray-300">
                      {editingId === user.id ? (
                        editRole.includes('PROMO') ? (
                          <div className="flex flex-col gap-1">
                            {promos.map(p => (
                              <label key={p.id} className="flex items-center gap-2 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={editAnneeIds.includes(p.id)}
                                  onChange={() => togglePromo(p.id, editAnneeIds, setEditAnneeIds)}
                                  className="w-3.5 h-3.5 text-blue-600 rounded bg-gray-900 border-gray-700"
                                />
                                <span className="text-xs text-gray-300">{p.nom}</span>
                              </label>
                            ))}
                          </div>
                        ) : (
                          <span className="text-gray-500 italic text-xs">Non applicable</span>
                        )
                      ) : (
                        user.annee_nom ? (
                          <div className="flex flex-col gap-1">
                            {user.annee_nom.split(', ').map((n: string, i: number) => (
                              <span key={i} className="text-xs bg-gray-700 px-2 py-0.5 rounded w-fit">{n}</span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-gray-500 italic text-xs">Globale</span>
                        )
                      )}
                    </td>
                    <td className="p-4">
                      {user.must_change_password ? (
                        <span className="text-amber-400 text-xs bg-amber-400/10 px-2 py-1 rounded">À changer</span>
                      ) : (
                        <span className="text-green-400 text-xs bg-green-400/10 px-2 py-1 rounded">OK</span>
                      )}
                    </td>
                    <td className="p-4 flex gap-2 justify-end">
                      {editingId === user.id ? (
                        <>
                          <button onClick={() => handleUpdate(user.id)} className="p-1.5 bg-green-500/20 text-green-400 hover:bg-green-500/30 rounded" title="Enregistrer" data-help="Enregistrer les modifications de rôle et de restrictions">
                            <Save className="w-4 h-4" />
                          </button>
                          <button onClick={() => setEditingId(null)} className="p-1.5 bg-gray-500/20 text-gray-400 hover:bg-gray-500/30 rounded" title="Annuler">
                            <X className="w-4 h-4" />
                          </button>
                        </>
                      ) : (
                        <>
                          <button onClick={() => startEdit(user)} className="p-1.5 bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 rounded" title="Modifier rôles" data-help="Modifier le rôle ou les restrictions de promotions pour cet utilisateur">
                            <Edit className="w-4 h-4" />
                          </button>
                          <button onClick={() => handleResetPassword(user.id)} className="p-1.5 bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 rounded" title="Réinitialiser MDP" data-help="Générer un nouveau mot de passe provisoire pour cet utilisateur">
                            <RefreshCw className="w-4 h-4" />
                          </button>
                          <button onClick={() => handleDelete(user.id)} className="p-1.5 bg-red-500/20 text-red-400 hover:bg-red-500/30 rounded" title="Supprimer" data-help="Supprimer définitivement ce compte utilisateur">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
                {users.length === 0 && (
                  <tr><td colSpan={5} className="p-8 text-center text-gray-500">Aucun utilisateur trouvé</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
