ALTER TABLE users
ADD COLUMN IF NOT EXISTS phone VARCHAR(20);

ALTER TABLE users
ADD COLUMN IF NOT EXISTS email VARCHAR(255);

ALTER TABLE users
ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE users
ADD COLUMN IF NOT EXISTS phone_verified BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE users
ADD COLUMN IF NOT EXISTS referral_code VARCHAR(20);

UPDATE users
SET referral_code = UPPER(SUBSTRING(MD5(id::text || email || created_at::text), 1, 8))
WHERE referral_code IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS users_phone_unique_idx
ON users (phone)
WHERE phone IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS users_referral_code_unique_idx
ON users (referral_code)
WHERE referral_code IS NOT NULL;

CREATE TABLE IF NOT EXISTS user_sessions (
  id BIGSERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  refresh_token_hash TEXT NOT NULL UNIQUE,
  device_name VARCHAR(255),
  user_agent TEXT,
  ip_address VARCHAR(100),
  remember_device BOOLEAN NOT NULL DEFAULT false,
  last_seen_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NOT NULL,
  revoked_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS user_sessions_user_active_idx
ON user_sessions (user_id, last_seen_at DESC)
WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS user_addresses (
  id BIGSERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label VARCHAR(60) NOT NULL DEFAULT 'Home',
  recipient_name VARCHAR(120) NOT NULL,
  phone VARCHAR(30) NOT NULL,
  address_line1 VARCHAR(255) NOT NULL,
  address_line2 VARCHAR(255),
  city VARCHAR(120) NOT NULL,
  state VARCHAR(120) NOT NULL,
  pincode VARCHAR(20) NOT NULL,
  country VARCHAR(80) NOT NULL DEFAULT 'India',
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS user_addresses_user_idx ON user_addresses (user_id);

CREATE TABLE IF NOT EXISTS cart_items (
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id INT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  quantity INT NOT NULL CHECK (quantity > 0 AND quantity <= 100),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, product_id)
);

CREATE TABLE IF NOT EXISTS wishlists (
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id INT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, product_id)
);

