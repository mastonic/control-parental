import React, { useState, useEffect, useMemo } from 'react';
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
  Plus,
  Menu,
  X,
  Eye,
  Search,
  Tag,
  Youtube,
  Globe,
  Gamepad2,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  Calendar,
  Maximize2,
  ZoomIn
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

interface BlockEvent {
  id: number;
  timestamp: string;
  window_title: string;
  keyword: string;
  screenshot: string | null;
}

// Category presets for blocklist
const CATEGORY_PRESETS = [
  { label: 'YouTube', icon: Youtube, color: 'text-red-500', bg: 'bg-red-500/10', border: 'border-red-500/20', examples: 'MrBeast, PewDiePie, Squeezie...' },
  { label: 'Plateforme', icon: Globe, color: 'text-blue-500', bg: 'bg-blue-500/10', border: 'border-blue-500/20', examples: 'TikTok, Twitch, Instagram...' },
  { label: 'Jeux', icon: Gamepad2, color: 'text-purple-500', bg: 'bg-purple-500/10', border: 'border-purple-500/20', examples: 'Fortnite, Roblox, Minecraft...' },
  { label: 'Personnalisé', icon: Tag, color: 'text-amber-500', bg: 'bg-amber-500/10', border: 'border-amber-500/20', examples: 'Tout autre mot-clé...' },
];

function getCategoryForKeyword(keyword: string): typeof CATEGORY_PRESETS[0] {
  const lower = keyword.toLowerCase();
  const youtubeKeywords = ['youtube', 'mrbeast', 'pewdiepie', 'squeezie', 'inoxtag', 'michou', 'lebouseuh', 'amixem', 'cyprien', 'norman', 'tibo inshape'];
  const platformKeywords = ['tiktok', 'twitch', 'instagram', 'snapchat', 'twitter', 'facebook', 'discord', 'reddit', 'netflix', 'disney+'];
  const gameKeywords = ['fortnite', 'roblox', 'minecraft', 'gta', 'call of duty', 'cod', 'valorant', 'league of legends', 'apex', 'fifa', 'brawl stars'];

  if (youtubeKeywords.some(k => lower.includes(k))) return CATEGORY_PRESETS[0];
  if (platformKeywords.some(k => lower.includes(k))) return CATEGORY_PRESETS[1];
  if (gameKeywords.some(k => lower.includes(k))) return CATEGORY_PRESETS[2];
  return CATEGORY_PRESETS[3];
}

