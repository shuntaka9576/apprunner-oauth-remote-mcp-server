FROM node:20-slim AS build
WORKDIR /work

RUN mkdir -p /app

RUN apt-get update && apt-get install -y git && \
    git clone https://github.com/shuntaka9576/workers-oauth-provider.git && \
    cd workers-oauth-provider && \
    git checkout feature/add-storage && \
    npm install && \
    npm run build && \
    npm link .

COPY package.json package-lock.json ./app/
COPY server /work/app/server
RUN cd /work/app && npm ci

RUN cd /work/app && \
    npm link @cloudflare/workers-oauth-provider
RUN cd /work/app/server && \
    npm run build

FROM node:20-slim AS production
COPY --from=public.ecr.aws/awsguru/aws-lambda-adapter:0.8.4 /lambda-adapter /opt/extensions/lambda-adapter

WORKDIR /app

COPY --from=build /work/app/package.json /work/app/package-lock.json ./
COPY --from=build /work/app/server/package.json ./server/
RUN npm ci --only=production

COPY --from=build /work/app/server/dist ./server/dist

ENV NODE_ENV=production
ENV PORT 8080
EXPOSE $PORT

CMD ["node", "server/dist/index.js"]
