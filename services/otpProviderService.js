const PROVIDERS = {
  MSG91: "msg91",
  TWILIO: "twilio",
  FAST2SMS: "fast2sms",
  LOG: "log",
};

function getConfiguredProvider() {
  const fallback = process.env.NODE_ENV === "production" ? PROVIDERS.MSG91 : PROVIDERS.LOG;
  return (process.env.OTP_PROVIDER || fallback).toLowerCase();
}

function buildOtpMessage(otp, purpose) {
  const label = purpose === "two_factor" ? "login" : "verification";
  return `Your DIS8 ${label} OTP is ${otp}. It expires in 10 minutes.`;
}

async function postJson(url, headers, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    const error = new Error(`OTP provider returned ${response.status}: ${text}`);
    error.status = response.status === 429 ? 429 : 403;
    throw error;
  }

  return response.json().catch(() => ({}));
}

async function sendViaMsg91({ phone, otp, purpose }) {
  const authKey = process.env.MSG91_AUTH_KEY;
  const templateId = process.env.MSG91_TEMPLATE_ID;

  if (!authKey || !templateId) {
    const error = new Error("MSG91_AUTH_KEY and MSG91_TEMPLATE_ID are required.");
    error.status = 403;
    throw error;
  }

  const mobile = String(phone || "").replace(/\D/g, "");

  return postJson(
    "https://control.msg91.com/api/v5/otp",
    { authkey: authKey },
    {
      template_id: templateId,
      mobile,
      otp,
      message: buildOtpMessage(otp, purpose),
    }
  );
}

async function sendViaTwilio({ phone, otp, purpose }) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM_NUMBER;

  if (!accountSid || !authToken || !from) {
    const error = new Error("TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_FROM_NUMBER are required.");
    error.status = 403;
    throw error;
  }

  const params = new URLSearchParams({
    To: phone,
    From: from,
    Body: buildOtpMessage(otp, purpose),
  });

  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
    {
      method: "POST",
      headers: {
        authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
        "content-type": "application/x-www-form-urlencoded",
      },
      body: params,
    }
  );

  if (!response.ok) {
    const text = await response.text();
    const error = new Error(`Twilio returned ${response.status}: ${text}`);
    error.status = response.status === 429 ? 429 : 403;
    throw error;
  }

  return response.json();
}

async function sendViaFast2Sms({ phone, otp, purpose }) {
  const apiKey = process.env.FAST2SMS_API_KEY;

  if (!apiKey) {
    const error = new Error("FAST2SMS_API_KEY is required.");
    error.status = 403;
    throw error;
  }

  return postJson(
    "https://www.fast2sms.com/dev/bulkV2",
    { authorization: apiKey },
    {
      route: "q",
      numbers: phone,
      message: buildOtpMessage(otp, purpose),
      flash: 0,
    }
  );
}

async function sendOtpSms({ phone, otp, purpose }) {
  if (!phone) {
    const error = new Error("Phone number is required for OTP.");
    error.status = 400;
    throw error;
  }

  const provider = getConfiguredProvider();

  if (provider === PROVIDERS.MSG91) return sendViaMsg91({ phone, otp, purpose });
  if (provider === PROVIDERS.TWILIO) return sendViaTwilio({ phone, otp, purpose });
  if (provider === PROVIDERS.FAST2SMS) return sendViaFast2Sms({ phone, otp, purpose });

  console.info(`[otp:${provider}] ${phone} ${purpose} OTP ${otp}`);
  return { provider, delivered: true };
}

module.exports = {
  PROVIDERS,
  sendOtpSms,
};
