#!/bin/bash
# ==============================================
# HalaChat - Deploy Script
# Run this AFTER setup-server.sh
# Run from: /var/www/halachat
# ==============================================

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_step() {
    echo -e "\n${BLUE}[STEP]${NC} $1"
    echo "=============================================="
}

print_success() {
    echo -e "${GREEN}[OK]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

APP_DIR="/var/www/halachat"
DOMAIN="halachat.khalafiati.io"

echo "=============================================="
echo "   HalaChat - Deploying Application"
echo "=============================================="

# ------------------------------------------
# 1. Setup Backend Environment
# ------------------------------------------
print_step "1/6 - Setting up Backend environment..."
if [ ! -f "$APP_DIR/backend/.env" ]; then
    cp $APP_DIR/deploy/env.production $APP_DIR/backend/.env
    print_success "Backend .env created"
    print_warning "IMPORTANT: Edit $APP_DIR/backend/.env and change JWT_SECRET!"
else
    print_warning "Backend .env already exists, skipping"
fi

# ------------------------------------------
# 2. Setup Frontend Environment
# ------------------------------------------
print_step "2/6 - Setting up Frontend environment..."
cp $APP_DIR/deploy/env.frontend $APP_DIR/frontend/.env
print_success "Frontend .env created"

# ------------------------------------------
# 3. Install Backend Dependencies
# ------------------------------------------
print_step "3/6 - Installing Backend dependencies..."
cd $APP_DIR/backend
npm install --production
print_success "Backend dependencies installed"

# ------------------------------------------
# 4. Install Frontend Dependencies & Build
# ------------------------------------------
print_step "4/6 - Building Frontend (this may take a few minutes)..."
cd $APP_DIR/frontend
npm install
npm run build
print_success "Frontend built successfully"

# ------------------------------------------
# 5. Setup Nginx
# ------------------------------------------
print_step "5/6 - Configuring Nginx..."
cp $APP_DIR/deploy/nginx-halachat.conf /etc/nginx/sites-available/halachat
ln -sf /etc/nginx/sites-available/halachat /etc/nginx/sites-enabled/halachat

# Remove default site if exists
rm -f /etc/nginx/sites-enabled/default 2>/dev/null || true

# Test and reload
nginx -t
systemctl reload nginx
print_success "Nginx configured"

# ------------------------------------------
# 6. Start/Restart Backend with PM2
# ------------------------------------------
print_step "6/6 - Starting Backend with PM2..."
cd $APP_DIR

# Create log directory
mkdir -p /var/log/halachat

# Stop existing if running
pm2 delete halachat-api 2>/dev/null || true

# Start with ecosystem config
pm2 start deploy/ecosystem.config.js

# Save PM2 process list for auto-restart on reboot
pm2 save

# Setup PM2 startup script
pm2 startup systemd -u root --hp /root 2>/dev/null || true

print_success "Backend started with PM2"

# ------------------------------------------
# Create uploads directory
# ------------------------------------------
mkdir -p $APP_DIR/backend/uploads
chmod 755 $APP_DIR/backend/uploads

# ------------------------------------------
# Summary
# ------------------------------------------
echo ""
echo "=============================================="
echo -e "${GREEN}   Deployment Complete!${NC}"
echo "=============================================="
echo ""
echo "   Frontend: http://$DOMAIN"
echo "   API:      http://$DOMAIN/api"
echo "   Health:   http://$DOMAIN/api/health"
echo ""
echo "   PM2 Status: pm2 status"
echo "   PM2 Logs:   pm2 logs halachat-api"
echo "   PM2 Monitor: pm2 monit"
echo ""
echo "   For SSL (after DNS is set):"
echo "   certbot --nginx -d $DOMAIN"
echo ""
echo "=============================================="

# Show PM2 status
pm2 status
