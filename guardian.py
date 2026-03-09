#!/usr/bin/env python3
"""
🛡️ Guardian Agent — Contrôle Parental pour Ubuntu Linux
=========================================================
Ce script tourne en arrière-plan sur le PC de l'enfant.
Il capture l'activité (titre de fenêtre + screenshot) et l'envoie
au dashboard parent. Il bloque aussi les contenus interdits.

INSTALLATION sur le PC de l'enfant :
  1. sudo apt install xdotool gnome-screenshot zenity python3-requests
  2. Copier ce fichier sur le PC
  3. python3 guardian.py --install   (pour l'auto-démarrage)
  4. Redémarrer le PC

DÉSINSTALLATION :
  python3 guardian.py --uninstall
"""

import subprocess
import time
import requests
import base64
import os
import sys
import re
import signal
import json
from datetime import datetime
from pathlib import Path

# ============================================================
# CONFIGURATION — À MODIFIER SELON VOTRE RÉSEAU
# ============================================================

# URL du serveur Dashboard (celui que le parent consulte)
# Option 1: Cloud Google (accessible partout)
APP_URL_CLOUD = "https://ais-pre-lt4gktee4esrepuh6d3ba3-243249280853.europe-west2.run.app"

# Option 2: Réseau local (quand cloud indisponible)
# Utilisez le nom d'hôte .local pour résister aux changements DHCP
APP_URL_LOCAL = "http://weedleay.local:3000"

# Intervalles
INTERVAL = 30           # Secondes entre chaque rapport (capture + titre)
BLOCK_CHECK_INTERVAL = 2 # Secondes entre chaque vérification de blocage
BLOCKLIST_REFRESH = 60   # Secondes entre chaque mise à jour de la blocklist

# Nom de l'enfant (apparaîtra dans les rapports)
CHILD_NAME = "Enfant"

# ============================================================
# NE PAS MODIFIER EN DESSOUS (sauf si vous savez ce que vous faites)
# ============================================================

AUTOSTART_DIR = os.path.expanduser("~/.config/autostart")
AUTOSTART_FILE = os.path.join(AUTOSTART_DIR, "guardian-parental.desktop")
SCRIPT_PATH = os.path.abspath(__file__)
LOG_FILE = os.path.expanduser("~/.guardian.log")

def log(message):
    """Log avec timestamp."""
    ts = datetime.now().strftime("%H:%M:%S")
    line = f"[{ts}] {message}"
    print(line)
    try:
        with open(LOG_FILE, "a") as f:
            f.write(line + "\n")
        # Garder le log à taille raisonnable (max 1000 lignes)
        with open(LOG_FILE, "r") as f:
            lines = f.readlines()
        if len(lines) > 1000:
            with open(LOG_FILE, "w") as f:
                f.writelines(lines[-500:])
    except:
        pass


# ============================================================
# INSTALLATION / DÉSINSTALLATION AUTO-START
# ============================================================

def install_autostart():
    """Installe le démarrage automatique au login de l'enfant."""
    os.makedirs(AUTOSTART_DIR, exist_ok=True)
    
    desktop_entry = f"""[Desktop Entry]
Type=Application
Name=Guardian Parental Monitor
Comment=Surveillance parentale
Exec=/usr/bin/python3 {SCRIPT_PATH}
Hidden=true
NoDisplay=true
X-GNOME-Autostart-enabled=true
X-GNOME-Autostart-Delay=5
"""
    with open(AUTOSTART_FILE, "w") as f:
        f.write(desktop_entry)
    
    # Rendre le fichier non supprimable par l'enfant (nécessite sudo)
    print("✅ Auto-démarrage installé !")
    print(f"   Fichier : {AUTOSTART_FILE}")
    print(f"   Script  : {SCRIPT_PATH}")
    print()
    print("🔒 Pour protéger contre la suppression (optionnel, nécessite sudo) :")
    print(f"   sudo chattr +i {AUTOSTART_FILE}")
    print(f"   sudo chattr +i {SCRIPT_PATH}")
    print()
    print("📋 Pour vérifier que tout fonctionne :")
    print("   1. Redémarrez le PC de l'enfant")
    print("   2. Guardian démarrera automatiquement à la connexion")
    print("   3. Vérifiez le dashboard parent pour voir les rapports")


def uninstall_autostart():
    """Supprime le démarrage automatique."""
    try:
        # Retirer la protection si elle existe
        subprocess.run(["sudo", "chattr", "-i", AUTOSTART_FILE], stderr=subprocess.DEVNULL)
        subprocess.run(["sudo", "chattr", "-i", SCRIPT_PATH], stderr=subprocess.DEVNULL)
    except:
        pass
    
    if os.path.exists(AUTOSTART_FILE):
        os.remove(AUTOSTART_FILE)
        print("✅ Auto-démarrage supprimé.")
    else:
        print("ℹ️  Aucun auto-démarrage trouvé.")


# ============================================================
# DÉTECTION DE FENÊTRE ACTIVE
# ============================================================

