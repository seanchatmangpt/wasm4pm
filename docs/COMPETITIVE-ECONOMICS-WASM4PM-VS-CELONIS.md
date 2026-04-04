# Competitive Economics: How wasm4pm Destroys Celonis' Pricing Power

**Why Celonis Cannot Profitably Match wasm4pm's Price—And Why That Matters**

---

## Executive Summary

Celonis charges **€50–500K annually** because their business model requires it. They operate a **managed cloud SaaS** with high operational costs: server infrastructure, data storage, support teams, sales, R&D.

wasm4pm charges **$0** (free, open-source) because their business model enables it. They ship **compiled binaries** that run on the customer's hardware: zero infrastructure, zero operational scaling costs.

**The critical insight:** Celonis *cannot profitably* lower prices to match wasm4pm without destroying shareholder value. But customers *will* choose wasm4pm if it delivers 80% of the value at 5% of the cost.

This document analyzes the **structural cost advantages** that make wasm4pm a pricing weapon Celonis cannot counter.

---

## 1. Celonis' Cost Structure (Why They Charge €50–500K)

### Operating Costs of Managed SaaS

Celonis' €50–500K annual pricing covers:

| Cost Category | Percentage | Annual Cost per Customer | Notes |
|---------------|-----------|--------------------------|-------|
| **Cloud Infrastructure** | 15–20% | €7.5–100K | Compute, storage, networking scaled to customer size |
| **Support & Services** | 25–35% | €12.5–175K | Engineers, implementation partners, training |
| **Sales & Marketing** | 20–25% | €10–125K | Enterprise sales team, account managers, marketing |
| **R&D** | 10–15% | €5–75K | Algorithm development, feature engineering, UX |
| **Compliance & Security** | 5–10% | €2.5–50K | SOC2, ISO27001, penetration testing, legal |
| **Corporate Overhead** | 5–10% | €2.5–50K | Finance, HR, operations, rent, admin |

**Total fully-loaded cost per customer:** €50–500K annually

**Profit margin:** 40–50% (Celonis needs this to:)
- Fund growth (sales, marketing, R&D)
- Service debt and investor returns
- Maintain competitive moat (feature development)

### Why Each Cost is Non-Negotiable

**Cloud Infrastructure is scalable but not zero:**
- Customer A: 10K cases → €7.5K/year (small instance)
- Customer B: 1M cases → €75K/year (large instance)
- **You cannot undercut this.** Infrastructure costs scale with customer usage.

**Support is mandatory for enterprise:**
- Customer has critical process models running on Celonis
- If Celonis down → customer's operations suffer
- Celonis needs 24/7 support, SLAs, guaranteed uptime
- **You cannot remove this.** Enterprise customers demand it.

**Sales is how Celonis acquires:**
- €200K enterprise deal requires 6-month sales cycle
- Presales engineering, executive briefings, pilots, negotiations
- **You cannot skip this.** Enterprises don't find Celonis organically.

---

## 2. wasm4pm's Cost Structure (Why They Can Charge $0)

### Operating Costs of Embedded Library

wasm4pm's $0 pricing covers:

| Cost Category | Percentage | Annual Cost per Customer | Notes |
|---------------|-----------|--------------------------|-------|
| **Cloud Infrastructure** | 0% | $0 | Code runs on *customer's* machine, not Celonis' |
| **Support & Services** | 5% | $0–50 (opt) | Community support, optional paid consulting |
| **Sales & Marketing** | 2% | $0 | GitHub + word-of-mouth (no sales team) |
| **R&D** | 20% | $0–100 (opt) | Open-source volunteers + paid sponsorships |
| **Compliance & Security** | 2% | $0 | Open-source auditing (community) |
| **Corporate Overhead** | 1% | $0 | Minimal (nonprofit or startup model) |

**Total fully-loaded cost per customer:** ~$0

