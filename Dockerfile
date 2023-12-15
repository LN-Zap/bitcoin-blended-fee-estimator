# Use an official Node.js runtime as a parent image
FROM node:20-alpine

# Create a non-root user
RUN adduser -D app

# Set the working directory to /app
WORKDIR /app

# Copy package.json and package-lock.json to the container
COPY package*.json ./

# Install app dependencies
RUN npm install --omit dev

# Copy the rest of the app source code to the container
COPY src src
COPY config config

# Change ownership of the app directory to the non-root user
RUN chown -R app:app /app

# Switch to the non-root user
USER app

# Expose env vars. These can be overridden at runtime.
ENV PORT=3000
ENV MEMPOOL_HOSTNAME=mempool.space
ENV MEMPOOL_FEE_MULTIPLIER=1.05

# Expose the port that the app is listening on
EXPOSE $PORT

# This lets Node.js dependencies know we are running in production mode.
ENV NODE_ENV production

# Start the app
CMD [ "node", "src/server.js" ]