require('dotenv').config();
const fs = require('fs');
const path = require('path');
const Album = require('./model/models/Album');
const AdaptiveStreamingService = require('./services/AdaptiveStreamingService');
const connectDB = require('./config/db');

const MUSIC_PATH = path.join(__dirname, 'music');

async function generateVariantsForAllTracks() {
  try {
    // Conectar a MongoDB
    console.log('📡 Conectando a MongoDB...');
    await connectDB();
    console.log('✅ MongoDB conectado\n');

    // Obtener todos los álbumes
    console.log('🎵 Obteniendo álbumes...');
    const albums = await Album.find();
    console.log(`✅ ${albums.length} álbumes encontrados\n`);

    let totalTracksProcessed = 0;
    let totalTracksSkipped = 0;

    // Procesar cada álbum
    for (const album of albums) {
      console.log(`\n📀 Procesando álbum: "${album.title}" (ID: ${album.id})`);
      console.log('=' .repeat(60));

      if (!album.tracks || album.tracks.length === 0) {
        console.log('⚠️  Sin pistas en este álbum\n');
        continue;
      }

      // Procesar cada track
      for (const track of album.tracks) {
        try {
          // Verificar si ya tiene variantes
          if (track.streamVariants && Object.keys(track.streamVariants).length > 0) {
            console.log(`⏭️  Track ${track.id} "${track.title}" ya tiene variantes, saltando...`);
            totalTracksSkipped++;
            continue;
          }

          // Construir ruta del archivo original
          const originalFile = track.url ? track.url.split('/').pop() : null;
          if (!originalFile) {
            console.log(`⚠️  Track ${track.id} sin URL, saltando...`);
            totalTracksSkipped++;
            continue;
          }

          const inputPath = path.join(MUSIC_PATH, originalFile);

          // Verificar que el archivo existe
          if (!fs.existsSync(inputPath)) {
            console.log(`❌ Archivo no encontrado: ${inputPath}`);
            totalTracksSkipped++;
            continue;
          }

          console.log(`\n  🎶 Track ${track.id}: "${track.title}"`);
          console.log(`  📁 Archivo: ${originalFile}`);

          // Generar variantes
          const variants = await AdaptiveStreamingService.generateVariants(
            inputPath,
            track.id,
            track.title
          );

          // Guardar variantes en el track
          track.streamVariants = variants;
          
          console.log(`  ✅ Variantes generadas: ${Object.keys(variants).length}`);
          Object.entries(variants).forEach(([quality, info]) => {
            console.log(`     - ${quality.toUpperCase()}: ${info.bitrate} (${(info.fileSize / 1024 / 1024).toFixed(2)}MB)`);
          });

          totalTracksProcessed++;
        } catch (err) {
          console.error(`  ❌ Error procesando track ${track.id}: ${err.message}`);
          totalTracksSkipped++;
        }
      }

      // Guardar álbum actualizado
      try {
        await album.save();
        console.log(`\n✅ Álbum "${album.title}" guardado en BD`);
      } catch (saveErr) {
        console.error(`❌ Error guardando álbum: ${saveErr.message}`);
      }
    }

    console.log('\n' + '=' .repeat(60));
    console.log('📊 RESUMEN DE GENERACIÓN:');
    console.log(`   ✅ Tracks procesados: ${totalTracksProcessed}`);
    console.log(`   ⏭️  Tracks saltados: ${totalTracksSkipped}`);
    console.log(`   📀 Álbumes totales: ${albums.length}`);
    console.log('=' .repeat(60));

    if (totalTracksProcessed > 0) {
      console.log('\n✨ ¡Generación de variantes completada!');
      console.log('🎵 Las canciones ahora pueden reproducirse en diferentes calidades.\n');
    } else {
      console.log('\n⚠️  No se generaron nuevas variantes.');
      console.log('💡 Todas las pistas ya tienen variantes o no se encontraron.\n');
    }

  } catch (error) {
    console.error('❌ Error fatal:', error.message);
    process.exit(1);
  }
}

// Ejecutar
generateVariantsForAllTracks();
