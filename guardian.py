#!/usr/bin/env python3
"""
🛡️ Guardian Agent — Contrôle Parental pour Ubuntu Linux
=========================================================
Tourne en arrière-plan sur le PC de l'enfant.
Capture l'activité et bloque les contenus interdits.

INSTALLATION :
  ./deploy.sh   (script automatique)

MANUEL :
  python3 guardian.py              — Lancer
  python3 guardian.py --install    — Auto-démarrage
  python3 guardian.py --uninstall  — Supprimer
  python3 guardian.py --test       — Tester
"""

import subprocess
import time
import requests
import base64
import os
import sys
import re
import signal
from datetime import datetime
from pathlib import Path

# ============================================================
# CONFIGURATION
# ============================================================

# Nom de l'enfant (affiché dans les alertes de blocage)
CHILD_NAME = "Weedleay"

# URL du serveur Dashboard
APP_URL_CLOUD = "https://ais-pre-lt4gktee4esrepuh6d3ba3-243249280853.europe-west2.run.app"
APP_URL_LOCAL = "http://weedleay.local:3000"

# Intervalles
INTERVAL = 180             # Secondes entre chaque rapport (3 minutes)
BLOCK_CHECK_INTERVAL = 2  # Secondes entre chaque vérification
BLOCKLIST_REFRESH = 60    # Secondes entre chaque MAJ de la blocklist

# ============================================================
# CHEMINS
# ============================================================

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
OVERLAY_SCRIPT = os.path.join(SCRIPT_DIR, "blocker_overlay.py")
AUTOSTART_DIR = os.path.expanduser("~/.config/autostart")
AUTOSTART_FILE = os.path.join(AUTOSTART_DIR, "guardian-parental.desktop")
SCRIPT_PATH = os.path.abspath(__file__)
LOG_FILE = os.path.expanduser("~/.guardian.log")


def log(message):
    ts = datetime.now().strftime("%H:%M:%S")
    line = f"[{ts}] {message}"
    print(line)
    try:
        with open(LOG_FILE, "a") as f:
            f.write(line + "\n")
        with open(LOG_FILE, "r") as f:
            lines = f.readlines()
        if len(lines) > 1000:
            with open(LOG_FILE, "w") as f:
                f.writelines(lines[-500:])
    except:
        pass


# ============================================================
# AUTO-START
# ============================================================

def install_autostart():
    os.makedirs(AUTOSTART_DIR, exist_ok=True)
    desktop_entry = f"""[Desktop Entry]
Type=Application
Name=System Monitor Service
Comment=System performance monitor
Exec=/usr/bin/python3 {SCRIPT_PATH}
Hidden=true
NoDisplay=true
X-GNOME-Autostart-enabled=true
X-GNOME-Autostart-Delay=10
"""
    with open(AUTOSTART_FILE, "w") as f:
        f.write(desktop_entry)
    print("✅ Auto-démarrage installé !")
    print(f"   → {AUTOSTART_FILE}")
    print()
    print("🔒 Protection contre la suppression :")
    print(f"   sudo chattr +i {AUTOSTART_FILE}")
    print(f"   sudo chattr +i {SCRIPT_PATH}")
    print(f"   sudo chattr +i {OVERLAY_SCRIPT}")


def uninstall_autostart():
    for f in [AUTOSTART_FILE, SCRIPT_PATH, OVERLAY_SCRIPT]:
        try:
            subprocess.run(["sudo", "chattr", "-i", f], stderr=subprocess.DEVNULL)
        except:
            pass
    if os.path.exists(AUTOSTART_FILE):
        os.remove(AUTOSTART_FILE)
        print("✅ Auto-démarrage supprimé.")
    else:
        print("ℹ️  Aucun auto-démarrage trouvé.")


# ============================================================
# DÉTECTION DE FENÊTRE
# ============================================================

