#!/bin/bash
# ============================================================
# 🛡️ Guardian — Déploiement Contrôle Parental
# ============================================================
# Installe le contrôle parental sur le PC Ubuntu de l'enfant.
# 
# ARCHITECTURE :
#   - Les fichiers sont dans /opt/guardian/ (protégé, root only)
#   - Le serveur dashboard tourne en service système (systemd)
#   - L'agent se lance au login de la session "Weedleay"
#   - L'enfant ne peut PAS arrêter ni supprimer Guardian
#
# USAGE (exécuter depuis une session PARENT avec accès sudo) :
#   git clone https://github.com/mastonic/control-parental.git
#   cd control-parental && chmod +x deploy.sh && ./deploy.sh
#
# ACCÈS DASHBOARD :
#   📱 Mobile (même WiFi) : http://<IP>:3000
#   💻 PC parent          : http://localhost:3000
# ============================================================

# Ne PAS utiliser set -e : on gère les erreurs nous-mêmes

# ============== CONFIG ==============
CHILD_USER="weedleay"          # Nom de la session Linux de l'enfant (en minuscule)
CHILD_DISPLAY_NAME="Weedleay"  # Nom affiché dans les alertes
INSTALL_DIR="/opt/guardian"    # Dossier protégé (root only)
REPO_URL="https://github.com/mastonic/control-parental.git"
SERVER_PORT=3000
# ====================================

# Couleurs
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'
BOLD='\033[1m'

