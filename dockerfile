FROM node:20.12.1-alpine

# Set working directory
WORKDIR /Kamui

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy application files
COPY . .

# Expose port
EXPOSE 3000

# Set user for security
USER node

# Start application
CMD ["npm", "start"]