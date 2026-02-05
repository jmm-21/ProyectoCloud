const AlbumDao = require('../model/dao/AlbumDAO');
const AlbumDTO = require('../model/dto/AlbumDTO');
const AlbumFactory = require('../model/factory/AlbumFactory');
const { Artist } = require('../model/models/Artistas');
const path = require('path');
const fs = require('fs');
const os = require('os');
const archiver = require('archiver');
const axios = require('axios');
const audioConverter = require('../services/AudioConverterService');
const mongoose = require('mongoose');
const lifecycleService = require('../services/LifeCycleService');

// Usar rutas relativas para los archivos de música
const MUSIC_FILES_PATH = path.join(process.cwd(), 'music');

class AlbumController {
  
  // Función de ayuda estática para evitar problemas de contexto 'this'
  static fixAlbumUrls(album, baseUrl) {
    if (!album) return;
    
    // 1. Corregir imagen de portada
    if (album.coverImage && !album.coverImage.startsWith('http')) {
      const cleanPath = album.coverImage.startsWith('/') ? album.coverImage : `/${album.coverImage}`;
      album.coverImage = `${baseUrl}${cleanPath}`;
    }

    // 2. Corregir URLs de las canciones (tracks)
    if (album.tracks && Array.isArray(album.tracks)) {
      album.tracks.forEach(track => {
        if (track.url && !track.url.startsWith('http')) {
          const cleanPath = track.url.startsWith('/') ? track.url : `/${track.url}`;
          track.url = `${baseUrl}${cleanPath}`;
        }
      });
    }
  }

  async getAlbums(req, res) {
    try {
      const albums = await AlbumDao.getAlbums();
      const baseUrl = process.env.BASE_URL || `https://proyectocloud-5.onrender.com`;

      await Promise.all(albums.map(async album => {
        // --- Lógica de Populate de Artista ---
        if (album.artist && typeof album.artist === 'object' && album.artist._id) {
          try {
            const artistData = await Artist.findById(album.artist._id).select('name bandName profileImage');
            if (artistData) {
              album.artist.name = artistData.name || artistData.bandName || 'Unknown Artist';
              album.artist.profileImage = artistData.profileImage;
            }
          } catch (err) {
            console.warn(`Error poblando artista para álbum ${album._id}: ${err.message}`);
          }
        }

        // --- CORRECCIÓN DE URLS (Usando método estático para evitar error de 'this') ---
        AlbumController.fixAlbumUrls(album, baseUrl);
      }));
      
      const albumDTOs = albums.map(album => new AlbumDTO(album));
      res.json(albumDTOs);
    } catch (error) {
      console.error("Error en getAlbums:", error);
      res.status(500).json({ error: error.message });
    }
  }

  async getAlbumById(req, res) {
    try {
      const { id } = req.params;
      const album = await AlbumDao.getAlbumById(id);
      if (!album) {
        return res.status(404).json({ error: 'Album not found' });
      }
      
      const baseUrl = process.env.BASE_URL || `https://proyectocloud-5.onrender.com`;

      // --- CORRECCIÓN DE URLS PARA EL DETALLE ---
      AlbumController.fixAlbumUrls(album, baseUrl);

      // Populate el objeto artist
      if (album.artist && typeof album.artist === 'object' && album.artist._id) {
        try {
          const artistData = await Artist.findById(album.artist._id).select('name bandName profileImage genre bio');
          if (artistData) {
            album.artist.name = artistData.name || artistData.bandName || 'Unknown Artist';
            album.artist.profileImage = artistData.profileImage;
            album.artist.genre = artistData.genre;
            album.artist.bio = artistData.bio;
          }
        } catch (err) {
          console.warn(`Error poblando artista para álbum ${id}: ${err.message}`);
        }
      }
      
      res.json(new AlbumDTO(album));
    } catch (error) {
      console.error("Error en getAlbumById:", error);
      res.status(500).json({ error: error.message });
    }
  }
  
