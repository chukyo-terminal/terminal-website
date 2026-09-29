# ビルド環境
FROM node:krypton-trixie@sha256:f7d34e58713740f9eef9092c0bd6ff10369d132f7238399a4b270f16d47fa608 AS builder

WORKDIR /app

COPY package.json pnpm-*.yaml ./
RUN apt-get update && apt-get install -y libpq-dev python3 g++ make
RUN npm install -g pnpm
RUN pnpm install --frozen-lockfile

ENV PORT=3000

COPY . .

RUN pnpm run build


# 実行環境
FROM gcr.io/distroless/nodejs24-debian13:nonroot@sha256:1e2c4183b84122745dc2236b9b43bee09c54db091044d593eb8f755a954ad22a AS runner

WORKDIR /app

ENV PORT=3000

COPY --from=builder --chown=nonroot:nonroot /app/.next/standalone ./
COPY --from=builder --chown=nonroot:nonroot /app/.next/static ./.next/static
COPY --from=builder --chown=nonroot:nonroot /app/public ./public

USER nonroot
EXPOSE ${PORT}

CMD ["server.js"]
