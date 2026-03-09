#!/bin/bash
# ============================================================
# 🛡️ Guardian — Script de déploiement automatique
# ============================================================
# Ce script installe TOUT le nécessaire sur le PC de l'enfant
# et démarre le serveur dashboard accessible depuis le WiFi.
#
# USAGE :
#   Sur le PC de l'enfant (Ubuntu) :
#     curl -sL https://raw.githubusercontent.com/mastonic/control-parental/main/deploy.sh | bash
#   OU :
#     git clone https://github.com/mastonic/control-parental.git
#     cd control-parental && chmod +x deploy.sh && ./deploy.sh
#
# ACCÈS DASHBOARD :
#   - Depuis le même WiFi : http://<IP_DU_PC>:3000
#   - Depuis mobile : même URL dans le navigateur du téléphone
# ============================================================

set -e

# Couleurs
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'
BOLD='\033[1m'

print_banner() {
    echo -e "${CYAN}"
    echo "╔══════════════════════════════════════════════════╗"
    echo "║   🛡️  Guardian — Contrôle Parental Ubuntu       ║"
    echo "║   Script de déploiement automatique             ║"
    echo "╚══════════════════════════════════════════════════╝"
    echo -e "${NC}"
}

step() {
    echo -e "\n${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BOLD}${GREEN}▶ $1${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

warn() {
    echo -e "${YELLOW}  ⚠️  $1${NC}"
}

ok() {
    echo -e "${GREEN}  ✅ $1${NC}"
}

fail() {
    echo -e "${RED}  ❌ $1${NC}"
}

info() {
    echo -e "${CYAN}  ℹ️  $1${NC}"
}

# ============================================================

print_banner

INSTALL_DIR="$HOME/control-parental"

# ============================================================
# ÉTAPE 1 : Dépendances système
# ============================================================
step "Étape 1/7 — Installation des dépendances système"

sudo apt update -qq 2>/dev/null

PACKAGES="xdotool gnome-screenshot zenity python3-requests python3-tk git curl"
for pkg in $PACKAGES; do
    if dpkg -l "$pkg" &>/dev/null; then
        ok "$pkg déjà installé"
    else
        info "Installation de $pkg..."
        sudo apt install -y -qq "$pkg" 2>/dev/null && ok "$pkg installé" || warn "$pkg non disponible (optionnel)"
    fi
done

# ============================================================
# ÉTAPE 2 : Node.js
# ============================================================
step "Étape 2/7 — Vérification de Node.js"

if command -v node &>/dev/null; then
    NODE_VERSION=$(node --version)
    ok "Node.js $NODE_VERSION déjà installé"
else
    info "Installation de Node.js via nvm..."
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
    
    export NVM_DIR="$HOME/.nvm"
    [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
    
    nvm install --lts
    nvm use --lts
    ok "Node.js $(node --version) installé"
fi

# S'assurer que npm est dans le PATH
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh" 2>/dev/null

# ============================================================
# ÉTAPE 3 : Cloner / Mettre à jour le projet
# ============================================================
step "Étape 3/7 — Récupération du projet"

if [ -d "$INSTALL_DIR/.git" ]; then
    info "Projet existant, mise à jour..."
    cd "$INSTALL_DIR"
    git pull origin main 2>/dev/null && ok "Projet mis à jour" || warn "Impossible de mettre à jour (modifications locales ?)"
else
    if [ -d "$INSTALL_DIR" ]; then
        warn "Dossier existant sans git, sauvegarde..."
        mv "$INSTALL_DIR" "${INSTALL_DIR}.backup.$(date +%s)"
    fi
    info "Clonage du projet..."
    git clone https://github.com/mastonic/control-parental.git "$INSTALL_DIR"
    cd "$INSTALL_DIR"
    ok "Projet cloné dans $INSTALL_DIR"
fi

cd "$INSTALL_DIR"

# ============================================================
# ÉTAPE 4 : Installation des dépendances Node.js
# ============================================================
step "Étape 4/7 — Installation des dépendances Node.js"

npm install --silent 2>/dev/null
ok "Dépendances installées ($(ls node_modules | wc -l) packages)"

# ============================================================
# ÉTAPE 5 : Configuration du fichier .env
# ============================================================
step "Étape 5/7 — Configuration"

if [ ! -f ".env" ]; then
    if [ -f ".env.example" ]; then
        cp .env.example .env
        ok "Fichier .env créé depuis .env.example"
    else
        echo "# Guardian Config" > .env
        ok "Fichier .env créé"
    fi
else
    ok "Fichier .env existant conservé"
fi

# ============================================================
# ÉTAPE 6 : Installation de l'agent Guardian (auto-start)
# ============================================================
step "Étape 6/7 — Installation de l'agent Guardian"

python3 guardian.py --install
ok "Agent Guardian configuré en démarrage automatique"

# ============================================================
# ÉTAPE 7 : Démarrage du serveur Dashboard
# ============================================================
step "Étape 7/7 — Démarrage du serveur Dashboard"

# Tuer les anciens processus sur le port 3000
fuser -k 3000/tcp 2>/dev/null || true
sleep 1

# Démarrer le serveur en arrière-plan
nohup npm run dev > /tmp/guardian-server.log 2>&1 &
SERVER_PID=$!
sleep 3

# Vérifier que le serveur a démarré
if kill -0 $SERVER_PID 2>/dev/null; then
    ok "Serveur Dashboard démarré (PID: $SERVER_PID)"
else
    fail "Échec du démarrage du serveur"
    echo "  Consultez les logs : cat /tmp/guardian-server.log"
fi

# Démarrer l'agent Guardian en arrière-plan
nohup python3 guardian.py > /tmp/guardian-agent.log 2>&1 &
AGENT_PID=$!
sleep 2

if kill -0 $AGENT_PID 2>/dev/null; then
    ok "Agent Guardian démarré (PID: $AGENT_PID)"
else
    warn "L'agent n'a pas pu démarrer (sera actif au prochain login)"
fi

# ============================================================
# RÉSUMÉ FINAL
# ============================================================

# Récupérer l'IP locale
LOCAL_IP=$(hostname -I | awk '{print $1}')
HOSTNAME=$(hostname)

echo ""
echo -e "${CYAN}╔══════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║${NC}  ${BOLD}${GREEN}🎉 Installation terminée !${NC}                       ${CYAN}║${NC}"
echo -e "${CYAN}╠══════════════════════════════════════════════════╣${NC}"
echo -e "${CYAN}║${NC}                                                  ${CYAN}║${NC}"
echo -e "${CYAN}║${NC}  ${BOLD}📱 Accès Dashboard depuis le mobile :${NC}            ${CYAN}║${NC}"
echo -e "${CYAN}║${NC}                                                  ${CYAN}║${NC}"
echo -e "${CYAN}║${NC}  ${YELLOW}http://${LOCAL_IP}:3000${NC}"
echo -e "${CYAN}║${NC}  ${YELLOW}http://${HOSTNAME}.local:3000${NC}"
echo -e "${CYAN}║${NC}                                                  ${CYAN}║${NC}"
echo -e "${CYAN}║${NC}  ${BOLD}🌐 Accès Cloud (partout) :${NC}                       ${CYAN}║${NC}"
echo -e "${CYAN}║${NC}  ${YELLOW}Déployez sur Google Cloud Run${NC}                     ${CYAN}║${NC}"
echo -e "${CYAN}║${NC}                                                  ${CYAN}║${NC}"
echo -e "${CYAN}╠══════════════════════════════════════════════════╣${NC}"
echo -e "${CYAN}║${NC}  ${BOLD}📋 Commandes utiles :${NC}                             ${CYAN}║${NC}"
echo -e "${CYAN}║${NC}                                                  ${CYAN}║${NC}"
echo -e "${CYAN}║${NC}  Logs serveur : tail -f /tmp/guardian-server.log  ${CYAN}║${NC}"
echo -e "${CYAN}║${NC}  Logs agent   : tail -f /tmp/guardian-agent.log   ${CYAN}║${NC}"
echo -e "${CYAN}║${NC}  Test agent   : python3 guardian.py --test        ${CYAN}║${NC}"
echo -e "${CYAN}║${NC}  Stopper      : kill $SERVER_PID $AGENT_PID"
echo -e "${CYAN}║${NC}                                                  ${CYAN}║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${GREEN}${BOLD}👉 Ouvrez cette URL sur votre téléphone :${NC}"
echo -e "${BOLD}${YELLOW}   http://${LOCAL_IP}:3000${NC}"
echo ""
echo -e "${CYAN}ℹ️  Le serveur et l'agent se relanceront automatiquement${NC}"
echo -e "${CYAN}   au prochain démarrage du PC.${NC}"

# Créer un script de démarrage rapide pour le serveur (cron @reboot)
STARTUP_SCRIPT="$INSTALL_DIR/start-guardian.sh"
cat > "$STARTUP_SCRIPT" << 'STARTEOF'
#!/bin/bash
# Guardian — Script de démarrage rapide
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

cd ~/control-parental

# Démarrer le serveur si pas déjà en cours
if ! fuser 3000/tcp &>/dev/null; then
    nohup npm run dev > /tmp/guardian-server.log 2>&1 &
fi

# Démarrer l'agent si pas déjà en cours
if ! pgrep -f "guardian.py" &>/dev/null; then
    sleep 5
    nohup python3 guardian.py > /tmp/guardian-agent.log 2>&1 &
fi
STARTEOF
chmod +x "$STARTUP_SCRIPT"

# Ajouter à crontab @reboot si pas déjà présent
(crontab -l 2>/dev/null | grep -v "start-guardian.sh"; echo "@reboot $STARTUP_SCRIPT") | crontab -
ok "Démarrage automatique configuré (cron @reboot)"

echo ""
echo -e "${GREEN}${BOLD}✅ Tout est prêt ! Weedleay est surveillé. 🛡️${NC}"
