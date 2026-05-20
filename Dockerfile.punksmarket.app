FROM node:24-alpine AS base
RUN apk add --no-cache python3 make g++
RUN npm install -g corepack && corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

FROM base AS build
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY sdk/package.json ./sdk/
COPY punksmarket.app/package.json ./punksmarket.app/
RUN pnpm install --frozen-lockfile --filter @networked-art/punksmarket.app...

COPY sdk ./sdk
COPY punksmarket.app ./punksmarket.app

WORKDIR /app/sdk
RUN pnpm build

WORKDIR /app/punksmarket.app
RUN pnpm build

FROM node:24-alpine AS production
WORKDIR /app
COPY --from=build /app/punksmarket.app/.output/ ./

ENV HOST=0.0.0.0
EXPOSE 3000
CMD ["node", "/app/server/index.mjs"]