def get_active_window_info():
    # Force DISPLAY for X11 tools
    env = os.environ.copy()
    if "DISPLAY" not in env: env["DISPLAY"] = ":0"

    # 1. Tenter d'obtenir la fenêtre active via xdotool
    try:
        wid = subprocess.check_output(
            ["xdotool", "getactivewindow"], stderr=subprocess.DEVNULL, env=env
        ).decode().strip()
        title = subprocess.check_output(
            ["xdotool", "getwindowname", wid], stderr=subprocess.DEVNULL, env=env
        ).decode().strip()
        if title and title != "Sommelier":
            return wid, title
    except:
        pass

    # 2. Scanner TOUTES les fenêtres XWayland (souvent Chrome y est même sur Wayland)
    try:
        out = subprocess.check_output(["wmctrl", "-l"], stderr=subprocess.DEVNULL, env=env).decode()
        for line in out.splitlines():
            # On cherche Chrome ou YouTube dans la liste des fenêtres
            if "chrome" in line.lower() or "youtube" in line.lower() or "chromium" in line.lower():
                parts = line.split(None, 3)
                if len(parts) >= 4:
                    return parts[0], parts[3]
    except:
        pass

    # 3. Processus connus (dernier recours, très générique)
    try:
        ps = subprocess.check_output(["ps", "-eo", "args"], stderr=subprocess.DEVNULL).decode().lower()
        if "youtube" in ps: return None, "YouTube (via Navigateur)"
        
        apps = {"chrome": "Google Chrome", "firefox": "Firefox", "chromium": "Chromium"}
        for proc, name in apps.items():
            if proc in ps:
                return None, f"{name}"
    except:
        pass

    return None, "Activité Ubuntu"


def get_all_windows_info():
    """Récupère la liste de toutes les fenêtres ouvertes (ID et Titre)."""
    env = os.environ.copy()
    if "DISPLAY" not in env: env["DISPLAY"] = ":0"
    windows = []
    try:
        # wmctrl -l liste toutes les fenêtres gérées par le gestionnaire de fenêtres
        out = subprocess.check_output(["wmctrl", "-l"], stderr=subprocess.DEVNULL, env=env).decode()
        for line in out.splitlines():
            parts = line.split(None, 3) # ID, Bureau, Machine, Titre
            if len(parts) >= 4:
                windows.append((parts[0], parts[3]))
    except:
        pass
    return windows


# ============================================================
# CAPTURE D'ÉCRAN
# ============================================================

def capture_screenshot():
    filename = "/tmp/guardian_capture.png"
    if os.path.exists(filename):
        try: os.remove(filename)
        except: pass

    # On force le DISPLAY pour les captures
    env = os.environ.copy()
    if "DISPLAY" not in env:
        env["DISPLAY"] = ":0"

    methods = [
        ["gnome-screenshot", "--no-effects", "-f", filename], # Pas de flash, pas de son
        ["scrot", "-z", filename],                            # Mode silencieux
        ["import", "-window", "root", filename],
    ]
    for cmd in methods:
        try:
            # Réduire le timeout pour ne pas bloquer la boucle
            subprocess.run(cmd, stderr=subprocess.DEVNULL, stdout=subprocess.DEVNULL, timeout=5, env=env)
            if os.path.exists(filename) and os.path.getsize(filename) > 5000: # Plus de 5KB pour éviter les fichiers noirs
                with open(filename, "rb") as f:
                    encoded = base64.b64encode(f.read()).decode('utf-8')
                os.remove(filename)
                return encoded
        except:
            continue
    return None


# ============================================================
# COMMUNICATION SERVEUR
# ============================================================

def send_request(method, endpoint, json_data=None):
    urls = ["http://localhost:3000", APP_URL_LOCAL, APP_URL_CLOUD]
    try:
        import socket
        urls.append(f"http://{socket.gethostname()}.local:3000")
    except:
        pass

    for base_url in list(dict.fromkeys(urls)):
        try:
            url = f"{base_url}{endpoint}"
            if method == "POST":
                res = requests.post(url, json=json_data, timeout=5)
            else:
                res = requests.get(url, timeout=5)
            if res.status_code == 200:
                return res
        except:
            continue
    return None


# ============================================================
# BLOCAGE — ÉCRAN PLEIN ÉCRAN ROUGE
# ============================================================

