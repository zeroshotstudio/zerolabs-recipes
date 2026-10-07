FROM node:22-alpine

WORKDIR /app

# Install curl for internal container healthchecks if needed
RUN apk add --no-cache curl

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

EXPOSE 3000

CMD ["node", "server.js"]
