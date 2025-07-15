# Multi-stage build for production optimization
FROM node:18-alpine AS base

# Install dependencies only when needed
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

# Production image, copy all the files and run app
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 shelfhelp

# Create necessary directories
RUN mkdir -p data history reflections reports vectorstore .temp
RUN chown -R shelfhelp:nodejs /app

# Copy files
COPY --from=deps --chown=shelfhelp:nodejs /app/node_modules ./node_modules
COPY --chown=shelfhelp:nodejs . .

# Ensure data files exist with proper permissions
RUN touch data/books.json data/classifications.yaml data/preferences.json && \
    echo "[]" > data/books.json && \
    chown -R shelfhelp:nodejs data/ history/ reflections/ reports/ vectorstore/ .temp/

USER shelfhelp

EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) }).on('error', () => process.exit(1))"

CMD ["npm", "start"]