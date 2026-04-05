#!/bin/bash
# curl-examples.sh
# Example cURL commands for wasm4pm-service HTTP API

SERVICE_URL="http://localhost:3001"

echo "===== wasm4pm Service HTTP API - cURL Examples ====="
echo ""

# 1. Health Check
echo "1. Health Check (GET /status)"
echo "Command:"
echo "curl -s -X GET ${SERVICE_URL}/status | jq ."
echo ""
echo "Response:"
curl -s -X GET "${SERVICE_URL}/status" | head -20
echo ""
echo "---"
echo ""

# 2. OpenAPI Documentation
echo "2. OpenAPI Documentation (GET /api/docs)"
echo "Command:"
echo "curl -s -X GET ${SERVICE_URL}/api/docs | jq '.info'"
echo ""
echo "Response (info section):"
curl -s -X GET "${SERVICE_URL}/api/docs" | jq '.info' 2>/dev/null || echo "Service not running"
echo ""
echo "---"
echo ""

# 3. Submit Run Request
echo "3. Submit Run Request (POST /run)"
echo "Command:"
cat << 'EOF'
curl -s -X POST http://localhost:3001/run \
  -H "Content-Type: application/json" \
  -d '{
    "config": "[algorithm]\nname = \"heuristic\"\nthreshold = 0.5",
    "input_file": "/path/to/log.xes",
    "profile": "production"
  }' | jq .
EOF
echo ""
echo "Response:"
curl -s -X POST "${SERVICE_URL}/run" \
  -H "Content-Type: application/json" \
  -d '{"config": "[test]\nkey = \"value\""}' 2>/dev/null | jq . || echo "Service not running"
echo ""
echo "---"
echo ""

# 4. Get Run Status
echo "4. Get Run Status (GET /run/:run_id)"
echo "Command:"
echo "curl -s -X GET http://localhost:3001/run/run_2026_abc123 | jq ."
echo ""
echo "Example (replace run_id with actual ID):"
echo "curl -s -X GET ${SERVICE_URL}/run/{RUN_ID} | jq ."
echo ""
echo "---"
echo ""

# 5. Watch Run Execution (Stream Events)
echo "5. Watch Run Execution (GET /watch/:run_id)"
echo "Command:"
echo "curl -s -X GET http://localhost:3001/watch/{RUN_ID} --no-buffer"
echo ""
echo "This streams JSONL events as the run executes"
echo ""
echo "---"
echo ""

# 6. Explain Configuration
echo "6. Explain Configuration (POST /explain)"
echo "Command:"
cat << 'EOF'
curl -s -X POST http://localhost:3001/explain \
  -H "Content-Type: application/json" \
  -d '{
    "config": "[algorithm]\nname = \"heuristic\"",
    "mode": "brief"
  }' | jq .
EOF
echo ""
echo "Response:"
curl -s -X POST "${SERVICE_URL}/explain" \
  -H "Content-Type: application/json" \
  -d '{"config": "[algorithm]\nname = \"heuristic\""}' 2>/dev/null | jq . || echo "Service not running"
echo ""
echo "---"
echo ""

# 7. Cancel Run
echo "7. Cancel Run (DELETE /run/:run_id)"
echo "Command:"
echo "curl -s -X DELETE http://localhost:3001/run/{RUN_ID} | jq ."
echo ""
echo "---"
echo ""

# 8. Complete Workflow
echo "8. Complete Workflow Example"
cat << 'EOF'
#!/bin/bash
# Submit a run
echo "Submitting run..."
RUN_RESPONSE=$(curl -s -X POST http://localhost:3001/run \
  -H "Content-Type: application/json" \
  -d '{"config": "[test]\nkey = \"value\""}')

RUN_ID=$(echo "$RUN_RESPONSE" | jq -r '.run_id')
echo "Run ID: $RUN_ID"

# Check status
echo "Checking status..."
curl -s -X GET "http://localhost:3001/run/${RUN_ID}" | jq '.status,.progress'

# Wait for completion
echo "Waiting for completion..."
while true; do
  STATUS=$(curl -s -X GET "http://localhost:3001/run/${RUN_ID}" | jq -r '.status')
  PROGRESS=$(curl -s -X GET "http://localhost:3001/run/${RUN_ID}" | jq '.progress')
  echo "Status: $STATUS, Progress: $PROGRESS%"

  if [[ "$STATUS" == "completed" ]] || [[ "$STATUS" == "failed" ]]; then
    break
  fi
  sleep 1
done

# Get final result
echo "Getting final result..."
curl -s -X GET "http://localhost:3001/run/${RUN_ID}" | jq '.receipt'
EOF
echo ""
echo "---"
echo ""

# Error Examples
echo "9. Error Handling Examples"
echo ""
echo "Invalid request (missing config):"
curl -s -X POST "${SERVICE_URL}/run" \
  -H "Content-Type: application/json" \
  -d '{}' 2>/dev/null | jq . || echo "Service not running"
echo ""

echo "Non-existent run:"
curl -s -X GET "${SERVICE_URL}/run/run_invalid" 2>/dev/null | jq . || echo "Service not running"
echo ""

echo "Queue full (submit 11 runs):"
echo "curl -X POST http://localhost:3001/run ... (repeat 11 times)"
echo ""
