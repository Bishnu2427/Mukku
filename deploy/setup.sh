#!/usr/bin/env bash
# =============================================================================
# Mukku AI Studio — Oracle Cloud ARM (Ubuntu 22.04 / aarch64) Setup Script
# Run as: bash setup.sh
# =============================================================================
set -euo pipefail

APP_DIR="/opt/mukku"
APP_USER="mukku"
PYTHON="python3"

echo "==> [1/8] System packages"
sudo apt-get update -qq
sudo apt-get install -y --no-install-recommends \
    python3 python3-pip python3-venv \
    ffmpeg \
    espeak espeak-data \
    git curl wget \
    build-essential libssl-dev

echo "==> [2/8] Create app user"
id -u "$APP_USER" &>/dev/null || sudo useradd -r -s /bin/bash -d "$APP_DIR" "$APP_USER"

echo "==> [3/8] Clone / copy app"
if [ ! -d "$APP_DIR" ]; then
    sudo mkdir -p "$APP_DIR"
    sudo chown "$APP_USER:$APP_USER" "$APP_DIR"
    echo "    Copy your project files to $APP_DIR or run:"
    echo "    git clone <your-repo-url> $APP_DIR"
else
    echo "    $APP_DIR already exists — skipping"
fi

echo "==> [4/8] Python virtual environment"
sudo -u "$APP_USER" bash -c "
    cd $APP_DIR
    $PYTHON -m venv venv
    source venv/bin/activate

    pip install --upgrade pip wheel

    # ARM CPU-only PyTorch (no CUDA on Oracle Ampere free tier)
    pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu

    pip install -r requirements.txt
    pip install gunicorn
"

echo "==> [5/8] Install Ollama"
if ! command -v ollama &>/dev/null; then
    curl -fsSL https://ollama.com/install.sh | sh
    sudo systemctl enable ollama
    sudo systemctl start ollama
    sleep 5
    ollama pull llama3
else
    echo "    Ollama already installed"
fi

echo "==> [6/8] Media directories"
sudo -u "$APP_USER" bash -c "
    mkdir -p $APP_DIR/media/{images,clips,audio,music,videos,thumbs,uploads}
"

echo "==> [7/8] Systemd service"
sudo cp "$APP_DIR/deploy/mukku.service" /etc/systemd/system/mukku.service
sudo systemctl daemon-reload
sudo systemctl enable mukku

echo "==> [8/8] Cron job for media cleanup (daily at 3 AM)"
CRON_JOB="0 3 * * * $APP_USER $APP_DIR/venv/bin/python $APP_DIR/cleanup_media.py >> /var/log/mukku-cleanup.log 2>&1"
(sudo crontab -l 2>/dev/null | grep -v cleanup_media; echo "$CRON_JOB") | sudo crontab -

echo ""
echo "============================================================"
echo " Setup complete!"
echo ""
echo " Next steps:"
echo "   1. Copy your .env file to $APP_DIR/.env"
echo "   2. Edit $APP_DIR/.env — set JWT_SECRET, MONGO_URI, SMTP_*, APP_URL"
echo "   3. sudo systemctl start mukku"
echo "   4. sudo systemctl status mukku"
echo "   5. App will be available at http://<your-ip>:7000"
echo ""
echo " View logs:  sudo journalctl -u mukku -f"
echo "============================================================"
