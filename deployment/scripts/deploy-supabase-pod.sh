#!/bin/bash

# Exit on any error
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

echo "Deploying Supabase Integration Pod"
echo "=================================="

# Check for .env file
ENV_FILE="$PROJECT_ROOT/pods/supabase-pod/.env"
if [ ! -f "$ENV_FILE" ]; then
  echo "Error: .env file not found at $ENV_FILE"
  echo "Please create it from the .env.example template"
  exit 1
fi

# Build the container
echo "Building Supabase Integration Pod container..."
cd "$PROJECT_ROOT"
podman build \
  -t localhost/tour-guide-app/supabase-pod:latest \
  -f deployment/podman/containers/supabase-pod/Containerfile \
  .

# Stop existing container if it's running
echo "Stopping existing container if running..."
podman stop tour-guide-supabase-pod 2>/dev/null || true
podman rm tour-guide-supabase-pod 2>/dev/null || true

# Run the container
echo "Starting Supabase Integration Pod..."
podman run -d \
  --name tour-guide-supabase-pod \
  --env-file "$ENV_FILE" \
  -p 3006:3006 \
  --restart unless-stopped \
  localhost/tour-guide-app/supabase-pod:latest

echo "Supabase Integration Pod deployed successfully!"
echo "API available at http://localhost:3006"
echo "Health check: http://localhost:3006/health"
