# Use Node.js 22 for the Codex generation worker
FROM node:22-alpine

# Set working directory
WORKDIR /app

# Prisma needs OpenSSL available in Alpine-based images.
RUN apk add --no-cache openssl

# Copy package files and install dependencies
COPY backend/package*.json ./
RUN npm install

# Copy source files
COPY backend/ .
COPY docs/operations/narrative-author-context-pack-20260906/malagueta-oneshot.md /docs/operations/narrative-author-context-pack-20260906/
COPY docs/operations/narrative-plaza-mayor-reference-20260905.md /docs/operations/
COPY docs/tours/regla-editorial-fechas-audioguias.md /docs/tours/

# Build the application
RUN npm run build

# Expose port
EXPOSE 3001

# Set environment variables for development
ENV NODE_ENV=development \
    PORT=3001 \
    LLM_SERVICE_URL=http://llm-pod:3002 \
    VERIFICATION_SERVICE_URL=http://verification-pod:3003 \
    DESCRIPTION_SERVICE_URL=http://description-pod:3004 \
    TTS_SERVICE_URL=http://tts-pod:3005 \
    SUPABASE_SERVICE_URL=http://supabase-pod:3006

# Start the application
CMD ["node", "dist/server.js"]