  async createAlbum(req, res) {
    try {
      const albumData = req.body;
      
      if (!albumData.artistId) {
        return res.status(400).json({
          success: false,
          error: 'Se requiere el ID del artista (artistId)'
        });
      }
      
      let artistIdValue = albumData.artistId;
      
      if (typeof artistIdValue === 'string') {
        if (artistIdValue.includes('_id') && artistIdValue.includes('ObjectId')) {
          const matches = artistIdValue.match(/ObjectId\("([^"]+)"\)/);
          if (matches && matches[1]) {
            artistIdValue = matches[1];
          } else {
            const idMatches = artistIdValue.match(/"([a-f0-9]{24})"/);
            if (idMatches && idMatches[1]) {
              artistIdValue = idMatches[1];
            }
          }
        }
        
        if (artistIdValue.startsWith('{') && artistIdValue.includes('_id')) {
          try {
            const cleanedString = artistIdValue
              .replace(/([a-zA-Z0-9]+):/g, '"$1":')
              .replace(/'/g, '"');
            
            const objectIdMatch = cleanedString.match(/"_id"\s*:\s*(?:new ObjectId\()?["']([a-f0-9]{24})["']/i);
            if (objectIdMatch && objectIdMatch[1]) {
              artistIdValue = objectIdMatch[1];
            } else {
              const idMatch = cleanedString.match(/([a-f0-9]{24})/);
              if (idMatch) {
                artistIdValue = idMatch[1];
              }
            }
          } catch (e) {
            console.error('Error parseando objeto artistId:', e);
          }
        }
      } else if (typeof artistIdValue === 'object' && artistIdValue._id) {
        artistIdValue = artistIdValue._id.toString();
      }
      
      if (!mongoose.Types.ObjectId.isValid(artistIdValue)) {
        return res.status(400).json({
          success: false,
          error: `ID de artista no válido: "${artistIdValue}"`
        });
      }
      
      albumData.artist = new mongoose.Types.ObjectId(artistIdValue);
      albumData.price = parseFloat(albumData.price) || 9.99;
      albumData.releaseYear = parseInt(albumData.releaseYear) || new Date().getFullYear();
      albumData.vinyl = albumData.vinyl === 'true' || albumData.vinyl === true;
      albumData.cd = albumData.cd === 'true' || albumData.cd === true;
      albumData.cassettes = albumData.cassettes === 'true' || albumData.cassettes === true;
      albumData.destacado = albumData.destacado === 'true' || albumData.destacado === true;
      
      const baseUrl = process.env.BASE_URL || `https://proyectocloud-5.onrender.com`;

      if (req.files && req.files.coverImage && req.files.coverImage.length > 0) {
        albumData.coverImage = `/assets/images/${req.files.coverImage[0].filename}`;
      }
  
      if (req.files && req.files.tracks) {
        let trackTitles = albumData.trackTitles || [];
        let trackDurations = albumData.trackDurations || [];
        let trackAutors = albumData.trackAutors || [];
        
        if (!Array.isArray(trackTitles)) trackTitles = [trackTitles].filter(Boolean);
        if (!Array.isArray(trackDurations)) trackDurations = [trackDurations].filter(Boolean);
        if (!Array.isArray(trackAutors)) trackAutors = [trackAutors].filter(Boolean);
        
        albumData.tracks = req.files.tracks.map((file, index) => ({
          id: index + 1,
          title: (trackTitles[index] || file.originalname).trim(),
          duration: (trackDurations[index] || '0:00').trim(),
          url: `/assets/music/${file.filename}`,
          autor: (trackAutors[index] || albumData.artistName || 'Unknown').trim(),
          n_reproducciones: 0
        }));
      }
      
      delete albumData.trackTitles;
      delete albumData.trackDurations;
      delete albumData.trackAutors;
      delete albumData.artistName;
      
      try {
        const albumEntity = AlbumFactory.createAlbum(albumData);
        const newAlbum = await AlbumDao.createAlbum(albumEntity);
        
        const artist = await Artist.findById(albumData.artist);
        if (artist) {
          artist.albums.push(newAlbum._id);
          await artist.save();
        }
        
        delete albumData.artistId;
        
        // Corregir URLs
        AlbumController.fixAlbumUrls(newAlbum, baseUrl);

        res.status(201).json({ 
          success: true, 
          message: 'Álbum creado exitosamente', 
          album: new AlbumDTO(newAlbum) 
        });
      } catch (factoryError) {
        return res.status(400).json({ success: false, error: factoryError.message });
      }
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async updateAlbum(req, res) {
    try {
      const { id } = req.params;
      const albumData = req.body;
      const updatedAlbum = await AlbumDao.updateAlbum(id, albumData);
      if (!updatedAlbum) {
        return res.status(404).json({ error: 'Album not found' });
      }
      
      const baseUrl = process.env.BASE_URL || `https://proyectocloud-5.onrender.com`;
      AlbumController.fixAlbumUrls(updatedAlbum, baseUrl);
      
      res.json(new AlbumDTO(updatedAlbum));
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
  
  async deleteAlbum(req, res) {
    try {
      const { id } = req.params;
      const deletedAlbum = await AlbumDao.deleteAlbum(id);
      if (!deletedAlbum) {
        return res.status(404).json({ error: 'Album not found' });
      }
      res.json({ message: 'Album deleted successfully' });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
  
  async addRating(req, res) {
    try {
      const { id } = req.params;
      const { userId, rating, comment, profileImage } = req.body;
      const album = await AlbumDao.getAlbumById(id);
      if (!album) {
        return res.status(404).json({ success: false, error: 'Album not found' });
      }
      album.ratings.push({ userId, rating, comment, profileImage });
      await album.save();
      res.json({ success: true, album });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }
  
  async downloadTrack(req, res) {
    try {
      const { id } = req.params;
      const format = req.query.format || 'mp3';
      const trackIdParam = req.query.trackId;
      const trackId = !isNaN(trackIdParam) ? parseInt(trackIdParam) : trackIdParam;
            
      if (!['mp3', 'wav', 'flac'].includes(format)) {
        return res.status(400).json({ error: 'Formato no válido. Use mp3, wav o flac.' });
      }
      
      let album = await AlbumDao.getAlbumById(id);
      if (!album) return res.status(404).json({ error: 'Álbum no encontrado' });
      
      let track = album.tracks.find(t => String(t.id) === String(trackId));
      if (!track) return res.status(404).json({ error: 'Pista no encontrada' });

      if (track.isArchived) {
        await lifecycleService.restoreTrack(album._id, track.id); 
      }

      track.lastAccessed = new Date();
      await album.save(); 
            
      const urlParts = track.url.split('/');
      const filename = urlParts[urlParts.length - 1];
      const audioPath = path.join(MUSIC_FILES_PATH, filename);

      if (!fs.existsSync(audioPath)) {
          await lifecycleService.restoreTrack(album._id, track.id);
      }

      const safeTrackTitle = track.title.replace(/[\/\\:*?"<>|]/g, '_');
      
      if (!fs.existsSync(audioPath)) {
        return res.status(404).json({ error: 'Archivo no encontrado físicamente' });
      }
      
      if (format === 'mp3' && audioPath.toLowerCase().endsWith('.mp3')) {
        return res.download(audioPath, `${safeTrackTitle}.mp3`);
      }
      
      const tempDir = os.tmpdir();
      const outputPath = path.join(tempDir, `${track.title}-${Date.now()}.${format}`);
      
      try {
        await audioConverter.convertAudio(audioPath, outputPath, format);
        return res.download(outputPath, `${safeTrackTitle}.${format}`, (err) => {
          fs.unlink(outputPath, () => {});
        });
      } catch (conversionError) {
        return res.status(500).json({ error: 'Error al convertir el archivo' });
      }
      
    } catch (error) {
      res.status(500).json({ error: 'Error al procesar la descarga', details: error.message });
    }
  }
  
  async downloadAlbum(req, res) {
    try {
      const { id } = req.params;
      const format = req.query.format || 'mp3';
            
      const album = await AlbumDao.getAlbumById(id);
      if (!album || !album.tracks || album.tracks.length === 0) {
        return res.status(404).json({ error: 'Álbum no encontrado o vacío' });
      }
      
      const safeAlbumTitle = album.title.replace(/[\/\\:*?"<>|]/g, '_');
      const tempDir = path.join(os.tmpdir(), `album-${id}-${Date.now()}`);
      await fs.promises.mkdir(tempDir, { recursive: true });
      
      const conversionPromises = album.tracks.map(async (track) => {
        if (!track.url) return;
        
        const urlParts = track.url.split('/');
        const filename = urlParts[urlParts.length - 1];
        const audioPath = path.join(MUSIC_FILES_PATH, filename);
        
        if (!fs.existsSync(audioPath)) return;
        
        const outputPath = path.join(tempDir, `${track.title || `track-${track.id}`}.${format}`);
        
        if (format === 'mp3' && audioPath.toLowerCase().endsWith('.mp3')) {
          await fs.promises.copyFile(audioPath, outputPath);
        } else {
          await audioConverter.convertAudio(audioPath, outputPath, format);
        }
      });
      
      await Promise.allSettled(conversionPromises);
      
      const zipPath = path.join(os.tmpdir(), `${safeAlbumTitle}-${Date.now()}.zip`);
      const output = fs.createWriteStream(zipPath);
      const archive = archiver('zip', { zlib: { level: 9 } });
      
      output.on('close', function() {
        res.download(zipPath, `${safeAlbumTitle}.zip`, (err) => {
          fs.unlink(zipPath, () => {});
          fs.rm(tempDir, { recursive: true, force: true }, () => {});
        });
      });
      
      archive.on('error', (err) => { throw err; });
      archive.pipe(output);
      archive.directory(tempDir, false);
      archive.finalize();
        
    } catch (error) {
      res.status(500).json({ error: 'Error al procesar el álbum', details: error.message });
    }
  }
}

module.exports = new AlbumController();