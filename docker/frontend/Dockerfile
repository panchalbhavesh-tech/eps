FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY frontend/package*.json ./

# Install dependencies
RUN npm install

# Copy application files
COPY frontend/ .

# Expose Vite port
EXPOSE 5173

# Start development server
CMD ["sh", "-c", "npm install && npm run dev -- --host"]
