const NewsDAO = require('../model/dao/NewsDAO');
const NewsFactory = require('../model/factory/NewsFactory');
const NewsDTO = require('../model/dto/NewsDTO');

class NewsController {
    // Crea una noticia
    async createNews(req, res) {
        try {
            const newsData = req.body;
            const baseUrl = process.env.BASE_URL || `https://proyectocloud-5.onrender.com`;

            // Si subes una imagen en la creación
            if (req.file) {
                newsData.image = `/assets/images/${req.file.filename}`;
            }

            const newsInstance = NewsFactory.createNews(newsData);
            const createdNews = await NewsDAO.createNews(newsInstance);
            
            // Aplicar URL completa al DTO de respuesta
            const dto = new NewsDTO(createdNews);
            if (dto.image && dto.image.startsWith('/assets')) {
                dto.image = `${baseUrl}${dto.image}`;
            }

            return res.status(201).json(dto);
        } catch (error) {
            return res.status(500).json({ error: `Error al crear la noticia: ${error.message}` });
        }
    }

    // Obtiene todas las noticias
    async getNews(req, res) {
        try {
            const newsList = await NewsDAO.getNews();
            const baseUrl = process.env.BASE_URL || `https://proyectocloud-5.onrender.com`;

            const newsDTOList = newsList.map(news => {
                // Convertimos a DTO usando tu Factory
                const dto = NewsFactory.createNewsDTO(news);
                
                // Si la noticia tiene imagen y es ruta relativa, le pegamos la base
                if (dto.image && dto.image.startsWith('/assets')) {
                    dto.image = `${baseUrl}${dto.image}`;
                }
                return dto;
            });

            return res.status(200).json(newsDTOList);
        } catch (error) {
            return res.status(500).json({ error: `Error al obtener las noticias: ${error.message}` });
        }
    }

    // Obtiene una noticia por id
    async getNewsById(req, res) {
        try {
            const { id } = req.params;
            const news = await NewsDAO.getNewsById(id);
            if (!news) {
                return res.status(404).json({ error: 'Noticia no encontrada' });
            }

            const baseUrl = process.env.BASE_URL || `https://proyectocloud-5.onrender.com`;
            const dto = NewsFactory.createNewsDTO(news);

            // Corregir URL de la imagen en el detalle
            if (dto.image && dto.image.startsWith('/assets')) {
                dto.image = `${baseUrl}${dto.image}`;
            }

            return res.status(200).json(dto);
        } catch (error) {
            return res.status(500).json({ error: `Error al obtener la noticia con id ${req.params.id}: ${error.message}` });
        }
    }

    // Actualiza una noticia
    async updateNews(req, res) {
        try {
            const { id } = req.params;
            const newsData = req.body;
            const updatedNews = await NewsDAO.updateNews(id, newsData);
            if (!updatedNews) {
                return res.status(404).json({ error: 'Noticia no encontrada' });
            }
            
            const baseUrl = process.env.BASE_URL || `https://proyectocloud-5.onrender.com`;
            const dto = NewsFactory.createNewsDTO(updatedNews);
            
            if (dto.image && dto.image.startsWith('/assets')) {
                dto.image = `${baseUrl}${dto.image}`;
            }

            return res.status(200).json(dto);
        } catch (error) {
            return res.status(500).json({ error: `Error al actualizar la noticia con id ${req.params.id}: ${error.message}` });
        }
    }

    // Elimina una noticia
    async deleteNews(req, res) {
        try {
            const { id } = req.params;
            const deletedNews = await NewsDAO.deleteNews(id);
            if (!deletedNews) {
                return res.status(404).json({ error: 'Noticia no encontrada' });
            }
            return res.status(200).json({ message: 'Noticia eliminada correctamente' });
        } catch (error) {
            return res.status(500).json({ error: `Error al eliminar la noticia con id ${req.params.id}: ${error.message}` });
        }
    }
}

module.exports = new NewsController();