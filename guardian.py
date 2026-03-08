import subprocess
import time
import requests
import base64
import os

# CONFIGURATION
# Remplacez par l'URL de votre application si elle change
APP_URL = "https://ais-dev-lt4gktee4esrepuh6d3ba3-243249280853.europe-west2.run.app"
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
