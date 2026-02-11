# CPA Tax Compliance Review — TARGON LLC

**Prepared by:** CPA Review Agent
**Date:** February 8, 2026
**Period Under Review:** January 1, 2025 – February 8, 2026
**Basis:** Accrual (GAAP)
**Source:** QuickBooks Online (Realm ID: 9341455433341322)

---

## Executive Summary

TARGON LLC is an early-stage e-commerce LLC selling physical products on Amazon (US and UK marketplaces). The company reported a **net loss of -$43,376.50** on revenue of $54,918.27 for the period, with **$156,117.06 in owner capital contributions** funding operations and inventory buildup ($61,795.22). This review identifies **several critical and high-priority tax compliance issues** requiring immediate attention, including payroll tax deposit concerns, 1099 filing obligations, potential FBAR requirements, and UK VAT registration questions.

---

## 1. Entity Structure Analysis

### Filing Status
TARGON LLC appears to be a **single-member LLC (SMLLC)** based on the equity structure (single "Owner investments" / "Owner draws" accounts, no partner capital accounts). As a disregarded entity, it files on **Schedule C of Form 1040** (or Schedule E if passive), not a separate entity return.

### Capital Analysis
| Item | Amount |
|------|--------|
| Owner Investments (Capital Contributions) | $156,117.06 |
| Owner Draws | -$22,591.86 |
| Retained Earnings (Prior Periods) | -$35,002.12 |
| Net Income (Current Period) | -$8,374.38* |
| **Total Equity** | **$90,148.70** |

*Note: The balance sheet shows current period net income of -$8,374.38 while the P&L shows -$43,376.50. This discrepancy suggests the P&L period (Jan 2025–Feb 2026) spans two fiscal years, while the balance sheet net income reflects only the current fiscal year (Jan 2026–Feb 8, 2026). The retained earnings of -$35,002.12 would represent the 2025 fiscal year loss.*

### Owner Investment Concentration — **Medium Risk**
The owner has invested **$156K** and drawn only **$22.5K**, a net capital injection of **$133.5K**. This is a very heavy personal investment relative to the revenue generated ($54.9K). Combined with cumulative losses of approximately -$43.4K, this raises questions about the business's viability and potential hobby loss challenges (see Section 2).

### Entity Structure Optimization — **Medium Priority**
Given the substantial losses, the current SMLLC/Schedule C structure is **appropriate for now** — losses flow through to offset the owner's other income. An S-Corp election would not be beneficial while the business is unprofitable, as it would add compliance costs (corporate return, reasonable compensation requirements) with no self-employment tax savings. **Revisit when the business becomes profitable** (see Section 9).

---

## 2. Income Tax Compliance

### Net Operating Loss (NOL) — **High Priority**

**Net Loss: -$43,376.50** (Jan 2025 – Feb 8, 2026, approximately spanning fiscal years 2025 and early 2026)

- Under current tax law (post-TCJA), NOLs can be carried **forward indefinitely** but can only offset **80% of taxable income** in future years (no carryback for most taxpayers).
- If this is a Schedule C loss, it **reduces AGI** and can offset other income (W-2 wages, investment income, etc.) in the same tax year, subject to excess business loss limitations under IRC §461(l).
- **Excess Business Loss Limitation (2025):** For single filers, business losses exceeding **$305,000** (2025 threshold, indexed for inflation) are not deductible in the current year and become NOL carryforwards. The $43K loss is well within this threshold, so it should be **fully deductible** against other income.

### Hobby Loss Rule (IRC §183) — **Critical Risk**

This is the **most significant tax risk** for TARGON LLC.

**Red Flags:**
1. **Consecutive years of losses** — Retained earnings of -$35K suggest losses in prior year(s) too, plus the current -$43K loss.
2. **Negative gross margin** — COGS ($61,368) exceeds revenue ($54,918). The business loses money *before* any operating expenses. This is a very strong indicator the IRS could challenge profit motive.
3. **Heavy owner capital infusions** — $156K invested against $55K revenue suggests a startup funding losses, but the IRS may question if there is a reasonable expectation of profit.

**Safe Harbor:** IRC §183(d) presumes a profit motive if the activity is profitable in **3 of the last 5 years**. If TARGON cannot demonstrate this, the burden shifts to the taxpayer to prove profit motive.

