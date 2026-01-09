-- ============================================
-- Cream Database Schema (Consolidated)
-- ============================================
-- Single init file for greenfield deployment.
-- For incremental migrations post-deployment, create new numbered migrations (002+).
--
-- Tables included:
--   Core Trading: decisions, agent_outputs, orders, positions, position_history,
--                 portfolio_snapshots, config_versions
--   Dashboard: alerts, system_state, backtests, backtest_trades, backtest_equity
--   Market Data: candles, corporate_actions, universe_cache, features, regime_labels
--   Thesis: thesis_state, thesis_state_history
--   Universe: index_constituents, ticker_changes, universe_snapshots
--   Prediction Markets: prediction_market_snapshots, prediction_market_signals,
--                       prediction_market_arbitrage
--   External: external_events
--   Indicators: indicators, indicator_trials, indicator_ic_history
--   Factors: hypotheses, factors, factor_performance, factor_correlations,
--            research_runs, factor_weights, paper_signals
--   Runtime Config: trading_config, agent_configs, universe_configs
--   Auth: user, session, account, verification, two_factor
--   User: alert_settings, user_preferences, audit_log
--
-- Note: CHECK constraints NOT used - Turso/libSQL does not support them.
-- Validation is handled at the application layer using Zod schemas.

-- ============================================
-- Schema Migrations Tracking
-- ============================================
CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================
-- 1. Core Trading Tables
-- ============================================

-- decisions: Trading decisions from OODA loop
CREATE TABLE IF NOT EXISTS decisions (
  id TEXT PRIMARY KEY,
  cycle_id TEXT NOT NULL,
  symbol TEXT NOT NULL,
  action TEXT NOT NULL,            -- BUY, SELL, HOLD, CLOSE, INCREASE, REDUCE, NO_TRADE
  direction TEXT NOT NULL,         -- LONG, SHORT, FLAT
  size REAL NOT NULL,
  size_unit TEXT NOT NULL,         -- SHARES, CONTRACTS, DOLLARS, PCT_EQUITY
  entry_price REAL,
  stop_loss REAL,
  take_profit REAL,
  status TEXT NOT NULL DEFAULT 'pending',  -- pending, approved, rejected, executed, cancelled, expired
  rationale TEXT,
  environment TEXT NOT NULL,       -- BACKTEST, PAPER, LIVE
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  executed_at TEXT,
  closed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_decisions_cycle_id ON decisions(cycle_id);
CREATE INDEX IF NOT EXISTS idx_decisions_symbol ON decisions(symbol);
CREATE INDEX IF NOT EXISTS idx_decisions_status ON decisions(status);
CREATE INDEX IF NOT EXISTS idx_decisions_created_at ON decisions(created_at);
CREATE INDEX IF NOT EXISTS idx_decisions_symbol_created ON decisions(symbol, created_at);
CREATE INDEX IF NOT EXISTS idx_decisions_environment ON decisions(environment);

-- agent_outputs: Agent votes and reasoning
CREATE TABLE IF NOT EXISTS agent_outputs (
  id TEXT PRIMARY KEY,
  decision_id TEXT NOT NULL,
  agent_type TEXT NOT NULL,        -- technical, news, fundamentals, bullish, bearish, trader, risk, critic
  vote TEXT NOT NULL,              -- APPROVE, REJECT, ABSTAIN
  confidence REAL NOT NULL,        -- 0 to 1
  reasoning_summary TEXT,
  full_reasoning TEXT,
  tokens_used INTEGER,
  latency_ms INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (decision_id) REFERENCES decisions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_agent_outputs_decision_id ON agent_outputs(decision_id);
CREATE INDEX IF NOT EXISTS idx_agent_outputs_agent_type ON agent_outputs(agent_type);
CREATE INDEX IF NOT EXISTS idx_agent_outputs_decision_agent ON agent_outputs(decision_id, agent_type);

-- orders: Order submissions and lifecycle
CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  decision_id TEXT,
  symbol TEXT NOT NULL,
  side TEXT NOT NULL,              -- buy, sell
  qty REAL NOT NULL,
  order_type TEXT NOT NULL,        -- market, limit, stop, stop_limit
  limit_price REAL,
  stop_price REAL,
  time_in_force TEXT NOT NULL DEFAULT 'day',  -- day, gtc, ioc, fok
  status TEXT NOT NULL DEFAULT 'pending',     -- pending, submitted, accepted, partial_fill, filled, cancelled, rejected, expired
  broker_order_id TEXT,
  filled_qty REAL DEFAULT 0,
  filled_avg_price REAL,
  commission REAL,
  environment TEXT NOT NULL,       -- BACKTEST, PAPER, LIVE
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  submitted_at TEXT,
  filled_at TEXT,
  cancelled_at TEXT,
  FOREIGN KEY (decision_id) REFERENCES decisions(id)
);

CREATE INDEX IF NOT EXISTS idx_orders_decision_id ON orders(decision_id);
CREATE INDEX IF NOT EXISTS idx_orders_symbol ON orders(symbol);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_broker_order_id ON orders(broker_order_id);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at);
CREATE INDEX IF NOT EXISTS idx_orders_environment ON orders(environment);