step() {
    echo -e "\n${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BOLD}${GREEN}▶ $1${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

ok()   { echo -e "${GREEN}  ✅ $1${NC}"; }
warn() { echo -e "${YELLOW}  ⚠️  $1${NC}"; }
fail() { echo -e "${RED}  ❌ $1${NC}"; exit 1; }
info() { echo -e "${CYAN}  ℹ️  $1${NC}"; }

# ============================================================
# Vérifications préliminaires
# ============================================================
echo -e "${CYAN}"
echo "╔══════════════════════════════════════════════════════╗"
echo "║  🛡️  Guardian — Contrôle Parental pour Ubuntu        ║"
echo "║  Déploiement automatique                            ║"
echo "╚══════════════════════════════════════════════════════╝"
echo -e "${NC}"

# Vérifier qu'on a les droits sudo
if ! sudo -n true 2>/dev/null; then
    info "Ce script nécessite les droits administrateur (sudo)."
    sudo true || fail "Droits sudo requis."
fi

# ============================================================
# Déverrouiller une installation précédente (si elle existe)
# ============================================================
if [ -d "$INSTALL_DIR" ]; then
    info "Installation précédente détectée, déverrouillage..."
    # Retirer les flags immutables de TOUS les fichiers protégés
    sudo chattr -i "$INSTALL_DIR/guardian.py" 2>/dev/null || true
    sudo chattr -i "$INSTALL_DIR/blocker_overlay.py" 2>/dev/null || true
    sudo chattr -i -R "$INSTALL_DIR" 2>/dev/null || true
    # Déverrouiller aussi l'autostart de l'enfant (on ne connaît pas encore CHILD_HOME ici)
    for d in /home/*/.config/autostart; do
        sudo chattr -i "$d/system-monitor.desktop" 2>/dev/null || true
    done
    # Arrêter le service s'il tourne
    sudo systemctl stop guardian-dashboard.service 2>/dev/null || true
    ok "Installation précédente déverrouillée"
fi

# Vérifier que la session enfant existe
if ! id "$CHILD_USER" &>/dev/null; then
    warn "L'utilisateur '$CHILD_USER' n'existe pas encore."
    echo -e "  Utilisateurs disponibles :"
    awk -F: '$3 >= 1000 && $1 != "nobody" { print "    - " $1 }' /etc/passwd
    echo ""
    read -p "  Quel est le nom d'utilisateur de l'enfant ? " CHILD_USER
    CHILD_USER=$(echo "$CHILD_USER" | tr '[:upper:]' '[:lower:]')
    if ! id "$CHILD_USER" &>/dev/null; then
        fail "L'utilisateur '$CHILD_USER' n'existe pas."
    fi
fi

CHILD_HOME=$(eval echo "~$CHILD_USER")
ok "Session enfant trouvée : $CHILD_USER ($CHILD_HOME)"

# ============================================================
# ÉTAPE 1 : Dépendances système
# ============================================================
step "Étape 1/9 — Dépendances système"

sudo apt update -qq 2>/dev/null || true

PACKAGES="xdotool gnome-screenshot zenity python3-requests python3-tk git curl nodejs npm nmap"
for pkg in $PACKAGES; do
    if dpkg -s "$pkg" &>/dev/null 2>&1; then
        ok "$pkg ✓"
    else
        info "Installation de $pkg..."
        sudo apt install -y -qq "$pkg" 2>/dev/null && ok "$pkg installé" || warn "$pkg optionnel"
    fi
done

# ============================================================
# ÉTAPE 2 : Diagnostic Réseau & Agent
# ============================================================
step "Étape 2/9 — Diagnostic Réseau & Agent"

info "Scan du réseau local pour détecter weedleay.local..."
# On attend un peu que nmap soit bien dispo si on vient de l'installer
if command -v nmap &>/dev/null; then
    if nmap -sn weedleay.local 2>/dev/null | grep -q "Host is up"; then
        ok "Le PC weedleay.local est BIEN connecté au réseau."
    else
        warn "Le PC weedleay.local semble injoignable via nmap."
        # Fallback ping
        if ping -c 1 weedleay.local &>/dev/null; then
            ok "Le PC weedleay.local répond toutefois au ping."
        fi
    fi
else
    if ping -c 1 weedleay.local &>/dev/null; then
        ok "Le PC weedleay.local est bien connecté (ping OK)."
    else
        warn "Impossible de pinger weedleay.local. Vérifiez la connexion réseau."
    fi
fi

info "Vérification de l'agent Guardian (guardian.py)..."
if pgrep -f "guardian.py" > /dev/null; then
    ok "L'agent guardian.py est en cours d'exécution."
else
    warn "L'agent guardian.py n'est PAS lancé sur cette machine."
fi

# ============================================================
# ÉTAPE 3 : Node.js (version récente si nécessaire)
# ============================================================
step "Étape 3/9 — Node.js"

# Vérifier si Node.js est assez récent (v18+)
NODE_OK=false
if command -v node &>/dev/null; then
    NODE_MAJOR=$(node --version | cut -d. -f1 | tr -d 'v')
    if [ "$NODE_MAJOR" -ge 18 ] 2>/dev/null; then
        ok "Node.js $(node --version) ✓"
        NODE_OK=true
    else
        warn "Node.js $(node --version) trop ancien, mise à jour..."
    fi
fi

if [ "$NODE_OK" = false ]; then
    # Installer Node.js 20 via NodeSource
    info "Installation de Node.js 20..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - 2>/dev/null
    sudo apt install -y -qq nodejs 2>/dev/null
    ok "Node.js $(node --version) installé"
fi

# ============================================================
# ÉTAPE 4 : Installation des fichiers dans /opt/guardian
# ============================================================
step "Étape 4/9 — Installation des fichiers"

# Créer le dossier protégé
sudo mkdir -p "$INSTALL_DIR"

# Copier les fichiers depuis le dossier courant ou cloner
if [ -f "package.json" ] && [ -f "guardian.py" ]; then
    info "Copie depuis le dossier courant..."
    sudo cp -r . "$INSTALL_DIR/"
    # Nettoyer les fichiers git et node_modules du source
    sudo rm -rf "$INSTALL_DIR/.git" "$INSTALL_DIR/node_modules"
    ok "Fichiers copiés"
elif [ -d "$INSTALL_DIR/.git" ]; then
    info "Mise à jour depuis Git..."
    cd "$INSTALL_DIR"
    sudo git pull origin main 2>/dev/null || warn "Pull échoué"
    ok "Fichiers mis à jour"
else
    info "Clonage du dépôt..."
    sudo rm -rf "$INSTALL_DIR"
    sudo git clone "$REPO_URL" "$INSTALL_DIR"
    ok "Projet cloné"
fi

# ============================================================
# ÉTAPE 5 : Dépendances Node.js
# ============================================================
step "Étape 5/9 — Dépendances Node.js + Build"

cd "$INSTALL_DIR"
sudo npm install --silent 2>/dev/null
ok "Dépendances installées"

# Fichier .env
if [ ! -f "$INSTALL_DIR/.env" ]; then
    if [ -f "$INSTALL_DIR/.env.example" ]; then
        sudo cp "$INSTALL_DIR/.env.example" "$INSTALL_DIR/.env"
    else
        echo "# Guardian" | sudo tee "$INSTALL_DIR/.env" > /dev/null
    fi
    ok "Fichier .env créé"
fi

# Le frontend est pré-compilé et inclus dans le repo (dist/)
if [ -d "$INSTALL_DIR/dist" ]; then
    ok "Frontend pré-compilé trouvé (dist/)"
else
    warn "Dossier dist/ manquant — tentative de build..."
    cd "$INSTALL_DIR"
    sudo chmod +x "$INSTALL_DIR/node_modules/.bin/"* 2>/dev/null || true
    sudo node node_modules/.bin/vite build 2>/dev/null || warn "Build échoué"
fi

# ============================================================
# ÉTAPE 6 : Service système pour le Dashboard (systemd)
# ============================================================
step "Étape 6/9 — Service Dashboard (systemd)"

# Trouver le chemin complet de node
NODE_PATH=$(which node)
info "Node.js trouvé : $NODE_PATH"

# S'assurer que tsx est exécutable
TSX_BIN="$INSTALL_DIR/node_modules/.bin/tsx"
if [ -f "$TSX_BIN" ]; then
    sudo chmod +x "$TSX_BIN" 2>/dev/null || true
    ok "tsx rendu exécutable"
else
    warn "tsx introuvable dans node_modules, tentative de réinstallation..."
    cd "$INSTALL_DIR"
    sudo npm install tsx --save-dev --silent 2>/dev/null || true
    sudo chmod +x "$TSX_BIN" 2>/dev/null || true
fi

# S'assurer que TOUS les binaires dans node_modules/.bin sont exécutables
sudo chmod +x "$INSTALL_DIR/node_modules/.bin/"* 2>/dev/null || true

# Créer un script wrapper pour démarrer le serveur (plus fiable que d'appeler tsx directement)
sudo tee "$INSTALL_DIR/start-server.sh" > /dev/null << 'WRAPPEREOF'
#!/bin/bash
cd /opt/guardian
export NODE_ENV=production
# Charger .env si présent
[ -f .env ] && export $(grep -v '^#' .env | xargs) 2>/dev/null
exec node node_modules/.bin/tsx server.ts
WRAPPEREOF
sudo chmod +x "$INSTALL_DIR/start-server.sh"

# Créer le service systemd
sudo tee /etc/systemd/system/guardian-dashboard.service > /dev/null << SERVICEEOF
[Unit]
Description=Guardian Parental Dashboard
After=network.target

[Service]
Type=simple
WorkingDirectory=$INSTALL_DIR
ExecStart=/bin/bash $INSTALL_DIR/start-server.sh
Restart=always
RestartSec=5
Environment=NODE_ENV=production
Environment=PORT=$SERVER_PORT

[Install]
WantedBy=multi-user.target
SERVICEEOF

sudo systemctl daemon-reload
sudo systemctl enable guardian-dashboard.service 2>/dev/null || true
sudo systemctl restart guardian-dashboard.service 2>/dev/null || true
sleep 4

if sudo systemctl is-active --quiet guardian-dashboard.service; then
    ok "Service Dashboard actif et démarré"
else
    warn "Service systemd échoué, démarrage en mode direct..."
    # Voir pourquoi ça a échoué
    sudo journalctl -u guardian-dashboard.service --no-pager -n 5 2>/dev/null || true
    
    # Fallback : lancer directement avec bash
    sudo fuser -k $SERVER_PORT/tcp 2>/dev/null || true
    sleep 1
    cd "$INSTALL_DIR"
    sudo bash -c "cd $INSTALL_DIR && $NODE_PATH node_modules/.bin/tsx server.ts > /tmp/guardian-server.log 2>&1 &"
    sleep 3
    if fuser $SERVER_PORT/tcp &>/dev/null 2>&1 || curl -s "http://localhost:$SERVER_PORT/api/health" | grep -q "ok" 2>/dev/null; then
        ok "Dashboard démarré (mode direct)"
    else
        warn "Dashboard non démarré — consultez : cat /tmp/guardian-server.log"
    fi
fi

# ============================================================
# ÉTAPE 7 : Agent Guardian dans la session de l'enfant
# ============================================================
step "Étape 7/9 — Agent Guardian pour la session $CHILD_DISPLAY_NAME"

CHILD_AUTOSTART_DIR="$CHILD_HOME/.config/autostart"
sudo mkdir -p "$CHILD_AUTOSTART_DIR"

# Créer le fichier .desktop d'autostart (nom discret)
sudo tee "$CHILD_AUTOSTART_DIR/system-monitor.desktop" > /dev/null << DESKTOPEOF
[Desktop Entry]
Type=Application
Name=System Monitor
Comment=System performance monitoring service
Exec=/usr/bin/python3 $INSTALL_DIR/guardian.py
Hidden=true
NoDisplay=true
X-GNOME-Autostart-enabled=true
X-GNOME-Autostart-Delay=10
StartupNotify=false
Terminal=false
DESKTOPEOF

# Propriété : root (l'enfant ne peut pas le supprimer)
sudo chown root:root "$CHILD_AUTOSTART_DIR/system-monitor.desktop"
sudo chmod 644 "$CHILD_AUTOSTART_DIR/system-monitor.desktop"

ok "Auto-démarrage configuré dans la session de $CHILD_DISPLAY_NAME"

# Démarrer l'agent IMMÉDIATEMENT (pas besoin d'attendre le prochain login)
# Tuer un éventuel ancien agent
sudo pkill -f "python3.*guardian.py" 2>/dev/null || true
sleep 1

# Lancer l'agent en tant que l'utilisateur enfant (pour avoir accès à son display)
if who | grep -q "$CHILD_USER"; then
    # L'enfant est connecté — lancer dans sa session
    CHILD_DISPLAY=$(who | grep "$CHILD_USER" | grep -o '(:[0-9]*)' | tr -d '()' | head -1)
    CHILD_DISPLAY=${CHILD_DISPLAY:-":0"}
    info "Session $CHILD_USER active (display $CHILD_DISPLAY), lancement de l'agent..."
    sudo -u "$CHILD_USER" bash -c "export DISPLAY=$CHILD_DISPLAY; nohup python3 $INSTALL_DIR/guardian.py > /tmp/guardian-agent.log 2>&1 &"
    sleep 2
    if pgrep -f "guardian.py" > /dev/null; then
        ok "Agent Guardian démarré dans la session de $CHILD_DISPLAY_NAME"
    else
        warn "L'agent n'a pas pu démarrer — il se lancera au prochain login"
    fi
else
    # L'enfant n'est pas connecté — lancer en root (sera relancé au login)
    info "$CHILD_USER n'est pas connecté, lancement en mode service..."
    sudo nohup python3 "$INSTALL_DIR/guardian.py" > /tmp/guardian-agent.log 2>&1 &
    sleep 2
    if pgrep -f "guardian.py" > /dev/null; then
        ok "Agent Guardian démarré (sera relancé au login de $CHILD_DISPLAY_NAME)"
    else
        warn "L'agent se lancera au prochain login de $CHILD_DISPLAY_NAME"
    fi
fi

# ============================================================
# ÉTAPE 8.5 : Autorisations Sudoers (pour dhclient et dashboard)
# ============================================================
step "Étape 8.5/9 — Autorisations Sudoers"

SUDOERS_FILE="/etc/sudoers.d/guardian-$CHILD_USER"
info "Création de la règle sudoers pour $CHILD_USER..."

# Chemins des commandes
CMD_DHCLIENT=$(which dhclient 2>/dev/null || echo "/usr/sbin/dhclient")
CMD_SYSTEMCTL=$(which systemctl 2>/dev/null || echo "/usr/bin/systemctl")

# Créer le fichier sudoers
sudo tee "$SUDOERS_FILE" > /dev/null << SUDOERS_EOF
# Autorisations Guardian pour $CHILD_USER
$CHILD_USER ALL=(ALL) NOPASSWD: $CMD_DHCLIENT -v enp1s0
$CHILD_USER ALL=(ALL) NOPASSWD: $CMD_SYSTEMCTL start guardian-dashboard.service
$CHILD_USER ALL=(ALL) NOPASSWD: $CMD_SYSTEMCTL restart guardian-dashboard.service
SUDOERS_EOF

# Protection du fichier sudoers
sudo chmod 440 "$SUDOERS_FILE"
ok "Sudoers configuré pour $CHILD_USER"

# ============================================================
# ÉTAPE 8 : Protection des fichiers
# ============================================================
step "Étape 8/9 — Protection contre la suppression"

# D'abord, retirer TOUS les flags immutables (au cas où une précédente exécution les a posés)
info "Déverrouillage complet avant re-protection..."
sudo chattr -i -R "$INSTALL_DIR" 2>/dev/null || true
sudo chattr -i "$CHILD_AUTOSTART_DIR/system-monitor.desktop" 2>/dev/null || true

# Maintenant, on peut changer les propriétaires et permissions sans erreur
sudo chown -R root:root "$INSTALL_DIR" 2>/dev/null || warn "chown partiel"
sudo chmod -R 755 "$INSTALL_DIR" 2>/dev/null || true

# Le dossier node_modules et la db doivent être accessibles en écriture
sudo chmod -R 777 "$INSTALL_DIR/node_modules" 2>/dev/null || true

# Créer la db si elle n'existe pas et donner les bonnes permissions
sudo touch "$INSTALL_DIR/monitor.db" 2>/dev/null || true
sudo chmod 666 "$INSTALL_DIR/monitor.db" 2>/dev/null || true

# Enfin, protéger les fichiers critiques avec chattr +i (immutable)
PROTECT_FILES=(
    "$INSTALL_DIR/guardian.py"
    "$INSTALL_DIR/blocker_overlay.py"
    "$CHILD_AUTOSTART_DIR/system-monitor.desktop"
)

for f in "${PROTECT_FILES[@]}"; do
    if [ -f "$f" ]; then
        sudo chattr +i "$f" 2>/dev/null && ok "Protégé : $(basename $f)" || warn "Protection impossible : $(basename $f)"
    fi
done

ok "Fichiers protégés (l'enfant ne peut pas les supprimer)"

# ============================================================
# ÉTAPE 9 : Vérification finale
# ============================================================
step "Étape 9/9 — Vérification"

# Tester le serveur
sleep 2
if curl -s "http://localhost:$SERVER_PORT/api/health" | grep -q "ok"; then
    ok "Dashboard accessible ✓"
else
    warn "Dashboard non accessible — vérifiez les logs"
fi

# Récupérer l'IP locale
LOCAL_IP=$(hostname -I | awk '{print $1}')
HOSTNAME_LOCAL=$(hostname)

echo ""
echo -e "${CYAN}╔══════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║${NC}  ${BOLD}🎉 Installation et Scan terminés !${NC}               ${CYAN}║${NC}"
echo -e "${CYAN}╠══════════════════════════════════════════════════════════╣${NC}"
echo -e "${CYAN}║${NC}                                                          ${CYAN}║${NC}"
echo -e "${CYAN}║${NC}  ${BOLD}👤 Session enfant :${NC} ${YELLOW}$CHILD_USER${NC}"
echo -e "${CYAN}║${NC}  ${BOLD}📂 Fichiers       :${NC} $INSTALL_DIR"
echo -e "${CYAN}║${NC}  ${BOLD}🔒 Protection     :${NC} Les fichiers sont verrouillés"
echo -e "${CYAN}║${NC}                                                          ${CYAN}║${NC}"
echo -e "${CYAN}╠══════════════════════════════════════════════════════════╣${NC}"
echo -e "${CYAN}║${NC}                                                          ${CYAN}║${NC}"
echo -e "${CYAN}║${NC}  ${BOLD}📱 Dashboard depuis le téléphone (même WiFi) :${NC}          ${CYAN}║${NC}"
echo -e "${CYAN}║${NC}                                                          ${CYAN}║${NC}"
echo -e "${CYAN}║${NC}     ${BOLD}${YELLOW}http://${LOCAL_IP}:${SERVER_PORT}${NC}"
echo -e "${CYAN}║${NC}     ${YELLOW}http://${HOSTNAME_LOCAL}.local:${SERVER_PORT}${NC}"
echo -e "${CYAN}║${NC}                                                          ${CYAN}║${NC}"
echo -e "${CYAN}╠══════════════════════════════════════════════════════════╣${NC}"
echo -e "${CYAN}║${NC}  ${BOLD}🔧 Commandes utiles (depuis session parent) :${NC}           ${CYAN}║${NC}"
echo -e "${CYAN}║${NC}                                                          ${CYAN}║${NC}"
echo -e "${CYAN}║${NC}  Statut     : sudo systemctl status guardian-dashboard    ${CYAN}║${NC}"
echo -e "${CYAN}║${NC}  Logs       : sudo journalctl -u guardian-dashboard -f    ${CYAN}║${NC}"
echo -e "${CYAN}║${NC}  Redémarrer : sudo systemctl restart guardian-dashboard   ${CYAN}║${NC}"
echo -e "${CYAN}║${NC}  Arrêter    : sudo systemctl stop guardian-dashboard      ${CYAN}║${NC}"
echo -e "${CYAN}║${NC}                                                          ${CYAN}║${NC}"
echo -e "${CYAN}║${NC}  ${BOLD}🗑️  Désinstaller :${NC}                                      ${CYAN}║${NC}"
echo -e "${CYAN}║${NC}  sudo systemctl disable guardian-dashboard                ${CYAN}║${NC}"
echo -e "${CYAN}║${NC}  sudo chattr -i -R $INSTALL_DIR"
echo -e "${CYAN}║${NC}  sudo rm -rf $INSTALL_DIR"
echo -e "${CYAN}║${NC}                                                          ${CYAN}║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${GREEN}${BOLD}📱 Ouvrez sur votre téléphone :  http://${LOCAL_IP}:${SERVER_PORT}${NC}"
echo ""
echo -e "${CYAN}Quand ${CHILD_DISPLAY_NAME} se connectera, Guardian démarrera"
echo -e "automatiquement et en silence. Il ne peut pas l'arrêter. 🛡️${NC}"
echo ""
