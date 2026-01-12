# Cream Infrastructure

OpenTofu infrastructure as code for deploying Cream to Hetzner Cloud with Vercel DNS.

## Overview

This module provisions:
- **Hetzner VPS** (cpx31) with Docker and Docker Compose
- **Firewall** allowing only SSH, HTTP, HTTPS, and ICMP
- **DNS records** for cream.broker via Vercel

## Prerequisites

### Required Accounts
- [Hetzner Cloud](https://www.hetzner.com/cloud) account
- [Vercel](https://vercel.com) account with cream.broker domain

### Required Secrets (GitHub Actions)

| Secret | Description |
|--------|-------------|
| `HCLOUD_TOKEN` | Hetzner Cloud API token |
| `VERCEL_API_TOKEN` | Vercel API token for DNS |
| `HETZNER_SSH_PRIVATE_KEY` | SSH private key for server access |
| `TURSO_DATABASE_URL` | Turso Cloud database URL |
| `TURSO_AUTH_TOKEN` | Turso Cloud auth token |
| `ALPACA_KEY` | Alpaca broker API key |
| `ALPACA_SECRET` | Alpaca broker API secret |
| `` | Polygon market data API key |
| `ANTHROPIC_API_KEY` | Anthropic Claude API key |

### Local Tools

```bash
# Install OpenTofu
brew install opentofu

# Install Hetzner CLI
brew install hcloud
```

## Usage

### Initial Setup

```bash
# Generate SSH key pair
ssh-keygen -t ed25519 -f ~/.ssh/cream-deploy -C "cream-deploy"

# Create terraform.tfvars (not committed)
cat > terraform.tfvars << 'EOF'
hcloud_token       = "your-hetzner-token"
vercel_api_token   = "your-vercel-token"
ssh_public_key_path = "~/.ssh/cream-deploy.pub"
EOF

# Initialize OpenTofu
tofu init

# Preview changes
tofu plan

# Apply infrastructure
tofu apply
```

### Outputs

After applying:

```bash
# Get server IP
tofu output server_ip

# Get SSH command
tofu output ssh_command

# Get dashboard URL
tofu output dashboard_url
```

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                     Hetzner VPS (cpx31)                       │
│                                                               │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │                      Caddy                               │ │
│  │              (Auto-HTTPS, Reverse Proxy)                │ │
│  │                                                          │ │
│  │   cream.broker → dashboard:3000                         │ │
│  │   api.cream.broker → dashboard-api:3001                 │ │
│  └─────────────────────────────────────────────────────────┘ │
│                           │                                   │
│           ┌───────────────┼───────────────┐                  │
│           ▼               ▼               ▼                  │
│    ┌───────────┐   ┌─────────────┐   ┌─────────┐            │
│    │ Dashboard │   │ Dashboard   │   │ Worker  │            │
│    │ (Next.js) │   │    API      │   │         │            │
│    └───────────┘   │ (Hono)      │   └─────────┘            │
│                    └─────────────┘                           │
│                           │                                   │
│                           ▼                                   │
│                    ┌─────────────┐                           │
│                    │   Turso     │                           │
│                    │  (Cloud)    │                           │
│                    └─────────────┘                           │
└──────────────────────────────────────────────────────────────┘
```

## CI/CD Deployment

Deployment happens automatically via GitHub Actions:

1. Push to `master` triggers CI tests
2. On success, deploy workflow runs
3. Changed services are built and deployed
4. See `.github/workflows/deploy.yml`

### Manual Deployment

```bash
# Trigger deployment
gh workflow run deploy.yml --ref master

# Force deploy all services
gh workflow run deploy.yml --ref master -f force_deploy_all=true

# Force infrastructure apply
gh workflow run deploy.yml --ref master -f force_infra=true
```

## Server Management

### SSH Access

```bash
ssh cream@cream.broker
```

### Docker Commands

```bash
# View services
docker compose -f docker-compose.prod.yml ps

# View logs
docker compose -f docker-compose.prod.yml logs -f dashboard-api

# Restart service
docker compose -f docker-compose.prod.yml restart dashboard-api

# Rebuild and restart
docker compose -f docker-compose.prod.yml up -d --build dashboard-api
```

### Cleanup

```bash
# Prune unused images
docker image prune -af
docker builder prune -af
```

## Files

| File | Description |
|------|-------------|
| `versions.tf` | Provider version constraints |
| `providers.tf` | Hetzner + Vercel provider config |
| `variables.tf` | Input variables |
| `backend.tf` | State backend (local) |
| `server.tf` | VPS with cloud-init |
| `ssh.tf` | SSH key resource |
| `firewall.tf` | Firewall rules |
| `dns.tf` | Vercel DNS records |
| `outputs.tf` | Output values |

## Security

- SSH key authentication only (no password)
- Firewall allows only ports 22, 80, 443
- Automatic security updates enabled
- fail2ban running
- HTTPS enforced via Caddy auto-HTTPS

## Cost Estimation

| Resource | Monthly Cost |
|----------|-------------|
| Hetzner cpx31 (4 vCPU, 8 GB) | ~$15 |
| Turso Cloud (Pro) | ~$29 |
| Vercel (Pro) | ~$20 |
| **Total** | ~$64/month |