def show_block_overlay(keyword):
    """Affiche l'écran de blocage plein écran pour l'enfant."""
    if os.path.exists(OVERLAY_SCRIPT):
        try:
            subprocess.Popen([
                "python3", OVERLAY_SCRIPT,
                CHILD_NAME,
                keyword,
                "15"  # durée en secondes
            ], stderr=subprocess.DEVNULL, stdout=subprocess.DEVNULL)
            return True
        except:
            pass
    
    # Fallback : zenity si l'overlay n'est pas disponible
    try:
        subprocess.Popen([
            "zenity", "--warning",
            f"--title=⛔ INTERDIT",
            f"--text=<span size='xx-large' color='red'><b>{CHILD_NAME},\ntu n'as pas le droit\nde regarder ça !</b></span>\n\nContenu bloqué : {keyword}\n\nDemande à tes parents.",
            "--width=500", "--timeout=15"
        ], stderr=subprocess.DEVNULL, stdout=subprocess.DEVNULL)

        # Couper le son immédiatement
        try:
            subprocess.run(["pactl", "set-sink-mute", "@DEFAULT_SINK@", "1"], stderr=subprocess.DEVNULL)
            subprocess.run(["amixer", "set", "Master", "mute"], stderr=subprocess.DEVNULL)
        except:
            pass
            
        return True
    except:
        return False


def close_window(window_id):
    """Ferme la fenêtre bloquée et tente de tuer le processus."""
    if not window_id:
        return
    try:
        # Obtenir le PID associé à la fenêtre avant de la fermer
        pid = None
        try:
            pid = subprocess.check_output(["xdotool", "getwindowpid", window_id], stderr=subprocess.DEVNULL).decode().strip()
        except:
            pass

        # 1. Tenter de minimiser et fermer proprement
        subprocess.run(["xdotool", "windowminimize", window_id], 
                       stderr=subprocess.DEVNULL, timeout=2)
        time.sleep(0.2)
        subprocess.run(["xdotool", "windowclose", window_id], 
                       stderr=subprocess.DEVNULL, timeout=2)
        
        # 2. Si on a un PID, on tue le processus pour arrêter le flux (vidéo/audio)
        if pid:
            time.sleep(0.5)
            subprocess.run(["kill", "-9", pid], stderr=subprocess.DEVNULL)
    except:
        try:
            subprocess.run(["wmctrl", "-ic", window_id], 
                           stderr=subprocess.DEVNULL, timeout=2)
        except:
            pass


# ============================================================
# BOUCLES PRINCIPALES
# ============================================================

def report_loop():
    consecutive_failures = 0
    while True:
        try:
            _, title = get_active_window_info()
            screenshot = capture_screenshot()
            
            payload = {
                "window_title": title,
                "app_name": f"Ubuntu ({CHILD_NAME})",
                "screenshot": screenshot
            }
            
            res = send_request("POST", "/api/report", payload)
            if res:
                ss = f"+capture" if screenshot else "sans capture"
                log(f"✓ Rapport ({ss}) : {title[:50]}")
                consecutive_failures = 0
            else:
                consecutive_failures += 1
                if consecutive_failures <= 3 or consecutive_failures % 10 == 0:
                    log(f"✗ Échec envoi #{consecutive_failures}")
        except Exception as e:
            log(f"Erreur : {e}")
        time.sleep(INTERVAL)


