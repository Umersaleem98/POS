# POS — Retail workspace

A Next.js + TypeScript web application with a MySQL backend for XAMPP. The frontend and authenticated API live in one project. XAMPP supplies MySQL (often MariaDB); Next.js runs through Node.js rather than Apache.

## Run on Windows with XAMPP

1. Install Node.js 24 LTS (recommended; Next.js requires 20.9+, and the included TypeScript tests require 22.18+). Open XAMPP Control Panel and start **MySQL**. Apache is optional and only needed for phpMyAdmin.
2. Open a terminal in this POS directory and run `npm install`.
3. Copy `.env.example` to `.env`. Set your MySQL host, port, username and password. The defaults match a typical local XAMPP installation.
4. Replace `SESSION_SECRET` with a random value of at least 32 characters. Generate one with `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`. Set your own `SEED_EMAIL` and strong `SEED_PASSWORD`.
5. Run `npm run db:setup`. This creates the `pos` database, tables, your super admin account, main store, and six starter products. Existing data is preserved. Changing SEED_PASSWORD later does not overwrite an existing account.
6. Run `npm run dev` and open http://localhost:3000. Sign in with your configured seed credentials.

PowerShell example:

```powershell
Copy-Item .env.example .env
notepad .env
npm run db:setup
npm run dev
```

The **Open interactive demo** button works without MySQL. Demo changes exist in memory and disappear on reload or sign-out. Synthetic demo history can be voided for interface exploration but does not restore stock. Real database sales always restore stock when voided.

## Included workflows

- Dashboard: redesigned revenue hero, KPI cards, seven/thirty-day revenue chart, inventory health, outstanding invoices, recent sales and quick actions. Totals query the full database.
- Checkout: product/SKU search, categories, quantity controls, customer selection, fixed cash discount, payment method, printable receipt.
- Products: create, edit, archive, unique SKU per store, selling/cost prices, opening stock, reorder levels.
- Inventory: stock adjustment with reason, nonnegative stock enforcement, movement history, valuation.
- Customers: create and search customer records.
- Sales: transaction history, completed/void status, transactional stock restoration when voided.
- Reports: full database filtering by custom dates, payment, status, amount and receipt/customer/cashier/product/SKU search; 25-row pagination; estimated gross profit, average orders, payment breakdown and PDF/CSV exports. Exports include all matching rows up to 10,000; larger requests require narrower filters. Inventory/activity retain the latest 100 movements/events.
- Super admin: manage stores, create/edit accounts, assign stores and roles, activate/deactivate access, define custom roles, edit operational permission sets, and view audit events.
- Workspace search: find products, customers, receipts, invoices and team members within the accessible modules and store. Catalog filters combine search, category and stock status.
- Billing: automatic paid invoices for checkout, standalone invoices, tax/discount calculation, due dates, partial/full payments, outstanding/overdue balances, PDF downloads, printing and payment history.
- Admin: store-scoped sales, customers, products, inventory and reports. API enforces the assigned store, even when a request supplies another store ID.

Currency defaults to Pakistani rupees. Checkout product prices are final, inclusive prices; additional checkout tax is not calculated. Standalone invoice tax applies after the fixed discount. Payment methods record the tender type; card/transfer processing is external. Voiding restores inventory, cancels the linked invoice and marks its ledger payments reversed; it does not send money back to the customer. Standalone invoices do not reserve or deduct stock.

## Structure

```text
POS/
  database/schema.sql            MySQL relational schema
  scripts/setup.mjs              Idempotent schema and initial-account setup
  scripts/migrate.mjs            Additive upgrades and historical invoice backfill
  src/app/
    api/auth/route.ts            Login, session lookup, logout
    api/workspace/route.ts       Authorized reads and transactional operations
    api/admin/                  User accounts and role policy management
    api/dashboard/              Full database dashboard analytics
    api/reports/                Filtered reporting and PDF/CSV exports
    api/sales/                  Paginated sales history
    api/search/                 Permission-aware workspace search
    api/invoices/               Billing, payment ledger and invoice PDF
    globals.css                 Responsive visual system and receipt printing
    advanced.css                Dashboard, roles, reports and billing design
    layout.tsx                  Metadata and root layout
    page.tsx                    Application entry
  src/components/
    workspace.tsx              Client workspace and management screens
    login.tsx                  Sign-in and demo entry
    catalog-ui.tsx             Reusable product, transaction and empty-state views
    advanced/                  Modular dashboard, reports, team, search and billing screens
  src/lib/
    auth.ts                     Signed HttpOnly cookie sessions
    db.ts                       Parameterized SQL and pooled connections
    schemas.ts                  Zod input validation
    types.ts                    Shared TypeScript contracts
    demo.ts                     Isolated sample workspace
    permissions.ts              Role defaults and granular permission vocabulary
    server-access.ts            Authorization and store scope helpers
    report-service.ts           Shared paginated reporting queries
    report-filters.ts           Date/amount validation and SQL predicates
    billing.ts                  Currency calculations and payment state
    invoice-service.ts          Transactional invoice creation
    pdf-documents.ts            PDF report and invoice generation
    exports.ts                  Safe CSV serialization
  tests/                        Validation and checkout invariants
```