**Mitigating Factors:**
- The business has a legitimate commercial structure (inventory, suppliers, Amazon marketplace)
- Significant inventory investment ($61.8K) shows commercial intent
- The negative margin may reflect a startup/market entry phase with heavy advertising spend ($22.4K advertising in COGS)
- Professional bookkeeping (LinkMyBooks, QuickBooks) demonstrates business-like conduct

**Recommendation:**
- **Document a written business plan** showing the path to profitability
- **Reduce advertising spend** or demonstrate that it is generating improving unit economics over time
- **Track profitability by product/SKU** to show strategic decision-making
- **Target profitability within 3 years of inception** to meet the safe harbor

### Active vs. Passive Classification — **Low Risk**
The owner appears to **materially participate** in the business (managing Amazon listings, inventory, contractor relationships, etc.). This is **active income**, which means:
- Losses can offset active/earned income (not limited by passive activity rules under IRC §469)
- Self-employment tax applies to net profits (not applicable while in a loss position)

### Quarterly Estimated Tax Payments — **High Priority**

**IRS Payment Found:** $922.13 paid 2025-11-04, categorized as "Payroll expenses"

**Issue:** This $922.13 IRS payment is described as "Federal payroll taxes for 09/03/2025 payroll" and is categorized correctly as payroll tax deposits, **not** estimated income tax payments.

**Concern:** There appear to be **no estimated income tax payments** (Form 1040-ES) recorded. While the business has a net loss (reducing or eliminating estimated tax obligations), if the owner has other income sources generating a tax liability, estimated payments may still be required. The equity section has "Federal estimated taxes" and "State estimated taxes" accounts — both show $0 balance.

**Recommendation:** Confirm whether the owner has other income sources. If so, ensure quarterly estimated payments are being made to avoid underpayment penalties under IRC §6654.

---

## 3. Payroll Tax Review — **Critical**

### Payroll Summary
| Component | Amount |
|-----------|--------|
| Wages (QBO Payroll) | $16,000.00 |
| Payroll Taxes (employer/employee) | $1,466.00 |
| Other Payroll Expenses | $4,429.74 |
| **Total Payroll Expenses** | **$21,895.74** |

### Breakdown of "Other Payroll" — $4,429.74
| Payment | Vendor | Amount | Date |
|---------|--------|--------|------|
| Net wages (outside QBO payroll) | Nezha El Albani | $3,229.21 | 2025-09-03 |
| Federal payroll tax deposit | IRS | $922.13 | 2025-11-04 |
| VA state withholding | VA Dept of Taxation | $176.90 | 2025-11-05 |
| VA SUI | VA Employment Commission | $101.50 | 2025-11-06 |
| **Total** | | **$4,429.74** | |

### Critical Issues

#### A. Nezha El Albani Payment ($3,229.21) — **Critical**

This payment is coded to "Payroll expenses" with description "Basic Online Payroll Payment." However, the comprehensive summary also lists Nezha El Albani ($3,229.21) under contract labor requiring 1099 review.