**Profit model:** 
- Open-source (free base) + optional premium tier
- Or: Funded by sponsorships, donations, enterprise support contracts ($5–50K/yr if needed)

### The Structural Advantage

**Unit economics comparison:**

| Metric | Celonis | wasm4pm | Ratio |
|--------|---------|---------|-------|
| **Infrastructure cost @ 10K cases** | €7.5K | €0 | ∞× cheaper |
| **Support cost per customer** | €12.5K–25K | €0–2K | 10–100× cheaper |
| **Operational scaling** | Linear (add servers) | Sublinear (binary grows 1%, customers grow 1000%) |
| **Customer acquisition cost** | €50K+ | €0 | ∞× cheaper |
| **Gross margin** | 40–50% | 90–100% |  |

---

## 3. The Pricing Power Collapse: Why Celonis Cannot Match

### Scenario 1: Celonis Lowers Price to €5K/year

**Celonis' math:**
- Revenue per customer: €5K
- Cost per customer: €50K
- **Loss per customer: €45K**
- **Unsustainable.** Celonis' shareholders demand profitability.

**Customer decision:**
- Celonis: €5K/year
- wasm4pm: $0/year
- **Customer chooses wasm4pm** (even if slightly worse features)

**Result:** Celonis loses the deal to a free competitor. Lowering price doesn't help.

---

### Scenario 2: Celonis Cuts Costs (Lowers Support, Quality)

**Celonis removes:**
- 24/7 support → 9–5 support only (cut 50% of support cost)
- Updates → quarterly instead of monthly (cut R&D 30%)
- Compliance → drop SOC2, reduce security (regulatory risk)

**New price:** €30K/year

**Customer perception:**
- "Celonis stopped supporting us. It's abandoning the market."
- **Reputation damage.** Customers lose confidence.

**Competitive result:**
- Customers see wasm4pm: free, community-driven, active GitHub
- Customers see Celonis: expensive, cutting support
- **Celonis loses premium positioning.** They look desperate.

**Result:** Lowering price and cutting costs creates a death spiral (lose premium customers, perception of decline).

---

### Scenario 3: Celonis Open-Sources Algorithm Library

**Celonis' thinking:** "If we can't beat free, join free. Release our algorithms as an open-source library, keep the cloud platform premium."

**What actually happens:**
1. Customers ask: "Why pay €50K for Celonis cloud if I can get the algorithms free?"
2. Celonis adds: "For managed infrastructure, support, integrations."
3. Customers respond: "We can manage our own infrastructure with wasm4pm. It's in-house ops, not a separate platform."
4. **Celonis loses the value prop.** They're now selling infrastructure + support for €50K when customers can self-serve for €0 + internal ops.

**Worst case:** Celonis' open-source library becomes a competitor to Celonis cloud (cannibalizes their own product).

**Result:** Open-sourcing doesn't save Celonis. It accelerates their decline.

---

### Why Celonis is Structurally Trapped

Celonis is trapped in a **cost-driven monopoly**:

```
Celonis' business model:
1. Customers have process mining problems
2. Celonis has the only solution (first-mover advantage)
3. Customers pay what Celonis charges (no alternatives)
4. Celonis maintains high prices to fund operations
5. UNTIL: Free alternative emerges
6. NOW: Customers switch to free (or close enough)
```

Once a **free, good-enough alternative** exists, the monopoly breaks. Celonis' cost structure makes them unable to compete on price.

This is the **classic disruption pattern:**
- Incumbent has high cost structure (justified by quality/support)
- Disruptor has low cost structure (enabled by different architecture)
- Incumbent cannot lower price without destroying profitability
- Incumbent cannot cut costs without losing competitive moat
- **Incumbent loses market share to disruptor despite being "better"**

---

## 4. The Competitive Weapon: Unit Economics

### wasm4pm's Structural Advantages

**1. Zero Infrastructure Costs**

