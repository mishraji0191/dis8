const pool = require("../config/db");

function parseImageList(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter(Boolean);

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
  } catch {
    return String(value)
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }
}

function getUploadedProductImages(req) {
  if (Array.isArray(req.files)) {
    return req.files.map((file) => file.path).filter(Boolean);
  }

  return [
    ...(req.files?.images || []),
    ...(req.files?.image || []),
  ].map((file) => file.path).filter(Boolean);
}

function normalizeImages({ body, uploadedImages, existingImages = [] }) {
  const keptImages = parseImageList(body.existingImages);
  const urlImages = parseImageList(body.images || body.image_urls);
  const legacyImage = body.image_url ? [body.image_url] : [];
  const baseImages =
    Object.prototype.hasOwnProperty.call(body, "existingImages")
      ? keptImages
      : existingImages;

  return [...baseImages, ...urlImages, ...legacyImage, ...uploadedImages]
    .filter(Boolean)
    .filter((image, index, images) => images.indexOf(image) === index)
    .slice(0, 10);
}

function getProductPayload(body, images) {
  const sizes = parseProductSizes(body.sizes || body.product_sizes || body.productSizes);
  const sizedStock = sizes.reduce((total, size) => total + size.stock, 0);

  return {
    name: body.name?.trim(),
    description: body.description?.trim() || "",
    price: Number(body.price) || 0,
    category: body.category?.trim() || "",
    category_id: body.category_id || body.categoryId || null,
    subcategory_id: body.subcategory_id || body.subcategoryId || null,
    images,
    image_url: images[0] || "",
    stock: sizes.length > 0 ? sizedStock : Number.parseInt(body.stock, 10) || 0,
    sizes,
  };
}

function parseProductSizes(value) {
  if (!value) return [];

  let parsed = value;

  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value);
    } catch {
      return [];
    }
  }

  if (!Array.isArray(parsed)) return [];

  return parsed
    .map((size) => ({
      size: String(size.size || size.name || "").trim().toUpperCase(),
      stock: Number.parseInt(size.stock, 10) || 0,
      priceAdjustment: Number(size.priceAdjustment ?? size.price_adjustment) || 0,
    }))
    .filter((size) => size.size)
    .filter((size, index, sizes) => sizes.findIndex((item) => item.size === size.size) === index)
    .slice(0, 20);
}

function mapProductRow(row) {
  return {
    ...row,
    sizes: Array.isArray(row.sizes) ? row.sizes : [],
  };
}

async function replaceProductSizes(client, productId, sizes) {
  await client.query("DELETE FROM product_sizes WHERE product_id = $1", [productId]);

  for (const size of sizes) {
    await client.query(
      `INSERT INTO product_sizes (product_id, size, stock, price_adjustment)
       VALUES ($1, $2, $3, $4)`,
      [productId, size.size, size.stock, size.priceAdjustment]
    );
  }
}

async function applyCategorySelection(payload) {
  if (!payload.category_id) {
    return "";
  }

  const categoryResult = await pool.query(
    "SELECT id, name, parent_id FROM categories WHERE id = $1",
    [payload.category_id]
  );

  if (categoryResult.rowCount === 0 || categoryResult.rows[0].parent_id) {
    return "Select a valid parent category.";
  }

  payload.category = categoryResult.rows[0].name;
  payload.category_id = Number(payload.category_id);

  if (!payload.subcategory_id) {
    payload.subcategory_id = null;
    return "";
  }

  const subcategoryResult = await pool.query(
    "SELECT id, parent_id FROM categories WHERE id = $1",
    [payload.subcategory_id]
  );

  if (
    subcategoryResult.rowCount === 0 ||
    String(subcategoryResult.rows[0].parent_id) !== String(payload.category_id)
  ) {
    return "Select a valid subcategory for this category.";
  }

  payload.subcategory_id = Number(payload.subcategory_id);
  return "";
}

async function validateProduct(payload) {
  if (!payload.name) {
    return "Product name is required.";
  }

  if (payload.price < 0) {
    return "Price cannot be negative.";
  }

  if (payload.stock < 0) {
    return "Stock cannot be negative.";
  }

  for (const size of payload.sizes) {
    if (size.stock < 0) {
      return "Size stock cannot be negative.";
    }

    if (size.priceAdjustment < 0) {
      return "Size price adjustment cannot be negative.";
    }
  }

  return applyCategorySelection(payload);
}

const productSelect = `
  SELECT p.id, p.name, p.description, p.price, p.category,
         p.category_id, category.name AS category_name, category.slug AS category_slug,
         p.subcategory_id, subcategory.name AS subcategory_name,
         subcategory.slug AS subcategory_slug,
         p.image_url, COALESCE(p.images, ARRAY[]::text[]) AS images,
         COALESCE(sizes.sizes, '[]'::json) AS sizes,
         p.stock, p.created_at
  FROM products p
  LEFT JOIN categories category ON category.id = p.category_id
  LEFT JOIN categories subcategory ON subcategory.id = p.subcategory_id
  LEFT JOIN LATERAL (
    SELECT json_agg(
      json_build_object(
        'id', ps.id,
        'size', ps.size,
        'stock', ps.stock,
        'priceAdjustment', ps.price_adjustment
      )
      ORDER BY ps.id ASC
    ) AS sizes
    FROM product_sizes ps
    WHERE ps.product_id = p.id
  ) sizes ON true
`;

