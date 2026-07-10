# AI Model Pricing Reference

> This file contains LLM pricing data used for cost estimation in feature delivery and assessment pipelines.
> Update manually when provider pricing changes.
>
> **Last updated:** 2026-07-10
> **Source:** https://platform.claude.com/docs/about-claude/pricing

---

## Cost estimation parameters

| Parameter | Value | Notes |
|-----------|-------|-------|
| Input token share | 80% | Assumed proportion of total tokens used as input |
| Output token share | 20% | Assumed proportion of total tokens used as output |

These two parameters drive the blended cost formula used by all pipeline agents:

```
blended_cost = tokens × (0.80 × input_price_per_token + 0.20 × output_price_per_token)
```

Adjust the percentages here if empirical data suggests a different ratio.

---

## Anthropic — Claude models

Prices are in **USD per million tokens ($/MTok)**.

### Standard API

| Model | Input ($/MTok) | Output ($/MTok) | Notes |
|-------|---------------|----------------|-------|
| Claude Fable 5 | $10.00 | $50.00 | |
| Claude Mythos 5 | $10.00 | $50.00 | |
| Claude Opus 4.8 | $5.00 | $25.00 | |
| Claude Opus 4.7 | $5.00 | $25.00 | |
| Claude Opus 4.6 | $5.00 | $25.00 | |
| Claude Opus 4.5 | $5.00 | $25.00 | |
| Claude Sonnet 5 | $2.00 | $10.00 | Promotional until 2026-08-31 |
| Claude Sonnet 5 | $3.00 | $15.00 | From 2026-09-01 |
| Claude Sonnet 4.6 | $3.00 | $15.00 | |
| Claude Sonnet 4.5 | $3.00 | $15.00 | |
| Claude Haiku 4.5 | $1.00 | $5.00 | |

### Prompt caching add-on ($/MTok on top of input price)

| Cache type | Write surcharge |
|------------|----------------|
| 5-minute cache write | +25% of input price |
| 1-hour cache write | +100% of input price |
| Cache read (hit) | −80% of input price |

### Batch API

50% discount on both input and output prices for all models.

### Tool use

| Tool | Cost |
|------|------|
| Web search | $10.00 / 1,000 searches |
| Code execution | Free (first 1,550 hours/month), then $0.05/hour |

---

## Blended unit cost reference

Pre-computed blended cost per 1,000 tokens using the 80/20 split above.
Use these values for quick estimates without recalculating.

| Model | Input ($/MTok) | Output ($/MTok) | Blended ($/1k tokens) |
|-------|---------------|----------------|-----------------------|
| Claude Fable 5 | $10.00 | $50.00 | $0.018000 |
| Claude Opus 4.8 | $5.00 | $25.00 | $0.009000 |
| Claude Sonnet 5 (promo) | $2.00 | $10.00 | $0.003600 |
| Claude Sonnet 5 | $3.00 | $15.00 | $0.005400 |
| Claude Sonnet 4.5/4.6 | $3.00 | $15.00 | $0.005400 |
| Claude Haiku 4.5 | $1.00 | $5.00 | $0.001800 |

> Formula: `blended = (input × 0.80 + output × 0.20) / 1,000`

---

## Adding other providers

To add pricing for another provider (OpenAI, Google, Azure, etc.), append a new section following the same structure:

```markdown
## {Provider name} — {Model family}

| Model | Input ($/MTok) | Output ($/MTok) | Notes |
|-------|---------------|----------------|-------|
| ...   | ...            | ...             | ...   |
```

Update the **Blended unit cost reference** table accordingly.
