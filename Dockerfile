FROM node:24.14.0-bookworm-slim AS test
WORKDIR /app
COPY package.json ./
COPY src ./src
COPY public ./public
COPY client ./client
COPY test ./test
COPY scripts ./scripts
COPY docs ./docs
RUN node scripts/check.js && node --test

FROM node:24.14.0-bookworm-slim AS runtime
ENV NODE_ENV=production HOST=0.0.0.0 PORT=4330 DATABASE_PATH=/app/data/application.sqlite
WORKDIR /app
RUN mkdir -p /app/data && chown -R node:node /app
COPY --from=test --chown=node:node /app/package.json ./
COPY --from=test --chown=node:node /app/src ./src
COPY --from=test --chown=node:node /app/public ./public
COPY --from=test --chown=node:node /app/client ./client
COPY --from=test --chown=node:node /app/scripts ./scripts
USER node
EXPOSE 4330
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=3 CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "src/main.js"]
