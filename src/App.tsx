import React, { useState, useEffect } from 'react';
import { 
  Monitor, 
  Activity, 
  Image as ImageIcon, 
  Settings, 
  Trash2, 
  Terminal, 
  ShieldCheck,
  RefreshCw,
  Clock,
  ExternalLink,
  Info,
  Ban,
  Plus
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface ActivityLog {
  id: number;
  timestamp: string;
  window_title: string;
  app_name: string;
}

interface Screenshot {
  id: number;
  timestamp: string;
  image_data: string;
}

interface BlockedItem {
  id: number;
  keyword: string;
}

export default function App() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'screenshots' | 'setup' | 'settings' | 'blocklist'>('dashboard');
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [screenshots, setScreenshots] = useState<Screenshot[]>([]);
  const [blocklist, setBlocklist] = useState<BlockedItem[]>([]);
  const [newKeyword, setNewKeyword] = useState('');
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(new Date());

  const fetchLogs = async () => {
    try {
      const res = await fetch('/api/activity');
      const data = await res.json();
      setLogs(data);
    } catch (err) {
      console.error('Failed to fetch logs', err);
    }
  };

  const fetchScreenshots = async () => {
    try {
      const res = await fetch('/api/screenshots');
      const data = await res.json();
      setScreenshots(data);
    } catch (err) {
      console.error('Failed to fetch screenshots', err);
    }
  };

  const fetchBlocklist = async () => {
    try {
      const res = await fetch('/api/blocklist');
      const data = await res.json();
      setBlocklist(data);
    } catch (err) {
      console.error('Failed to fetch blocklist', err);
    }
  };

  const refreshAll = async () => {
    setLoading(true);
    await Promise.all([fetchLogs(), fetchScreenshots(), fetchBlocklist()]);
    setLastRefresh(new Date());
    setLoading(false);
  };

  useEffect(() => {
    refreshAll();
    const interval = setInterval(refreshAll, 10000); // Auto-refresh every 10s
    return () => clearInterval(interval);
  }, []);

  const clearData = async () => {
    if (confirm('Êtes-vous sûr de vouloir effacer toutes les données ?')) {
      await fetch('/api/clear', { method: 'DELETE' });
      refreshAll();
    }
  };

  const addBlock = async () => {
    if (!newKeyword.trim()) return;
    await fetch('/api/blocklist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keyword: newKeyword.trim() })
    });
    setNewKeyword('');
    fetchBlocklist();
  };

  const removeBlock = async (id: number) => {
    await fetch(`/api/blocklist/${id}`, { method: 'DELETE' });
    fetchBlocklist();
  };

  const agentScript = `
import subprocess
import time
import requests
import base64
import os

# CONFIGURATION
APP_URL = "${window.location.origin.replace(/\/$/, '')}"
REPORT_ENDPOINT = f"{APP_URL}/api/report"
BLOCKLIST_ENDPOINT = f"{APP_URL}/api/blocklist"
INTERVAL = 30 # secondes entre chaque capture
BLOCK_CHECK_INTERVAL = 2 # secondes entre chaque vérification de blocage

def get_active_window_info():
    try:
        # Nécessite xdotool: sudo apt install xdotool
        window_id = subprocess.check_output(["xdotool", "getactivewindow"]).decode().strip()
        window_title = subprocess.check_output(["xdotool", "getwindowname", window_id]).decode().strip()
        return window_id, window_title
    except:
        return None, "Unknown"

def capture_screenshot():
    try:
        # Nécessite gnome-screenshot
        filename = "/tmp/monitor_ss.png"
        subprocess.run(["gnome-screenshot", "-f", filename])
        with open(filename, "rb") as image_file:
            encoded_string = base64.b64encode(image_file.read()).decode('utf-8')
        os.remove(filename)
        return encoded_string
    except:
        return None

def report_loop():
    while True:
        try:
            _, title = get_active_window_info()
            screenshot = capture_screenshot()
            
            payload = {
                "window_title": title,
                "app_name": "Ubuntu Desktop",
                "screenshot": screenshot
            }
            
            requests.post(REPORT_ENDPOINT, json=payload)
        except Exception as e:
            print(f"Report Error: {e}")
            
        time.sleep(INTERVAL)

def block_loop():
    blocklist = []
    last_fetch = 0
    
    while True:
        try:
            # Fetch blocklist every 60 seconds
            if time.time() - last_fetch > 60:
                res = requests.get(BLOCKLIST_ENDPOINT)
                if res.status_code == 200:
                    try:
                        blocklist = [item['keyword'].lower() for item in res.json()]
                        last_fetch = time.time()
                    except ValueError:
                        print(f"Erreur: Le serveur n'a pas renvoyé de JSON valide à {BLOCKLIST_ENDPOINT}")
                else:
                    print(f"Erreur Serveur: Status {res.status_code} sur {BLOCKLIST_ENDPOINT}")
            
            window_id, title = get_active_window_info()
            if not window_id:
                time.sleep(BLOCK_CHECK_INTERVAL)
                continue
                
            title_lower = title.lower()
            
            for keyword in blocklist:
                if keyword in title_lower:
                    print(f"BLOCKED: {title} (matched '{keyword}')")
                    # Show warning message
                    message = "Tu n'as pas le droit de regarder ce type de vidéo."
                    subprocess.Popen(["zenity", "--warning", "--text", message, "--title", "Ubuntu Guardian", "--timeout", "10"])
                    # Close the window
                    subprocess.run(["xdotool", "windowclose", window_id])
                    break
        except Exception as e:
            print(f"Block Error: {e}")
            
        time.sleep(BLOCK_CHECK_INTERVAL)

if __name__ == "__main__":
    import threading
    print("Ubuntu Guardian Agent démarré...")
    
    # Run loops in separate threads
    threading.Thread(target=report_loop, daemon=True).start()
    block_loop()
  `.trim();

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-zinc-300 font-sans selection:bg-emerald-500/30">
      {/* Sidebar */}
      <nav className="fixed left-0 top-0 h-full w-64 bg-[#111111] border-r border-white/5 flex flex-col p-6 z-50">
        <div className="flex items-center gap-3 mb-10 px-2">
          <div className="w-10 h-10 bg-emerald-500/10 rounded-xl flex items-center justify-center border border-emerald-500/20">
            <ShieldCheck className="w-6 h-6 text-emerald-500" />
          </div>
          <div>
            <h1 className="font-bold text-white tracking-tight">Guardian</h1>
            <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-semibold">Ubuntu Monitor</p>
          </div>
        </div>

        <div className="space-y-1">
          <NavItem 
            active={activeTab === 'dashboard'} 
            onClick={() => setActiveTab('dashboard')} 
            icon={<Activity className="w-4 h-4" />} 
            label="Activité" 
          />
          <NavItem 
            active={activeTab === 'screenshots'} 
            onClick={() => setActiveTab('screenshots')} 
            icon={<ImageIcon className="w-4 h-4" />} 
            label="Captures" 
          />
          <NavItem 
            active={activeTab === 'blocklist'} 
            onClick={() => setActiveTab('blocklist')} 
            icon={<Ban className="w-4 h-4" />} 
            label="Blocage" 
          />
          <NavItem 
            active={activeTab === 'setup'} 
            onClick={() => setActiveTab('setup')} 
            icon={<Terminal className="w-4 h-4" />} 
            label="Installation" 
          />
          <NavItem 
            active={activeTab === 'settings'} 
            onClick={() => setActiveTab('settings')} 
            icon={<Settings className="w-4 h-4" />} 
            label="Paramètres" 
          />
        </div>

        <div className="mt-auto pt-6 border-t border-white/5">
          <div className="flex items-center gap-2 text-[11px] text-zinc-500 mb-4">
            <Clock className="w-3 h-3" />
            <span>Mis à jour: {lastRefresh.toLocaleTimeString()}</span>
          </div>
          <button 
            onClick={refreshAll}
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 py-2.5 bg-white/5 hover:bg-white/10 rounded-lg text-xs font-medium transition-all disabled:opacity-50"
          >
            <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
            Rafraîchir
          </button>
        </div>
      </nav>

      {/* Main Content */}
      <main className="pl-64 min-h-screen">
        <header className="h-20 border-b border-white/5 flex items-center justify-between px-10 sticky top-0 bg-[#0a0a0a]/80 backdrop-blur-xl z-40">
          <h2 className="text-xl font-medium text-white capitalize">{activeTab}</h2>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-full">
              <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
              <span className="text-[10px] font-bold text-emerald-500 uppercase tracking-wider">Connecté</span>
            </div>
          </div>
        </header>

        <div className="p-10 max-w-7xl mx-auto">
          <AnimatePresence mode="wait">
            {activeTab === 'dashboard' && (
              <motion.div 
                key="dashboard"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-8"
              >
                <div className="grid grid-cols-3 gap-6">
                  <StatCard 
                    label="Total Logs" 
                    value={logs.length} 
                    icon={<Activity className="text-emerald-500" />} 
                  />
                  <StatCard 
                    label="Captures" 
                    value={screenshots.length} 
                    icon={<ImageIcon className="text-blue-500" />} 
                  />
                  <StatCard 
                    label="Dernière Activité" 
                    value={logs[0] ? new Date(logs[0].timestamp).toLocaleTimeString() : 'N/A'} 
                    icon={<Clock className="text-amber-500" />} 
                  />
                </div>

                <div className="bg-[#111111] border border-white/5 rounded-2xl overflow-hidden">
                  <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between">
                    <h3 className="font-semibold text-white flex items-center gap-2">
                      <Activity className="w-4 h-4 text-emerald-500" />
                      Journal d'activité récent
                    </h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="text-[11px] uppercase tracking-widest text-zinc-500 font-bold border-b border-white/5">
                          <th className="px-6 py-4">Heure</th>
                          <th className="px-6 py-4">Fenêtre Active</th>
                          <th className="px-6 py-4">Application</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {logs.length === 0 ? (
                          <tr>
                            <td colSpan={3} className="px-6 py-12 text-center text-zinc-500 italic">
                              Aucune activité enregistrée. Installez l'agent sur le poste Ubuntu.
                            </td>
                          </tr>
                        ) : (
                          logs.map((log) => (
                            <tr key={log.id} className="hover:bg-white/[0.02] transition-colors group">
                              <td className="px-6 py-4 text-xs font-mono text-zinc-500">
                                {new Date(log.timestamp).toLocaleTimeString()}
                              </td>
                              <td className="px-6 py-4 text-sm text-white font-medium">
                                {log.window_title}
                              </td>
                              <td className="px-6 py-4">
                                <span className="px-2 py-1 bg-white/5 rounded text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                                  {log.app_name}
                                </span>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === 'screenshots' && (
              <motion.div 
                key="screenshots"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="grid grid-cols-2 lg:grid-cols-3 gap-6"
              >
                {screenshots.length === 0 ? (
                  <div className="col-span-full py-20 text-center bg-[#111111] rounded-2xl border border-white/5">
                    <ImageIcon className="w-12 h-12 text-zinc-700 mx-auto mb-4" />
                    <p className="text-zinc-500">Aucune capture d'écran disponible.</p>
                  </div>
                ) : (
                  screenshots.map((ss) => (
                    <div key={ss.id} className="group bg-[#111111] border border-white/5 rounded-2xl overflow-hidden hover:border-emerald-500/30 transition-all">
                      <div className="aspect-video relative overflow-hidden bg-black">
                        <img 
                          src={`data:image/png;base64,${ss.image_data}`} 
                          alt="Screenshot" 
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                          referrerPolicy="no-referrer"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-4">
                           <button className="w-full py-2 bg-white/10 backdrop-blur-md rounded-lg text-xs font-bold text-white flex items-center justify-center gap-2">
                             <ExternalLink className="w-3 h-3" />
                             Voir en grand
                           </button>
                        </div>
                      </div>
                      <div className="p-4 flex items-center justify-between">
                        <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">
                          {new Date(ss.timestamp).toLocaleString()}
                        </span>
                        <ImageIcon className="w-3 h-3 text-zinc-600" />
                      </div>
                    </div>
                  ))
                )}
              </motion.div>
            )}

            {activeTab === 'blocklist' && (
              <motion.div 
                key="blocklist"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="max-w-2xl space-y-8"
              >
                <div className="bg-amber-500/5 border border-amber-500/20 p-6 rounded-2xl flex gap-4">
                  <div className="w-10 h-10 bg-amber-500/10 rounded-full flex items-center justify-center shrink-0">
                    <Info className="w-5 h-5 text-amber-500" />
                  </div>
                  <div>
                    <h4 className="text-white font-semibold mb-1">Comment bloquer YouTube ?</h4>
                    <p className="text-sm text-zinc-400 leading-relaxed">
                      Ajoutez des mots-clés (titres de vidéos, noms de chaînes). 
                      Si le titre de la fenêtre du navigateur contient l'un de ces mots, la fenêtre sera immédiatement fermée.
                      Exemple : <code className="text-amber-500">MrBeast</code> ou <code className="text-amber-500">Fortnite</code>.
                    </p>
                  </div>
                </div>

                <div className="bg-[#111111] border border-white/5 rounded-2xl p-6 space-y-6">
                  <div className="flex gap-3">
                    <input 
                      type="text" 
                      value={newKeyword}
                      onChange={(e) => setNewKeyword(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && addBlock()}
                      placeholder="Mot-clé à bloquer (ex: Nom de la vidéo)"
                      className="flex-1 bg-black border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-emerald-500 transition-all"
                    />
                    <button 
                      onClick={addBlock}
                      className="px-6 py-3 bg-emerald-500 hover:bg-emerald-600 text-black font-bold rounded-xl flex items-center gap-2 transition-all"
                    >
                      <Plus className="w-4 h-4" />
                      Ajouter
                    </button>
                  </div>

                  <div className="space-y-2">
                    <h4 className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest px-2">Mots-clés bloqués</h4>
                    {blocklist.length === 0 ? (
                      <p className="text-center py-10 text-zinc-600 italic text-sm">Aucun blocage actif.</p>
                    ) : (
                      <div className="grid gap-2">
                        {blocklist.map((item) => (
                          <div key={item.id} className="flex items-center justify-between p-4 bg-white/5 rounded-xl border border-white/5 group hover:border-white/10 transition-all">
                            <div className="flex items-center gap-3">
                              <Ban className="w-4 h-4 text-red-500" />
                              <span className="text-sm text-white font-medium">{item.keyword}</span>
                            </div>
                            <button 
                              onClick={() => removeBlock(item.id)}
                              className="p-2 text-zinc-500 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === 'setup' && (
              <motion.div 
                key="setup"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-8"
              >
                <div className="bg-emerald-500/5 border border-emerald-500/20 p-6 rounded-2xl flex gap-4">
                  <div className="w-10 h-10 bg-emerald-500/10 rounded-full flex items-center justify-center shrink-0">
                    <Info className="w-5 h-5 text-emerald-500" />
                  </div>
                  <div>
                    <h4 className="text-white font-semibold mb-1">Comment ça marche ?</h4>
                    <p className="text-sm text-zinc-400 leading-relaxed">
                      Pour surveiller le poste Ubuntu, vous devez y exécuter un petit script Python ("l'agent"). 
                      Ce script capturera périodiquement le titre de la fenêtre active et une capture d'écran, 
                      puis les enverra à ce tableau de bord.
                    </p>
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="text-lg font-medium text-white flex items-center gap-2">
                    <Terminal className="w-5 h-5 text-emerald-500" />
                    Instructions d'installation
                  </h3>
                  <ol className="space-y-6">
                    <li className="flex gap-4">
                      <div className="w-6 h-6 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-[10px] font-bold shrink-0 mt-1">1</div>
                      <div className="space-y-2">
                        <p className="text-sm text-white font-medium">Installez les dépendances sur le poste Ubuntu :</p>
                        <code className="block p-3 bg-black rounded-lg border border-white/5 text-xs font-mono text-emerald-400">
                          sudo apt update && sudo apt install xdotool gnome-screenshot zenity python3-requests
                        </code>
                      </div>
                    </li>
                    <li className="flex gap-4">
                      <div className="w-6 h-6 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-[10px] font-bold shrink-0 mt-1">2</div>
                      <div className="space-y-2 w-full">
                        <p className="text-sm text-white font-medium">Créez un fichier <code className="text-emerald-400">guardian.py</code> et collez ce code :</p>
                        <div className="relative group">
                          <pre className="p-4 bg-black rounded-xl border border-white/5 text-[11px] font-mono text-zinc-400 overflow-x-auto max-h-[400px]">
                            {agentScript}
                          </pre>
                          <button 
                            onClick={() => navigator.clipboard.writeText(agentScript)}
                            className="absolute top-4 right-4 p-2 bg-white/5 hover:bg-white/10 rounded-lg border border-white/10 transition-all opacity-0 group-hover:opacity-100"
                          >
                            <span className="text-[10px] font-bold uppercase px-1">Copier</span>
                          </button>
                        </div>
                      </div>
                    </li>
                    <li className="flex gap-4">
                      <div className="w-6 h-6 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-[10px] font-bold shrink-0 mt-1">3</div>
                      <div className="space-y-2">
                        <p className="text-sm text-white font-medium">Lancez l'agent :</p>
                        <code className="block p-3 bg-black rounded-lg border border-white/5 text-xs font-mono text-emerald-400">
                          python3 guardian.py
                        </code>
                      </div>
                    </li>
                  </ol>

                  <div className="mt-10 pt-10 border-t border-white/5 space-y-4">
                    <h3 className="text-lg font-medium text-white flex items-center gap-2">
                      <Monitor className="w-5 h-5 text-blue-500" />
                      Astuce : Déploiement sans clé USB (Git)
                    </h3>
                    <p className="text-sm text-zinc-400 leading-relaxed">
                      Pour récupérer le code sans clé USB, utilisez la fonction <strong>"Export to GitHub"</strong> dans les paramètres de cette application (icône ⚙️), puis clonez votre propre dépôt :
                    </p>
                    <div className="bg-black rounded-xl border border-white/5 p-4 space-y-3">
                      <p className="text-xs text-zinc-500 font-mono"># 1. Exportez d'abord vers votre GitHub via les paramètres ⚙️</p>
                      <p className="text-xs text-zinc-500 font-mono"># 2. Sur le poste Ubuntu, clonez VOTRE dépôt :</p>
                      <code className="block text-xs text-emerald-400">
                        git clone https://github.com/VOTRE_PSEUDO/VOTRE_NOM_DE_REPO.git
                      </code>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === 'settings' && (
              <motion.div 
                key="settings"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="max-w-2xl space-y-8"
              >
                <div className="p-8 bg-[#111111] border border-white/5 rounded-2xl space-y-6">
                  <div>
                    <h3 className="text-lg font-medium text-white mb-2">Gestion des données</h3>
                    <p className="text-sm text-zinc-500">
                      Toutes les données sont stockées localement dans une base de données SQLite. 
                      Vous pouvez les effacer à tout moment.
                    </p>
                  </div>
                  
                  <div className="pt-6 border-t border-white/5">
                    <button 
                      onClick={clearData}
                      className="flex items-center gap-2 px-6 py-3 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 rounded-xl text-red-500 text-sm font-semibold transition-all"
                    >
                      <Trash2 className="w-4 h-4" />
                      Effacer tout l'historique
                    </button>
                  </div>
                </div>

                <div className="p-8 bg-white/5 border border-white/10 rounded-2xl">
                  <h3 className="text-white font-medium mb-4">Informations Système</h3>
                  <div className="space-y-3 text-sm">
                    <div className="flex justify-between py-2 border-b border-white/5">
                      <span className="text-zinc-500">Version</span>
                      <span className="text-white">v1.0.0</span>
                    </div>
                    <div className="flex justify-between py-2 border-b border-white/5">
                      <span className="text-zinc-500">Base de données</span>
                      <span className="text-white">SQLite 3</span>
                    </div>
                    <div className="flex justify-between py-2">
                      <span className="text-zinc-500">Statut Serveur</span>
                      <span className="text-emerald-500 font-bold uppercase text-[10px] tracking-widest">Opérationnel</span>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}

function NavItem({ active, onClick, icon, label }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string }) {
  return (
    <button 
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
        active 
          ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' 
          : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/5'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function StatCard({ label, value, icon }: { label: string, value: string | number, icon: React.ReactNode }) {
  return (
    <div className="bg-[#111111] border border-white/5 p-6 rounded-2xl space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest">{label}</span>
        <div className="w-8 h-8 bg-white/5 rounded-lg flex items-center justify-center">
          {icon}
        </div>
      </div>
      <div className="text-2xl font-bold text-white tracking-tight">{value}</div>
    </div>
  );
}
