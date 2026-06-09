import {
    loadDefinitions,
    addDefinition,
    getDefinition,
    naturalLanguageToParams,
    validateDefinition,
} from './definitions'
import { scanUniverse } from './scanner'
import { runBacktest } from './backtest'
import type { PatternDefinition } from './types'

export const PATTERN_TOOLS = [
    {
        name: 'define_pattern',
        description: 'Define a new chart pattern using natural language. The system will convert your description into exact numeric parameters. You must provide specific numbers — vague terms like "a long time" or "narrow range" must be replaced with exact values (e.g., "10-20 days", "max range 3%"). The system will ask clarifying questions if parameters are ambiguous.',
        input_schema: {
            type: 'object',
            properties: {
                description: {
                    type: 'string',
                    description: 'Natural language description of the pattern with exact numeric thresholds. Example: "consolidation breakout: price trapped within 3% range for 10-20 days, volume drops to 50% then surges 150% on a 2% breakout, daily interval". Vague terms will be rejected.',
                },
            },
            required: ['description'],
        },
    },
    {
        name: 'scan_pattern',
        description: 'Scan the entire provided universe of symbols for a specific pattern. The scanner does NOT cherry-pick — it scans every symbol and reports the exact selection rate (e.g., "40 matches out of 1000 = 4%"). This prevents survivor bias / 勝利K線陷阱.',
        input_schema: {
            type: 'object',
            properties: {
                patternId: {
                    type: 'string',
                    description: 'The ID of the pattern to scan for.',
                },
                universe: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Array of ticker symbols to scan (e.g., S&P 500 constituents, watchlist). Every symbol will be scanned.',
                },
                range: {
                    type: 'string',
                    description: 'Yahoo Finance range (1y, 2y, 6mo). Defaults to 1y for daily, 2y for weekly.',
                },
            },
            required: ['patternId', 'universe'],
        },
    },
    {
        name: 'run_backtest',
        description: 'Run an honest backtest of a pattern against the provided universe. Calculates forward returns at 1d, 5d, and 20d horizons with full statistics (win rate, average/median return, Sharpe ratio, max drawdown, p-value, confidence interval). If the pattern is not statistically significant (p > 0.05), it will explicitly state this. Losing trades are always listed — nothing is hidden.',
        input_schema: {
            type: 'object',
            properties: {
                patternId: {
                    type: 'string',
                    description: 'The ID of the pattern to backtest.',
                },
                universe: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Array of ticker symbols to include in the backtest.',
                },
                startDate: {
                    type: 'string',
                    description: 'Start date (YYYY-MM-DD) for the backtest range. Defaults to 1 year ago.',
                },
                endDate: {
                    type: 'string',
                    description: 'End date (YYYY-MM-DD) for the backtest range. Defaults to today.',
                },
                stopLoss: {
                    type: 'number',
                    description: 'Optional stop-loss percentage (e.g., 5 means 5% stop loss).',
                },
            },
            required: ['patternId', 'universe'],
        },
    },
    {
        name: 'optimize_params',
        description: 'Suggest parameter adjustments for a pattern definition based on backtest results. This tool analyzes which parameters could be tightened or relaxed to improve statistical significance. It does NOT guarantee profitability — it only suggests parameter ranges that showed better statistical properties.',
        input_schema: {
            type: 'object',
            properties: {
                patternId: {
                    type: 'string',
                    description: 'The ID of the pattern to optimize.',
                },
                universe: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Array of ticker symbols to use for optimization testing.',
                },
            },
            required: ['patternId', 'universe'],
        },
    },
]

export const PATTERN_SYSTEM_PROMPT = `You are a skeptical quantitative analyst who specializes in pattern recognition and statistical verification. Your role is to help users define, scan, and backtest chart patterns with mathematical rigor.

## Core Principles

1. **No visual guesswork.** If a human says "it looks like a flag," you ask: "What is the max retracement % and the minimum pole height %?" Every pattern must be expressed as a mathematical predicate.

2. **No survivor bias.** You always scan the entire provided universe. You prominently display the selection base rate (e.g., "40 matches out of 1,000 scanned = 4%"). You never filter results after the fact. This is the anti-勝利K線 principle.

3. **Correlation ≠ causation.** You always include the disclaimer: "Past upward moves after this pattern do not prove the pattern caused the move (correlation ≠ causation)."

4. **Exact numeric thresholds only.** You treat 5% and 7% as different numbers. You never use vague buckets like "similar" or "approximately." You always display exact numeric thresholds.

5. **Interval-locked.** Every analysis is locked to a declared timeframe (daily/weekly). You warn: "Switching timeframes will alter numeric results."

6. **Honest outcomes allowed.** The default outcome of any backtest is allowed to be: "This pattern does not work." You state this plainly when the data supports it. If p > 0.05, you say "not statistically significant."

7. **No directional trading advice.** When asked for a "winning pattern," you refuse to give advice without full backtest context. You ask for exact numeric thresholds and the universe to scan first.

8. **Losing trades are shown.** You never hide losing trades. The backtest report prominently includes them.

## Your Process

- When the user describes a pattern vaguely (e.g., "consolidated for a long time"), use define_pattern to extract precise numeric parameters. Ask clarifying questions: "Define min_days and max_days."
- When the user wants to see if a pattern "works," scan the full universe with scan_pattern, then run_backtest. Present the results honestly.
- When the user asks for optimization, use optimize_params to suggest parameter ranges, but always remind them that past performance does not guarantee future results.

Be concise and data-driven. Use exact numbers, not adjectives.`
