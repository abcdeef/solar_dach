FROM --platform=$BUILDPLATFORM node:25-alpine AS deps

# Arbeitsverzeichnis
WORKDIR /usr/src/app

# Abhaengigkeiten auf der Build-Plattform installieren, damit kein emuliertes RUN noetig ist
COPY package*.json ./
RUN npm install --omit=dev

FROM node:25-alpine

# Arbeitsverzeichnis
WORKDIR /usr/src/app

COPY package*.json ./
COPY --from=deps /usr/src/app/node_modules ./node_modules

# Applikationsdateien kopieren
COPY . .

# Umgebungsvariable und Port
ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

# Startbefehl
CMD ["node", "server.js"]
