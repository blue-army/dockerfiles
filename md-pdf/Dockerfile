FROM node
LABEL maintainer="lucas-natraj"

RUN mkdir -p /tools && \
    mkdir -p /source

WORKDIR /tools
RUN npm install mdpdf && \
    cp /tools/node_modules/mdpdf/bin/index.js /tools/node_modules/mdpdf/bin/mdpdf && \
    chmod +x /tools/node_modules/mdpdf/bin/mdpdf
ENV PATH="/tools/node_modules/mdpdf/bin:${PATH}"
COPY style.css /tools/style.css

WORKDIR /source
ENTRYPOINT [ "mdpdf", "--style=/tools/style.css", "--border=10mm", "--debug=true" ]
