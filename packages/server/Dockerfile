# Grabby collector for a deployed site.
#
#   docker build -t grabby-server packages/server   (after `pnpm build`)
#   docker run -p 3456:3456 -v grabby-data:/data \
#     -e GRABBY_PUBLIC_KEY=pk_... -e GRABBY_ADMIN_TOKEN=sk_... \
#     -e GRABBY_ALLOWED_ORIGINS=https://your-site.com grabby-server
#
# Generate the keys with `npx @githumbi/grabby-server init`. The server
# refuses to start without all three.
FROM node:22-alpine

WORKDIR /app

RUN addgroup -S app && adduser -S app -G app \
    && mkdir -p /data \
    && chown -R app:app /app /data

COPY --chown=app:app package.json ./
# Only the MCP SDK and zod are runtime dependencies; the formatter is bundled.
# devDependencies are dropped first: they use pnpm's workspace: protocol.
RUN node -e "const f='package.json',p=require('./'+f);delete p.devDependencies;require('fs').writeFileSync(f,JSON.stringify(p))" \
    && npm install --omit=dev --ignore-scripts --no-audit --no-fund \
    && npm cache clean --force

COPY --chown=app:app dist/ ./dist/

ENV NODE_ENV=production \
    GRABBY_DATA_DIR=/data \
    GRABBY_PUBLIC=1 \
    GRABBY_HOST=0.0.0.0 \
    GRABBY_PORT=3456

EXPOSE 3456
VOLUME ["/data"]
USER app

HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:3456/health || exit 1

ENTRYPOINT ["node", "dist/cli.js"]
CMD ["start"]
