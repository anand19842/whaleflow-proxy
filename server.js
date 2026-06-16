const express = require("express");
const cors    = require("cors");
const fetch   = require("node-fetch");

const app          = express();
const PORT         = process.env.PORT || 3001;
const MASSIVE_KEY  = process.env.MASSIVE_KEY || "B03oBGuSlIOsWpnS84pX6Hps2QSyuCtE";
const MASSIVE_BASE = "https://api.massive.com";

app.use(cors({ origin: "*" }));

// Health check
app.get("/ping", (req, res) => {
  res.json({ status: "ok", message: "WhaleFlow proxy is running" });
});

// Options chain: GET /options/:ticker
app.get("/options/:ticker", async (req, res) => {
  const { ticker } = req.params;
  const params = new URLSearchParams(req.query);
  params.set("apiKey", MASSIVE_KEY);

  const url = `${MASSIVE_BASE}/v3/snapshot/options/${ticker}?${params}`;
  console.log(`[${new Date().toLocaleTimeString()}] ${ticker}`);

  try {
    const response = await fetch(url);
    const data     = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`🐋 WhaleFlow proxy running on port ${PORT}`);
});