## Verification and deployment

```powershell
npm run typecheck
npm test
npm run build
npm start
```

This is a functional starting application, not a claim of production certification. Before exposing it publicly, configure HTTPS and a dedicated least-privilege database account, backups, network-level abuse protection in addition to the included per-email MySQL login limit, password reset/change and account recovery, monitoring, and the tax/payment requirements of your business. The default XAMPP root account is for local development only. Sessions expire after eight hours; account deactivation is checked against MySQL on each authenticated request. Mutating API requests enforce same-origin requests and use HttpOnly/SameSite cookies. Password hashes use bcrypt cost 12. Checkout uses server prices and database row locks; sale, inventory and audit updates commit together. The application never trusts client-supplied totals or roles.

Future modules such as suppliers, purchase orders, partial returns, tax engines, cashier shifts, hardware integrations and offline operation are outside this initial version.

Framework references: https://nextjs.org/docs/app and https://sidorares.github.io/node-mysql2/docs .

## Live integration tests

With the app and XAMPP MySQL running:

```powershell
$env:POS_INTEGRATION = "1"
# If your app runs on port 3001:
# $env:POS_TEST_URL = "http://localhost:3001"
npm run test:integration
Remove-Item Env:POS_INTEGRATION
```

The tests create uniquely named temporary stores, users and products, exercise the live API, and remove only their own fixtures. They verify store isolation, role restrictions, origin checks, concurrent checkout/retry safety, server-calculated totals, stock restoration, role changes on existing sessions, invoice calculation, partial/concurrent/idempotent payments, disabled-account access, reports over 500 sales, CSV exports and PDF documents. PDF fixtures for visual QA are written under ignored `tmp/qa/`.

For hosting behind a reverse proxy, set `APP_URL` to the exact public origin (e.g. `https://pos.example.com`) for mutation origin checks. Dates in the workspace use the Asia/Karachi business timezone.

## Upgrade an existing installation

```powershell
npm install
npm run db:migrate
npm run dev
```

The migration preserves existing accounts, passwords, stock, sales and edited role policies. It adds role/billing tables and checkout retry identifiers. Historical sales receive invoice records without changing stock or recording any new money movement; contact details on those backfilled invoices reflect migration-time store/customer data.

If this project is already running in another terminal, use that server or stop it before starting another one. Next.js prevents multiple development servers in the same directory. The already-configured local installation does not need a new `.env` or seed account.

## Roles and responsibilities

| Role              | Default responsibility                                          |
| ----------------- | --------------------------------------------------------------- |
| Super Admin       | All stores, accounts, role policies and operations              |
| Admin             | Full operations for the assigned store                          |
| User              | Dashboard, checkout, sales/customer service and invoice viewing |
| Cashier           | Checkout, sales/customer service and invoice viewing            |
| Inventory Manager | Dashboard, products and inventory                               |
| Accountant        | Dashboard, reports, customer viewing, invoices and payments     |

Use **Team & access → Team members → Add user** to create accounts. Manage an existing account to change its name/email, role, store or active status. The **Roles & responsibilities** tab creates custom roles or edits dashboard, product, inventory, customer, sale, report and invoice permissions. View/write dependencies are enforced.

Permissions are read from MySQL on every request, so role changes apply without signing out. Refresh to update the current navigation. Global administration remains reserved for Super Admin. Super Admin's full permissions are protected; a super admin cannot demote/deactivate themselves or remove the last active super admin.

## Billing and reporting details

- Every completed checkout creates a uniquely numbered paid invoice in the same transaction as the sale and stock updates. Retrying the same checkout request returns the existing sale; its order fingerprint prevents reusing that request for a different order.
- Create a standalone invoice with multiple description/quantity/rate lines, customer details, due date, discount, tax percentage and notes. These invoices track billing separately from checkout revenue and do not move stock.
- Invoice payments use row locks and request identifiers to prevent overpayment and duplicate retry entries. A partial payment leaves an outstanding balance; the final payment marks the invoice paid.
- Cancel unpaid standalone invoices while retaining the document. Paid/partially paid invoices cannot be cancelled through this workflow. Void linked checkout sales through Sales history to restore stock and retain reversed payment entries.
- Estimated gross profit is completed sales revenue less historical item cost, excluding operating expenses. Top-product revenue is before transaction-level discounts. Voided sales remain in history but are excluded from completed revenue and profit.
- Report CSV/PDF downloads use the exact active filters. CSV fields are quoted and protected against spreadsheet formula injection; PDFs include summaries, filters, transaction tables and page numbers.
- Currency inputs allow two decimal places. Tax/discount and payment totals are calculated on the server in minor units.
- Downloaded PDFs use built-in Latin fonts; unsupported script characters are substituted. Browser invoice printing preserves the browser's Unicode support. Add a multilingual font/shaping workflow before relying on PDF downloads for non-Latin records.

Demo invoices and payments exist only in browser memory. Demo gross profit is unavailable because synthetic sale item costs are not recorded. External card charging, bank transfers, actual refunds, procurement/suppliers, partial product returns, cashier shifts, hardware integrations and offline sync remain separate modules.
