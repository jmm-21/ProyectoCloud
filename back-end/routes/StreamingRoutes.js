const express = require('express');
const router = express.Router();
const Album = require('../model/models/Album');
const AdaptiveStreamingService = require('../services/AdaptiveStreamingService');

/**
 * Obtener información de streaming para un track específico
 * GET /api/streaming/track/:trackId/info
 */
router.get('/track/:trackId/info', async (req, res) => {
  try {
    const { trackId } = req.params;
    
    // Buscar el track en todos los álbumes
    const albums = await Album.find({ 'tracks.id': parseInt(trackId) });
    
    if (albums.length === 0) {
      return res.status(404).json({ 
        success: false,
        error: 'Track no encontrado' 
      });
    }

    const album = albums[0];
    const track = album.tracks.find(t => t.id === parseInt(trackId));

    // Si no tiene variantes, intentar obtenerlas
    if (!track.streamVariants) {
      try {
        const variants = await AdaptiveStreamingService.getVariants(trackId);
        if (variants) {
          track.streamVariants = variants;
          await album.save();
        }
      } catch (error) {
        console.error('[StreamingRoutes] Error obteniendo variantes:', error.message);
      }
    }

    res.json({
      success: true,
      track: {
        id: track.id,
        title: track.title,
        duration: track.duration,
        originalUrl: track.url,
        streamVariants: track.streamVariants || {}
      }
    });
  } catch (error) {
    console.error('[StreamingRoutes] Error:', error);
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

/**
 * HLS Manifest para reproducción adaptativa
 * GET /api/streaming/track/:trackId/manifest.m3u8
 */
router.get('/track/:trackId/manifest.m3u8', async (req, res) => {
  try {
    const { trackId } = req.params;
    
    const albums = await Album.find({ 'tracks.id': parseInt(trackId) });
    
    if (albums.length === 0) {
      return res.status(404).send('Track no encontrado');
    }

    const track = albums[0].tracks.find(t => t.id === parseInt(trackId));
    const variants = track.streamVariants || {};

    // Generar manifest M3U8
    let manifest = '#EXTM3U\n';
    manifest += '#EXT-X-VERSION:3\n';
    manifest += '#EXT-X-TARGETDURATION:10\n';
    manifest += `#EXT-X-MEDIA-SEQUENCE:0\n`;

    // Agregar cada variante
    for (const [quality, info] of Object.entries(variants)) {
      const bitrate = info.bitrate.replace('k', '000');
      manifest += `#EXT-X-STREAM-INF:BANDWIDTH=${bitrate},CODECS="mp4a.40.2",RESOLUTION=800x600\n`;
      manifest += `${info.url}\n`;
    }

    manifest += '#EXT-X-ENDLIST\n';

    res.set({
      'Content-Type': 'application/vnd.apple.mpegurl',
      'Cache-Control': 'no-cache',
      // 'Access-Control-Allow-Origin': '*' // Eliminado: Deja que el middleware cors global lo maneje
    });
    res.send(manifest);
  } catch (error) {
    console.error('[StreamingRoutes] Error en manifest:', error);
    res.status(500).send('Error generando manifest');
  }
});

/**
 * Test de ancho de banda
 * GET /api/streaming/bandwidth-test
 */
router.get('/bandwidth-test', (req, res) => {
  try {
    const size = parseInt(req.query.size) || 512 * 1024; // 512KB default
    const buffer = Buffer.alloc(size);
    
    res.set({
      'Content-Type': 'application/octet-stream',
      'Content-Length': size,
      'Cache-Control': 'no-cache',
      // 'Access-Control-Allow-Origin': '*' // Eliminado: Deja que el middleware cors global lo maneje
    });
    
    res.send(buffer);
  } catch (error) {
    console.error('[StreamingRoutes] Error en bandwidth test:', error);
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

/**
 * Obtener estadísticas de variantes
 * GET /api/streaming/track/:trackId/stats
 */
router.get('/track/:trackId/stats', async (req, res) => {
  try {
    const { trackId } = req.params;
    
    const stats = {
      low: await AdaptiveStreamingService.getVariantStats(trackId, 'low'),
      medium: await AdaptiveStreamingService.getVariantStats(trackId, 'medium'),
      high: await AdaptiveStreamingService.getVariantStats(trackId, 'high'),
      hq: await AdaptiveStreamingService.getVariantStats(trackId, 'hq')
    };

    // Filtrar nulls
    const filteredStats = Object.fromEntries(
      Object.entries(stats).filter(([_, v]) => v !== null)
    );

    res.json({
      success: true,
      trackId,
      stats: filteredStats
    });
  } catch (error) {
    console.error('[StreamingRoutes] Error en stats:', error);
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

/**
 * Limpieza de variantes antiguas
 * POST /api/streaming/cleanup/:trackId
 */
router.post('/cleanup/:trackId', async (req, res) => {
  try {
    const { trackId } = req.params;
    const { daysThreshold = 90 } = req.body;

    await AdaptiveStreamingService.cleanupOldVariants(trackId, daysThreshold);

    res.json({
      success: true,
      message: `Variantes antiguas de track ${trackId} limpiadas (edad > ${daysThreshold} días)`
    });
  } catch (error) {
    console.error('[StreamingRoutes] Error en cleanup:', error);
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

module.exports = router;
