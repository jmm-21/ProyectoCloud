const fs = require('fs');
const path = require('path');
const AdaptiveStreamingService = require('./AdaptiveStreamingService');
const Album = require('../model/models/Album');
const cloudinary = require('cloudinary').v2;

console.log(process.env.CLOUDINARY_CLOUD_NAME)
cloudinary.config({ 
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME, 
  api_key: process.env.CLOUDINARY_API_KEY, 
  api_secret: process.env.CLOUDINARY_API_SECRET 
});

const CLOUDINARY_FOLDER = "proyecto_cloud";


// Ajusta esta ruta a la carpeta donde guardáis los MP3 reales
const STORAGE_PATH = path.join(__dirname, '../music'); 

const axios = require('axios'); // Añade esto arriba del todo para poder descargar

const restoreTrack = async (albumId, trackId) => {
    try {
        const album = await Album.findById(albumId);
        const track = album.tracks.find(t => String(t.id) === String(trackId));

        if (!track || !track.isArchived) {
            return console.log("La pista no está archivada o no existe.");
        }

        // 1. Preparamos el nombre del archivo y la ruta local
        // Extraemos el nombre real del archivo de la URL de Cloudinary
        const filename = track.url.split('/').pop(); 
        const STORAGE_PATH = path.join(process.cwd(), 'music');
        const filePath = path.join(STORAGE_PATH, filename);

        console.log("--- DEBUG RESTAURACIÓN ---");
        console.log("1. Descargando desde Cloudinary:", track.url);

        // 2. DESCARGA DEL ARCHIVO
        // Pedimos el archivo a la URL y lo recibimos como un "stream" (flujo de datos)
        const response = await axios({
            url: track.url,
            method: 'GET',
            responseType: 'stream'
        });

        // Creamos el archivo vacío en nuestro disco y volcamos los datos
        const writer = fs.createWriteStream(filePath);
        response.data.pipe(writer);

        // 3. Cuando termine de escribirse el archivo...
        return new Promise((resolve, reject) => {
            writer.on('finish', async () => {
                console.log("2. Archivo descargado con éxito en:", filePath);

                // 4. Actualizamos la base de datos
                track.isArchived = false;
                // Volvemos a poner la URL local (el nombre del archivo)
               const baseUrl = process.env.FRONTEND_URL || 'http://localhost:8080';
                track.url = `${baseUrl}/assets/music/${filename}`; 
                
                album.markModified('tracks');
                await album.save();

                console.log("3. ¡RESTAURACIÓN COMPLETADA!");
                resolve();
            });

            writer.on('error', (err) => {
                console.error("Error al escribir el archivo en disco:", err);
                reject(err);
            });
        });

    } catch (error) {
        console.error("ERROR durante la restauración desde Cloudinary:", error);
    }
};

const archiveTrack = async (albumId, trackId) => {
    // 1. Buscamos el álbum y la pista en la DB
    const album = await Album.findById(albumId);
    if (!album) return console.log("Error: No se encontró el álbum");

    const track = album.tracks.find(t => String(t.id) === String(trackId));
    if (!track) return console.log("Error: No se encontró la pista en la DB");

    // 2. Definimos la ruta donde está el archivo actualmente
    const STORAGE_PATH = path.join(process.cwd(), 'music');
    // Si track.url ya contiene el nombre del archivo, lo usamos directamente
    const filePath = path.join(STORAGE_PATH, track.url.split('/').pop());

    console.log("--- DEBUG ARCHIVADO CON CLOUDINARY ---");
    console.log("1. Buscando archivo local en:", filePath);
    
    if (fs.existsSync(filePath)) {
        try {
            console.log("2. Archivo encontrado. Subiendo a Cloudinary...");

            // 3. SUBIDA A LA NUBE (Reemplaza el guardado en binario)
            const result = await cloudinary.uploader.upload(filePath, {
                resource_type: "video", // Obligatorio para audio en Cloudinary
                folder: CLOUDINARY_FOLDER // La constante "proyecto_cloud" que definimos arriba
            });

            console.log("3. Subida exitosa. URL generada:", result.secure_url);

            // 4. Actualizamos los datos de la pista
            track.isArchived = true;
            track.url = result.secure_url;   // Ahora la URL apunta a Internet, no a tu disco
            track.binaryData = undefined;   // Vaciamos el binario para que la DB vuele
            
            album.markModified('tracks');
            await album.save();

            // 5. Borramos el archivo del servidor local
            fs.unlinkSync(filePath); 
            console.log("4. ¡ARCHIVO LOCAL BORRADO Y PROCESO COMPLETADO!");

        } catch (error) {
            console.error("ERROR durante la subida a Cloudinary:", error);
        }
    } else {
        console.log("2. ERROR: El archivo NO existe en la ruta física. No se puede subir.");
    }
};

/**
 * Limpia variantes adaptativas no accedidas recientemente
 * @param {number} daysThreshold - Días sin acceso antes de eliminar
 */
    const cleanupAdaptiveVariants = async (daysThreshold = 30) => {
    try {
        const albums = await Album.find({});
        let cleanedCount = 0;

        for (const album of albums) {
            for (const track of album.tracks) {
                try {
                    await AdaptiveStreamingService.cleanupOldVariants(track.id, daysThreshold);
                    cleanedCount++;
                } catch (error) {
                    console.error(`[LifeCycle] Error limpiando variantes de track ${track.id}:`, error.message);
                }
            }
        }

        console.log(`[LifeCycle] Variantes antiguas limpias: ${cleanedCount} tracks procesados`);
        return cleanedCount;
    } catch (error) {
        console.error('[LifeCycle] Error en limpieza de variantes:', error);
        return 0;
    }
};

/**
 * Elimina todas las variantes de un álbum
 */
const deleteAlbumVariants = async (albumId) => {
    try {
        const album = await Album.findById(albumId);
        
        if (!album) {
            throw new Error('Álbum no encontrado');
        }

        let deletedCount = 0;

        for (const track of album.tracks) {
            try {
                await AdaptiveStreamingService.deleteAllVariants(track.id);
                deletedCount++;
            } catch (error) {
                console.error(`[LifeCycle] Error eliminando variantes de track ${track.id}:`, error.message);
            }
        }

        console.log(`[LifeCycle] Variantes del álbum eliminadas: ${deletedCount} tracks`);
        return deletedCount;
    } catch (error) {
        console.error('[LifeCycle] Error eliminando variantes del álbum:', error);
        return 0;
    }
};

module.exports = {
    restoreTrack,
    archiveTrack,
    cleanupAdaptiveVariants,
    deleteAlbumVariants
};