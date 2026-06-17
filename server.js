const express = require("express");
const cors    = require("cors");
const fetch   = require("node-fetch");

const app          = express();
const PORT         = process.env.PORT || 3001;
const MASSIVE_KEY  = process.env.MASSIVE_KEY || "pWvpNRpSnrv3Ah8uKtytUmkhSFqOJ7n0";
const MASSIVE_BASE = "https://api.massive.com";

app.use(cors({ origin:"*", methods:["GET","OPTIONS"], allowedHeaders:["Content-Type","User-Agent"] }));
app.options("*", cors());

// ── health check ──────────────────────────────────────────────
app.get("/ping", (req, res) => res.json({ status:"ok", message:"WhaleFlow proxy running" }));

// ── Massive test ──────────────────────────────────────────────
app.get("/test", async (req, res) => {
  try {
    const r    = await fetch(`${MASSIVE_BASE}/v3/snapshot/options/SPY?limit=1&order=desc&apiKey=${MASSIVE_KEY}`);
    const data = await r.json();
    res.json({ massive_status:r.status, results_count:(data.results||[]).length, ok:r.ok });
  } catch(e) { res.status(500).json({ error:e.message }); }
});

// ── Massive options chain ─────────────────────────────────────
app.get("/options/:ticker", async (req, res) => {
  const { ticker } = req.params;
  const params = new URLSearchParams(req.query);
  params.set("apiKey", MASSIVE_KEY);
  console.log(`[options] ${ticker}`);
  try {
    const r    = await fetch(`${MASSIVE_BASE}/v3/snapshot/options/${ticker}?${params}`);
    const data = await r.json();
    res.json(data);
  } catch(e) { res.status(500).json({ error:e.message }); }
});

// ── Yahoo Finance helpers (direct URL, no library needed) ─────
const YF_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
  "Accept": "application/json",
};

async function yfQuotes(tickers) {
  const fields = [
    "symbol","shortName","regularMarketPrice","regularMarketPreviousClose",
    "preMarketPrice","preMarketVolume","postMarketPrice","postMarketVolume",
    "regularMarketVolume","averageDailyVolume3Month","averageDailyVolume10Day",
    "regularMarketChangePercent","marketCap"
  ].join(",");
  const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${tickers.join(",")}&fields=${fields}&crumb=`;
  const r = await fetch(url, { headers: YF_HEADERS });
  const data = await r.json();
  return (data?.quoteResponse?.result || []);
}

async function yfScreener(scrId) {
  const url = `https://query1.finance.yahoo.com/v1/finance/screener/predefined/saved?scrIds=${scrId}&count=25`;
  const r = await fetch(url, { headers: YF_HEADERS });
  const data = await r.json();
  return (data?.finance?.result?.[0]?.quotes || []);
}

// ── Yahoo bulk quotes ─────────────────────────────────────────
app.get("/quotes", async (req, res) => {
  const tickers = (req.query.tickers||"").split(",").map(t=>t.trim().toUpperCase()).filter(Boolean);
  if(!tickers.length) return res.status(400).json({ error:"no tickers" });
  console.log(`[quotes] ${tickers.join(",")}`);
  try {
    const quotes = await yfQuotes(tickers);
    const data = {};
    quotes.forEach(q => { data[q.symbol] = q; });
    // fill missing with error
    tickers.forEach(t => { if(!data[t]) data[t] = { error:"not found" }; });
    res.json({ ok:true, data });
  } catch(e) { res.status(500).json({ ok:false, error:e.message }); }
});

// ── Yahoo single quote ────────────────────────────────────────
app.get("/quote/:ticker", async (req, res) => {
  try {
    const quotes = await yfQuotes([req.params.ticker.toUpperCase()]);
    res.json({ ok:true, data:quotes[0]||null });
  } catch(e) { res.status(500).json({ ok:false, error:e.message }); }
});

// ── Yahoo movers ──────────────────────────────────────────────
app.get("/movers/:type", async (req, res) => {
  const map = { gainers:"day_gainers", losers:"day_losers", actives:"most_actives" };
  const scrId = map[req.params.type] || "day_gainers";
  console.log(`[movers] ${scrId}`);
  try {
    const quotes = await yfScreener(scrId);
    res.json({ ok:true, data:quotes });
  } catch(e) { res.status(500).json({ ok:false, error:e.message }); }
});

app.listen(PORT, () => console.log(`🐋 WhaleFlow proxy on port ${PORT}`));