-- positions: Current open positions
CREATE TABLE IF NOT EXISTS positions (
  id TEXT PRIMARY KEY,
  symbol TEXT NOT NULL,
  side TEXT NOT NULL,              -- long, short
  qty REAL NOT NULL,
  avg_entry REAL NOT NULL,
  current_price REAL,
  unrealized_pnl REAL,
  unrealized_pnl_pct REAL,
  realized_pnl REAL DEFAULT 0,
  market_value REAL,
  cost_basis REAL,
  thesis_id TEXT,
  decision_id TEXT,
  status TEXT NOT NULL DEFAULT 'open',  -- open, closed, pending
  metadata TEXT,                   -- JSON for additional context
  environment TEXT NOT NULL,       -- BACKTEST, PAPER, LIVE
  opened_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  closed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_positions_symbol ON positions(symbol);
CREATE INDEX IF NOT EXISTS idx_positions_thesis_id ON positions(thesis_id);
CREATE INDEX IF NOT EXISTS idx_positions_decision_id ON positions(decision_id);
CREATE INDEX IF NOT EXISTS idx_positions_status ON positions(status);
CREATE INDEX IF NOT EXISTS idx_positions_environment ON positions(environment);
CREATE UNIQUE INDEX IF NOT EXISTS idx_positions_symbol_env ON positions(symbol, environment) WHERE closed_at IS NULL;

-- position_history: Historical snapshots for P&L tracking
CREATE TABLE IF NOT EXISTS position_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  position_id TEXT NOT NULL,
  timestamp TEXT NOT NULL DEFAULT (datetime('now')),
  price REAL NOT NULL,
  qty REAL NOT NULL,
  unrealized_pnl REAL,
  market_value REAL,
  FOREIGN KEY (position_id) REFERENCES positions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_position_history_position_id ON position_history(position_id);
CREATE INDEX IF NOT EXISTS idx_position_history_timestamp ON position_history(timestamp);
CREATE INDEX IF NOT EXISTS idx_position_history_position_ts ON position_history(position_id, timestamp);

-- portfolio_snapshots: Point-in-time portfolio state
CREATE TABLE IF NOT EXISTS portfolio_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp TEXT NOT NULL,
  environment TEXT NOT NULL,       -- BACKTEST, PAPER, LIVE
  nav REAL NOT NULL,
  cash REAL NOT NULL,
  equity REAL NOT NULL,
  gross_exposure REAL NOT NULL,
  net_exposure REAL NOT NULL,
  long_exposure REAL,
  short_exposure REAL,
  open_positions INTEGER,
  day_pnl REAL,
  day_return_pct REAL,
  total_return_pct REAL,
  max_drawdown REAL,
  UNIQUE(timestamp, environment)
);

CREATE INDEX IF NOT EXISTS idx_portfolio_snapshots_timestamp ON portfolio_snapshots(timestamp);
CREATE INDEX IF NOT EXISTS idx_portfolio_snapshots_environment ON portfolio_snapshots(environment);

