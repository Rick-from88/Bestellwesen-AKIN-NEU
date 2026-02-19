FROM node:18-alpine AS build
WORKDIR /app

# install deps
COPY package*.json ./
RUN npm ci --production=false

# copy sources and build
COPY . .
RUN npm run build

FROM node:18-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

# only production deps
COPY package*.json ./
RUN npm ci --production=true

# copy built app and static files
COPY --from=build /app/dist ./dist
COPY --from=build /app/public ./public
COPY --from=build /app/package.json ./package.json

EXPOSE 3000
CMD ["node", "dist/app.js"]