def get_active_window_info():
    """Récupère l'ID et le titre de la fenêtre active (X11/Ubuntu)."""
    
    # Méthode principale : xdotool (fonctionne sur Ubuntu X11)
    try:
        window_id = subprocess.check_output(
            ["xdotool", "getactivewindow"], stderr=subprocess.DEVNULL
        ).decode().strip()
        window_title = subprocess.check_output(
            ["xdotool", "getwindowname", window_id], stderr=subprocess.DEVNULL
        ).decode().strip()
        if window_title:
            return window_id, window_title
    except:
        pass

    # Fallback : xprop
    try:
        active = subprocess.check_output(
            ["xprop", "-root", "_NET_ACTIVE_WINDOW"], stderr=subprocess.DEVNULL
        ).decode()
        match = re.search(r'window id # (0x[0-9a-fA-F]+)', active)
        if match:
            wid = match.group(1)
            name_output = subprocess.check_output(
                ["xprop", "-id", wid, "WM_NAME"], stderr=subprocess.DEVNULL
            ).decode()
            name_match = re.search(r'"(.+)"', name_output)
            if name_match:
                return wid, name_match.group(1)
    except:
        pass

    # Fallback : liste des processus graphiques connus
    try:
        ps_output = subprocess.check_output(
            ["ps", "-eo", "comm"], stderr=subprocess.DEVNULL
        ).decode().lower()
        
        known_apps = {
            "chrome": "Google Chrome", "chromium": "Chromium",
            "firefox": "Firefox", "code": "VS Code",
            "gnome-terminal": "Terminal", "nautilus": "Fichiers",
            "libreoffice": "LibreOffice", "vlc": "VLC",
            "steam": "Steam", "minecraft": "Minecraft",
        }
        for proc, name in known_apps.items():
            if proc in ps_output:
                return None, f"{name} (processus détecté)"
    except:
        pass

    return None, "Bureau Ubuntu"


# ============================================================
# CAPTURE D'ÉCRAN
# ============================================================

def capture_screenshot():
    """Capture d'écran du bureau de l'enfant."""
    filename = "/tmp/guardian_capture.png"
    
    # Nettoyer l'ancienne capture
    if os.path.exists(filename):
        try:
            os.remove(filename)
        except:
            pass

    methods = [
        # Méthode 1 : gnome-screenshot (meilleure qualité sur GNOME)
        lambda: subprocess.run(
            ["gnome-screenshot", "-f", filename],
            stderr=subprocess.DEVNULL, stdout=subprocess.DEVNULL, timeout=10
        ),
        # Méthode 2 : scrot
        lambda: subprocess.run(
            ["scrot", filename],
            stderr=subprocess.DEVNULL, stdout=subprocess.DEVNULL, timeout=10
        ),
        # Méthode 3 : import (ImageMagick)
        lambda: subprocess.run(
            ["import", "-window", "root", filename],
            stderr=subprocess.DEVNULL, stdout=subprocess.DEVNULL, timeout=15
        ),
    ]

    for method in methods:
        try:
            method()
            if os.path.exists(filename) and os.path.getsize(filename) > 100:
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
    """Envoie une requête au serveur Dashboard (Cloud puis Local)."""
    
    urls_to_try = [APP_URL_CLOUD, APP_URL_LOCAL, "http://localhost:3000"]
    
    # Ajouter le hostname .local
    try:
        import socket
        hostname = socket.gethostname()
        urls_to_try.append(f"http://{hostname}.local:3000")
    except:
        pass

    for base_url in list(dict.fromkeys(urls_to_try)):  # Supprime doublons, garde l'ordre
        try:
            url = f"{base_url}{endpoint}"
            if method == "POST":
                res = requests.post(url, json=json_data, timeout=5)
            else:
                res = requests.get(url, timeout=5)
            if res.status_code == 200:
                return res
        except requests.exceptions.ConnectionError:
            continue
        except requests.exceptions.Timeout:
            continue
        except:
            continue
    return None


# ============================================================
# BOUCLE DE RAPPORT (capture + envoi)
# ============================================================

def report_loop():
    """Boucle principale : capture et envoie l'activité au dashboard parent."""
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
                ss_info = f"+ capture ({len(screenshot)//1024}KB)" if screenshot else "sans capture"
                log(f"✓ Rapport envoyé ({ss_info}) : {title[:60]}")
                consecutive_failures = 0
            else:
                consecutive_failures += 1
                if consecutive_failures <= 3 or consecutive_failures % 10 == 0:
                    log(f"✗ Échec d'envoi (tentative {consecutive_failures}) : {title[:40]}")
        except Exception as e:
            log(f"Erreur rapport : {e}")
            
        time.sleep(INTERVAL)


# ============================================================
# BOUCLE DE BLOCAGE (ferme les fenêtres interdites)
# ============================================================

