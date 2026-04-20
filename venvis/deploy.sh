#!/bin/bash
# Deploy VENVIS al VPS
# Uso: bash deploy.sh
# Prerequisito: SSH key configurada para root@31.97.21.155

VPS="root@31.97.21.155"
REMOTE_DIR="/var/www/venvis"
LOCAL_DIR="$(dirname "$0")"

echo "→ Sincronizando archivos..."
rsync -avz --exclude='node_modules' --exclude='.env' --exclude='venvis.db' \
  "$LOCAL_DIR/" "$VPS:$REMOTE_DIR/"

echo "→ Instalando dependencias en el VPS..."
ssh "$VPS" "cd $REMOTE_DIR && npm install --omit=dev"

echo "→ Reiniciando VENVIS con PM2..."
ssh "$VPS" "cd $REMOTE_DIR && pm2 restart venvis 2>/dev/null || pm2 start server/index.mjs --name venvis"

echo "→ Verificando..."
sleep 2
ssh "$VPS" "pm2 show venvis | grep -E '(status|restarts)'"

echo "✓ Deploy completo — https://venvis.orvexautomation.com"
