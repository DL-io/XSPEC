# ALPHA_AUDIT.md — XSPEC Signal Pipeline Audit

**Date**: 2026-06-09  
**Auditor**: XSPEC FINAL UPGRADE MANDATE — Phase 1  
**Purpose**: Map every source of prediction, quantify real vs. dead contribution, identify weaknesses.

---

## Executive Summary

XSPEC runs a 9-model ensemble. Of those 9 models, **4 are currently dead** — they output the market midpoint unchanged because their input signals are hardcoded to zero or echo the market price. The calibration feedback loop is completely broken: Brier scores are computed and stored but never read back into the pipeline. All model confidence weights are static regardless of track record.

**Effective prediction stack:** ~30% LLM reasoning, ~15% market microstructure, ~55% market midpoint echo.

---

## Signal Pipeline Map

### Stage 1: Scanner (`packages/scanner/src/index.ts`)

**Purpose:** Market selection filter — hard gates and soft warnings.

| Gate | Type | Threshold | Signal Used |
|------|------|-----------|-------------|
| spread_too_wide | Hard reject | spreadBps > 500 | `market.spreadBps` |
| illiquid | Hard reject | totalLiquidity < $500 | `market.totalLiquidity` |
| data_stale | Hard reject | dataFreshnessMs > 30min | `market.dataFreshnessMs` |
| resolution_too_close | Hard reject | < 30 minutes | `resolutionDate` |
| resolution_too_far | Hard reject | > 180 days | `resolutionDate` |
| no_bids | Hard reject | best bid absent | `market.bestBid` |
| no_asks | Hard reject | best ask absent | `market.bestAsk` |
| bid_ask_crossed | Hard reject | bid >= ask | spread < 0 |
| resolution_ambiguity | Hard reject | ambiguityScore >= 0.7 | keyword matching |
| depth_insufficient (1%) | Hard reject | depth within 1% < 10 | `bidDepth1Pct + askDepth1Pct` |
| depth_insufficient (5%) | Hard reject | depth within 5% < 50 | `bidDepth5Pct + askDepth5Pct` |
| spread_regime_warn | Soft warn | spreadBps > 200 | `market.spreadBps` |
| low_volume_warn | Soft warn | volume24h < $1,000 | `market.volume24h` |
| resolution_ambiguity_warn | Soft warn | ambiguityScore >= 0.3 | keyword matching |

**Output:** `NormalizedMarket` with scanner signals, or rejection with reason.  
**Weakness:** No learned rejection — gates are fixed thresholds with no adaptive calibration.

---

### Stage 2: Feature Computation (`packages/features/src/index.ts`)

**Function:** `computeFeatureSnapshot(market, window)`  
**Source line:** `packages/features/src/index.ts:4`

| Feature | Calculation | Status |
|---------|-------------|--------|
| `volatility` | `min(1, market.spread * 10)` | ✓ Live |
| `momentum` | `market.lastTradePrice - market.midpoint` | ✓ Live |
| `spreadRegime` | `spread > 0.02 → wide, > 0.01 → normal, else tight` | ✓ Live |
| `orderFlowImbalance` | `(bidDepth1Pct - askDepth1Pct) / (bidDepth1Pct + askDepth1Pct)` | ✓ Live |
| `volumeBurstScore` | `volume24h / (volume7d / 7)` | ✓ Live |
| `sentimentVelocity` | **HARDCODED 0** | ✗ Dead |
| `crossMarketCorrelationScore` | **HARDCODED 0** | ✗ Dead |
| `catalystProximity` | `max(0, 1 - daysToResolution / 7)` | ✓ Live |
| `macroRegimeLabel` | **HARDCODED 'unclassified'** | ✗ Dead |

**Dead Signal Impact:**
- `sentimentVelocity = 0` → `sentiment` model output = `midpoint + 0 * 0.05 = midpoint` (zero edge)
- `crossMarketCorrelationScore = 0` → `relative_value` model output = `midpoint + 0 * 0.03 = midpoint` (zero edge)

---

### Stage 3: Research (`packages/research/src/index.ts`)

**Function:** `buildDossier(market, stages)` — runs 8 sequential stages.

| Stage | What It Does | Status | Weakness |
|-------|-------------|--------|---------|
| `resolution_parser` | Extracts resolution criteria, computes ambiguity score | ✓ Live | Keyword-only, no NLP |
| `web_research` | Fetches facts via Tavily | ✓ Live (requires API key) | Degrades to empty if key missing |
| `base_rate_calculator` | Returns `market.midpoint` | ✗ Weak | Not a real base rate — just echoes price |
| `sentiment_analyzer` | Returns `{ sentimentSignal: 0 }` | ✗ Dead | Always zero, never computed |
| `microstructure_analyzer` | Returns `bidDepth1Pct - askDepth1Pct` | ✓ Live | Raw depth diff, no normalization |
| `catalyst_forecaster` | Returns market tags + fact key drivers | ✓ Live | No scoring, just extraction |
| `memory_matcher` | Returns `{ marketMemoryMatches: [] }` | ✗ Dead | Never queries `marketMemory` table |
| `deep_reasoner` | LLM reasoning via Anthropic/OpenAI | ✓ Live (requires API key) | Prompt quality determines output |

