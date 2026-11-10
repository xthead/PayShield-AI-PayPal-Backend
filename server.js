
require("dotenv").config();

const express = require("express");
const cors = require("cors");

const app = express();

app.use(cors({
  origin: process.env.FRONTEND_URL
    ? process.env.FRONTEND_URL.split(",").map(x => x.trim())
    : false
}));

app.use(express.json());

const PORT = process.env.PORT || 3000;

const PAYPAL_BASE = process.env.PAYPAL_ENV === "live"
  ? "https://api-m.paypal.com"
  : "https://api-m.sandbox.paypal.com";

const CLIENT_ID = process.env.PAYPAL_CLIENT_ID;
const CLIENT_SECRET = process.env.PAYPAL_CLIENT_SECRET;

async function getAccessToken() {
  if (!CLIENT_ID || !CLIENT_SECRET) {
    throw new Error("PayPal credentials are not configured");
  }

  const auth = Buffer.from(
    `${CLIENT_ID}:${CLIENT_SECRET}`
  ).toString("base64");

  const response = await fetch(`${PAYPAL_BASE}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: "grant_type=client_credentials"
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error("PayPal authentication failed");
  }

  return data.access_token;
}

app.get("/api/health", (req, res) => {
  res.json({ status: "PayShield AI backend is running" });
});

// Create a fixed-value Sandbox order
app.post("/api/orders", async (req, res) => {
  try {
    const token = await getAccessToken();

    const response = await fetch(
      `${PAYPAL_BASE}/v2/checkout/orders`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          intent: "CAPTURE",
          purchase_units: [{
            amount: {
              currency_code: "USD",
              value: "1.00"
            },
            description: "PayShield AI Sandbox Test"
          }]
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return res.status(502).json({
        error: "Unable to create PayPal order"
      });
    }

    res.json({ id: data.id });
  } catch (error) {
    console.error(error.message);
    res.status(500).json({ error: "Order creation failed" });
  }
});

// Capture a PayPal order
app.post("/api/orders/:orderID/capture", async (req, res) => {
  try {
    const token = await getAccessToken();

    const response = await fetch(
      `${PAYPAL_BASE}/v2/checkout/orders/${encodeURIComponent(req.params.orderID)}/capture`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        }
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return res.status(502).json({
        error: "Payment capture failed"
      });
    }

    const capture = data.purchase_units?.[0]?.payments?.captures?.[0];

    if (
      data.status !== "COMPLETED" ||
      capture?.status !== "COMPLETED" ||
      capture?.amount?.currency_code !== "USD" ||
      capture?.amount?.value !== "1.00"
    ) {
      return res.status(400).json({
        error: "Payment was not verified as completed"
      });
    }

    res.json({
      status: "COMPLETED",
      message: "PayPal Sandbox payment successful"
    });
  } catch (error) {
    console.error(error.message);
    res.status(500).json({ error: "Payment verification failed" });
  }
});

app.listen(PORT, () => {
  console.log(`PayShield AI backend running on port ${PORT}`);
});