async function listProducts(req, res) {
  try {
    const result = await pool.query(
      `${productSelect}
       ORDER BY p.created_at DESC, p.id DESC`
    );

    return res.json(result.rows.map(mapProductRow));
  } catch (error) {
    console.error("Unable to list products:", error);
    return res.status(500).json({ message: "Unable to list products." });
  }
}

async function createProduct(req, res) {
  const uploadedImages = getUploadedProductImages(req);
  const images = normalizeImages({ body: req.body, uploadedImages });
  const payload = getProductPayload(req.body, images);
  const validationError = await validateProduct(payload);

  if (validationError) {
    return res.status(400).json({ message: validationError });
  }

  try {
    const client = await pool.connect();

    try {
      await client.query("BEGIN");
      const result = await client.query(
      `WITH inserted AS (
         INSERT INTO products (
           name, description, price, category, category_id, subcategory_id,
           image_url, images, stock
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING *
       )
       SELECT inserted.id, inserted.name, inserted.description, inserted.price,
              inserted.category, inserted.category_id,
              category.name AS category_name, category.slug AS category_slug,
              inserted.subcategory_id, subcategory.name AS subcategory_name,
              subcategory.slug AS subcategory_slug,
              inserted.image_url, COALESCE(inserted.images, ARRAY[]::text[]) AS images,
              '[]'::json AS sizes,
              inserted.stock, inserted.created_at
       FROM inserted
       LEFT JOIN categories category ON category.id = inserted.category_id
       LEFT JOIN categories subcategory ON subcategory.id = inserted.subcategory_id`,
      [
        payload.name,
        payload.description,
        payload.price,
        payload.category,
        payload.category_id,
        payload.subcategory_id,
        payload.image_url,
        payload.images,
        payload.stock,
      ]
      );

      await replaceProductSizes(client, result.rows[0].id, payload.sizes);
      await client.query("COMMIT");

      const created = await pool.query(`${productSelect} WHERE p.id = $1`, [result.rows[0].id]);

      return res.status(201).json(mapProductRow(created.rows[0]));
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("Database insert failed:", {
      message: error.message,
      code: error.code,
      detail: error.detail,
    });
    return res
      .status(500)
      .json({ message: error.message || "Unable to create product." });
  }
}

async function updateProduct(req, res) {
  const { id } = req.params;

  try {
    const existingResult = await pool.query(
      "SELECT image_url, COALESCE(images, ARRAY[]::text[]) AS images FROM products WHERE id = $1",
      [id]
    );

    if (existingResult.rowCount === 0) {
      return res.status(404).json({ message: "Product not found." });
    }

    const existingImages =
      existingResult.rows[0].images?.length > 0
        ? existingResult.rows[0].images
        : [existingResult.rows[0].image_url].filter(Boolean);
    const uploadedImages = getUploadedProductImages(req);
    const images = normalizeImages({
      body: req.body,
      uploadedImages,
      existingImages,
    });
    const payload = getProductPayload(req.body, images);
    const validationError = await validateProduct(payload);

    if (validationError) {
      return res.status(400).json({ message: validationError });
    }

    const client = await pool.connect();

    try {
      await client.query("BEGIN");
      const result = await client.query(
      `WITH updated AS (
         UPDATE products
         SET name = $1,
             description = $2,
             price = $3,
             category = $4,
             category_id = $5,
             subcategory_id = $6,
             image_url = $7,
             images = $8,
             stock = $9
         WHERE id = $10
         RETURNING *
       )
       SELECT updated.id, updated.name, updated.description, updated.price,
              updated.category, updated.category_id,
              category.name AS category_name, category.slug AS category_slug,
              updated.subcategory_id, subcategory.name AS subcategory_name,
              subcategory.slug AS subcategory_slug,
              updated.image_url, COALESCE(updated.images, ARRAY[]::text[]) AS images,
              '[]'::json AS sizes,
              updated.stock, updated.created_at
       FROM updated
       LEFT JOIN categories category ON category.id = updated.category_id
       LEFT JOIN categories subcategory ON subcategory.id = updated.subcategory_id`,
      [
        payload.name,
        payload.description,
        payload.price,
        payload.category,
        payload.category_id,
        payload.subcategory_id,
        payload.image_url,
        payload.images,
        payload.stock,
        id,
      ]
      );

      await replaceProductSizes(client, id, payload.sizes);
      await client.query("COMMIT");

      const updated = await pool.query(`${productSelect} WHERE p.id = $1`, [id]);

      return res.json(mapProductRow(updated.rows[0] || result.rows[0]));
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("Database update failed:", {
      message: error.message,
      code: error.code,
      detail: error.detail,
    });
    return res
      .status(500)
      .json({ message: error.message || "Unable to update product." });
  }
}

async function deleteProduct(req, res) {
  const { id } = req.params;

  try {
    const result = await pool.query(
      "DELETE FROM products WHERE id = $1 RETURNING id",
      [id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ message: "Product not found." });
    }

    return res.json({ message: "Product deleted." });
  } catch (error) {
    console.error("Unable to delete product:", error);
    return res.status(500).json({ message: "Unable to delete product." });
  }
}

module.exports = {
  listProducts,
  createProduct,
  updateProduct,
  deleteProduct,
};
