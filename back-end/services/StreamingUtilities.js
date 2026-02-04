const path = require('path');
const fs = require('fs');
const AdaptiveStreamingService = require('../services/AdaptiveStreamingService');

/**
 * Utilidades para el manejo de streaming adaptativo
 */
class StreamingUtilities {
  /**
   * Genera variantes adaptativas para un track
   * @param {string} fileUrl - URL del archivo 
   * @param {number} trackId - ID del track
   * @param {string} trackTitle - Título del track
   * @returns {Promise<Object|null>} - Variantes generadas o null si hay error
   */
  static async generateVariantsForTrack(fileUrl, trackId, trackTitle) {
    try {
      // Extraer el nombre del archivo de la URL
      const urlParts = fileUrl.split('/');
      const filename = urlParts[urlParts.length - 1];
      
      // Construir la ruta del archivo
      const MUSIC_FILES_PATH = path.join(process.cwd(), '..', 'undersounds-frontend', 'src', 'assets', 'music');
      const inputPath = path.join(MUSIC_FILES_PATH, filename);

      // Verificar que el archivo existe
      if (!fs.existsSync(inputPath)) {
        console.error(`[StreamingUtilities] Archivo no encontrado: ${inputPath}`);
        return null;
      }

      // Generar variantes
      const variants = await AdaptiveStreamingService.generateVariants(
        inputPath,
        trackId,
        trackTitle
      );

      return variants;
    } catch (error) {
      console.error(`[StreamingUtilities] Error generando variantes para ${trackTitle}:`, error.message);
      return null;
    }
  }

  /**
   * Genera variantes para todos los tracks de un álbum
   * @param {Object} album - Objeto de álbum con tracks
   * @returns {Promise<Object>} - Objeto con resultados por track
   */
  static async generateVariantsForAlbum(album) {
    const results = {};

    for (const track of album.tracks) {
      console.log(`[StreamingUtilities] Generando variantes para: ${track.title}`);
      
      const variants = await this.generateVariantsForTrack(
        track.url,
        track.id,
        track.title
      );

      if (variants) {
        track.streamVariants = variants;
        results[track.id] = {
          success: true,
          title: track.title,
          variants: Object.keys(variants)
        };
      } else {
        results[track.id] = {
          success: false,
          title: track.title,
          error: 'Failed to generate variants'
        };
      }
    }

    return results;
  }

  /**
   * Limpia variantes de un álbum completo
   * @param {Object} album - Objeto de álbum
   */
  static async cleanupAlbumVariants(album) {
    const results = {};

    for (const track of album.tracks) {
      try {
        await AdaptiveStreamingService.deleteAllVariants(track.id);
        results[track.id] = { success: true, title: track.title };
      } catch (error) {
        results[track.id] = { 
          success: false, 
          title: track.title, 
          error: error.message 
        };
      }
    }

    return results;
  }

  /**
   * Obtiene información de variantes de un álbum
   * @param {Object} album - Objeto de álbum
   * @returns {Promise<Object>} - Información de variantes
   */
  static async getAlbumVariantsInfo(album) {
    const info = {};

    for (const track of album.tracks) {
      const variants = await AdaptiveStreamingService.getVariants(track.id);
      
      if (variants) {
        info[track.id] = {
          title: track.title,
          variants: variants,
          variantCount: Object.keys(variants).length
        };
      }
    }

    return info;
  }
}

module.exports = StreamingUtilities;
