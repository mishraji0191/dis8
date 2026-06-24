const pool = require("../config/db");

const defaultSettings = {
  companyName: "DIS8 INTERNATIONAL",
  bankName: "IDFC FIRST BANK",
  accountNumber: "82611202131",
  ifscCode: "IDFB0020158",
  branch: "NOIDA",
  googlePayQR: "",
  phonePeQR: "",
  logo: "",
};

function mapSettings(row = {}) {
  return {
    companyName: row.company_name || defaultSettings.companyName,
    bankName: row.bank_name || defaultSettings.bankName,
    accountNumber: row.account_number || defaultSettings.accountNumber,
    ifscCode: row.ifsc_code || defaultSettings.ifscCode,
    branch: row.branch || defaultSettings.branch,
    googlePayQR: row.google_pay_qr || defaultSettings.googlePayQR,
    phonePeQR: row.phone_pe_qr || defaultSettings.phonePeQR,
    logo: row.logo || defaultSettings.logo,
  };
}

async function getCompanySettings() {
  const result = await pool.query(
    `INSERT INTO company_settings
       (id, company_name, bank_name, account_number, ifsc_code, branch)
     VALUES (1, $1, $2, $3, $4, $5)
     ON CONFLICT (id) DO NOTHING
     RETURNING *`,
    [
      defaultSettings.companyName,
      defaultSettings.bankName,
      defaultSettings.accountNumber,
      defaultSettings.ifscCode,
      defaultSettings.branch,
    ]
  );

  if (result.rowCount > 0) {
    return mapSettings(result.rows[0]);
  }

  const existing = await pool.query("SELECT * FROM company_settings WHERE id = 1");
  return mapSettings(existing.rows[0]);
}

async function updateCompanySettings(settings) {
  const result = await pool.query(
    `INSERT INTO company_settings
       (id, company_name, bank_name, account_number, ifsc_code, branch, google_pay_qr, phone_pe_qr, logo, updated_at)
     VALUES (1, $1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP)
     ON CONFLICT (id) DO UPDATE
     SET company_name = EXCLUDED.company_name,
         bank_name = EXCLUDED.bank_name,
         account_number = EXCLUDED.account_number,
         ifsc_code = EXCLUDED.ifsc_code,
         branch = EXCLUDED.branch,
         google_pay_qr = EXCLUDED.google_pay_qr,
         phone_pe_qr = EXCLUDED.phone_pe_qr,
         logo = EXCLUDED.logo,
         updated_at = CURRENT_TIMESTAMP
     RETURNING *`,
    [
      settings.companyName,
      settings.bankName,
      settings.accountNumber,
      settings.ifscCode,
      settings.branch,
      settings.googlePayQR,
      settings.phonePeQR,
      settings.logo,
    ]
  );

  return mapSettings(result.rows[0]);
}

module.exports = {
  defaultSettings,
  getCompanySettings,
  updateCompanySettings,
};
