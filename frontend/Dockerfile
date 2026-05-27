FROM node:18-alpine

WORKDIR /app

# Copy package files first
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy everything else
COPY . .

EXPOSE 3000

CMD ["npm", "run", "dev"]
