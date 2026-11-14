FROM node:20-bookworm-slim
# ffmpeg para extrair áudio e renderizar cortes; fontconfig+fontes para legenda queimada
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg fontconfig fonts-liberation fonts-dejavu-core ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json server.js ./
COPY lib ./lib
COPY public ./public
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8080 DATA_DIR=/data TRUST_PROXY=1 COOKIE_SECURE=1 TRANSCRIBE_PROVIDER=openai
VOLUME /data
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
USER node
CMD ["node", "server.js"]
