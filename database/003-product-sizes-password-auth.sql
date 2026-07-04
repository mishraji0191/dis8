CREATE TABLE IF NOT EXISTS product_sizes (
  id BIGSERIAL PRIMARY KEY,
  product_id INT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  size VARCHAR(40) NOT NULL,
  stock INT NOT NULL DEFAULT 0 CHECK (stock >= 0),
  price_adjustment NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (price_adjustment >= 0),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (product_id, size)
);

CREATE INDEX IF NOT EXISTS product_sizes_product_idx
ON product_sizes (product_id, id);

ALTER TABLE cart_items
ADD COLUMN IF NOT EXISTS selected_size VARCHAR(40) NOT NULL DEFAULT '';

ALTER TABLE cart_items
ADD COLUMN IF NOT EXISTS unit_price NUMERIC(12,2);

ALTER TABLE cart_items
ADD COLUMN IF NOT EXISTS price_adjustment NUMERIC(12,2) NOT NULL DEFAULT 0;

ALTER TABLE cart_items
DROP CONSTRAINT IF EXISTS cart_items_pkey;

ALTER TABLE cart_items
ADD PRIMARY KEY (user_id, product_id, selected_size);

ALTER TABLE order_items
ADD COLUMN IF NOT EXISTS selected_size VARCHAR(40) NOT NULL DEFAULT '';

ALTER TABLE order_items
ADD COLUMN IF NOT EXISTS unit_price NUMERIC(12,2);

ALTER TABLE order_items
ADD COLUMN IF NOT EXISTS price_adjustment NUMERIC(12,2) NOT NULL DEFAULT 0;

ALTER TABLE order_items
ADD COLUMN IF NOT EXISTS subtotal NUMERIC(12,2);

UPDATE order_items
SET unit_price = COALESCE(unit_price, price),
    subtotal = COALESCE(subtotal, price * quantity)
WHERE unit_price IS NULL OR subtotal IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique_idx
ON users (LOWER(email))
WHERE email IS NOT NULL;
