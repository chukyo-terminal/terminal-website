# ビルド環境
FROM node:krypton-trixie@sha256:dcc3e56b82427ddc3b91ca2b18499450d670fc58251d944e5107d8ef2899f841 AS builder

WORKDIR /app

COPY package.json pnpm-*.yaml ./
RUN apt-get update && apt-get install -y libpq-dev python3 g++ make
RUN npm install -g pnpm
RUN pnpm install --frozen-lockfile

ENV PORT=3000

COPY . .

RUN pnpm run build


# 実行環境
FROM gcr.io/distroless/nodejs24-debian13:nonroot@sha256:924918584d0e6793e578fc0e98b8b8026ae4ac2ccf2fea283bc54a7165441ccd AS runner

WORKDIR /app

ENV PORT=3000

COPY --from=builder --chown=nonroot:nonroot /app/.next/standalone ./
COPY --from=builder --chown=nonroot:nonroot /app/.next/static ./.next/static
COPY --from=builder --chown=nonroot:nonroot /app/public ./public

USER nonroot
EXPOSE ${PORT}

CMD ["server.js"]
