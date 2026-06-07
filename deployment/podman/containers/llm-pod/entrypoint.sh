#!/bin/bash
set -e

# Start Ollama in the background
ollama serve &

# Wait for Ollama to be ready
echo "Waiting for Ollama to start..."
until curl -s http://localhost:11434/api/generate > /dev/null; do
    sleep 1
done
echo "Ollama is ready"

# Start the Node.js application
echo "Starting Node.js application..."
node dist/server.js