export default function App() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'screenshots' | 'setup' | 'settings' | 'blocklist'>('dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [screenshots, setScreenshots] = useState<Screenshot[]>([]);
  const [blocklist, setBlocklist] = useState<BlockedItem[]>([]);
  const [blockEvents, setBlockEvents] = useState<BlockEvent[]>([]);
  const [newKeyword, setNewKeyword] = useState('');
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(new Date());

  // Modal states
  const [selectedLog, setSelectedLog] = useState<ActivityLog | null>(null);
  const [selectedScreenshot, setSelectedScreenshot] = useState<Screenshot | null>(null);
  const [screenshotSearch, setScreenshotSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedBlockEvent, setSelectedBlockEvent] = useState<BlockEvent | null>(null);

  // Extract unique devices from logs
  const connectedDevices = useMemo(() => {
    const devices = new Set<string>();
    logs.forEach(log => {
      if (log.app_name) devices.add(log.app_name);
    });
    return Array.from(devices);
  }, [logs]);

  const fetchLogs = async () => {
    try {
      const res = await fetch('/api/activity');
      if (!res.ok) return;
      const data = await res.json();
      setLogs(data);
    } catch (err) {
      console.error('Failed to fetch logs', err);
    }
  };

  const fetchScreenshots = async () => {
    try {
      const res = await fetch('/api/screenshots');
      if (!res.ok) return;
      const data = await res.json();
      setScreenshots(data);
    } catch (err) {
      console.error('Failed to fetch screenshots', err);
    }
  };

  const fetchBlocklist = async () => {
    try {
      const res = await fetch('/api/blocklist');
      if (!res.ok) return;
      const data = await res.json();
      setBlocklist(data);
    } catch (err) {
      console.error('Failed to fetch blocklist', err);
    }
  };

  const fetchBlockEvents = async () => {
    try {
      const res = await fetch('/api/block-events');
      if (!res.ok) return;
      const data = await res.json();
      setBlockEvents(data);
    } catch (err) {
      console.error('Failed to fetch block events', err);
    }
  };

  const refreshAll = async () => {
    setLoading(true);
    await Promise.all([fetchLogs(), fetchScreenshots(), fetchBlocklist(), fetchBlockEvents()]);
    setLastRefresh(new Date());
    setLoading(false);
  };

  useEffect(() => {
    refreshAll();
    const interval = setInterval(refreshAll, 10000);
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

  // Find closest screenshot to a given activity timestamp
  const findClosestScreenshot = (logTimestamp: string): Screenshot | null => {
    if (screenshots.length === 0) return null;
    const logTime = new Date(logTimestamp).getTime();
    let closest: Screenshot | null = null;
    let minDiff = Infinity;

    for (const ss of screenshots) {
      const ssTime = new Date(ss.timestamp).getTime();
      const diff = Math.abs(ssTime - logTime);
      if (diff < minDiff) {
        minDiff = diff;
        closest = ss;
      }
    }
    // Only return if within 5 minutes
    return minDiff <= 5 * 60 * 1000 ? closest : null;
  };

  // Filter screenshots by search
  const filteredScreenshots = useMemo(() => {
    if (!screenshotSearch.trim()) return screenshots;
    const search = screenshotSearch.toLowerCase();
    return screenshots.filter(ss =>
      new Date(ss.timestamp).toLocaleString().toLowerCase().includes(search)
    );
  }, [screenshots, screenshotSearch]);

  // Categorized blocklist
  const categorizedBlocklist = useMemo(() => {
    return blocklist.map(item => ({
      ...item,
      category: getCategoryForKeyword(item.keyword)
    }));
  }, [blocklist]);

  const filteredBlocklist = useMemo(() => {
    if (!selectedCategory) return categorizedBlocklist;
    return categorizedBlocklist.filter(item => item.category.label === selectedCategory);
  }, [categorizedBlocklist, selectedCategory]);

  // Navigate screenshots in lightbox
  const navigateScreenshot = (direction: 'prev' | 'next') => {
    if (!selectedScreenshot) return;
    const idx = screenshots.findIndex(s => s.id === selectedScreenshot.id);
    if (direction === 'prev' && idx > 0) setSelectedScreenshot(screenshots[idx - 1]);
    if (direction === 'next' && idx < screenshots.length - 1) setSelectedScreenshot(screenshots[idx + 1]);
  };

  // Handle keyboard navigation in lightbox
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (selectedScreenshot) {
        if (e.key === 'ArrowLeft') navigateScreenshot('prev');
        if (e.key === 'ArrowRight') navigateScreenshot('next');
        if (e.key === 'Escape') setSelectedScreenshot(null);
      }
      if (selectedLog && e.key === 'Escape') setSelectedLog(null);
      if (selectedBlockEvent && e.key === 'Escape') setSelectedBlockEvent(null);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selectedScreenshot, selectedLog, selectedBlockEvent]);

  const agentScript = `
import subprocess
import time
import requests
import base64
import os

# CONFIGURATION
# URL 1 : Serveur Google (Principal)
APP_URL_CLOUD = "https://ais-pre-lt4gktee4esrepuh6d3ba3-243249280853.europe-west2.run.app"

# URL 2 : Serveur Local (Fallback)
# Si le serveur est sur la MEME machine : "http://localhost:3000"
# Si le serveur est sur une AUTRE machine : utilisez le nom d'hôte + .local
APP_URL_LOCAL = "http://localhost:3000" 

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

def send_request(method, endpoint, json_data=None):
    """Tente d'envoyer la requête au Cloud, puis au Local."""
    urls = [APP_URL_CLOUD, APP_URL_LOCAL]
    
    # Tentative d'ajout du nom d'hôte local
    try:
        import socket
        hostname = socket.gethostname()
        urls.append(f"http://{hostname}.local:3000")
    except:
        pass

    for base_url in list(set(urls)):
        try:
            url = f"{base_url}{endpoint}"
            if method == "POST":
                res = requests.post(url, json=json_data, timeout=3)
            else:
                res = requests.get(url, timeout=3)
            if res.status_code == 200:
                return res
        except:
            continue
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
            
            send_request("POST", "/api/report", payload)
        except Exception as e:
            print(f"Report Error: {e}")
            
        time.sleep(INTERVAL)

def block_loop():
    blocklist = []
    last_fetch = 0
    
    while True:
        try:
            if time.time() - last_fetch > 60:
                res = send_request("GET", "/api/blocklist")
                if res:
                    blocklist = [item['keyword'].lower() for item in res.json()]
                    last_fetch = time.time()
            
            window_id, title = get_active_window_info()
            if not window_id:
                time.sleep(BLOCK_CHECK_INTERVAL)
                continue
                
            title_lower = title.lower()
            for keyword in blocklist:
                if keyword in title_lower:
                    print(f"BLOCKED: {title}")
                    subprocess.Popen(["zenity", "--warning", "--text", "Accès interdit", "--timeout", "5"])
                    subprocess.run(["xdotool", "windowclose", window_id])
                    break
        except Exception as e:
            print(f"Block Error: {e}")
            
        time.sleep(BLOCK_CHECK_INTERVAL)

if __name__ == "__main__":
    import threading
    print("Ubuntu Guardian Agent démarré...")
    threading.Thread(target=report_loop, daemon=True).start()
    block_loop()
  `.trim();

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-zinc-300 font-sans selection:bg-emerald-500/30">
      {/* Mobile Sidebar Overlay */}
      <AnimatePresence>
        {isSidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsSidebarOpen(false)}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden"
          />
        )}
      </AnimatePresence>

      {/* ========== ACTIVITY DETAIL MODAL ========== */}
      <AnimatePresence>
        {selectedLog && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-md z-[100] flex items-center justify-center p-4"
            onClick={() => setSelectedLog(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="bg-[#141414] border border-white/10 rounded-3xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl shadow-black/50"
              onClick={e => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between p-6 border-b border-white/5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-emerald-500/10 rounded-xl flex items-center justify-center border border-emerald-500/20">
                    <Eye className="w-5 h-5 text-emerald-500" />
                  </div>
                  <div>
                    <h3 className="text-white font-semibold">Détail de l'activité</h3>
                    <p className="text-xs text-zinc-500">Événement #{selectedLog.id}</p>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedLog(null)}
                  className="p-2 hover:bg-white/10 rounded-xl transition-all"
                >
                  <X className="w-5 h-5 text-zinc-400" />
                </button>
              </div>

              {/* Modal Body */}
              <div className="p-6 space-y-6">
                {/* Event Info Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="bg-white/5 rounded-xl p-4 border border-white/5">
                    <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2">Date & Heure</p>
                    <div className="flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-emerald-500" />
                      <span className="text-white font-medium text-sm">
                        {new Date(selectedLog.timestamp).toLocaleDateString('fr-FR', {
                          weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
                        })}
                      </span>
                    </div>
                    <p className="text-emerald-500 font-mono text-lg mt-1 ml-6">
                      {new Date(selectedLog.timestamp).toLocaleTimeString('fr-FR')}
                    </p>
                  </div>
                  <div className="bg-white/5 rounded-xl p-4 border border-white/5">
                    <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2">Application</p>
                    <div className="flex items-center gap-2">
                      <Monitor className="w-4 h-4 text-blue-500" />
                      <span className="text-white font-medium text-sm">{selectedLog.app_name}</span>
                    </div>
                  </div>
                </div>

                {/* Window Title */}
                <div className="bg-white/5 rounded-xl p-4 border border-white/5">
                  <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2">Fenêtre Active</p>
                  <p className="text-white text-sm leading-relaxed break-all">{selectedLog.window_title}</p>
                </div>

                {/* Associated Screenshot */}
                {(() => {
                  const closestSs = findClosestScreenshot(selectedLog.timestamp);
                  if (closestSs) {
                    return (
                      <div className="space-y-3">
                        <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-2">
                          <ImageIcon className="w-3 h-3" />
                          Capture d'écran associée
                        </p>
                        <div className="relative group rounded-xl overflow-hidden border border-white/10">
                          <img
                            src={`data:image/png;base64,${closestSs.image_data}`}
                            alt="Screenshot"
                            className="w-full rounded-xl"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-4">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedScreenshot(closestSs);
                              }}
                              className="w-full py-2.5 bg-white/10 backdrop-blur-md rounded-lg text-xs font-bold text-white flex items-center justify-center gap-2 hover:bg-white/20 transition-all"
                            >
                              <Maximize2 className="w-3 h-3" />
                              Voir en plein écran
                            </button>
                          </div>
                          <div className="absolute top-3 right-3 px-2 py-1 bg-black/60 backdrop-blur-md rounded-lg text-[10px] text-zinc-300 font-mono">
                            {new Date(closestSs.timestamp).toLocaleTimeString('fr-FR')}
                          </div>
                        </div>
                      </div>
                    );
                  } else {
                    return (
                      <div className="bg-zinc-900/50 rounded-xl p-8 text-center border border-white/5">
                        <ImageIcon className="w-10 h-10 text-zinc-700 mx-auto mb-3" />
                        <p className="text-zinc-500 text-sm">Aucune capture associée à cet événement</p>
                        <p className="text-zinc-600 text-xs mt-1">Les captures sont associées si elles sont prises dans un intervalle de 5 minutes</p>
                      </div>
                    );
                  }
                })()}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ========== SCREENSHOT LIGHTBOX ========== */}
      <AnimatePresence>
        {selectedScreenshot && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/95 backdrop-blur-xl z-[100] flex items-center justify-center"
            onClick={() => setSelectedScreenshot(null)}
          >
            {/* Close button */}
            <button
              onClick={() => setSelectedScreenshot(null)}
              className="absolute top-6 right-6 p-3 bg-white/10 hover:bg-white/20 rounded-full transition-all z-10"
            >
              <X className="w-5 h-5 text-white" />
            </button>

            {/* Timestamp badge */}
            <div className="absolute top-6 left-6 px-4 py-2 bg-white/10 backdrop-blur-md rounded-full text-sm text-white font-medium z-10">
              <span className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-emerald-500" />
                {new Date(selectedScreenshot.timestamp).toLocaleString('fr-FR')}
              </span>
            </div>

            {/* Navigation arrows */}
            {screenshots.findIndex(s => s.id === selectedScreenshot.id) > 0 && (
              <button
                onClick={(e) => { e.stopPropagation(); navigateScreenshot('prev'); }}
                className="absolute left-4 top-1/2 -translate-y-1/2 p-3 bg-white/10 hover:bg-white/20 rounded-full transition-all z-10"
              >
                <ChevronLeft className="w-6 h-6 text-white" />
              </button>
            )}
            {screenshots.findIndex(s => s.id === selectedScreenshot.id) < screenshots.length - 1 && (
              <button
                onClick={(e) => { e.stopPropagation(); navigateScreenshot('next'); }}
                className="absolute right-4 top-1/2 -translate-y-1/2 p-3 bg-white/10 hover:bg-white/20 rounded-full transition-all z-10"
              >
                <ChevronRight className="w-6 h-6 text-white" />
              </button>
            )}

            {/* Image */}
            <motion.img
              key={selectedScreenshot.id}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              src={`data:image/png;base64,${selectedScreenshot.image_data}`}
              alt="Screenshot"
              className="max-w-[90vw] max-h-[85vh] object-contain rounded-lg shadow-2xl"
              onClick={e => e.stopPropagation()}
            />

            {/* Counter */}
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 px-4 py-2 bg-white/10 backdrop-blur-md rounded-full text-xs text-zinc-300 font-medium">
              {screenshots.findIndex(s => s.id === selectedScreenshot.id) + 1} / {screenshots.length}
            </div>
          </motion.div>
        )}

        {/* Block Event Detail Modal */}
        {selectedBlockEvent && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/90 backdrop-blur-xl z-[100] flex items-center justify-center p-4"
            onClick={() => setSelectedBlockEvent(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-[#111111] border border-red-500/20 rounded-2xl max-w-3xl w-full overflow-hidden shadow-2xl shadow-red-500/10"
              onClick={e => e.stopPropagation()}
            >
              {/* Header */}
              <div className="bg-red-500/10 border-b border-red-500/20 px-6 py-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-red-500/20 rounded-full flex items-center justify-center">
                    <Ban className="w-4 h-4 text-red-500" />
                  </div>
                  <div>
                    <h3 className="text-white font-bold text-sm">Tentative bloquée</h3>
                    <p className="text-red-400 text-xs">
                      {new Date(selectedBlockEvent.timestamp).toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}
                      {' à '}
                      {new Date(selectedBlockEvent.timestamp).toLocaleTimeString('fr-FR')}
                    </p>
                  </div>
                </div>
                <button onClick={() => setSelectedBlockEvent(null)} className="p-2 hover:bg-white/10 rounded-full transition-all">
                  <X className="w-5 h-5 text-zinc-400" />
                </button>
              </div>

              {/* Screenshot */}
              {selectedBlockEvent.screenshot && (
                <div className="relative">
                  <img
                    src={`data:image/png;base64,${selectedBlockEvent.screenshot}`}
                    alt="Capture au moment du blocage"
                    className="w-full max-h-[50vh] object-contain bg-black"
                  />
                  <div className="absolute top-3 right-3 px-3 py-1.5 bg-red-600 text-white text-xs font-bold rounded-full uppercase tracking-wider animate-pulse">
                    🚫 Bloqué
                  </div>
                </div>
              )}

              {/* Details */}
              <div className="p-6 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-black/40 rounded-xl p-4">
                    <p className="text-[10px] text-zinc-500 uppercase tracking-widest mb-1">Motif du blocage</p>
                    <div className="flex items-center gap-2">
                      {(() => {
                        const cat = getCategoryForKeyword(selectedBlockEvent.keyword);
                        return (
                          <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 ${cat.bg} border ${cat.border} rounded-full text-sm font-bold ${cat.color}`}>
                            <cat.icon className="w-4 h-4" />
                            {selectedBlockEvent.keyword}
                          </span>
                        );
                      })()}
                    </div>
                  </div>
                  <div className="bg-black/40 rounded-xl p-4">
                    <p className="text-[10px] text-zinc-500 uppercase tracking-widest mb-1">Date et heure</p>
                    <p className="text-white text-sm font-medium flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-zinc-500" />
                      {new Date(selectedBlockEvent.timestamp).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })}
                      {' — '}
                      {new Date(selectedBlockEvent.timestamp).toLocaleTimeString('fr-FR')}
                    </p>
                  </div>
                </div>
                <div className="bg-black/40 rounded-xl p-4">
                  <p className="text-[10px] text-zinc-500 uppercase tracking-widest mb-1">Fenêtre / Site bloqué</p>
                  <p className="text-zinc-300 text-sm">{selectedBlockEvent.window_title}</p>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <nav className={`
        fixed left-0 top-0 h-full w-64 bg-[#111111] border-r border-white/5 flex flex-col p-6 z-50 transition-transform duration-300
        ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>
        <div className="flex items-center justify-between mb-10 px-2 lg:block">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-500/10 rounded-xl flex items-center justify-center border border-emerald-500/20">
              <ShieldCheck className="w-6 h-6 text-emerald-500" />
            </div>
            <div>
              <h1 className="font-bold text-white tracking-tight">Guardian</h1>
              <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-semibold">Ubuntu Monitor</p>
            </div>
          </div>
          <button
            onClick={() => setIsSidebarOpen(false)}
            className="p-2 text-zinc-500 hover:text-white lg:hidden"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="space-y-1">
          <NavItem active={activeTab === 'dashboard'} onClick={() => { setActiveTab('dashboard'); setIsSidebarOpen(false); }} icon={<Activity className="w-4 h-4" />} label="Activité" />
          <NavItem active={activeTab === 'screenshots'} onClick={() => { setActiveTab('screenshots'); setIsSidebarOpen(false); }} icon={<ImageIcon className="w-4 h-4" />} label="Captures" badge={screenshots.length > 0 ? screenshots.length : undefined} />
          <NavItem active={activeTab === 'blocklist'} onClick={() => { setActiveTab('blocklist'); setIsSidebarOpen(false); }} icon={<Ban className="w-4 h-4" />} label="Blocage" badge={blocklist.length > 0 ? blocklist.length : undefined} />
          <NavItem active={activeTab === 'setup'} onClick={() => { setActiveTab('setup'); setIsSidebarOpen(false); }} icon={<Terminal className="w-4 h-4" />} label="Installation" />
          <NavItem active={activeTab === 'settings'} onClick={() => { setActiveTab('settings'); setIsSidebarOpen(false); }} icon={<Settings className="w-4 h-4" />} label="Paramètres" />
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
      <main className="lg:pl-64 min-h-screen">
        <header className="h-20 border-b border-white/5 flex items-center justify-between px-6 lg:px-10 sticky top-0 bg-[#0a0a0a]/80 backdrop-blur-xl z-40">
          <div className="flex items-center gap-4">
            <button onClick={() => setIsSidebarOpen(true)} className="p-2 text-zinc-500 hover:text-white lg:hidden">
              <Menu className="w-6 h-6" />
            </button>
            <h2 className="text-xl font-medium text-white">
              {activeTab === 'dashboard' && 'Dashboard'}
              {activeTab === 'screenshots' && 'Captures d\'écran'}
              {activeTab === 'blocklist' && 'Gestion des Blocages'}
              {activeTab === 'setup' && 'Installation'}
              {activeTab === 'settings' && 'Paramètres'}
            </h2>
          </div>
          <div className="flex items-center gap-4">
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-full">
              <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
              <span className="text-[10px] font-bold text-emerald-500 uppercase tracking-wider">Connecté</span>
            </div>
          </div>
        </header>

        <div className="p-6 lg:p-10 max-w-7xl mx-auto">
          <AnimatePresence mode="wait">

            {/* ========== DASHBOARD / ACTIVITÉ ========== */}
            {activeTab === 'dashboard' && (
              <motion.div
                key="dashboard"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-8"
              >
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                  <StatCard label="Appareils" value={connectedDevices.length} icon={<Monitor className="text-blue-500" />} />
                  <StatCard label="Total Logs" value={logs.length} icon={<Activity className="text-emerald-500" />} />
                  <StatCard label="Captures" value={screenshots.length} icon={<ImageIcon className="text-purple-500" />} />
                  <StatCard label="Dernière Activité" value={logs[0] ? new Date(logs[0].timestamp).toLocaleTimeString() : 'N/A'} icon={<Clock className="text-amber-500" />} />
                </div>

                {connectedDevices.length > 0 && (
                  <div className="flex flex-wrap gap-3">
                    {connectedDevices.map(device => (
                      <div key={device} className="flex items-center gap-2 px-4 py-2 bg-blue-500/10 border border-blue-500/20 rounded-xl">
                        <Monitor className="w-4 h-4 text-blue-500" />
                        <span className="text-sm font-semibold text-white">{device}</span>
                        <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse ml-1" />
                      </div>
                    ))}
                  </div>
                )}

                <div className="bg-[#111111] border border-white/5 rounded-2xl overflow-hidden">
                  <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between">
                    <h3 className="font-semibold text-white flex items-center gap-2">
                      <Activity className="w-4 h-4 text-emerald-500" />
                      Journal d'activité récent
                    </h3>
                    <p className="text-xs text-zinc-500">Cliquez sur un événement pour les détails</p>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="text-[11px] uppercase tracking-widest text-zinc-500 font-bold border-b border-white/5">
                          <th className="px-6 py-4">Heure</th>
                          <th className="px-6 py-4">Fenêtre Active</th>
                          <th className="px-6 py-4">Application</th>
                          <th className="px-6 py-4 text-center">Capture</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {logs.length === 0 ? (
                          <tr>
                            <td colSpan={4} className="px-6 py-12 text-center text-zinc-500 italic">
                              Aucune activité enregistrée. Installez l'agent sur le poste Ubuntu.
                            </td>
                          </tr>
                        ) : (
                          logs.map((log) => {
                            const hasSs = findClosestScreenshot(log.timestamp) !== null;
                            return (
                              <tr
                                key={log.id}
                                onClick={() => setSelectedLog(log)}
                                className="hover:bg-emerald-500/[0.03] transition-colors group cursor-pointer"
                              >
                                <td className="px-6 py-4 text-xs font-mono text-zinc-500">
                                  {new Date(log.timestamp).toLocaleTimeString()}
                                </td>
                                <td className="px-6 py-4 text-sm text-white font-medium max-w-xs truncate">
                                  {log.window_title}
                                </td>
                                <td className="px-6 py-4">
                                  <span className="px-2 py-1 bg-white/5 rounded text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                                    {log.app_name}
                                  </span>
                                </td>
                                <td className="px-6 py-4 text-center">
                                  {hasSs ? (
                                    <div className="inline-flex items-center gap-1.5 px-2 py-1 bg-emerald-500/10 rounded-full">
                                      <ImageIcon className="w-3 h-3 text-emerald-500" />
                                      <span className="text-[10px] font-bold text-emerald-500">OUI</span>
                                    </div>
                                  ) : (
                                    <span className="text-[10px] text-zinc-600">—</span>
                                  )}
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </motion.div>
            )}

            {/* ========== CAPTURES ========== */}
            {activeTab === 'screenshots' && (
              <motion.div
                key="screenshots"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-6"
              >
                {/* Search & Stats Bar */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                  <div className="relative flex-1 w-full">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                    <input
                      type="text"
                      value={screenshotSearch}
                      onChange={e => setScreenshotSearch(e.target.value)}
                      placeholder="Rechercher par date..."
                      className="w-full bg-[#111111] border border-white/10 rounded-xl pl-11 pr-4 py-3 text-sm text-white focus:outline-none focus:border-emerald-500/50 transition-all"
                    />
                  </div>
                  <div className="flex items-center gap-2 px-4 py-3 bg-[#111111] border border-white/5 rounded-xl text-xs text-zinc-400">
                    <ImageIcon className="w-4 h-4 text-blue-500" />
                    <span className="font-bold text-white">{filteredScreenshots.length}</span> captures
                  </div>
                </div>

                {/* Gallery Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                  {filteredScreenshots.length === 0 ? (
                    <div className="col-span-full py-20 text-center bg-[#111111] rounded-2xl border border-white/5">
                      <ImageIcon className="w-12 h-12 text-zinc-700 mx-auto mb-4" />
                      <p className="text-zinc-500">
                        {screenshotSearch ? 'Aucun résultat pour cette recherche.' : 'Aucune capture d\'écran disponible.'}
                      </p>
                    </div>
                  ) : (
                    filteredScreenshots.map((ss, index) => (
                      <motion.div
                        key={ss.id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.05, duration: 0.3 }}
                        className="group bg-[#111111] border border-white/5 rounded-2xl overflow-hidden hover:border-emerald-500/30 transition-all hover:shadow-lg hover:shadow-emerald-500/5 cursor-pointer"
                        onClick={() => setSelectedScreenshot(ss)}
                      >
                        <div className="aspect-video relative overflow-hidden bg-black">
                          <img
                            src={`data:image/png;base64,${ss.image_data}`}
                            alt="Screenshot"
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                            referrerPolicy="no-referrer"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-4">
                            <button className="w-full py-2 bg-white/10 backdrop-blur-md rounded-lg text-xs font-bold text-white flex items-center justify-center gap-2 hover:bg-white/20 transition-all">
                              <ZoomIn className="w-3 h-3" />
                              Voir en plein écran
                            </button>
                          </div>
                          {/* Index badge */}
                          <div className="absolute top-3 left-3 px-2 py-1 bg-black/60 backdrop-blur-md rounded-lg text-[10px] text-zinc-300 font-bold">
                            #{index + 1}
                          </div>
                        </div>
                        <div className="p-4 flex items-center justify-between">
                          <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">
                            {new Date(ss.timestamp).toLocaleString('fr-FR')}
                          </span>
                          <ImageIcon className="w-3 h-3 text-zinc-600" />
                        </div>
                      </motion.div>
                    ))
                  )}
                </div>
              </motion.div>
            )}

            {/* ========== BLOCAGE ========== */}
            {activeTab === 'blocklist' && (
              <motion.div
                key="blocklist"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-8"
              >
                {/* Info Banner */}
                <div className="bg-amber-500/5 border border-amber-500/20 p-6 rounded-2xl flex gap-4">
                  <div className="w-10 h-10 bg-amber-500/10 rounded-full flex items-center justify-center shrink-0">
                    <Info className="w-5 h-5 text-amber-500" />
                  </div>
                  <div>
                    <h4 className="text-white font-semibold mb-1">Comment fonctionne le blocage ?</h4>
                    <p className="text-sm text-zinc-400 leading-relaxed">
                      Ajoutez des <strong className="text-amber-400">tags spécifiques</strong> (noms de chaînes YouTube, plateformes, jeux).
                      <strong className="text-white"> Seuls ces tags sont bloqués</strong>, tout le reste passe normalement.
                      Si le titre de la fenêtre contient l'un de ces mots-clés, elle sera immédiatement fermée.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                  {/* Left Column - Add & Categories */}
                  <div className="lg:col-span-1 space-y-6">
                    {/* Add Form */}
                    <div className="bg-[#111111] border border-white/5 rounded-2xl p-6 space-y-4">
                      <h4 className="text-sm font-semibold text-white flex items-center gap-2">
                        <Plus className="w-4 h-4 text-emerald-500" />
                        Ajouter un tag
                      </h4>
                      <input
                        type="text"
                        value={newKeyword}
                        onChange={(e) => setNewKeyword(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && addBlock()}
                        placeholder="ex: MrBeast, Fortnite..."
                        className="w-full bg-black border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-emerald-500 transition-all placeholder:text-zinc-600"
                      />
                      <button
                        onClick={addBlock}
                        disabled={!newKeyword.trim()}
                        className="w-full px-4 py-3 bg-emerald-500 hover:bg-emerald-600 disabled:bg-zinc-800 disabled:text-zinc-600 text-black font-bold rounded-xl flex items-center justify-center gap-2 transition-all"
                      >
                        <Plus className="w-4 h-4" />
                        Bloquer ce tag
                      </button>
                    </div>

                    {/* Quick Add Categories */}
                    <div className="bg-[#111111] border border-white/5 rounded-2xl p-6 space-y-4">
                      <h4 className="text-sm font-semibold text-white">Catégories</h4>
                      <div className="space-y-2">
                        <button
                          onClick={() => setSelectedCategory(null)}
                          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all ${selectedCategory === null
                            ? 'bg-white/10 text-white border border-white/10'
                            : 'text-zinc-500 hover:bg-white/5'
                            }`}
                        >
                          <Tag className="w-4 h-4" />
                          <span>Tous</span>
                          <span className="ml-auto text-xs font-bold">{blocklist.length}</span>
                        </button>
                        {CATEGORY_PRESETS.map(cat => {
                          const count = categorizedBlocklist.filter(i => i.category.label === cat.label).length;
                          return (
                            <button
                              key={cat.label}
                              onClick={() => setSelectedCategory(selectedCategory === cat.label ? null : cat.label)}
                              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all ${selectedCategory === cat.label
                                ? `${cat.bg} ${cat.color} border ${cat.border}`
                                : 'text-zinc-500 hover:bg-white/5'
                                }`}
                            >
                              <cat.icon className="w-4 h-4" />
                              <span>{cat.label}</span>
                              {count > 0 && <span className="ml-auto text-xs font-bold">{count}</span>}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {/* Right Column - Blocked Tags List */}
                  <div className="lg:col-span-2">
                    <div className="bg-[#111111] border border-white/5 rounded-2xl overflow-hidden">
                      <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between">
                        <h4 className="text-sm font-semibold text-white flex items-center gap-2">
                          <Ban className="w-4 h-4 text-red-500" />
                          Tags bloqués
                          {selectedCategory && (
                            <span className="text-xs text-zinc-500 font-normal">— {selectedCategory}</span>
                          )}
                        </h4>
                        <span className="text-xs text-zinc-500">{filteredBlocklist.length} tag(s)</span>
                      </div>

                      {filteredBlocklist.length === 0 ? (
                        <div className="p-12 text-center">
                          <Ban className="w-10 h-10 text-zinc-700 mx-auto mb-3" />
                          <p className="text-zinc-500 text-sm">
                            {selectedCategory
                              ? `Aucun tag bloqué dans la catégorie "${selectedCategory}".`
                              : 'Aucun tag bloqué. Ajoutez des noms de chaînes ou plateformes à bloquer.'
                            }
                          </p>
                        </div>
                      ) : (
                        <div className="p-4">
                          <div className="flex flex-wrap gap-2">
                            {filteredBlocklist.map((item) => (
                              <motion.div
                                key={item.id}
                                initial={{ opacity: 0, scale: 0.8 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.8 }}
                                className={`group flex items-center gap-2 pl-3 pr-1.5 py-1.5 ${item.category.bg} border ${item.category.border} rounded-full transition-all hover:shadow-lg`}
                              >
                                <item.category.icon className={`w-3.5 h-3.5 ${item.category.color}`} />
                                <span className="text-sm text-white font-medium">{item.keyword}</span>
                                <button
                                  onClick={() => removeBlock(item.id)}
                                  className="p-1 hover:bg-red-500/20 rounded-full transition-all ml-1"
                                  title="Supprimer"
                                >
                                  <X className="w-3.5 h-3.5 text-zinc-400 hover:text-red-500" />
                                </button>
                              </motion.div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Suggestions */}
                    <div className="mt-6 bg-[#111111] border border-white/5 rounded-2xl p-6 space-y-4">
                      <h4 className="text-sm font-semibold text-white flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-amber-500" />
                        Suggestions rapides
                      </h4>
                      <p className="text-xs text-zinc-500">Cliquez pour ajouter rapidement un tag de blocage :</p>
                      <div className="space-y-4">
                        {CATEGORY_PRESETS.slice(0, 3).map(cat => (
                          <div key={cat.label} className="space-y-2">
                            <p className={`text-[10px] font-bold uppercase tracking-widest ${cat.color}`}>{cat.label}</p>
                            <div className="flex flex-wrap gap-2">
                              {getSuggestionsForCategory(cat.label).map(suggestion => {
                                const isBlocked = blocklist.some(b => b.keyword.toLowerCase() === suggestion.toLowerCase());
                                return (
                                  <button
                                    key={suggestion}
                                    disabled={isBlocked}
                                    onClick={async () => {
                                      await fetch('/api/blocklist', {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({ keyword: suggestion })
                                      });
                                      fetchBlocklist();
                                    }}
                                    className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${isBlocked
                                      ? 'bg-zinc-800 text-zinc-600 cursor-not-allowed line-through'
                                      : `border border-white/10 text-zinc-400 hover:${cat.bg} hover:${cat.color} hover:${cat.border}`
                                      }`}
                                  >
                                    {isBlocked ? '✓ ' : '+ '}{suggestion}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Block Events History */}
                <div className="bg-[#111111] border border-white/5 rounded-2xl overflow-hidden">
                  <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between">
                    <h4 className="text-sm font-semibold text-white flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-red-500" />
                      Historique des blocages
                    </h4>
                    <span className="text-xs text-zinc-500">{blockEvents.length} événement(s)</span>
                  </div>

                  {blockEvents.length === 0 ? (
                    <div className="p-12 text-center">
                      <ShieldCheck className="w-10 h-10 text-emerald-700 mx-auto mb-3" />
                      <p className="text-zinc-500 text-sm">Aucun blocage enregistré.</p>
                      <p className="text-zinc-600 text-xs mt-1">Les tentatives d'accès à du contenu interdit apparaîtront ici.</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-white/5">
                      {blockEvents.map((event) => {
                        const cat = getCategoryForKeyword(event.keyword);
                        return (
                          <motion.div
                            key={event.id}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="p-4 hover:bg-white/[0.02] transition-all cursor-pointer"
                            onClick={() => setSelectedBlockEvent(event)}
                          >
                            <div className="flex items-start gap-4">
                              {/* Thumbnail */}
                              <div className="w-20 h-14 bg-black rounded-lg overflow-hidden border border-white/10 shrink-0 flex items-center justify-center">
                                {event.screenshot ? (
                                  <img
                                    src={`data:image/png;base64,${event.screenshot}`}
                                    alt="Capture blocage"
                                    className="w-full h-full object-cover"
                                  />
                                ) : (
                                  <Ban className="w-5 h-5 text-zinc-700" />
                                )}
                              </div>

                              {/* Content */}
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 ${cat.bg} border ${cat.border} rounded-full text-[10px] font-bold ${cat.color}`}>
                                    <cat.icon className="w-3 h-3" />
                                    {event.keyword}
                                  </span>
                                  <span className="text-red-500 text-[10px] font-bold uppercase tracking-widest">BLOQUÉ</span>
                                </div>
                                <p className="text-sm text-zinc-300 truncate">{event.window_title}</p>
                                <div className="flex items-center gap-2 mt-1">
                                  <Clock className="w-3 h-3 text-zinc-600" />
                                  <span className="text-[11px] text-zinc-500">
                                    {new Date(event.timestamp).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })}
                                    {' à '}
                                    {new Date(event.timestamp).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                                  </span>
                                </div>
                              </div>

                              {/* Arrow */}
                              <Eye className="w-4 h-4 text-zinc-600 shrink-0 mt-2" />
                            </div>
                          </motion.div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            {/* ========== SETUP ========== */}
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
                        <p className="text-sm text-white font-medium">Récupérez le script <code className="text-emerald-400">guardian.py</code> :</p>
                        <p className="text-xs text-zinc-400 mb-2">Le fichier est déjà présent à la racine de votre projet. Vous pouvez le copier ci-dessous ou le récupérer via Git.</p>
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
                </div>
              </motion.div>
            )}

            {/* ========== SETTINGS ========== */}
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
                      <span className="text-white">v1.1.0</span>
                    </div>
                    <div className="flex justify-between py-2 border-b border-white/5">
                      <span className="text-zinc-500">Base de données</span>
                      <span className="text-white">SQLite 3</span>
                    </div>
                    <div className="flex justify-between py-2 border-b border-white/5">
                      <span className="text-zinc-500">Tags bloqués</span>
                      <span className="text-white font-bold">{blocklist.length}</span>
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

function getSuggestionsForCategory(category: string): string[] {
  switch (category) {
    case 'YouTube': return ['MrBeast', 'Squeezie', 'Inoxtag', 'Michou', 'PewDiePie', 'Amixem', 'Cyprien', 'Tibo InShape'];
    case 'Plateforme': return ['TikTok', 'Twitch', 'Instagram', 'Snapchat', 'Discord', 'Netflix', 'Twitter'];
    case 'Jeux': return ['Fortnite', 'Roblox', 'Minecraft', 'GTA', 'Valorant', 'Brawl Stars', 'FIFA', 'Apex'];
    default: return [];
  }
}

function NavItem({ active, onClick, icon, label, badge }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string, badge?: number }) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${active
        ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20'
        : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/5'
        }`}
    >
      {icon}
      {label}
      {badge !== undefined && (
        <span className={`ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full ${active ? 'bg-emerald-500/20 text-emerald-400' : 'bg-white/10 text-zinc-400'
          }`}>
          {badge}
        </span>
      )}
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
