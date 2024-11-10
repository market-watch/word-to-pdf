# Use official Node.js image as base image
FROM node:16-slim

# Install LibreOffice dependencies and LibreOffice (headless version)
RUN apt-get update && \
    apt-get install -y libreoffice libreoffice-common libreoffice-java-common \
    && apt-get clean;

# Set working directory in the container
WORKDIR /usr/src/app

# Copy the package.json files to install dependencies
COPY package*.json ./
RUN npm install

# Copy the rest of the application files
COPY . .

# Expose the port
EXPOSE 8080

# Command to run the app
CMD ["node", "server.js"]
