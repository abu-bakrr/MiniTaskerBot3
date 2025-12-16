from flask import Flask, jsonify, request, send_from_directory, Blueprint, session
import psycopg2
from psycopg2.extras import RealDictCursor
import os
import json
import base64
import hashlib
import requests
import re
import secrets
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import datetime, timedelta
from werkzeug.security import generate_password_hash, check_password_hash
import cloudinary
import cloudinary.uploader
import cloudinary.api
from cryptography.fernet import Fernet

app = Flask(__name__, static_folder='dist/public', static_url_path='/static')
app.secret_key = os.environ.get("SESSION_SECRET")
app.config['PERMANENT_SESSION_LIFETIME'] = timedelta(days=30)

# Encryption for sensitive settings
def get_encryption_key():
    key = os.environ.get("SETTINGS_ENCRYPTION_KEY")
    if not key:
        key = os.environ.get("SESSION_SECRET", "default-key-change-me")
    key_bytes = hashlib.sha256(key.encode()).digest()
    return base64.urlsafe_b64encode(key_bytes)

def encrypt_value(value):
    if not value:
        return None
    f = Fernet(get_encryption_key())
    return f.encrypt(value.encode()).decode()

def decrypt_value(encrypted_value):
    if not encrypted_value:
        return None
    try:
        f = Fernet(get_encryption_key())
        return f.decrypt(encrypted_value.encode()).decode()
    except Exception:
        return None

# Create API Blueprint with /api prefix for Render deployment
api = Blueprint('api', __name__, url_prefix='/api')


# Database connection
def get_db_connection():
    # Use DATABASE_URL if available, otherwise build from individual vars
    database_url = os.getenv('DATABASE_URL')
    
    # Debug: print connection info on first call
    if not hasattr(get_db_connection, '_debug_printed'):
        get_db_connection._debug_printed = True
        print(f"Database connection mode: {'DATABASE_URL' if database_url else 'Individual vars'}")
        if not database_url:
            print(f"PGHOST: {os.getenv('PGHOST', 'NOT SET')}")
    
    if database_url:
        # Check if this is a remote Neon database (contains neon.tech)
        # Local PostgreSQL on VPS doesn't need sslmode
        if 'neon.tech' in database_url or 'amazonaws.com' in database_url:
            if 'sslmode=' not in database_url:
                database_url = database_url + ('&' if '?' in database_url else '?') + 'sslmode=require'
        conn = psycopg2.connect(database_url, cursor_factory=RealDictCursor)
    else:
        # Build connection from individual PostgreSQL environment variables
        conn = psycopg2.connect(
            host=os.getenv('PGHOST', 'localhost'),
            port=os.getenv('PGPORT', '5432'),
            user=os.getenv('PGUSER'),
            password=os.getenv('PGPASSWORD'),
            database=os.getenv('PGDATABASE'),
            cursor_factory=RealDictCursor
        )
    return conn