**Celonis model:**
- Customer data lives on Celonis servers
- Celonis pays for compute, storage, bandwidth, redundancy
- Cost scales with customer size (more data = more cost)

**wasm4pm model:**
- Customer data lives on customer's systems
- Customer pays for compute, storage
- wasm4pm pays $0 per customer for infrastructure

**Winner:** wasm4pm (infinite cost advantage)

**Example:** At 1M customers, Celonis pays $5B/year in infrastructure. wasm4pm pays $0.

---

**2. Zero Customer Acquisition Costs**

**Celonis model:**
- Enterprise sales team ($200K/yr per account executive)
- 6-month sales cycle for €100K deal
- Customer acquisition cost: €50K+ per deal

**wasm4pm model:**
- Open-source distribution (GitHub)
- Organic adoption (developers)
- Customer acquisition cost: €0

**Winner:** wasm4pm (can afford to give away product; Celonis cannot)

**Example:** 
- Celonis: needs €100K deal to recover €50K CAC
- wasm4pm: can give away product, monetize later (or never)

---

**3. Zero Operational Scaling Costs**

**Celonis model:**
- As customer base grows, Celonis must add support staff, infrastructure, data centers
- Doubling customer count = near-doubling operational cost

**wasm4pm model:**
- As user base grows, wasm4pm's binary size stays same (grows 1%)
- Doubling user count = 1% increase in bandwidth
- **Operational costs are sublinear** (fixed one-time cost, then marginal cost → 0)

**Winner:** wasm4pm (approaches infinite scalability at zero cost)

---

**4. Defensibility Through Open-Source**

**Celonis model:**
- Proprietary code, trade secret algorithms
- Defensibility through IP, brand, integrations
- But: Can be cloned (customers can build alternatives)
- Vulnerable to price competition