**Key Questions:**
- Was Nezha El Albani processed through QBO Payroll as a W-2 employee, or paid as a contractor?
- If paid as a W-2 employee, the gross wages should be higher than $16,000 (should include Nezha's gross pay plus the other $16K).
- If paid as a contractor and miscoded to "Payroll expenses," this needs reclassification to "Contract labor" and a **1099-NEC must be issued**.

**Immediate Action Required:** Clarify Nezha El Albani's worker status. If they are a contractor, reclassify the expense and issue 1099-NEC.

#### B. FUTA (Form 940) — $0 Balance — **Critical**

Federal Unemployment (940) shows **$0.00 balance**.

If TARGON has W-2 employees earning $16,000 in wages, **FUTA is required**.
- FUTA rate: 6.0% on first $7,000 of wages per employee
- With the 5.4% state credit (assuming VA SUI is current): effective rate of 0.6%
- Estimated FUTA liability: **$42.00** per employee (0.6% × $7,000)

**If wages are $16,000 and at least one employee earned over $7,000, FUTA is owed.**

**Recommendation:** File Form 940 for 2025 immediately if not already filed. Deposit FUTA tax owed. The annual FUTA deposit is due by January 31 of the following year.

#### C. VA Income Tax Withholding — $0 Balance — **High Priority**

VA Income Tax liability shows **$0.00**.

If an employee is a Virginia resident earning $16,000, state income tax withholding is likely required (unless the employee claimed exempt on VA-4).

**Issue:** The $176.90 payment to VA Dept of Taxation on 2025-11-05 shows VA state withholding WAS paid for the 09/03/2025 payroll. But the liability balance is $0, suggesting it was properly deposited.

**Verify:** Are all subsequent payroll runs also having VA tax withheld and deposited? The liability accounts show Federal Taxes (941/943/944) at -$910.33 (indicating $910.33 was moved to the QBO Tax Holding Account but not yet deposited or was overpaid).

#### D. Payroll Tax Deposit Timeliness — **Critical**

The payroll appears to have been run on **September 3, 2025**, but federal payroll taxes were not deposited until **November 4, 2025** — a **62-day delay**.

Under IRS deposit rules:
- **Monthly depositors** must deposit employment taxes by the **15th of the following month** (i.e., by October 15, 2025 for September wages)
- **Semi-weekly depositors** have even tighter deadlines

The November deposit is **late** regardless of deposit schedule. This explains the **$100 Penalties & Interest** charge from the VA Employment Commission (paid 2025-11-06).

**The $100 penalty was from VA for late SUI deposit, not the IRS.** The IRS may also assess penalties for late federal deposits under IRC §6656:
- 2% penalty for deposits 1-5 days late
- 5% for 6-15 days late
- 10% for 16+ days late
- 15% for deposits not made within 10 days of an IRS notice

**Recommendation:**
1. Determine if the IRS has assessed (or will assess) penalties for the late federal deposit
2. Set up **automatic payroll tax deposits** through QBO Payroll
3. Ensure all future payroll tax deposits are made on time

#### E. QBO Tax Holding Account — $910.33 — **High Priority**

The QBO Tax Holding Account shows **$910.33**, which matches the Federal Taxes (941/943/944) liability of **-$910.33** (negative = credit in liability, meaning owed/held). This suggests federal payroll taxes have been accrued but may be sitting in a holding account pending deposit.

**Action:** Verify these funds have been or will be deposited with the IRS on time.

#### F. Owner on Payroll? — **Medium Priority**

The $16,000 in wages raises the question: **Is the owner (Jarrar Amjad) on payroll as an employee?**

As a single-member LLC taxed as a sole proprietorship:
- The owner **cannot be a W-2 employee** of their own SMLLC
- Owner compensation should be handled through **draws**, not wages
- If the owner is taking wages, this is an improper arrangement that could result in payroll tax complications

If the $16,000 is paid to a **non-owner employee**, this is proper. Clarify who is receiving the W-2 wages.

---

## 4. Sales Tax Compliance

### US Sales Tax (Amazon Marketplace Facilitator) — **Low Risk**

The Amazon Sales Tax (LMB) account nets to **$0.00**, which is correct. Amazon, as a **marketplace facilitator**, collects and remits sales tax on behalf of sellers in all states with marketplace facilitator laws (which now includes all states with sales tax).

The journal entries confirm this — each settlement shows matching debits and credits for sales tax:
- LMB-US-16-30JAN-26-1: Credit $880.98 / Debit $880.98 (sales tax collected/remitted by Amazon)
- LMB-US-02-16JAN-26-1: Credit $302.17 / Debit $302.17

**This is properly handled.** No action needed for US sales tax as long as 100% of US sales are through Amazon.

### UK VAT — **High Priority**

**UK VAT Control: -$108.38** (per comprehensive summary) / **$80.16** (per account balance)

*Note: The discrepancy between -$108.38 and $80.16 may reflect exchange rate adjustments or timing differences.*

**Key Issues:**
1. **Is TARGON registered for UK VAT?** Selling in the UK through Amazon typically requires VAT registration if:
   - Inventory is stored in the UK (FBA UK warehouse)
   - Sales to UK consumers exceed the domestic threshold

2. **Amazon UK marketplace:** The journal entries show "Marketplace VAT Responsible" on UK sales, indicating **Amazon is collecting and remitting UK VAT** as the marketplace operator under the UK's 2021 e-commerce VAT rules for overseas sellers.

3. **However**, if TARGON has UK-stored inventory, a UK VAT registration may still be required for:
   - Import VAT recovery on goods shipped to UK
   - B2B sales where Amazon doesn't collect VAT
   - MTD (Making Tax Digital) compliance

4. The LinkMyBooks notes reference "Making Tax Digital Daily Summaries," suggesting **TARGON may already be VAT-registered** or using MTD-compatible accounting.

**Recommendation:**
- Confirm TARGON's UK VAT registration status
- If VAT-registered, confirm quarterly VAT returns are being filed
- The $80-108 UK VAT balance needs to be either refunded (if input VAT exceeds output VAT) or paid
- Engage a UK tax advisor for ongoing VAT compliance

### State Nexus — **Low Risk**
Since Amazon handles fulfillment (FBA) and is the marketplace facilitator for sales tax, TARGON's nexus exposure for sales tax purposes is minimal. Amazon's marketplace facilitator obligations cover the sales tax collection duty. No additional state sales tax registrations appear necessary at this time.

---

## 5. 1099 Compliance — **Critical**

### 1099-NEC Filing Requirements (Payments ≥ $600 to US persons/entities)

| Vendor | Amount | Category | 1099 Required? |
|--------|--------|----------|----------------|
| Nezha El Albani | $3,229.21 | Payroll expenses (see note) | **Depends on worker classification** |
| Mr Muhammad Hassan | $1,420.00 | Legal fees | **Yes, if US person** |
| Umair Afzal | $536.00 | Contract labor | No (under $600) |
| Muhammad Hamad | $477.04 | Contract labor | No (under $600) |
| Zeeshan Azam | $357.33 | Contract labor | No (under $600) |
| Muhammad Mehdi | $350.00 | Contract labor | No (under $600) |
| Hammad Nayyer | $214.29 | Contract labor | No (under $600) |

### 1099-MISC Filing Requirements

| Vendor | Amount | Category | 1099 Required? |
|--------|--------|----------|----------------|
| AMS Business Accountants | $741.21 | Accounting fees | **Possible** — see note |
| Legal fees (various) | $4,160.90 | Legal fees | **Yes, if paid to individuals/partnerships** |
| KSU Real Estate | $5,985.72 | Rent | **Yes** (1099-MISC Box 1, rent ≥ $600) |

### Critical Notes:

1. **Nezha El Albani ($3,229.21):** If this person was paid through QBO Payroll as a W-2 employee, a W-2 is issued instead of 1099. If paid as a contractor, a **1099-NEC is required** (exceeds $600 threshold).

2. **Mr Muhammad Hassan ($1,420.00):** Listed under "Legal fees" — if this is an individual (not a corporation), a **1099-NEC is required**. If paid via credit card or PayPal, the payment processor issues the 1099-K instead.

3. **KSU Real Estate ($5,985.72):** Rent payments exceeding $600 require **1099-MISC** (Box 1 — Rents). This is frequently missed by small businesses. Exception: if KSU Real Estate is a corporation (C-corp or S-corp), no 1099 is required for rent.

4. **AMS Business Accountants ($741.21):** If this is a UK-based entity (the "Ltd" suffix suggests it is), **no 1099 is required** for foreign vendors. However, if AMS has a US presence, a 1099-MISC or 1099-NEC may be required.

5. **Foreign Contractors:** Several contractors (Umair Afzal, Muhammad Hamad, Zeeshan Azam, Muhammad Mehdi, Hammad Nayyer) appear to be foreign individuals based on payment patterns (paid via Wise). If these are **non-US persons**, no 1099 is required, but:
   - **Form W-8BEN** should be collected from each foreign contractor
   - Tax withholding obligations under IRC §1441 may apply (30% withholding on US-source income to non-resident aliens unless a treaty reduces the rate)
   - If the services are performed **outside the US**, the income is generally not US-source and no withholding is required

### W-9 / W-8BEN Collection — **Critical**

**Action Required:**
- Collect **W-9** from all US vendors paid ≥ $600 (Mr Muhammad Hassan if US-based, KSU Real Estate)
- Collect **W-8BEN** from all foreign contractors
- File 1099-NEC and 1099-MISC by **January 31** of the following year (the 2025 forms were due **January 31, 2026** — these may already be late)

### 1099 Filing Deadline — **Critical if Missed**

If 2025 1099s have not been filed:
- **Penalty:** $60 per form if filed within 30 days of due date; $130 per form if filed by August 1; $330 per form if filed after August 1 or not at all
- **Intentional disregard:** $660 per form with no maximum

**Immediate Action:** File all required 1099s as soon as possible.

---

## 6. Deduction Analysis

### Currently Claimed Deductions

| Category | Amount | Notes |
|----------|--------|-------|
| Building & property rent | $4,017.63 | Office/warehouse space |
| Contract labor | $1,934.66 | 5 contractors (2026 only) |
| General business expenses | $1,090.11 | Bank fees, memberships, education |
| Insurance (business) | $424.00 | Shelter Insurance — reasonable |
| Legal & accounting | $4,902.11 | Legal $4,161 + Accounting $741 |
| Meals (clients) | $38.18 | See note below |
| Office expenses | $2,389.47 | Supplies, software, shipping |
| Payroll expenses | $21,895.74 | Wages + taxes + other payroll |
| Penalties & Interest | $100.00 | **NOT deductible** (see note) |
| Utilities (Phone) | $169.96 | Phone service |

### Issues and Opportunities

#### A. Penalties & Interest ($100.00) — **Reclassify**
The $100 penalty paid to VA Employment Commission is a **government penalty** and is **NOT deductible** under IRC §162(f) (post-TCJA). This should be reclassified as a non-deductible expense. It reduces net income on the P&L but must be **added back** on the tax return.

#### B. Meals Deduction ($38.18) — **Low Impact**
- For tax year 2025, business meals are deductible at **50%** (the 100% restaurant meals deduction expired after 2022)
- Deductible amount: $38.18 × 50% = **$19.09**
- Ensure documentation includes: date, amount, business purpose, attendees, and business relationship
- Impact is minimal at this amount

#### C. Software & Apps ($1,280.67) — **Properly Deductible**
Software subscriptions include Claude.AI ($496.28), OpenAI ChatGPT ($400), Amazon Web Services ($256.48), and others. These are **currently deductible as ordinary business expenses** — no Section 179 election needed since they are subscriptions, not purchased software. This is correct.

#### D. Home Office Deduction — **Potential Missed Deduction**
The rent of $4,017.63 to KSU Real Estate and the $687 security deposit suggest a **dedicated commercial office/warehouse space**. However, if the owner also uses a portion of their home for business:
- **Simplified method:** $5/sq ft, up to 300 sq ft = max $1,500 deduction
- **Actual expense method:** Proportionate share of mortgage/rent, utilities, insurance, etc.
- **No indication of a home office deduction being claimed.** If applicable, this could provide additional deduction.

#### E. Vehicle/Mileage — **Potential Missed Deduction**
No vehicle or mileage expenses are recorded. If the owner drives to:
- The warehouse/office
- Post office, UPS, FedEx for shipments
- Meetings with suppliers or contractors
- Bank

The **standard mileage rate (2025: $0.70/mile)** could provide a meaningful deduction. Begin tracking mileage immediately.

#### F. Inventory Costing Method — **Medium Priority**
The balance sheet shows $61,795.22 in inventory:
- Manufacturing (US-PDS): $47,783.43
- Freight (US-PDS): $8,130.00
- Mfg Accessories (US-PDS): $5,881.79

**Observations:**
- Including freight in inventory cost basis is correct (freight-in is part of inventory cost under GAAP/tax rules)
- No COGS has been recorded for inventory sold — the entire $61.8K sits on the balance sheet. Revenue of $55K has been generated but COGS only includes Amazon fees and warehouse costs, **not the cost of the goods themselves**.
- This strongly suggests the inventory was purchased but has **not yet been fully sold**, or the cost of goods manufactured/purchased has not been properly expensed as units are sold.
- **If inventory is being sold but COGS isn't recording the product cost, the loss is being understated.** Conversely, if all $61.8K is still on hand, the business has significant unsold inventory.

**Recommendation:**
- Confirm the inventory costing method (FIFO, LIFO, or weighted average) — must be consistent and disclosed on Schedule C
- Ensure inventory costs are properly relieved to COGS as units are sold
- File **Form 970** if electing LIFO for the first time

#### G. Advertising in COGS ($22,414.12) — **Classification Question**
Amazon advertising costs ($22.4K) are classified as COGS. While this is a common approach for Amazon sellers (as PPC is directly tied to sales), the IRS may argue this should be an **operating expense**, not COGS. Either classification is defensible, but be consistent.

#### H. Best Buy Purchases ($645.60) — **Potential Capital Assets**
Multiple Best Buy purchases totaling $645.60 are coded to "Office expenses." If any of these are **computers, monitors, or equipment with a useful life >1 year**, they should be capitalized and either:
- Expensed under **Section 179** (immediate deduction)
- Depreciated under **MACRS**

At $645 total, Section 179 expensing achieves the same tax result, but proper classification matters for accurate books.

---

## 7. International Tax Issues — **High Priority**

### UK Marketplace Sales

**UK Revenue (converted to USD):**
- UK-PDS (Pan-European/Domestic): $39,443.49
- UK-CDS (Cross-Dock/Commingled): $131.08
- **Total UK Sales: $39,574.57** (72% of total revenue)

The majority of TARGON's revenue comes from the UK marketplace. This has several implications:

#### A. Foreign Income Reporting
All UK sales income is properly reported on Schedule C as US-source income (for an Amazon seller, the income is sourced to where the seller's tax home is, not where the customer is).

#### B. GBP-Denominated Accounts
- **Targon UK Wise GBP (0036):** $2,559.76 (in USD equivalent)
- **Accounts Payable (GBP):** $650.32

These are properly tracked in the books with exchange rate conversions through LinkMyBooks (exchange rates noted on JEs: 1.3693, 1.3383, 1.3467, 1.344754).

#### C. Currency Gains/Losses — **Low Risk Currently**
**Unrealized Currency Gains: $0.01** — effectively zero. However, as GBP balances grow, currency fluctuations will create taxable gains/losses. These should be tracked under **IRC §988** (ordinary income/loss for foreign currency transactions).

#### D. FBAR / FinCEN 114 — **Critical**

**The Wise GBP account (0036) is a foreign financial account.**

**FBAR Filing Requirement:** If the **aggregate value of all foreign financial accounts** exceeds **$10,000 at any point during the calendar year**, the owner must file FinCEN Form 114 (FBAR) by **April 15** (with automatic extension to October 15).

**Current Balance:** $2,559.76. The current balance is below $10,000, but:
- The threshold is based on the **highest aggregate balance** during the year, not the year-end balance
- Amazon UK settlement deposits may have temporarily pushed the balance above $10,000
- Wise may hold multiple currency balances that aggregate

**FATCA (Form 8938):** If the owner's foreign financial assets exceed **$50,000 at year-end** (or $75,000 at any time during the year) for domestic single filers, Form 8938 must be filed with the tax return. The current balance is well below this threshold.

**Recommendation:**
- Review the **maximum balance** of the Wise GBP account during 2025
- If the aggregate of all foreign accounts ever exceeded $10,000, file the FBAR
- **FBAR penalties for non-filing are severe:** $10,000 per account per year for non-willful violations; up to the greater of $100,000 or 50% of account balance for willful violations

---

## 8. Penalties & Interest

### Recorded Penalty: $100.00

**Source:** Payment to VA Employment Commission on 2025-11-06
**Breakdown:** $101.50 VA SUI tax + $100.00 penalty = $201.50 total payment

**Cause:** Late filing or late payment of Virginia State Unemployment Insurance (SUI) tax. The payroll was run on September 3, 2025, but the SUI payment wasn't made until November 6, 2025 — over 60 days later.

### Estimated Tax Penalty Risk — **Medium**

If the owner has other income sources and is not making quarterly estimated payments, they may face:
- **IRC §6654 penalty** for underpayment of estimated tax
- Current penalty rate is tied to the federal short-term rate + 3%

The business losses may offset other income and reduce or eliminate estimated tax obligations, but this should be verified.

### Payroll Tax Penalty Risk — **High**

As discussed in Section 3, the 62-day delay in depositing federal payroll taxes may result in IRS penalties under IRC §6656. At 10% (for deposits 16+ days late), the penalty on $922.13 would be approximately **$92.21**.

---

## 9. Year-End Planning & Recommendations

### Priority Matrix

| # | Item | Urgency | Impact |
|---|------|---------|--------|
| 1 | File 2025 1099-NEC/MISC (if not done) | **Critical** | Penalty avoidance |
| 2 | Clarify Nezha El Albani worker status | **Critical** | Correct tax treatment |
| 3 | Verify FUTA filing (Form 940) | **Critical** | Compliance |
| 4 | Review FBAR filing requirement | **Critical** | Severe penalties |
| 5 | Set up automated payroll tax deposits | **High** | Prevent future penalties |
| 6 | Verify UK VAT registration status | **High** | International compliance |
| 7 | Collect W-9/W-8BEN from all vendors | **High** | 1099 compliance |
| 8 | Reclassify $100 penalty as non-deductible | **Medium** | Accurate tax return |
| 9 | Verify inventory COGS flow | **Medium** | Correct P&L |
| 10 | Document business plan for hobby loss defense | **Medium** | Audit defense |
| 11 | Begin tracking vehicle mileage | **Medium** | Missed deduction |
| 12 | Evaluate home office deduction | **Low** | Additional deduction |
| 13 | File 1099-MISC for rent to KSU Real Estate | **Critical** | Compliance |

### Tax Optimization Strategies

#### A. S-Corp Election — **Not Recommended Now**
An S-Corp election (Form 2553) saves self-employment tax by splitting income between salary and distributions. However:
- The business is currently **unprofitable** — no SE tax is owed on losses
- S-Corp adds compliance costs (~$1,000-2,000/year for separate return)
- **Trigger point:** When the business generates **consistent net profit exceeding $40,000+**, evaluate S-Corp election

#### B. Retirement Plan Contributions — **Not Applicable Now**
SEP-IRA or Solo 401(k) contributions require **net self-employment income**. With a net loss, no contributions can be made. When profitable:
- **SEP-IRA:** Up to 25% of net SE income (max ~$69,000 for 2025)
- **Solo 401(k):** Employee deferrals up to $23,500 + employer profit sharing

#### C. Timing of Expenses
Given the current loss position, accelerating expenses provides **no additional tax benefit** (the loss already exceeds likely income from other sources). Consider:
- **Deferring discretionary expenses** to a profitable year when the deduction has higher value
- **Accelerating income** if possible to absorb some of the loss (though this is difficult to control with Amazon)

#### D. Inventory Management
The $61.8K in unsold inventory is a significant tied-up asset. If any inventory is obsolete or damaged:
- Write it down to **lower of cost or market (LCM)** value
- The write-down creates a deductible loss in the current period
- Conduct a physical inventory count at year-end

#### E. Health Insurance Deduction
If the owner pays for their own health insurance, the **self-employed health insurance deduction** (Line 17 of Schedule 1) can be taken. This is an above-the-line deduction and does not appear in the current books. Verify and capture if applicable.

---

## 10. Credit Card Balances — Anomaly

**American Express CC (1002): -$10,636.26 (CREDIT)**
**Chase Ink CC (0922): -$298.77 (CREDIT)**

A **credit balance** on a credit card means the company has **overpaid** or received credits/refunds exceeding the balance owed. A $10.6K credit balance is unusual and should be investigated:

- Was a large refund or chargeback credited to the Amex?
- Were payments double-posted?
- Are there transactions not yet recorded that would reduce this credit?

If the credit is legitimate, the company can request a refund check from American Express.

**Recommendation:** Reconcile credit card statements to determine the source of the $10.6K credit balance.

---

## Disclaimer

This review is based solely on the financial data extracted from QuickBooks Online. A complete tax compliance assessment would require review of: prior year tax returns, bank statements, Amazon Seller Central reports, payroll records (W-2s, 941s), the owner's complete tax situation (other income sources, filing status, dependents), and supporting documentation for all deductions. This report identifies potential issues and provides recommendations based on the available data. Consult with a licensed CPA or tax attorney for specific tax advice.
