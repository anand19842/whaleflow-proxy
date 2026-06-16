const express = require("express");
const cors    = require("cors");
const fetch   = require("node-fetch");

const app          = express();
const PORT         = process.env.PORT || 3001;
const MASSIVE_KEY  = process.env.MASSIVE_KEY || "pWvpNRpSnrv3Ah8uKtytUmkhSFqOJ7n0";
const MASSIVE_BASE = "https://api.massive.com";

// Explicit CORS — allow all origins, all methods
app.use(cors({
  origin: "*",
  methods: ["GET","OPTIONS"],
  allowedHeaders: ["Content-Type","Authorization"],
}));

// Handle preflight
app.options("*", cors());

// Health check
app.get("/ping", (req, res) => {
  res.json({ status: "ok", message: "WhaleFlow proxy is running" });
});

// Quick API key test — hit Massive with a tiny request
app.get("/test", async (req, res) => {
  const url = `${MASSIVE_BASE}/v3/snapshot/options/SPY?limit=1&apiKey=${MASSIVE_KEY}`;
  try {
    const r    = await fetch(url);
    const data = await r.json();
    res.json({
      massive_status: r.status,
      results_count:  (data.results||[]).length,
      first_ticker:   data.results?.[0]?.details?.ticker || "none",
      ok: r.ok,
    });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
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
    console.error(err.message);
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`🐋 WhaleFlow proxy running on port ${PORT}`);
});
