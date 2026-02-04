FROM node:18-alpine

WORKDIR /app

ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL

# 1. Copiamos solo los archivos de configuración primero
COPY package*.json ./

# 2. Instalamos las dependencias (aquí es donde se instala vite)
RUN npm install || npm install --legacy-peer-deps

# 3. Copiamos el resto de los archivos del proyecto
COPY . .

# 4. Vite por defecto usa el puerto 5173, no el 3000
EXPOSE 5173

FROM node:18-alpine

WORKDIR /app

# Copiamos solo los json
COPY package*.json ./

# Forzamos la instalación y verificamos que se cree la carpeta
RUN npm install && ls node_modules/.bin/vite

# Copiamos el resto del código
COPY . .

# Exponemos el puerto
EXPOSE 5173

# Usamos 'npx' que es más inteligente para encontrar binarios
CMD ["npx", "vite", "--host", "0.0.0.0"]