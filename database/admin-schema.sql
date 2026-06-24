CREATE TABLE IF NOT EXISTS admins (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL DEFAULT 'Admin',
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role VARCHAR(30) NOT NULL DEFAULT 'admin',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE admins
ADD COLUMN IF NOT EXISTS role VARCHAR(30) NOT NULL DEFAULT 'admin';


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

ALTER TABLE products
ADD COLUMN IF NOT EXISTS images TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

UPDATE products
SET images = ARRAY[image_url]
WHERE image_url IS NOT NULL
  AND image_url <> ''
  AND (images IS NULL OR cardinality(images) = 0);

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  phone VARCHAR(30),
  role VARCHAR(30) NOT NULL DEFAULT 'user',
  password_hash TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE users
ADD COLUMN IF NOT EXISTS role VARCHAR(30) NOT NULL DEFAULT 'user';

ALTER TABLE users
ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE users
ADD COLUMN IF NOT EXISTS two_factor_enabled BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS orders (
  id SERIAL PRIMARY KEY,
  user_id INT REFERENCES users(id) ON DELETE SET NULL,
  customer_name VARCHAR(255),
  customer_email VARCHAR(255),
  customer_phone VARCHAR(30),
  total_amount NUMERIC NOT NULL DEFAULT 0,
  payment_screenshot TEXT,
  status VARCHAR(30) NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT orders_status_check CHECK (status IN ('pending', 'shipped', 'delivered'))
);

ALTER TABLE orders
ADD COLUMN IF NOT EXISTS payment_screenshot TEXT;

CREATE TABLE IF NOT EXISTS order_items (
  id SERIAL PRIMARY KEY,
  order_id INT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id INT REFERENCES products(id) ON DELETE SET NULL,
  product_name VARCHAR(255) NOT NULL,
  quantity INT NOT NULL DEFAULT 1,
  price NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS security_tokens (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose VARCHAR(50) NOT NULL,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  used_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS security_tokens_lookup_idx
ON security_tokens (token_hash, purpose, expires_at)
WHERE used_at IS NULL;

CREATE TABLE IF NOT EXISTS login_attempts (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255),
  ip_address VARCHAR(100),
  user_agent TEXT,
  success BOOLEAN NOT NULL DEFAULT false,
  reason VARCHAR(80),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS login_attempts_email_created_idx
ON login_attempts (email, created_at DESC);

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

INSERT INTO company_settings
  (id, company_name, bank_name, account_number, ifsc_code, branch)
VALUES
  (1, 'DIS8 INTERNATIONAL', 'IDFC FIRST BANK', '82611202131', 'IDFB0020158', 'NOIDA')
ON CONFLICT (id) DO NOTHING;