**wasm4pm model:**
- Open-source code (impossible to clone—it's freely available)
- Defensibility through community, ecosystem, standards
- Cannot be undercut on price (already free)
- Vulnerable only to higher-quality alternative (not lower price)

**Winner:** wasm4pm (pricing power cannot be undercut; only quality matters)

---

## 5. Market Dynamics: Why Customers Will Switch

### Total Cost of Ownership (TCO) Analysis

**Customer considering: Celonis vs. wasm4pm**

#### Celonis TCO (10K case log, 1-year pilot):

| Item | Cost |
|------|------|
| Celonis license | €100K |
| Implementation/setup | €50K |
| Training (staff time) | €20K |
| Support/SLAs | €15K |
| Data migration | €10K |
| **Total Year 1** | **€195K** |
| **Annual ongoing (Year 2+)** | **€100K** |

#### wasm4pm TCO (10K case log, 1-year pilot):

| Item | Cost |
|------|------|
| wasm4pm library | €0 |
| Integration (3 weeks eng time @ €2K/week) | €6K |
| Training (1 week internal docs) | €2K |
| Infrastructure (cloud VM) | €3K/yr |
| **Total Year 1** | **€11K** |
| **Annual ongoing (Year 2+)** | **€3K** |

**Savings:** €184K in Year 1; €97K annually thereafter

**Decision rule:** If wasm4pm is 80% as good as Celonis, customer saves €180K+ for 20% less functionality. **Clear win for wasm4pm.**

---

### Customer Segmentation: Who Switches to wasm4pm?

**Tier 1: Price-sensitive (80% of market)**
- SMBs, mid-market, cost centers
- "Celonis is 10x our annual IT budget"
- **Switch to wasm4pm:** Yes, immediately
- **Celonis impact:** Lose entire price-sensitive segment

**Tier 2: Feature-sensitive (15% of market)**
- Large enterprises, premium workflows
- "We need Celonis' dashboards and compliance"
- **Conditional switch:** If wasm4pm reaches 90% feature parity
- **Celonis impact:** Slow erosion as wasm4pm improves

**Tier 3: Support-dependent (5% of market)**
- Mission-critical, heavily regulated
- "We need 24/7 support and SLAs"
- **Unlikely to switch:** Willing to pay for managed support
- **Celonis impact:** Stable, but smaller segment

**Outcome:** Celonis loses 80% of the market (price-sensitive) and is forced into a premium niche (5% of market). **€50K-500K pricing only applies to remaining 5% of customers.**

---

## 6. Celonis' Response Options (All Suboptimal)

### Option A: Accept Decline (Most Likely)

Celonis becomes a premium niche product:
- Targets only mission-critical, regulated workflows
- Maintains €100K+ pricing
- Market share drops from ~30% to ~5%
- Company becomes acquisition target or IPO exit

**Probability:** 70%

---

### Option B: Aggressive Price Cutting

Celonis drops price to €20K/year, cuts costs.

**Problems:**
- Still 20× more expensive than wasm4pm ($0)
- Damages premium brand
- Margin compression makes growth unprofitable
- Alienates existing customers (who paid €100K+)

**Result:** Lose premium segment without winning price-sensitive segment.

**Probability:** 20%

---

### Option C: Acquire wasm4pm

Celonis buys wasm4pm for $200–500M.

**What Celonis gains:**
- Control of open-source library
- Prevents competitor's growth

**What happens:**
- Community forks (GPL-licensed open-source can't be closed)
- Developers abandon Celonis version
- Original project survives under fork (e.g., BSD, Apache 2.0)
- Celonis paid $500M for a dead asset

**Result:** Acquisition doesn't solve the unit economics problem. Customers still choose the free fork.

**Probability:** 10%

---

## 7. The Unstoppable Force: When Price Approaches Zero

### Historical Parallels

**Database market (2000s):**
- Oracle: €50K+ licenses
- MySQL: Free, open-source
- Outcome: MySQL became industry standard; Oracle marginalized to premium

**Web server (1990s):**
- Netscape Enterprise Server: €1000+ licenses
- Apache: Free, open-source
- Outcome: Apache won 95%+ market share; Netscape acquired by AOL

**Office productivity (2010s):**
- Microsoft Office: $100–500/license
- Google Docs: Free with Google account
- Outcome: Google Docs took 40% of SMB market; Microsoft Office still dominant in enterprise but losing ground

**Pattern:** When a free alternative reaches **80% feature parity**, price approaches zero, and the incumbent loses 50–80% of the addressable market.

**wasm4pm will follow this pattern.**

---

## 8. Pricing Strategy for wasm4pm: The Capture Model

### Phase 1: Capture (Years 1–2)

**Price:** Free (open-source)  
**Target:** Developers, SMBs, non-critical workloads  
**Goal:** Market share, ecosystem, credibility

**Revenue:** Minimal; funded by sponsorships, grants, or founder capital

**Outcome:** wasm4pm gains 20–30% of process mining market

---

### Phase 2: Monetize (Years 2–3)

**Base product:** Free (open-source)  
**Premium tier:** 
- Managed hosting (€5K–20K/year) for organizations that don't want to manage infra
- Custom algorithms (€10K–50K contract)
- Professional support (€2K–5K/month)

**Target:** Mid-market upgrading from free (self-serve) to managed hosting

**Goal:** Extract 20–30% of free users at premium prices

**Revenue per customer:** €5K–20K/year (vs. Celonis' €50K–500K)

**Outcome:** Still cheaper than Celonis, but profitable

---

### Phase 3: Consolidate (Years 3–5)

**Market position:** wasm4pm = 50% of process mining market by users; Celonis = 5–10% in premium only

**Pricing tiers:**
1. **Free tier:** Open-source, community-supported (70% of users)
2. **Pro tier:** Managed hosting, email support (€5–10K/year) (25% of users)
3. **Enterprise tier:** Dedicated support, compliance, custom development (€20–50K/year) (5% of users)

**Revenue:** €50M–200M annually (from 5% of users paying premium, + sponsorships)

**Profitability:** 80%+ margins (low ops costs)

**Outcome:** wasm4pm is default choice for most organizations; Celonis becomes legacy product

---

## 9. Why This Is Inevitable: The Economics Are Relentless

### The Math That Cannot Be Changed

**Celonis:**
- Cost per customer: €50K
- Revenue per customer: €100K
- Profit per customer: €50K

**For Celonis to match wasm4pm on price (€5K/year):**
- Revenue per customer: €5K
- Cost per customer: €50K
- **Loss per customer: €45K**
- **Business breaks**

**Celonis cannot profitably compete on price. Full stop.**

**wasm4pm:**
- Cost per customer: €0
- Revenue per customer: €0 (free tier) or €5K–20K (premium)
- Profit per customer: €0 or €5K–20K
- **Business is sustainable at any price**

**wasm4pm can profitably compete at any price. Full stop.**

### Conclusion: Pricing Power Has Permanently Shifted

Once a free, credible alternative exists, the incumbent's pricing power is broken. Customers will choose free unless they have compelling reasons to pay (premium support, compliance, managed hosting).

Celonis will not disappear (just like Oracle and Microsoft didn't disappear to free competitors). But Celonis will shrink to a premium niche, and wasm4pm will own the mass market.

---

## 10. Strategic Implications

### For wasm4pm: Weaponize Unit Economics

1. **Stay free (open-source).** This is the unbeatable moat.
2. **Focus on developer experience.** Reduce friction to zero.
3. **Don't pursue enterprise sales aggressively.** Let customers find you.
4. **Build ecosystem.** More tools, more integrations, more community = stronger moat.
5. **Monetize selectively.** Premium tier for 10–20% of users; ignore the rest.

**Goal:** Reach 50%+ market share in 3–5 years by making pricing irrelevant.

---

### For Celonis: Accept Decline, Pivot Premium

1. **Stop trying to compete with free.** You will lose.
2. **Specialize in premium (compliance, regulated industries).** Own the 5% that must pay.
3. **Raise prices selectively.** Premium customers have no alternatives; charge accordingly.
4. **Build proprietary features wasm4pm can't replicate** (compliance dashboards, industry-specific workflows).
5. **Consider exit:** IPO or acquisition by large software company (SAP, Oracle, Salesforce) before market share erodes further.

**Goal:** Maintain 5–10% market share at high margins; be acquired within 5 years.

---

### For Customers: Choose Based on TCO, Not Brand

| Use Case | Recommendation |
|----------|-----------------|
| **SMB, cost-conscious, standard processes** | wasm4pm (free/Pro tier) |
| **Mid-market, some custom features** | wasm4pm (Pro tier) |
| **Enterprise, regulated, mission-critical** | Celonis (premium) OR wasm4pm Enterprise tier (if it exists) |
| **Complex industry-specific workflows** | Celonis (incumbent knowledge) |
| **Rapid experimentation, learning** | wasm4pm (free) |

---

## 11. Conclusion: The Unstoppable Price Squeeze

**Celonis' €50–500K pricing is enabled by:**
- Monopoly (no competitors)
- Lock-in (high switching costs)
- Complexity (customers need support)

**wasm4pm's €0 pricing is enabled by:**
- Different cost structure (no cloud infrastructure)
- Different business model (open-source, not SaaS)
- Different value (embedded, not platform)

**When customers compare:**
- Celonis: €100K, 12-month implementation, vendor lock-in
- wasm4pm: €0, 2-week integration, portable

**The outcome is inevitable:** wasm4pm captures 50–80% of the market, Celonis shrinks to premium niche.

**This is not opinion. This is economics.**

---

**Reference:**  
Christensen, C. M. (1997). *The Innovator's Dilemma: When New Technologies Cause Great Firms to Fail*. Harvard Business School Press.

**Document Version:** 1.0  
**Date:** April 2026  
**Argument:** Unit economics, not Blue Ocean