# Initialize database tables
def init_db():
    conn = get_db_connection()
    cur = conn.cursor()
    
    # Enable pgcrypto extension for gen_random_uuid()
    cur.execute('CREATE EXTENSION IF NOT EXISTS pgcrypto')
    
    # Create products table
    cur.execute('''
        CREATE TABLE IF NOT EXISTS products (
            id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
            name TEXT NOT NULL,
            description TEXT,
            price INTEGER NOT NULL,
            images TEXT[] NOT NULL,
            category_id TEXT,
            colors TEXT[],
            attributes JSONB
        )
    ''')
    
    # Add new columns to existing products table if they don't exist
    cur.execute('''
        DO $$ 
        BEGIN 
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                          WHERE table_name='products' AND column_name='colors') THEN
                ALTER TABLE products ADD COLUMN colors TEXT[];
            END IF;
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                          WHERE table_name='products' AND column_name='attributes') THEN
                ALTER TABLE products ADD COLUMN attributes JSONB;
            END IF;
        END $$;
    ''')
    
    # Create users table if not exists
    cur.execute('''
        CREATE TABLE IF NOT EXISTS users (
            id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
            username TEXT,
            password TEXT,
            telegram_id BIGINT UNIQUE,
            first_name TEXT,
            last_name TEXT,
            email TEXT UNIQUE,
            password_hash TEXT,
            phone TEXT,
            telegram_username TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    # Add new columns to existing users table if they don't exist
    cur.execute('''
        DO $$ 
        BEGIN 
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                          WHERE table_name='users' AND column_name='email') THEN
                ALTER TABLE users ADD COLUMN email TEXT UNIQUE;
            END IF;
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                          WHERE table_name='users' AND column_name='password_hash') THEN
                ALTER TABLE users ADD COLUMN password_hash TEXT;
            END IF;
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                          WHERE table_name='users' AND column_name='phone') THEN
                ALTER TABLE users ADD COLUMN phone TEXT;
            END IF;
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                          WHERE table_name='users' AND column_name='telegram_username') THEN
                ALTER TABLE users ADD COLUMN telegram_username TEXT;
            END IF;
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                          WHERE table_name='users' AND column_name='created_at') THEN
                ALTER TABLE users ADD COLUMN created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
            END IF;
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                          WHERE table_name='users' AND column_name='is_admin') THEN
                ALTER TABLE users ADD COLUMN is_admin BOOLEAN DEFAULT FALSE;
            END IF;
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                          WHERE table_name='users' AND column_name='is_superadmin') THEN
                ALTER TABLE users ADD COLUMN is_superadmin BOOLEAN DEFAULT FALSE;
            END IF;
        END $$;
    ''')
    
    # Create password_reset_tokens table
    cur.execute('''
        CREATE TABLE IF NOT EXISTS password_reset_tokens (
            id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id VARCHAR REFERENCES users(id) ON DELETE CASCADE,
            token VARCHAR(64) UNIQUE NOT NULL,
            expires_at TIMESTAMP NOT NULL,
            used BOOLEAN DEFAULT FALSE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    # Create categories table
    cur.execute('''
        CREATE TABLE IF NOT EXISTS categories (
            id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
            name TEXT NOT NULL,
            icon TEXT,
            sort_order INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    # Create favorites table (many-to-many: users <-> products)
    cur.execute('''
        CREATE TABLE IF NOT EXISTS favorites (
            id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id VARCHAR REFERENCES users(id) ON DELETE CASCADE,
            product_id VARCHAR REFERENCES products(id) ON DELETE CASCADE,
            UNIQUE(user_id, product_id)
        )
    ''')
    
    # Create cart table
    cur.execute('''
        CREATE TABLE IF NOT EXISTS cart (
            id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id VARCHAR REFERENCES users(id) ON DELETE CASCADE,
            product_id VARCHAR REFERENCES products(id) ON DELETE CASCADE,
            quantity INTEGER NOT NULL DEFAULT 1,
            selected_color TEXT,
            selected_attributes JSONB
        )
    ''')
    
    # Drop old unique constraint and add new columns to cart if they don't exist
    cur.execute('''
        DO $$ 
        BEGIN 
            IF EXISTS (SELECT 1 FROM information_schema.table_constraints 
                      WHERE table_name='cart' AND constraint_name='cart_user_id_product_id_key') THEN
                ALTER TABLE cart DROP CONSTRAINT cart_user_id_product_id_key;
            END IF;
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                          WHERE table_name='cart' AND column_name='selected_color') THEN
                ALTER TABLE cart ADD COLUMN selected_color TEXT;
            END IF;
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                          WHERE table_name='cart' AND column_name='selected_attributes') THEN
                ALTER TABLE cart ADD COLUMN selected_attributes JSONB;
            END IF;
        END $$;
    ''')
    
    # Create orders table
    cur.execute('''
        CREATE TABLE IF NOT EXISTS orders (
            id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id VARCHAR REFERENCES users(id) ON DELETE CASCADE,
            total INTEGER NOT NULL,
            status TEXT DEFAULT 'pending',
            payment_method TEXT,
            payment_status TEXT DEFAULT 'pending',
            payment_id TEXT,
            delivery_address TEXT,
            delivery_lat DOUBLE PRECISION,
            delivery_lng DOUBLE PRECISION,
            customer_phone TEXT,
            customer_name TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    # Add new columns to orders table if they don't exist
    cur.execute('''
        DO $$ 
        BEGIN 
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                          WHERE table_name='orders' AND column_name='payment_method') THEN
                ALTER TABLE orders ADD COLUMN payment_method TEXT;
            END IF;
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                          WHERE table_name='orders' AND column_name='payment_status') THEN
                ALTER TABLE orders ADD COLUMN payment_status TEXT DEFAULT 'pending';
            END IF;
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                          WHERE table_name='orders' AND column_name='payment_id') THEN
                ALTER TABLE orders ADD COLUMN payment_id TEXT;
            END IF;
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                          WHERE table_name='orders' AND column_name='delivery_address') THEN
                ALTER TABLE orders ADD COLUMN delivery_address TEXT;
            END IF;
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                          WHERE table_name='orders' AND column_name='delivery_lat') THEN
                ALTER TABLE orders ADD COLUMN delivery_lat DOUBLE PRECISION;
            END IF;
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                          WHERE table_name='orders' AND column_name='delivery_lng') THEN
                ALTER TABLE orders ADD COLUMN delivery_lng DOUBLE PRECISION;
            END IF;
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                          WHERE table_name='orders' AND column_name='customer_phone') THEN
                ALTER TABLE orders ADD COLUMN customer_phone TEXT;
            END IF;
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                          WHERE table_name='orders' AND column_name='customer_name') THEN
                ALTER TABLE orders ADD COLUMN customer_name TEXT;
            END IF;
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                          WHERE table_name='orders' AND column_name='payment_receipt_url') THEN
                ALTER TABLE orders ADD COLUMN payment_receipt_url TEXT;
            END IF;
        END $$;
    ''')
    
    # Create order_items table
    cur.execute('''
        CREATE TABLE IF NOT EXISTS order_items (
            id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
            order_id VARCHAR REFERENCES orders(id) ON DELETE CASCADE,
            product_id VARCHAR REFERENCES products(id) ON DELETE SET NULL,
            name TEXT NOT NULL,
            price INTEGER NOT NULL,
            quantity INTEGER NOT NULL,
            selected_color TEXT,
            selected_attributes JSONB
        )
    ''')
    
    # Create platform_settings table for storing encrypted settings
    cur.execute('''
        CREATE TABLE IF NOT EXISTS platform_settings (
            key VARCHAR PRIMARY KEY,
            value TEXT,
            is_secret BOOLEAN DEFAULT FALSE,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    # Create product_inventory table for tracking stock by product combination
    cur.execute('''
        CREATE TABLE IF NOT EXISTS product_inventory (
            id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
            product_id VARCHAR REFERENCES products(id) ON DELETE CASCADE,
            color TEXT,
            attribute1_value TEXT,
            attribute2_value TEXT,
            quantity INTEGER NOT NULL DEFAULT 0,
            backorder_lead_time_days INTEGER,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(product_id, color, attribute1_value, attribute2_value)
        )
    ''')
    
    # Add new columns to orders table for backorder tracking and delivery estimation
    cur.execute('''
        DO $$ 
        BEGIN 
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                          WHERE table_name='orders' AND column_name='has_backorder') THEN
                ALTER TABLE orders ADD COLUMN has_backorder BOOLEAN DEFAULT FALSE;
            END IF;
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                          WHERE table_name='orders' AND column_name='backorder_delivery_date') THEN
                ALTER TABLE orders ADD COLUMN backorder_delivery_date TIMESTAMP;
            END IF;
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                          WHERE table_name='orders' AND column_name='estimated_delivery_days') THEN
                ALTER TABLE orders ADD COLUMN estimated_delivery_days INTEGER;
            END IF;
        END $$;
    ''')
    
    # Add new columns to order_items table for stock status tracking
    cur.execute('''
        DO $$ 
        BEGIN 
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                          WHERE table_name='order_items' AND column_name='availability_status') THEN
                ALTER TABLE order_items ADD COLUMN availability_status TEXT DEFAULT 'in_stock';
            END IF;
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                          WHERE table_name='order_items' AND column_name='backorder_lead_time_days') THEN
                ALTER TABLE order_items ADD COLUMN backorder_lead_time_days INTEGER;
            END IF;
        END $$;
    ''')
    
    conn.commit()
    cur.close()
    conn.close()

# Helper functions for platform settings
def get_platform_setting(key):
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute('SELECT value, is_secret FROM platform_settings WHERE key = %s', (key,))
        result = cur.fetchone()
        cur.close()
        conn.close()
        if result:
            if result['is_secret']:
                decrypted = decrypt_value(result['value'])
                if decrypted is None:
                    print(f"⚠️ Warning: Failed to decrypt setting '{key}'")
                return decrypted
            return result['value']
        return None
    except Exception as e:
        print(f"❌ Error getting platform setting '{key}': {e}")
        return None

def set_platform_setting(key, value, is_secret=False):
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        stored_value = encrypt_value(value) if is_secret and value else value
        cur.execute('''
            INSERT INTO platform_settings (key, value, is_secret, updated_at)
            VALUES (%s, %s, %s, CURRENT_TIMESTAMP)
            ON CONFLICT (key) DO UPDATE SET 
                value = EXCLUDED.value,
                is_secret = EXCLUDED.is_secret,
                updated_at = CURRENT_TIMESTAMP
        ''', (key, stored_value, is_secret))
        conn.commit()
        cur.close()
        conn.close()
        return True
    except Exception:
        return False

def get_cloudinary_config():
    cloud_name = get_platform_setting('cloudinary_cloud_name')
    api_key = get_platform_setting('cloudinary_api_key')
    api_secret = get_platform_setting('cloudinary_api_secret')
    
    if not cloud_name:
        cloud_name = os.getenv('CLOUDINARY_CLOUD_NAME')
    if not api_key:
        api_key = os.getenv('CLOUDINARY_API_KEY')
    if not api_secret:
        api_secret = os.getenv('CLOUDINARY_API_SECRET')
    
    return {
        'cloud_name': cloud_name,
        'api_key': api_key,
        'api_secret': api_secret
    }

def get_telegram_config():
    """Get Telegram config from DB or env"""
    bot_token = get_platform_setting('telegram_bot_token') or os.getenv('TELEGRAM_BOT_TOKEN')
    admin_chat_id = get_platform_setting('telegram_admin_chat_id') or os.getenv('TELEGRAM_ADMIN_CHAT_ID')
    notifications_enabled = get_platform_setting('telegram_notifications_enabled')
    
    return {
        'bot_token': bot_token,
        'admin_chat_id': admin_chat_id,
        'notifications_enabled': notifications_enabled == 'true' if notifications_enabled else False
    }

def get_payment_config(provider):
    """Get payment config from DB with fallback to env vars"""
    if provider == 'click':
        db_enabled = get_platform_setting('click_enabled')
        env_enabled = os.getenv('CLICK_MERCHANT_ID') and os.getenv('CLICK_SERVICE_ID')
        return {
            'merchant_id': get_platform_setting('click_merchant_id') or os.getenv('CLICK_MERCHANT_ID') or '',
            'service_id': get_platform_setting('click_service_id') or os.getenv('CLICK_SERVICE_ID') or '',
            'secret_key': get_platform_setting('click_secret_key') or os.getenv('CLICK_SECRET_KEY') or '',
            'enabled': db_enabled == 'true' if db_enabled else bool(env_enabled)
        }
    elif provider == 'payme':
        db_enabled = get_platform_setting('payme_enabled')
        env_enabled = os.getenv('PAYME_MERCHANT_ID')
        return {
            'merchant_id': get_platform_setting('payme_merchant_id') or os.getenv('PAYME_MERCHANT_ID') or '',
            'key': get_platform_setting('payme_key') or os.getenv('PAYME_KEY') or '',
            'enabled': db_enabled == 'true' if db_enabled else bool(env_enabled)
        }
    elif provider == 'uzum':
        db_enabled = get_platform_setting('uzum_enabled')
        env_enabled = os.getenv('UZUM_MERCHANT_ID')
        return {
            'merchant_id': get_platform_setting('uzum_merchant_id') or os.getenv('UZUM_MERCHANT_ID') or '',
            'service_id': get_platform_setting('uzum_service_id') or os.getenv('UZUM_SERVICE_ID') or '',
            'secret_key': get_platform_setting('uzum_secret_key') or os.getenv('UZUM_SECRET_KEY') or '',
            'enabled': db_enabled == 'true' if db_enabled else bool(env_enabled)
        }
    elif provider == 'card_transfer':
        db_enabled = get_platform_setting('card_transfer_enabled')
        return {
            'card_number': get_platform_setting('card_transfer_card_number') or '',
            'card_holder': get_platform_setting('card_transfer_card_holder') or '',
            'bank_name': get_platform_setting('card_transfer_bank_name') or '',
            'enabled': db_enabled == 'true' if db_enabled else False
        }
    return {}

# ============================================================
# VALIDATION FUNCTIONS
# ============================================================

def validate_email(email):
    """Validate email format"""
    if not email:
        return False, "Email обязателен"
    
    email_pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
    if not re.match(email_pattern, email):
        return False, "Неверный формат email"
    
    return True, None

def validate_phone(phone):
    """Validate phone format - accepts various formats"""
    if not phone:
        return True, None  # Phone is optional
    
    # Remove all non-digit characters except +
    cleaned = re.sub(r'[^\d+]', '', phone)
    
    # Check if it's a valid phone number (7-15 digits, optionally starting with +)
    if cleaned.startswith('+'):
        digits = cleaned[1:]
    else:
        digits = cleaned
    
    if len(digits) < 7 or len(digits) > 15:
        return False, "Телефон должен содержать от 7 до 15 цифр"
    
    if not digits.isdigit():
        return False, "Телефон должен содержать только цифры"
    
    return True, None

# ============================================================
# EMAIL FUNCTIONS (SMTP)
# ============================================================

def get_smtp_config():
    """Get SMTP config from DB or env"""
    return {
        'host': get_platform_setting('smtp_host') or os.getenv('SMTP_HOST', ''),
        'port': int(get_platform_setting('smtp_port') or os.getenv('SMTP_PORT', '587')),
        'user': get_platform_setting('smtp_user') or os.getenv('SMTP_USER', ''),
        'password': get_platform_setting('smtp_password') or os.getenv('SMTP_PASSWORD', ''),
        'from_email': get_platform_setting('smtp_from_email') or os.getenv('SMTP_FROM_EMAIL', ''),
        'from_name': get_platform_setting('smtp_from_name') or os.getenv('SMTP_FROM_NAME', 'Магазин'),
        'use_tls': (get_platform_setting('smtp_use_tls') or os.getenv('SMTP_USE_TLS', 'true')).lower() == 'true'
    }

def send_email(to_email, subject, html_content, text_content=None):
    """Send email via SMTP"""
    try:
        config = get_smtp_config()
        
        if not config['host'] or not config['user'] or not config['password']:
            print("SMTP not configured")
            return False
        
        msg = MIMEMultipart('alternative')
        msg['Subject'] = subject
        msg['From'] = f"{config['from_name']} <{config['from_email'] or config['user']}>"
        msg['To'] = to_email
        
        if text_content:
            msg.attach(MIMEText(text_content, 'plain', 'utf-8'))
        msg.attach(MIMEText(html_content, 'html', 'utf-8'))
        
        if config['use_tls']:
            server = smtplib.SMTP(config['host'], config['port'])
            server.starttls()
        else:
            server = smtplib.SMTP_SSL(config['host'], config['port'])
        
        server.login(config['user'], config['password'])
        server.send_message(msg)
        server.quit()
        
        print(f"✅ Email sent to {to_email}")
        return True
    except Exception as e:
        print(f"❌ Email sending failed: {e}")
        return False

def send_password_reset_email(email, token, site_url):
    """Send password reset email"""
    reset_link = f"{site_url}/reset-password?token={token}"
    
    html_content = f"""
    <html>
    <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #333;">Сброс пароля</h2>
        <p>Вы запросили сброс пароля. Нажмите на кнопку ниже, чтобы установить новый пароль:</p>
        <p style="text-align: center; margin: 30px 0;">
            <a href="{reset_link}" style="background-color: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
                Сбросить пароль
            </a>
        </p>
        <p style="color: #666; font-size: 14px;">
            Если вы не запрашивали сброс пароля, просто проигнорируйте это письмо.
        </p>
        <p style="color: #666; font-size: 14px;">
            Ссылка действительна в течение 1 часа.
        </p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
        <p style="color: #999; font-size: 12px;">
            Или скопируйте эту ссылку: {reset_link}
        </p>
    </body>
    </html>
    """
    
    text_content = f"""
    Сброс пароля
    
    Вы запросили сброс пароля. Перейдите по ссылке ниже, чтобы установить новый пароль:
    
    {reset_link}
    
    Если вы не запрашивали сброс пароля, просто проигнорируйте это письмо.
    Ссылка действительна в течение 1 часа.
    """
    
    return send_email(email, "Сброс пароля", html_content, text_content)

# Telegram notification function
def send_telegram_notification(order_data, order_items):
    """Send order notification to Telegram admin"""
    try:
        order_id = str(order_data.get('id', 'unknown'))[:8]
        print(f"📱 Attempting to send Telegram notification for order {order_id}...")
        
        tg_config = get_telegram_config()
        print(f"   - notifications_enabled: {tg_config.get('notifications_enabled')}")
        print(f"   - has_bot_token: {bool(tg_config.get('bot_token'))}")
        print(f"   - has_admin_chat_id: {bool(tg_config.get('admin_chat_id'))}")
        
        if not tg_config.get('notifications_enabled'):
            print("   ⏭️ Telegram notifications disabled - skipping")
            return False
        
        bot_token = tg_config.get('bot_token')
        admin_chat_id = tg_config.get('admin_chat_id')
        
        if not bot_token or not admin_chat_id:
            print(f"   ❌ Telegram notification: bot_token={bool(bot_token)}, admin_chat_id={bool(admin_chat_id)}")
            return False
        
        # Format order items
        items_text = ""
        for item in order_items:
            items_text += f"  - {item['name']} x{item['quantity']} = {item['price'] * item['quantity']:,} сум\n"
            if item.get('selected_color'):
                items_text += f"    Цвет: {item['selected_color']}\n"
        
        # Payment method labels
        payment_labels = {
            'click': 'Click',
            'payme': 'Payme',
            'uzum': 'Uzum Bank',
            'card_transfer': 'Перевод на карту'
        }
        payment_method = payment_labels.get(order_data.get('payment_method'), order_data.get('payment_method', 'Не указан'))
        
        # Build message
        message = f"""🛒 <b>Новый заказ!</b>

📋 <b>Заказ #{order_id}</b>

👤 <b>Клиент:</b> {order_data.get('customer_name', 'Не указано')}
📞 <b>Телефон:</b> {order_data.get('customer_phone', 'Не указан')}
📍 <b>Адрес:</b> {order_data.get('delivery_address', 'Не указан')}

💳 <b>Способ оплаты:</b> {payment_method}

📦 <b>Товары:</b>
{items_text}
💰 <b>Итого:</b> {order_data['total']:,} сум
"""
        
        # Add receipt photo info if exists
        if order_data.get('payment_receipt_url'):
            message += f"\n📸 <b>Чек оплаты:</b> <a href=\"{order_data['payment_receipt_url']}\">Посмотреть</a>"
        
        # Send message to Telegram
        url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
        payload = {
            'chat_id': admin_chat_id,
            'text': message,
            'parse_mode': 'HTML',
            'disable_web_page_preview': False
        }
        
        response = requests.post(url, json=payload, timeout=10)
        
        if response.status_code == 200:
            print(f"✅ Telegram notification sent for order {order_id}")
            return True
        else:
            print(f"❌ Telegram notification failed: {response.text}")
            return False
            
    except Exception as e:
        print(f"❌ Error sending Telegram notification: {str(e)}")
        return False

# Helper function to load config from settings.json
def load_config():
    config_path = os.path.join(os.path.dirname(__file__), 'config', 'settings.json')
    try:
        with open(config_path, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception:
        return {}

# API Routes

@app.route('/api/config', methods=['GET'])
def get_config():
    try:
        import json
        from flask import Response
        config_path = os.path.join(os.path.dirname(__file__), 'config', 'settings.json')
        with open(config_path, 'r', encoding='utf-8') as f:
            config = json.load(f)
        
        # Override payment settings from database (admin panel settings take priority)
        try:
            click_config = get_payment_config('click')
            payme_config = get_payment_config('payme')
            uzum_config = get_payment_config('uzum')
            card_config = get_payment_config('card_transfer')
            
            config['payment'] = {
                'click': {
                    'enabled': click_config.get('enabled', False),
                    'merchantId': click_config.get('merchant_id', ''),
                    'serviceId': click_config.get('service_id', '')
                },
                'payme': {
                    'enabled': payme_config.get('enabled', False),
                    'merchantId': payme_config.get('merchant_id', '')
                },
                'uzum': {
                    'enabled': uzum_config.get('enabled', False),
                    'merchantId': uzum_config.get('merchant_id', ''),
                    'serviceId': uzum_config.get('service_id', '')
                },
                'cardTransfer': {
                    'enabled': card_config.get('enabled', False),
                    'cardNumber': card_config.get('card_number', ''),
                    'cardHolder': card_config.get('card_holder', ''),
                    'bankName': card_config.get('bank_name', '')
                }
            }
        except Exception as e:
            print(f"Warning: Could not load payment config from database: {e}")
        
        # Add Yandex Maps settings from database
        try:
            yandex_config = get_yandex_maps_config()
            if yandex_config.get('api_key'):
                config['yandexMaps'] = {
                    'apiKey': yandex_config.get('api_key', ''),
                    'defaultCenter': [
                        float(yandex_config.get('default_lat', '41.311081')),
                        float(yandex_config.get('default_lng', '69.240562'))
                    ],
                    'defaultZoom': int(yandex_config.get('default_zoom', '12'))
                }
        except Exception as e:
            print(f"Warning: Could not load Yandex Maps config: {e}")
        
        return Response(
            json.dumps(config, ensure_ascii=False),
            mimetype='application/json; charset=utf-8'
        )
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/config/<path:filename>')
def serve_config_files(filename):
    try:
        return send_from_directory('config', filename)
    except Exception as e:
        return jsonify({'error': str(e)}), 404

@app.route('/api/products', methods=['GET'])
def get_products():
    try:
        category = request.args.get('category')
        conn = get_db_connection()
        cur = conn.cursor()
        
        if category:
            cur.execute('SELECT * FROM products WHERE category_id = %s', (category,))
        else:
            cur.execute('SELECT * FROM products')
        
        products = cur.fetchall()
        cur.close()
        conn.close()
        return jsonify(products)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/products', methods=['POST'])
def create_product():
    try:
        data = request.json
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute(
            'INSERT INTO products (name, description, price, images, category_id) VALUES (%s, %s, %s, %s, %s) RETURNING *',
            (data['name'], data.get('description'), data['price'], data['images'], data.get('category_id'))
        )
        product = cur.fetchone()
        conn.commit()
        cur.close()
        conn.close()
        return jsonify(product), 201
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/products/<product_id>', methods=['GET'])
def get_product(product_id):
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute('SELECT * FROM products WHERE id = %s', (product_id,))
        product = cur.fetchone()
        
        if not product:
            cur.close()
            conn.close()
            return jsonify({'error': 'Product not found'}), 404
        
        # Get inventory for this product
        cur.execute('''
            SELECT color, attribute1_value, attribute2_value, quantity, backorder_lead_time_days
            FROM product_inventory
            WHERE product_id = %s
        ''', (product_id,))
        inventory = cur.fetchall()
        
        cur.close()
        conn.close()
        
        # Add inventory to product response
        product_data = dict(product)
        product_data['inventory'] = inventory
        
        return jsonify(product_data)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/products/<product_id>/availability', methods=['GET'])
def get_product_availability(product_id):
    """Get availability status for a product"""
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        
        # Get all inventory records for this product
        cur.execute('''
            SELECT quantity, backorder_lead_time_days
            FROM product_inventory
            WHERE product_id = %s
        ''', (product_id,))
        
        inventory_records = cur.fetchall()
        cur.close()
        conn.close()
        
        if not inventory_records:
            # No inventory records - product not tracked
            return jsonify({
                'status': 'not_tracked',
                'in_stock': False,
                'total_quantity': 0,
                'backorder_lead_time_days': None
            })
        
        total_quantity = sum(r['quantity'] for r in inventory_records)
        
        # Get the maximum backorder lead time
        lead_times = [r['backorder_lead_time_days'] for r in inventory_records if r['backorder_lead_time_days']]
        max_lead_time = max(lead_times) if lead_times else None
        
        if total_quantity > 0:
            return jsonify({
                'status': 'in_stock',
                'in_stock': True,
                'total_quantity': total_quantity,
                'backorder_lead_time_days': None
            })
        else:
            return jsonify({
                'status': 'backorder',
                'in_stock': False,
                'total_quantity': 0,
                'backorder_lead_time_days': max_lead_time
            })
            
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/products/availability', methods=['POST'])
def get_products_availability():
    """Get availability status for multiple products at once"""
    try:
        data = request.json
        product_ids = data.get('product_ids', [])
        
        if not product_ids:
            return jsonify({})
        
        conn = get_db_connection()
        cur = conn.cursor()
        
        result = {}
        
        for product_id in product_ids:
            cur.execute('''
                SELECT quantity, backorder_lead_time_days
                FROM product_inventory
                WHERE product_id = %s
            ''', (product_id,))
            
            inventory_records = cur.fetchall()
            
            if not inventory_records:
                result[product_id] = {
                    'status': 'not_tracked',
                    'in_stock': False,
                    'total_quantity': 0,
                    'backorder_lead_time_days': None
                }
            else:
                total_quantity = sum(r['quantity'] for r in inventory_records)
                lead_times = [r['backorder_lead_time_days'] for r in inventory_records if r['backorder_lead_time_days']]
                max_lead_time = max(lead_times) if lead_times else None
                
                if total_quantity > 0:
                    result[product_id] = {
                        'status': 'in_stock',
                        'in_stock': True,
                        'total_quantity': total_quantity,
                        'backorder_lead_time_days': None
                    }
                else:
                    result[product_id] = {
                        'status': 'backorder',
                        'in_stock': False,
                        'total_quantity': 0,
                        'backorder_lead_time_days': max_lead_time
                    }
        
        cur.close()
        conn.close()
        
        return jsonify(result)
            
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/products/check', methods=['POST'])
def check_products_exist():
    """Check which products from the list still exist in the database"""
    try:
        data = request.json
        product_ids = data.get('product_ids', [])
        
        if not product_ids:
            return jsonify({'existing': [], 'missing': []})
        
        conn = get_db_connection()
        cur = conn.cursor()
        
        # Check which products exist
        placeholders = ','.join(['%s'] * len(product_ids))
        cur.execute(f'SELECT id FROM products WHERE id IN ({placeholders})', tuple(product_ids))
        existing_products = cur.fetchall()
        existing_ids = [p['id'] for p in existing_products]
        missing_ids = [pid for pid in product_ids if pid not in existing_ids]
        
        cur.close()
        conn.close()
        
        return jsonify({
            'existing': existing_ids,
            'missing': missing_ids
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/favorites/<user_id>', methods=['GET'])
def get_favorites(user_id):
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute('''
            SELECT p.* FROM products p
            JOIN favorites f ON p.id = f.product_id
            WHERE f.user_id = %s
        ''', (user_id,))
        favorites = cur.fetchall()
        cur.close()
        conn.close()
        return jsonify(favorites)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/favorites', methods=['POST'])
def add_to_favorites():
    try:
        data = request.json
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute(
            'INSERT INTO favorites (user_id, product_id) VALUES (%s, %s) ON CONFLICT (user_id, product_id) DO NOTHING RETURNING *',
            (data['user_id'], data['product_id'])
        )
        favorite = cur.fetchone()
        conn.commit()
        cur.close()
        conn.close()
        return jsonify(favorite), 201
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/favorites/<user_id>/<product_id>', methods=['DELETE'])
def remove_from_favorites(user_id, product_id):
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute(
            'DELETE FROM favorites WHERE user_id = %s AND product_id = %s',
            (user_id, product_id)
        )
        conn.commit()
        cur.close()
        conn.close()
        return jsonify({'message': 'Removed from favorites'}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# Email/Password Auth
@app.route('/api/auth/register', methods=['POST'])
def register():
    try:
        data = request.json
        email = data.get('email', '').strip().lower()
        password = data.get('password')
        first_name = data.get('first_name', '')
        last_name = data.get('last_name', '')
        phone = data.get('phone', '')
        telegram_username = data.get('telegram_username', '')
        
        # Validate email
        is_valid, error_msg = validate_email(email)
        if not is_valid:
            return jsonify({'error': error_msg}), 400
        
        # Validate phone
        is_valid, error_msg = validate_phone(phone)
        if not is_valid:
            return jsonify({'error': error_msg}), 400
        
        # Validate password
        if not password:
            return jsonify({'error': 'Пароль обязателен'}), 400
        
        if len(password) < 6:
            return jsonify({'error': 'Пароль должен быть не менее 6 символов'}), 400
        
        conn = get_db_connection()
        cur = conn.cursor()
        
        # Check if user with this email already exists
        cur.execute('SELECT id FROM users WHERE email = %s', (email,))
        existing_user = cur.fetchone()
        
        if existing_user:
            cur.close()
            conn.close()
            return jsonify({'error': 'Пользователь с таким email уже существует'}), 400
        
        # Create new user
        password_hash = generate_password_hash(password)
        cur.execute(
            '''INSERT INTO users (email, password_hash, first_name, last_name, phone, telegram_username) 
               VALUES (%s, %s, %s, %s, %s, %s) RETURNING id, email, first_name, last_name, phone, telegram_username, created_at''',
            (email, password_hash, first_name, last_name, phone, telegram_username)
        )
        new_user = cur.fetchone()
        conn.commit()
        cur.close()
        conn.close()
        
        # Set session
        session.permanent = True
        session['user_id'] = new_user['id']
        
        return jsonify({'user': new_user, 'message': 'Регистрация успешна'}), 201
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/auth/login', methods=['POST'])
def login():
    try:
        data = request.json
        email = data.get('email')
        password = data.get('password')
        
        if not email or not password:
            return jsonify({'error': 'Email and password are required'}), 400
        
        conn = get_db_connection()
        cur = conn.cursor()
        
        # Find user by email
        cur.execute('SELECT * FROM users WHERE email = %s', (email,))
        user = cur.fetchone()
        cur.close()
        conn.close()
        
        if not user or not user.get('password_hash'):
            return jsonify({'error': 'Invalid email or password'}), 401
        
        # Check password
        if not check_password_hash(user['password_hash'], password):
            return jsonify({'error': 'Invalid email or password'}), 401
        
        # Set session
        session.permanent = True
        session['user_id'] = user['id']
        
        # Return user data without password hash
        user_data = {
            'id': user['id'],
            'email': user['email'],
            'first_name': user.get('first_name'),
            'last_name': user.get('last_name'),
            'phone': user.get('phone'),
            'telegram_username': user.get('telegram_username'),
            'username': user.get('username'),
        }
        
        return jsonify({'user': user_data, 'message': 'Login successful'}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/auth/logout', methods=['POST'])
def logout():
    session.clear()
    return jsonify({'message': 'Logged out successfully'}), 200

# ============================================================
# PASSWORD RESET API
# ============================================================

@app.route('/api/auth/forgot-password', methods=['POST'])
def forgot_password():
    """Request password reset - sends email with reset link"""
    try:
        data = request.json
        email = data.get('email', '').strip().lower()
        
        if not email:
            return jsonify({'error': 'Email обязателен'}), 400
        
        conn = get_db_connection()
        cur = conn.cursor()
        
        # Find user by email
        cur.execute('SELECT id, email FROM users WHERE email = %s', (email,))
        user = cur.fetchone()
        
        if not user:
            cur.close()
            conn.close()
            # Don't reveal if email exists
            return jsonify({'message': 'Если аккаунт существует, на email будет отправлена ссылка для сброса пароля'}), 200
        
        # Generate secure token
        token = secrets.token_urlsafe(32)
        expires_at = datetime.now() + timedelta(hours=1)
        
        # Delete any existing tokens for this user
        cur.execute('DELETE FROM password_reset_tokens WHERE user_id = %s', (user['id'],))
        
        # Create new token
        cur.execute(
            'INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES (%s, %s, %s)',
            (user['id'], token, expires_at)
        )
        conn.commit()
        cur.close()
        conn.close()
        
        # Get site URL from request
        site_url = request.headers.get('Origin') or request.host_url.rstrip('/')
        
        # Send email
        email_sent = send_password_reset_email(email, token, site_url)
        
        if email_sent:
            return jsonify({'message': 'Ссылка для сброса пароля отправлена на email'}), 200
        else:
            return jsonify({'error': 'Не удалось отправить email. Проверьте настройки SMTP.'}), 500
            
    except Exception as e:
        print(f"Forgot password error: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/auth/reset-password', methods=['POST'])
def reset_password():
    """Reset password using token from email"""
    try:
        data = request.json
        token = data.get('token')
        new_password = data.get('password')
        
        if not token:
            return jsonify({'error': 'Токен обязателен'}), 400
        
        if not new_password or len(new_password) < 6:
            return jsonify({'error': 'Пароль должен быть не менее 6 символов'}), 400
        
        conn = get_db_connection()
        cur = conn.cursor()
        
        # Find valid token
        cur.execute('''
            SELECT t.*, u.email 
            FROM password_reset_tokens t
            JOIN users u ON t.user_id = u.id
            WHERE t.token = %s AND t.used = FALSE AND t.expires_at > NOW()
        ''', (token,))
        token_data = cur.fetchone()
        
        if not token_data:
            cur.close()
            conn.close()
            return jsonify({'error': 'Недействительная или просроченная ссылка. Запросите сброс пароля повторно.'}), 400
        
        # Update password
        password_hash = generate_password_hash(new_password)
        cur.execute(
            'UPDATE users SET password_hash = %s WHERE id = %s',
            (password_hash, token_data['user_id'])
        )
        
        # Mark token as used
        cur.execute(
            'UPDATE password_reset_tokens SET used = TRUE WHERE id = %s',
            (token_data['id'],)
        )
        
        conn.commit()
        cur.close()
        conn.close()
        
        return jsonify({'message': 'Пароль успешно изменён'}), 200
        
    except Exception as e:
        print(f"Reset password error: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/auth/verify-reset-token', methods=['POST'])
def verify_reset_token():
    """Verify if password reset token is valid"""
    try:
        data = request.json
        token = data.get('token')
        
        if not token:
            return jsonify({'valid': False, 'error': 'Токен обязателен'}), 400
        
        conn = get_db_connection()
        cur = conn.cursor()
        
        cur.execute('''
            SELECT t.id, u.email 
            FROM password_reset_tokens t
            JOIN users u ON t.user_id = u.id
            WHERE t.token = %s AND t.used = FALSE AND t.expires_at > NOW()
        ''', (token,))
        token_data = cur.fetchone()
        
        cur.close()
        conn.close()
        
        if token_data:
            return jsonify({'valid': True, 'email': token_data['email']}), 200
        else:
            return jsonify({'valid': False, 'error': 'Недействительная или просроченная ссылка'}), 400
            
    except Exception as e:
        return jsonify({'valid': False, 'error': str(e)}), 500

@app.route('/api/auth/me', methods=['GET'])
def get_current_user():
    try:
        user_id = session.get('user_id')
        
        if not user_id:
            return jsonify({'error': 'Not authenticated'}), 401
        
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute('SELECT id, email, first_name, last_name, phone, telegram_username, username, telegram_id FROM users WHERE id = %s', (user_id,))
        user = cur.fetchone()
        cur.close()
        conn.close()
        
        if not user:
            session.clear()
            return jsonify({'error': 'User not found'}), 404
        
        return jsonify({'user': user}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/auth/profile', methods=['PATCH'])
def update_profile():
    try:
        user_id = session.get('user_id')
        
        if not user_id:
            return jsonify({'error': 'Not authenticated'}), 401
        
        data = request.json
        first_name = data.get('first_name')
        last_name = data.get('last_name')
        phone = data.get('phone')
        telegram_username = data.get('telegram_username')
        
        conn = get_db_connection()
        cur = conn.cursor()
        
        cur.execute(
            '''UPDATE users 
               SET first_name = %s, last_name = %s, phone = %s, telegram_username = %s 
               WHERE id = %s 
               RETURNING id, email, first_name, last_name, phone, telegram_username''',
            (first_name, last_name, phone, telegram_username, user_id)
        )
        updated_user = cur.fetchone()
        conn.commit()
        cur.close()
        conn.close()
        
        return jsonify({'user': updated_user, 'message': 'Profile updated successfully'}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# Cart endpoints
@app.route('/api/cart/<user_id>', methods=['GET'])
def get_cart(user_id):
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute('''
            SELECT p.*, c.id as cart_id, c.quantity, c.selected_color, c.selected_attributes 
            FROM products p
            JOIN cart c ON p.id = c.product_id
            WHERE c.user_id = %s
        ''', (user_id,))
        cart_items = cur.fetchall()
        cur.close()
        conn.close()
        return jsonify(cart_items)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/cart/<user_id>/delivery-info', methods=['GET'])
def get_cart_delivery_info(user_id):
    """Get delivery information for cart items using global delivery settings"""
    try:
        import json as json_lib
        
        # Get global delivery settings
        delivery_days_in_stock = int(get_platform_setting('delivery_days_in_stock') or 3)
        delivery_days_backorder = int(get_platform_setting('delivery_days_backorder') or 14)
        
        conn = get_db_connection()
        cur = conn.cursor()
        
        # Get cart items with product info
        cur.execute('''
            SELECT c.product_id, c.selected_color, c.selected_attributes
            FROM cart c
            WHERE c.user_id = %s
        ''', (user_id,))
        cart_items = cur.fetchall()
        
        if not cart_items:
            cur.close()
            conn.close()
            return jsonify({
                'has_backorder': False,
                'max_backorder_days': 0,
                'default_delivery_days': delivery_days_in_stock
            })
        
        has_backorder = False
        
        # Check all cart items for backorder status
        for item in cart_items:
            selected_attrs = item.get('selected_attributes')
            if isinstance(selected_attrs, str):
                selected_attrs = json_lib.loads(selected_attrs) if selected_attrs else {}
            elif selected_attrs is None:
                selected_attrs = {}
            
            attr1_value = None
            attr2_value = None
            if selected_attrs:
                attr_values = list(selected_attrs.values())
                if len(attr_values) > 0:
                    attr1_value = attr_values[0]
                if len(attr_values) > 1:
                    attr2_value = attr_values[1]
            
            # Check inventory for this combination
            cur.execute('''
                SELECT quantity
                FROM product_inventory
                WHERE product_id = %s
                AND (color = %s OR (color IS NULL AND %s IS NULL))
                AND (attribute1_value = %s OR (attribute1_value IS NULL AND %s IS NULL))
                AND (attribute2_value = %s OR (attribute2_value IS NULL AND %s IS NULL))
            ''', (item['product_id'], item.get('selected_color'), item.get('selected_color'),
                  attr1_value, attr1_value, attr2_value, attr2_value))
            
            inventory = cur.fetchone()
            
            if inventory:
                if inventory['quantity'] <= 0:
                    has_backorder = True
            else:
                # No inventory record - consider as backorder
                has_backorder = True
        
        cur.close()
        conn.close()
        
        # Return delivery estimate based on whether any items are on backorder
        return jsonify({
            'has_backorder': has_backorder,
            'max_backorder_days': delivery_days_backorder if has_backorder else 0,
            'default_delivery_days': delivery_days_in_stock
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/cart', methods=['POST'])
def add_to_cart():
    try:
        data = request.json
        user_id = data['user_id']
        product_id = data['product_id']
        quantity = data.get('quantity', 1)
        selected_color = data.get('selected_color')
        selected_attributes = data.get('selected_attributes')
        
        import json as json_lib
        
        if selected_attributes and len(selected_attributes) == 0:
            selected_attributes = None
        
        attrs_json = json_lib.dumps(selected_attributes) if selected_attributes else None
        
        conn = get_db_connection()
        cur = conn.cursor()
        
        if attrs_json:
            cur.execute(
                '''SELECT id, quantity FROM cart 
                   WHERE user_id = %s AND product_id = %s 
                   AND (selected_color = %s OR (selected_color IS NULL AND %s IS NULL))
                   AND selected_attributes = %s::jsonb''',
                (user_id, product_id, selected_color, selected_color, attrs_json)
            )
        else:
            cur.execute(
                '''SELECT id, quantity FROM cart 
                   WHERE user_id = %s AND product_id = %s 
                   AND (selected_color = %s OR (selected_color IS NULL AND %s IS NULL))
                   AND selected_attributes IS NULL''',
                (user_id, product_id, selected_color, selected_color)
            )
        existing = cur.fetchone()
        
        if existing:
            new_quantity = existing['quantity'] + quantity
            cur.execute(
                '''UPDATE cart SET quantity = %s 
                   WHERE id = %s RETURNING *''',
                (new_quantity, existing['id'])
            )
        else:
            cur.execute(
                '''INSERT INTO cart (user_id, product_id, quantity, selected_color, selected_attributes) 
                   VALUES (%s, %s, %s, %s, %s) RETURNING *''',
                (user_id, product_id, quantity, selected_color, attrs_json)
            )
        
        cart_item = cur.fetchone()
        conn.commit()
        cur.close()
        conn.close()
        return jsonify(cart_item), 201
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/cart', methods=['PUT'])
def update_cart_quantity():
    try:
        data = request.json
        cart_id = data.get('cart_id')
        quantity = data['quantity']
        
        conn = get_db_connection()
        cur = conn.cursor()
        
        if cart_id:
            # Update by cart_id (preferred method)
            cur.execute(
                'UPDATE cart SET quantity = %s WHERE id = %s RETURNING *',
                (quantity, cart_id)
            )
        else:
            # Fallback: update by user_id and product_id (for backwards compatibility)
            cur.execute(
                'UPDATE cart SET quantity = %s WHERE user_id = %s AND product_id = %s RETURNING *',
                (quantity, data['user_id'], data['product_id'])
            )
        
        cart_item = cur.fetchone()
        conn.commit()
        cur.close()
        conn.close()
        if cart_item:
            return jsonify(cart_item)
        return jsonify({'error': 'Cart item not found'}), 404
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/cart/<cart_id>', methods=['DELETE'])
def remove_from_cart(cart_id):
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute(
            'DELETE FROM cart WHERE id = %s',
            (cart_id,)
        )
        conn.commit()
        cur.close()
        conn.close()
        return jsonify({'message': 'Removed from cart'}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/cart/clear/<user_id>', methods=['DELETE'])
def clear_cart(user_id):
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute('DELETE FROM cart WHERE user_id = %s', (user_id,))
        conn.commit()
        cur.close()
        conn.close()
        return jsonify({'message': 'Cart cleared'}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# Order endpoint
@app.route('/api/orders', methods=['POST'])
def create_order():
    try:
        data = request.json
        user_id = data.get('user_id')
        cart_items = data.get('items', [])
        total = data.get('total', 0)
        
        print(f"\n{'='*50}")
        print(f"📦 NEW ORDER REQUEST")
        print(f"{'='*50}")
        print(f"User ID: {user_id}")
        print(f"Items count: {len(cart_items)}")
        print(f"Total: {total}")
        print(f"Items: {cart_items}")
        
        # Get user info
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute('SELECT * FROM users WHERE id = %s', (user_id,))
        user_info = cur.fetchone()
        
        if not user_info:
            print(f"⚠️ User not found in database: {user_id}")
            cur.close()
            conn.close()
            return jsonify({'error': 'User not found'}), 404
        
        # Create order in database
        cur.execute(
            'INSERT INTO orders (user_id, total, status) VALUES (%s, %s, %s) RETURNING *',
            (user_id, total, 'reviewing')
        )
        order = cur.fetchone()
        order_id = order['id']
        
        # Insert order items
        import json as json_lib
        for item in cart_items:
            cur.execute(
                '''INSERT INTO order_items (order_id, product_id, name, price, quantity, selected_color, selected_attributes) 
                   VALUES (%s, %s, %s, %s, %s, %s, %s)''',
                (order_id, item.get('id'), item.get('name'), item.get('price'), 
                 item.get('quantity'), item.get('selected_color'),
                 json_lib.dumps(item.get('selected_attributes')) if item.get('selected_attributes') else None)
            )
        
        print(f"✅ Order saved to database: {order_id}")
        
        # Keep only last 5 orders for this user (delete older ones after saving items)
        cur.execute('''
            WITH recent_orders AS (
                SELECT id FROM orders 
                WHERE user_id = %s 
                ORDER BY created_at DESC 
                LIMIT 5
            )
            DELETE FROM orders 
            WHERE user_id = %s 
            AND id NOT IN (SELECT id FROM recent_orders)
        ''', (user_id, user_id))
        
        # Clear the cart after order
        cur.execute('DELETE FROM cart WHERE user_id = %s', (user_id,))
        conn.commit()
        cur.close()
        conn.close()
        
        print(f"{'='*50}\n")
        
        return jsonify({'message': 'Order created successfully', 'order_id': order_id}), 201
    except Exception as e:
        print(f"❌ ERROR creating order: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

# Checkout endpoint with payment integration
@app.route('/api/orders/checkout', methods=['POST'])
def checkout_order():
    try:
        data = request.json
        payment_method = data.get('payment_method')
        delivery_address = data.get('delivery_address')
        delivery_lat = data.get('delivery_lat')
        delivery_lng = data.get('delivery_lng')
        customer_name = data.get('customer_name')
        customer_phone = data.get('customer_phone')
        payment_receipt_url = data.get('payment_receipt_url')  # For card transfer payments
        
        # SECURITY: Get user_id from session, not from client
        user_id = session.get('user_id')
        if not user_id:
            # Fallback for Telegram Mini App auth
            user_id = data.get('user_id')
        
        if not user_id:
            return jsonify({'error': 'Not authenticated'}), 401
        
        print(f"\n{'='*50}")
        print(f"💳 CHECKOUT REQUEST")
        print(f"{'='*50}")
        print(f"User ID: {user_id}")
        print(f"Payment method: {payment_method}")
        print(f"Delivery: {delivery_address}")
        
        # Get user info and validate
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute('SELECT * FROM users WHERE id = %s', (user_id,))
        user_info = cur.fetchone()
        
        if not user_info:
            cur.close()
            conn.close()
            return jsonify({'error': 'User not found'}), 404
        
        # SECURITY: Fetch cart items from database, not from client
        cur.execute('''
            SELECT c.product_id, c.quantity, c.selected_color, c.selected_attributes,
                   p.name, p.price
            FROM cart c
            JOIN products p ON c.product_id = p.id
            WHERE c.user_id = %s
        ''', (user_id,))
        cart_items = cur.fetchall()
        
        if not cart_items:
            cur.close()
            conn.close()
            return jsonify({'error': 'Cart is empty'}), 400
        
        # SECURITY: Calculate total from database prices, not client data
        total = sum(item['price'] * item['quantity'] for item in cart_items)
        
        print(f"Total (calculated from DB): {total}")
        
        # Process inventory and determine availability status for each item
        import json as json_lib
        has_backorder = False
        max_backorder_days = 0
        order_items_with_status = []
        
        for item in cart_items:
            # Parse selected_attributes to get attribute values
            selected_attrs = item.get('selected_attributes')
            if isinstance(selected_attrs, str):
                selected_attrs = json_lib.loads(selected_attrs) if selected_attrs else {}
            elif selected_attrs is None:
                selected_attrs = {}
            
            # Extract attribute values (assuming attributes are stored as {attr_name: value})
            attr1_value = None
            attr2_value = None
            if selected_attrs:
                attr_values = list(selected_attrs.values())
                if len(attr_values) > 0:
                    attr1_value = attr_values[0]
                if len(attr_values) > 1:
                    attr2_value = attr_values[1]
            
            selected_color = item.get('selected_color')
            
            # Check inventory for this combination
            cur.execute('''
                SELECT id, quantity, backorder_lead_time_days
                FROM product_inventory
                WHERE product_id = %s 
                AND (color = %s OR (color IS NULL AND %s IS NULL))
                AND (attribute1_value = %s OR (attribute1_value IS NULL AND %s IS NULL))
                AND (attribute2_value = %s OR (attribute2_value IS NULL AND %s IS NULL))
                FOR UPDATE
            ''', (item['product_id'], selected_color, selected_color, 
                  attr1_value, attr1_value, attr2_value, attr2_value))
            
            inventory = cur.fetchone()
            
            availability_status = 'in_stock'
            backorder_lead_time_days = None
            
            if inventory:
                if inventory['quantity'] >= item['quantity']:
                    # Enough stock - decrement
                    new_quantity = inventory['quantity'] - item['quantity']
                    cur.execute(
                        'UPDATE product_inventory SET quantity = %s, updated_at = CURRENT_TIMESTAMP WHERE id = %s',
                        (new_quantity, inventory['id'])
                    )
                else:
                    # Not enough stock - backorder
                    availability_status = 'backorder'
                    backorder_lead_time_days = inventory.get('backorder_lead_time_days')
                    has_backorder = True
                    if backorder_lead_time_days and backorder_lead_time_days > max_backorder_days:
                        max_backorder_days = backorder_lead_time_days
                    # Decrement what we have
                    if inventory['quantity'] > 0:
                        cur.execute(
                            'UPDATE product_inventory SET quantity = 0, updated_at = CURRENT_TIMESTAMP WHERE id = %s',
                            (inventory['id'],)
                        )
            else:
                # No inventory record - treat as backorder (not tracked)
                availability_status = 'backorder'
                has_backorder = True
                # For not-tracked items, we'll use default delivery days
            
            order_items_with_status.append({
                **dict(item),
                'availability_status': availability_status,
                'backorder_lead_time_days': backorder_lead_time_days
            })
        
        # Get default delivery days setting
        default_delivery_days_setting = get_platform_setting('default_delivery_days')
        default_delivery_days = int(default_delivery_days_setting) if default_delivery_days_setting else 3
        
        # Calculate backorder delivery date if needed
        backorder_delivery_date = None
        if has_backorder:
            # Use max_backorder_days if any item has specific lead time, otherwise use default
            effective_days = max_backorder_days if max_backorder_days > 0 else default_delivery_days
            backorder_delivery_date = datetime.now() + timedelta(days=effective_days)
        
        # Calculate estimated delivery days
        # If there's backorder, use max of (max_backorder_days, default_delivery_days)
        # If no backorder, use default_delivery_days (for in-stock items)
        if has_backorder:
            estimated_delivery_days = max(default_delivery_days, max_backorder_days) if max_backorder_days > 0 else default_delivery_days
        else:
            estimated_delivery_days = default_delivery_days
        
        # Determine initial status for new orders
        initial_status = 'reviewing'  # All orders start as "Рассматривается"
        initial_payment_status = 'pending'
        if payment_method == 'card_transfer' and payment_receipt_url:
            initial_status = 'reviewing'  # Still "Рассматривается" but with receipt uploaded
            initial_payment_status = 'awaiting_verification'
        
        # Create order in database with delivery info and backorder status
        cur.execute(
            '''INSERT INTO orders (user_id, total, status, payment_method, payment_status, 
               delivery_address, delivery_lat, delivery_lng, customer_phone, customer_name, 
               payment_receipt_url, has_backorder, backorder_delivery_date, estimated_delivery_days) 
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s) RETURNING *''',
            (user_id, total, initial_status, payment_method, initial_payment_status,
             delivery_address, delivery_lat, delivery_lng, customer_phone, customer_name, 
             payment_receipt_url, has_backorder, backorder_delivery_date, estimated_delivery_days)
        )
        order = cur.fetchone()
        order_id = order['id']
        
        # Insert order items with availability status
        for item in order_items_with_status:
            cur.execute(
                '''INSERT INTO order_items (order_id, product_id, name, price, quantity, 
                   selected_color, selected_attributes, availability_status, backorder_lead_time_days) 
                   VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)''',
                (order_id, item['product_id'], item['name'], item['price'], 
                 item['quantity'], item.get('selected_color'),
                 json_lib.dumps(item.get('selected_attributes')) if item.get('selected_attributes') else None,
                 item['availability_status'], item.get('backorder_lead_time_days'))
            )
        
        conn.commit()
        
        # Generate payment URL based on payment method
        payment_url = None
        
        if payment_method == 'click':
            click_config = get_payment_config('click')
            merchant_id = click_config.get('merchant_id')
            service_id = click_config.get('service_id')
            
            if merchant_id and service_id and click_config.get('enabled'):
                # Click payment URL format
                payment_url = f"https://my.click.uz/services/pay?service_id={service_id}&merchant_id={merchant_id}&amount={total}&transaction_param={order_id}"
                
        elif payment_method == 'payme':
            payme_config = get_payment_config('payme')
            merchant_id = payme_config.get('merchant_id')
            
            if merchant_id and payme_config.get('enabled'):
                # Payme payment URL format (amount in tiyins)
                amount_tiyins = total * 100
                # Encode account data
                account_data = f"m={merchant_id};ac.order_id={order_id};a={amount_tiyins}"
                encoded = base64.b64encode(account_data.encode()).decode()
                payment_url = f"https://checkout.paycom.uz/{encoded}"
                
        elif payment_method == 'uzum':
            uzum_config = get_payment_config('uzum')
            merchant_id = uzum_config.get('merchant_id')
            
            if merchant_id and uzum_config.get('enabled'):
                # Uzum Bank payment - they use webhook system
                # For now, store order and redirect to Uzum payment page
                payment_url = f"https://payment.apelsin.uz/merchant?merchantId={merchant_id}&amount={total}&orderId={order_id}"
        
        elif payment_method == 'card_transfer':
            # Card transfer - no redirect needed, order is created with receipt
            # Clear the cart for successful card transfer order
            cur.execute('DELETE FROM cart WHERE user_id = %s', (user_id,))
            conn.commit()
        
        # Update order with payment info
        if payment_url:
            cur.execute(
                'UPDATE orders SET payment_id = %s WHERE id = %s',
                (f"{payment_method}_{order_id}", order_id)
            )
            conn.commit()
        
        cur.close()
        conn.close()
        
        print(f"✅ Order created: {order_id}")
        print(f"💳 Payment URL: {payment_url}")
        print(f"{'='*50}\n")
        
        # Send Telegram notification for new order
        order_data = {
            'id': order_id,
            'total': total,
            'customer_name': customer_name,
            'customer_phone': customer_phone,
            'delivery_address': delivery_address,
            'payment_method': payment_method,
            'payment_receipt_url': payment_receipt_url
        }
        order_items_for_notification = [
            {
                'name': item['name'],
                'price': item['price'],
                'quantity': item['quantity'],
                'selected_color': item.get('selected_color')
            }
            for item in cart_items
        ]
        send_telegram_notification(order_data, order_items_for_notification)
        
        return jsonify({
            'order_id': order_id,
            'payment_url': payment_url,
            'message': 'Order created successfully'
        }), 201
        
    except Exception as e:
        print(f"❌ ERROR in checkout: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

# Helper function to verify Click signature
def verify_click_signature(data, secret_key):
    import hashlib
    
    click_trans_id = str(data.get('click_trans_id', ''))
    service_id = str(data.get('service_id', ''))
    merchant_trans_id = str(data.get('merchant_trans_id', ''))
    amount = str(data.get('amount', ''))
    action = str(data.get('action', ''))
    sign_time = str(data.get('sign_time', ''))
    received_sign = data.get('sign_string', '')
    
    # For prepare: click_trans_id + service_id + SECRET_KEY + merchant_trans_id + amount + action + sign_time
    sign_string = f"{click_trans_id}{service_id}{secret_key}{merchant_trans_id}{amount}{action}{sign_time}"
    calculated_sign = hashlib.md5(sign_string.encode()).hexdigest()
    
    return calculated_sign == received_sign

# Payment webhooks for Click
@app.route('/api/webhooks/click/prepare', methods=['POST'])
def click_prepare():
    try:
        data = request.json or request.form.to_dict()
        print(f"Click prepare webhook: {data}")
        
        # SECURITY: Verify signature using DB-stored secret
        click_config = get_payment_config('click')
        click_secret = click_config.get('secret_key')
        if click_secret and not verify_click_signature(data, click_secret):
            print("Click signature verification failed")
            return jsonify({
                'error': -1,
                'error_note': 'Invalid signature'
            })
        
        click_trans_id = data.get('click_trans_id')
        merchant_trans_id = data.get('merchant_trans_id')  # order_id
        amount = data.get('amount')
        
        # Verify order exists
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute('SELECT * FROM orders WHERE id = %s', (merchant_trans_id,))
        order = cur.fetchone()
        
        if not order:
            cur.close()
            conn.close()
            return jsonify({
                'error': -5,
                'error_note': 'Order not found'
            })
        
        # Check amount matches
        if int(float(amount)) != order['total']:
            cur.close()
            conn.close()
            return jsonify({
                'error': -2,
                'error_note': 'Amount mismatch'
            })
        
        # Check order is not already paid (idempotency)
        if order['payment_status'] == 'paid':
            cur.close()
            conn.close()
            return jsonify({
                'error': -4,
                'error_note': 'Order already paid'
            })
        
        # Update order with click transaction id
        cur.execute(
            'UPDATE orders SET payment_id = %s WHERE id = %s',
            (click_trans_id, merchant_trans_id)
        )
        conn.commit()
        cur.close()
        conn.close()
        
        return jsonify({
            'error': 0,
            'error_note': 'Success',
            'click_trans_id': click_trans_id,
            'merchant_trans_id': merchant_trans_id,
            'merchant_prepare_id': merchant_trans_id
        })
        
    except Exception as e:
        print(f"Click prepare error: {e}")
        return jsonify({'error': -1, 'error_note': str(e)})

@app.route('/api/webhooks/click/complete', methods=['POST'])
def click_complete():
    try:
        data = request.json or request.form.to_dict()
        print(f"Click complete webhook: {data}")
        
        # SECURITY: Verify signature using DB-stored secret
        click_config = get_payment_config('click')
        click_secret = click_config.get('secret_key')
        if click_secret and not verify_click_signature(data, click_secret):
            print("Click signature verification failed")
            return jsonify({
                'error': -1,
                'error_note': 'Invalid signature'
            })
        
        click_trans_id = data.get('click_trans_id')
        merchant_trans_id = data.get('merchant_trans_id')  # order_id
        error = data.get('error')
        
        conn = get_db_connection()
        cur = conn.cursor()
        
        # Verify order exists and get current state
        cur.execute('SELECT * FROM orders WHERE id = %s', (merchant_trans_id,))
        order = cur.fetchone()
        
        if not order:
            cur.close()
            conn.close()
            return jsonify({
                'error': -5,
                'error_note': 'Order not found'
            })
        
        # Idempotency: if already paid, just return success
        if order['payment_status'] == 'paid':
            cur.close()
            conn.close()
            return jsonify({
                'error': 0,
                'error_note': 'Already confirmed',
                'click_trans_id': click_trans_id,
                'merchant_trans_id': merchant_trans_id,
                'merchant_confirm_id': merchant_trans_id
            })
        
        if error == '0' or error == 0:
            # Payment successful
            cur.execute(
                "UPDATE orders SET payment_status = 'paid', status = 'paid' WHERE id = %s",
                (merchant_trans_id,)
            )
            print(f"✅ Click payment successful for order {merchant_trans_id}")
        else:
            # Payment failed
            cur.execute(
                "UPDATE orders SET payment_status = 'failed' WHERE id = %s",
                (merchant_trans_id,)
            )
            print(f"❌ Click payment failed for order {merchant_trans_id}")
        
        conn.commit()
        cur.close()
        conn.close()
        
        return jsonify({
            'error': 0,
            'error_note': 'Success',
            'click_trans_id': click_trans_id,
            'merchant_trans_id': merchant_trans_id,
            'merchant_confirm_id': merchant_trans_id
        })
        
    except Exception as e:
        print(f"Click complete error: {e}")
        return jsonify({'error': -1, 'error_note': str(e)})

# Helper function to verify Payme authorization
def verify_payme_auth():
    import base64
    auth_header = request.headers.get('Authorization', '')
    if not auth_header.startswith('Basic '):
        return False
    
    payme_key = os.getenv('PAYME_KEY')
    if not payme_key:
        return True  # Skip if not configured
    
    try:
        encoded = auth_header[6:]  # Remove "Basic " prefix
        decoded = base64.b64decode(encoded).decode('utf-8')
        # Format: Paycom:key
        if ':' in decoded:
            _, received_key = decoded.split(':', 1)
            return received_key == payme_key
        return False
    except:
        return False

# Payment webhooks for Payme
@app.route('/api/webhooks/payme', methods=['POST'])
def payme_webhook():
    try:
        # SECURITY: Verify Basic Auth
        if os.getenv('PAYME_KEY') and not verify_payme_auth():
            return jsonify({
                'error': {'code': -32504, 'message': 'Invalid authorization'}
            }), 401
        
        data = request.json
        print(f"Payme webhook: {data}")
        
        method = data.get('method')
        params = data.get('params', {})
        
        conn = get_db_connection()
        cur = conn.cursor()
        
        if method == 'CheckPerformTransaction':
            # Check if order exists and can be paid
            account = params.get('account', {})
            order_id = account.get('order_id')
            amount = params.get('amount', 0) // 100  # Convert tiyins to sum
            
            cur.execute('SELECT * FROM orders WHERE id = %s', (order_id,))
            order = cur.fetchone()
            
            if not order:
                cur.close()
                conn.close()
                return jsonify({
                    'error': {'code': -31050, 'message': 'Order not found'}
                })
            
            if order['total'] != amount:
                cur.close()
                conn.close()
                return jsonify({
                    'error': {'code': -31001, 'message': 'Amount mismatch'}
                })
            
            cur.close()
            conn.close()
            return jsonify({'result': {'allow': True}})
            
        elif method == 'CreateTransaction':
            account = params.get('account', {})
            order_id = account.get('order_id')
            transaction_id = params.get('id')
            
            cur.execute(
                'UPDATE orders SET payment_id = %s WHERE id = %s',
                (transaction_id, order_id)
            )
            conn.commit()
            cur.close()
            conn.close()
            
            return jsonify({
                'result': {
                    'create_time': int(datetime.now().timestamp() * 1000),
                    'transaction': order_id,
                    'state': 1
                }
            })
            
        elif method == 'PerformTransaction':
            transaction_id = params.get('id')
            
            cur.execute(
                "UPDATE orders SET payment_status = 'paid', status = 'paid' WHERE payment_id = %s RETURNING id",
                (transaction_id,)
            )
            order = cur.fetchone()
            conn.commit()
            
            if order:
                print(f"✅ Payme payment successful for order {order['id']}")
            
            cur.close()
            conn.close()
            
            return jsonify({
                'result': {
                    'perform_time': int(datetime.now().timestamp() * 1000),
                    'transaction': transaction_id,
                    'state': 2
                }
            })
            
        elif method == 'CancelTransaction':
            transaction_id = params.get('id')
            reason = params.get('reason')
            
            cur.execute(
                "UPDATE orders SET payment_status = 'cancelled' WHERE payment_id = %s",
                (transaction_id,)
            )
            conn.commit()
            cur.close()
            conn.close()
            
            return jsonify({
                'result': {
                    'cancel_time': int(datetime.now().timestamp() * 1000),
                    'transaction': transaction_id,
                    'state': -1
                }
            })
        
        cur.close()
        conn.close()
        return jsonify({'error': {'code': -32601, 'message': 'Method not found'}})
        
    except Exception as e:
        print(f"Payme webhook error: {e}")
        return jsonify({'error': {'code': -32400, 'message': str(e)}})

# Payment webhooks for Uzum Bank
# Helper function to verify Uzum signature
def verify_uzum_signature():
    import hmac
    import hashlib
    
    uzum_secret = os.getenv('UZUM_SECRET_KEY')
    if not uzum_secret:
        return True  # Skip if not configured
    
    received_signature = request.headers.get('X-Signature', '')
    body = request.get_data()
    
    expected_signature = hmac.new(
        uzum_secret.encode(),
        body,
        hashlib.sha256
    ).hexdigest()
    
    return hmac.compare_digest(expected_signature, received_signature)

@app.route('/api/webhooks/uzum/check', methods=['POST'])
def uzum_check():
    try:
        # SECURITY: Verify HMAC signature
        if os.getenv('UZUM_SECRET_KEY') and not verify_uzum_signature():
            print("Uzum signature verification failed")
            return jsonify({'status': 'ERROR', 'message': 'Invalid signature'}), 401
        
        data = request.json
        print(f"Uzum check webhook: {data}")
        
        order_id = data.get('orderId')
        amount = data.get('amount')
        
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute('SELECT * FROM orders WHERE id = %s', (order_id,))
        order = cur.fetchone()
        cur.close()
        conn.close()
        
        if not order:
            return jsonify({'status': 'ERROR', 'message': 'Order not found'})
        
        if order['total'] != int(amount):
            return jsonify({'status': 'ERROR', 'message': 'Amount mismatch'})
        
        return jsonify({
            'status': 'OK',
            'data': {
                'orderId': order_id,
                'amount': order['total']
            }
        })
        
    except Exception as e:
        print(f"Uzum check error: {e}")
        return jsonify({'status': 'ERROR', 'message': str(e)})

@app.route('/api/webhooks/uzum/create', methods=['POST'])
def uzum_create():
    try:
        # SECURITY: Verify HMAC signature
        if os.getenv('UZUM_SECRET_KEY') and not verify_uzum_signature():
            print("Uzum signature verification failed")
            return jsonify({'status': 'ERROR', 'message': 'Invalid signature'}), 401
        
        data = request.json
        print(f"Uzum create webhook: {data}")
        
        order_id = data.get('orderId')
        transaction_id = data.get('transactionId')
        
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute(
            'UPDATE orders SET payment_id = %s WHERE id = %s',
            (transaction_id, order_id)
        )
        conn.commit()
        cur.close()
        conn.close()
        
        return jsonify({'status': 'OK'})
        
    except Exception as e:
        print(f"Uzum create error: {e}")
        return jsonify({'status': 'ERROR', 'message': str(e)})

@app.route('/api/webhooks/uzum/confirm', methods=['POST'])
def uzum_confirm():
    try:
        # SECURITY: Verify HMAC signature
        if os.getenv('UZUM_SECRET_KEY') and not verify_uzum_signature():
            print("Uzum signature verification failed")
            return jsonify({'status': 'ERROR', 'message': 'Invalid signature'}), 401
        
        data = request.json
        print(f"Uzum confirm webhook: {data}")
        
        transaction_id = data.get('transactionId')
        
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute(
            "UPDATE orders SET payment_status = 'paid', status = 'paid' WHERE payment_id = %s RETURNING id",
            (transaction_id,)
        )
        order = cur.fetchone()
        conn.commit()
        
        if order:
            print(f"✅ Uzum payment successful for order {order['id']}")
        
        cur.close()
        conn.close()
        
        return jsonify({'status': 'OK'})
        
    except Exception as e:
        print(f"Uzum confirm error: {e}")
        return jsonify({'status': 'ERROR', 'message': str(e)})

@app.route('/api/webhooks/uzum/reverse', methods=['POST'])
def uzum_reverse():
    try:
        # SECURITY: Verify HMAC signature
        if os.getenv('UZUM_SECRET_KEY') and not verify_uzum_signature():
            print("Uzum signature verification failed")
            return jsonify({'status': 'ERROR', 'message': 'Invalid signature'}), 401
        
        data = request.json
        print(f"Uzum reverse webhook: {data}")
        
        transaction_id = data.get('transactionId')
        
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute(
            "UPDATE orders SET payment_status = 'cancelled' WHERE payment_id = %s",
            (transaction_id,)
        )
        conn.commit()
        cur.close()
        conn.close()
        
        return jsonify({'status': 'OK'})
        
    except Exception as e:
        print(f"Uzum reverse error: {e}")
        return jsonify({'status': 'ERROR', 'message': str(e)})

@app.route('/api/orders', methods=['GET'])
def get_user_orders():
    try:
        user_id = session.get('user_id')
        
        if not user_id:
            return jsonify({'error': 'Not authenticated'}), 401
        
        conn = get_db_connection()
        cur = conn.cursor()
        
        # Get all orders for user (increased limit for full orders page)
        cur.execute('''
            SELECT id, user_id, total, status, created_at, customer_name, customer_phone, 
                   delivery_address, payment_method
            FROM orders 
            WHERE user_id = %s 
            ORDER BY created_at DESC
            LIMIT 50
        ''', (user_id,))
        orders = cur.fetchall()
        
        # Get items for each order with product images
        for order in orders:
            cur.execute('''
                SELECT oi.id, oi.product_id, oi.name, oi.price, oi.quantity, 
                       oi.selected_color, oi.selected_attributes,
                       p.images[1] as image_url
                FROM order_items oi
                LEFT JOIN products p ON oi.product_id = p.id
                WHERE oi.order_id = %s
            ''', (order['id'],))
            order['items'] = cur.fetchall()
        
        cur.close()
        conn.close()
        
        return jsonify(orders), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ============================================================
# ADMIN API ENDPOINTS
# ============================================================

def require_admin():
    """Check if current user is admin"""
    user_id = session.get('user_id')
    if not user_id:
        return None
    
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute('SELECT is_admin FROM users WHERE id = %s', (user_id,))
    user = cur.fetchone()
    cur.close()
    conn.close()
    
    if user and user.get('is_admin'):
        return user_id
    return None

def require_superadmin():
    """Check if current user is superadmin (main admin)"""
    user_id = session.get('user_id')
    if not user_id:
        return None
    
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute('SELECT is_admin, is_superadmin FROM users WHERE id = %s', (user_id,))
    user = cur.fetchone()
    cur.close()
    conn.close()
    
    if user and user.get('is_superadmin'):
        return user_id
    return None

@app.route('/api/admin/login', methods=['POST'])
def admin_login():
    try:
        data = request.json
        email = data.get('email')
        password = data.get('password')
        
        if not email or not password:
            return jsonify({'error': 'Email and password are required'}), 400
        
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute('SELECT * FROM users WHERE email = %s', (email,))
        user = cur.fetchone()
        cur.close()
        conn.close()
        
        if not user or not user.get('password_hash'):
            return jsonify({'error': 'Invalid credentials'}), 401
        
        if not check_password_hash(user['password_hash'], password):
            return jsonify({'error': 'Invalid credentials'}), 401
        
        if not user.get('is_admin'):
            return jsonify({'error': 'Access denied. Admin privileges required.'}), 403
        
        session.permanent = True
        session['user_id'] = user['id']
        
        return jsonify({
            'user': {
                'id': user['id'],
                'email': user['email'],
                'first_name': user.get('first_name'),
                'is_admin': True
            },
            'message': 'Admin login successful'
        }), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/admin/setup', methods=['POST'])
def admin_setup():
    """One-time admin setup - promotes first user to admin if no admins exist"""
    try:
        data = request.json
        email = data.get('email')
        password = data.get('password')
        
        if not email or not password:
            return jsonify({'error': 'Email and password are required'}), 400
        
        conn = get_db_connection()
        cur = conn.cursor()
        
        # Check if any admin already exists
        cur.execute('SELECT COUNT(*) as count FROM users WHERE is_admin = TRUE')
        admin_count = cur.fetchone()['count']
        
        if admin_count > 0:
            cur.close()
            conn.close()
            return jsonify({'error': 'Admin already exists. Use admin login instead.'}), 403
        
        # Verify user credentials
        cur.execute('SELECT * FROM users WHERE email = %s', (email,))
        user = cur.fetchone()
        
        if not user or not user.get('password_hash'):
            cur.close()
            conn.close()
            return jsonify({'error': 'User not found. Register first.'}), 404
        
        if not check_password_hash(user['password_hash'], password):
            cur.close()
            conn.close()
            return jsonify({'error': 'Invalid credentials'}), 401
        
        # Promote user to superadmin (first admin is always superadmin)
        cur.execute('UPDATE users SET is_admin = TRUE, is_superadmin = TRUE WHERE id = %s RETURNING *', (user['id'],))
        updated_user = cur.fetchone()
        conn.commit()
        
        # Set session
        session.permanent = True
        session['user_id'] = updated_user['id']
        
        cur.close()
        conn.close()
        
        return jsonify({
            'user': {
                'id': updated_user['id'],
                'email': updated_user['email'],
                'first_name': updated_user.get('first_name'),
                'is_admin': True,
                'is_superadmin': True
            },
            'message': 'Admin setup successful. You are now the superadmin.'
        }), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/admin/check-setup', methods=['GET'])
def admin_check_setup():
    """Check if admin setup is needed"""
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute('SELECT COUNT(*) as count FROM users WHERE is_admin = TRUE')
        admin_count = cur.fetchone()['count']
        cur.close()
        conn.close()
        
        return jsonify({
            'needs_setup': admin_count == 0
        }), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/admin/me', methods=['GET'])
def admin_me():
    try:
        admin_id = require_admin()
        if not admin_id:
            return jsonify({'error': 'Not authorized'}), 401
        
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute('SELECT id, email, first_name, last_name, is_admin, is_superadmin FROM users WHERE id = %s', (admin_id,))
        user = cur.fetchone()
        cur.close()
        conn.close()
        
        return jsonify({'user': user}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ============================================================
# ADMIN MANAGEMENT API (Superadmin only)
# ============================================================

@app.route('/api/admin/admins', methods=['GET'])
def get_all_admins():
    """Get list of all admins (superadmin only)"""
    try:
        superadmin_id = require_superadmin()
        if not superadmin_id:
            return jsonify({'error': 'Только главный администратор может управлять админами'}), 403
        
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute('''
            SELECT id, email, first_name, last_name, phone, is_admin, is_superadmin, created_at 
            FROM users 
            WHERE is_admin = TRUE 
            ORDER BY is_superadmin DESC, created_at ASC
        ''')
        admins = cur.fetchall()
        cur.close()
        conn.close()
        
        return jsonify(admins), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/admin/admins/users', methods=['GET'])
def get_users_for_admin():
    """Get list of regular users that can be promoted to admin"""
    try:
        superadmin_id = require_superadmin()
        if not superadmin_id:
            return jsonify({'error': 'Только главный администратор может управлять админами'}), 403
        
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute('''
            SELECT id, email, first_name, last_name, phone, created_at 
            FROM users 
            WHERE is_admin = FALSE OR is_admin IS NULL
            ORDER BY created_at DESC
        ''')
        users = cur.fetchall()
        cur.close()
        conn.close()
        
        return jsonify(users), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/admin/admins', methods=['POST'])
def add_admin():
    """Promote user to admin (superadmin only)"""
    try:
        superadmin_id = require_superadmin()
        if not superadmin_id:
            return jsonify({'error': 'Только главный администратор может добавлять админов'}), 403
        
        data = request.json
        user_id = data.get('user_id')
        
        if not user_id:
            return jsonify({'error': 'ID пользователя обязателен'}), 400
        
        # Convert user_id to string for VARCHAR comparison
        user_id = str(user_id)
        
        conn = get_db_connection()
        cur = conn.cursor()
        
        # Check if user exists
        cur.execute('SELECT id, email, is_admin FROM users WHERE id = %s', (user_id,))
        user = cur.fetchone()
        
        if not user:
            cur.close()
            conn.close()
            return jsonify({'error': 'Пользователь не найден'}), 404
        
        if user.get('is_admin'):
            cur.close()
            conn.close()
            return jsonify({'error': 'Пользователь уже является администратором'}), 400
        
        # Promote to admin
        cur.execute(
            'UPDATE users SET is_admin = TRUE WHERE id = %s RETURNING id, email, first_name, last_name, is_admin, is_superadmin',
            (user_id,)
        )
        updated_user = cur.fetchone()
        conn.commit()
        cur.close()
        conn.close()
        
        return jsonify({
            'message': 'Пользователь назначен администратором',
            'admin': updated_user
        }), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/admin/admins/<admin_id>', methods=['DELETE'])
def remove_admin(admin_id):
    """Remove admin privileges from user (superadmin only)"""
    try:
        superadmin_id = require_superadmin()
        if not superadmin_id:
            return jsonify({'error': 'Только главный администратор может удалять админов'}), 403
        
        # Convert admin_id to string for VARCHAR comparison
        admin_id = str(admin_id)
        
        # Prevent superadmin from removing themselves
        if admin_id == superadmin_id:
            return jsonify({'error': 'Нельзя удалить себя из администраторов'}), 400
        
        conn = get_db_connection()
        cur = conn.cursor()
        
        # Check if target user exists and is admin
        cur.execute('SELECT id, is_admin, is_superadmin FROM users WHERE id = %s', (admin_id,))
        target_user = cur.fetchone()
        
        if not target_user:
            cur.close()
            conn.close()
            return jsonify({'error': 'Пользователь не найден'}), 404
        
        if target_user.get('is_superadmin'):
            cur.close()
            conn.close()
            return jsonify({'error': 'Нельзя удалить главного администратора'}), 400
        
        if not target_user.get('is_admin'):
            cur.close()
            conn.close()
            return jsonify({'error': 'Пользователь не является администратором'}), 400
        
        # Remove admin privileges
        cur.execute(
            'UPDATE users SET is_admin = FALSE WHERE id = %s',
            (admin_id,)
        )
        conn.commit()
        cur.close()
        conn.close()
        
        return jsonify({'message': 'Права администратора удалены'}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# Admin Categories API
@app.route('/api/admin/categories', methods=['GET'])
def admin_get_categories():
    try:
        admin_id = require_admin()
        if not admin_id:
            return jsonify({'error': 'Not authorized'}), 401
        
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute('SELECT * FROM categories ORDER BY sort_order, name')
        categories = cur.fetchall()
        cur.close()
        conn.close()
        
        return jsonify(categories), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/admin/categories', methods=['POST'])
def admin_create_category():
    try:
        admin_id = require_admin()
        if not admin_id:
            return jsonify({'error': 'Not authorized'}), 401
        
        data = request.json
        name = data.get('name')
        icon = data.get('icon', '')
        sort_order = data.get('sort_order', 0)
        
        if not name:
            return jsonify({'error': 'Category name is required'}), 400
        
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute(
            'INSERT INTO categories (name, icon, sort_order) VALUES (%s, %s, %s) RETURNING *',
            (name, icon, sort_order)
        )
        category = cur.fetchone()
        conn.commit()
        cur.close()
        conn.close()
        
        return jsonify(category), 201
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/admin/categories/<category_id>', methods=['PUT'])
def admin_update_category(category_id):
    try:
        admin_id = require_admin()
        if not admin_id:
            return jsonify({'error': 'Not authorized'}), 401
        
        data = request.json
        name = data.get('name')
        icon = data.get('icon', '')
        sort_order = data.get('sort_order', 0)
        
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute(
            'UPDATE categories SET name = %s, icon = %s, sort_order = %s WHERE id = %s RETURNING *',
            (name, icon, sort_order, category_id)
        )
        category = cur.fetchone()
        conn.commit()
        cur.close()
        conn.close()
        
        if category:
            return jsonify(category), 200
        return jsonify({'error': 'Category not found'}), 404
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/admin/categories/<category_id>', methods=['DELETE'])
def admin_delete_category(category_id):
    try:
        admin_id = require_admin()
        if not admin_id:
            return jsonify({'error': 'Not authorized'}), 401
        
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute('DELETE FROM categories WHERE id = %s', (category_id,))
        conn.commit()
        cur.close()
        conn.close()
        
        return jsonify({'message': 'Category deleted'}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# Admin Products API
@app.route('/api/admin/products', methods=['GET'])
def admin_get_products():
    try:
        admin_id = require_admin()
        if not admin_id:
            return jsonify({'error': 'Not authorized'}), 401
        
        category = request.args.get('category')
        search = request.args.get('search')
        
        conn = get_db_connection()
        cur = conn.cursor()
        
        query = 'SELECT * FROM products WHERE 1=1'
        params = []
        
        if category:
            query += ' AND category_id = %s'
            params.append(category)
        
        if search:
            query += ' AND name ILIKE %s'
            params.append(f'%{search}%')
        
        query += ' ORDER BY name'
        
        cur.execute(query, params)
        products = cur.fetchall()
        cur.close()
        conn.close()
        
        return jsonify(products), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/admin/products', methods=['POST'])
def admin_create_product():
    try:
        admin_id = require_admin()
        if not admin_id:
            return jsonify({'error': 'Not authorized'}), 401
        
        data = request.json
        name = data.get('name')
        description = data.get('description', '')
        price = data.get('price')
        images = data.get('images', [])
        category_id = data.get('category_id')
        colors = data.get('colors', [])
        attributes = data.get('attributes')
        
        if not name or price is None:
            return jsonify({'error': 'Name and price are required'}), 400
        
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute(
            '''INSERT INTO products (name, description, price, images, category_id, colors, attributes) 
               VALUES (%s, %s, %s, %s, %s, %s, %s) RETURNING *''',
            (name, description, price, images, category_id, colors, 
             json.dumps(attributes) if attributes else None)
        )
        product = cur.fetchone()
        conn.commit()
        cur.close()
        conn.close()
        
        return jsonify(product), 201
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/admin/products/<product_id>', methods=['PUT'])
def admin_update_product(product_id):
    try:
        admin_id = require_admin()
        if not admin_id:
            return jsonify({'error': 'Not authorized'}), 401
        
        data = request.json
        name = data.get('name')
        description = data.get('description', '')
        price = data.get('price')
        images = data.get('images', [])
        category_id = data.get('category_id')
        colors = data.get('colors', [])
        attributes = data.get('attributes')
        
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute(
            '''UPDATE products SET name = %s, description = %s, price = %s, images = %s, 
               category_id = %s, colors = %s, attributes = %s WHERE id = %s RETURNING *''',
            (name, description, price, images, category_id, colors, 
             json.dumps(attributes) if attributes else None, product_id)
        )
        product = cur.fetchone()
        conn.commit()
        cur.close()
        conn.close()
        
        if product:
            return jsonify(product), 200
        return jsonify({'error': 'Product not found'}), 404
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/admin/products/<product_id>', methods=['DELETE'])
def admin_delete_product(product_id):
    try:
        admin_id = require_admin()
        if not admin_id:
            return jsonify({'error': 'Not authorized'}), 401
        
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute('DELETE FROM products WHERE id = %s', (product_id,))
        conn.commit()
        cur.close()
        conn.close()
        
        return jsonify({'message': 'Product deleted'}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# Admin Orders API
@app.route('/api/admin/orders', methods=['GET'])
def admin_get_orders():
    try:
        admin_id = require_admin()
        if not admin_id:
            return jsonify({'error': 'Not authorized'}), 401
        
        status = request.args.get('status')
        limit = request.args.get('limit', 50, type=int)
        
        conn = get_db_connection()
        cur = conn.cursor()
        
        query = '''
            SELECT o.*, u.email as user_email, u.first_name, u.last_name, u.phone as user_phone
            FROM orders o
            LEFT JOIN users u ON o.user_id = u.id
            WHERE 1=1
        '''
        params = []
        
        if status:
            query += ' AND o.status = %s'
            params.append(status)
        
        query += ' ORDER BY o.created_at DESC LIMIT %s'
        params.append(limit)
        
        cur.execute(query, params)
        orders = cur.fetchall()
        
        # Get items for each order
        for order in orders:
            cur.execute('''
                SELECT oi.*, p.images as product_images
                FROM order_items oi
                LEFT JOIN products p ON oi.product_id = p.id
                WHERE oi.order_id = %s
            ''', (order['id'],))
            order['items'] = cur.fetchall()
        
        cur.close()
        conn.close()
        
        return jsonify(orders), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/admin/orders/<order_id>', methods=['GET'])
def admin_get_order(order_id):
    try:
        admin_id = require_admin()
        if not admin_id:
            return jsonify({'error': 'Not authorized'}), 401
        
        conn = get_db_connection()
        cur = conn.cursor()
        
        cur.execute('''
            SELECT o.*, u.email as user_email, u.first_name, u.last_name, u.phone as user_phone
            FROM orders o
            LEFT JOIN users u ON o.user_id = u.id
            WHERE o.id = %s
        ''', (order_id,))
        order = cur.fetchone()
        
        if not order:
            cur.close()
            conn.close()
            return jsonify({'error': 'Order not found'}), 404
        
        cur.execute('''
            SELECT oi.*, p.images as product_images
            FROM order_items oi
            LEFT JOIN products p ON oi.product_id = p.id
            WHERE oi.order_id = %s
        ''', (order_id,))
        order['items'] = cur.fetchall()
        
        cur.close()
        conn.close()
        
        return jsonify(order), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/admin/orders/<order_id>/status', methods=['PUT'])
def admin_update_order_status(order_id):
    try:
        admin_id = require_admin()
        if not admin_id:
            return jsonify({'error': 'Not authorized'}), 401
        
        data = request.json
        status = data.get('status')
        
        if not status:
            return jsonify({'error': 'Status is required'}), 400
        
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute(
            'UPDATE orders SET status = %s WHERE id = %s RETURNING *',
            (status, order_id)
        )
        order = cur.fetchone()
        conn.commit()
        cur.close()
        conn.close()
        
        if order:
            return jsonify(order), 200
        return jsonify({'error': 'Order not found'}), 404
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ============================================================
# INVENTORY MANAGEMENT API
# ============================================================

def get_inventory_signature(color, attr1_value, attr2_value):
    """Generate a unique signature for inventory combination"""
    parts = [
        color or '',
        attr1_value or '',
        attr2_value or ''
    ]
    return '|'.join(parts)

@app.route('/api/admin/inventory', methods=['GET'])
def admin_get_inventory():
    """Get all inventory items with product info"""
    try:
        admin_id = require_admin()
        if not admin_id:
            return jsonify({'error': 'Not authorized'}), 401
        
        product_id = request.args.get('product_id')
        
        conn = get_db_connection()
        cur = conn.cursor()
        
        if product_id:
            cur.execute('''
                SELECT i.*, p.name as product_name, p.attributes
                FROM product_inventory i
                JOIN products p ON i.product_id = p.id
                WHERE i.product_id = %s
                ORDER BY i.color, i.attribute1_value, i.attribute2_value
            ''', (product_id,))
        else:
            cur.execute('''
                SELECT i.*, p.name as product_name, p.attributes
                FROM product_inventory i
                JOIN products p ON i.product_id = p.id
                ORDER BY p.name, i.color, i.attribute1_value, i.attribute2_value
            ''')
        
        inventory = cur.fetchall()
        cur.close()
        conn.close()
        
        return jsonify(inventory), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/admin/inventory', methods=['POST'])
def admin_add_inventory():
    """Add or update inventory for a product combination"""
    try:
        admin_id = require_admin()
        if not admin_id:
            return jsonify({'error': 'Not authorized'}), 401
        
        data = request.json
        product_id = data.get('product_id')
        color = data.get('color') or None
        attribute1_value = data.get('attribute1_value') or None
        attribute2_value = data.get('attribute2_value') or None
        quantity = data.get('quantity', 0)
        backorder_lead_time_days = data.get('backorder_lead_time_days')
        
        if not product_id:
            return jsonify({'error': 'Product ID is required'}), 400
        
        conn = get_db_connection()
        cur = conn.cursor()
        
        # Upsert inventory record
        cur.execute('''
            INSERT INTO product_inventory (product_id, color, attribute1_value, attribute2_value, quantity, backorder_lead_time_days, updated_at)
            VALUES (%s, %s, %s, %s, %s, %s, CURRENT_TIMESTAMP)
            ON CONFLICT (product_id, color, attribute1_value, attribute2_value) 
            DO UPDATE SET 
                quantity = EXCLUDED.quantity,
                backorder_lead_time_days = EXCLUDED.backorder_lead_time_days,
                updated_at = CURRENT_TIMESTAMP
            RETURNING *
        ''', (product_id, color, attribute1_value, attribute2_value, quantity, backorder_lead_time_days))
        
        inventory = cur.fetchone()
        conn.commit()
        cur.close()
        conn.close()
        
        return jsonify(inventory), 201
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/admin/inventory/<inventory_id>', methods=['PUT'])
def admin_update_inventory(inventory_id):
    """Update inventory quantity"""
    try:
        admin_id = require_admin()
        if not admin_id:
            return jsonify({'error': 'Not authorized'}), 401
        
        data = request.json
        quantity = data.get('quantity')
        backorder_lead_time_days = data.get('backorder_lead_time_days')
        
        conn = get_db_connection()
        cur = conn.cursor()
        
        if quantity is not None and backorder_lead_time_days is not None:
            cur.execute(
                'UPDATE product_inventory SET quantity = %s, backorder_lead_time_days = %s, updated_at = CURRENT_TIMESTAMP WHERE id = %s RETURNING *',
                (quantity, backorder_lead_time_days, inventory_id)
            )
        elif quantity is not None:
            cur.execute(
                'UPDATE product_inventory SET quantity = %s, updated_at = CURRENT_TIMESTAMP WHERE id = %s RETURNING *',
                (quantity, inventory_id)
            )
        elif backorder_lead_time_days is not None:
            cur.execute(
                'UPDATE product_inventory SET backorder_lead_time_days = %s, updated_at = CURRENT_TIMESTAMP WHERE id = %s RETURNING *',
                (backorder_lead_time_days, inventory_id)
            )
        else:
            cur.close()
            conn.close()
            return jsonify({'error': 'No data to update'}), 400
        
        inventory = cur.fetchone()
        conn.commit()
        cur.close()
        conn.close()
        
        if inventory:
            return jsonify(inventory), 200
        return jsonify({'error': 'Inventory not found'}), 404
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/admin/inventory/<inventory_id>', methods=['DELETE'])
def admin_delete_inventory(inventory_id):
    """Delete inventory record"""
    try:
        admin_id = require_admin()
        if not admin_id:
            return jsonify({'error': 'Not authorized'}), 401
        
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute('DELETE FROM product_inventory WHERE id = %s', (inventory_id,))
        conn.commit()
        cur.close()
        conn.close()
        
        return jsonify({'message': 'Inventory deleted'}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/admin/inventory/export', methods=['GET'])
def admin_export_inventory():
    """Export inventory to CSV"""
    try:
        admin_id = require_admin()
        if not admin_id:
            return jsonify({'error': 'Not authorized'}), 401
        
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute('''
            SELECT p.id as product_id, p.name as product_name, 
                   i.color, i.attribute1_value, i.attribute2_value, 
                   i.quantity, i.backorder_lead_time_days
            FROM product_inventory i
            JOIN products p ON i.product_id = p.id
            ORDER BY p.name, i.color, i.attribute1_value, i.attribute2_value
        ''')
        inventory = cur.fetchall()
        cur.close()
        conn.close()
        
        # Generate CSV
        import io
        import csv
        
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(['product_id', 'product_name', 'color', 'attribute1_value', 'attribute2_value', 'quantity', 'backorder_lead_time_days'])
        
        for item in inventory:
            writer.writerow([
                item['product_id'],
                item['product_name'],
                item['color'] or '',
                item['attribute1_value'] or '',
                item['attribute2_value'] or '',
                item['quantity'],
                item['backorder_lead_time_days'] or ''
            ])
        
        csv_content = output.getvalue()
        output.close()
        
        from flask import Response
        return Response(
            csv_content,
            mimetype='text/csv',
            headers={'Content-Disposition': 'attachment; filename=inventory.csv'}
        )
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/admin/inventory/import', methods=['POST'])
def admin_import_inventory():
    """Import inventory from CSV"""
    try:
        admin_id = require_admin()
        if not admin_id:
            return jsonify({'error': 'Not authorized'}), 401
        
        if 'file' not in request.files:
            return jsonify({'error': 'No file provided'}), 400
        
        file = request.files['file']
        if file.filename == '':
            return jsonify({'error': 'No file selected'}), 400
        
        import io
        import csv
        
        stream = io.StringIO(file.stream.read().decode('utf-8'))
        reader = csv.DictReader(stream)
        
        conn = get_db_connection()
        cur = conn.cursor()
        
        imported_count = 0
        errors = []
        
        for row in reader:
            try:
                product_id = row.get('product_id')
                color = row.get('color') or None
                attribute1_value = row.get('attribute1_value') or None
                attribute2_value = row.get('attribute2_value') or None
                quantity = int(row.get('quantity', 0))
                backorder_lead_time_days = int(row.get('backorder_lead_time_days')) if row.get('backorder_lead_time_days') else None
                
                if not product_id:
                    continue
                
                cur.execute('''
                    INSERT INTO product_inventory (product_id, color, attribute1_value, attribute2_value, quantity, backorder_lead_time_days, updated_at)
                    VALUES (%s, %s, %s, %s, %s, %s, CURRENT_TIMESTAMP)
                    ON CONFLICT (product_id, color, attribute1_value, attribute2_value) 
                    DO UPDATE SET 
                        quantity = EXCLUDED.quantity,
                        backorder_lead_time_days = EXCLUDED.backorder_lead_time_days,
                        updated_at = CURRENT_TIMESTAMP
                ''', (product_id, color, attribute1_value, attribute2_value, quantity, backorder_lead_time_days))
                
                imported_count += 1
            except Exception as row_error:
                errors.append(f"Row error: {str(row_error)}")
        
        conn.commit()
        cur.close()
        conn.close()
        
        return jsonify({
            'message': f'Imported {imported_count} inventory records',
            'imported_count': imported_count,
            'errors': errors
        }), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/products/<product_id>/inventory', methods=['GET'])
def get_product_inventory(product_id):
    """Get inventory for a specific product (public API for product detail page)"""
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute('''
            SELECT color, attribute1_value, attribute2_value, quantity, backorder_lead_time_days
            FROM product_inventory
            WHERE product_id = %s
        ''', (product_id,))
        inventory = cur.fetchall()
        cur.close()
        conn.close()
        
        return jsonify(inventory), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# Admin Statistics API
@app.route('/api/admin/statistics', methods=['GET'])
def admin_get_statistics():
    try:
        admin_id = require_admin()
        if not admin_id:
            return jsonify({'error': 'Not authorized'}), 401
        
        conn = get_db_connection()
        cur = conn.cursor()
        
        # Total users
        cur.execute('SELECT COUNT(*) as count FROM users')
        total_users = cur.fetchone()['count']
        
        # Users with orders
        cur.execute('SELECT COUNT(DISTINCT user_id) as count FROM orders')
        users_with_orders = cur.fetchone()['count']
        
        # Total orders
        cur.execute('SELECT COUNT(*) as count FROM orders')
        total_orders = cur.fetchone()['count']
        
        # Total revenue
        cur.execute("SELECT COALESCE(SUM(total), 0) as sum FROM orders WHERE status != 'cancelled'")
        total_revenue = cur.fetchone()['sum']
        
        # Orders by status
        cur.execute('''
            SELECT status, COUNT(*) as count 
            FROM orders 
            GROUP BY status
        ''')
        orders_by_status = {row['status']: row['count'] for row in cur.fetchall()}
        
        # Total products
        cur.execute('SELECT COUNT(*) as count FROM products')
        total_products = cur.fetchone()['count']
        
        # Total categories
        cur.execute('SELECT COUNT(*) as count FROM categories')
        total_categories = cur.fetchone()['count']
        
        # Recent orders (last 7 days)
        cur.execute('''
            SELECT DATE(created_at) as date, COUNT(*) as count, SUM(total) as revenue
            FROM orders 
            WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'
            GROUP BY DATE(created_at)
            ORDER BY date
        ''')
        recent_orders = cur.fetchall()
        
        cur.close()
        conn.close()
        
        return jsonify({
            'total_users': total_users,
            'users_with_orders': users_with_orders,
            'total_orders': total_orders,
            'total_revenue': total_revenue,
            'orders_by_status': orders_by_status,
            'total_products': total_products,
            'total_categories': total_categories,
            'recent_orders': recent_orders
        }), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# Public categories API (for frontend)
@app.route('/api/categories', methods=['GET'])
def get_categories():
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute('SELECT id, name, icon FROM categories ORDER BY sort_order, name')
        categories = cur.fetchall()
        cur.close()
        conn.close()
        
        return jsonify(categories), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ============================================================
# API Blueprint Routes (with /api prefix for Render deployment)
# ============================================================

@api.route('/products', methods=['GET'])
def api_get_products():
    return get_products()

@api.route('/products', methods=['POST'])
def api_create_product():
    return create_product()

@api.route('/products/<product_id>', methods=['GET'])
def api_get_product(product_id):
    return get_product(product_id)

@api.route('/favorites/<user_id>', methods=['GET'])
def api_get_favorites(user_id):
    return get_favorites(user_id)

@api.route('/favorites', methods=['POST'])
def api_add_to_favorites():
    return add_to_favorites()

@api.route('/favorites/<user_id>/<product_id>', methods=['DELETE'])
def api_remove_from_favorites(user_id, product_id):
    return remove_from_favorites(user_id, product_id)

@api.route('/cart/<user_id>', methods=['GET'])
def api_get_cart(user_id):
    return get_cart(user_id)

@api.route('/cart', methods=['POST'])
def api_add_to_cart():
    return add_to_cart()

@api.route('/cart', methods=['PUT'])
def api_update_cart():
    return update_cart_quantity()

@api.route('/cart/<user_id>/<product_id>', methods=['DELETE'])
def api_remove_from_cart(user_id, product_id):
    return remove_from_cart(user_id, product_id)

@api.route('/cart/clear/<user_id>', methods=['DELETE'])
def api_clear_cart(user_id):
    return clear_cart(user_id)

@api.route('/orders', methods=['POST'])
def api_create_order():
    return create_order()

@api.route('/orders/checkout', methods=['POST'])
def api_checkout_order():
    return checkout_order()

# ============================================================
# Image Upload Endpoint (Cloudinary)
# ============================================================

@app.route('/api/upload', methods=['POST'])
def upload_image():
    """Upload image to Cloudinary using server-side credentials from DB or env"""
    try:
        admin_id = require_admin()
        if not admin_id:
            return jsonify({'error': 'Доступ запрещён. Требуются права администратора.'}), 403
        
        config = get_cloudinary_config()
        cloud_name = config['cloud_name']
        api_key = config['api_key']
        api_secret = config['api_secret']
        
        if not all([cloud_name, api_key, api_secret]):
            return jsonify({'error': 'Cloudinary не настроен. Настройте Cloudinary в разделе "Настройки" админ-панели.'}), 500
        
        cloudinary.config(
            cloud_name=cloud_name,
            api_key=api_key,
            api_secret=api_secret
        )
        
        if 'file' not in request.files:
            return jsonify({'error': 'Файл не найден'}), 400
        
        file = request.files['file']
        if file.filename == '':
            return jsonify({'error': 'Файл не выбран'}), 400
        
        result = cloudinary.uploader.upload(
            file,
            folder='telegram_shop_products',
            resource_type='image'
        )
        
        return jsonify({
            'secure_url': result['secure_url'],
            'public_id': result['public_id']
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/upload/receipt', methods=['POST'])
def upload_receipt():
    """Upload payment receipt to Cloudinary - available for authenticated users"""
    try:
        user_id = session.get('user_id')
        if not user_id:
            return jsonify({'error': 'Необходима авторизация'}), 401
        
        config = get_cloudinary_config()
        cloud_name = config['cloud_name']
        api_key = config['api_key']
        api_secret = config['api_secret']
        
        if not all([cloud_name, api_key, api_secret]):
            return jsonify({'error': 'Cloudinary не настроен'}), 500
        
        cloudinary.config(
            cloud_name=cloud_name,
            api_key=api_key,
            api_secret=api_secret
        )
        
        if 'file' not in request.files:
            return jsonify({'error': 'Файл не найден'}), 400
        
        file = request.files['file']
        if file.filename == '':
            return jsonify({'error': 'Файл не выбран'}), 400
        
        result = cloudinary.uploader.upload(
            file,
            folder='telegram_shop_receipts',
            resource_type='image'
        )
        
        return jsonify({
            'secure_url': result['secure_url'],
            'public_id': result['public_id']
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# Admin Settings API
@app.route('/api/admin/settings/cloudinary', methods=['GET'])
def admin_get_cloudinary_settings():
    try:
        admin_id = require_admin()
        if not admin_id:
            return jsonify({'error': 'Not authorized'}), 401
        
        config = get_cloudinary_config()
        return jsonify({
            'cloud_name': config['cloud_name'] or '',
            'api_key': config['api_key'] or '',
            'api_secret': config['api_secret'] or '',
            'has_api_secret': bool(config['api_secret'])
        }), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/admin/settings/cloudinary', methods=['PUT'])
def admin_update_cloudinary_settings():
    try:
        admin_id = require_admin()
        if not admin_id:
            return jsonify({'error': 'Not authorized'}), 401
        
        data = request.json
        cloud_name = data.get('cloud_name', '')
        api_key = data.get('api_key', '')
        api_secret = data.get('api_secret')
        
        set_platform_setting('cloudinary_cloud_name', cloud_name, is_secret=False)
        set_platform_setting('cloudinary_api_key', api_key, is_secret=False)
        
        if api_secret:
            set_platform_setting('cloudinary_api_secret', api_secret, is_secret=True)
        
        return jsonify({'message': 'Настройки Cloudinary сохранены'}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/admin/settings/cloudinary/test', methods=['POST'])
def admin_test_cloudinary():
    try:
        admin_id = require_admin()
        if not admin_id:
            return jsonify({'error': 'Not authorized'}), 401
        
        config = get_cloudinary_config()
        if not config['cloud_name']:
            return jsonify({'success': False, 'error': 'Cloud Name не указан'}), 200
        if not config['api_key']:
            return jsonify({'success': False, 'error': 'API Key не указан'}), 200
        if not config['api_secret']:
            return jsonify({'success': False, 'error': 'API Secret не указан'}), 200
        
        cloudinary.config(
            cloud_name=config['cloud_name'],
            api_key=config['api_key'],
            api_secret=config['api_secret']
        )
        
        try:
            result = cloudinary.api.usage()
            used_percent = 0
            if result.get('credits') and result['credits'].get('limit'):
                used = result['credits'].get('used_percent', 0)
                used_percent = round(used, 1)
            return jsonify({
                'success': True, 
                'message': f'Подключение успешно! Использовано {used_percent}% лимита'
            }), 200
        except cloudinary.exceptions.AuthorizationRequired:
            return jsonify({'success': False, 'error': 'Неверный API Key или API Secret'}), 200
        except cloudinary.exceptions.NotFound:
            return jsonify({'success': False, 'error': 'Cloud Name не найден'}), 200
        except Exception as api_error:
            error_str = str(api_error).lower()
            if 'unauthorized' in error_str or 'invalid' in error_str:
                return jsonify({'success': False, 'error': 'Неверные данные авторизации'}), 200
            elif 'not found' in error_str:
                return jsonify({'success': False, 'error': 'Cloud Name не найден'}), 200
            raise api_error
            
    except Exception as e:
        return jsonify({'success': False, 'error': f'Ошибка проверки: {str(e)}'}), 200

# ============================================================
# Telegram Settings API
# ============================================================

@app.route('/api/admin/settings/telegram', methods=['GET'])
def admin_get_telegram_settings():
    try:
        admin_id = require_admin()
        if not admin_id:
            return jsonify({'error': 'Not authorized'}), 401
        
        config = get_telegram_config()
        return jsonify({
            'bot_token': config['bot_token'] or '',
            'has_bot_token': bool(config['bot_token']),
            'admin_chat_id': config['admin_chat_id'] or '',
            'notifications_enabled': config['notifications_enabled']
        }), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/admin/settings/telegram', methods=['PUT'])
def admin_update_telegram_settings():
    try:
        admin_id = require_admin()
        if not admin_id:
            return jsonify({'error': 'Not authorized'}), 401
        
        data = request.json
        bot_token = data.get('bot_token')
        admin_chat_id = data.get('admin_chat_id', '')
        notifications_enabled = data.get('notifications_enabled', False)
        
        if bot_token:
            set_platform_setting('telegram_bot_token', bot_token, is_secret=True)
        
        set_platform_setting('telegram_admin_chat_id', admin_chat_id, is_secret=False)
        set_platform_setting('telegram_notifications_enabled', 'true' if notifications_enabled else 'false', is_secret=False)
        
        return jsonify({'message': 'Настройки Telegram сохранены'}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/admin/settings/telegram/test', methods=['POST'])
def admin_test_telegram():
    try:
        admin_id = require_admin()
        if not admin_id:
            return jsonify({'error': 'Not authorized'}), 401
        
        config = get_telegram_config()
        if not config['bot_token']:
            return jsonify({'success': False, 'error': 'Bot Token не настроен'}), 200
        
        if not config['admin_chat_id']:
            return jsonify({'success': False, 'error': 'Chat ID не настроен'}), 200
        
        url = f"https://api.telegram.org/bot{config['bot_token']}/sendMessage"
        payload = {
            'chat_id': config['admin_chat_id'],
            'text': '✅ Тестовое сообщение от магазина!\n\nНастройки Telegram работают корректно.',
            'parse_mode': 'HTML'
        }
        
        response = requests.post(url, json=payload, timeout=10)
        
        if response.status_code == 200:
            return jsonify({'success': True, 'message': 'Тестовое сообщение отправлено'}), 200
        else:
            error_data = response.json()
            return jsonify({'success': False, 'error': error_data.get('description', 'Ошибка отправки')}), 200
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 200

# ============================================================
# SMTP Settings API
# ============================================================

@app.route('/api/admin/settings/smtp', methods=['GET'])
def admin_get_smtp_settings():
    try:
        admin_id = require_admin()
        if not admin_id:
            return jsonify({'error': 'Not authorized'}), 401
        
        config = get_smtp_config()
        return jsonify({
            'host': config['host'],
            'port': str(config['port']),
            'user': config['user'],
            'password': config['password'] or '',
            'has_password': bool(config['password']),
            'from_email': config['from_email'],
            'from_name': config['from_name'],
            'use_tls': config['use_tls']
        }), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/admin/settings/smtp', methods=['PUT'])
def admin_update_smtp_settings():
    try:
        admin_id = require_admin()
        if not admin_id:
            return jsonify({'error': 'Not authorized'}), 401
        
        data = request.json
        host = data.get('host', '')
        port = data.get('port', '587')
        user = data.get('user', '')
        password = data.get('password')
        from_email = data.get('from_email', '')
        from_name = data.get('from_name', '')
        use_tls = data.get('use_tls', True)
        
        set_platform_setting('smtp_host', host, is_secret=False)
        set_platform_setting('smtp_port', str(port), is_secret=False)
        set_platform_setting('smtp_user', user, is_secret=False)
        set_platform_setting('smtp_from_email', from_email, is_secret=False)
        set_platform_setting('smtp_from_name', from_name, is_secret=False)
        set_platform_setting('smtp_use_tls', 'true' if use_tls else 'false', is_secret=False)
        
        if password:
            set_platform_setting('smtp_password', password, is_secret=True)
        
        return jsonify({'message': 'Настройки SMTP сохранены'}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/admin/settings/smtp/test', methods=['POST'])
def admin_test_smtp():
    try:
        admin_id = require_admin()
        if not admin_id:
            return jsonify({'error': 'Not authorized'}), 401
        
        config = get_smtp_config()
        if not config['host'] or not config['user'] or not config['password']:
            return jsonify({'success': False, 'error': 'SMTP не полностью настроен (host, user или password отсутствуют)'}), 200
        
        # Get admin email for test
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute('SELECT email FROM users WHERE id = %s', (admin_id,))
        admin_user = cur.fetchone()
        cur.close()
        conn.close()
        
        if not admin_user or not admin_user.get('email'):
            return jsonify({'success': False, 'error': 'Email администратора не найден'}), 200
        
        test_email = admin_user['email']
        
        html_content = """
        <html>
        <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #333;">✅ Тестовое письмо</h2>
            <p>Настройки SMTP работают корректно!</p>
            <p style="color: #666; font-size: 14px;">Это тестовое сообщение от вашего магазина.</p>
        </body>
        </html>
        """
        
        success = send_email(test_email, "Тест SMTP настроек", html_content)
        
        if success:
            return jsonify({'success': True, 'message': f'Тестовое письмо отправлено на {test_email}'}), 200
        else:
            return jsonify({'success': False, 'error': 'Не удалось отправить письмо. Проверьте настройки.'}), 200
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 200

# ============================================================
# Payment Settings API
# ============================================================

@app.route('/api/admin/settings/payments', methods=['GET'])
def admin_get_payment_settings():
    try:
        admin_id = require_admin()
        if not admin_id:
            return jsonify({'error': 'Not authorized'}), 401
        
        click_config = get_payment_config('click')
        payme_config = get_payment_config('payme')
        uzum_config = get_payment_config('uzum')
        card_config = get_payment_config('card_transfer')
        
        return jsonify({
            'click': {
                'merchant_id': click_config['merchant_id'],
                'service_id': click_config['service_id'],
                'secret_key': click_config['secret_key'] or '',
                'has_secret_key': bool(click_config['secret_key']),
                'enabled': click_config['enabled']
            },
            'payme': {
                'merchant_id': payme_config['merchant_id'],
                'key': payme_config['key'] or '',
                'has_key': bool(payme_config['key']),
                'enabled': payme_config['enabled']
            },
            'uzum': {
                'merchant_id': uzum_config['merchant_id'],
                'service_id': uzum_config['service_id'],
                'secret_key': uzum_config['secret_key'] or '',
                'has_secret_key': bool(uzum_config['secret_key']),
                'enabled': uzum_config['enabled']
            },
            'card_transfer': {
                'card_number': card_config['card_number'],
                'card_holder': card_config['card_holder'],
                'bank_name': card_config['bank_name'],
                'enabled': card_config['enabled']
            }
        }), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/admin/settings/payments/click', methods=['PUT'])
def admin_update_click_settings():
    try:
        admin_id = require_admin()
        if not admin_id:
            return jsonify({'error': 'Not authorized'}), 401
        
        data = request.json
        merchant_id = data.get('merchant_id', '')
        service_id = data.get('service_id', '')
        secret_key = data.get('secret_key')
        enabled = data.get('enabled', False)
        
        set_platform_setting('click_merchant_id', merchant_id, is_secret=False)
        set_platform_setting('click_service_id', service_id, is_secret=False)
        set_platform_setting('click_enabled', 'true' if enabled else 'false', is_secret=False)
        
        if secret_key:
            set_platform_setting('click_secret_key', secret_key, is_secret=True)
        
        return jsonify({'message': 'Настройки Click сохранены'}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/admin/settings/payments/payme', methods=['PUT'])
def admin_update_payme_settings():
    try:
        admin_id = require_admin()
        if not admin_id:
            return jsonify({'error': 'Not authorized'}), 401
        
        data = request.json
        merchant_id = data.get('merchant_id', '')
        key = data.get('key')
        enabled = data.get('enabled', False)
        
        set_platform_setting('payme_merchant_id', merchant_id, is_secret=False)
        set_platform_setting('payme_enabled', 'true' if enabled else 'false', is_secret=False)
        
        if key:
            set_platform_setting('payme_key', key, is_secret=True)
        
        return jsonify({'message': 'Настройки Payme сохранены'}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/admin/settings/payments/uzum', methods=['PUT'])
def admin_update_uzum_settings():
    try:
        admin_id = require_admin()
        if not admin_id:
            return jsonify({'error': 'Not authorized'}), 401
        
        data = request.json
        merchant_id = data.get('merchant_id', '')
        service_id = data.get('service_id', '')
        secret_key = data.get('secret_key')
        enabled = data.get('enabled', False)
        
        set_platform_setting('uzum_merchant_id', merchant_id, is_secret=False)
        set_platform_setting('uzum_service_id', service_id, is_secret=False)
        set_platform_setting('uzum_enabled', 'true' if enabled else 'false', is_secret=False)
        
        if secret_key:
            set_platform_setting('uzum_secret_key', secret_key, is_secret=True)
        
        return jsonify({'message': 'Настройки Uzum сохранены'}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/admin/settings/payments/card_transfer', methods=['PUT'])
def admin_update_card_transfer_settings():
    try:
        admin_id = require_admin()
        if not admin_id:
            return jsonify({'error': 'Not authorized'}), 401
        
        data = request.json
        card_number = data.get('card_number', '')
        card_holder = data.get('card_holder', '')
        bank_name = data.get('bank_name', '')
        enabled = data.get('enabled', False)
        
        set_platform_setting('card_transfer_card_number', card_number, is_secret=False)
        set_platform_setting('card_transfer_card_holder', card_holder, is_secret=False)
        set_platform_setting('card_transfer_bank_name', bank_name, is_secret=False)
        set_platform_setting('card_transfer_enabled', 'true' if enabled else 'false', is_secret=False)
        
        return jsonify({'message': 'Настройки перевода на карту сохранены'}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ============================================================
# Yandex Maps Settings API
# ============================================================

def get_yandex_maps_config():
    """Get Yandex Maps config from DB"""
    return {
        'api_key': get_platform_setting('yandex_maps_api_key') or '',
        'default_lat': get_platform_setting('yandex_maps_default_lat') or '41.311081',
        'default_lng': get_platform_setting('yandex_maps_default_lng') or '69.240562',
        'default_zoom': get_platform_setting('yandex_maps_default_zoom') or '12'
    }

@app.route('/api/admin/settings/yandex_maps', methods=['GET'])
def admin_get_yandex_maps_settings():
    try:
        admin_id = require_admin()
        if not admin_id:
            return jsonify({'error': 'Not authorized'}), 401
        
        config = get_yandex_maps_config()
        return jsonify({
            'api_key': config['api_key'],
            'default_lat': config['default_lat'],
            'default_lng': config['default_lng'],
            'default_zoom': config['default_zoom']
        }), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/admin/settings/yandex_maps', methods=['PUT'])
def admin_update_yandex_maps_settings():
    try:
        admin_id = require_admin()
        if not admin_id:
            return jsonify({'error': 'Not authorized'}), 401
        
        data = request.json
        api_key = data.get('api_key', '')
        default_lat = data.get('default_lat', '41.311081')
        default_lng = data.get('default_lng', '69.240562')
        default_zoom = data.get('default_zoom', '12')
        
        set_platform_setting('yandex_maps_api_key', api_key, is_secret=False)
        set_platform_setting('yandex_maps_default_lat', default_lat, is_secret=False)
        set_platform_setting('yandex_maps_default_lng', default_lng, is_secret=False)
        set_platform_setting('yandex_maps_default_zoom', default_zoom, is_secret=False)
        
        return jsonify({'message': 'Настройки Яндекс.Карт сохранены'}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/admin/settings/yandex_maps/test', methods=['POST'])
def admin_test_yandex_maps():
    try:
        admin_id = require_admin()
        if not admin_id:
            return jsonify({'error': 'Not authorized'}), 401
        
        config = get_yandex_maps_config()
        api_key = config.get('api_key')
        
        if not api_key:
            return jsonify({
                'success': False,
                'error': 'API ключ не настроен'
            }), 200
        
        test_url = f"https://geocode-maps.yandex.ru/1.x/?apikey={api_key}&geocode=Москва&format=json&results=1"
        
        response = requests.get(test_url, timeout=10)
        
        if response.status_code == 200:
            data = response.json()
            if 'response' in data:
                return jsonify({
                    'success': True,
                    'message': 'Подключение к Яндекс.Картам успешно!'
                }), 200
            elif 'error' in data:
                error_msg = data.get('error', {}).get('message', 'Неизвестная ошибка')
                return jsonify({
                    'success': False,
                    'error': f'Ошибка API: {error_msg}'
                }), 200
        elif response.status_code == 403:
            return jsonify({
                'success': False,
                'error': 'Неверный API ключ или доступ запрещён'
            }), 200
        else:
            return jsonify({
                'success': False,
                'error': f'Ошибка сервера Яндекс: {response.status_code}'
            }), 200
            
    except requests.exceptions.Timeout:
        return jsonify({
            'success': False,
            'error': 'Превышено время ожидания ответа от Яндекс'
        }), 200
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 200

# Delivery settings API
@app.route('/api/admin/settings/delivery', methods=['GET'])
def admin_get_delivery_settings():
    try:
        admin_id = require_admin()
        if not admin_id:
            return jsonify({'error': 'Not authorized'}), 401
        
        delivery_days_in_stock = get_platform_setting('delivery_days_in_stock')
        delivery_days_backorder = get_platform_setting('delivery_days_backorder')
        
        return jsonify({
            'delivery_days_in_stock': int(delivery_days_in_stock) if delivery_days_in_stock else 3,
            'delivery_days_backorder': int(delivery_days_backorder) if delivery_days_backorder else 14
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/admin/settings/delivery', methods=['POST'])
def admin_update_delivery_settings():
    try:
        admin_id = require_admin()
        if not admin_id:
            return jsonify({'error': 'Not authorized'}), 401
        
        data = request.json
        delivery_days_in_stock = data.get('delivery_days_in_stock', 3)
        delivery_days_backorder = data.get('delivery_days_backorder', 14)
        
        set_platform_setting('delivery_days_in_stock', str(delivery_days_in_stock), is_secret=False)
        set_platform_setting('delivery_days_backorder', str(delivery_days_backorder), is_secret=False)
        
        return jsonify({'message': 'Настройки доставки сохранены'}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# Register the API blueprint
app.register_blueprint(api)

# SEO: Sitemap.xml
@app.route('/sitemap.xml')
def sitemap():
    conn = None
    try:
        host = request.host_url.rstrip('/')
        
        conn = get_db_connection()
        cur = conn.cursor()
        
        cur.execute('SELECT id FROM products')
        products = cur.fetchall()
        
        categories = []
        try:
            cur.execute('SELECT id FROM categories')
            categories = cur.fetchall()
        except Exception:
            pass
        
        cur.close()
        
        xml = '<?xml version="1.0" encoding="UTF-8"?>\n'
        xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        
        xml += f'  <url>\n    <loc>{host}/</loc>\n    <changefreq>daily</changefreq>\n    <priority>1.0</priority>\n  </url>\n'
        
        for cat in categories:
            xml += f'  <url>\n    <loc>{host}/?category={cat["id"]}</loc>\n    <changefreq>weekly</changefreq>\n    <priority>0.8</priority>\n  </url>\n'
        
        for product in products:
            xml += f'  <url>\n    <loc>{host}/product/{product["id"]}</loc>\n    <changefreq>weekly</changefreq>\n    <priority>0.7</priority>\n  </url>\n'
        
        xml += '</urlset>'
        
        response = app.response_class(response=xml, status=200, mimetype='application/xml')
        return response
    except Exception as e:
        print(f"Sitemap error: {e}")
        return '', 500
    finally:
        if conn:
            conn.close()

# SEO: Robots.txt
@app.route('/robots.txt')
def robots():
    host = request.host_url.rstrip('/')
    content = f"""User-agent: *
Allow: /
Disallow: /admin
Disallow: /cart
Disallow: /favorites
Disallow: /orders
Disallow: /login
Disallow: /registration
Disallow: /forgot-password
Disallow: /reset-password
Disallow: /api/

Sitemap: {host}/sitemap.xml
"""
    return app.response_class(response=content, status=200, mimetype='text/plain')

# Serve static assets (JS, CSS, images)
@app.route('/assets/<path:filename>')
def serve_assets(filename):
    return send_from_directory(os.path.join(app.static_folder, 'assets'), filename)

# SEO: Generate HTML with meta tags for product pages
def get_seo_html(product=None):
    try:
        with open(os.path.join(app.static_folder, 'index.html'), 'r', encoding='utf-8') as f:
            html = f.read()
    except Exception:
        return None
    
    config = load_config()
    host = request.host_url.rstrip('/')
    shop_name = config.get('shopName', 'Shop')
    shop_desc = config.get('description', '')
    logo = config.get('logo', '/config/logo.svg')
    logo_url = logo if logo.startswith('http') else f"{host}{logo}"
    
    if product:
        title = f"{product['name']} | {shop_name}"
        description = product.get('description', shop_desc)[:160]
        image = product['images'][0] if product.get('images') else logo_url
        image_url = image if image.startswith('http') else f"{host}{image}"
        url = f"{host}/product/{product['id']}"
        
        schema = {
            "@context": "https://schema.org",
            "@type": "Product",
            "name": product['name'],
            "description": product.get('description', ''),
            "image": [img if img.startswith('http') else f"{host}{img}" for img in product.get('images', [])],
            "offers": {
                "@type": "Offer",
                "price": product['price'],
                "priceCurrency": config.get('currency', {}).get('code', 'UZS'),
                "availability": "https://schema.org/InStock",
                "url": url
            }
        }
    else:
        title = shop_desc or shop_name
        description = shop_desc
        image_url = logo_url
        url = host
        schema = {
            "@context": "https://schema.org",
            "@type": "Organization",
            "name": shop_name,
            "description": shop_desc,
            "url": host,
            "logo": logo_url
        }
    
    meta_tags = f'''
    <title>{title}</title>
    <meta name="description" content="{description}">
    <meta property="og:title" content="{title}">
    <meta property="og:description" content="{description}">
    <meta property="og:image" content="{image_url}">
    <meta property="og:url" content="{url}">
    <meta property="og:type" content="{'product' if product else 'website'}">
    <meta property="og:site_name" content="{shop_name}">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="{title}">
    <meta name="twitter:description" content="{description}">
    <meta name="twitter:image" content="{image_url}">
    <link rel="canonical" href="{url}">
    <script type="application/ld+json">{json.dumps(schema)}</script>
    '''
    
    html = html.replace('<title>Загрузка...</title>', meta_tags)
    html = html.replace('Cache-Control', 'X-Original-Cache-Control')
    
    response = app.response_class(response=html, status=200, mimetype='text/html')
    response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
    return response

# Serve React App - catch-all route for SPA
@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def serve_react(path):
    if path.startswith('api/'):
        return jsonify({'error': 'Not found'}), 404
    
    if path.startswith('product/'):
        product_id = path.replace('product/', '')
        conn = None
        try:
            conn = get_db_connection()
            cur = conn.cursor()
            cur.execute('SELECT id, name, description, price, images FROM products WHERE id = %s', (product_id,))
            product = cur.fetchone()
            cur.close()
            if product:
                result = get_seo_html(product)
                if result:
                    return result
        except Exception as e:
            print(f"SEO product error: {e}")
        finally:
            if conn:
                conn.close()
    
    if path == '' or path == '/':
        result = get_seo_html()
        if result:
            return result
    
    return send_from_directory(app.static_folder, 'index.html')

# Initialize database tables on startup
try:
    init_db()
    print("Database tables initialized successfully")
except Exception as e:
    print(f"Warning: Could not initialize database tables: {e}")

# Production: Gunicorn will use the 'app' object directly
# For local development, you can still run: python app.py
if __name__ == '__main__':
    port = int(os.getenv('PORT', 5000))
    app.run(host='0.0.0.0', port=port)
