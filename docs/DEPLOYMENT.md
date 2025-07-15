# ShelfHelp AI - Deployment Guide

## Zero-Cost Production Deployment Options

### 1. Railway (Recommended)

**Why Railway:**
- Free tier: 500 hours/month, $5 credit
- Persistent storage
- Built-in health checks
- Easy GitHub integration

**Deployment Steps:**
1. Push code to GitHub
2. Sign up at [railway.app](https://railway.app)
3. Click "Deploy from GitHub repo"
4. Select repository
5. Railway auto-detects `config/deployment/railway.json`

**Environment Variables:**
```bash
NODE_ENV=production
PORT=${{RAILWAY_PORT}}
ENABLE_FIREBASE=false
```

### 2. Vercel

**Configuration:** `config/deployment/vercel.json`

**Deploy Command:**
```bash
vercel --prod
```

### 3. Render

**Configuration:** `config/deployment/render.yaml`

**Free Tier:**
- 750 hours/month
- Automatic SSL
- GitHub integration

### 4. Docker Deployment

**Configuration:** `config/deployment/Dockerfile`

```bash
# Build image
docker build -t shelfhelp-ai .

# Run container
docker run -p 3000:3000 shelfhelp-ai
```

## Environment Configuration

### Production Settings
Location: `config/environments/production.json`
- Rate limiting: 1000 req/15min
- CORS: AI platforms only
- Firebase: Optional
- Logging: JSON format

### Development Settings
Location: `config/environments/development.json`
- Rate limiting: 2000 req/15min
- CORS: Localhost + AI platforms
- Firebase: Enabled
- Logging: Dev format

## Security Checklist

- [ ] API key authentication enabled
- [ ] Rate limiting configured
- [ ] CORS properly set
- [ ] Firebase credentials secured
- [ ] Error handling AI-safe
- [ ] Health checks functional

## Monitoring

### Health Endpoints
- `/health` - Basic health check
- `/api/health` - Detailed system status
- `/api/status` - API-specific status

### Performance Targets
- Response time: <200ms
- Memory usage: <512MB
- Error rate: <1%
- Uptime: 99.5%

## Troubleshooting

### Common Issues
1. **Port conflicts**: Check Railway port config
2. **Firebase errors**: Verify credentials
3. **Rate limiting**: Adjust limits in config
4. **CORS issues**: Check origin settings

### Logs
- Railway: Built-in logging
- Vercel: Function logs
- Docker: Container logs

## Backup & Recovery

### Data Backup
- `data/books.json` - Primary data
- `history/` - Audit trail
- `config/` - Configuration

### Recovery Process
1. Restore from Git
2. Redeploy to platform
3. Verify health endpoints
4. Test core functionality

---

*Configuration files located in `config/deployment/`*