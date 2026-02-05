const ArtistDAO = require('../model/dao/ArtistDAO');
const ArtistDTO = require('../model/dto/ArtistDTO');
const ArtistaFactory = require('../model/factory/ArtistaFactory');

class ArtistController {
  async getArtists(req, res) {
    try {
      const artists = await ArtistDAO.getArtists();
      const baseUrl = process.env.BASE_URL || `https://proyectocloud-5.onrender.com`;

      // Mapeamos los artistas para corregir las URLs antes de enviarlos
      const processedArtists = artists.map(artist => {
        const artistObj = artist.toObject ? artist.toObject() : artist;

        // Corregir profileImage
        if (artistObj.profileImage && artistObj.profileImage.startsWith('/assets')) {
          artistObj.profileImage = `${baseUrl}${artistObj.profileImage}`;
        }
        // Corregir banner
        if (artistObj.banner && artistObj.banner.startsWith('/assets')) {
          artistObj.banner = `${baseUrl}${artistObj.banner}`;
        }
        
        return new ArtistDTO(artistObj);
      });

      res.json(processedArtists);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  async getArtistById(req, res) {
    try {
      const numericId = Number(req.params.id);
      const artist = await ArtistDAO.getArtistById(numericId);
      if (!artist) {
        return res.status(404).json({ error: 'Artista no encontrado' });
      }

      const baseUrl = process.env.BASE_URL || `https://proyectocloud-5.onrender.com`;
      const artistObj = artist.toObject ? artist.toObject() : artist;

      // Corregir URLs para el detalle del artista
      if (artistObj.profileImage && artistObj.profileImage.startsWith('/assets')) {
        artistObj.profileImage = `${baseUrl}${artistObj.profileImage}`;
      }
      if (artistObj.banner && artistObj.banner.startsWith('/assets')) {
        artistObj.banner = `${baseUrl}${artistObj.banner}`;
      }

      res.json(new ArtistDTO(artistObj));
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  async createArtist(req, res) {
    try {
      const artistData = req.body;
      // Usamos la variable de entorno para que sea consistente
      const baseUrl = process.env.BASE_URL || `https://proyectocloud-5.onrender.com`;
      
      if(req.files) {
        if (req.files.profileImage) {
          artistData.profileImage = `/assets/images/${req.files.profileImage[0].filename}`;
        }
        if (req.files.banner) {
          artistData.banner = `/assets/images/${req.files.banner[0].filename}`;
        }
      }
      
      const artistEntity = ArtistaFactory.createArtist(artistData);
      const newArtist = await ArtistDAO.createArtist(artistEntity);

      // Antes de responder, aplicamos la baseUrl al DTO para que el Front la vea bien
      const result = new ArtistDTO(newArtist);
      if (result.profileImage && result.profileImage.startsWith('/assets')) {
        result.profileImage = `${baseUrl}${result.profileImage}`;
      }
      if (result.banner && result.banner.startsWith('/assets')) {
        result.banner = `${baseUrl}${result.banner}`;
      }

      res.status(201).json({
        success : true,
        artista: result
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  // ... (updateArtist y deleteArtist pueden quedarse igual si no devuelven imágenes complejas)
  async updateArtist(req, res) {
    try {
      const numericId = Number(req.params.id);
      const artistData = req.body;
      const updatedArtist = await ArtistDAO.updateArtist(numericId, artistData);
      if (!updatedArtist) {
        return res.status(404).json({ error: 'Artista no encontrado' });
      }
      res.json(new ArtistDTO(updatedArtist));
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  async deleteArtist(req, res) {
    try {
      const numericId = Number(req.params.id);
      const deletedArtist = await ArtistDAO.deleteArtist(numericId);
      if (!deletedArtist) {
        return res.status(404).json({ error: 'Artista no encontrado' });
      }
      res.json({ message: 'Artista eliminado exitosamente' });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
}

module.exports = new ArtistController();