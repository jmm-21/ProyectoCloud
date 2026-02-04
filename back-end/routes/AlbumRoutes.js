const express = require('express');
const router = express.Router();
const AlbumController = require('../controller/AlbumController');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Definir rutas para los assets
// Usar rutas locales dentro del backend para compatibilidad con Docker
const imageDir = path.join(__dirname, '../public/assets/images');
const musicDir = path.join(__dirname, '../music');

// Asegurar que existan
if (!fs.existsSync(imageDir)) fs.mkdirSync(imageDir, { recursive: true });
if (!fs.existsSync(musicDir)) fs.mkdirSync(musicDir, { recursive: true });

// Configuración mejorada de multer
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    if (file.fieldname === 'coverImage') {
      cb(null, imageDir);
    } else if (file.fieldname === 'tracks') {
      cb(null, musicDir);
    }
  },
  filename: function (req, file, cb) {
    // Sanitizar el nombre del archivo
    const cleanName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    // Añadir timestamp para evitar colisiones
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + '-' + cleanName);
  },
});

// Agregar validación de tipos de archivo y límites
const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB máximo por archivo
  },
  fileFilter: function (req, file, cb) {
    if (file.fieldname === 'coverImage') {
      // Solo permitir imágenes
      if (!file.mimetype.startsWith('image/')) {
        return cb(new Error('Solo se permiten imágenes para la portada'));
      }
    } else if (file.fieldname === 'tracks') {
      // Solo permitir archivos de audio
      if (!file.mimetype.startsWith('audio/')) {
        return cb(new Error('Solo se permiten archivos de audio para las pistas'));
      }
    }
    cb(null, true);
  }
});

router.post(
  '/',
  upload.fields([
    { name: 'coverImage', maxCount: 1 },
    { name: 'tracks', maxCount: 10 },
  ]),
  AlbumController.createAlbum
);

router.get('/test-archive/:albumId/:trackId', async (req, res) => {
    try {
        const { albumId, trackId } = req.params;
        const lifecycleService = require('../services/LifeCycleService');
        await lifecycleService.archiveTrack(albumId, trackId);
        res.status(200).json({ message: "Éxito: Archivo movido a la capa fría (DB)." });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/', AlbumController.getAlbums);
router.get('/:id', AlbumController.getAlbumById);
router.put('/:id', AlbumController.updateAlbum);
router.delete('/:id', AlbumController.deleteAlbum);
router.post('/:id/rate', AlbumController.addRating);
router.get('/:id/download', AlbumController.downloadTrack);
router.get('/:id/download-album', AlbumController.downloadAlbum);

module.exports = router;