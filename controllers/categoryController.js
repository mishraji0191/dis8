const pool = require("../config/db");

function slugify(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function makeUniqueSlug(baseSlug, existingId = null) {
  const cleanBase = baseSlug || "category";
  let candidate = cleanBase;
  let suffix = 2;

  while (true) {
    const result = await pool.query(
      "SELECT id FROM categories WHERE slug = $1 AND ($2::bigint IS NULL OR id <> $2)",
      [candidate, existingId]
    );

    if (result.rowCount === 0) return candidate;

    candidate = `${cleanBase}-${suffix}`;
    suffix += 1;
  }
}

function mapCategory(row) {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    parent_id: row.parent_id,
    parentName: row.parent_name || null,
    image_url: row.image_url || "",
    display_order: row.display_order,
    is_active: row.is_active,
    product_count: Number(row.product_count) || 0,
    children: [],
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function buildTree(rows) {
  const categoryMap = new Map();
  const roots = [];

  rows.forEach((row) => {
    categoryMap.set(String(row.id), mapCategory(row));
  });

  categoryMap.forEach((category) => {
    if (category.parent_id && categoryMap.has(String(category.parent_id))) {
      categoryMap.get(String(category.parent_id)).children.push(category);
      return;
    }

    roots.push(category);
  });

  return roots;
}

async function fetchCategories({ activeOnly = false } = {}) {
  const result = await pool.query(
    `SELECT c.id, c.name, c.slug, c.parent_id, parent.name AS parent_name,
            c.image_url, c.display_order, c.is_active, c.created_at, c.updated_at,
            COUNT(p.id) AS product_count
     FROM categories c
     LEFT JOIN categories parent ON parent.id = c.parent_id
     LEFT JOIN products p ON p.category_id = c.id OR p.subcategory_id = c.id
     WHERE ($1::boolean = false OR c.is_active = true)
     GROUP BY c.id, parent.name
     ORDER BY COALESCE(parent.display_order, c.display_order), c.parent_id NULLS FIRST,
              c.display_order, c.name`,
    [activeOnly]
  );

  return result.rows;
}

async function listPublicCategories(req, res) {
  try {
    const rows = await fetchCategories({ activeOnly: true });
    return res.json(buildTree(rows));
  } catch (error) {
    console.error("Unable to list categories:", error);
    return res.status(500).json({ message: "Unable to list categories." });
  }
}

async function listAdminCategories(req, res) {
  try {
    const rows = await fetchCategories();
    return res.json({
      categories: rows.map(mapCategory),
      tree: buildTree(rows),
    });
  } catch (error) {
    console.error("Unable to list admin categories:", error);
    return res.status(500).json({ message: "Unable to list categories." });
  }
}

function getUploadedCategoryImage(req) {
  return req.file?.path || "";
}

function getCategoryPayload(body, uploadedImage = "", existingCategory = null) {
  const name = body.name?.trim() || "";
  const requestedSlug = body.slug?.trim() || name;
  const parentId = body.parent_id || body.parentId || null;
  const keepImage = body.keepImage !== "false";

  return {
    name,
    slugBase: slugify(requestedSlug),
    parent_id: parentId ? Number(parentId) : null,
    image_url: uploadedImage || body.image_url || (keepImage ? existingCategory?.image_url || "" : ""),
    display_order: Number.parseInt(body.display_order ?? body.displayOrder, 10) || 0,
    is_active:
      body.is_active === undefined && body.isActive === undefined
        ? true
        : ["true", "1", "on", true, 1].includes(body.is_active ?? body.isActive),
  };
}

async function validateCategory(payload, categoryId = null) {
  if (!payload.name) return "Category name is required.";

  if (payload.parent_id && String(payload.parent_id) === String(categoryId)) {
    return "A category cannot be its own parent.";
  }

  if (payload.parent_id) {
    const parent = await pool.query("SELECT id, parent_id FROM categories WHERE id = $1", [
      payload.parent_id,
    ]);

    if (parent.rowCount === 0) return "Parent category not found.";
    if (parent.rows[0].parent_id) return "Subcategories cannot have children.";
  }

  return "";
}

async function createCategory(req, res) {
  try {
    const payload = getCategoryPayload(req.body, getUploadedCategoryImage(req));
    const validationError = await validateCategory(payload);

    if (validationError) {
      return res.status(400).json({ message: validationError });
    }

    const slug = await makeUniqueSlug(payload.slugBase);
    const result = await pool.query(
      `INSERT INTO categories (name, slug, parent_id, image_url, display_order, is_active)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        payload.name,
        slug,
        payload.parent_id,
        payload.image_url,
        payload.display_order,
        payload.is_active,
      ]
    );

    return res.status(201).json(mapCategory({ ...result.rows[0], product_count: 0 }));
  } catch (error) {
    console.error("Unable to create category:", error);
    return res.status(500).json({ message: "Unable to create category." });
  }
}

async function updateCategory(req, res) {
  const { id } = req.params;

  try {
    const existing = await pool.query("SELECT * FROM categories WHERE id = $1", [id]);

    if (existing.rowCount === 0) {
      return res.status(404).json({ message: "Category not found." });
    }

    const payload = getCategoryPayload(
      req.body,
      getUploadedCategoryImage(req),
      existing.rows[0]
    );
    const validationError = await validateCategory(payload, id);

    if (validationError) {
      return res.status(400).json({ message: validationError });
    }

    const slug = await makeUniqueSlug(payload.slugBase, id);
    const result = await pool.query(
      `UPDATE categories
       SET name = $1,
           slug = $2,
           parent_id = $3,
           image_url = $4,
           display_order = $5,
           is_active = $6,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $7
       RETURNING *`,
      [
        payload.name,
        slug,
        payload.parent_id,
        payload.image_url,
        payload.display_order,
        payload.is_active,
        id,
      ]
    );

    return res.json(mapCategory({ ...result.rows[0], product_count: 0 }));
  } catch (error) {
    console.error("Unable to update category:", error);
    return res.status(500).json({ message: "Unable to update category." });
  }
}

async function deleteCategory(req, res) {
  const { id } = req.params;

  try {
    const productResult = await pool.query(
      "SELECT COUNT(*)::int AS count FROM products WHERE category_id = $1 OR subcategory_id = $1",
      [id]
    );

    if (productResult.rows[0].count > 0) {
      return res
        .status(409)
        .json({ message: "Cannot delete a category that contains products." });
    }

    const childResult = await pool.query(
      "SELECT COUNT(*)::int AS count FROM categories WHERE parent_id = $1",
      [id]
    );

    if (childResult.rows[0].count > 0) {
      return res
        .status(409)
        .json({ message: "Delete subcategories before deleting this category." });
    }

    const result = await pool.query("DELETE FROM categories WHERE id = $1 RETURNING id", [
      id,
    ]);

    if (result.rowCount === 0) {
      return res.status(404).json({ message: "Category not found." });
    }

    return res.json({ message: "Category deleted." });
  } catch (error) {
    console.error("Unable to delete category:", error);
    return res.status(500).json({ message: "Unable to delete category." });
  }
}

module.exports = {
  createCategory,
  deleteCategory,
  listAdminCategories,
  listPublicCategories,
  updateCategory,
};