**Dead Stage Impact:**
- `base_rate_calculator = midpoint` → `base_rate` model output = midpoint (zero edge vs market)
- `sentiment_analyzer = 0` → sentiment signal to models is always 0
- `memory_matcher = []` → `historical_analog` model falls back to `baseRate || midpoint`

---

### Stage 4: Model Estimation (`packages/models/src/index.ts`)

**Function:** `generateModelEstimates({ market, dossier, featureSnapshot })`  
**Source line:** `packages/models/src/index.ts:15`

| Model | Formula | Confidence Weight | Real Input Signal? | Net Edge Contribution |
|-------|---------|------------------|--------------------|-----------------------|
| `base_rate` | `dossier.baseRate \|\| market.midpoint` | **0.75 static** | ✗ (baseRate = midpoint) | ~0 |
| `llm_research` | `dossier.probabilityEstimate` | `dossier.confidence` | ✓ (LLM) | Real — LLM reasoning |
| `sentiment` | `midpoint + dossier.sentimentSignal * 0.05` | **0.70 static** | ✗ (sentimentSignal = 0) | ~0 |
| `microstructure` | `midpoint + orderFlowImbalance * 0.04 - spread * 0.25` | **0.75 static** | ✓ (real features) | Small real signal |
| `historical_analog` | `memoryMatches[0].outcome ?? baseRate ?? midpoint` | **0.70 static** | ✗ (memoryMatches = []) | ~0 |
| `deep_reasoner` | `(probLow + probHigh + probEstimate) / 3` | `dossier.evidenceStrength` | ✓ (LLM) | Real — LLM range |
| `relative_value` | `midpoint + crossMarket * 0.03` | **0.70 static** | ✗ (crossMarket = 0) | ~0 |
| `basket_tilt` | `midpoint + momentum * 0.2` | **0.70 static** | ✓ (real momentum) | Small real signal |
| `quant_model` | `midpoint + volumeBurst * 0.005 - volatility * 0.02` | **0.70 static** | ✓ (real features) | Small real signal |

**Critical Finding:** 4 of 9 models produce `midpoint` exactly. The ensemble is:
- 44% weighted towards market midpoint echo (base_rate, sentiment, historical_analog, relative_value)
- 30% LLM reasoning (llm_research + deep_reasoner)
- 26% microstructure signals (microstructure, basket_tilt, quant_model)

---

### Stage 5: Ensemble (`packages/models/src/index.ts:40`)

**Function:** `buildEnsemble(estimates, calibrationAdjustment = 0)`

| Parameter | Current Value | Status |
|-----------|--------------|--------|
| Outlier threshold | 0.20 (hardcoded) | Static |
| CV threshold (`disagreementScore`) | 0.15 (hardcoded) | Static |
| `calibrationAdjustment` | **0 (always)** | ✗ Dead |
| Model weights | Static per model (0.7–0.75) | ✗ No learning |

**Ensemble Process:**
1. Compute median of successful estimates
2. Flag outliers (>0.20 from median) with 0.25x weight penalty
3. Weighted average by `confidenceWeight * freshnessScore * outlierPenalty`
4. Recommend trade if `ensembleUncertainty / ensembleProbability <= 0.15`

**Critical Finding:** `calibrationAdjustment` is passed as 0 from the scanner pipeline (`workers/scanner-worker/src/pipeline.ts:38`). The `calibrationRecords` table stores resolved predictions but this data never flows back into the ensemble.

---

### Stage 6: Portfolio / Edge (`packages/portfolio/src/index.ts`)

**Edge Calculation:**
- YES side: `edge = ensembleProbability - market.bestAsk`
- NO side: `edge = (1 - ensembleProbability) - (1 - market.bestBid)`

**Kelly Sizing:**
- `kellyFraction = edge / (1 - limitPrice)` capped by mandate fractionalKelly factor
- ultra_conservative: 0.05x Kelly, conservative: 0.10x, balanced: 0.15x, aggressive: 0.25x

**Opportunity Score:**
```
0.40 * penalizedEdge
0.25 * ensembleConfidence  
0.15 * liquidityScore
0.10 * (1 / daysToResolution)   ← time pressure factor
0.10 * (1 - uncertainty)
```