CREATE TABLE IF NOT EXISTS coupons (
  id BIGSERIAL PRIMARY KEY,
  code VARCHAR(40) NOT NULL UNIQUE,
  discount_type VARCHAR(20) NOT NULL CHECK (discount_type IN ('percentage', 'flat')),
  discount_value NUMERIC(12,2) NOT NULL CHECK (discount_value > 0),
  minimum_order_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  expires_at TIMESTAMP,
  usage_limit INT,
  per_user_limit INT NOT NULL DEFAULT 1,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS coupon_redemptions (
  id BIGSERIAL PRIMARY KEY,
  coupon_id BIGINT NOT NULL REFERENCES coupons(id) ON DELETE CASCADE,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  order_id INT REFERENCES orders(id) ON DELETE SET NULL,
  discount_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS coupon_redemptions_coupon_user_idx
ON coupon_redemptions (coupon_id, user_id);

CREATE TABLE IF NOT EXISTS wallets (
  user_id INT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  balance NUMERIC(12,2) NOT NULL DEFAULT 0,
  dis8_coins INT NOT NULL DEFAULT 0,
  referral_earnings NUMERIC(12,2) NOT NULL DEFAULT 0,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS wallet_ledger (
  id BIGSERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  order_id INT REFERENCES orders(id) ON DELETE SET NULL,
  entry_type VARCHAR(40) NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  balance_after NUMERIC(12,2) NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS loyalty_ledger (
  id BIGSERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  order_id INT REFERENCES orders(id) ON DELETE SET NULL,
  entry_type VARCHAR(40) NOT NULL CHECK (entry_type IN ('earn', 'redeem', 'expire', 'adjust')),
  coins INT NOT NULL,
  coins_after INT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS referrals (
  id BIGSERIAL PRIMARY KEY,
  referrer_user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  referred_user_id INT REFERENCES users(id) ON DELETE SET NULL,
  referral_code VARCHAR(20) NOT NULL,
  earnings NUMERIC(12,2) NOT NULL DEFAULT 0,
  status VARCHAR(30) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'qualified', 'paid', 'cancelled')),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS referrals_referrer_idx ON referrals (referrer_user_id, created_at DESC);

ALTER TABLE orders
DROP CONSTRAINT IF EXISTS orders_status_check;

ALTER TABLE orders
ADD CONSTRAINT orders_status_check
CHECK (status IN (
  'pending', 'confirmed', 'packed', 'picked_up', 'shipped',
  'out_for_delivery', 'delivered', 'cancelled', 'returned', 'refunded'
));

ALTER TABLE orders
ADD COLUMN IF NOT EXISTS billing_address JSONB;

ALTER TABLE orders
ADD COLUMN IF NOT EXISTS shipping_address JSONB;

ALTER TABLE orders
ADD COLUMN IF NOT EXISTS coupon_code VARCHAR(40);

ALTER TABLE orders
ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(12,2) NOT NULL DEFAULT 0;

ALTER TABLE orders
ADD COLUMN IF NOT EXISTS gst_amount NUMERIC(12,2) NOT NULL DEFAULT 0;

ALTER TABLE orders
ADD COLUMN IF NOT EXISTS shipping_charge NUMERIC(12,2) NOT NULL DEFAULT 0;

ALTER TABLE orders
ADD COLUMN IF NOT EXISTS estimated_delivery_at TIMESTAMP;

CREATE TABLE IF NOT EXISTS payments (
  id BIGSERIAL PRIMARY KEY,
  order_id INT REFERENCES orders(id) ON DELETE SET NULL,
  user_id INT REFERENCES users(id) ON DELETE SET NULL,
  provider VARCHAR(40) NOT NULL DEFAULT 'razorpay',
  provider_order_id VARCHAR(120),
  provider_payment_id VARCHAR(120),
  method VARCHAR(60),
  status VARCHAR(40) NOT NULL DEFAULT 'pending',
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  currency VARCHAR(10) NOT NULL DEFAULT 'INR',
  verified_at TIMESTAMP,
  raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS payments_provider_payment_unique_idx
ON payments (provider, provider_payment_id)
WHERE provider_payment_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS refunds (
  id BIGSERIAL PRIMARY KEY,
  payment_id BIGINT REFERENCES payments(id) ON DELETE SET NULL,
  order_id INT REFERENCES orders(id) ON DELETE SET NULL,
  provider_refund_id VARCHAR(120),
  amount NUMERIC(12,2) NOT NULL,
  status VARCHAR(40) NOT NULL DEFAULT 'pending',
  reason TEXT,
  raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS shipments (
  id BIGSERIAL PRIMARY KEY,
  order_id INT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  provider VARCHAR(40) NOT NULL DEFAULT 'shiprocket',
  provider_order_id VARCHAR(120),
  shipment_id VARCHAR(120),
  awb_code VARCHAR(120),
  courier_name VARCHAR(120),
  tracking_url TEXT,
  label_url TEXT,
  invoice_url TEXT,
  status VARCHAR(60) NOT NULL DEFAULT 'pending',
  raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS shipments_order_idx ON shipments (order_id);

CREATE TABLE IF NOT EXISTS invoices (
  id BIGSERIAL PRIMARY KEY,
  order_id INT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  invoice_number VARCHAR(60) NOT NULL UNIQUE,
  gstin VARCHAR(30),
  pdf_url TEXT,
  subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
  gst_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  emailed_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS return_requests (
  id BIGSERIAL PRIMARY KEY,
  order_id INT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  request_type VARCHAR(20) NOT NULL CHECK (request_type IN ('return', 'exchange')),
  reason TEXT NOT NULL,
  status VARCHAR(40) NOT NULL DEFAULT 'requested'
    CHECK (status IN ('requested', 'approved', 'rejected', 'pickup_scheduled', 'picked_up', 'refunded', 'exchanged', 'cancelled')),
  refund_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  admin_note TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS product_reviews (
  id BIGSERIAL PRIMARY KEY,
  product_id INT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  order_id INT REFERENCES orders(id) ON DELETE SET NULL,
  rating INT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  title VARCHAR(120),
  body TEXT,
  images TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  verified_purchase BOOLEAN NOT NULL DEFAULT false,
  likes_count INT NOT NULL DEFAULT 0,
  admin_reply TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (product_id, user_id, order_id)
);

CREATE TABLE IF NOT EXISTS inventory_history (
  id BIGSERIAL PRIMARY KEY,
  product_id INT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  change_quantity INT NOT NULL,
  stock_after INT NOT NULL,
  reason VARCHAR(80) NOT NULL,
  actor_admin_id INT REFERENCES admins(id) ON DELETE SET NULL,
  order_id INT REFERENCES orders(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS inventory_history_product_idx
ON inventory_history (product_id, created_at DESC);

CREATE TABLE IF NOT EXISTS notifications (
  id BIGSERIAL PRIMARY KEY,
  user_id INT REFERENCES users(id) ON DELETE CASCADE,
  channel VARCHAR(20) NOT NULL CHECK (channel IN ('email', 'sms', 'push')),
  event_type VARCHAR(80) NOT NULL,
  title VARCHAR(160),
  body TEXT,
  status VARCHAR(30) NOT NULL DEFAULT 'pending',
  sent_at TIMESTAMP,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS abandoned_carts (
  id BIGSERIAL PRIMARY KEY,
  user_id INT REFERENCES users(id) ON DELETE CASCADE,
  email VARCHAR(255),
  phone VARCHAR(30),
  cart_snapshot JSONB NOT NULL DEFAULT '[]'::jsonb,
  reminder_count INT NOT NULL DEFAULT 0,
  last_reminder_at TIMESTAMP,
  recovered_order_id INT REFERENCES orders(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS search_events (
  id BIGSERIAL PRIMARY KEY,
  user_id INT REFERENCES users(id) ON DELETE SET NULL,
  query TEXT NOT NULL,
  result_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS search_events_query_idx ON search_events (query);
