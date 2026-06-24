const CompanySettings = require("../models/companySettingsModel");

function uploadedPath(files, fieldName, folder = "settings") {
  const file = files?.[fieldName]?.[0];
  return file ? `/uploads/${folder}/${file.filename}` : "";
}

async function getCompanyDetails(req, res) {
  try {
    const settings = await CompanySettings.getCompanySettings();
    return res.json(settings);
  } catch (error) {
    console.error("Unable to load company settings:", error);
    return res.status(500).json({ message: "Unable to load company settings." });
  }
}

async function updateCompanyDetails(req, res) {
  try {
    const currentSettings = await CompanySettings.getCompanySettings();
    const settings = {
      companyName: req.body.companyName?.trim() || currentSettings.companyName,
      bankName: req.body.bankName?.trim() || currentSettings.bankName,
      accountNumber: req.body.accountNumber?.trim() || currentSettings.accountNumber,
      ifscCode: req.body.ifscCode?.trim() || currentSettings.ifscCode,
      branch: req.body.branch?.trim() || currentSettings.branch,
      googlePayQR:
        uploadedPath(req.files, "googlePayQR") ||
        req.body.googlePayQR ||
        currentSettings.googlePayQR,
      phonePeQR:
        uploadedPath(req.files, "phonePeQR") ||
        req.body.phonePeQR ||
        currentSettings.phonePeQR,
      logo: uploadedPath(req.files, "logo") || req.body.logo || currentSettings.logo,
    };

    const updatedSettings = await CompanySettings.updateCompanySettings(settings);
    return res.json(updatedSettings);
  } catch (error) {
    console.error("Unable to update company settings:", error);
    return res.status(500).json({ message: "Unable to update company settings." });
  }
}

module.exports = {
  getCompanyDetails,
  updateCompanyDetails,
};
