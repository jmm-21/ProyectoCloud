use('undersounds'); // Selecciona la base de datos

// Borramos si existe algo previo para evitar errores de duplicado
db.getCollection('albums').deleteMany({ "title": "Prueba Cloud" });

// Insertamos con la sintaxis correcta
db.getCollection('albums').insertOne({
  "_id": ObjectId("67f5413809c9798c1b5b0d54"), // Usamos ObjectId() sin el $
  "title": "Prueba Cloud",
  "artist": "Gemini",
  "tracks": [
    {
      "id": 1,
      "title": "Cancion de Prueba",
      "url": "test.mp3",
      "isArchived": false,
      "lastAccessed": new Date() // Esto pone la fecha de hoy automáticamente
    }
  ]
});