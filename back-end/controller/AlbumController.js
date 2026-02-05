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

// Configuración de rutas físicas en el servidor
const MUSIC_FILES_PATH = path.join(process.cwd(), 'assets', 'music');
const IMAGES_FILES_PATH = path.join(process.cwd(), 'assets', 'images');

class AlbumController {
  
  // Método estático para normalizar URLs y que el reproductor no de 404
  static fixAlbumUrls(album, baseUrl) {
    if (!album) return;
    
    const base = baseUrl.replace(/\/+$/, '');

    // Corrección de imagen de portada
    if (album.coverImage && !album.coverImage.startsWith('http')) {
      let imgPath = album.coverImage;
      if (!imgPath.startsWith('/assets')) {
        imgPath = imgPath.startsWith('/') ? `/assets${imgPath}` : `/assets/${imgPath}`;
      }
      album.coverImage = `${base}${imgPath}`;
    }

    // Corrección de cada track
    if (album.tracks && Array.isArray(album.tracks)) {
      album.tracks.forEach(track => {
        if (track.url && !track.url.startsWith('http')) {
          let trackPath = track.url;
          if (!trackPath.startsWith('/assets')) {
            trackPath = trackPath.startsWith('/') ? `/assets${trackPath}` : `/assets/${trackPath}`;
          }
          track.url = `${base}${trackPath}`;
        }
      });
    }
  }

  async getAlbums(req, res) {
    try {
      const albums = await AlbumDao.getAlbums();
      const baseUrl = process.env.BASE_URL || `https://proyectocloud-5.onrender.com`;

      await Promise.all(albums.map(async album => {
        // Lógica de Populate de Artista manual
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
      AlbumController.fixAlbumUrls(album, baseUrl);

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
      res.status(500).json({ error: error.message });
    }
  }
  
  async createAlbum(req, res) {
    try {
      const albumData = req.body;
      
      if (!albumData.artistId) {
        return res.status(400).json({ success: false, error: 'Se requiere artistId' });
      }
      
      let artistIdValue = albumData.artistId;
      
      // Limpieza profunda de artistId (Regex para MongoDB IDs)
      if (typeof artistIdValue === 'string') {
        const idMatch = artistIdValue.match(/[a-f0-9]{24}/i);
        if (idMatch) artistIdValue = idMatch[0];
      } else if (typeof artistIdValue === 'object' && artistIdValue._id) {
        artistIdValue = artistIdValue._id.toString();
      }
      
      if (!mongoose.Types.ObjectId.isValid(artistIdValue)) {
        return res.status(400).json({ success: false, error: `ID de artista no válido: ${artistIdValue}` });
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
      
      // Limpieza de campos temporales antes de ir a Factory
      const { trackTitles, trackDurations, trackAutors, artistName, artistId, ...cleanData } = albumData;

      const albumEntity = AlbumFactory.createAlbum(cleanData);
      const newAlbum = await AlbumDao.createAlbum(albumEntity);
        
      const artist = await Artist.findById(cleanData.artist);
      if (artist) {
        artist.albums.push(newAlbum._id);
        await artist.save();
      }
        
      AlbumController.fixAlbumUrls(newAlbum, baseUrl);

      res.status(201).json({ 
        success: true, 
        message: 'Álbum creado exitosamente', 
        album: new AlbumDTO(newAlbum) 
      });
    } catch (error) {
      console.error('Error en createAlbum:', error);
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
      const trackId = req.query.trackId;
            
      if (!['mp3', 'wav', 'flac'].includes(format)) {
        return res.status(400).json({ error: 'Formato inválido' });
      }
      
      let album = await AlbumDao.getAlbumById(id);
      if (!album) return res.status(404).json({ error: 'Álbum no encontrado' });
      
      let track = album.tracks.find(t => String(t.id) === String(trackId));
      if (!track) return res.status(404).json({ error: 'Pista no encontrada' });

      // Extraer nombre de archivo desde la URL guardada
      const filename = path.basename(track.url);
      const audioPath = path.join(MUSIC_FILES_PATH, filename);

      // Lógica de Ciclo de Vida: Si no existe en disco, restaurar
      if (!fs.existsSync(audioPath)) {
          console.log(`[ALERTA] Restaurando archivo desde el servicio de ciclo de vida: ${filename}`);
          await lifecycleService.restoreTrack(album._id, track.id);
      }

      track.lastAccessed = new Date();
      await album.save(); 
            
      const safeTrackTitle = track.title.replace(/[\/\\:*?"<>|]/g, '_');
      
      if (!fs.existsSync(audioPath)) {
        return res.status(404).json({ error: 'El archivo físico no está disponible' });
      }
      
      if (format === 'mp3' && audioPath.toLowerCase().endsWith('.mp3')) {
        return res.download(audioPath, `${safeTrackTitle}.mp3`);
      }
      
      const tempDir = os.tmpdir();
      const outputPath = path.join(tempDir, `${safeTrackTitle}-${Date.now()}.${format}`);
      
      try {
        await audioConverter.convertAudio(audioPath, outputPath, format);
        return res.download(outputPath, `${safeTrackTitle}.${format}`, (err) => {
          if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
        });
      } catch (err) {
        res.status(500).json({ error: 'Error en la conversión de audio' });
      }
      
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
  
  async downloadAlbum(req, res) {
    try {
      const { id } = req.params;
      const format = req.query.format || 'mp3';
            
      const album = await AlbumDao.getAlbumById(id);
      if (!album || !album.tracks || album.tracks.length === 0) {
        return res.status(404).json({ error: 'Álbum no encontrado o sin pistas' });
      }
      
      const safeAlbumTitle = album.title.replace(/[\/\\:*?"<>|]/g, '_');
      const tempDir = path.join(os.tmpdir(), `album-${id}-${Date.now()}`);
      await fs.promises.mkdir(tempDir, { recursive: true });
      
      const conversionPromises = album.tracks.map(async (track) => {
        const filename = path.basename(track.url);
        const audioPath = path.join(MUSIC_FILES_PATH, filename);
        
        if (!fs.existsSync(audioPath)) return;
        
        const outputPath = path.join(tempDir, `${track.title.replace(/[\/\\:*?"<>|]/g, '_')}.${format}`);
        
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
      
      output.on('close', () => {
        res.download(zipPath, `${safeAlbumTitle}.zip`, (err) => {
          if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
          fs.rmSync(tempDir, { recursive: true, force: true });
        });
      });
      
      archive.on('error', (err) => { throw err; });
      archive.pipe(output);
      archive.directory(tempDir, false);
      archive.finalize();
        
    } catch (error) {
      res.status(500).json({ error: 'Error al procesar el ZIP del álbum', details: error.message });
    }
  }
}

module.exports = new AlbumController();