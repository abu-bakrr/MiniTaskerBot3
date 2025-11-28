# Universal E-Commerce Website Template

## Overview

This project provides a universal, configurable template for creating e-commerce websites. Its primary purpose is to enable users to set up an online shop by modifying JSON configuration files, eliminating the need for code changes. Key capabilities include a responsive design optimized for both mobile and desktop, customizable color palettes, and modern web interactions. The template aims to simplify the creation and deployment of e-commerce solutions on VPS servers, offering a robust and flexible platform for various businesses.

## User Preferences

I prefer iterative development with clear, concise explanations at each step. I like clean, functional code and expect the agent to ask before making any significant architectural or design changes. Do not make changes to files within the `docs/` folder.

## System Architecture

### Frontend

The frontend is built with React 18 and TypeScript, utilizing Vite for building and development. Data fetching and state management are handled by TanStack Query (React Query). UI components leverage Shadcn/ui, built on Radix UI primitives, styled with Tailwind CSS for dynamic theming. The design is fully responsive with a 2-column grid on mobile devices and 4-column grid on desktop. Core features include email/password authentication, a `useConfig` hook for global configuration access, `ThemeApplier` for dynamic color scheme injection, `FontLoader` for custom font management, and a `formatPrice` utility for currency display.

### Backend

The backend is a Flask 3.1.2 application, written in Python. It uses `psycopg2-binary` for PostgreSQL database interactions and serves the pre-built React frontend.

**API Endpoints:**
- `GET /api/config`: Retrieves shop configuration.
- `GET /config/<filename>`: Serves static files from the config directory.
- `GET /api/categories`: Lists all product categories.
- `GET /api/products`: Lists products, with optional category filtering.
- `GET /api/products/<id>`: Retrieves a single product by ID.
- `POST /api/auth/register`: User registration with email and password.
- `POST /api/auth/login`: User login with email and password.
- `GET /api/auth/me`: Get current authenticated user.
- `POST /api/auth/logout`: User logout.
- Additional endpoints support cart, favorites, and orders functionality.

### Database

The system uses PostgreSQL (deployed on VPS). The database schema includes tables for `users`, `categories`, `products`, `favorites`, `cart`, `orders`, and `order_items`. Product details include colors (TEXT[] array) and up to two universal attributes (JSONB: name + values). UI/branding configurations reside in JSON files. User authentication uses email/password with secure password hashing. Orders are saved to the database for tracking and management. The system supports automatic database initialization on VPS deployment.

### Admin Panel

The system includes a comprehensive admin panel accessible at `/admin`:

**Features:**
- **Products Tab**: Add, edit, delete products with Cloudinary image upload support
- **Categories Tab**: Full CRUD operations for product categories (stored in database)
- **Orders Tab**: View all orders with customer info, product images, and status management
- **Statistics Tab**: User counts, order metrics, revenue statistics, conversion rates
- **Settings Tab**: Configure Cloudinary credentials (cloud_name, api_key, api_secret) with encrypted storage

**Admin API Endpoints:**
- `POST /api/admin/login`: Admin authentication
- `GET /api/admin/me`: Get admin user info
- `GET/POST /api/admin/categories`: Category management
- `PUT/DELETE /api/admin/categories/<id>`: Update/delete category
- `GET/POST /api/admin/products`: Product management
- `PUT/DELETE /api/admin/products/<id>`: Update/delete product
- `GET /api/admin/orders`: Get all orders with filters
- `PUT /api/admin/orders/<id>/status`: Update order status
- `GET /api/admin/statistics`: Get shop statistics
- `GET/PUT /api/admin/settings/cloudinary`: Cloudinary configuration (encrypted storage)
- `POST /api/admin/settings/cloudinary/test`: Test Cloudinary connection

**Admin Setup:**
1. Create a user account via registration on the main site
2. Go to `/admin/login` - the system automatically detects if no admin exists
3. If no admin exists, enter your credentials to become the first admin
4. Alternatively, manually set admin via SQL:
   ```sql
   UPDATE users SET is_admin = TRUE WHERE email = 'your-admin@email.com';
   ```

### Configuration

All shop settings are centralized in `config/settings.json`, covering:
- `shopName`, `description`, `logo`
- `currency`: `symbol`, `code`, `position`
- `managerContact`: Telegram handle
- `colorScheme`: Customizable pastel palette (e.g., `background`, `foreground`, `primary`)
- `sortOptions`: Dynamic sort options with emojis
- `ui`: `maxWidth`, `productsPerPage`, `showCategoryIcons`, `showPriceFilter`
- `texts`: Customizable UI labels
- `fonts`: `fontFamily`, `fontFile`, `productName` (weight), `price` (weight), `description` (weight)
- `logoSize`: Configurable logo display size

### Deployment

Deployment supports fully automated (`auto_deploy.sh`) and interactive (`deploy_vps.sh`) methods for Ubuntu 22.04 VPS environments. It handles environment variable setup, GitHub integration for cloning, automatic database initialization, Nginx configuration as a reverse proxy, and optional Telegram bot deployment as a systemd service. Remote database access can be enabled via `enable_remote_db.sh`. The Flask backend runs on port 5000 and is served through Nginx.

## Payment Integration

The system supports three Uzbekistan payment gateways:

### Click
- **Webhook URLs:** `/api/webhooks/click/prepare`, `/api/webhooks/click/complete`
- **Required Environment Variables:**
  - `CLICK_MERCHANT_ID` - Merchant ID from Click cabinet
  - `CLICK_SERVICE_ID` - Service ID from Click cabinet
  - `CLICK_SECRET_KEY` - Secret key for signature verification

### Payme
- **Webhook URL:** `/api/webhooks/payme` (JSON-RPC API)
- **Required Environment Variables:**
  - `PAYME_MERCHANT_ID` - Merchant ID from Payme cabinet
  - `PAYME_KEY` - Secret key for Basic Auth verification

### Uzum Bank
- **Webhook URLs:** `/api/webhooks/uzum/check`, `/api/webhooks/uzum/create`, `/api/webhooks/uzum/confirm`, `/api/webhooks/uzum/reverse`
- **Required Environment Variables:**
  - `UZUM_MERCHANT_ID` - Merchant ID from Uzum cabinet
  - `UZUM_SECRET_KEY` - Secret key for HMAC signature verification

### Yandex Maps
For address selection during checkout:
- **Required:** Yandex Maps API key in `config/settings.json` under `yandexMaps.apiKey`
- Default center: Tashkent (41.311081, 69.240562)

### Security Notes
- Secret keys are stored ONLY in environment variables, never in config files
- Merchant IDs (public) can be stored in `config/settings.json`
- All webhooks verify signatures/authentication before processing
- Order totals are calculated server-side from database prices (never trusting client data)

## External Dependencies

-   **Database:** PostgreSQL (self-hosted on VPS or cloud-hosted like Neon)
-   **UI Components:** Radix UI, Shadcn/ui, Lucide React (for iconography)
-   **Fonts:** Google Fonts (Inter, Poppins)
-   **Web Server:** Nginx (reverse proxy)
-   **Backend:** Flask 3.1.2 with Python 3
-   **Payment Gateways:** Click, Payme, Uzum Bank (Uzbekistan)
-   **Maps:** Yandex Maps API (for delivery address selection)