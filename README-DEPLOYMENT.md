# ShelfHelp AI - Deployment Guide

## Zero-Cost Production Deployment Options

This guide covers deploying ShelfHelp AI to various free-tier cloud platforms.

### 1. Railway (Recommended)

**Why Railway:**
- Free tier: 500 hours/month, $5 credit
- Persistent storage
- Built-in health checks
- Easy GitHub integration

**Deployment Steps:**
1. Push your code to GitHub
2. Sign up at [railway.app](https://railway.app)
3. Click "Deploy from GitHub repo"
4. Select your repository
5. Railway will automatically detect the `railway.json` config

**Environment Variables:**
```bash
NODE_ENV=production
PORT=${{RAILWAY_PORT}}
ENABLE_FIREBASE=false  # Optional: set to true if using Firebase
```

### 2. Vercel

**Why Vercel:**
- Free tier with good limits
- Edge functions
- Global CDN
- Excellent for API endpoints

**Deployment Steps:**
1. Install Vercel CLI: `npm i -g vercel`
2. Run `vercel` in project directory
3. Follow prompts to deploy
4. Vercel will use the `vercel.json` configuration

**Limitations:**
- 10-second function timeout on free tier
- Limited to stateless operations
- No persistent file storage

### 3. Render

**Why Render:**
- Free tier: 750 hours/month
- Persistent disks available
- Built-in SSL
- Docker support

**Deployment Steps:**
1. Connect GitHub repo at [render.com](https://render.com)
2. Create new Web Service
3. Use `render.yaml` configuration
4. Deploy

### 4. Fly.io

**Why Fly.io:**
- Generous free tier
- Full Docker support
- Edge deployment
- Persistent volumes

**Deployment Steps:**
1. Install Fly CLI
2. Run `fly launch` in project directory
3. Configure scaling: `fly scale count 1`
4. Deploy: `fly deploy`

### 5. Heroku (Limited Free Tier)

**Deployment Steps:**
1. Install Heroku CLI
2. `heroku create your-app-name`
3. `git push heroku main`
4. `heroku ps:scale web=1`

## Configuration for Production

### Required Environment Variables

```bash
NODE_ENV=production
PORT=3000  # Or platform-specific port variable

# Optional Firebase Integration
ENABLE_FIREBASE=true
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_DATABASE_URL=your-database-url

# Optional Library Integrations
OVERDRIVE_LIBRARY_ID=your-library-id
HOOPLA_API_KEY=your-api-key

# Security (recommended for production)
CORS_ORIGIN=https://yourdomain.com
```

### Platform-Specific Notes

#### Railway
- Persistent storage: Files in `/app/data/` persist between deployments
- Built-in health checks use `/health` endpoint
- Automatic HTTPS
- Custom domain support on paid plans

#### Vercel
- Stateless by design - store data externally (Firebase/MongoDB)
- Fast cold starts
- Perfect for API-only deployment
- Free custom domains

#### Render
- Free tier includes 100GB bandwidth/month
- Persistent disks available (25GB free)
- Automatic deployments from GitHub
- Built-in SSL certificates

#### Fly.io
- Full Docker support allows complex applications
- Persistent volumes (3GB free)
- Multi-region deployment
- IPv6 support

## Performance Optimization

### For All Platforms

1. **Enable Compression:**
```javascript
app.use(compression());
```

2. **Cache Static Assets:**
```javascript
app.use(express.static('public', { maxAge: '1d' }));
```

3. **Limit Request Size:**
```javascript
app.use(express.json({ limit: '10mb' }));
```

### Platform-Specific Optimizations

#### Railway
- Use build caching: Add `.railway-cache` to store `node_modules`
- Enable health checks to prevent sleeping

#### Vercel
- Use Edge Functions for better performance
- Implement request/response caching
- Minimize function bundle size

#### Render
- Use persistent disks for data storage
- Configure auto-scaling based on CPU/memory

## Monitoring and Maintenance

### Health Checks

All platforms support the built-in health check endpoint:
```
GET /health
```

Response:
```json
{
  "status": "healthy",
  "timestamp": "2025-07-11T17:00:00.000Z",
  "mode": "production",
  "firebase": {
    "enabled": false,
    "configured": true
  }
}
```

### Logging

- All platforms provide basic request logging
- Use structured logging for better debugging:
```javascript
console.log(JSON.stringify({
  level: 'info',
  message: 'Processing request',
  timestamp: new Date().toISOString(),
  requestId: req.id
}));
```

### Error Handling

Production error handling is configured in `api-server.js`:
- 404 handlers for undefined routes
- 500 handlers for server errors
- Request validation and sanitization

## Cost Management

### Free Tier Limits

| Platform | Compute Hours | Storage | Bandwidth | Functions |
|----------|---------------|---------|-----------|-----------|
| Railway  | 500hrs/month  | Ephemeral | 100GB | Unlimited |
| Vercel   | 100GB-hrs     | None    | 100GB | 100GB |
| Render   | 750hrs/month  | 25GB    | 100GB | N/A |
| Fly.io   | 2,340hrs      | 3GB     | 160GB | Unlimited |

### Optimization Tips

1. **Use Efficient Endpoints:** Implement pagination and filtering
2. **Cache Responses:** Use in-memory caching for frequently accessed data
3. **Optimize Bundle Size:** Remove unused dependencies
4. **Implement Rate Limiting:** Prevent abuse and reduce costs

## Security Considerations

### Production Security

1. **Environment Variables:** Never commit secrets to GitHub
2. **CORS Configuration:** Restrict origins in production
3. **Rate Limiting:** Implement request throttling
4. **Input Validation:** Sanitize all user inputs
5. **HTTPS Only:** All platforms provide free SSL

### Firebase Security (if enabled)

1. Use service account keys, not web API keys
2. Configure database rules for read/write access
3. Enable audit logging
4. Regular security rule reviews

## Troubleshooting

### Common Issues

1. **Port Binding:** Use `process.env.PORT || 3000`
2. **File Permissions:** Ensure write access to data directories
3. **Memory Limits:** Optimize data loading for large book collections
4. **Cold Starts:** Use health checks to keep services warm

### Platform-Specific Issues

#### Railway
- Build failures: Check `railway.json` configuration
- Memory issues: Scale up service if needed

#### Vercel
- Function timeouts: Break large operations into smaller chunks
- Storage issues: Use external storage for persistent data

#### Render
- Build timeouts: Optimize dependencies and build process
- Service sleeping: Use external monitoring to keep alive

### Getting Help

1. Check platform documentation
2. Review application logs
3. Test locally with production environment variables
4. Use platform-specific support channels

## Next Steps

After successful deployment:

1. **Custom Domain:** Point your domain to the deployed service
2. **Monitoring:** Set up uptime monitoring
3. **Backups:** Regular data backups if using persistent storage
4. **CI/CD:** Automate deployments from GitHub
5. **Analytics:** Track usage and performance metrics