// Importa el servicio al principio del archivo de rutas
const lifecycleService = require('../services/LifeCycleService');

// Añade esta ruta temporal
router.get('/test-archive/:albumId/:trackId', async (req, res) => {
    try {
        await lifecycleService.archiveTrack(req.params.albumId, req.params.trackId);
        res.send("¡Éxito! Canción movida a MongoDB y borrada del disco.");
    } catch (error) {
        res.status(500).send("Error: " + error.message);
    }
});