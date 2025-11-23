from flask import Flask, jsonify, request, send_from_directory, Blueprint, session
import psycopg2
from psycopg2.extras import RealDictCursor
import os
import requests
from datetime import datetime
from werkzeug.security import generate_password_hash, check_password_hash
import secrets

app = Flask(__name__, static_folder='dist/public', static_url_path='')
app.secret_key = os.environ.get("SESSION_SECRET", secrets.token_hex(32))

# Create API Blueprint with /api prefix for Render deployment
api = Blueprint('api', __name__, url_prefix='/api')


# Database connection
def get_db_connection():
    # Use DATABASE_URL if available, otherwise build from individual vars
    database_url = os.getenv('DATABASE_URL')
    
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
        END $$;
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
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
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
    
    conn.commit()
    cur.close()
    conn.close()

# API Routes

@app.route('/api/config', methods=['GET'])
def get_config():
    try:
        import json
        from flask import Response
        config_path = os.path.join(os.path.dirname(__file__), 'config', 'settings.json')
        with open(config_path, 'r', encoding='utf-8') as f:
            config = json.load(f)
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
        cur.close()
        conn.close()
        
        if product:
            return jsonify(product)
        return jsonify({'error': 'Product not found'}), 404
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

# Telegram Auth
@app.route('/api/auth/telegram', methods=['POST'])
def telegram_auth():
    try:
        data = request.json
        telegram_id = data.get('telegram_id')
        first_name = data.get('first_name', '')
        last_name = data.get('last_name', '')
        username = data.get('username', '')
        
        if not telegram_id:
            return jsonify({'error': 'telegram_id is required'}), 400
        
        conn = get_db_connection()
        cur = conn.cursor()
        
        # Check if user exists
        cur.execute('SELECT * FROM users WHERE telegram_id = %s', (telegram_id,))
        user = cur.fetchone()
        
        if user:
            # User exists, return user data
            session['user_id'] = user['id']
            cur.close()
            conn.close()
            return jsonify({'user': user, 'is_new': False})
        else:
            # Create new user
            cur.execute(
                'INSERT INTO users (telegram_id, username, first_name, last_name) VALUES (%s, %s, %s, %s) RETURNING *',
                (telegram_id, username, first_name, last_name)
            )
            new_user = cur.fetchone()
            conn.commit()
            session['user_id'] = new_user['id']
            cur.close()
            conn.close()
            return jsonify({'user': new_user, 'is_new': True}), 201
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# Email/Password Auth
@app.route('/api/auth/register', methods=['POST'])
def register():
    try:
        data = request.json
        email = data.get('email')
        password = data.get('password')
        first_name = data.get('first_name', '')
        last_name = data.get('last_name', '')
        phone = data.get('phone', '')
        telegram_username = data.get('telegram_username', '')
        
        if not email or not password:
            return jsonify({'error': 'Email and password are required'}), 400
        
        if len(password) < 6:
            return jsonify({'error': 'Password must be at least 6 characters'}), 400
        
        conn = get_db_connection()
        cur = conn.cursor()
        
        # Check if user with this email already exists
        cur.execute('SELECT id FROM users WHERE email = %s', (email,))
        existing_user = cur.fetchone()
        
        if existing_user:
            cur.close()
            conn.close()
            return jsonify({'error': 'User with this email already exists'}), 400
        
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
        session['user_id'] = new_user['id']
        
        return jsonify({'user': new_user, 'message': 'Registration successful'}), 201
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

