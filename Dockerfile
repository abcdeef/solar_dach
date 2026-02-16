FROM node:25-alpine

# Arbeitsverzeichnis
WORKDIR /usr/src/app

# Nur package.json kopieren und Abhängigkeiten installieren (ohne Lockfile)
COPY package*.json ./
RUN npm install --production

# Applikationsdateien kopieren
COPY . .

# Umgebungsvariable und Port
ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

# Startbefehl
CMD ["node", "server.js"]
