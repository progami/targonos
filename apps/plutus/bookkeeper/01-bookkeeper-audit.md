# Bookkeeping Audit Report: TARGON LLC

**Prepared by:** Senior Bookkeeper
**Date:** February 8, 2026
**Period Under Review:** January 1, 2025 - February 8, 2026
**Source:** QuickBooks Online (Realm ID: 9341455433341322)

---

## Executive Summary

TARGON LLC is an early-stage Amazon e-commerce business (US and UK marketplaces) selling physical products (dust sheets/drop cloths). The books show a business heavily reliant on owner capital infusions ($156K invested) against $55K in revenue, producing a net loss of -$43,377. While the fundamental accounting structure is sound and journal entries balance correctly, there are several significant issues requiring immediate attention: a **$10,636 unexplained credit balance on the Amex credit card**, **excessive chart of accounts bloat** (244 accounts, 224 with zero balances), **97.6% of purchases missing document numbers**, and **personal payments flowing through business accounts without proper classification**.

**Overall Assessment: FAIR** - Core bookkeeping is functional but needs cleanup and tightening of controls.

---

## 1. Chart of Accounts Review

### 1.1 Account Structure Overview

| Account Type | Count | Assessment |
|---|---|---|
| Bank | 5 | Reasonable |
| Accounts Receivable | 1 | OK |
| Accounts Payable | 2 | OK (USD + GBP) |
| Other Current Asset | 28 | High - many are LMB holding accounts |
| Fixed Asset | 9 | Reasonable |
| Credit Card | 2 | OK |
| Other Current Liability | 14 | High - payroll sub-accounts + LMB |
| Long Term Liability | 1 | OK |
| Equity | 13 | High - personal expense sub-accounts |
| Income | 16 | High - 4-way market/channel split |
| Cost of Goods Sold | 68 | **Excessive** |
| Expense | 69 | **Excessive** |
| Other Income | 11 | High |
| Other Expense | 5 | OK |
| **TOTAL** | **244** | **Excessive for a single-product Amazon business** |

### 1.2 Account Bloat Analysis

**Zero-balance active accounts: 224 out of 244 (91.8%)** - This is a critical indicator of over-engineering in the chart of accounts.

**Root Cause: 4-Way Market/Channel Sub-Account Structure**

LinkMyBooks (LMB) created sub-accounts for every combination of:
- Market: US, UK
- Channel: PDS (Private Direct Sales), CDS (Customer Direct Sales)

This creates 4 sub-accounts under every Amazon category. For example:
- `Amazon FBA Fees:Amazon FBA Fees - UK-CDS`
- `Amazon FBA Fees:Amazon FBA Fees - UK-PDS`
- `Amazon FBA Fees:Amazon FBA Fees - US-CDS`
- `Amazon FBA Fees:Amazon FBA Fees - US-PDS`

**CDS accounts are completely unused** - all 40 CDS sub-accounts have $0 balances. The CDS channel appears inactive.

Additionally, LMB created **duplicate top-level accounts** that mirror the sub-account structure:
- `Amazon Advertising Costs (LMB)` - Expense type, $0 balance
- `Amazon Advertising Costs` - COGS type (the one actually used)
- `Amazon FBA Fees (LMB)` - Expense type, $0 balance
- `Amazon FBA Fees` - COGS type (the one actually used)
- Same pattern for: Seller Fees, Storage Fees, Sales, Refunds, Inventory Reimbursement

These "(LMB)" accounts appear to be remnants of initial LMB setup and are completely unused.

### 1.3 Specific Account Issues

| Issue | Account(s) | Recommendation |
|---|---|---|
| Duplicate "(LMB)" expense accounts | 6 accounts with $0 balances | Merge or make inactive |
| Unused CDS sub-accounts | 40 accounts across all categories | Make inactive |
| `Penalties & Interest` wrong subtype | Listed as "Auto" subtype | Change to "PenaltiesSettlements" |
| `Research & Development` wrong subtype | Listed as "Auto" subtype | Change to appropriate subtype |
| `Uncategorized Asset/Expense/Income` | 3 system accounts, all $0 | Cannot delete (system) but monitor |
| `Unapplied Cash Bill Payment Expense` | System account, $0 | Monitor for future issues |
| QBO default sub-accounts never used | Employee benefits (4 subs), Travel (4 subs), Insurance (4 subs), Utilities (6 subs), Interest paid (2 subs) | Make inactive |

