# How-To: Kubernetes Deployment

**Time required**: 20 minutes  
**Difficulty**: Advanced  

## Deployment Manifest

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: wasm4pm
spec:
  replicas: 3
  selector:
    matchLabels:
      app: wasm4pm
  template:
    metadata:
      labels:
        app: wasm4pm
    spec:
      containers:
      - name: wasm4pm
        image: wasm4pm:26.4.5
        ports:
        - containerPort: 3001
        resources:
          requests:
            memory: "512Mi"
            cpu: "500m"
          limits:
            memory: "2Gi"
            cpu: "2"
        livenessProbe:
          httpGet:
            path: /health
            port: 3001
          initialDelaySeconds: 10
          periodSeconds: 30
        readinessProbe:
          httpGet:
            path: /health
            port: 3001
          initialDelaySeconds: 5
          periodSeconds: 10
        env:
        - name: WASM4PM_LOG_LEVEL
          value: "info"
        volumeMounts:
        - name: config
          mountPath: /config.toml
          subPath: config.toml
      volumes:
      - name: config
        configMap:
          name: wasm4pm-config
```

## Service

```yaml
apiVersion: v1
kind: Service
metadata:
  name: wasm4pm
spec:
  selector:
    app: wasm4pm
  ports:
  - protocol: TCP
    port: 3001
    targetPort: 3001
  type: LoadBalancer
```

## ConfigMap

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: wasm4pm-config
data:
  config.toml: |
    [discovery]
    algorithm = "dfg"
    profile = "fast"
    [source]
    type = "file"
    path = "/data/events.xes"
    [sink]
    type = "file"
    directory = "/output"
```

## Deploy

```bash
# Create namespace
kubectl create namespace wasm4pm

# Apply manifests
kubectl apply -n wasm4pm -f deployment.yaml
kubectl apply -n wasm4pm -f service.yaml
kubectl apply -n wasm4pm -f configmap.yaml

# Check status
kubectl -n wasm4pm get pods
kubectl -n wasm4pm get svc
```

## Horizontal Pod Autoscaling

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: wasm4pm-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: wasm4pm
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

## See Also

- [How-To: Docker Deployment](./docker-deploy.md)
- [How-To: CI/CD Setup](./cicd-setup.md)
