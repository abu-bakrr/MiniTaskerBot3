#!/bin/bash

# Автоматическая установка Telegram Shop на VPS
# Использование: curl -fsSL https://raw.githubusercontent.com/YOUR_USER/YOUR_REPO/main/auto_deploy.sh | sudo bash

set -e

echo "=================================================="
echo "🚀 Автоматическая установка Telegram Shop"
echo "=================================================="

# Цвета для вывода
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

print_step() {
    echo -e "${GREEN}[STEP]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

# Проверка root
if [ "$EUID" -ne 0 ]; then 
    print_error "Пожалуйста, запустите скрипт с правами root (sudo)"
    exit 1
fi

# Параметры по умолчанию
GITHUB_REPO="${GITHUB_REPO:-}"
GIT_BRANCH="${GIT_BRANCH:-main}"
APP_USER="${APP_USER:-shopapp}"
DB_NAME="${DB_NAME:-shop_db}"
DB_USER="${DB_USER:-shop_user}"
DB_PASSWORD="${DB_PASSWORD:-$(openssl rand -base64 16)}"
APP_PORT="${APP_PORT:-5000}"

echo ""
print_step "Параметры установки:"
echo "  - GitHub репозиторий: ${GITHUB_REPO:-Локальные файлы}"
echo "  - Ветка: $GIT_BRANCH"
echo "  - Пользователь: $APP_USER"
echo "  - База данных: $DB_NAME"
echo "  - Порт: $APP_PORT"
echo "  - Пароль БД: [автогенерирован]"
echo ""

# Установка пакетов
print_step "Обновление системы..."
apt update -qq

print_step "Установка необходимых пакетов..."
DEBIAN_FRONTEND=noninteractive apt install -y -qq \
    python3 python3-pip python3-venv \
    postgresql postgresql-contrib \
    nginx git curl wget \
    > /dev/null 2>&1

# Node.js
if ! command -v node &> /dev/null; then
    print_step "Установка Node.js 20..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - > /dev/null 2>&1
    apt install -y nodejs > /dev/null 2>&1
else
    print_step "Node.js уже установлен: $(node --version)"
fi

# Создание пользователя
print_step "Создание пользователя: $APP_USER"
if id "$APP_USER" &>/dev/null; then
    print_warning "Пользователь $APP_USER уже существует"
else
    useradd -m -s /bin/bash "$APP_USER" 2>/dev/null
    print_step "Пользователь создан"
fi

usermod -a -G www-data "$APP_USER"

# Настройка PostgreSQL
print_step "Настройка PostgreSQL..."
systemctl start postgresql
systemctl enable postgresql > /dev/null 2>&1

sudo -u postgres psql -c "SELECT 1 FROM pg_database WHERE datname = '$DB_NAME'" | grep -q 1 || \
    sudo -u postgres psql -c "CREATE DATABASE $DB_NAME"

sudo -u postgres psql -c "SELECT 1 FROM pg_user WHERE usename = '$DB_USER'" | grep -q 1 || \
    sudo -u postgres psql -c "CREATE USER $DB_USER WITH PASSWORD '$DB_PASSWORD'"

sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER"

# Настройка pg_hba.conf
PG_VERSION=$(ls /etc/postgresql/ | head -n1)
PG_HBA="/etc/postgresql/$PG_VERSION/main/pg_hba.conf"

if ! grep -q "host.*all.*all.*127.0.0.1/32.*md5" "$PG_HBA"; then
    echo "host    all             all             127.0.0.1/32            md5" >> "$PG_HBA"
    systemctl restart postgresql
fi

# Настройка удаленного доступа к PostgreSQL
print_step "Настройка удаленного доступа к PostgreSQL..."
echo ""
echo "⚠️  Удаленный доступ позволит подключаться к БД с другого компьютера"
echo "   (например, для запуска Telegram бота локально)"
echo ""
read -p "Открыть удаленный доступ к PostgreSQL? (yes/no) [no]: " ENABLE_REMOTE_DB
ENABLE_REMOTE_DB=${ENABLE_REMOTE_DB:-no}

if [ "$ENABLE_REMOTE_DB" = "yes" ]; then
    print_step "Настройка PostgreSQL для удаленного доступа..."
    
    # Настройка postgresql.conf
    PG_CONF="/etc/postgresql/$PG_VERSION/main/postgresql.conf"
    
    # Бэкап конфига
    cp "$PG_CONF" "$PG_CONF.backup.$(date +%Y%m%d_%H%M%S)" 2>/dev/null || true
    
    # Разрешаем прослушивание всех адресов
    if grep -q "^listen_addresses" "$PG_CONF"; then
        sed -i "s/^listen_addresses.*/listen_addresses = '*'/" "$PG_CONF"
    else
        echo "listen_addresses = '*'" >> "$PG_CONF"
    fi
    
    # Настройка pg_hba.conf для внешних подключений
    cp "$PG_HBA" "$PG_HBA.backup.$(date +%Y%m%d_%H%M%S)" 2>/dev/null || true
    
    if ! grep -q "# Allow remote connections" "$PG_HBA"; then
        echo "" >> "$PG_HBA"
        echo "# Allow remote connections" >> "$PG_HBA"
        echo "host    all             all             0.0.0.0/0               md5" >> "$PG_HBA"
    fi
    
    # Открываем порт в firewall
    if command -v ufw &> /dev/null; then
        ufw allow 5432/tcp > /dev/null 2>&1
    fi
    
    # Перезапускаем PostgreSQL
    systemctl restart postgresql
    
    print_step "Удаленный доступ к PostgreSQL настроен!"
    VPS_IP=$(hostname -I | awk '{print $1}')
    echo "  📋 Строка подключения:"
    echo "     DATABASE_URL=postgresql://$DB_USER:$DB_PASSWORD@$VPS_IP:5432/$DB_NAME"
else
    print_step "Удаленный доступ к PostgreSQL пропущен"
fi

# Получение кода
APP_DIR="/home/$APP_USER/app"

if [ ! -z "$GITHUB_REPO" ]; then
    print_step "Клонирование из GitHub: $GITHUB_REPO"
    
    if [ -d "$APP_DIR" ]; then
        rm -rf "$APP_DIR"
    fi
    
    sudo -u "$APP_USER" git clone -b "$GIT_BRANCH" "$GITHUB_REPO" "$APP_DIR"
    
    if [ $? -ne 0 ]; then
        print_error "Ошибка клонирования. Проверьте URL: $GITHUB_REPO"
        exit 1
    fi
else
    print_step "Копирование локальных файлов..."
    mkdir -p "$APP_DIR"
    SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
    cp -r "$SCRIPT_DIR"/* "$APP_DIR"/ 2>/dev/null || true
    chown -R "$APP_USER":"$APP_USER" "$APP_DIR"
fi

# Создание .env
print_step "Создание .env файла..."
SESSION_SECRET=$(openssl rand -hex 32)
cat > "$APP_DIR/.env" <<EOF
DATABASE_URL=postgresql://$DB_USER:$DB_PASSWORD@localhost:5432/$DB_NAME
PORT=$APP_PORT
FLASK_ENV=production
SESSION_SECRET=$SESSION_SECRET
EOF

chown "$APP_USER":"$APP_USER" "$APP_DIR/.env"
chmod 600 "$APP_DIR/.env"

# Сборка приложения
print_step "Установка зависимостей и сборка..."
cd "$APP_DIR"

# Node.js (используем полный путь к npm)
sudo -u "$APP_USER" bash -c "cd $APP_DIR && /usr/bin/npm install --quiet" 2>/dev/null || \
    sudo -u "$APP_USER" bash -c "cd $APP_DIR && npm install --quiet" || print_error "npm install не удалось выполнить"
sudo -u "$APP_USER" bash -c "cd $APP_DIR && /usr/bin/npm run build" 2>/dev/null || \
    sudo -u "$APP_USER" bash -c "cd $APP_DIR && npm run build" || print_error "npm run build не удалось выполнить"

# Python
sudo -u "$APP_USER" bash -c "cd $APP_DIR && python3 -m venv venv"
sudo -u "$APP_USER" bash -c "cd $APP_DIR && source venv/bin/activate && pip install --quiet --upgrade pip && pip install --quiet -r requirements.txt" 2>/dev/null

# Инициализация таблиц базы данных
print_step "Инициализация таблиц базы данных..."
sudo -u "$APP_USER" bash <<EOF
cd $APP_DIR
source venv/bin/activate
python3 init_tables.py
EOF

if [ $? -eq 0 ]; then
    print_step "Таблицы базы данных успешно созданы!"
else
    print_warning "Ошибка при инициализации таблиц. Возможно, они уже существуют."
fi

# Права доступа
print_step "Настройка прав доступа..."
chmod 755 /home/"$APP_USER"
chmod 755 "$APP_DIR"

if [ -d "$APP_DIR/dist" ]; then
    chown -R "$APP_USER":www-data "$APP_DIR/dist"
    chmod -R 755 "$APP_DIR/dist"
fi

if [ -d "$APP_DIR/config" ]; then
    chown -R "$APP_USER":www-data "$APP_DIR/config"
    chmod -R 755 "$APP_DIR/config"
fi

# Systemd сервис
print_step "Создание systemd сервиса..."
cat > /etc/systemd/system/shop-app.service <<EOF
[Unit]
Description=Telegram Shop Flask Application
After=network.target postgresql.service

[Service]
Type=simple
User=$APP_USER
WorkingDirectory=$APP_DIR
Environment="PATH=$APP_DIR/venv/bin"
EnvironmentFile=$APP_DIR/.env
ExecStart=$APP_DIR/venv/bin/gunicorn app:app --bind 127.0.0.1:$APP_PORT --workers 4 --timeout 120
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable shop-app > /dev/null 2>&1
systemctl start shop-app

sleep 3

if systemctl is-active --quiet shop-app; then
    print_step "Приложение запущено!"
else
    print_error "Ошибка запуска. Логи: journalctl -u shop-app -n 50"
    exit 1
fi

# Nginx
print_step "Настройка Nginx..."
cat > /etc/nginx/sites-available/shop <<EOF
server {
    listen 80;
    server_name _;

    client_max_body_size 20M;

    location /assets {
        alias $APP_DIR/dist/public/assets;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    location /config {
        alias $APP_DIR/config;
        expires 1h;
        add_header Cache-Control "public";
    }

    location / {
        proxy_pass http://127.0.0.1:$APP_PORT;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        
        proxy_connect_timeout 120s;
        proxy_send_timeout 120s;
        proxy_read_timeout 120s;
    }
}
EOF

ln -sf /etc/nginx/sites-available/shop /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

nginx -t && systemctl restart nginx

# Firewall
if command -v ufw &> /dev/null; then
    print_step "Настройка Firewall..."
    ufw allow ssh > /dev/null 2>&1
    ufw allow http > /dev/null 2>&1
    ufw allow https > /dev/null 2>&1
    echo "y" | ufw enable > /dev/null 2>&1
fi

# Тестовые данные (опционально)
if [ "$LOAD_SEED_DATA" = "yes" ]; then
    print_step "Загрузка тестовых данных..."
    sudo -u "$APP_USER" bash -c "cd $APP_DIR && source venv/bin/activate && python3 seed_db.py" 2>/dev/null || true
fi

# Итог
echo ""
echo "=================================================="
echo -e "${GREEN}✅ Установка завершена успешно!${NC}"
echo "=================================================="
echo ""
echo "📋 Информация:"
echo "  - URL: http://$(hostname -I | awk '{print $1}')"
echo "  - Пользователь: $APP_USER"
echo "  - Директория: $APP_DIR"
echo "  - База данных: $DB_NAME"
echo "  - Порт: $APP_PORT"
echo ""
echo "🔧 Команды:"
echo "  - Статус: systemctl status shop-app"
echo "  - Логи: journalctl -u shop-app -f"
echo "  - Рестарт: systemctl restart shop-app"
echo ""
echo "🔑 Пароль БД сохранён в: $APP_DIR/.env"
echo ""
