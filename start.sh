#!/usr/bin/env bash
set -e

echo "AfriKart Payment Service — start script"
echo "======================================="

# Copy env if not present
if [ ! -f .env ]; then
  echo "Creating .env from .env.example..."
  cp .env.example .env
  echo "⚠️  Edit .env with your sandbox credentials before running against hosted sandbox."
fi

# Check Node version
NODE_MAJOR=$(node -e "console.log(parseInt(process.version.slice(1)))" 2>/dev/null || echo "0")
if [ "$NODE_MAJOR" -lt 22 ]; then
  echo "Error: Node.js 22+ required (node:sqlite). Current: $(node --version)"
  exit 1
fi

# Install if needed
if [ ! -d node_modules ]; then
  echo "Installing dependencies..."
  npm install --ignore-scripts
fi

# Run tests first
echo "Running tests..."
npm test

echo ""
echo "Starting service..."
source .env 2>/dev/null || true
exec node --experimental-sqlite --import tsx/esm src/server.ts
