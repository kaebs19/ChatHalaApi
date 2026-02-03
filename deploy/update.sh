#!/bin/bash
# ==============================================
# HalaChat - Update Script
# Use this to update after code changes
# Run from: /var/www/halachat
# ==============================================

set -e

GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

APP_DIR="/var/www/halachat"

echo -e "${BLUE}[UPDATE]${NC} Updating HalaChat..."

# Update Backend
echo -e "${BLUE}[1/4]${NC} Installing backend dependencies..."
cd $APP_DIR/backend
npm install --production

# Update Frontend
echo -e "${BLUE}[2/4]${NC} Building frontend..."
cd $APP_DIR/frontend
npm install
npm run build

# Restart Backend
echo -e "${BLUE}[3/4]${NC} Restarting backend..."
pm2 restart halachat-api

# Reload Nginx
echo -e "${BLUE}[4/4]${NC} Reloading Nginx..."
nginx -t && systemctl reload nginx

echo -e "${GREEN}[DONE]${NC} Update complete!"
pm2 status
