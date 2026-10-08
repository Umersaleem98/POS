# Contributing to POS

Read [README.md](README.md) and the [user guide](docs/USER_GUIDE.md) to set up Node.js and MySQL. Copy `.env.example` to your local `.env`; never commit credentials or customer data.

Keep UI components under `src/components`, route handlers under `src/app/api`, and reusable calculations, authorization and database services under `src/lib`. Follow the existing TypeScript and Prettier conventions.

For each change, describe the problem, resulting behavior and verification in your pull request. Include demo screenshots for visible changes. Test authorization on the server, store isolation and transaction behavior when modifying protected operations.

```powershell
npm run typecheck
npm test
npm run build
```

Changes to checkout, inventory, billing or permissions should also run the opt-in live integration tests described in the user guide. Use only disposable fixtures for screenshots and tests.

Report bugs with reproduction steps, expected/actual behavior and your Node.js/database version. Redact all environment values, passwords, tokens and customer information.