### 1.4 Account Hierarchy Assessment

The hierarchy is **logically sound** for Amazon sellers:
- COGS correctly contains: Amazon Advertising, FBA Fees, Seller Fees, Storage Fees, Manufacturing, Freight & Custom Duty, Warehousing (3PL/AWD/Amazon FC), Mfg Accessories, Inventory Shrinkage
- Inventory Asset properly mirrors COGS categories (Manufacturing, Freight, Accessories by market)
- Revenue correctly splits Sales and Refunds by market/channel

**However**, the 4-way sub-account split is overkill for a business with only 2 active channels (UK-PDS and US-PDS). A 2-way split (US/UK) would be sufficient.

### 1.5 Recommendations

1. **Immediately make inactive:** All 40 CDS sub-accounts, all 6 "(LMB)" duplicate accounts, and ~20 unused QBO default sub-accounts
2. **Target active account count:** Reduce from 244 to approximately 120-130
3. **Do not delete** accounts with any historical transactions - make them inactive instead

---

## 2. Transaction Categorization Accuracy

### 2.1 Purchase Categorization

125 purchase transactions analyzed. **Categorization accuracy: GOOD**

| Category | # Txns | Total | Assessment |
|---|---|---|---|
| Owner draws | 6 | $22,591.86 | Correctly coded. See Section 6.1 for vendor naming issue |
| Building & property rent | 9 | $5,391.63 | Correct |
| Payroll expenses | 4 | $4,429.74 | Correct - IRS, state tax agencies |
| Legal & accounting services:Legal fees | 8 | $4,160.90 | **Mixed** - includes IDFL ($2,425 product testing) and IP Office ($67.40 trademark). IDFL should be COGS or R&D |
| Contract labor | 5 | $1,934.66 | Correct |
| Office expenses | 18 | $1,355.21 | Correct |
| Software & apps | 16 | $1,250.11 | Correct - Claude.AI, OpenAI, AWS, etc. |
| CC payment (Amex) | 1 | $1,023.91 | Correct mechanism |
| Security Deposits | 1 | $687.00 | See Section 6.4 |
| Accounting fees | 5 | $618.50 | Correct - QBO Payments/Payroll |
| Memberships & subscriptions | 6 | $516.77 | Correct - Google Workspace |
| Bank fees | 24 | $433.34 | Correct |
| Insurance | 1 | $424.00 | Correct - Shelter Insurance |
| Phone service | 9 | $169.96 | Correct - US Mobile, Google Fi |
| Penalties & Interest | 1 | $100.00 | Correct account, see Section 6.2 |

**Categorization Issues Found:**

1. **IDFL ($2,425.00)** coded to `Legal & accounting services:Legal fees` - IDFL is a testing/certification lab. This should be coded to a COGS sub-account (e.g., product testing/certification) or a dedicated R&D expense account.

2. **KSU Real Estate rent includes $687 security deposit** coded to `Security Deposits` (Other Current Asset) - This is correctly treated as an asset, not an expense. However, KSU Real Estate also has one $687 rent payment coded to Security Deposits on 2026-02-01, which may be a duplicate charge or intentional second deposit.

3. ~~**Virginia SCC ($100)** coded to `General business expenses`~~ **FIXED 2026-02-08** — Moved to `Penalties & Interest`. This was actually a late filing penalty, not a registration fee.

### 2.2 Bill Categorization

25 bills analyzed. **Categorization accuracy: EXCELLENT**

- **Inventory purchases** (JIANGSU ZHEWEI, VICTOR HERO, Huizhou Anboson): Correctly coded to `Inventory Asset` sub-accounts
- **Freight** (FOREST SHIPPING): Correctly coded to `Inventory Asset:Freight - US-PDS`
- **3PL warehousing** (Tactical Logistic Solutions): Correctly coded to `Warehousing:3PL:US-PDS`
- **UK 3PL** (V Global Logistics): Correctly coded to `Warehousing:3PL:UK-PDS` with UK VAT correctly separated to `UK VAT Control`
- **AWS bills**: Correctly coded to `Office expenses:Software & apps`
- **Amazon Freight**: Correctly coded to `Warehousing:3PL:US-PDS`

### 2.3 LinkMyBooks Journal Entries

