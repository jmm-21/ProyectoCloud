FROM node:18-alpine

WORKDIR /app

# 1. Copiamos los archivos de dependencias
COPY package*.json ./

# 2. Instalamos todas las dependencias
RUN npm install || npm install --legacy-peer-deps

# 3. Instalar un servidor ligero para producción (sirve la carpeta dist)
RUN npm install -g serve

# 4. Copiamos el resto del código del proyecto
COPY . .

# 5. Compilamos la aplicación para producción (genera la carpeta /app/dist)
RUN npm run build

# 6. Exponemos el puerto 8080 que espera vuestro Target Group de AWS
EXPOSE 8080

# 7. Arrancamos en modo producción sirviendo la carpeta 'dist' en el puerto 8080
CMD ["serve", "-s", "build", "-l", "8080"]