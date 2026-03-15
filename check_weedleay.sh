#!/bin/bash
# ============================================================
# 🔍 Guardian — Scan & Monitoring
# ============================================================
# Vérifie si le PC de Weedleay est en ligne et lance le Dashboard.

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'
BOLD='\033[1m'

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BOLD}${CYAN}🛡️  GUARDIAN — Vérification de Weedleay${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

TARGET="weedleay.local"
PORT=3000

# 1. Scan réseau
echo -e "\n${YELLOW}🔎 Scan du réseau pour $TARGET...${NC}"

IS_UP=false

if command -v nmap &>/dev/null; then
    if nmap -sn $TARGET 2>/dev/null | grep -q "Host is up"; then
        IS_UP=true
    fi
fi

if [ "$IS_UP" = false ]; then
    if ping -c 1 -W 2 $TARGET &>/dev/null; then
        IS_UP=true
    fi
fi

if [ "$IS_UP" = true ]; then
    echo -e "${GREEN}✅ PC Weedleay ($TARGET) est BIEN connecté au réseau.${NC}"
else
    echo -e "${RED}❌ PC Weedleay ($TARGET) est INTROUVABLE ou HORS-LIGNE.${NC}"
    echo -e "${YELLOW}Vérifiez que le PC est allumé et sur le même WiFi.${NC}"
    # On continue quand même pour ouvrir le dashboard local au cas où des paquets soient arrivés plus tôt
fi

# 2. Vérification du serveur local
echo -e "\n${YELLOW}🖥️  Vérification du Dashboard local...${NC}"

if systemctl is-active --quiet guardian-dashboard.service; then
    echo -e "${GREEN}✅ Le service Dashboard est déjà en cours d'exécution.${NC}"
else
    echo -e "${CYAN}ℹ️  Le service Dashboard n'est pas lancé. Tentative de démarrage...${NC}"
    sudo systemctl start guardian-dashboard.service 2>/dev/null
    sleep 2
    if systemctl is-active --quiet guardian-dashboard.service; then
        echo -e "${GREEN}✅ Service Dashboard démarré.${NC}"
    else
        echo -e "${RED}❌ Impossible de démarrer le service. Lancement manuel...${NC}"
        # Fallback manuel si systemd échoue
        cd /opt/guardian 2>/dev/null || cd $(dirname "$0")
        if [ -f "server.ts" ]; then
             nohup npm run dev > /tmp/guardian-manual.log 2>&1 &
             sleep 5
        fi
    fi
fi

# 3. Ouverture du Dashboard
LOCAL_IP=$(hostname -I | awk '{print $1}')
URL="http://localhost:$PORT"

echo -e "\n${BLUE}🌐 Ouverture du Dashboard : ${BOLD}${YELLOW}$URL${NC}"

if command -v xdg-open &>/dev/null; then
    xdg-open "$URL"
elif command -v gnome-open &>/dev/null; then
    gnome-open "$URL"
else
    echo -e "${CYAN}Veuillez ouvrir manuellement : ${BOLD}$URL${NC}"
fi

echo -e "\n${GREEN}Terminé. Bonne surveillance ! 🛡️${NC}"
