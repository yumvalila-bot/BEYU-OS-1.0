# BEYU Health OS backend — production image.
#
# Build:   docker build -t beyu-health-backend sectors/health/backend
# Run:     the process reads its configuration ONLY from the environment
#          (see DEPLOYMENT_CONTRACT.md). No secret is baked into the image.
# Migrate: migrations are NOT applied at start-up. They run as a separate,
#          human-authorized release step with the PRIVILEGED migration DSN:
#            docker run --rm -e DATABASE_URL=<migration DSN> <image> \
#              node dist/database/migration-runner.js status|up
#          The serving container uses the least-privilege runtime DSN.

FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
# tsconfig.build.json compiles to CommonJS so `node dist/main` can load the
# extensionless relative imports emitted by tsc (DEP-1).
RUN npm run build

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache dumb-init
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=builder /app/dist ./dist
# Committed migration source: required by the governed runner AND by
# /health/ready, which verifies the database ledger against these files
# (count, order, checksums, fingerprint). Without it readiness fails closed.
COPY --from=builder /app/database/migrations ./database/migrations

# Never run the service as root.
USER node

EXPOSE 3000
# Container liveness only; orchestrator readiness should use GET /health/ready.
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:'+(process.env.PORT||3000)+'/health/live',(r)=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/main"]
