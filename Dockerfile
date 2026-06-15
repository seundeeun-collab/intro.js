FROM node:18-slim
WORKDIR /usr/src/app

# install dependencies first for better caching
COPY package.json package-lock.json* ./
RUN npm ci --only=production || npm install --only=production

COPY . .

EXPOSE 3000
ENV PORT=3000
CMD ["npm", "start"]