**Weakness:** Opportunity score weights are static. No optimization against historical P&L.

---

### Stage 7: Risk (`packages/risk/src/index.ts`)

16 gates evaluated in fixed order. Key thresholds by mandate:

| Gate | ultra_conservative | conservative | balanced | aggressive |
|------|-------------------|-------------|---------|------------|
| min_edge | 10% | 6% | 4% | 2% |
| min_confidence | 80% | 70% | 60% | 55% |
| max_position_pct | 2% | 5% | 10% | 20% |
| max_category_exposure | 15% | 25% | 35% | 50% |
| max_single_market_exposure | 5% | 10% | 15% | 25% |
| max_uncertainty | 10% | 15% | 20% | 25% |

**Weakness:** Thresholds are hardcoded constants. No dynamic adjustment based on recent win rate or drawdown regime.

---

### Stage 8: Calibration (`workers/calibration-worker/src/index.ts`)

**What it does:** For each resolved `decisionAudit` with `calibrationBackfill` data, computes:
- Brier score: `(predictedProbability - outcome)²`
- Directional accuracy: predicted direction vs actual outcome
- Sharpness: `max(0, 2 * |predictedProbability - 0.5| - 0.5)` — reward for confident correct predictions

**Stores to:** `calibrationRecords` table.

**Critical Finding:** This data is never read back into the pipeline. The `calibrationAdjustment` parameter in `buildEnsemble()` is always 0. The Brier scores exist in the database but have zero impact on future predictions. The feedback loop is broken.

---

## Summary of Dead/Broken Components

| Component | File | Line | Issue | Impact |
|-----------|------|------|-------|--------|
| `sentimentVelocity` | `packages/features/src/index.ts` | 13 | Hardcoded 0 | `sentiment` model = midpoint |
| `crossMarketCorrelationScore` | `packages/features/src/index.ts` | 14 | Hardcoded 0 | `relative_value` model = midpoint |
| `macroRegimeLabel` | `packages/features/src/index.ts` | 17 | Hardcoded 'unclassified' | No regime-aware weighting |
| `base_rate_calculator` | `packages/research/src/index.ts` | 76 | Returns midpoint | `base_rate` model = midpoint |
| `sentiment_analyzer` | `packages/research/src/index.ts` | 74 | Returns 0 | No sentiment signal |
| `memory_matcher` | `packages/research/src/index.ts` | 82 | Returns [] | `historical_analog` = midpoint |
| `calibrationAdjustment` | `workers/scanner-worker/src/pipeline.ts` | 38 | Always 0 | Calibration loop broken |
| Model confidence weights | `packages/models/src/index.ts` | 18–27 | Static (0.7/0.75) | No performance-based learning |

---

## Estimated True Prediction Sources

Without the dead components, XSPEC's effective predictions come from:

1. **LLM Dossier** (llm_research + deep_reasoner): ~60% of real signal  
   - Requires: OPENAI_API_KEY or ANTHROPIC_API_KEY + TAVILY_API_KEY  
   - Quality: Entirely dependent on LLM prompt and Tavily search results  

2. **Microstructure** (microstructure + quant_model): ~25% of real signal  
   - Requires: Valid orderbook depth data from venue  
   - Quality: Good for short-horizon price discovery, weak on long-horizon events  

3. **Momentum** (basket_tilt): ~15% of real signal  
   - Requires: `lastTradePrice != midpoint` (often not distinguishable)  
   - Quality: Noisy in prediction markets where prices don't trend cleanly  

---

## Fixes Required (Phase 2)

1. **`sentimentVelocity`**: Implement as `orderFlowImbalance * max(0, volumeBurstScore - 1)` — directional order flow pressure amplified by above-average volume.

2. **`crossMarketCorrelationScore`**: Implement as `tanh(momentum * 10) * (spreadRegime === 'tight' ? 1.0 : spreadRegime === 'normal' ? 0.5 : 0.15)` — momentum signal attenuated by spread quality, proxy for systematic co-movement.

3. **`macroRegimeLabel`**: Implement regime detection from available features (volatility, momentum, volumeBurstScore, catalystProximity, spreadRegime).

4. **`sentiment_analyzer`**: Compute keyword sentiment from Tavily fact claims using positive/negative word lists.

5. **`base_rate_calculator`**: Adjust midpoint by resolution ambiguity and time pressure to produce a real base rate prior.

6. **`memory_matcher`**: Pre-fetch market memory from DB at pipeline level and inject into research stages.

7. **Bayesian model weight updating**: Query `probabilityEstimates` + `calibrationRecords` per model, compute rolling Brier scores, generate dynamic confidence weights.

8. **Calibration adjustment**: After ensemble, compute a Platt-scaling calibration correction from stored calibration records and apply to final ensemble probability.
