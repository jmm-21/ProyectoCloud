require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const uri = process.env.MONGO_URI;
if (!uri) {
  console.error('Error: MONGO_URI no está definido en el archivo .env');
  process.exit(1);
}

// Directorio de exportación
const dataDumpPath = path.join(__dirname, 'data-dump');
// Archivo de metadata (compartido) que se usará para determinar las colecciones a importar
const dbmetaFile = path.join(__dirname, 'config', 'dbmeta.json');

// Se lee la metadata y se espera que tenga la propiedad "colecciones"
let collectionsToImport = [];
try {
  if (fs.existsSync(dbmetaFile)) {
    const data = fs.readFileSync(dbmetaFile, 'utf8');
    const meta = JSON.parse(data);
    // La propiedad "colecciones" debe ser un array con el nombre de las colecciones a importar
    collectionsToImport = meta.colecciones || [];
  } else {
    console.error(`El archivo de metadata "${dbmetaFile}" no existe.`);
    process.exit(1);
  }
} catch (err) {
  console.error(`Error leyendo ${dbmetaFile}:`, err);
  process.exit(1);
}

async function importCollections() {
  if (collectionsToImport.length === 0) {
    console.log('No hay colecciones definidas para importar.');
    return;
  }

  console.log('Conectando a MongoDB para importar datos...');
  await mongoose.connect(uri);
  const db = mongoose.connection.db;

  for (const col of collectionsToImport) {
    const inputFile = path.join(dataDumpPath, `${col}.json`);
    if (!fs.existsSync(inputFile)) {
      console.log(`Archivo ${col}.json no encontrado, saltando.`);
      continue;
    }

    console.log(`Importando colección: ${col}`);
    
    try {
      const fileContent = fs.readFileSync(inputFile, 'utf8');
      // Parseamos el JSON manejando los tipos extendidos de Mongo ($oid, $date)
      const data = JSON.parse(fileContent, (key, value) => {
        if (value && typeof value === 'object') {
          if (value.$oid) return new mongoose.Types.ObjectId(value.$oid);
          if (value.$date) return new Date(value.$date);
        }
        return value;
      });

      if (Array.isArray(data) && data.length > 0) {
        // Insertamos los datos usando el driver nativo a través de mongoose
        await db.collection(col).insertMany(data);
        console.log(`Importados ${data.length} documentos en ${col}`);
      }
    } catch (err) {
      console.error(`Error importando ${col}:`, err.message);
      throw err;
    }
  }
  
  console.log('Importación finalizada.');
  await mongoose.disconnect();
}

importCollections().catch((err) => {
  console.error('Error en la importación:', err);
  process.exit(1);
});