8 journal entries analyzed (all Amazon settlement entries via LMB). **Quality: EXCELLENT**

| JE # | Date | Total | Market | Balanced |
|---|---|---|---|---|
| LMB-UK-16-30JAN-26-1 | 2026-01-30 | $20,465.61 | UK | Yes |
| LMB-US-16-30JAN-26-1 | 2026-01-30 | $14,529.03 | US | Yes |
| LMB-UK-02-16JAN-26-1 | 2026-01-16 | $11,858.15 | UK | Yes |
| LMB-US-02-16JAN-26-1 | 2026-01-16 | $5,325.12 | US | Yes |
| LMB-UK-01-02JAN-26-2 | 2026-01-02 | $491.83 | UK | Yes |
| LMB-UK-05-31DEC-25-1 | 2025-12-31 | $112.00 | UK | Yes |
| LMB-US-19-31DEC-25-1 | 2025-12-31 | $3,727.69 | US | Yes |
| LMB-US-05-19DEC-25-1 | 2025-12-19 | $3,007.95 | US | Yes |

**All 8 journal entries balance perfectly (Debits = Credits).**

**LMB JE Structure Analysis:**
- Revenue lines: Correctly credit `Amazon Sales` sub-accounts by market/channel
- Fee lines: Correctly debit `Amazon FBA Fees`, `Amazon Seller Fees`, `Amazon Advertising Costs`, `Amazon Storage Fees`
- Refunds: Properly net against sales with both debit and credit components
- Sales Tax: US entries correctly show `Amazon Sales Tax (LMB)` netting to $0 (Marketplace Facilitator Tax collected and remitted by Amazon)
- Reserved Balances: Correctly track Amazon hold-backs as `Amazon Reserved Balances (LMB)` (current balance: $2,230.13)
- Settlement payouts: Credits flow to `Chase Ink CC (0922)` or `Targon UK Wise GBP (0036)` as appropriate
- Split Month Rollovers: Correctly handled between Dec 31 and Jan 2 entries ($112.00)

**Each JE includes audit trail links to LMB for verification.**

### 2.4 Amazon Sales Tax Handling

The `Amazon Sales Tax (LMB)` account has a $0 balance. **This is correct.** Amazon is the Marketplace Facilitator for US sales tax - they collect and remit the tax. The JE entries show matching debits and credits for sales tax lines, properly netting to zero. This is the expected treatment.

---

## 3. Reconciliation Issues

### 3.1 Credit Card Balances

#### American Express CC (1002): -$10,636.26 (CREDIT BALANCE) - CRITICAL

**This is the most significant issue in the books.**

A credit balance on a credit card means the company has overpaid the card - more payments have been recorded than charges. Analysis of the general ledger reveals:

**Charges on card (this period):** ~$1,441.31
- Purchase charges: $991.05
- Bill payments charged to card: $450.26

**Payments to card:** Multiple "Credit Card Payment" entries from "Chase bank" totaling significantly more than the charges.

