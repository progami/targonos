# Talos Repository Workflows

This repository uses shared workflows from [progami/shared-workflows](https://github.com/progami/shared-workflows) to standardize CI/CD processes across all Targon repositories.

## Workflows

### CI (`ci.yml`)
- **Trigger**: 
  - Push to main/develop branches
  - Pull requests
  - Daily schedule (2 AM UTC)
  - Manual dispatch with options
  - Version tags (v*)
- **Purpose**: Comprehensive CI pipeline with build, test, and quality checks
- **Shared Workflows Used**:
  - `ci-base.yml` - Build and quality checks
  - `test-suite.yml` - Comprehensive testing
- **Features**:
  - Multi-version Node.js testing (18, 20)
  - TypeScript type checking
  - Security scanning (scheduled/manual/main branch)
  - Unit and integration tests (always)
  - E2E tests (PRs and main branch)
  - Performance tests (scheduled/manual/[perf] commits)
  - PostgreSQL and Redis services
  - Release creation for tags

### Deploy (`deploy.yml`)
- **Trigger**: 
  - After successful CI on main branch
  - Manual dispatch with environment selection
- **Purpose**: Deploy application to production/staging server
- **Shared Workflow**: `deploy-ssh.yml`
- **Configuration**:
  - PM2 app name: `talos-app`
  - Deployment path: `/home/talos/app`
  - Run as user: `talos`
  - Health check: http://localhost:3001/talos/api/health
  - Node.js 20

### PR Checks (`pr-checks.yml`)
- **Trigger**: Pull request events
- **Purpose**: Validate PR format and provide automated feedback
- **Shared Workflow**: `pr-checks.yml`
- **Features**:
  - Conventional commit title validation
  - Automatic size labeling (XS, S, M, L, XL)
  - File change analysis
  - Sensitive file detection
  - Database migration detection
  - PR summary comments

## Test Commands

The following npm scripts are expected to be available:
- `npm run lint` - Code linting
- `npm run type-check` - TypeScript type checking
- `npm run build` - Build the application
- `npm run test:unit` - Unit tests
- `npm run test:integration` - Integration tests
- `npm run test:e2e:ci` - E2E tests for CI
- `npm run test:security` - Security tests
- `npm run test:performance` - Performance tests
- `npm run seed:performance` - Seed data for performance tests (optional)

## Required Secrets

### Deployment
- `SERVER_HOST`: Production server hostname/IP
- `SERVER_USER`: SSH username for deployment
- `SERVER_SSH_KEY`: SSH private key for deployment
- `DEPLOY_ENV`: Additional deployment environment variables

### Testing
- `DATABASE_URL`: PostgreSQL connection string (optional, uses default in CI)
- `REDIS_URL`: Redis connection string (optional, uses default in CI)
- `NEXTAUTH_SECRET`: NextAuth.js secret
- `TEST_ENV`: Additional test environment variables

## Migration Notes

- Migrated from standalone workflows to shared workflows on $(date +%Y-%m-%d)
- Preserved all existing functionality including:
  - Comprehensive test matrix
  - Performance and security testing
  - PR validation and commenting
  - Release management
- Reduced workflow code by ~70% through reuse
- Deployment process remains unchanged (PM2 as talos user)

## Custom Jobs

The performance testing job remains custom in this repository due to specific requirements:
- Special Playwright setup
- Performance-specific database seeding
- Custom test reports and metrics

All other functionality has been migrated to shared workflows for consistency and maintainability.