def block_loop():
    """Vérifie en continu si le contenu affiché est interdit."""
    blocklist = []
    last_fetch = 0
    
    while True:
        try:
            # Mettre à jour la blocklist périodiquement
            if time.time() - last_fetch > BLOCKLIST_REFRESH:
                res = send_request("GET", "/api/blocklist")
                if res:
                    new_blocklist = [item['keyword'].lower() for item in res.json()]
                    if new_blocklist != blocklist:
                        blocklist = new_blocklist
                        if blocklist:
                            log(f"📋 Blocklist ({len(blocklist)} tags) : {', '.join(blocklist[:5])}{'...' if len(blocklist)>5 else ''}")
                    last_fetch = time.time()
            
            if not blocklist:
                time.sleep(BLOCK_CHECK_INTERVAL)
                continue

            window_id, title = get_active_window_info()
            if not window_id or not title:
                time.sleep(BLOCK_CHECK_INTERVAL)
                continue
                
            title_lower = title.lower()
            for keyword in blocklist:
                if keyword in title_lower:
                    log(f"🚫 BLOQUÉ : '{keyword}' trouvé dans '{title[:50]}'")
                    
                    # Alerte visuelle adaptée à un enfant
                    try:
                        subprocess.Popen([
                            "zenity", "--warning",
                            "--title=⛔ Accès Bloqué",
                            "--text=Ce contenu n'est pas autorisé.\n\nDemande à tes parents si tu veux y accéder.",
                            "--width=400",
                            "--timeout=10"
                        ], stderr=subprocess.DEVNULL, stdout=subprocess.DEVNULL)
                    except:
                        pass
                    
                    # Fermer la fenêtre
                    try:
                        subprocess.run(
                            ["xdotool", "windowclose", window_id],
                            stderr=subprocess.DEVNULL, timeout=3
                        )
                    except:
                        # Tentative alternative : wmctrl
                        try:
                            subprocess.run(
                                ["wmctrl", "-ic", window_id],
                                stderr=subprocess.DEVNULL, timeout=3
                            )
                        except:
                            pass
                    
                    # Petite pause pour éviter les boucles rapides
                    time.sleep(1)
                    break
                    
        except Exception as e:
            log(f"Erreur blocage : {e}")
            
        time.sleep(BLOCK_CHECK_INTERVAL)


# ============================================================
# POINT D'ENTRÉE
# ============================================================

if __name__ == "__main__":
    # Gestion des arguments
    if len(sys.argv) > 1:
        if sys.argv[1] == "--install":
            install_autostart()
            sys.exit(0)
        elif sys.argv[1] == "--uninstall":
            uninstall_autostart()
            sys.exit(0)
        elif sys.argv[1] == "--help":
            print("🛡️  Guardian — Contrôle Parental Ubuntu")
            print()
            print("Usage:")
            print("  python3 guardian.py              Lancer le monitoring")
            print("  python3 guardian.py --install     Installer le démarrage auto")
            print("  python3 guardian.py --uninstall   Supprimer le démarrage auto")
            print("  python3 guardian.py --test        Tester toutes les fonctions")
            sys.exit(0)
        elif sys.argv[1] == "--test":
            print("🧪 Test des fonctionnalités...")
            print()
            
            print("1. Connexion serveur...")
            test = send_request("GET", "/api/health")
            print(f"   {'✅ OK' if test else '❌ Échec'}")
            
            print("2. Détection fenêtre...")
            wid, title = get_active_window_info()
            print(f"   {'✅' if title != 'Bureau Ubuntu' else '⚠️ '} Titre: {title}")
            
            print("3. Capture d'écran...")
            ss = capture_screenshot()
            print(f"   {'✅ OK' if ss else '❌ Échec'} {f'({len(ss)//1024}KB)' if ss else ''}")
            
            print("4. Blocklist...")
            bl = send_request("GET", "/api/blocklist")
            if bl:
                items = bl.json()
                print(f"   ✅ {len(items)} tags bloqués")
            else:
                print("   ❌ Impossible de récupérer la blocklist")
            
            print()
            print("💡 Si xdotool échoue, installez-le :")
            print("   sudo apt install xdotool gnome-screenshot zenity")
            sys.exit(0)
    
    # Ignorer SIGHUP pour survivre à la fermeture du terminal
    signal.signal(signal.SIGHUP, signal.SIG_IGN)
    
    import threading
    
    print("=" * 55)
    print("🛡️  Guardian — Contrôle Parental")
    print(f"👤 Profil  : {CHILD_NAME}")
    print(f"🌐 Cloud   : {APP_URL_CLOUD[:50]}...")
    print(f"🏠 Local   : {APP_URL_LOCAL}")
    print(f"⏱️  Capture : toutes les {INTERVAL}s")
    print(f"🔍 Blocage : vérifié toutes les {BLOCK_CHECK_INTERVAL}s")
    print("=" * 55)
    
    # Test de connexion
    test = send_request("GET", "/api/health")
    if test:
        log("✅ Serveur connecté")
    else:
        log("⚠️  Serveur injoignable — les rapports seront retentés")
    
    # Lancer les deux boucles en parallèle
    log("🔄 Monitoring démarré (Ctrl+C pour arrêter)")
    
    report_thread = threading.Thread(target=report_loop, daemon=True)
    report_thread.start()
    
    try:
        block_loop()
    except KeyboardInterrupt:
        log("⏹️  Guardian arrêté par l'utilisateur")
