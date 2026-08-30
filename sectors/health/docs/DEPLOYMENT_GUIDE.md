# BEYU Health OS - Deployment and Infrastructure Guide

## Table of Contents
1. [Local Development](#local-development)
2. [Docker Deployment](#docker-deployment)
3. [Kubernetes Deployment](#kubernetes-deployment)
4. [Cloud Deployment](#cloud-deployment)
5. [Monitoring and Observability](#monitoring-and-observability)
6. [Scaling Strategies](#scaling-strategies)
7. [Disaster Recovery](#disaster-recovery)

---

## Local Development

### Prerequisites
- Node.js 20+
- PostgreSQL 15+
- Redis 7+
- Docker (optional)

### Setup Steps

```bash
# 1. Clone repository
git clone https://github.com/beyuhealth/beyu-os.git
cd beyu-os/backend

# 2. Install dependencies
npm install

# 3. Configure environment
cp .env.example .env
# Edit .env with local settings

# 4. Start services
docker-compose up -d  # PostgreSQL and Redis

# 5. Run database migrations
npm run migration:run

# 6. Seed initial data (optional)
npm run seed

# 7. Start application
npm run start:dev

# 8. Verify
curl http://localhost:3000/health
```

### Database Setup

```bash
# Create development database
createdb beyu_health

# Run migrations
npm run migration:run

# Verify schema
psql beyu_health -c "\dt"
```

---

## Docker Deployment

### Single Container

```bash
# Build image
docker build -t beyu-backend:latest .

# Run container
docker run -d \
  -e NODE_ENV=production \
  -e DB_HOST=postgres \
  -e DB_PORT=5432 \
  -p 3000:3000 \
  --name beyu-api \
  beyu-backend:latest
```

### Docker Compose (Recommended for Local/Staging)

```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f backend

# Stop services
docker-compose down

# Rebuild images
docker-compose build --no-cache
```

### Production Docker Compose

```yaml
version: '3.9'

services:
  backend:
    image: registry.example.com/beyu-backend:${VERSION}
    restart: always
    environment:
      NODE_ENV: production
      LOG_LEVEL: warn
    ports:
      - "3000:3000"
    depends_on:
      postgres:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 5s
      retries: 3
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 2G
        reservations:
          cpus: '1'
          memory: 1G

  postgres:
    image: postgres:16-alpine
    restart: always
    environment:
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    restart: always
    volumes:
      - redis_data:/data
    command: redis-server --appendonly yes --requirepass ${REDIS_PASSWORD}

volumes:
  postgres_data:
  redis_data:
```

---

## Kubernetes Deployment

### Prerequisites
- Kubernetes 1.24+
- Helm 3+
- kubectl configured

### Helm Chart

```yaml
# helm/values.yaml
replicaCount: 3

image:
  repository: registry.example.com/beyu-backend
  tag: 1.0.0
  pullPolicy: IfNotPresent

service:
  type: LoadBalancer
  port: 3000

ingress:
  enabled: true
  className: nginx
  hosts:
    - host: api.beyuhealth.com
      paths:
        - path: /
          pathType: Prefix

resources:
  limits:
    cpu: 2000m
    memory: 2Gi
  requests:
    cpu: 1000m
    memory: 1Gi

autoscaling:
  enabled: true
  minReplicas: 3
  maxReplicas: 10
  targetCPUUtilizationPercentage: 70

postgresql:
  enabled: true
  auth:
    postgresPassword: changeme
    database: beyu_health
  primary:
    persistence:
      enabled: true
      size: 50Gi

redis:
  enabled: true
  auth:
    password: changeme
```

### Deployment

```bash
# Add Helm repo
helm repo add beyu https://charts.beyuhealth.com
helm repo update

# Create namespace
kubectl create namespace beyu-prod

# Create secrets
kubectl create secret generic beyu-secrets \
  --from-literal=db-password=changeme \
  --from-literal=jwt-secret=your-secret \
  -n beyu-prod

# Deploy
helm install beyu beyu/beyu-backend \
  -f helm/values.yaml \
  -n beyu-prod

# Verify deployment
kubectl get pods -n beyu-prod
kubectl logs -f deployment/beyu-backend -n beyu-prod
```

### Kubernetes Manifest (Alternative to Helm)

```yaml
---
apiVersion: v1
kind: ConfigMap
metadata:
  name: beyu-config
  namespace: beyu-prod
data:
  NODE_ENV: production
  LOG_LEVEL: info

---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: beyu-backend
  namespace: beyu-prod
spec:
  replicas: 3
  selector:
    matchLabels:
      app: beyu-backend
  template:
    metadata:
      labels:
        app: beyu-backend
    spec:
      containers:
      - name: backend
        image: registry.example.com/beyu-backend:1.0.0
        ports:
        - containerPort: 3000
        envFrom:
        - configMapRef:
            name: beyu-config
        env:
        - name: DB_PASSWORD
          valueFrom:
            secretKeyRef:
              name: beyu-secrets
              key: db-password
        livenessProbe:
          httpGet:
            path: /health/live
            port: 3000
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /health/ready
            port: 3000
          initialDelaySeconds: 10
          periodSeconds: 5
        resources:
          limits:
            cpu: 2000m
            memory: 2Gi
          requests:
            cpu: 1000m
            memory: 1Gi

---
apiVersion: v1
kind: Service
metadata:
  name: beyu-backend
  namespace: beyu-prod
spec:
  type: LoadBalancer
  selector:
    app: beyu-backend
  ports:
  - port: 3000
    targetPort: 3000

---
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: beyu-hpa
  namespace: beyu-prod
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: beyu-backend
  minReplicas: 3
  maxReplicas: 10
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
```

---

## Cloud Deployment

### AWS ECS

```bash
# Create ECR repository
aws ecr create-repository --repository-name beyu-backend

# Push image
docker tag beyu-backend:latest \
  123456789.dkr.ecr.us-east-1.amazonaws.com/beyu-backend:latest
docker push 123456789.dkr.ecr.us-east-1.amazonaws.com/beyu-backend:latest

# Create task definition
aws ecs register-task-definition --cli-input-json file://ecs-task-definition.json

# Create service
aws ecs create-service \
  --cluster beyu-prod \
  --service-name beyu-api \
  --task-definition beyu-backend:1 \
  --desired-count 3 \
  --launch-type FARGATE
```

### Google Cloud Run

```bash
# Build image
gcloud builds submit --tag gcr.io/PROJECT_ID/beyu-backend

# Deploy
gcloud run deploy beyu-backend \
  --image gcr.io/PROJECT_ID/beyu-backend \
  --platform managed \
  --region us-central1 \
  --memory 2Gi \
  --cpu 2 \
  --set-env-vars NODE_ENV=production
```

### Azure Container Instances

```bash
# Build and push image
az acr build --registry myregistry --image beyu-backend:latest .

# Deploy
az container create \
  --resource-group beyu-prod \
  --name beyu-api \
  --image myregistry.azurecr.io/beyu-backend:latest \
  --cpu 2 \
  --memory 2 \
  --environment-variables NODE_ENV=production
```

---

## Monitoring and Observability

### Prometheus Metrics

```typescript
// src/modules/metrics/metrics.service.ts
import { Injectable } from '@nestjs/common';
import * as prometheus from 'prom-client';

@Injectable()
export class MetricsService {
  private httpRequestDuration = new prometheus.Histogram({
    name: 'http_request_duration_seconds',
    help: 'Duration of HTTP requests in seconds',
    labelNames: ['method', 'route', 'status_code'],
  });

  private patientRecordsCreated = new prometheus.Counter({
    name: 'patient_records_created_total',
    help: 'Total number of patient records created',
  });

  recordHttpRequestDuration(method: string, route: string, statusCode: number, durationMs: number) {
    this.httpRequestDuration.labels(method, route, statusCode).observe(durationMs / 1000);
  }

  recordPatientCreated() {
    this.patientRecordsCreated.inc();
  }

  getMetrics() {
    return prometheus.register.metrics();
  }
}
```

### Prometheus Configuration

```yaml
# prometheus.yml
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: 'beyu-backend'
    static_configs:
      - targets: ['localhost:3000']
    metrics_path: '/metrics'
```

### Grafana Dashboards

```json
{
  "dashboard": {
    "title": "BEYU Health OS",
    "panels": [
      {
        "title": "API Request Rate",
        "targets": [
          {"expr": "rate(http_requests_total[1m])"}
        ]
      },
      {
        "title": "Error Rate",
        "targets": [
          {"expr": "rate(http_requests_total{status=~\"5..\"}[1m])"}
        ]
      },
      {
        "title": "Database Connections",
        "targets": [
          {"expr": "pg_stat_activity_count"}
        ]
      }
    ]
  }
}
```

### ELK Stack (Elasticsearch, Logstash, Kibana)

```yaml
# logstash.conf
input {
  file {
    path => "/var/log/beyu/*.log"
    start_position => "beginning"
  }
}

filter {
  json {
    source => "message"
  }
}

output {
  elasticsearch {
    hosts => ["localhost:9200"]
    index => "beyu-logs-%{+YYYY.MM.dd}"
  }
}
```

---

## Scaling Strategies

### Horizontal Scaling
- Load balancer distributes traffic
- Database read replicas for reporting
- Redis cluster for caching
- Message queue for async processing

### Vertical Scaling
- Increase CPU/memory per pod
- Database optimization (indexes, partitions)
- Connection pooling
- Query result caching

### Database Optimization

```sql
-- Add indexes for common queries
CREATE INDEX idx_patients_tenant_status 
ON clinical.patients(tenant_id, status);

CREATE INDEX idx_encounters_patient_date 
ON clinical.encounters(patient_id, encounter_date DESC);

-- Partition large tables
CREATE TABLE clinical.encounters_2024 
PARTITION OF clinical.encounters
FOR VALUES FROM ('2024-01-01') TO ('2025-01-01');
```

---

## Disaster Recovery

### Backup Strategy

```bash
#!/bin/bash
# backup.sh - Daily backup script

DATE=$(date +%Y%m%d)

# Backup PostgreSQL
pg_dump beyu_health | gzip > /backups/beyu_health_$DATE.sql.gz

# Upload to S3
aws s3 cp /backups/beyu_health_$DATE.sql.gz \
  s3://beyu-backups/databases/

# Cleanup old backups (>30 days)
find /backups -name "*.sql.gz" -mtime +30 -delete
```

### Recovery Procedure

```bash
# 1. Stop application
kubectl scale deployment beyu-backend --replicas=0 -n beyu-prod

# 2. Restore database
gunzip < /backups/beyu_health_backup.sql.gz | psql beyu_health

# 3. Verify data integrity
psql beyu_health -c "SELECT COUNT(*) FROM clinical.patients;"

# 4. Restart application
kubectl scale deployment beyu-backend --replicas=3 -n beyu-prod

# 5. Run health checks
curl http://localhost:3000/health/ready
```

### RTO/RPO Goals

- **RTO (Recovery Time Objective)**: 4 hours
- **RPO (Recovery Point Objective)**: 1 hour
- **Backup Frequency**: Every 6 hours
- **Retention Period**: 30 days (hot), 7 years (cold)

---

## Checklist

- [ ] Create container registry account
- [ ] Set up CI/CD pipeline
- [ ] Configure secrets management
- [ ] Set up database backups
- [ ] Configure monitoring and alerting
- [ ] Test disaster recovery procedure
- [ ] Document runbooks
- [ ] Train operations team
- [ ] Set up log aggregation
- [ ] Configure auto-scaling policies
- [ ] Plan capacity for growth

---

## Support

For deployment issues:
1. Check logs: `kubectl logs -f deployment/beyu-backend`
2. Verify health: `curl http://api.beyuhealth.com/health`
3. Contact DevOps team: devops@beyuhealth.com

