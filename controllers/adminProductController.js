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
    return req.files.map((file) => `/uploads/products/${file.filename}`);
  }

  return [
    ...(req.files?.images || []),
    ...(req.files?.image || []),
  ].map((file) => `/uploads/products/${file.filename}`);
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
  return {
    name: body.name?.trim(),
    description: body.description?.trim() || "",
    price: Number(body.price) || 0,
    category: body.category?.trim() || "",
    images,
    image_url: images[0] || "",
    stock: Number.parseInt(body.stock, 10) || 0,
  };
}

function validateProduct(payload) {
  if (!payload.name) {
    return "Product name is required.";
  }

  if (payload.price < 0) {
    return "Price cannot be negative.";
  }

  if (payload.stock < 0) {
    return "Stock cannot be negative.";
  }

  return "";
}

async function listProducts(req, res) {
  try {
    const result = await pool.query(
      `SELECT id, name, description, price, category, image_url,
              COALESCE(images, ARRAY[]::text[]) AS images,
              stock, created_at
       FROM products
       ORDER BY created_at DESC, id DESC`
    );

    return res.json(result.rows);
  } catch (error) {
    console.error("Unable to list products:", error);
    return res.status(500).json({ message: "Unable to list products." });
  }
}

async function createProduct(req, res) {
  const uploadedImages = getUploadedProductImages(req);
  const images = normalizeImages({ body: req.body, uploadedImages });
  const payload = getProductPayload(req.body, images);
  const validationError = validateProduct(payload);

  if (validationError) {
    return res.status(400).json({ message: validationError });
  }

  try {
    const result = await pool.query(
      `INSERT INTO products (name, description, price, category, image_url, images, stock)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, name, description, price, category, image_url,
                 COALESCE(images, ARRAY[]::text[]) AS images,
                 stock, created_at`,
      [
        payload.name,
        payload.description,
        payload.price,
        payload.category,
        payload.image_url,
        payload.images,
        payload.stock,
      ]
    );

    return res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error("Unable to create product:", error);
    return res.status(500).json({ message: "Unable to create product." });
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
    const validationError = validateProduct(payload);

    if (validationError) {
      return res.status(400).json({ message: validationError });
    }

    const result = await pool.query(
      `UPDATE products
       SET name = $1,
           description = $2,
           price = $3,
           category = $4,
           image_url = $5,
           images = $6,
           stock = $7
       WHERE id = $8
       RETURNING id, name, description, price, category, image_url,
                 COALESCE(images, ARRAY[]::text[]) AS images,
                 stock, created_at`,
      [
        payload.name,
        payload.description,
        payload.price,
        payload.category,
        payload.image_url,
        payload.images,
        payload.stock,
        id,
      ]
    );

    return res.json(result.rows[0]);
  } catch (error) {
    console.error("Unable to update product:", error);
    return res.status(500).json({ message: "Unable to update product." });
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
