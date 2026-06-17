const express  = require("express");
const cors     = require("cors");
const fetch    = require("node-fetch");
const yf       = require("yahoo-finance2").default;

const app          = express();
const PORT         = process.env.PORT || 3001;
const MASSIVE_KEY  = process.env.MASSIVE_KEY || "pWvpNRpSnrv3Ah8uKtytUmkhSFqOJ7n0";
const MASSIVE_BASE = "https://api.massive.com";

app.use(cors({ origin: "*", methods: ["GET","OPTIONS"], allowedHeaders: ["Content-Type"] }));
app.options("*", cors());

// ── health check ──────────────────────────────────────────────
app.get("/ping", (req, res) => res.json({ status:"ok", message:"WhaleFlow proxy running" }));

// ── Massive API test ──────────────────────────────────────────
app.get("/test", async (req, res) => {
  const url = `${MASSIVE_BASE}/v3/snapshot/options/SPY?limit=1&order=desc&apiKey=${MASSIVE_KEY}`;
  try {
    const r    = await fetch(url);
    const data = await r.json();
    res.json({ massive_status:r.status, results_count:(data.results||[]).length, ok:r.ok });
  } catch(e) { res.status(500).json({ error:e.message }); }
});

// ── Massive options chain ─────────────────────────────────────
app.get("/options/:ticker", async (req, res) => {
  const { ticker } = req.params;
  const params = new URLSearchParams(req.query);
  params.set("apiKey", MASSIVE_KEY);
  const url = `${MASSIVE_BASE}/v3/snapshot/options/${ticker}?${params}`;
  console.log(`[options] ${ticker}`);
  try {
    const r    = await fetch(url);
    const data = await r.json();
    res.json(data);
  } catch(e) { res.status(500).json({ error:e.message }); }
});

// ── Yahoo Finance quote (single ticker) ───────────────────────
app.get("/quote/:ticker", async (req, res) => {
  try {
    const q = await yf.quote(req.params.ticker.toUpperCase());
    res.json({ ok:true, data:q });
  } catch(e) { res.status(500).json({ ok:false, error:e.message }); }
});

// ── Yahoo Finance bulk quotes ─────────────────────────────────
// GET /quotes?tickers=SPY,NVDA,TSLA
app.get("/quotes", async (req, res) => {
  const tickers = (req.query.tickers||"").split(",").map(t=>t.trim().toUpperCase()).filter(Boolean);
  if(!tickers.length) return res.status(400).json({ error:"no tickers" });
  console.log(`[quotes] ${tickers.join(",")}`);
  try {
    const results = await Promise.allSettled(tickers.map(t => yf.quote(t)));
    const data = {};
    results.forEach((r, i) => {
      data[tickers[i]] = r.status==="fulfilled" ? r.value : { error:r.reason?.message };
    });
    res.json({ ok:true, data });
  } catch(e) { res.status(500).json({ ok:false, error:e.message }); }
});

// ── Yahoo Finance search / screener ──────────────────────────
// GET /movers?type=gainers|losers|actives
app.get("/movers/:type", async (req, res) => {
  const screenMap = {
    gainers:  "day_gainers",
    losers:   "day_losers",
    actives:  "most_actives",
  };
  const scrId = screenMap[req.params.type] || "day_gainers";
  console.log(`[movers] ${scrId}`);
  try {
    const result = await yf.screener({ scrIds: scrId, count: 25 });
    res.json({ ok:true, data: result.quotes || [] });
  } catch(e) { res.status(500).json({ ok:false, error:e.message }); }
});

app.listen(PORT, () => console.log(`🐋 WhaleFlow proxy on port ${PORT}`));
