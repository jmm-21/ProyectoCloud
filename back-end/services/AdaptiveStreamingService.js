const fs = require('fs');
const path = require('path');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');

// Configurar ffmpeg
ffmpeg.setFfmpegPath(ffmpegPath);

// Rutas base
const MUSIC_FILES_PATH = path.join(__dirname, '../music');
const STREAM_VARIANTS_PATH = path.join(MUSIC_FILES_PATH, 'variants');

/**
 * Configuración de variantes de calidad
 * Basada en típico consumo de datos en streaming
 */
const QUALITY_VARIANTS = {
  low: {
    bitrate: '64k',
    audioCodec: 'aac',
    description: 'Conexión lenta (2G/3G)'
  },
  medium: {
    bitrate: '128k',
    audioCodec: 'aac',
    description: 'Conexión estándar (4G)'
  },
  high: {
    bitrate: '192k',
    audioCodec: 'aac',
    description: 'Buena conexión (4G LTE/WiFi)'
  },
  hq: {
    bitrate: '320k',
    audioCodec: 'aac',
    description: 'Conexión WiFi de alta velocidad'
  }
};

class AdaptiveStreamingService {
  /**
   * Genera todas las variantes de calidad para un track
   * @param {string} inputPath - Ruta del archivo original
   * @param {string} trackId - ID único del track
   * @param {string} trackTitle - Título del track para logging
   * @returns {Promise<Object>} - Objeto con URLs de las variantes
   */
  async generateVariants(inputPath, trackId, trackTitle) {
    // Verificar que el archivo de entrada existe
    if (!fs.existsSync(inputPath)) {
      throw new Error(`Archivo de entrada no encontrado: ${inputPath}`);
    }

    // Crear directorio para esta pista si no existe
    const trackVariantsDir = path.join(STREAM_VARIANTS_PATH, String(trackId));
    if (!fs.existsSync(trackVariantsDir)) {
      fs.mkdirSync(trackVariantsDir, { recursive: true });
    }

    const variants = {};
    const conversionPromises = [];

    // Generar cada variante en paralelo
    for (const [quality, config] of Object.entries(QUALITY_VARIANTS)) {
      const outputPath = path.join(trackVariantsDir, `${quality}.m4a`);
      
      const conversionPromise = new Promise((resolve, reject) => {
        // Saltar si ya existe
        if (fs.existsSync(outputPath)) {
          console.log(`[AdaptiveStreaming] Variante ${quality} ya existe para ${trackTitle}`);
          const fileSize = fs.statSync(outputPath).size;
          variants[quality] = {
            url: `/assets/music/variants/${trackId}/${quality}.m4a`,
            bitrate: config.bitrate,
            fileSize: fileSize,
            description: config.description
          };
          resolve();
          return;
        }

        ffmpeg(inputPath)
          .audioBitrate(config.bitrate)
          .audioCodec(config.audioCodec)
          .audioChannels(2)
          .audioFrequency(44100)
          .output(outputPath)
          .on('start', () => {
            console.log(`[AdaptiveStreaming] Generando variante ${quality} para: ${trackTitle}`);
          })
          .on('end', () => {
            const fileSize = fs.statSync(outputPath).size;
            variants[quality] = {
              url: `/assets/music/variants/${trackId}/${quality}.m4a`,
              bitrate: config.bitrate,
              fileSize: fileSize,
              description: config.description
            };
            console.log(`[AdaptiveStreaming] ✓ ${quality.toUpperCase()} completado (${(fileSize / 1024 / 1024).toFixed(2)}MB)`);
            resolve();
          })
          .on('error', (err) => {
            console.error(`[AdaptiveStreaming] Error en ${quality}: ${err.message}`);
            reject(err);
          })
          .run();
      });

      conversionPromises.push(conversionPromise);
    }

    // Esperar a que todas las conversiones terminen
    try {
      await Promise.all(conversionPromises);
    } catch (error) {
      console.error(`[AdaptiveStreaming] Error generando variantes para ${trackTitle}:`, error.message);
      throw error;
    }

    return variants;
  }

  /**
   * Obtiene las variantes existentes para un track
   */
  async getVariants(trackId) {
    const trackVariantsDir = path.join(STREAM_VARIANTS_PATH, String(trackId));
    
    if (!fs.existsSync(trackVariantsDir)) {
      return null;
    }

    const variants = {};
    
    for (const quality of Object.keys(QUALITY_VARIANTS)) {
      const variantPath = path.join(trackVariantsDir, `${quality}.m4a`);
      
      if (fs.existsSync(variantPath)) {
        const fileSize = fs.statSync(variantPath).size;
        variants[quality] = {
          url: `/assets/music/variants/${trackId}/${quality}.m4a`,
          bitrate: QUALITY_VARIANTS[quality].bitrate,
          fileSize: fileSize,
          description: QUALITY_VARIANTS[quality].description
        };
      }
    }

    return Object.keys(variants).length > 0 ? variants : null;
  }

  /**
   * Limpia las variantes antiguas (data lifecycle)
   * @param {string} trackId - ID del track
   * @param {number} maxAgeDays - Edad máxima en días
   */
  async cleanupOldVariants(trackId, maxAgeDays = 90) {
    const trackVariantsDir = path.join(STREAM_VARIANTS_PATH, String(trackId));
    
    if (!fs.existsSync(trackVariantsDir)) {
      return;
    }

    const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000;
    const now = Date.now();

    const files = fs.readdirSync(trackVariantsDir);
    
    for (const file of files) {
      const filePath = path.join(trackVariantsDir, file);
      const stats = fs.statSync(filePath);
      const age = now - stats.mtimeMs;

      if (age > maxAgeMs) {
        fs.unlinkSync(filePath);
        console.log(`[AdaptiveStreaming] Variante antigua eliminada: ${file}`);
      }
    }
  }

  /**
   * Elimina todas las variantes de un track
   * @param {string} trackId - ID del track
   */
  async deleteAllVariants(trackId) {
    const trackVariantsDir = path.join(STREAM_VARIANTS_PATH, String(trackId));
    
    if (fs.existsSync(trackVariantsDir)) {
      fs.rmSync(trackVariantsDir, { recursive: true, force: true });
      console.log(`[AdaptiveStreaming] Todas las variantes del track ${trackId} eliminadas`);
    }
  }

  /**
   * Obtiene estadísticas de un variante
   */
  async getVariantStats(trackId, quality) {
    const variantPath = path.join(STREAM_VARIANTS_PATH, String(trackId), `${quality}.m4a`);
    
    if (!fs.existsSync(variantPath)) {
      return null;
    }

    const stats = fs.statSync(variantPath);
    
    return {
      trackId,
      quality,
      fileSize: stats.size,
      fileSizeGB: (stats.size / 1024 / 1024 / 1024).toFixed(4),
      fileSizeMB: (stats.size / 1024 / 1024).toFixed(2),
      createdAt: stats.birthtime,
      lastAccessedAt: stats.atime,
      lastModifiedAt: stats.mtime,
      bitrate: QUALITY_VARIANTS[quality]?.bitrate
    };
  }
}

module.exports = new AdaptiveStreamingService();
