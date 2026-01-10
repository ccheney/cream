/**
 * Ticker Symbol to Company Name Mapping
 *
 * Static mapping for common trading symbols.
 * Returns undefined for unknown symbols.
 */

const TICKER_NAMES: Record<string, string> = {
  // Mega-cap Tech
  AAPL: "Apple Inc.",
  MSFT: "Microsoft Corporation",
  GOOGL: "Alphabet Inc.",
  GOOG: "Alphabet Inc.",
  AMZN: "Amazon.com Inc.",
  META: "Meta Platforms Inc.",
  NVDA: "NVIDIA Corporation",
  TSLA: "Tesla Inc.",

  // Tech
  AMD: "Advanced Micro Devices",
  INTC: "Intel Corporation",
  CRM: "Salesforce Inc.",
  ORCL: "Oracle Corporation",
  ADBE: "Adobe Inc.",
  NFLX: "Netflix Inc.",
  AVGO: "Broadcom Inc.",
  CSCO: "Cisco Systems Inc.",
  QCOM: "Qualcomm Inc.",
  TXN: "Texas Instruments",
  MU: "Micron Technology",
  AMAT: "Applied Materials",
  LRCX: "Lam Research",
  KLAC: "KLA Corporation",
  MRVL: "Marvell Technology",
  SNPS: "Synopsys Inc.",
  CDNS: "Cadence Design Systems",
  PANW: "Palo Alto Networks",
  CRWD: "CrowdStrike Holdings",
  ZS: "Zscaler Inc.",
  DDOG: "Datadog Inc.",
  SNOW: "Snowflake Inc.",
  PLTR: "Palantir Technologies",

  // Finance
  JPM: "JPMorgan Chase & Co.",
  BAC: "Bank of America",
  WFC: "Wells Fargo & Co.",
  GS: "Goldman Sachs",
  MS: "Morgan Stanley",
  C: "Citigroup Inc.",
  BLK: "BlackRock Inc.",
  SCHW: "Charles Schwab",
  AXP: "American Express",
  V: "Visa Inc.",
  MA: "Mastercard Inc.",
  PYPL: "PayPal Holdings",
  SQ: "Block Inc.",
  COIN: "Coinbase Global",

  // Healthcare
  JNJ: "Johnson & Johnson",
  UNH: "UnitedHealth Group",
  PFE: "Pfizer Inc.",
  MRK: "Merck & Co.",
  ABBV: "AbbVie Inc.",
  LLY: "Eli Lilly & Co.",
  TMO: "Thermo Fisher Scientific",
  ABT: "Abbott Laboratories",
  BMY: "Bristol-Myers Squibb",
  AMGN: "Amgen Inc.",
  GILD: "Gilead Sciences",
  MRNA: "Moderna Inc.",
  REGN: "Regeneron Pharmaceuticals",
  VRTX: "Vertex Pharmaceuticals",
  ISRG: "Intuitive Surgical",

  // Consumer
  WMT: "Walmart Inc.",
  HD: "Home Depot Inc.",
  COST: "Costco Wholesale",
  TGT: "Target Corporation",
  LOW: "Lowe's Companies",
  NKE: "Nike Inc.",
  SBUX: "Starbucks Corporation",
  MCD: "McDonald's Corporation",
  DIS: "Walt Disney Company",
  CMCSA: "Comcast Corporation",

  // Industrial
  CAT: "Caterpillar Inc.",
  DE: "Deere & Company",
  BA: "Boeing Company",
  GE: "General Electric",
  HON: "Honeywell International",
  UPS: "United Parcel Service",
  RTX: "RTX Corporation",
  LMT: "Lockheed Martin",
  MMM: "3M Company",

  // Energy
  XOM: "Exxon Mobil",
  CVX: "Chevron Corporation",
  COP: "ConocoPhillips",
  SLB: "Schlumberger Ltd.",
  EOG: "EOG Resources",
  OXY: "Occidental Petroleum",

  // ETFs & Indices
  SPY: "SPDR S&P 500 ETF",
  QQQ: "Invesco QQQ Trust",
  IWM: "iShares Russell 2000",
  DIA: "SPDR Dow Jones ETF",
  VTI: "Vanguard Total Stock Market",
  VOO: "Vanguard S&P 500 ETF",
  VXX: "iPath Series B S&P 500 VIX",
  UVXY: "ProShares Ultra VIX",
  SQQQ: "ProShares UltraPro Short QQQ",
  TQQQ: "ProShares UltraPro QQQ",
  ARKK: "ARK Innovation ETF",
  XLF: "Financial Select Sector SPDR",
  XLE: "Energy Select Sector SPDR",
  XLK: "Technology Select Sector SPDR",
  XLV: "Health Care Select Sector SPDR",
  XLI: "Industrial Select Sector SPDR",
  XLP: "Consumer Staples Select SPDR",
  XLY: "Consumer Discretionary SPDR",
  XLB: "Materials Select Sector SPDR",
  XLU: "Utilities Select Sector SPDR",
  XLRE: "Real Estate Select Sector SPDR",
  GLD: "SPDR Gold Shares",
  SLV: "iShares Silver Trust",
  TLT: "iShares 20+ Year Treasury",
  HYG: "iShares iBoxx High Yield",
  LQD: "iShares iBoxx Investment Grade",
  EEM: "iShares MSCI Emerging Markets",
  EFA: "iShares MSCI EAFE",
  FXI: "iShares China Large-Cap",

  // Other notable
  "BRK.A": "Berkshire Hathaway",
  "BRK.B": "Berkshire Hathaway",
  T: "AT&T Inc.",
  VZ: "Verizon Communications",
  PG: "Procter & Gamble",
  KO: "Coca-Cola Company",
  PEP: "PepsiCo Inc.",
  PM: "Philip Morris International",
  MO: "Altria Group",
  IBM: "IBM Corporation",
  F: "Ford Motor Company",
  GM: "General Motors",
  UBER: "Uber Technologies",
  LYFT: "Lyft Inc.",
  ABNB: "Airbnb Inc.",
  RIVN: "Rivian Automotive",
  LCID: "Lucid Group",
  NIO: "NIO Inc.",
  BABA: "Alibaba Group",
  JD: "JD.com Inc.",
  PDD: "PDD Holdings",
  TSM: "Taiwan Semiconductor",
  ASML: "ASML Holding",
  ARM: "Arm Holdings",
};

/**
 * Get company name for a ticker symbol.
 * Returns undefined if not found.
 */
export function getTickerName(symbol: string): string | undefined {
  return TICKER_NAMES[symbol.toUpperCase()];
}

/**
 * Get company name or fallback to symbol.
 */
export function getTickerNameOrSymbol(symbol: string): string {
  return TICKER_NAMES[symbol.toUpperCase()] ?? symbol.toUpperCase();
}

export default TICKER_NAMES;
