import subprocess
import time
import requests
import base64
import os
import re

# CONFIGURATION
# URL 1 : Serveur Google (Principal)
APP_URL_CLOUD = "https://ais-pre-lt4gktee4esrepuh6d3ba3-243249280853.europe-west2.run.app"

# URL 2 : Serveur Local (Fallback)
# Si le serveur est sur la MEME machine : "http://localhost:3000"
# Si le serveur est sur une AUTRE machine : utilisez le nom d'hôte + .local
# Exemple : "http://mon-ordinateur.local:3000" (marche même si l'IP change via DHCP)
APP_URL_LOCAL = "http://weedleay.local:3000" 

INTERVAL = 30 # secondes entre chaque capture
BLOCK_CHECK_INTERVAL = 2 # secondes entre chaque vérification de blocage

def detect_environment():
    """Détecte si on est sur X11, Wayland, ou Crostini."""
    session = os.environ.get("XDG_SESSION_TYPE", "").lower()
    # Check if inside Crostini (ChromeOS Linux)
    is_crostini = os.path.exists("/dev/.cros_milestone") or "penguin" in os.environ.get("HOSTNAME", "")
    
    if is_crostini:
        return "crostini"
    elif session == "x11":
        return "x11"
    elif session == "wayland":
        return "wayland"
    return "unknown"

ENV_TYPE = detect_environment()
print(f"Environnement détecté : {ENV_TYPE}")

def get_active_window_info():
    """Récupère le titre de la fenêtre active selon l'environnement."""
    
    # Méthode 1 : xdotool (X11 natif)
    try:
        window_id = subprocess.check_output(
            ["xdotool", "getactivewindow"], stderr=subprocess.DEVNULL
        ).decode().strip()
        window_title = subprocess.check_output(
            ["xdotool", "getwindowname", window_id], stderr=subprocess.DEVNULL
        ).decode().strip()
        if window_title and window_title != "(has no name)":
            return window_id, window_title
    except:
        pass

    # Méthode 2 : xprop (compatible XWayland / Sommelier / Crostini)
    try:
        # Lister toutes les fenêtres via xwininfo
        output = subprocess.check_output(
            ["xwininfo", "-root", "-tree"], stderr=subprocess.DEVNULL
        ).decode()
        
        # Trouver les fenêtres avec un nom (ignorer "has no name" et les petites)
        window_titles = []
        for line in output.split('\n'):
            # Chercher les lignes avec un nom entre guillemets et une taille raisonnable
            match = re.search(r'(0x[0-9a-f]+)\s+"([^"]+)".*?(\d+)x(\d+)', line)
            if match:
                wid = match.group(1)
                name = match.group(2)
                w = int(match.group(3))
                h = int(match.group(4))
                # Ignorer les fenêtres minuscules et Sommelier/window manager
                if w > 100 and h > 100 and name not in ("Sommelier", "has no name", ""):
                    window_titles.append((wid, name))
        
        if window_titles:
            # Prendre la dernière fenêtre (généralement la plus récente/au premier plan)
            return window_titles[-1]
    except:
        pass

    # Méthode 3 : Lire /proc pour les processus en premier plan
    try:
        # Trouver les processus graphiques courants
        ps_output = subprocess.check_output(
            ["ps", "-eo", "pid,comm", "--sort=-etime"], stderr=subprocess.DEVNULL
        ).decode()
        
        known_apps = {
            "chrome": "Google Chrome",
            "chromium": "Chromium",
            "firefox": "Firefox",
            "code": "VS Code",
            "gnome-terminal": "Terminal",
            "nautilus": "Fichiers",
            "libreoffice": "LibreOffice",
            "vlc": "VLC Media Player",
            "steam": "Steam",
        }
        
        for proc_name, display_name in known_apps.items():
            if proc_name in ps_output.lower():
                return None, f"{display_name} (détecté via processus)"
    except:
        pass

    return None, "Chromebook Desktop"


def capture_screenshot():
    """Capture d'écran compatible avec plusieurs environnements."""
    filename = "/tmp/monitor_ss.png"

    # Méthode 1 : gnome-screenshot 
    try:
        result = subprocess.run(
            ["gnome-screenshot", "-f", filename],
            stderr=subprocess.DEVNULL, timeout=5
        )
        if result.returncode == 0 and os.path.exists(filename):
            with open(filename, "rb") as f:
                encoded = base64.b64encode(f.read()).decode('utf-8')
            os.remove(filename)
            return encoded
    except:
        pass

    # Méthode 2 : import (ImageMagick)
    try:
        result = subprocess.run(
            ["import", "-window", "root", filename],
            stderr=subprocess.DEVNULL, timeout=10
        )
        if result.returncode == 0 and os.path.exists(filename):
            with open(filename, "rb") as f:
                encoded = base64.b64encode(f.read()).decode('utf-8')
            os.remove(filename)
            return encoded
    except:
        pass

    # Méthode 3 : scrot
    try:
        result = subprocess.run(
            ["scrot", filename],
            stderr=subprocess.DEVNULL, timeout=5
        )
        if result.returncode == 0 and os.path.exists(filename):
            with open(filename, "rb") as f:
                encoded = base64.b64encode(f.read()).decode('utf-8')
            os.remove(filename)
            return encoded
    except:
        pass

    # Méthode 4 : xwd + convert (très basique, souvent disponible)
    try:
        xwd_file = "/tmp/monitor_ss.xwd"
        subprocess.run(
            ["xwd", "-root", "-out", xwd_file],
            stderr=subprocess.DEVNULL, timeout=10
        )
        subprocess.run(
            ["convert", xwd_file, filename],
            stderr=subprocess.DEVNULL, timeout=10
        )
        if os.path.exists(filename):
            with open(filename, "rb") as f:
                encoded = base64.b64encode(f.read()).decode('utf-8')
            os.remove(filename)
            if os.path.exists(xwd_file):
                os.remove(xwd_file)
            return encoded
    except:
        pass

    return None


