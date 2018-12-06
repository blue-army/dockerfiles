FROM node
LABEL maintainer="lucas-natraj"

RUN apt-get update && apt-get install -y \
    gconf-service libasound2 libatk1.0-0 libc6 libcairo2 libcups2 \
    libdbus-1-3 libexpat1 libfontconfig1 libgcc1 libgconf-2-4 libgdk-pixbuf2.0-0 \
    libglib2.0-0 libgtk-3-0 libnspr4 libpango-1.0-0 libpangocairo-1.0-0 \
    libstdc++6 libx11-6 libx11-xcb1 libxcb1 libxcomposite1 libxcursor1 \
    libxdamage1 libxext6 libxfixes3 libxi6 libxrandr2 libxrender1 libxss1 \
    libxtst6 ca-certificates fonts-liberation libappindicator1 libnss3 \
    lsb-release xdg-utils wget

RUN mkdir -p /tools && \
    mkdir -p /source

WORKDIR /tools

ADD package.json package-lock.json /tools/
RUN npm install

ADD . /tools/
RUN echo '#!/usr/bin/env node' | cat - index.js > md-pdf && \
    chmod +x /tools/md-pdf

ENV PATH="/tools:${PATH}"

WORKDIR /source
ENTRYPOINT [ "md-pdf" ]