@app.route('/api/cart', methods=['POST'])
def add_to_cart():
    try:
        data = request.json
        user_id = data['user_id']
        product_id = data['product_id']
        quantity = data.get('quantity', 1)
        selected_color = data.get('selected_color')
        selected_attributes = data.get('selected_attributes')
        
        conn = get_db_connection()
        cur = conn.cursor()
        
        # Check if exact same item (product + color + attributes) exists
        import json as json_lib
        cur.execute(
            '''SELECT id, quantity FROM cart 
               WHERE user_id = %s AND product_id = %s 
               AND (selected_color = %s OR (selected_color IS NULL AND %s IS NULL))
               AND (selected_attributes::text = %s OR (selected_attributes IS NULL AND %s IS NULL))''',
            (user_id, product_id, selected_color, selected_color, 
             json_lib.dumps(selected_attributes) if selected_attributes else None,
             json_lib.dumps(selected_attributes) if selected_attributes else None)
        )
        existing = cur.fetchone()
        
        if existing:
            # Update quantity if same item exists
            new_quantity = existing['quantity'] + quantity
            cur.execute(
                '''UPDATE cart SET quantity = %s 
                   WHERE id = %s RETURNING *''',
                (new_quantity, existing['id'])
            )
        else:
            # Insert new cart item
            cur.execute(
                '''INSERT INTO cart (user_id, product_id, quantity, selected_color, selected_attributes) 
                   VALUES (%s, %s, %s, %s, %s) RETURNING *''',
                (user_id, product_id, quantity, selected_color, 
                 json_lib.dumps(selected_attributes) if selected_attributes else None)
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

@app.route('/api/cart/<user_id>', methods=['DELETE'])
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

# Telegram notification function
def send_telegram_notification(user_info, cart_items, total):
    bot_token = os.getenv('TELEGRAM_BOT_TOKEN')
    chat_id = os.getenv('TELEGRAM_CHAT_ID')
    
    print(f"🔔 Attempting to send Telegram notification...")
    print(f"Bot token exists: {bool(bot_token)}")
    print(f"Chat ID exists: {bool(chat_id)}")
    
    if not bot_token or not chat_id:
        print("❌ Telegram credentials not configured")
        return False
    
    # Format the order message with detailed information
    first_name = user_info.get('first_name', '')
    last_name = user_info.get('last_name', '')
    username = user_info.get('username', '')
    telegram_id = user_info.get('telegram_id')
    user_id = user_info.get('id', '')
    
    # Build full name
    full_name = f"{first_name} {last_name}".strip()
    if not full_name:
        full_name = username or 'Неизвестный'
    
    # HTML escape helper function
    def escape_html(text):
        if text is None:
            return ''
        return str(text).replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
    
    # Calculate order details
    total_items = sum(item['quantity'] for item in cart_items)
    order_time = datetime.now().strftime('%d.%m.%Y в %H:%M')
    
    # Start building message with HTML formatting
    message = "🔔 <b>НОВЫЙ ЗАКАЗ</b>\n"
    message += "========================\n\n"
    
    # User information section
    message += "👤 <b>ИНФОРМАЦИЯ О КЛИЕНТЕ</b>\n"
    message += f"ФИО: <b>{escape_html(full_name)}</b>\n"
    
    if username:
        message += f"Username: @{escape_html(username)}\n"
    
    if telegram_id:
        message += f"Telegram ID: {telegram_id}\n"
    
    message += f"ID пользователя: {escape_html(user_id)}\n"
    message += f"Дата заказа: {order_time}\n\n"
    
    # Order details section
    message += "📦 <b>ДЕТАЛИ ЗАКАЗА</b>\n"
    message += f"Всего позиций: {len(cart_items)} шт.\n"
    message += f"Общее количество: {total_items} ед.\n\n"
    
    # Items list
    message += "🛒 <b>СОСТАВ ЗАКАЗА</b>\n"
    for idx, item in enumerate(cart_items, 1):
        item_name = escape_html(item['name'])
        item_quantity = item['quantity']
        item_price = item['price']
        item_total = item_price * item_quantity
        
        message += f"{idx}. <b>{item_name}</b>\n"
        
        # Show selected color if exists
        if item.get('selected_color'):
            message += f"   Цвет: {escape_html(item['selected_color'])}\n"
        
        # Show selected attributes if exists
        if item.get('selected_attributes'):
            import json as json_lib
            attrs = item['selected_attributes']
            if isinstance(attrs, str):
                attrs = json_lib.loads(attrs)
            if attrs:
                for attr_name, attr_value in attrs.items():
                    message += f"   {escape_html(attr_name)}: {escape_html(attr_value)}\n"
        
        message += f"   Цена: {item_price:,} сум x {item_quantity} шт.\n"
        message += f"   Сумма: <b>{item_total:,} сум</b>\n\n"
    
    # Total section
    message += "========================\n"
    message += f"💰 <b>ИТОГО К ОПЛАТЕ: {total:,} сум</b>\n"
    message += "========================"
    
    # Send message via Telegram Bot API
    url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
    payload = {
        'chat_id': chat_id,
        'text': message,
        'parse_mode': 'HTML'
    }
    
    try:
        print(f"📤 Sending message to Telegram...")
        print(f"Message preview: {message[:100]}...")
        response = requests.post(url, json=payload, timeout=10)
        if response.status_code == 200:
            print(f"✅ Telegram notification sent successfully!")
            return True
        else:
            print(f"❌ Telegram API error (status {response.status_code}): {response.text}")
            return False
    except Exception as e:
        print(f"❌ Failed to send Telegram notification: {e}")
        return False

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
            (user_id, total, 'pending')
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
        
        # Send Telegram notification
        notification_sent = send_telegram_notification(user_info, cart_items, total)
        if notification_sent:
            print(f"✅ Order notification sent successfully")
        else:
            print(f"⚠️ Order notification failed to send")
        
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

@app.route('/api/orders', methods=['GET'])
def get_user_orders():
    try:
        user_id = session.get('user_id')
        
        if not user_id:
            return jsonify({'error': 'Not authenticated'}), 401
        
        conn = get_db_connection()
        cur = conn.cursor()
        
        # Get last 3 orders for user
        cur.execute('''
            SELECT id, user_id, total, status, created_at 
            FROM orders 
            WHERE user_id = %s 
            ORDER BY created_at DESC
            LIMIT 3
        ''', (user_id,))
        orders = cur.fetchall()
        
        # Get items for each order
        for order in orders:
            cur.execute('''
                SELECT id, product_id, name, price, quantity, selected_color, selected_attributes 
                FROM order_items 
                WHERE order_id = %s
            ''', (order['id'],))
            order['items'] = cur.fetchall()
        
        cur.close()
        conn.close()
        
        return jsonify(orders), 200
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

@api.route('/auth/telegram', methods=['POST'])
def api_auth_telegram():
    return telegram_auth()

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

@api.route('/cart/<user_id>', methods=['DELETE'])
def api_clear_cart(user_id):
    return clear_cart(user_id)

@api.route('/orders', methods=['POST'])
def api_create_order():
    return create_order()

# Register the API blueprint
app.register_blueprint(api)

# Serve React App - this must be the last route
@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def serve_react(path):
    # If path is a file and exists in static folder, serve it
    if path and os.path.exists(os.path.join(app.static_folder, path)):
        return send_from_directory(app.static_folder, path)
    # Otherwise, serve index.html for SPA routing
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
