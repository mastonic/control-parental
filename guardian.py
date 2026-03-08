import subprocess
import time
import requests
import base64
import os

# CONFIGURATION
# URL 1 : Serveur Google (Principal)
APP_URL_CLOUD = "https://ais-pre-lt4gktee4esrepuh6d3ba3-243249280853.europe-west2.run.app"

# URL 2 : Serveur Local (Fallback - ex: l'IP de votre ordi sur le WiFi)
# Remplacez par l'IP locale si vous faites tourner le serveur chez vous
APP_URL_LOCAL = "http://localhost:3000" 

def send_request(method, endpoint, json_data=None):
    """Tente d'envoyer la requête au Cloud, puis au Local en cas d'échec."""
    urls = [APP_URL_CLOUD, APP_URL_LOCAL]
    for base_url in urls:
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
    
    # Run loops in separate threads
    threading.Thread(target=report_loop, daemon=True).start()
    block_loop()
