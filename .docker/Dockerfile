FROM node:16-alpine
LABEL maintainer="Unique.Network"
RUN apk add --no-cache libc6-compat g++ make py3-pip
WORKDIR /src

COPY ./package.json .
COPY ./package-lock.json .

RUN npm install husky -g

RUN npm install --production

COPY . .

RUN npm run build


CMD ["npm", "run", "prod"]