**Root Cause:** The Amex card is connected to QBO bank feeds. QBO is importing **both** business payments (from Targon US Chase USD) AND **personal payments** (from Jarrar Amjad's personal checking account) as credits to the card. The personal payments are creating the credit balance because:
1. The personal bank account is NOT in QBO
2. The payments show "IND NAME: JARRAR AMJAD" (personal) vs "IND NAME: TARGON LLC" (business)
3. There is no offsetting debit to a bank account for the personal payments

**Identified personal CC payments flowing through Amex:**
- 2025-12-26: Chase bank → Amex (JARRAR AMJAD)
- 2026-01-12: Chase bank → Amex (JARRAR AMJAD)
- 2026-01-20: Chase bank → Amex (JARRAR AMJAD)
- 2026-01-27: Chase bank → Amex (JARRAR AMJAD)
- 2026-02-02: Chase bank → Amex (JARRAR AMJAD)

**Resolution Required:**
1. Personal CC payments should be recoded: Debit Amex CC, Credit `Owner investments` (since the owner is paying business expenses from personal funds)
2. Alternatively, if the personal charges should NOT be in the business books, delete both the personal charges and the personal payments
3. Reconcile the Amex statement against QBO to identify exact discrepancy

#### Chase Ink CC (0922): -$298.77 (CREDIT BALANCE) - MODERATE

The Chase Ink CC has $5,227.50 in credits from LMB journal entries (Amazon settlement payouts being directed to the CC) plus $10,055.57 in charges. The small credit balance suggests slight over-payment, likely from similar personal payment issues or timing differences.

**Amazon settlement payouts to Chase Ink CC:**
- LMB-UK-02-16JAN-26-1: $1,019.02
- LMB-UK-01-02JAN-26-2: $491.83
- LMB-US-19-31DEC-25-1: $748.69
- LMB-US-05-19DEC-25-1: $2,967.96

**Note:** Using the Chase Ink CC as the payout account for Amazon settlements is unconventional. Typically Amazon pays out to a bank account. This suggests LMB is configured to treat Amazon payouts as CC credits, which effectively pays down the card balance. While mechanically correct, it makes reconciliation harder.

### 3.2 Accounts Payable Aging

| Aging Bucket | Amount | Assessment |
|---|---|---|
| 31-60 days past due | $6,915.38 | **Needs attention** |
| 1-30 days past due | $658.78 | Normal |
| Current | $191.65 | Normal |
| **Total AP** | **$7,765.81** | |

**JIANGSU ZHEWEI ELECTROMECHANICAL CO., LTD** - $6,915.38 outstanding (PI-2507223A)
- Bill dated: September 5, 2025
- Due date: December 24, 2025
- Days past due: 46
- Original amount: $13,830.77 (50% already paid on 2025-09-05)
- **Assessment:** This is a Chinese manufacturer with Net 90-120 terms being typical. The remaining 50% balance at 46 days past due may be within normal terms for this vendor, OR it may indicate a payment issue. Verify with vendor and document agreed payment schedule.

**All other AP items are within normal ranges.**

### 3.3 Bank Account Reconciliation

Without access to bank statements, I cannot verify reconciliation status. However:
- **Chase Chk ProjectX (9873): $10,000.00** - This account received a $40,000 transfer from the main Chase account on 2026-01-09, then transferred $10,000 back on 2026-02-04. Purpose of this separate account is unclear and should be documented.
- **Targon US Wise USD (1248): $11.04** - Very small balance, used for international contractor payments
- **Targon UK Wise GBP (0036): $2,559.76** - Receives UK Amazon settlement payouts, used for UK vendor payments

---

## 4. Missing or Incomplete Entries

### 4.1 No Invoices / No Payments Received

**Zero invoices and zero customer payments** in the system. **This is expected and correct** for an Amazon-only FBA business. Amazon handles all customer-facing transactions. Revenue flows through LMB journal entries, and Amazon payouts appear as settlement credits.

### 4.2 No COGS Entries for Product Sold

**Significant gap:** There are no journal entries moving inventory from `Inventory Asset` to `Cost of Goods Sold` (Manufacturing, Mfg Accessories, or Freight sub-accounts).

Current inventory balance: **$61,795.22**
- Manufacturing (US-PDS): $47,783.43
- Freight (US-PDS): $8,130.00
- Mfg Accessories (US-PDS): $5,881.79

All COGS sub-accounts for Manufacturing, Mfg Accessories, and Freight show $0 balances. This means:
1. Product has been purchased and is sitting in Inventory Asset
2. Units have been sold ($55,988.05 in revenue)
3. But no cost has been relieved from inventory

**Impact:** Gross profit is understated (COGS only shows Amazon fees, not product cost). The true COGS should include the cost of units sold. This is a **material** bookkeeping gap.

**Resolution:** Implement a periodic inventory relief method (FIFO recommended) or work with the CPA to calculate and book COGS adjustments.

### 4.3 Deposits

15 deposits recorded, primarily:
- **Owner investments** from Jarrar Amjad: 9 deposits totaling ~$148K (from personal checking ...1268 and from Ammar Amjad)
- **Micro-deposits** from Amazon/Intuit: 3 verification deposits ($0.01, $0.01, $0.10)

The deposits are properly categorized.

---

## 5. Data Quality Issues

### 5.1 Missing Document Numbers

**122 out of 125 purchases (97.6%) have no document number.** Only 3 purchases have doc numbers. This makes audit trail verification extremely difficult.

- Bills have proper doc numbers (invoice numbers from vendors)
- Journal entries have proper doc numbers (LMB reference numbers)
- **Purchases are the problem** - likely auto-imported from bank feeds without manual doc number assignment

### 5.2 Missing Vendor Assignments

~~4 transactions lack vendor assignments~~ **3 of 4 FIXED 2026-02-08** — Texas SOS transactions (#85, #86, #87) now have vendor "Texas Secretary of State". Categories also corrected from Bank fees → Legal fees.

Remaining:
1. 2025-12-27 | $5.47 | Credit card rewards (acceptable - no vendor)
2. 2025-12-20 | $32.63 | Amazon credit (acceptable - handled by Plutus)

### 5.3 Uncategorized Transactions

**Zero uncategorized transactions** - all purchases are properly categorized to specific accounts. This is good.

### 5.4 Duplicate/Inconsistent Vendor Names

"Chase bank" is used as a vendor for both:
- Owner draw transactions (should be "Jarrar Amjad" or "Owner")
- Bank fee transactions (Chase bank is the correct vendor here)

This creates confusion in vendor reports. The $22,877 attributed to "Chase bank" is primarily owner draws ($22,500), with only $377 being actual bank fees.

---

## 6. Specific Red Flags

### 6.1 "Chase bank" as Top Vendor - $22,877

**Partially resolved.** Analysis shows:
- **$22,500 in Owner Draws** (correctly coded to equity): $20,000 (2/1), $1,800 (2/4), $700 (1/17), individual smaller draws
- **$377 in Bank Fees** (correctly coded to expense): Wire fees, check fees, monthly maintenance
- **$17.21 in Hy-Vee grocery** (correctly coded to Owner Draws): Personal purchases on business card

**Issue:** Using "Chase bank" as the vendor name for owner draws is misleading. These are distributions TO the owner VIA Chase bank. Recommend changing the vendor to "Jarrar Amjad - Owner Draw" for these transactions.

### 6.2 $100 Penalties & Interest

**Identified:** $201.50 total from VA Employment Commission on 2025-11-06, memo: "VA Employment Commission - Penalty"

This is a **state unemployment tax penalty** from Virginia. Note: the P&L shows $100, but the actual transaction was $201.50 (the difference may be in a different period or split).

**Action Required:**
- Determine the cause (late filing, late payment, or incorrect calculation)
- Ensure VA unemployment returns are current
- Penalties are generally not tax-deductible - verify proper tax treatment with CPA

### 6.3 Amex CC Credit Balance of -$10,636

**See Section 3.1 for detailed analysis.** This is the result of personal credit card payments being imported via bank feeds without a corresponding debit to a business bank account. The personal payments need to be reclassified as Owner Investments or deleted along with any personal charges.

### 6.4 Security Deposits - $687

**Identified:** $687.00 paid to KSU Real Estate on 2025-09-11, memo: "Security Deposit - 1960 Suite 316"

This is a **security deposit for office/warehouse space** at 1960 Suite 316 (KSU Real Estate is Kansas State University area real estate). Correctly classified as Other Current Asset (recoverable deposit). Monthly rent to same vendor is $594.09.

**Note:** A second $687 charge to KSU Real Estate on 2026-02-01 was coded to `Security Deposits` - verify if this is a second deposit or should be coded to `Building & property rent`.

### 6.5 Amazon Sales Tax (LMB) Netting to $0

**Confirmed correct.** See Section 2.4. Amazon collects and remits sales tax as Marketplace Facilitator. The offsetting entries properly zero out the liability account.

### 6.6 Owner Investment Pattern

$156,117.06 in owner investments is extremely high relative to $54,918.27 in revenue. The business is clearly in a heavy investment/growth phase. Notably, $72,000 came from "AMMAR AMJAD" (August-September 2025), while later investments came from "Jarrar Amjad" personal account. If Ammar Amjad is a different person (family member), this needs proper documentation:
- Is this a loan or investment?
- Are there any written agreements?
- Tax implications differ significantly

---

## 7. Recommendations

### Priority 1 - CRITICAL (Do Immediately)

1. ~~**Resolve Amex CC credit balance ($10,636.26)**~~ **REVIEWED 2026-02-08 — NOT A BOOKKEEPING ERROR.** Credit balance is due to unreconciled bank feed transactions, not misclassification. Will resolve once transactions are matched/reconciled in QBO.

2. **Implement COGS relief / inventory accounting**
   - $61,795 in inventory with $55,988 in sales but $0 in product COGS is materially misstated
   - Work with CPA to book cost of goods sold based on units shipped (Amazon provides this data)

3. **Reclassify IDFL $2,425 from Legal fees to Product Expenses (COGS)**
   - Product testing is not a legal expense
   - **UPDATE 2026-02-08:** "Product Expenses" COGS account created in Plutus codebase and deployed. Recategorization will be handled via Plutus setup flow

### Priority 2 - HIGH (Within 30 Days)

4. ~~**Clean up Chart of Accounts**~~ **REVIEWED 2026-02-08 — NO ACTION NEEDED.** 65 accounts already cleaned up previously. Remaining 244 active accounts are either: (a) actively used by LMB journal entries (balance nets to $0 but has transactions), (b) structurally required by Plutus LMB plan (CDS accounts recreated if deleted), (c) QBO system accounts, or (d) ~25 unused QBO defaults not worth deleting

5. **Add document numbers to purchases**
   - At minimum, assign reference numbers going forward
   - Consider using bank transaction reference numbers as doc numbers

6. ~~**Verify KSU Real Estate $687 on 2026-02-01**~~ **VERIFIED 2026-02-08 — CORRECT.** This is February 2026 rent (Invoice #02192), properly coded to Building & property rent. Not a second security deposit.

7. **Investigate Chase Ink CC as Amazon payout account**
   - Verify LMB configuration - Amazon payouts should ideally flow to a bank account, not a credit card
   - Current setup makes reconciliation unnecessarily complex

### Priority 3 - MODERATE (Within 60 Days)

8. ~~**Rename vendor "Chase bank" on owner draw transactions**~~ **FIXED 2026-02-08.** Created vendor "Jarrar Amjad (Owner)" (Id=64). Updated all 4 owner draw transactions (#173, #265, #267, #277) from "Chase bank" to "Jarrar Amjad (Owner)"

9. ~~**Document the Ammar Amjad capital contributions**~~ **RESOLVED 2026-02-08.** $80K from Ammar Amjad is an irrevocable gift per gift affidavit (on file in E2 folder) for E2 visa investment. Funds came directly from Ammar's bank to Targon LLC. Correctly booked as Owner investments. Memos on all 4 deposits (#14, #15, #16, #17) updated to reference gift affidavit.

10. ~~**Review the ProjectX checking account ($10,000)**~~ **REVIEWED 2026-02-08 — NO ACTION NEEDED.** Internal transfers between owner's bank accounts. Money is properly tracked on both sides. No bookkeeping issue.

11. ~~**Address VA Employment Commission penalty**~~ **RESOLVED 2026-02-08.** Original $100 penalty was paid 11/06/2025. All payroll tax liabilities reviewed: Federal Taxes $910.33 and VA Income Tax $166.61 are scheduled to auto-pay (02/17 and 02/25). VA SUI $100 paid and e-filed via QBO on 02/10/2026. Federal Unemployment $24 not due until 01/29/2027. Last employee (Nezha El Albani) left December 2025, auto payroll turned off.

### Priority 4 - LOW (Ongoing Maintenance)

12. ~~**Assign vendors to the 4 transactions missing vendor names**~~ **FIXED 2026-02-08** — Texas SOS x3 vendors added. Remaining 1 is CC rewards (no vendor needed)
13. **Consider simplifying the UK VAT handling** if UK sales volume remains low ($131 CDS, $39,443 PDS)
14. **Monitor Uncategorized accounts** - currently at $0, ensure nothing flows in
15. **Set up monthly closing checklist** - reconcile all bank/CC accounts monthly

---

## Appendix A: Chart of Accounts - Recommended Inactive List

The following 66+ accounts should be made inactive:

**CDS Sub-Accounts (40 accounts):**
All accounts containing "UK-CDS" or "US-CDS" across: Amazon Advertising Costs, Amazon FBA Fees, Amazon FBA Inventory Reimbursement, Amazon Promotions, Amazon Refunds, Amazon Sales, Amazon Seller Fees, Amazon Storage Fees, Freight & Custom Duty (Duty + Freight), Inventory Asset (Manufacturing, Freight, Duty, Accessories), Inventory Shrinkage, Manufacturing, Mfg Accessories, Warehousing (3PL, AWD, Amazon FC)

**Duplicate "(LMB)" Accounts (6 accounts):**
- Amazon Advertising Costs (LMB)
- Amazon FBA Fees (LMB)
- Amazon FBA Inventory Reimbursement (LMB)
- Amazon Refunds (LMB)
- Amazon Sales (LMB)
- Amazon Seller Fees (LMB)
- Amazon Storage Fees (LMB)

**Unused QBO Default Sub-Accounts (~20 accounts):**
- Employee benefits (4 sub-accounts)
- Interest paid (2 sub-accounts)
- Insurance:Liability/Property/Rental (3 sub-accounts)
- Travel (4 sub-accounts)
- Utilities: Disposal/Electricity/Heating/Water (4 sub-accounts)
- Meals:Travel meals
- Cost of goods sold:Subcontractor expenses
- Entertainment with clients

---

## Appendix B: Financial Summary

| Metric | Value | Assessment |
|---|---|---|
| Revenue | $54,918.27 | Low for investment level |
| COGS (as recorded) | $61,367.71 | **Does not include product cost** |
| Gross Profit | -$6,449.44 | Negative but misleading (see COGS note) |
| Operating Expenses | $36,962.89 | High relative to revenue |
| Net Income | -$43,376.50 | Expected for startup phase |
| Total Assets | $87,881.43 | Mostly inventory |
| Total Liabilities | -$2,267.27 | Net credit due to CC overpayments |
| Owner's Equity | $90,148.70 | Heavy owner investment |
| Cash on Hand | $22,258.53 | Adequate for near-term |
| Inventory | $61,795.22 | **No COGS relief booked** |
| AP Outstanding | $7,765.81 | Manageable |

---

## Appendix C: Fixes Applied (2026-02-08)

| QBO Link | Change |
|----------|--------|
| [txn 85](https://qbo.intuit.com/app/expense?txnId=85) | Added vendor "Texas Secretary of State" (created). Bank fees → Legal fees |
| [txn 86](https://qbo.intuit.com/app/expense?txnId=86) | Added vendor "Texas Secretary of State". Bank fees → Legal fees |
| [txn 87](https://qbo.intuit.com/app/expense?txnId=87) | Added vendor "Texas Secretary of State". Category already Legal fees |
| [txn 89](https://qbo.intuit.com/app/expense?txnId=89) | Virginia SCC $100 — General business expenses → Penalties & Interest (late filing penalty) |
| [txn 265](https://qbo.intuit.com/app/expense?txnId=265) | Owner draw $700 — memo updated: "Owner draw — 20 Nov to 30 Nov 2025 compensation" |
| [txn 277](https://qbo.intuit.com/app/expense?txnId=277) | Owner draw $1,800 — memo updated: "Owner draw — January 2026 compensation" |
| [txn 280](https://qbo.intuit.com/app/expense?txnId=280) | Muhammad Mehdi $350 — memo updated: "Contract labor — transferred to Ali Asghar upon Mehdi's request" |
| [bill 242](https://qbo.intuit.com/app/bill?txnId=242) | CAKE AFFAIRS $12.51 — Office expenses → Meals. Memo: "Wedding cake for Zeeshan Azam — team celebration" |
| [txn 173](https://qbo.intuit.com/app/expense?txnId=173) | Owner draw $74.65 — vendor changed from "Chase bank" to "Jarrar Amjad (Owner)" |
| [txn 265](https://qbo.intuit.com/app/expense?txnId=265) | Owner draw $700 — vendor changed from "Chase bank" to "Jarrar Amjad (Owner)" |
| [txn 267](https://qbo.intuit.com/app/expense?txnId=267) | Owner draw $20,000 — vendor changed from "Chase bank" to "Jarrar Amjad (Owner)" |
| [txn 277](https://qbo.intuit.com/app/expense?txnId=277) | Owner draw $1,800 — vendor changed from "Chase bank" to "Jarrar Amjad (Owner)" |
| [dep 14](https://qbo.intuit.com/app/deposit?txnId=14) | Ammar Amjad $8,000 — memo updated: gift affidavit reference |
| [dep 15](https://qbo.intuit.com/app/deposit?txnId=15) | Ammar Amjad $20,000 — memo updated: gift affidavit reference |
| [dep 16](https://qbo.intuit.com/app/deposit?txnId=16) | Ammar Amjad $20,700 — memo updated: gift affidavit reference |
| [dep 17](https://qbo.intuit.com/app/deposit?txnId=17) | Ammar Amjad $31,300 — memo updated: gift affidavit reference |

---

*End of Bookkeeping Audit Report*
