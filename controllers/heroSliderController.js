const pool = require("../config/db");

const allowedPositions = new Set(["left", "center", "right"]);
let schemaReadyPromise = null;

const heroSliderSchema = `
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

  CREATE INDEX IF NOT EXISTS hero_sliders_active_order_idx
  ON hero_sliders (is_active, display_order ASC, id ASC);
`;

function ensureHeroSliderSchema() {
  if (!schemaReadyPromise) {
    schemaReadyPromise = pool.query(heroSliderSchema).catch((error) => {
      schemaReadyPromise = null;
      throw error;
    });
  }

  return schemaReadyPromise;
}

function getErrorMessage(action, error) {
  console.error(`${action}:`, {
    message: error.message,
    code: error.code,
    detail: error.detail,
  });

  if (error.code === "42P01") {
    return "Hero slider table is missing. Apply the hero slider database migration.";
  }

  if (error.code === "23502" || error.code === "23514") {
    return "Hero banner data is incomplete or invalid.";
  }

  return error.message || "Hero slider request failed.";
}

function normalizeText(value, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

function getImageUrl(req) {
  if (req.file?.filename) {
    return `/uploads/products/${req.file.filename}`;
  }

  return normalizeText(req.body.image_url || req.body.imageUrl);
}

function getPayload(req, existing = {}) {
  const position = normalizeText(req.body.text_position || req.body.textPosition, "left").toLowerCase();
  const isActiveValue = req.body.is_active ?? req.body.isActive;

  return {
    title: normalizeText(req.body.title),
    subtitle: normalizeText(req.body.subtitle),
    image_url: getImageUrl(req) || existing.image_url || "",
    button_text: normalizeText(req.body.button_text || req.body.buttonText, "Shop Now"),
    button_link: normalizeText(req.body.button_link || req.body.buttonLink),
    collection: normalizeText(req.body.collection),
    text_position: allowedPositions.has(position) ? position : "left",
    display_order:
      req.body.display_order === undefined && req.body.displayOrder === undefined
        ? existing.display_order
        : Number.parseInt(req.body.display_order ?? req.body.displayOrder, 10),
    is_active:
      isActiveValue === undefined
        ? existing.is_active ?? true
        : ["true", "1", "yes", true, 1].includes(isActiveValue),
  };
}

function getCollectionLink(collection) {
  const slug = normalizeText(collection)
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  return slug ? `/${slug}` : "/products";
}

function validatePayload(payload) {
  if (!payload.title) return "Title is required.";
  if (!payload.image_url) return "Banner image is required.";
  if (!payload.collection) return "Collection is required.";
  if (!Number.isFinite(payload.display_order)) {
    payload.display_order = 0;
  }

  if (!payload.button_link) {
    payload.button_link = getCollectionLink(payload.collection);
  }

  if (!payload.button_link.startsWith("/")) {
    return "Button link must be an internal path such as /men.";
  }

  return "";
}

const heroSelect = `
  SELECT id, title, subtitle, image_url, button_text, button_link, collection,
         text_position, display_order, is_active, created_at, updated_at
  FROM hero_sliders
`;

async function listActiveHeroSliders(req, res) {
  try {
    await ensureHeroSliderSchema();
    const result = await pool.query(
      `${heroSelect}
       WHERE is_active = true
       ORDER BY display_order ASC, id ASC`
    );

    return res.json(result.rows);
  } catch (error) {
    return res.status(500).json({ message: getErrorMessage("Unable to list hero sliders", error) });
  }
}

async function listAdminHeroSliders(req, res) {
  try {
    await ensureHeroSliderSchema();
    const result = await pool.query(`${heroSelect} ORDER BY display_order ASC, id ASC`);
    return res.json(result.rows);
  } catch (error) {
    return res.status(500).json({ message: getErrorMessage("Unable to list admin hero sliders", error) });
  }
}

async function createHeroSlider(req, res) {
  const payload = getPayload(req);

  try {
    await ensureHeroSliderSchema();
    if (!Number.isFinite(payload.display_order)) {
      const orderResult = await pool.query(
        "SELECT COALESCE(MAX(display_order), 0) + 1 AS next_order FROM hero_sliders"
      );
      payload.display_order = Number(orderResult.rows[0]?.next_order) || 1;
    }

    const validationError = validatePayload(payload);
    if (validationError) {
      return res.status(400).json({ message: validationError });
    }

    const result = await pool.query(
      `INSERT INTO hero_sliders (
         title, subtitle, image_url, button_text, button_link, collection,
         text_position, display_order, is_active
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id, title, subtitle, image_url, button_text, button_link,
                 collection, text_position, display_order, is_active,
                 created_at, updated_at`,
      [
        payload.title,
        payload.subtitle,
        payload.image_url,
        payload.button_text,
        payload.button_link,
        payload.collection,
        payload.text_position,
        payload.display_order,
        payload.is_active,
      ]
    );

    return res.status(201).json(result.rows[0]);
  } catch (error) {
    return res.status(500).json({ message: getErrorMessage("Unable to create hero slider", error) });
  }
}

async function updateHeroSlider(req, res) {
  const { id } = req.params;

  try {
    await ensureHeroSliderSchema();
    const existingResult = await pool.query(
      "SELECT image_url, display_order, is_active FROM hero_sliders WHERE id = $1",
      [id]
    );

    if (existingResult.rowCount === 0) {
      return res.status(404).json({ message: "Banner not found." });
    }

    const payload = getPayload(req, existingResult.rows[0]);
    const validationError = validatePayload(payload);
    if (validationError) {
      return res.status(400).json({ message: validationError });
    }

    const result = await pool.query(
      `UPDATE hero_sliders
       SET title = $1,
           subtitle = $2,
           image_url = $3,
           button_text = $4,
           button_link = $5,
           collection = $6,
           text_position = $7,
           display_order = $8,
           is_active = $9,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $10
       RETURNING id, title, subtitle, image_url, button_text, button_link,
                 collection, text_position, display_order, is_active,
                 created_at, updated_at`,
      [
        payload.title,
        payload.subtitle,
        payload.image_url,
        payload.button_text,
        payload.button_link,
        payload.collection,
        payload.text_position,
        payload.display_order,
        payload.is_active,
        id,
      ]
    );

    return res.json(result.rows[0]);
  } catch (error) {
    return res.status(500).json({ message: getErrorMessage("Unable to update hero slider", error) });
  }
}

async function deleteHeroSlider(req, res) {
  try {
    await ensureHeroSliderSchema();
    const result = await pool.query("DELETE FROM hero_sliders WHERE id = $1 RETURNING id", [
      req.params.id,
    ]);

    if (result.rowCount === 0) {
      return res.status(404).json({ message: "Banner not found." });
    }

    return res.json({ message: "Banner deleted." });
  } catch (error) {
    return res.status(500).json({ message: getErrorMessage("Unable to delete hero slider", error) });
  }
}

async function updateHeroSliderStatus(req, res) {
  const isActive = ["true", "1", "yes", true, 1].includes(
    req.body.is_active ?? req.body.isActive
  );

  try {
    await ensureHeroSliderSchema();
    const result = await pool.query(
      `UPDATE hero_sliders
       SET is_active = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING id, title, subtitle, image_url, button_text, button_link,
                 collection, text_position, display_order, is_active,
                 created_at, updated_at`,
      [isActive, req.params.id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ message: "Banner not found." });
    }

    return res.json(result.rows[0]);
  } catch (error) {
    return res.status(500).json({ message: getErrorMessage("Unable to update hero slider status", error) });
  }
}

async function reorderHeroSliders(req, res) {
  const ids = Array.isArray(req.body.ids)
    ? req.body.ids
    : Array.isArray(req.body.bannerIds)
      ? req.body.bannerIds
      : [];

  if (ids.length === 0) {
    return res.status(400).json({ message: "Banner order is required." });
  }

  let client;

  try {
    await ensureHeroSliderSchema();
    client = await pool.connect();
    await client.query("BEGIN");

    for (let index = 0; index < ids.length; index += 1) {
      await client.query(
        "UPDATE hero_sliders SET display_order = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2",
        [index + 1, ids[index]]
      );
    }

    await client.query("COMMIT");

    const result = await pool.query(`${heroSelect} ORDER BY display_order ASC, id ASC`);
    return res.json(result.rows);
  } catch (error) {
    if (client) {
      await client.query("ROLLBACK");
    }
    return res.status(500).json({ message: getErrorMessage("Unable to reorder hero sliders", error) });
  } finally {
    if (client) {
      client.release();
    }
  }
}

module.exports = {
  createHeroSlider,
  deleteHeroSlider,
  listActiveHeroSliders,
  listAdminHeroSliders,
  reorderHeroSliders,
  updateHeroSlider,
  updateHeroSliderStatus,
};
