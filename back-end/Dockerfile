FROM node:18-slim

# Instalamos dependencias de compilación para Linux
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Nos paramos en la carpeta de trabajo del contenedor
WORKDIR /app

# Copiamos el package.json (que ahora estará en la misma carpeta desde donde compilas)
COPY package*.json ./

# Instalamos las dependencias
RUN npm install && npm rebuild bcrypt --build-from-source

# Copiamos el resto del código del backend
COPY . .

EXPOSE 5000

# El comando de arranque limpio
CMD ["node", "server.js"]