-- config_versions: Version-controlled configuration
CREATE TABLE IF NOT EXISTS config_versions (
  id TEXT PRIMARY KEY,
  environment TEXT NOT NULL,       -- BACKTEST, PAPER, LIVE
  config_json TEXT NOT NULL,
  description TEXT,
  active INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_config_versions_environment ON config_versions(environment);
CREATE INDEX IF NOT EXISTS idx_config_versions_active ON config_versions(active);
CREATE INDEX IF NOT EXISTS idx_config_versions_created_at ON config_versions(created_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_config_versions_env_active ON config_versions(environment) WHERE active = 1;

-- ============================================
-- 2. Dashboard Tables
-- ============================================

-- alerts: System and trading alerts
CREATE TABLE IF NOT EXISTS alerts (
  id TEXT PRIMARY KEY,
  severity TEXT NOT NULL,          -- info, warning, error, critical
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  metadata TEXT,
  acknowledged INTEGER NOT NULL DEFAULT 0,
  acknowledged_by TEXT,
  acknowledged_at TEXT,
  environment TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_alerts_severity ON alerts(severity);
CREATE INDEX IF NOT EXISTS idx_alerts_type ON alerts(type);
CREATE INDEX IF NOT EXISTS idx_alerts_acknowledged ON alerts(acknowledged);
CREATE INDEX IF NOT EXISTS idx_alerts_created_at ON alerts(created_at);
CREATE INDEX IF NOT EXISTS idx_alerts_environment ON alerts(environment);
CREATE INDEX IF NOT EXISTS idx_alerts_unack_env ON alerts(environment, acknowledged) WHERE acknowledged = 0;

-- system_state: Current system state per environment
CREATE TABLE IF NOT EXISTS system_state (
  environment TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'stopped',
  last_cycle_id TEXT,
  last_cycle_time TEXT,
  current_phase TEXT,
  phase_started_at TEXT,
  next_cycle_at TEXT,
  error_message TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO system_state (environment, status) VALUES ('BACKTEST', 'stopped');
INSERT OR IGNORE INTO system_state (environment, status) VALUES ('PAPER', 'stopped');
INSERT OR IGNORE INTO system_state (environment, status) VALUES ('LIVE', 'stopped');

-- backtests: Backtest configurations and results
CREATE TABLE IF NOT EXISTS backtests (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  initial_capital REAL NOT NULL,
  universe TEXT,
  config_json TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  progress_pct REAL DEFAULT 0,
  total_return REAL,
  cagr REAL,
  sharpe_ratio REAL,
  sortino_ratio REAL,
  calmar_ratio REAL,
  max_drawdown REAL,
  win_rate REAL,
  profit_factor REAL,
  total_trades INTEGER,
  avg_trade_pnl REAL,
  metrics_json TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  started_at TEXT,
  completed_at TEXT,
  created_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_backtests_status ON backtests(status);
CREATE INDEX IF NOT EXISTS idx_backtests_start_date ON backtests(start_date);
CREATE INDEX IF NOT EXISTS idx_backtests_created_at ON backtests(created_at);

-- backtest_trades: Individual trades from backtests
CREATE TABLE IF NOT EXISTS backtest_trades (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  backtest_id TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  symbol TEXT NOT NULL,
  action TEXT NOT NULL,
  qty REAL NOT NULL,
  price REAL NOT NULL,
  commission REAL DEFAULT 0,
  pnl REAL,
  pnl_pct REAL,
  decision_rationale TEXT,
  FOREIGN KEY (backtest_id) REFERENCES backtests(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_backtest_trades_backtest_id ON backtest_trades(backtest_id);
CREATE INDEX IF NOT EXISTS idx_backtest_trades_timestamp ON backtest_trades(timestamp);
CREATE INDEX IF NOT EXISTS idx_backtest_trades_symbol ON backtest_trades(symbol);
CREATE INDEX IF NOT EXISTS idx_backtest_trades_bt_ts ON backtest_trades(backtest_id, timestamp);

-- backtest_equity: Equity curve for visualization
CREATE TABLE IF NOT EXISTS backtest_equity (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  backtest_id TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  nav REAL NOT NULL,
  cash REAL NOT NULL,
  equity REAL NOT NULL,
  drawdown REAL,
  drawdown_pct REAL,
  day_return_pct REAL,
  cumulative_return_pct REAL,
  FOREIGN KEY (backtest_id) REFERENCES backtests(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_backtest_equity_backtest_id ON backtest_equity(backtest_id);
CREATE INDEX IF NOT EXISTS idx_backtest_equity_timestamp ON backtest_equity(timestamp);
CREATE INDEX IF NOT EXISTS idx_backtest_equity_bt_ts ON backtest_equity(backtest_id, timestamp);

-- ============================================
-- 3. Market Data Tables
-- ============================================

-- candles: OHLCV data
CREATE TABLE IF NOT EXISTS candles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  symbol TEXT NOT NULL,
  timeframe TEXT NOT NULL,         -- 1m, 5m, 15m, 1h, 1d
  timestamp TEXT NOT NULL,
  open REAL NOT NULL,
  high REAL NOT NULL,
  low REAL NOT NULL,
  close REAL NOT NULL,
  volume REAL NOT NULL DEFAULT 0,
  vwap REAL,
  trade_count INTEGER,
  adjusted INTEGER NOT NULL DEFAULT 0,
  split_adjusted INTEGER NOT NULL DEFAULT 0,
  dividend_adjusted INTEGER NOT NULL DEFAULT 0,
  quality_flags TEXT,
  provider TEXT NOT NULL DEFAULT 'polygon',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_candles_symbol_timeframe_ts ON candles(symbol, timeframe, timestamp);
CREATE INDEX IF NOT EXISTS idx_candles_timestamp ON candles(timestamp);
CREATE INDEX IF NOT EXISTS idx_candles_symbol ON candles(symbol);
CREATE INDEX IF NOT EXISTS idx_candles_timeframe ON candles(timeframe);

-- corporate_actions: Splits, dividends, mergers
CREATE TABLE IF NOT EXISTS corporate_actions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  symbol TEXT NOT NULL,
  action_type TEXT NOT NULL,       -- split, dividend, merger, spinoff
  ex_date TEXT NOT NULL,
  record_date TEXT,
  pay_date TEXT,
  ratio REAL,
  amount REAL,
  details TEXT,
  provider TEXT NOT NULL DEFAULT 'polygon',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_corporate_actions_symbol_date ON corporate_actions(symbol, ex_date);
CREATE INDEX IF NOT EXISTS idx_corporate_actions_ex_date ON corporate_actions(ex_date);
CREATE INDEX IF NOT EXISTS idx_corporate_actions_type ON corporate_actions(action_type);
CREATE UNIQUE INDEX IF NOT EXISTS idx_corporate_actions_unique ON corporate_actions(symbol, action_type, ex_date);

-- universe_cache: Cached universe resolution
CREATE TABLE IF NOT EXISTS universe_cache (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  source_hash TEXT NOT NULL,
  tickers TEXT NOT NULL,
  ticker_count INTEGER NOT NULL,
  metadata TEXT,
  cached_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL,
  provider TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_universe_cache_source ON universe_cache(source_type, source_id);
CREATE INDEX IF NOT EXISTS idx_universe_cache_expires ON universe_cache(expires_at);
CREATE INDEX IF NOT EXISTS idx_universe_cache_hash ON universe_cache(source_hash);

-- features: Computed indicators
CREATE TABLE IF NOT EXISTS features (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  symbol TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  timeframe TEXT NOT NULL,
  indicator_name TEXT NOT NULL,
  raw_value REAL NOT NULL,
  normalized_value REAL,
  parameters TEXT,
  quality_score REAL,
  computed_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_features_symbol_ts_indicator ON features(symbol, timestamp, timeframe, indicator_name);
CREATE INDEX IF NOT EXISTS idx_features_symbol_indicator_ts ON features(symbol, indicator_name, timestamp);
CREATE INDEX IF NOT EXISTS idx_features_timestamp ON features(timestamp);
CREATE INDEX IF NOT EXISTS idx_features_indicator ON features(indicator_name);

-- regime_labels: Market regime classifications
CREATE TABLE IF NOT EXISTS regime_labels (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  symbol TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  timeframe TEXT NOT NULL,
  regime TEXT NOT NULL,            -- trending_up, trending_down, ranging, volatile
  confidence REAL NOT NULL,
  trend_strength REAL,
  volatility_percentile REAL,
  correlation_to_market REAL,
  model_name TEXT NOT NULL DEFAULT 'hmm_regime',
  model_version TEXT,
  computed_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_regime_labels_symbol_ts_tf ON regime_labels(symbol, timestamp, timeframe);
CREATE INDEX IF NOT EXISTS idx_regime_labels_symbol_ts ON regime_labels(symbol, timestamp);
CREATE INDEX IF NOT EXISTS idx_regime_labels_regime ON regime_labels(regime);
CREATE INDEX IF NOT EXISTS idx_regime_labels_market ON regime_labels(symbol, timestamp) WHERE symbol = '_MARKET';

-- ============================================
-- 4. Thesis State Tables
-- ============================================

CREATE TABLE IF NOT EXISTS thesis_state (
  thesis_id TEXT PRIMARY KEY,
  instrument_id TEXT NOT NULL,
  state TEXT NOT NULL,             -- WATCHING, STAGED, OPEN, SCALING, EXITING, CLOSED
  entry_price REAL,
  entry_date TEXT,
  current_stop REAL,
  current_target REAL,
  conviction REAL,
  entry_thesis TEXT,
  invalidation_conditions TEXT,
  add_count INTEGER NOT NULL DEFAULT 0,
  max_position_reached INTEGER NOT NULL DEFAULT 0,
  peak_unrealized_pnl REAL,
  close_reason TEXT,
  exit_price REAL,
  realized_pnl REAL,
  realized_pnl_pct REAL,
  environment TEXT NOT NULL,
  notes TEXT,
  last_updated TEXT NOT NULL DEFAULT (datetime('now')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  closed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_thesis_state_instrument ON thesis_state(instrument_id);
CREATE INDEX IF NOT EXISTS idx_thesis_state_state ON thesis_state(state);
CREATE INDEX IF NOT EXISTS idx_thesis_state_environment ON thesis_state(environment);
CREATE INDEX IF NOT EXISTS idx_thesis_state_created_at ON thesis_state(created_at);
CREATE INDEX IF NOT EXISTS idx_thesis_state_closed_at ON thesis_state(closed_at);
CREATE INDEX IF NOT EXISTS idx_thesis_state_active ON thesis_state(environment, state) WHERE state != 'CLOSED';
CREATE INDEX IF NOT EXISTS idx_thesis_state_instrument_active ON thesis_state(instrument_id, environment) WHERE state != 'CLOSED';

CREATE TABLE IF NOT EXISTS thesis_state_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  thesis_id TEXT NOT NULL,
  from_state TEXT NOT NULL,
  to_state TEXT NOT NULL,
  trigger_reason TEXT,
  cycle_id TEXT,
  price_at_transition REAL,
  conviction_at_transition REAL,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (thesis_id) REFERENCES thesis_state(thesis_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_thesis_history_thesis_id ON thesis_state_history(thesis_id);
CREATE INDEX IF NOT EXISTS idx_thesis_history_created_at ON thesis_state_history(created_at);
CREATE INDEX IF NOT EXISTS idx_thesis_history_thesis_created ON thesis_state_history(thesis_id, created_at);

-- ============================================
-- 5. Historical Universe Tables
-- ============================================

CREATE TABLE IF NOT EXISTS index_constituents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  index_id TEXT NOT NULL,          -- SP500, NDX100, DJIA
  symbol TEXT NOT NULL,
  date_added TEXT NOT NULL,
  date_removed TEXT,
  reason_added TEXT,
  reason_removed TEXT,
  sector TEXT,
  industry TEXT,
  market_cap_at_add REAL,
  provider TEXT NOT NULL DEFAULT 'fmp',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_index_constituents_pit ON index_constituents(index_id, date_added, date_removed);
CREATE INDEX IF NOT EXISTS idx_index_constituents_symbol ON index_constituents(symbol, index_id);
CREATE INDEX IF NOT EXISTS idx_index_constituents_current ON index_constituents(index_id, date_removed) WHERE date_removed IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_index_constituents_unique ON index_constituents(index_id, symbol, date_added);

CREATE TABLE IF NOT EXISTS ticker_changes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  old_symbol TEXT NOT NULL,
  new_symbol TEXT NOT NULL,
  change_date TEXT NOT NULL,
  change_type TEXT NOT NULL,       -- rename, merger, spinoff, delisted
  conversion_ratio REAL,
  reason TEXT,
  acquiring_company TEXT,
  provider TEXT NOT NULL DEFAULT 'fmp',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_ticker_changes_old ON ticker_changes(old_symbol, change_date);
CREATE INDEX IF NOT EXISTS idx_ticker_changes_new ON ticker_changes(new_symbol, change_date);
CREATE INDEX IF NOT EXISTS idx_ticker_changes_date ON ticker_changes(change_date);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ticker_changes_unique ON ticker_changes(old_symbol, new_symbol, change_date);

CREATE TABLE IF NOT EXISTS universe_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  snapshot_date TEXT NOT NULL,
  index_id TEXT NOT NULL,
  tickers TEXT NOT NULL,
  ticker_count INTEGER NOT NULL,
  source_version TEXT,
  computed_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_universe_snapshots_pit ON universe_snapshots(index_id, snapshot_date);
CREATE INDEX IF NOT EXISTS idx_universe_snapshots_date ON universe_snapshots(snapshot_date);

-- ============================================
-- 6. Prediction Markets Tables
-- ============================================

CREATE TABLE IF NOT EXISTS prediction_market_snapshots (
  id TEXT PRIMARY KEY,
  platform TEXT NOT NULL,          -- kalshi, polymarket
  market_ticker TEXT NOT NULL,
  market_type TEXT NOT NULL,       -- rate, election, economic
  market_question TEXT,
  snapshot_time TEXT NOT NULL,
  data JSON NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_pm_snapshots_platform ON prediction_market_snapshots(platform);
CREATE INDEX IF NOT EXISTS idx_pm_snapshots_ticker ON prediction_market_snapshots(market_ticker);
CREATE INDEX IF NOT EXISTS idx_pm_snapshots_type ON prediction_market_snapshots(market_type);
CREATE INDEX IF NOT EXISTS idx_pm_snapshots_time ON prediction_market_snapshots(snapshot_time);

CREATE TABLE IF NOT EXISTS prediction_market_signals (
  id TEXT PRIMARY KEY,
  signal_type TEXT NOT NULL,
  signal_value REAL NOT NULL,
  confidence REAL,
  computed_at TEXT NOT NULL,
  inputs JSON NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_pm_signals_type ON prediction_market_signals(signal_type);
CREATE INDEX IF NOT EXISTS idx_pm_signals_time ON prediction_market_signals(computed_at);

CREATE TABLE IF NOT EXISTS prediction_market_arbitrage (
  id TEXT PRIMARY KEY,
  kalshi_ticker TEXT NOT NULL,
  polymarket_token TEXT NOT NULL,
  kalshi_price REAL NOT NULL,
  polymarket_price REAL NOT NULL,
  divergence_pct REAL NOT NULL,
  market_type TEXT NOT NULL,
  detected_at TEXT NOT NULL,
  resolved_at TEXT,
  resolution_price REAL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_pm_arbitrage_divergence ON prediction_market_arbitrage(divergence_pct);
CREATE INDEX IF NOT EXISTS idx_pm_arbitrage_detected ON prediction_market_arbitrage(detected_at);
CREATE INDEX IF NOT EXISTS idx_pm_arbitrage_unresolved ON prediction_market_arbitrage(resolved_at) WHERE resolved_at IS NULL;

-- ============================================
-- 7. External Events Table
-- ============================================

CREATE TABLE IF NOT EXISTS external_events (
  id TEXT PRIMARY KEY,
  source_type TEXT NOT NULL,       -- news, earnings, sec_filing, fed
  event_type TEXT NOT NULL,
  event_time TEXT NOT NULL,
  processed_at TEXT NOT NULL,
  sentiment TEXT NOT NULL,         -- positive, negative, neutral
  confidence REAL NOT NULL,
  importance INTEGER NOT NULL,     -- 1-5
  summary TEXT NOT NULL,
  key_insights JSON NOT NULL,
  entities JSON NOT NULL,
  data_points JSON NOT NULL,
  sentiment_score REAL NOT NULL,
  importance_score REAL NOT NULL,
  surprise_score REAL NOT NULL,
  related_instruments JSON NOT NULL,
  original_content TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_external_events_event_time ON external_events(event_time);
CREATE INDEX IF NOT EXISTS idx_external_events_source_type ON external_events(source_type);
CREATE INDEX IF NOT EXISTS idx_external_events_event_type ON external_events(event_type);
CREATE INDEX IF NOT EXISTS idx_external_events_processed_at ON external_events(processed_at);
CREATE INDEX IF NOT EXISTS idx_external_events_sentiment ON external_events(sentiment);
CREATE INDEX IF NOT EXISTS idx_external_events_importance ON external_events(importance_score);

-- ============================================
-- 8. Indicator Synthesis Tables
-- ============================================

CREATE TABLE IF NOT EXISTS indicators (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL,          -- momentum, trend, volatility, volume, sentiment
  status TEXT NOT NULL DEFAULT 'staging',  -- staging, paper, production, retired
  hypothesis TEXT NOT NULL,
  economic_rationale TEXT NOT NULL,
  generated_at TEXT NOT NULL,
  generated_by TEXT NOT NULL,
  code_hash TEXT,
  ast_signature TEXT,
  validation_report TEXT,
  paper_trading_start TEXT,
  paper_trading_end TEXT,
  paper_trading_report TEXT,
  promoted_at TEXT,
  pr_url TEXT,
  merged_at TEXT,
  retired_at TEXT,
  retirement_reason TEXT,
  similar_to TEXT REFERENCES indicators(id),
  replaces TEXT REFERENCES indicators(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_indicators_status ON indicators(status);
CREATE INDEX IF NOT EXISTS idx_indicators_category ON indicators(category);
CREATE INDEX IF NOT EXISTS idx_indicators_code_hash ON indicators(code_hash);
CREATE INDEX IF NOT EXISTS idx_indicators_active ON indicators(status) WHERE status IN ('paper', 'production');

CREATE TABLE IF NOT EXISTS indicator_trials (
  id TEXT PRIMARY KEY,
  indicator_id TEXT NOT NULL REFERENCES indicators(id) ON DELETE CASCADE,
  trial_number INTEGER NOT NULL,
  hypothesis TEXT NOT NULL,
  parameters TEXT NOT NULL,
  sharpe_ratio REAL,
  information_coefficient REAL,
  max_drawdown REAL,
  calmar_ratio REAL,
  sortino_ratio REAL,
  selected INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(indicator_id, trial_number)
);

CREATE INDEX IF NOT EXISTS idx_trials_indicator ON indicator_trials(indicator_id);

CREATE TABLE IF NOT EXISTS indicator_ic_history (
  id TEXT PRIMARY KEY,
  indicator_id TEXT NOT NULL REFERENCES indicators(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  ic_value REAL NOT NULL,
  ic_std REAL NOT NULL,
  decisions_used_in INTEGER NOT NULL DEFAULT 0,
  decisions_correct INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(indicator_id, date)
);

CREATE INDEX IF NOT EXISTS idx_ic_history_indicator_date ON indicator_ic_history(indicator_id, date);

-- ============================================
-- 9. Factor Zoo Tables
-- ============================================

CREATE TABLE IF NOT EXISTS hypotheses (
  hypothesis_id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  economic_rationale TEXT NOT NULL,
  market_mechanism TEXT NOT NULL,
  target_regime TEXT,
  falsification_criteria TEXT,
  status TEXT NOT NULL DEFAULT 'proposed',  -- proposed, testing, validated, rejected
  iteration INTEGER NOT NULL DEFAULT 1,
  parent_hypothesis_id TEXT REFERENCES hypotheses(hypothesis_id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_hypotheses_status ON hypotheses(status);

CREATE TABLE IF NOT EXISTS factors (
  factor_id TEXT PRIMARY KEY,
  hypothesis_id TEXT REFERENCES hypotheses(hypothesis_id),
  name TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'research',  -- research, stage1, stage2, paper, active, decaying, retired
  version INTEGER NOT NULL DEFAULT 1,
  author TEXT NOT NULL DEFAULT 'claude-code',
  python_module TEXT,
  typescript_module TEXT,
  symbolic_length INTEGER,
  parameter_count INTEGER,
  feature_count INTEGER,
  originality_score REAL,
  hypothesis_alignment REAL,
  stage1_sharpe REAL,
  stage1_ic REAL,
  stage1_max_drawdown REAL,
  stage1_completed_at TEXT,
  stage2_pbo REAL,
  stage2_dsr_pvalue REAL,
  stage2_wfe REAL,
  stage2_completed_at TEXT,
  paper_validation_passed INTEGER DEFAULT 0,
  paper_start_date TEXT,
  paper_end_date TEXT,
  paper_realized_sharpe REAL,
  paper_realized_ic REAL,
  current_weight REAL DEFAULT 0.0,
  last_ic REAL,
  decay_rate REAL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  promoted_at TEXT,
  retired_at TEXT,
  last_updated TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_factors_status ON factors(status);
CREATE INDEX IF NOT EXISTS idx_factors_hypothesis ON factors(hypothesis_id);
CREATE INDEX IF NOT EXISTS idx_factors_active ON factors(status) WHERE status IN ('active', 'decaying');

CREATE TABLE IF NOT EXISTS factor_performance (
  id TEXT PRIMARY KEY,
  factor_id TEXT NOT NULL REFERENCES factors(factor_id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  ic REAL NOT NULL,
  icir REAL,
  sharpe REAL,
  weight REAL NOT NULL DEFAULT 0.0,
  signal_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(factor_id, date)
);

CREATE INDEX IF NOT EXISTS idx_factor_perf_factor_date ON factor_performance(factor_id, date);

CREATE TABLE IF NOT EXISTS factor_correlations (
  factor_id_1 TEXT NOT NULL REFERENCES factors(factor_id) ON DELETE CASCADE,
  factor_id_2 TEXT NOT NULL REFERENCES factors(factor_id) ON DELETE CASCADE,
  correlation REAL NOT NULL,
  computed_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY(factor_id_1, factor_id_2)
);

CREATE TABLE IF NOT EXISTS research_runs (
  run_id TEXT PRIMARY KEY,
  trigger_type TEXT NOT NULL,      -- scheduled, decay_detected, regime_change, manual, refinement
  trigger_reason TEXT NOT NULL,
  phase TEXT NOT NULL DEFAULT 'idea',  -- idea, implementation, stage1, stage2, translation, equivalence, paper, promotion, completed, failed
  current_iteration INTEGER NOT NULL DEFAULT 1,
  hypothesis_id TEXT REFERENCES hypotheses(hypothesis_id),
  factor_id TEXT REFERENCES factors(factor_id),
  pr_url TEXT,
  error_message TEXT,
  tokens_used INTEGER DEFAULT 0,
  compute_hours REAL DEFAULT 0.0,
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_research_runs_phase ON research_runs(phase);
CREATE INDEX IF NOT EXISTS idx_research_runs_trigger ON research_runs(trigger_type);
CREATE INDEX IF NOT EXISTS idx_research_runs_hypothesis ON research_runs(hypothesis_id);
CREATE INDEX IF NOT EXISTS idx_research_runs_factor ON research_runs(factor_id);

CREATE TABLE IF NOT EXISTS factor_weights (
  factor_id TEXT PRIMARY KEY REFERENCES factors(factor_id) ON DELETE CASCADE,
  weight REAL NOT NULL DEFAULT 0.0,
  last_ic REAL,
  last_updated TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS paper_signals (
  id TEXT PRIMARY KEY,
  factor_id TEXT NOT NULL REFERENCES factors(factor_id) ON DELETE CASCADE,
  signal_date TEXT NOT NULL,
  symbol TEXT NOT NULL,
  signal_value REAL NOT NULL,
  direction TEXT NOT NULL,         -- long, short
  entry_price REAL,
  exit_price REAL,
  actual_return REAL,
  predicted_return REAL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(factor_id, signal_date, symbol)
);

CREATE INDEX IF NOT EXISTS idx_paper_signals_factor ON paper_signals(factor_id);
CREATE INDEX IF NOT EXISTS idx_paper_signals_date ON paper_signals(signal_date);
CREATE INDEX IF NOT EXISTS idx_paper_signals_factor_date ON paper_signals(factor_id, signal_date);

-- ============================================
-- 10. Runtime Configuration Tables
-- ============================================

CREATE TABLE IF NOT EXISTS trading_config (
  id TEXT PRIMARY KEY,
  environment TEXT NOT NULL,       -- BACKTEST, PAPER, LIVE
  version INTEGER NOT NULL,

  -- Consensus settings
  max_consensus_iterations INTEGER DEFAULT 3,
  agent_timeout_ms INTEGER DEFAULT 30000,
  total_consensus_timeout_ms INTEGER DEFAULT 300000,

  -- Conviction thresholds
  conviction_delta_hold REAL DEFAULT 0.2,
  conviction_delta_action REAL DEFAULT 0.3,

  -- Position sizing
  high_conviction_pct REAL DEFAULT 0.7,
  medium_conviction_pct REAL DEFAULT 0.5,
  low_conviction_pct REAL DEFAULT 0.25,

  -- Risk/reward
  min_risk_reward_ratio REAL DEFAULT 1.5,
  kelly_fraction REAL DEFAULT 0.5,

  -- Schedule (milliseconds)
  trading_cycle_interval_ms INTEGER DEFAULT 3600000,
  prediction_markets_interval_ms INTEGER DEFAULT 900000,

  -- Workflow status
  status TEXT NOT NULL DEFAULT 'draft',  -- draft, testing, active, archived
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  promoted_from TEXT,

  FOREIGN KEY (promoted_from) REFERENCES trading_config(id)
);

CREATE INDEX IF NOT EXISTS idx_trading_config_environment ON trading_config(environment);
CREATE INDEX IF NOT EXISTS idx_trading_config_status ON trading_config(status);
CREATE INDEX IF NOT EXISTS idx_trading_config_env_status ON trading_config(environment, status);
CREATE INDEX IF NOT EXISTS idx_trading_config_created_at ON trading_config(created_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_trading_config_env_active ON trading_config(environment) WHERE status = 'active';

CREATE TABLE IF NOT EXISTS agent_configs (
  id TEXT PRIMARY KEY,
  environment TEXT NOT NULL,       -- BACKTEST, PAPER, LIVE
  agent_type TEXT NOT NULL,        -- technical, news, fundamentals, bullish, bearish, trader, risk, critic
  model TEXT NOT NULL,
  temperature REAL NOT NULL,
  max_tokens INTEGER NOT NULL,
  system_prompt_override TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_agent_configs_environment ON agent_configs(environment);
CREATE INDEX IF NOT EXISTS idx_agent_configs_agent_type ON agent_configs(agent_type);
CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_configs_env_agent ON agent_configs(environment, agent_type);

CREATE TABLE IF NOT EXISTS universe_configs (
  id TEXT PRIMARY KEY,
  environment TEXT NOT NULL,       -- BACKTEST, PAPER, LIVE
  source TEXT NOT NULL,            -- static, index, screener

  -- Static symbols (JSON array)
  static_symbols TEXT,

  -- Index source configuration
  index_source TEXT,               -- SP500, NDX100, DJIA

  -- Screener filters
  min_volume INTEGER,
  min_market_cap INTEGER,
  optionable_only INTEGER NOT NULL DEFAULT 0,

  -- Include/exclude lists (JSON arrays)
  include_list TEXT,
  exclude_list TEXT,

  -- Workflow status
  status TEXT NOT NULL DEFAULT 'draft',  -- draft, testing, active, archived
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_universe_configs_environment ON universe_configs(environment);
CREATE INDEX IF NOT EXISTS idx_universe_configs_status ON universe_configs(status);
CREATE INDEX IF NOT EXISTS idx_universe_configs_env_status ON universe_configs(environment, status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_universe_configs_env_active ON universe_configs(environment) WHERE status = 'active';

-- Constraints configuration
CREATE TABLE IF NOT EXISTS constraints_config (
  id TEXT PRIMARY KEY,
  environment TEXT NOT NULL,       -- BACKTEST, PAPER, LIVE

  -- Per-instrument limits
  max_shares INTEGER NOT NULL DEFAULT 1000,
  max_contracts INTEGER NOT NULL DEFAULT 10,
  max_notional REAL NOT NULL DEFAULT 50000,
  max_pct_equity REAL NOT NULL DEFAULT 0.1,

  -- Portfolio limits
  max_gross_exposure REAL NOT NULL DEFAULT 2.0,
  max_net_exposure REAL NOT NULL DEFAULT 1.0,
  max_concentration REAL NOT NULL DEFAULT 0.25,
  max_correlation REAL NOT NULL DEFAULT 0.7,
  max_drawdown REAL NOT NULL DEFAULT 0.15,

  -- Options greeks limits
  max_delta REAL NOT NULL DEFAULT 100,
  max_gamma REAL NOT NULL DEFAULT 50,
  max_vega REAL NOT NULL DEFAULT 1000,
  max_theta REAL NOT NULL DEFAULT 500,

  -- Workflow status
  status TEXT NOT NULL DEFAULT 'draft',  -- draft, testing, active, archived
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_constraints_config_environment ON constraints_config(environment);
CREATE INDEX IF NOT EXISTS idx_constraints_config_status ON constraints_config(status);
CREATE INDEX IF NOT EXISTS idx_constraints_config_env_status ON constraints_config(environment, status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_constraints_config_env_active ON constraints_config(environment) WHERE status = 'active';

-- ============================================
-- 11. Authentication Tables (better-auth)
-- ============================================
-- Timestamps use INTEGER (milliseconds since epoch) for better-auth compatibility.

CREATE TABLE IF NOT EXISTS user (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  email_verified INTEGER NOT NULL DEFAULT 0,
  image TEXT,
  two_factor_enabled INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)),
  updated_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
);

CREATE INDEX IF NOT EXISTS idx_user_email ON user(email);
CREATE INDEX IF NOT EXISTS idx_user_created_at ON user(created_at);

CREATE TABLE IF NOT EXISTS session (
  id TEXT PRIMARY KEY,
  expires_at INTEGER NOT NULL,
  token TEXT NOT NULL UNIQUE,
  ip_address TEXT,
  user_agent TEXT,
  user_id TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)),
  updated_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)),

  FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_session_user_id ON session(user_id);
CREATE INDEX IF NOT EXISTS idx_session_token ON session(token);
CREATE INDEX IF NOT EXISTS idx_session_expires_at ON session(expires_at);

CREATE TABLE IF NOT EXISTS account (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  access_token TEXT,
  refresh_token TEXT,
  id_token TEXT,
  access_token_expires_at INTEGER,
  refresh_token_expires_at INTEGER,
  scope TEXT,
  password TEXT,
  created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)),
  updated_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)),

  FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_account_user_id ON account(user_id);
CREATE INDEX IF NOT EXISTS idx_account_provider_id ON account(provider_id);
CREATE INDEX IF NOT EXISTS idx_account_provider_account ON account(provider_id, account_id);

CREATE TABLE IF NOT EXISTS verification (
  id TEXT PRIMARY KEY,
  identifier TEXT NOT NULL,
  value TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)),
  updated_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
);

CREATE INDEX IF NOT EXISTS idx_verification_identifier ON verification(identifier);
CREATE INDEX IF NOT EXISTS idx_verification_expires_at ON verification(expires_at);

CREATE TABLE IF NOT EXISTS two_factor (
  id TEXT PRIMARY KEY,
  secret TEXT NOT NULL,
  backup_codes TEXT NOT NULL,
  user_id TEXT NOT NULL,

  FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_two_factor_user_id ON two_factor(user_id);
CREATE INDEX IF NOT EXISTS idx_two_factor_secret ON two_factor(secret);

-- ============================================
-- 12. User Settings Tables
-- ============================================

CREATE TABLE IF NOT EXISTS alert_settings (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE,
  enable_push INTEGER NOT NULL DEFAULT 1,
  enable_email INTEGER NOT NULL DEFAULT 1,
  email_address TEXT,
  critical_only INTEGER NOT NULL DEFAULT 0,
  quiet_hours_start TEXT,
  quiet_hours_end TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),

  FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_alert_settings_user_id ON alert_settings(user_id);

CREATE TABLE IF NOT EXISTS user_preferences (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE,

  -- UI Theme
  theme TEXT NOT NULL DEFAULT 'system',  -- light, dark, system

  -- Chart settings
  chart_timeframe TEXT NOT NULL DEFAULT '1M',  -- 1D, 1W, 1M, 3M, 6M, 1Y, ALL

  -- Feed filters (JSON array of strings)
  feed_filters TEXT NOT NULL DEFAULT '[]',

  -- UI state
  sidebar_collapsed INTEGER NOT NULL DEFAULT 0,

  -- Notification settings (JSON object)
  notification_settings TEXT NOT NULL DEFAULT '{"emailAlerts":true,"pushNotifications":false,"tradeConfirmations":true,"dailySummary":true,"riskAlerts":true}',

  -- Portfolio view
  default_portfolio_view TEXT NOT NULL DEFAULT 'table',  -- table, cards

  -- Date/time formatting
  date_format TEXT NOT NULL DEFAULT 'MM/DD/YYYY',  -- MM/DD/YYYY, DD/MM/YYYY, YYYY-MM-DD
  time_format TEXT NOT NULL DEFAULT '12h',         -- 12h, 24h

  -- Currency
  currency TEXT NOT NULL DEFAULT 'USD',

  -- Timestamps
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_user_preferences_user_id ON user_preferences(user_id);
CREATE INDEX IF NOT EXISTS idx_user_preferences_created_at ON user_preferences(created_at);

-- ============================================
-- 13. Audit Log Table
-- ============================================

CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  timestamp TEXT NOT NULL DEFAULT (datetime('now')),
  user_id TEXT NOT NULL,
  user_email TEXT NOT NULL,
  action TEXT NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  environment TEXT NOT NULL DEFAULT 'LIVE',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_audit_log_user_id ON audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_timestamp ON audit_log(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log(action);
CREATE INDEX IF NOT EXISTS idx_audit_log_environment ON audit_log(environment);

-- ============================================
-- Record this migration
-- ============================================
INSERT INTO schema_migrations (version, name) VALUES (1, 'init');
