FROM alpine

WORKDIR /app

RUN apk update && apk add --update --no-cache bash nodejs curl npm nano

RUN echo "export NODE_ENV=production" >> /root/.bashrc && echo "alias ll='ls -al'" >> /root/.bashrc

RUN npm install -g zx

RUN curl -o /usr/local/bin/akeyless https://akeyless-cli.s3.us-east-2.amazonaws.com/cli/latest/production/cli-linux-amd64 && chmod +x /usr/local/bin/akeyless && /usr/local/bin/akeyless --init

# Install app dependencies
# A wildcard is used to ensure both package.json AND package-lock.json are copied
# where available (npm@5+)
COPY package*.json /app/

RUN npm ci --only=production

# Bundle app source
COPY . /app/

CMD [ "./index.mjs" ]
