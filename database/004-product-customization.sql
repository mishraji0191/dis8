ALTER TABLE products
ADD COLUMN IF NOT EXISTS customization_settings JSONB NOT NULL DEFAULT '{"sports":false,"marathon":false,"general":false,"fields":[]}'::jsonb;

ALTER TABLE cart_items
ADD COLUMN IF NOT EXISTS customization_type VARCHAR(40) NOT NULL DEFAULT '';

ALTER TABLE cart_items
ADD COLUMN IF NOT EXISTS customization_data JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE cart_items
ADD COLUMN IF NOT EXISTS uploaded_files JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE cart_items
ADD COLUMN IF NOT EXISTS cart_item_key VARCHAR(80) NOT NULL DEFAULT '';

ALTER TABLE cart_items
DROP CONSTRAINT IF EXISTS cart_items_pkey;

ALTER TABLE cart_items
ADD PRIMARY KEY (user_id, product_id, selected_size, cart_item_key);

ALTER TABLE order_items
ADD COLUMN IF NOT EXISTS customization_type VARCHAR(40) NOT NULL DEFAULT '';

ALTER TABLE order_items
ADD COLUMN IF NOT EXISTS customization_data JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE order_items
ADD COLUMN IF NOT EXISTS uploaded_files JSONB NOT NULL DEFAULT '[]'::jsonb;
