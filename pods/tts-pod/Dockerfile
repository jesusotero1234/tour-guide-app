# Base stage with Node.js and Python
FROM python:3.12-slim AS base
WORKDIR /app

# Install Node.js, npm, and Python dependencies
RUN apt-get update && \
    apt-get install -y \
    nodejs \
    npm \
    git \
    wget \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies and kokoro-tts
RUN pip install --no-cache-dir numpy torch soundfile && \
    pip install --no-cache-dir git+https://github.com/nazdridoy/kokoro-tts.git

# Copy package files
COPY package*.json ./

# Create directories
RUN mkdir -p models cache

# Development stage
FROM base AS development
ENV NODE_ENV=development
# Install ALL dependencies (including devDependencies) and necessary global packages
RUN npm install && \
    npm install -g ts-node-dev && \
    npm install --save-dev @types/express @types/cors @types/node

# Download model files for TTS
WORKDIR /app/models
RUN wget https://github.com/nazdridoy/kokoro-tts/releases/download/v1.0.0/voices-v1.0.bin && \
    wget https://github.com/nazdridoy/kokoro-tts/releases/download/v1.0.0/kokoro-v1.0.onnx

# Return to app directory and copy files
WORKDIR /app
COPY . .

# Set environment variables for development
ENV PORT=3005 \
    MODELS_PATH=/app/models \
    AUDIO_CACHE=/app/cache
EXPOSE 3005
CMD ["npm", "run", "dev"]

# Build stage for TypeScript
FROM base AS builder
# Install ALL dependencies needed for build
RUN npm install
COPY . .
RUN npm run build

# Production stage
FROM base AS production
ENV NODE_ENV=production
# Copy built files from builder stage
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package*.json ./
# Install only production dependencies
RUN npm ci --only=production

# Download model files for TTS
WORKDIR /app/models
RUN wget https://github.com/nazdridoy/kokoro-tts/releases/download/v1.0.0/voices-v1.0.bin && \
    wget https://github.com/nazdridoy/kokoro-tts/releases/download/v1.0.0/kokoro-v1.0.onnx

# Copy scripts and return to app directory
WORKDIR /app
COPY scripts ./scripts
RUN chmod +x ./scripts/*

# Set environment for production
ENV PORT=3005 \
    NODE_ENV=production \
    MODELS_PATH=/app/models \
    AUDIO_CACHE=/app/cache

EXPOSE 3005

# Default command for production stage
CMD ["node", "dist/server.js"]
