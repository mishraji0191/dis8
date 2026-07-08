function uploadCustomizationFiles(req, res) {
  const files = (req.files || []).map((file) => ({
    url: file.path,
    name: file.originalname,
    mimeType: file.mimetype,
    size: file.size,
  }));

  return res.status(201).json({ files });
}

module.exports = {
  uploadCustomizationFiles,
};
