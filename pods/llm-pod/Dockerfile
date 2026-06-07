# Use Node.js 18 as base image
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install

# Copy source files
COPY . .

# Build the application
RUN npm run build

# Expose port
EXPOSE 3002

# Set environment variables
ENV NODE_ENV=development \
    PORT=3002 \
    OLLAMA_API_URL=http://host.docker.internal:11434 \
    OLLAMA_MODEL=llama3.2:latest

# Start the application
CMD ["node", "dist/server.js"]