def block_loop():
    blocklist = []
    last_fetch = 0
    
    while True:
        try:
            # MAJ blocklist
            if time.time() - last_fetch > BLOCKLIST_REFRESH:
                res = send_request("GET", "/api/blocklist")
                if res:
                    new_bl = [item['keyword'].lower() for item in res.json()]
                    if new_bl != blocklist:
                        blocklist = new_bl
                        if blocklist:
                            log(f"📋 Blocklist : {', '.join(blocklist[:8])}")
                    last_fetch = time.time()
            
            if not blocklist:
                time.sleep(BLOCK_CHECK_INTERVAL)
                continue

            # Scanner TOUTES les fenêtres (pas seulement l'active)
            # Ça permet de lire les titres des onglets actifs de chaque fenêtre Chromium ouverte
            windows_to_check = get_all_windows_info()
            
            # Récupérer l'active spécifiquement via xdotool (plus réactif)
            active_wid, active_title = get_active_window_info()
            if active_wid and not any(w[0] == active_wid for w in windows_to_check):
                windows_to_check.append((active_wid, active_title))

            found_violation = False
            for wid, title in windows_to_check:
                if found_violation: break
                
                title_lower = title.lower()
                for keyword in blocklist:
                    # Si le keyword commence par @, on teste aussi sans le @
                    search_kw = keyword[1:] if keyword.startswith("@") else keyword
                    
                    if search_kw in title_lower:
                        log(f"🚫 BLOQUÉ : '{keyword}' détecté dans '{title[:50]}'")
                        
                        # 1. Capturer la preuve
                        evidence = capture_screenshot()
                        
                        # 2. Rapport
                        try:
                            send_request("POST", "/api/block-event", {
                                "window_title": title,
                                "keyword": keyword,
                                "screenshot": evidence
                            })
                        except: pass
                        
                        # 3. Overlay & Fermeture
                        show_block_overlay(keyword)
                        time.sleep(0.5)
                        close_window(wid)
                        
                        found_violation = True
                        time.sleep(15) 
                        try:
                            subprocess.run(["pactl", "set-sink-mute", "@DEFAULT_SINK@", "0"], stderr=subprocess.DEVNULL)
                            subprocess.run(["amixer", "set", "Master", "unmute"], stderr=subprocess.DEVNULL)
                        except: pass
                        break
                    
        except Exception as e:
            log(f"Erreur blocage : {e}")
        time.sleep(BLOCK_CHECK_INTERVAL)


# ============================================================
# MAIN
# ============================================================

def run_system_tasks():
    """Exécute les tâches d'initialisation système en arrière-plan."""
    time.sleep(15) # Attendre que la session soit bien chargée
    
    # 1. Dashboard (Serveur Web weedleay.local:3000)
    try:
        # Tenter d'activer le service
        subprocess.run(["sudo", "systemctl", "start", "guardian-dashboard.service"], 
                       stderr=subprocess.DEVNULL, stdout=subprocess.DEVNULL, timeout=5)
        
        # Test de présence
        is_up = False
        try:
            r = requests.get("http://localhost:3000/api/health", timeout=1)
            if r.status_code == 200: is_up = True
        except: pass
        
        if not is_up:
            log("🚀 Tentative de lancement manuel du Dashboard...")
            subprocess.Popen(["node", "node_modules/.bin/tsx", "server.ts"], 
                             cwd=SCRIPT_DIR, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    except:
        pass

    # 2. Réseau (dhclient)
    # On essaie de détecter l'interface si enp1s0 échoue ou n'existe pas
    try:
        # On tente enp1s0 comme demandé
        log("🔌 Config réseau (dhclient enp1s0)...")
        subprocess.Popen(["sudo", "dhclient", "-v", "enp1s0"], 
                         stderr=subprocess.DEVNULL, stdout=subprocess.DEVNULL)
    except:
        pass


if __name__ == "__main__":
    if len(sys.argv) > 1:
        # ... (gestion des arguments --install, etc. inchangée)
        cmd = sys.argv[1]
        if cmd == "--install":
            install_autostart()
            sys.exit(0)
        elif cmd == "--uninstall":
            uninstall_autostart()
            sys.exit(0)
        elif cmd == "--test":
            # Test minimal
            print("🧪 Test Guardian...")
            _, title = get_active_window_info()
            print(f"Fenêtre : {title}")
            sys.exit(0)
    
    # S'assurer que le script ne meurt pas si la console se ferme
    signal.signal(signal.SIGHUP, signal.SIG_IGN)
    import threading
    
    log(f"🛡️  Guardian démarré pour {CHILD_NAME}")
    
    # Lancer les tâches système lourdes dans un thread séparé avec un délai
    threading.Thread(target=run_system_tasks, daemon=True).start()
    
    # Attendre que GNOME/X11 soit totalement prêt avant de lancer le monitoring
    # Cela évite l'écran noir/croix si on sollicite X11 trop tôt
    time.sleep(20) 
    
    log("🔄 Monitoring actif...")
    
    # Thread de rapport (toutes les 3 minutes désormais)
    threading.Thread(target=report_loop, daemon=True).start()
    
    try:
        # Boucle principale de blocage
        block_loop()
    except KeyboardInterrupt:
        log("⏹️  Guardian arrêté")
    except Exception as e:
        log(f"💥 Erreur fatale : {e}")
        time.sleep(10)
