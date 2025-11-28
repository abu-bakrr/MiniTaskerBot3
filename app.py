from flask import Flask, jsonify, request, send_from_directory, Blueprint, session
import psycopg2
from psycopg2.extras import RealDictCursor
import os
import json
import base64
from datetime import datetime, timedelta
from werkzeug.security import generate_password_hash, check_password_hash
import cloudinary
import cloudinary.uploader

app = Flask(__name__, static_folder='dist/public', static_url_path='/static')
app.secret_key = os.environ.get("SESSION_SECRET")
app.config['PERMANENT_SESSION_LIFETIME'] = timedelta(days=30)

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
        END $$;
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
        session.permanent = True
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
        
        # Create order in database with delivery info
        cur.execute(
            '''INSERT INTO orders (user_id, total, status, payment_method, payment_status, 
               delivery_address, delivery_lat, delivery_lng, customer_phone, customer_name) 
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s) RETURNING *''',
            (user_id, total, 'pending', payment_method, 'pending',
             delivery_address, delivery_lat, delivery_lng, customer_phone, customer_name)
        )
        order = cur.fetchone()
        order_id = order['id']
        
        # Insert order items from database cart data
        for item in cart_items:
            cur.execute(
                '''INSERT INTO order_items (order_id, product_id, name, price, quantity, selected_color, selected_attributes) 
                   VALUES (%s, %s, %s, %s, %s, %s, %s)''',
                (order_id, item['product_id'], item['name'], item['price'], 
                 item['quantity'], item.get('selected_color'),
                 item.get('selected_attributes'))
            )
        
        conn.commit()
        
        # Generate payment URL based on payment method
        payment_url = None
        
        # Load payment config
        config_path = os.path.join(os.path.dirname(__file__), 'config', 'settings.json')
        with open(config_path, 'r', encoding='utf-8') as f:
            config = json.load(f)
        
        payment_config = config.get('payment', {})
        
        if payment_method == 'click':
            click_config = payment_config.get('click', {})
            merchant_id = click_config.get('merchantId') or os.getenv('CLICK_MERCHANT_ID')
            service_id = click_config.get('serviceId') or os.getenv('CLICK_SERVICE_ID')
            
            if merchant_id and service_id:
                # Click payment URL format
                payment_url = f"https://my.click.uz/services/pay?service_id={service_id}&merchant_id={merchant_id}&amount={total}&transaction_param={order_id}"
                
        elif payment_method == 'payme':
            payme_config = payment_config.get('payme', {})
            merchant_id = payme_config.get('merchantId') or os.getenv('PAYME_MERCHANT_ID')
            
            if merchant_id:
                # Payme payment URL format (amount in tiyins)
                import base64
                amount_tiyins = total * 100
                # Encode account data
                account_data = f"m={merchant_id};ac.order_id={order_id};a={amount_tiyins}"
                encoded = base64.b64encode(account_data.encode()).decode()
                payment_url = f"https://checkout.paycom.uz/{encoded}"
                
        elif payment_method == 'uzum':
            uzum_config = payment_config.get('uzum', {})
            merchant_id = uzum_config.get('merchantId') or os.getenv('UZUM_MERCHANT_ID')
            
            if merchant_id:
                # Uzum Bank payment - they use webhook system
                # For now, store order and redirect to Uzum payment page
                payment_url = f"https://payment.apelsin.uz/merchant?merchantId={merchant_id}&amount={total}&orderId={order_id}"
        
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
        
        # SECURITY: Verify signature
        click_secret = os.getenv('CLICK_SECRET_KEY')
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
        
        # SECURITY: Verify signature
        click_secret = os.getenv('CLICK_SECRET_KEY')
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
        
        # Get last 5 orders for user
        cur.execute('''
            SELECT id, user_id, total, status, created_at 
            FROM orders 
            WHERE user_id = %s 
            ORDER BY created_at DESC
            LIMIT 5
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
        
        # Promote user to admin
        cur.execute('UPDATE users SET is_admin = TRUE WHERE id = %s RETURNING *', (user['id'],))
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
                'is_admin': True
            },
            'message': 'Admin setup successful. You are now the admin.'
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
        cur.execute('SELECT id, email, first_name, last_name, is_admin FROM users WHERE id = %s', (admin_id,))
        user = cur.fetchone()
        cur.close()
        conn.close()
        
        return jsonify({'user': user}), 200
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

@api.route('/cart/<user_id>', methods=['DELETE'])
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
    """Upload image to Cloudinary using server-side credentials"""
    try:
        admin_id = require_admin()
        if not admin_id:
            return jsonify({'error': 'Доступ запрещён. Требуются права администратора.'}), 403
        
        cloud_name = os.getenv('CLOUDINARY_CLOUD_NAME')
        api_key = os.getenv('CLOUDINARY_API_KEY')
        api_secret = os.getenv('CLOUDINARY_API_SECRET')
        
        if not all([cloud_name, api_key, api_secret]):
            return jsonify({'error': 'Cloudinary не настроен. Добавьте CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET в переменные окружения.'}), 500
        
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

# Register the API blueprint
app.register_blueprint(api)

# Serve static assets (JS, CSS, images)
@app.route('/assets/<path:filename>')
def serve_assets(filename):
    return send_from_directory(os.path.join(app.static_folder, 'assets'), filename)

# Serve React App - catch-all route for SPA
@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def serve_react(path):
    # Skip API routes (handled by Blueprint)
    if path.startswith('api/'):
        return jsonify({'error': 'Not found'}), 404
    # Serve index.html for all other routes (SPA routing)
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
