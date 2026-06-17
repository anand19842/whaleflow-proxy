const express = require("express");
const cors    = require("cors");
const fetch   = require("node-fetch");

const app          = express();
const PORT         = process.env.PORT || 3001;
const MASSIVE_KEY  = process.env.MASSIVE_KEY || "pWvpNRpSnrv3Ah8uKtytUmkhSFqOJ7n0";
const MASSIVE_BASE = "https://api.massive.com";

app.use(cors({ origin:"*", methods:["GET","POST","OPTIONS"], allowedHeaders:["Content-Type"] }));
app.options("*", cors());
app.use(express.json());

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

// ── Yahoo Finance v8 (no crumb needed) ───────────────────────
const YF_UA = "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";

async function yfQuote(ticker) {
  const url = `https://query2.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=1d&includePrePost=true`;
  const r = await fetch(url, { headers:{ "User-Agent": YF_UA } });
  if(!r.ok) throw new Error(`Yahoo ${r.status} for ${ticker}`);
  const data = await r.json();
  const meta = data?.chart?.result?.[0]?.meta;
  if(!meta) throw new Error(`no data for ${ticker}`);
  return {
    symbol:                    meta.symbol,
    shortName:                 meta.shortName || meta.symbol,
    regularMarketPrice:        meta.regularMarketPrice,
    regularMarketPreviousClose:meta.previousClose || meta.chartPreviousClose,
    preMarketPrice:            meta.preMarketPrice || null,
    postMarketPrice:           meta.postMarketPrice || null,
    regularMarketVolume:       meta.regularMarketVolume || 0,
    preMarketVolume:           null, // v8 doesn't expose this directly
    averageDailyVolume3Month:  meta.averageDailyVolume3Month || null,
    marketCap:                 meta.marketCap || null,
    regularMarketChangePercent:meta.regularMarketChangePercent || 0,
  };
}

// ── Yahoo single quote ────────────────────────────────────────
app.get("/quote/:ticker", async (req, res) => {
  try {
    const data = await yfQuote(req.params.ticker.toUpperCase());
    res.json({ ok:true, data });
  } catch(e) { res.status(500).json({ ok:false, error:e.message }); }
});

// ── Yahoo bulk quotes (sequential, small batches) ─────────────
app.get("/quotes", async (req, res) => {
  const tickers = (req.query.tickers||"").split(",").map(t=>t.trim().toUpperCase()).filter(Boolean);
  if(!tickers.length) return res.status(400).json({ error:"no tickers" });
  console.log(`[quotes] ${tickers.join(",")}`);
  const data = {};
  await Promise.allSettled(
    tickers.map(async t => {
      try   { data[t] = await yfQuote(t); }
      catch { data[t] = { error:"fetch failed", symbol:t }; }
    })
  );
  res.json({ ok:true, data });
});

// ── Movers + Small Cap Runners ───────────────────────────────
const TICKER_LISTS = {
  gainers:  ["NVDA","TSLA","AAPL","AMD","META","PLTR","COIN","MARA","ARM","SMCI","SOFI","HOOD"],
  losers:   ["NVDA","TSLA","AAPL","AMD","META","PLTR","COIN","MARA","ARM","SMCI","SOFI","HOOD"],
  actives:  ["SPY","QQQ","AAPL","NVDA","TSLA","AMD","META","AMZN","GOOGL","MSFT","PLTR","COIN"],
  // Small cap momentum names — under $30, high beta
  smallcap: [
    "MARA","RIOT","HOOD","SOFI","MSTR","NVTS","SOUN","KULR",
    "RGTI","QBTS","IONQ","ARQQ","QUBT","ACHR","JOBY","RKLB","LUNR",
    "SPAI","FFAI","LASE","RCAT","ONDS","HIVE","CIFR","BTBT","HUT","CLSK",
    "NKLA","GOEV","RIDE","WKHS","BLNK","CHPT","PTRA","IDEANOMICS",
    "CLOV","WISH","WOOF","SKLZ","BARK","ZETA","OPEN","MAPS"
  ],
};

app.get("/movers/:type", async (req, res) => {
  const type    = req.params.type;
  const tickers = TICKER_LISTS[type] || TICKER_LISTS.actives;
  console.log(`[movers] ${type} (${tickers.length} tickers)`);
  const results = [];
  await Promise.allSettled(
    tickers.map(async t => {
      try { results.push(await yfQuote(t)); } catch {}
    })
  );
  // Sort appropriately
  if(type==="gainers"||type==="smallcap")
    results.sort((a,b)=>(b.regularMarketChangePercent||0)-(a.regularMarketChangePercent||0));
  else if(type==="losers")
    results.sort((a,b)=>(a.regularMarketChangePercent||0)-(b.regularMarketChangePercent||0));
  else
    results.sort((a,b)=>(b.regularMarketVolume||0)-(a.regularMarketVolume||0));
  res.json({ ok:true, data:results });
});

app.listen(PORT, () => console.log(`🐋 WhaleFlow proxy on port ${PORT}`));
