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
INTERVAL = 90             # Secondes entre chaque rapport (1m30)
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
        return True
    except:
        return False


def close_window(window_id):
    """Ferme la fenêtre bloquée."""
    if not window_id:
        return
    try:
        subprocess.run(["xdotool", "windowminimize", window_id], 
                       stderr=subprocess.DEVNULL, timeout=2)
        time.sleep(0.5)
        subprocess.run(["xdotool", "windowclose", window_id], 
                       stderr=subprocess.DEVNULL, timeout=2)
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

            wid, title = get_active_window_info()
            if not wid or not title:
                time.sleep(BLOCK_CHECK_INTERVAL)
                continue
                
            title_lower = title.lower()
            for keyword in blocklist:
                # Si le keyword commence par @, on teste aussi sans le @ (pour les handles YouTube)
                search_kw = keyword[1:] if keyword.startswith("@") else keyword
                
                if search_kw in title_lower:
                    log(f"🚫 BLOQUÉ : '{keyword}' dans '{title[:50]}'")
                    
                    # 1. Capturer la preuve AVANT de bloquer
                    evidence = capture_screenshot()
                    
                    # 2. Envoyer le rapport de blocage au serveur
                    try:
                        send_request("POST", "/api/block-event", {
                            "window_title": title,
                            "keyword": keyword,
                            "screenshot": evidence
                        })
                        log(f"   📤 Rapport de blocage envoyé")
                    except:
                        pass
                    
                    # 3. Afficher l'écran de blocage plein écran
                    show_block_overlay(keyword)
                    
                    # 4. Petite pause pour que l'overlay apparaisse au-dessus
                    time.sleep(0.5)
                    
                    # 5. Fermer la fenêtre interdite
                    close_window(wid)
                    
                    # 6. Pause pour éviter les boucles rapides
                    time.sleep(3)
                    break
                    
        except Exception as e:
            log(f"Erreur blocage : {e}")
        time.sleep(BLOCK_CHECK_INTERVAL)


# ============================================================
# MAIN
# ============================================================

if __name__ == "__main__":
    if len(sys.argv) > 1:
        cmd = sys.argv[1]
        if cmd == "--install":
            install_autostart()
            sys.exit(0)
        elif cmd == "--uninstall":
            uninstall_autostart()
            sys.exit(0)
        elif cmd == "--test":
            print("🧪 Test Guardian...")
            print(f"\n1. Serveur : ", end="")
            t = send_request("GET", "/api/health")
            print("✅ OK" if t else "❌ Injoignable")
            print(f"2. Fenêtre : ", end="")
            _, title = get_active_window_info()
            print(f"✅ {title}")
            print(f"3. Capture : ", end="")
            ss = capture_screenshot()
            print(f"✅ {len(ss)//1024}KB" if ss else "❌ Échec")
            print(f"4. Overlay : ", end="")
            print(f"✅ Trouvé" if os.path.exists(OVERLAY_SCRIPT) else "❌ Manquant")
            print(f"\n5. Test overlay (5s)...")
            show_block_overlay("test")
            sys.exit(0)
        elif cmd == "--help":
            print("🛡️ Guardian — python3 guardian.py [--install|--uninstall|--test|--help]")
            sys.exit(0)
    
    signal.signal(signal.SIGHUP, signal.SIG_IGN)
    import threading
    
    print("=" * 55)
    print(f"🛡️  Guardian — Contrôle Parental pour {CHILD_NAME}")
    print(f"🌐 Cloud : {APP_URL_CLOUD[:50]}")
    print(f"🏠 Local : {APP_URL_LOCAL}")
    print("=" * 55)

    # Commande réseau demandée par le parent
    try:
        print("🔌 Initialisation réseau (dhclient)...")
        subprocess.run(["sudo", "dhclient", "-v", "enp1s0"], stderr=subprocess.DEVNULL, timeout=10)
    except:
        pass
    
    t = send_request("GET", "/api/health")
    log("✅ Serveur connecté" if t else "⚠️  Serveur injoignable")
    log("🔄 Monitoring démarré...")
    
    threading.Thread(target=report_loop, daemon=True).start()
    
    try:
        block_loop()
    except KeyboardInterrupt:
        log("⏹️  Guardian arrêté")
