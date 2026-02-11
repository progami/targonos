# Talos Repository Workflows

This repository uses shared workflows from [progami/shared-workflows](https://github.com/progami/shared-workflows) for PR checks and local workflow files for CI/CD.

## Workflows

### CI (`ci.yml`)
- Trigger:
  - Push to `main`, `dev`, and `feature/**`
  - Pull requests
  - Manual dispatch
  - Version tags (`v*`)
- Purpose:
  - PR title/size checks
  - Lint + type-check
  - Build validation
  - Release automation for version tags and main version bumps

### Deploy (`deploy.yml`)
- Trigger:
  - After successful CI on main branch
  - Manual dispatch with environment selection
- Purpose:
  - Deploy application to production/staging server

### PR Checks (`pr-checks.yml`)
- Trigger:
  - Pull request events
- Purpose:
  - Conventional PR title validation
  - Automated size labels

## Required Commands

The CI pipeline expects these scripts:
- `npm run lint`
- `npm run type-check`
- `npm run build`

## Required Secrets

### Deployment
- `SERVER_HOST`
- `SERVER_USER`
- `SERVER_SSH_KEY`
- `DEPLOY_ENV`
