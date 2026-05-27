FROM node:18-alpine

WORKDIR /app

# Copy package files first
COPY package*.json ./

# We run npm install dynamically during build
RUN npm install

# Copy everything else
COPY . .

EXPOSE 3001

CMD ["npm", "run", "dev"]
