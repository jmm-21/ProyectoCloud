FROM node:18-slim

# Instalamos dependencias de compilación para Linux
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copiamos solo los archivos de dependencias primero
COPY package*.json ./

# Instalamos y forzamos la compilación de bcrypt en Linux
RUN npm install && npm rebuild bcrypt --build-from-source

COPY . .

EXPOSE 5000

CMD ["node", "server.js"]