# @targon/website

Marketing site and landing hub for the Targon platform.

## Local Development
- Install dependencies once from the repo root with `pnpm install`.
- Start the app with `pnpm --filter @targon/website exec next dev -p 3205`.
- Run linting and static checks with `pnpm --filter @targon/website lint` and `pnpm --filter @targon/website type-check`.

## Production Workflow
- We work directly on the EC2 host; no Terraform or Ansible automation is required.
- Pull the latest changes, then run `pnpm install` followed by `pnpm --filter @targon/website build`.
- Serve the production build with `pnpm --filter @targon/website start` or your preferred process manager.

## Environment
Required values live in the app's `.env` file on the host (see `.env.example`). Update the file before rebuilding when configuration changes.
