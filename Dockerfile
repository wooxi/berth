FROM node:24-alpine AS runtime
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN corepack enable pnpm && pnpm install --prod --ignore-scripts
COPY server ./server
COPY shared ./shared
COPY dist ./public
ENV NODE_ENV=production
EXPOSE 8080
CMD ["node", "--experimental-strip-types", "--no-warnings", "server/index.ts"]
