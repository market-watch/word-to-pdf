# Use official Node.js image as base image
FROM node:16-slim

# Install LibreOffice
RUN apt-get update && \
    apt-get install -y libreoffice && \
    apt-get clean;

# Set working directory in the container
WORKDIR /usr/src/app

# Copy the project files into the container
COPY package*.json ./
RUN npm install
COPY . .

# Expose the port
EXPOSE 8080

# Command to run the app
CMD ["node", "server.js"]
