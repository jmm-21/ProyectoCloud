const MerchDAO = require('../model/dao/MerchandisingDAO');
const MerchFactory = require('../model/factory/MerchandisingFactory');
const MerchDTO = require('../model/dto/MerchandisingDTO');

const MerchandisingController = {
  // Obtener todos los productos
  async getAllMerch(req, res) {
    try {
      const merch = await MerchDAO.getAllMerch();
      const baseUrl = process.env.BASE_URL || `https://proyectocloud-5.onrender.com`;

      // Mapeamos para añadir la URL completa a las imágenes
      const processedMerch = merch.map(item => {
        const itemObj = item.toObject ? item.toObject() : item;
        if (itemObj.image && itemObj.image.startsWith('/assets')) {
          itemObj.image = `${baseUrl}${itemObj.image}`;
        }
        return itemObj;
      });

      res.status(200).json(processedArtists); // Nota: Asegúrate de que no prefieras usar MerchDTO aquí también
      // Si usas DTO sería: res.status(200).json(processedMerch.map(m => new MerchDTO(m)));
      res.status(200).json(processedMerch);
    } catch (error) {
      res.status(500).json({ message: 'Error al obtener el merchandising', error });
    }
  },

  // Obtener por tipo
  async getByType(req, res) {
    try {
      const type = parseInt(req.params.type);
      const merch = await MerchDAO.getBasicMerchByType(type);
      const baseUrl = process.env.BASE_URL || `https://proyectocloud-5.onrender.com`;

      const processedMerch = merch.map(item => {
        const itemObj = item.toObject ? item.toObject() : item;
        if (itemObj.image && itemObj.image.startsWith('/assets')) {
          itemObj.image = `${baseUrl}${itemObj.image}`;
        }
        return itemObj;
      });

      res.status(200).json(processedMerch);
    } catch (error) {
      res.status(500).json({ message: 'Error al obtener por tipo', error });
    }
  },

  // Obtener por artista
  async getByArtist(req, res) {
    try {
      const artistId = req.params.artistId;
      const merch = await MerchDAO.getByArtistId(artistId);
      const baseUrl = process.env.BASE_URL || `https://proyectocloud-5.onrender.com`;

      const processedMerch = merch.map(item => {
        const itemObj = item.toObject ? item.toObject() : item;
        if (itemObj.image && itemObj.image.startsWith('/assets')) {
          itemObj.image = `${baseUrl}${itemObj.image}`;
        }
        return itemObj;
      });

      res.status(200).json(processedMerch);
    } catch (error) {
      res.status(500).json({ message: 'Error al obtener por artista', error });
    }
  },

  // Crear nuevo
  async createMerch(req, res) {
    try {
      const merchData = { ...req.body };
      merchData.price = parseFloat(merchData.price); 
      merchData.type = parseInt(merchData.type); 
      merchData.artistId = parseInt(merchData.artistId); 

      if (req.file) {
        // Guardamos solo la ruta relativa en la DB
        merchData.image = `/assets/images/${req.file.filename}`;
      }

      const savedMerch = await MerchFactory.createMerch(merchData);
      const baseUrl = process.env.BASE_URL || `https://proyectocloud-5.onrender.com`;
      
      // Para la respuesta inmediata, añadimos la URL completa
      const result = new MerchDTO(savedMerch);
      if (result.image && result.image.startsWith('/assets')) {
        result.image = `${baseUrl}${result.image}`;
      }

      res.status(201).json({ 
        success: true,
        merchandising: result
      });
    } catch (error) {
      res.status(500).json({ message: 'Error al crear el merchandising', error });
    }
  },

  // Obtener un producto por ID
  async getById(req, res) {
    try {
      const id = req.params.id;
      const merch = await MerchDAO.getById(id);
      if (!merch) {
        return res.status(404).json({ message: 'Producto no encontrado XD' });
      }

      const baseUrl = process.env.BASE_URL || `https://proyectocloud-5.onrender.com`;
      const itemObj = merch.toObject ? merch.toObject() : merch;

      if (itemObj.image && itemObj.image.startsWith('/assets')) {
        itemObj.image = `${baseUrl}${itemObj.image}`;
      }

      res.status(200).json(itemObj);
    } catch (error) {
      res.status(500).json({
        message: `Error al obtener el producto por ID (${req.params.id})`,
        error: error.message
      });
    }
  }
};

module.exports = MerchandisingController;