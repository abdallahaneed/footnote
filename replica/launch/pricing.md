# Pricing: Footnote

Date: 2026-11-08
Decision: free for version 1. No account, no trial, no tiers, no Stripe. Footnote runs on the user's own Mac (local speech-to-text, a local model through Ollama, SQLite), so a user costs nothing to serve. The matrix already records this (features.csv, "Billing and plans: skip, free tool").

## What the market charges

Read 2026-11-08 from third-party pricing pages (aggregators summarising the vendors' pages). The vendors' own pricing pages were not opened, so confirm before quoting any figure in public.

| product | free plan | paid | billed | source |
| --- | --- | --- | --- | --- |
| Granola (the original) | Basic: free, notes from the last 30 days only, Slack only | Business $14 per user per month; Enterprise from $35 per user per month (SSO) | Business monthly only per one source; annual only on Enterprise | https://www.granola.ai/blog/granola-pricing-teams-per-user-enterprise, https://www.activepieces.com/blog/granola-ai-pricing-2026-plans-costs-and-limits, https://costbench.com/software/ai-meeting-assistants/granola/free-plan/ |
| Otter.ai | Basic: 300 minutes a month | Pro $16.99 monthly or $8.33 annual per user; Business $30 monthly or $19.99 annual per user | monthly or annual | https://sonix.ai/resources/otter-ai-pricing/, https://www.castmagic.io/es/blog/otter-ai-pricing |
| Char (formerly Hyprnote), local-first | Free with your own speech and model keys, local storage | Pro $8 a month or $59 a year, with a price rise announced in March 2026 (new figure not found) | monthly or annual | https://toolradar.com/tools/hyprnote/pricing, https://hyprnote.com |

## What reviewers said about price and billing

From replica/feedback.md (253 reviews, mostly the iOS App Store; see fixes.md for the limits of that sample).
1. Price and paywalls: 14 reviews, 2 sources, average 3.6 stars. The top-scored theme in the sample.
2. Free plan history limit: 6 reviews, 2 sources. The 30-day window on the free plan.
3. Billing, cancelling and refunds: 3 reviews, 2 sources, average 1.5 stars. One example: no way to cancel the subscription on iPhone.
4. Export and copy losing formatting on the free plan: 3 reviews (fixes.md, hate item 6).

## Why free, and what that answers

1. No paywall, no history window: every note stays, as long as it is on your disk. Answers themes 1 and 2.
2. Nothing to cancel: no subscription, no renewal, no per-seat jump. Answers theme 3 by having no billing at all.
3. Export is free and keeps formatting: one Markdown file per note (Settings > Export all notes). Answers item 4.
4. Honest about the cost to the user instead: Footnote needs Ollama and a model download (a few GB) and uses the Mac's own processor. The landing page FAQ says so.

## If a paid tier comes later

Not built and not decided. Options to weigh then, in order of how well they fit a local app:
1. One-time licence for a later "Pro" set (named speakers, integrations), lifetime updates for the major version. No server needed.
2. Optional managed cloud model for people without a strong Mac (a server cost, so it would need a subscription; this is where Char is raising prices).
3. Team plan with self-hosted sync (milestone 3 in architecture.md).
Rules if any of these ship: cancel in one click in the app and on the web, an email 7 days before any renewal, no per-seat surprises, price in the listing matches the price at checkout. Stripe products would be created by Abdallah at that point; none are needed now.
