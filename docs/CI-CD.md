# CI/CD Pipeline - ShelfHelp AI

## Overview

Comprehensive CI/CD pipeline using GitHub Actions for automated testing, quality checks, and deployment.

## Workflows

### 1. Main CI/CD Pipeline (`ci-cd.yml`)
**Triggers**: Push/PR to main/develop branches

**Jobs**:
- **Test & Quality**: Linting, testing, coverage reporting
- **Security**: Vulnerability scanning, dependency checks
- **Deploy Staging**: Auto-deploy develop branch to staging
- **Deploy Production**: Auto-deploy main branch to production

### 2. Test Results Publisher (`test-results.yml`)
**Triggers**: After CI/CD completion

**Features**:
- Publishes detailed test results to PRs
- Creates coverage badges
- Generates performance reports

### 3. Deployment Workflow (`deploy.yml`)
**Triggers**: Manual dispatch, releases

**Features**:
- Environment-specific deployments
- Health checks
- Rollback capabilities

### 4. Automated Tests (`automated-tests.yml`)
**Triggers**: Daily schedule, manual dispatch

**Features**:
- Multi-version Node.js testing
- Performance benchmarking
- Security scanning

## Quality Gates

### Test Coverage
- **Minimum**: 80% global coverage
- **Critical Components**: 85% coverage
- **Enforcement**: Pipeline fails if thresholds not met

### Code Quality
- **ESLint**: Enforces coding standards
- **Prettier**: Consistent formatting
- **Pre-commit**: Automated quality checks

### Security
- **npm audit**: Dependency vulnerability scanning
- **Trivy**: Container security scanning
- **Dependency review**: PR-based dependency analysis

## Branch Strategy

### Main Branch (`main`)
- **Protection**: Requires PR approval
- **Deployment**: Automatic to production
- **Tests**: Full test suite required

### Develop Branch (`develop`)
- **Integration**: Feature branch merging
- **Deployment**: Automatic to staging
- **Testing**: Continuous integration

### Feature Branches
- **Naming**: `feature/description`
- **Requirements**: Pass all quality gates
- **Merge**: PR to develop branch

## Environment Configuration

### Staging Environment
- **URL**: `https://shelfhelp-staging.railway.app`
- **Purpose**: Integration testing
- **Data**: Test datasets

### Production Environment
- **URL**: `https://shelfhelp-ai.railway.app`
- **Purpose**: Live application
- **Data**: Production datasets

## Deployment Process

### Automatic Deployment
1. **Code Push**: To main/develop branch
2. **Quality Gates**: All tests and checks pass
3. **Deployment**: Automatic to respective environment
4. **Health Checks**: Verify deployment success

### Manual Deployment
1. **Trigger**: GitHub Actions manual dispatch
2. **Environment**: Select staging/production
3. **Approval**: Required for production
4. **Monitoring**: Post-deployment validation

## Monitoring & Alerts

### Performance Monitoring
- **Response Time**: API endpoint performance
- **Error Rate**: Application error tracking
- **Resource Usage**: Memory and CPU metrics

### Quality Metrics
- **Test Coverage**: Tracked over time
- **Code Quality**: ESLint/Prettier violations
- **Security**: Vulnerability reports

## Secrets Management

### Required Secrets
- `RAILWAY_TOKEN`: Deployment authentication
- `CODECOV_TOKEN`: Coverage reporting
- `GITHUB_TOKEN`: GitHub API access

### Environment Variables
- `NODE_ENV`: Runtime environment
- `ENABLE_FIREBASE`: Firebase integration toggle
- `API_KEY`: Authentication key

## Troubleshooting

### Common Issues
1. **Test Failures**: Check test logs in Actions tab
2. **Deployment Failures**: Verify secrets and environment config
3. **Coverage Drops**: Add tests for new code

### Debug Commands
```bash
# Run tests locally
npm run test:ci

# Check linting
npm run lint

# Security audit
npm run security-check

# Manual deployment test
npm run build
```

## Maintenance

### Regular Tasks
- **Weekly**: Review failed builds and fix issues
- **Monthly**: Update dependencies and security patches
- **Quarterly**: Review and optimize pipeline performance

### Updates
- **GitHub Actions**: Keep actions updated to latest versions
- **Dependencies**: Regular security updates
- **Node.js**: Maintain compatibility with latest LTS

---

**Last Updated**: July 15, 2025  
**Pipeline Version**: 1.0.0  
**Maintainer**: ShelfHelp AI Team