def send_request(method, endpoint, json_data=None):
    """Tente d'envoyer la requête au Cloud, puis au Local (localhost et .local)."""
    # On essaie d'abord le Cloud
    try:
        url = f"{APP_URL_CLOUD}{endpoint}"
        if method == "POST":
            res = requests.post(url, json=json_data, timeout=3)
        else:
            res = requests.get(url, timeout=3)
        if res.status_code == 200:
            return res
    except:
        pass

    # Si échec, on tente le réseau local (DHCP friendly via .local ou localhost)
    potential_locals = [APP_URL_LOCAL, "http://localhost:3000"]
    
    # On essaie aussi de deviner le nom de la machine si on est sur Ubuntu
    try:
        import socket
        hostname = socket.gethostname()
        potential_locals.append(f"http://{hostname}.local:3000")
    except:
        pass

    for base_url in list(set(potential_locals)): # Supprime les doublons
        try:
            url = f"{base_url}{endpoint}"
            if method == "POST":
                res = requests.post(url, json=json_data, timeout=2)
            else:
                res = requests.get(url, timeout=2)
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
                "app_name": "Chromebook" if ENV_TYPE == "crostini" else "Ubuntu Desktop",
                "screenshot": screenshot
            }
            
            res = send_request("POST", "/api/report", payload)
            if res:
                ss_status = "avec capture" if screenshot else "sans capture"
                print(f"✓ Report envoyé ({ss_status}): {title}")
            else:
                print(f"✗ Échec d'envoi: {title}")
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
                    if blocklist:
                        print(f"📋 Blocklist mise à jour : {blocklist}")
            
            window_id, title = get_active_window_info()
            if not window_id:
                time.sleep(BLOCK_CHECK_INTERVAL)
                continue
                
            title_lower = title.lower()
            for keyword in blocklist:
                if keyword in title_lower:
                    print(f"🚫 BLOQUÉ : {title}")
                    # Essayer zenity pour l'alerte
                    try:
                        subprocess.Popen(
                            ["zenity", "--warning", "--text", f"Accès interdit\n\nContenu bloqué: {keyword}", "--timeout", "5"],
                            stderr=subprocess.DEVNULL
                        )
                    except:
                        print(f"   (zenity non disponible pour l'alerte)")
                    
                    # Essayer de fermer la fenêtre
                    try:
                        subprocess.run(
                            ["xdotool", "windowclose", window_id],
                            stderr=subprocess.DEVNULL, timeout=3
                        )
                    except:
                        print(f"   (impossible de fermer la fenêtre automatiquement)")
                    break
        except Exception as e:
            print(f"Block Error: {e}")
            
        time.sleep(BLOCK_CHECK_INTERVAL)

if __name__ == "__main__":
    import threading
    
    print("=" * 50)
    print("🛡️  Guardian Agent démarré")
    print(f"📍 Environnement : {ENV_TYPE}")
    print(f"🌐 Cloud : {APP_URL_CLOUD}")
    print(f"🏠 Local : {APP_URL_LOCAL}")
    print(f"⏱️  Intervalle : {INTERVAL}s")
    print("=" * 50)
    
    # Test initial de connexion
    test = send_request("GET", "/api/health")
    if test:
        print("✅ Connexion au serveur réussie !")
    else:
        print("⚠️  Impossible de joindre le serveur. Les rapports seront retentés.")
    
    # Test initial de capture d'écran
    print("📸 Test de capture d'écran...")
    test_ss = capture_screenshot()
    if test_ss:
        print(f"✅ Capture d'écran OK ({len(test_ss) // 1024} KB)")
    else:
        print("⚠️  Capture d'écran indisponible. Installez: sudo apt install gnome-screenshot")
    
    # Test de détection de fenêtre
    print("🪟 Test de détection de fenêtre...")
    test_wid, test_title = get_active_window_info()
    print(f"   Fenêtre détectée : {test_title}")
    
    print("=" * 50)
    print("🔄 Monitoring en cours... (Ctrl+C pour arrêter)")
    print()
    
    # Run loops in separate threads
    threading.Thread(target=report_loop, daemon=True).start()
    block_loop()
