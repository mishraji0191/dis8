CREATE TABLE IF NOT EXISTS admins (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL DEFAULT 'Admin',
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role VARCHAR(30) NOT NULL DEFAULT 'admin',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE admins
ADD COLUMN IF NOT EXISTS id BIGSERIAL;

ALTER TABLE admins
ADD COLUMN IF NOT EXISTS role VARCHAR(30) NOT NULL DEFAULT 'admin';

ALTER TABLE admins
ADD COLUMN IF NOT EXISTS name VARCHAR(255) NOT NULL DEFAULT 'Admin';

ALTER TABLE admins
ADD COLUMN IF NOT EXISTS email VARCHAR(255);

ALTER TABLE admins
ADD COLUMN IF NOT EXISTS password_hash TEXT;

ALTER TABLE admins
ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

CREATE TABLE IF NOT EXISTS products (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  price NUMERIC NOT NULL DEFAULT 0,
  category VARCHAR(100),
  image_url TEXT,
  images TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  stock INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS categories (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  slug VARCHAR(140) NOT NULL UNIQUE,
  parent_id BIGINT REFERENCES categories(id) ON DELETE RESTRICT,
  image_url TEXT,
  display_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE categories
ADD COLUMN IF NOT EXISTS name VARCHAR(120);

ALTER TABLE categories
ADD COLUMN IF NOT EXISTS slug VARCHAR(140);

ALTER TABLE categories
ADD COLUMN IF NOT EXISTS parent_id BIGINT;

ALTER TABLE categories
ADD COLUMN IF NOT EXISTS image_url TEXT;

ALTER TABLE categories
ADD COLUMN IF NOT EXISTS display_order INT NOT NULL DEFAULT 0;

ALTER TABLE categories
ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE categories
ADD COLUMN IF NOT EXISTS created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE categories
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE UNIQUE INDEX IF NOT EXISTS categories_slug_unique_idx ON categories (slug);
CREATE INDEX IF NOT EXISTS categories_parent_order_idx ON categories (parent_id, display_order, name);

INSERT INTO categories (name, slug, display_order, is_active)
VALUES
  ('Men', 'men', 1, true),
  ('Women', 'women', 2, true),
  ('Compression Wear', 'compression-wear', 3, true),
  ('Cricket', 'cricket', 4, true),
  ('Kids', 'kids', 5, true),
  ('Swimwear', 'swimwear', 6, true)
ON CONFLICT (slug) DO UPDATE
SET name = EXCLUDED.name,
    display_order = EXCLUDED.display_order,
    is_active = EXCLUDED.is_active,
    updated_at = CURRENT_TIMESTAMP;

WITH seed_subcategories(parent_slug, name, slug, display_order) AS (
  VALUES
    ('men', 'Tracksuits', 'men-tracksuits', 1),
    ('men', 'T-Shirts', 'men-t-shirts', 2),
    ('men', 'Sandos', 'men-sandos', 3),
    ('men', 'Lowers', 'men-lowers', 4),
    ('men', 'Shorts', 'men-shorts', 5),
    ('men', 'Hoodies', 'men-hoodies', 6),
    ('men', 'Basketball Wear', 'men-basketball-wear', 7),
    ('men', 'Practice Wear', 'men-practice-wear', 8),
    ('men', 'Y-Back', 'men-y-back', 9),
    ('men', 'Round Neck T-Shirts', 'men-round-neck-t-shirts', 10),
    ('women', 'Hot Suit', 'women-hot-suit', 1),
    ('women', 'Tights', 'women-tights', 2),
    ('women', 'Butter Collection', 'women-butter-collection', 3),
    ('women', 'Training Wear', 'women-training-wear', 4),
    ('compression-wear', 'Compression Tops', 'compression-wear-compression-tops', 1),
    ('compression-wear', 'Compression Tights', 'compression-wear-compression-tights', 2),
    ('cricket', 'Cricket Whites', 'cricket-cricket-whites', 1),
    ('kids', 'Active Set', 'kids-active-set', 1),
    ('kids', 'Slim Fit Set', 'kids-slim-fit-set', 2),
    ('kids', 'Training Suit', 'kids-training-suit', 3),
    ('kids', 'Shorts Set', 'kids-shorts-set', 4),
    ('kids', 'Stylo Set', 'kids-stylo-set', 5),
    ('swimwear', 'Professional Swim', 'swimwear-professional-swim', 1),
    ('swimwear', 'Swimming Costume', 'swimwear-swimming-costume', 2),
    ('swimwear', 'Swimming Shorts', 'swimwear-swimming-shorts', 3),
    ('swimwear', 'Swimming Trunks', 'swimwear-swimming-trunks', 4),
    ('swimwear', 'Water Shorts', 'swimwear-water-shorts', 5),
    ('swimwear', 'Life Jackets', 'swimwear-life-jackets', 6),
    ('swimwear', 'Jammers', 'swimwear-jammers', 7),
    ('swimwear', 'Swim Dress', 'swimwear-swim-dress', 8),
    ('swimwear', 'Swim Top & Bottom', 'swimwear-swim-top-bottom', 9),
    ('swimwear', 'Kids Swimwear', 'swimwear-kids-swimwear', 10)
)
INSERT INTO categories (name, slug, parent_id, display_order, is_active)
SELECT seed.name, seed.slug, parent.id, seed.display_order, true
FROM seed_subcategories seed
JOIN categories parent ON parent.slug = seed.parent_slug
ON CONFLICT (slug) DO UPDATE
SET name = EXCLUDED.name,
    parent_id = EXCLUDED.parent_id,
    display_order = EXCLUDED.display_order,
    is_active = EXCLUDED.is_active,
    updated_at = CURRENT_TIMESTAMP;

ALTER TABLE products
ADD COLUMN IF NOT EXISTS id BIGSERIAL;

ALTER TABLE products
ADD COLUMN IF NOT EXISTS name VARCHAR(255);

ALTER TABLE products
ADD COLUMN IF NOT EXISTS description TEXT;

ALTER TABLE products
ADD COLUMN IF NOT EXISTS price NUMERIC NOT NULL DEFAULT 0;

ALTER TABLE products
ADD COLUMN IF NOT EXISTS category VARCHAR(100);

ALTER TABLE products
ADD COLUMN IF NOT EXISTS category_id BIGINT REFERENCES categories(id) ON DELETE RESTRICT;

ALTER TABLE products
ADD COLUMN IF NOT EXISTS subcategory_id BIGINT REFERENCES categories(id) ON DELETE RESTRICT;

ALTER TABLE products
ADD COLUMN IF NOT EXISTS image_url TEXT;

ALTER TABLE products
ADD COLUMN IF NOT EXISTS images TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

ALTER TABLE products
ADD COLUMN IF NOT EXISTS stock INT NOT NULL DEFAULT 0;

ALTER TABLE products
ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

UPDATE products
SET images = ARRAY[image_url]
WHERE image_url IS NOT NULL
  AND image_url <> ''
  AND (images IS NULL OR cardinality(images) = 0);

UPDATE products product
SET category_id = matched.category_id,
    subcategory_id = matched.subcategory_id
FROM (
  SELECT
    p.id AS product_id,
    COALESCE(parent.id, category.id) AS category_id,
    CASE WHEN category.parent_id IS NULL THEN NULL ELSE category.id END AS subcategory_id
  FROM products p
  JOIN categories category ON LOWER(category.name) = LOWER(p.category)
  LEFT JOIN categories parent ON parent.id = category.parent_id
  WHERE p.category_id IS NULL
) matched
WHERE product.id = matched.product_id;

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE,
  phone VARCHAR(20),
  role VARCHAR(30) NOT NULL DEFAULT 'user',
  password_hash TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE users
ADD COLUMN IF NOT EXISTS id BIGSERIAL;

ALTER TABLE users
ADD COLUMN IF NOT EXISTS name VARCHAR(255);

ALTER TABLE users
ADD COLUMN IF NOT EXISTS email VARCHAR(255);

ALTER TABLE users
ALTER COLUMN email DROP NOT NULL;

ALTER TABLE users
ADD COLUMN IF NOT EXISTS phone VARCHAR(20);

ALTER TABLE users
ADD COLUMN IF NOT EXISTS role VARCHAR(30) NOT NULL DEFAULT 'user';

ALTER TABLE users
ADD COLUMN IF NOT EXISTS password_hash TEXT;

ALTER TABLE users
ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE users
ADD COLUMN IF NOT EXISTS phone_verified BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE users
ADD COLUMN IF NOT EXISTS two_factor_enabled BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE users
ADD COLUMN IF NOT EXISTS referral_code VARCHAR(20);

ALTER TABLE users
ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

UPDATE users
SET referral_code = UPPER(SUBSTRING(MD5(id::text || COALESCE(email, '') || COALESCE(phone, '') || created_at::text), 1, 8))
WHERE referral_code IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS users_phone_unique_idx
ON users (phone)
WHERE phone IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS users_referral_code_unique_idx
ON users (referral_code)
WHERE referral_code IS NOT NULL;

CREATE TABLE IF NOT EXISTS orders (
  id SERIAL PRIMARY KEY,
  order_number VARCHAR(40) UNIQUE,
  user_id INT REFERENCES users(id) ON DELETE SET NULL,
  customer_name VARCHAR(255),
  customer_email VARCHAR(255),
  customer_phone VARCHAR(30),
  address TEXT,
  landmark VARCHAR(255),
  city VARCHAR(120),
  state VARCHAR(120),
  pincode VARCHAR(20),
  total_amount NUMERIC NOT NULL DEFAULT 0,
  payment_status VARCHAR(30) NOT NULL DEFAULT 'pending',
  payment_method VARCHAR(60),
  razorpay_order_id VARCHAR(120),
  razorpay_payment_id VARCHAR(120),
  payment_screenshot TEXT,
  status VARCHAR(30) NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE orders
ADD COLUMN IF NOT EXISTS id BIGSERIAL;

ALTER TABLE orders
ADD COLUMN IF NOT EXISTS user_id INT;

ALTER TABLE orders
ADD COLUMN IF NOT EXISTS customer_name VARCHAR(255);

ALTER TABLE orders
ADD COLUMN IF NOT EXISTS customer_email VARCHAR(255);

ALTER TABLE orders
ADD COLUMN IF NOT EXISTS customer_phone VARCHAR(30);

ALTER TABLE orders
ADD COLUMN IF NOT EXISTS payment_screenshot TEXT;

ALTER TABLE orders
ADD COLUMN IF NOT EXISTS order_number VARCHAR(40) UNIQUE;

ALTER TABLE orders
ADD COLUMN IF NOT EXISTS total_amount NUMERIC NOT NULL DEFAULT 0;

ALTER TABLE orders
ADD COLUMN IF NOT EXISTS address TEXT;

ALTER TABLE orders
ADD COLUMN IF NOT EXISTS landmark VARCHAR(255);

ALTER TABLE orders
ADD COLUMN IF NOT EXISTS city VARCHAR(120);

ALTER TABLE orders
ADD COLUMN IF NOT EXISTS state VARCHAR(120);

ALTER TABLE orders
ADD COLUMN IF NOT EXISTS pincode VARCHAR(20);

ALTER TABLE orders
ADD COLUMN IF NOT EXISTS payment_status VARCHAR(30) NOT NULL DEFAULT 'pending';

ALTER TABLE orders
ADD COLUMN IF NOT EXISTS payment_method VARCHAR(60);

ALTER TABLE orders
ADD COLUMN IF NOT EXISTS razorpay_order_id VARCHAR(120);

ALTER TABLE orders
ADD COLUMN IF NOT EXISTS razorpay_payment_id VARCHAR(120);

ALTER TABLE orders
ADD COLUMN IF NOT EXISTS status VARCHAR(30) NOT NULL DEFAULT 'pending';

ALTER TABLE orders
ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE orders
DROP CONSTRAINT IF EXISTS orders_status_check;

ALTER TABLE orders
DROP CONSTRAINT IF EXISTS orders_payment_status_check;

ALTER TABLE orders
ADD CONSTRAINT orders_status_check
CHECK (status IN ('pending', 'confirmed', 'packed', 'shipped', 'delivered', 'cancelled'));

ALTER TABLE orders
ADD CONSTRAINT orders_payment_status_check
CHECK (payment_status IN ('pending', 'paid', 'failed', 'refunded'));

UPDATE orders
SET order_number = 'DIS8-' || LPAD(id::text, 6, '0')
WHERE order_number IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS orders_razorpay_order_idx
ON orders (razorpay_order_id)
WHERE razorpay_order_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS order_items (
  id SERIAL PRIMARY KEY,
  order_id INT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id INT REFERENCES products(id) ON DELETE SET NULL,
  product_name VARCHAR(255) NOT NULL,
  quantity INT NOT NULL DEFAULT 1,
  price NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE order_items
ADD COLUMN IF NOT EXISTS id BIGSERIAL;

ALTER TABLE order_items
ADD COLUMN IF NOT EXISTS order_id INT;

ALTER TABLE order_items
ADD COLUMN IF NOT EXISTS product_id INT;

ALTER TABLE order_items
ADD COLUMN IF NOT EXISTS product_name VARCHAR(255);

ALTER TABLE order_items
ADD COLUMN IF NOT EXISTS quantity INT NOT NULL DEFAULT 1;

ALTER TABLE order_items
ADD COLUMN IF NOT EXISTS price NUMERIC NOT NULL DEFAULT 0;

ALTER TABLE order_items
ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

CREATE TABLE IF NOT EXISTS security_tokens (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose VARCHAR(50) NOT NULL,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  used_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE security_tokens
ADD COLUMN IF NOT EXISTS id BIGSERIAL;

ALTER TABLE security_tokens
ADD COLUMN IF NOT EXISTS user_id INT;

ALTER TABLE security_tokens
ADD COLUMN IF NOT EXISTS purpose VARCHAR(50);

ALTER TABLE security_tokens
ADD COLUMN IF NOT EXISTS token_hash TEXT;

ALTER TABLE security_tokens
ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP;

ALTER TABLE security_tokens
ADD COLUMN IF NOT EXISTS used_at TIMESTAMP;

ALTER TABLE security_tokens
ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX IF NOT EXISTS security_tokens_lookup_idx
ON security_tokens (token_hash, purpose, expires_at)
WHERE used_at IS NULL;

CREATE TABLE IF NOT EXISTS login_attempts (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255),
  phone VARCHAR(30),
  ip_address VARCHAR(100),
  user_agent TEXT,
  success BOOLEAN NOT NULL DEFAULT false,
  reason VARCHAR(80),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE login_attempts
ADD COLUMN IF NOT EXISTS id BIGSERIAL;

ALTER TABLE login_attempts
ADD COLUMN IF NOT EXISTS email VARCHAR(255);

ALTER TABLE login_attempts
ADD COLUMN IF NOT EXISTS phone VARCHAR(30);

ALTER TABLE login_attempts
ADD COLUMN IF NOT EXISTS ip_address VARCHAR(100);

ALTER TABLE login_attempts
ADD COLUMN IF NOT EXISTS user_agent TEXT;

ALTER TABLE login_attempts
ADD COLUMN IF NOT EXISTS success BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE login_attempts
ADD COLUMN IF NOT EXISTS reason VARCHAR(80);

ALTER TABLE login_attempts
ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX IF NOT EXISTS login_attempts_email_created_idx
ON login_attempts (email, created_at DESC);

CREATE INDEX IF NOT EXISTS login_attempts_phone_created_idx
ON login_attempts (phone, created_at DESC);

CREATE INDEX IF NOT EXISTS login_attempts_ip_created_idx
ON login_attempts (ip_address, created_at DESC);

CREATE TABLE IF NOT EXISTS company_settings (
  id INT PRIMARY KEY DEFAULT 1,
  company_name VARCHAR(255) NOT NULL DEFAULT 'DIS8 INTERNATIONAL',
  bank_name VARCHAR(255) NOT NULL DEFAULT 'IDFC FIRST BANK',
  account_number VARCHAR(80) NOT NULL DEFAULT '82611202131',
  ifsc_code VARCHAR(40) NOT NULL DEFAULT 'IDFB0020158',
  branch VARCHAR(255) NOT NULL DEFAULT 'NOIDA',
  google_pay_qr TEXT,
  phone_pe_qr TEXT,
  logo TEXT,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT company_settings_singleton CHECK (id = 1)
);

ALTER TABLE company_settings
ADD COLUMN IF NOT EXISTS company_name VARCHAR(255) NOT NULL DEFAULT 'DIS8 INTERNATIONAL';

ALTER TABLE company_settings
ADD COLUMN IF NOT EXISTS bank_name VARCHAR(255) NOT NULL DEFAULT 'IDFC FIRST BANK';

ALTER TABLE company_settings
ADD COLUMN IF NOT EXISTS account_number VARCHAR(80) NOT NULL DEFAULT '82611202131';

ALTER TABLE company_settings
ADD COLUMN IF NOT EXISTS ifsc_code VARCHAR(40) NOT NULL DEFAULT 'IDFB0020158';

ALTER TABLE company_settings
ADD COLUMN IF NOT EXISTS branch VARCHAR(255) NOT NULL DEFAULT 'NOIDA';

ALTER TABLE company_settings
ADD COLUMN IF NOT EXISTS google_pay_qr TEXT;

ALTER TABLE company_settings
ADD COLUMN IF NOT EXISTS phone_pe_qr TEXT;

ALTER TABLE company_settings
ADD COLUMN IF NOT EXISTS logo TEXT;

ALTER TABLE company_settings
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

INSERT INTO company_settings
  (id, company_name, bank_name, account_number, ifsc_code, branch)
VALUES
  (1, 'DIS8 INTERNATIONAL', 'IDFC FIRST BANK', '82611202131', 'IDFB0020158', 'NOIDA')
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS hero_sliders (
  id BIGSERIAL PRIMARY KEY,
  title VARCHAR(180) NOT NULL,
  subtitle TEXT,
  image_url TEXT NOT NULL,
  button_text VARCHAR(80) NOT NULL DEFAULT 'Shop Now',
  button_link TEXT NOT NULL,
  collection VARCHAR(80) NOT NULL,
  text_position VARCHAR(20) NOT NULL DEFAULT 'left',
  display_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE hero_sliders
ADD COLUMN IF NOT EXISTS title VARCHAR(180);

ALTER TABLE hero_sliders
ADD COLUMN IF NOT EXISTS subtitle TEXT;

ALTER TABLE hero_sliders
ADD COLUMN IF NOT EXISTS image_url TEXT;

ALTER TABLE hero_sliders
ADD COLUMN IF NOT EXISTS button_text VARCHAR(80) NOT NULL DEFAULT 'Shop Now';

ALTER TABLE hero_sliders
ADD COLUMN IF NOT EXISTS button_link TEXT;

ALTER TABLE hero_sliders
ADD COLUMN IF NOT EXISTS collection VARCHAR(80);

ALTER TABLE hero_sliders
ADD COLUMN IF NOT EXISTS text_position VARCHAR(20) NOT NULL DEFAULT 'left';

ALTER TABLE hero_sliders
ADD COLUMN IF NOT EXISTS display_order INT NOT NULL DEFAULT 0;

ALTER TABLE hero_sliders
ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE hero_sliders
ADD COLUMN IF NOT EXISTS created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE hero_sliders
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX IF NOT EXISTS hero_sliders_active_order_idx
ON hero_sliders (is_active, display_order ASC, id ASC);
