# Plutus

Plutus is the rebranded successor to FCC (Financial Control Center).

Plutus is the finance workspace for Link My Books (LMB) plus QuickBooks Online (QBO).

Key workflows:
- Connect to QBO (OAuth) and verify connection status
- Setup Wizard: brands, SKUs, parent account mappings, brand sub-account creation
- Bulk upload LMB Audit Data and process settlements (posts COGS JE and P&L reclass JE)
- Bills mapping to build SKU cost basis for inventory COGS
- Transactions and benchmarking analytics

Persistence:
- Uses Postgres via Prisma (schema `plutus`) for setup, audit data, processing history, and bill mappings.
