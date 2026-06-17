const express = require("express");
const cors    = require("cors");
const fetch   = require("node-fetch");

const app          = express();
const PORT         = process.env.PORT || 3001;
const MASSIVE_KEY  = process.env.MASSIVE_KEY || "pWvpNRpSnrv3Ah8uKtytUmkhSFqOJ7n0";
const MASSIVE_BASE = "https://api.massive.com";

app.use(cors({ origin:"*", methods:["GET","OPTIONS"], allowedHeaders:["Content-Type"] }));
app.options("*", cors());

// ── Yahoo crumb/cookie cache ──────────────────────────────────
let yfCrumb  = null;
let yfCookie = null;
let crumbExpiry = 0;

const YF_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.5",
};

async function getYFCrumb() {
  // Return cached crumb if still valid (1 hour)
  if(yfCrumb && yfCookie && Date.now() < crumbExpiry) return { crumb:yfCrumb, cookie:yfCookie };

  // Step 1: get cookie from Yahoo consent page
  const consentRes = await fetch("https://fc.yahoo.com", { headers: YF_HEADERS, redirect:"follow" });
  const cookies = (consentRes.headers.get("set-cookie")||"").split(",").map(c=>c.split(";")[0].trim()).join("; ");

  // Step 2: fetch crumb using that cookie
  const crumbRes = await fetch("https://query1.finance.yahoo.com/v1/test/getcrumb", {
    headers: { ...YF_HEADERS, "Cookie": cookies, "Accept":"text/plain" }
  });
  const crumb = await crumbRes.text();

  if(crumb && crumb.length > 2 && !crumb.includes("<")) {
    yfCrumb  = crumb.trim();
    yfCookie = cookies;
    crumbExpiry = Date.now() + 55 * 60 * 1000; // 55 min
    console.log("✅ Yahoo crumb obtained");
    return { crumb:yfCrumb, cookie:yfCookie };
  }
  throw new Error("Could not obtain Yahoo crumb");
}

async function yfQuotes(tickers) {
  const { crumb, cookie } = await getYFCrumb();
  const fields = [
    "symbol","shortName","regularMarketPrice","regularMarketPreviousClose",
    "preMarketPrice","preMarketVolume","postMarketPrice","postMarketVolume",
    "regularMarketVolume","averageDailyVolume3Month","averageDailyVolume10Day",
    "regularMarketChangePercent","marketCap"
  ].join(",");
  const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${tickers.join(",")}&fields=${fields}&crumb=${encodeURIComponent(crumb)}`;
  const r = await fetch(url, {
    headers: { ...YF_HEADERS, "Cookie": cookie, "Accept":"application/json" }
  });
  const data = await r.json();
  if(data?.quoteResponse?.error) throw new Error(JSON.stringify(data.quoteResponse.error));
  return data?.quoteResponse?.result || [];
}

async function yfScreener(scrId) {
  const { crumb, cookie } = await getYFCrumb();
  const url = `https://query1.finance.yahoo.com/v1/finance/screener/predefined/saved?scrIds=${scrId}&count=25&crumb=${encodeURIComponent(crumb)}`;
  const r = await fetch(url, {
    headers: { ...YF_HEADERS, "Cookie": cookie, "Accept":"application/json" }
  });
  const data = await r.json();
  return data?.finance?.result?.[0]?.quotes || [];
}

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

// ── Yahoo bulk quotes ─────────────────────────────────────────
app.get("/quotes", async (req, res) => {
  const tickers = (req.query.tickers||"").split(",").map(t=>t.trim().toUpperCase()).filter(Boolean);
  if(!tickers.length) return res.status(400).json({ error:"no tickers" });
  console.log(`[quotes] ${tickers.join(",")}`);
  try {
    const quotes = await yfQuotes(tickers);
    const data = {};
    quotes.forEach(q => { data[q.symbol] = q; });
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
