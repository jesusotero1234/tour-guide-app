# Use Node.js 18 as base image
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Prisma needs OpenSSL available in Alpine-based images.
RUN apk add --no-cache openssl

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install

# Copy source files
COPY . .

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
