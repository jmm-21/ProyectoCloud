/**
 * BandwidthDetector - Detección inteligente de ancho de banda
 * Monitorea la conexión del usuario y selecciona la calidad óptima
 */

export class BandwidthDetector {
  constructor() {
    this.measurements = [];
    this.currentQuality = 'medium';
    this.listeners = [];
    this.monitoringInterval = null;
    this.isMonitoring = false;
  }

  /**
   * Detecta el ancho de banda midiendo la descarga de un test
   * @returns {Promise<number>} Ancho de banda en Mbps
   */
  async detectBandwidth() {
    const testSize = 512 * 1024; // 512KB para test rápido
    const startTime = performance.now();

    try {
      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/api/streaming/bandwidth-test?size=${testSize}`,
        { 
          mode: 'cors',
          cache: 'no-store'
        }
      );
      
      if (!response.ok) {
        throw new Error(`Test failed with status ${response.status}`);
      }
      
      const blob = await response.blob();
      const endTime = performance.now();

      const timeSeconds = (endTime - startTime) / 1000;
      if (timeSeconds === 0) {
        return this.getAverageBandwidth();
      }

      const bandwidthMbps = (blob.size * 8) / (timeSeconds * 1024 * 1024);

      this.measurements.push(bandwidthMbps);
      
      // Mantener últimas 10 mediciones
      if (this.measurements.length > 10) {
        this.measurements.shift();
      }

      console.log(`[BandwidthDetector] Medición: ${bandwidthMbps.toFixed(2)} Mbps`);

      return this.getAverageBandwidth();
    } catch (error) {
      console.error('[BandwidthDetector] Error:', error);
      // Retornar promedio existente o default
      return this.getAverageBandwidth() || 2;
    }
  }

  /**
   * Obtiene el promedio de ancho de banda de las últimas mediciones
   * @returns {number} Promedio en Mbps
   */
  getAverageBandwidth() {
    if (this.measurements.length === 0) return 2;
    const sum = this.measurements.reduce((a, b) => a + b, 0);
    return sum / this.measurements.length;
  }

  /**
   * Selecciona la calidad basada en ancho de banda disponible
   * @param {number} bandwidthMbps - Ancho de banda en Mbps
   * @returns {string} Calidad seleccionada ('low', 'medium', 'high', 'hq')
   */
  selectQuality(bandwidthMbps) {
    let quality;
    
    if (bandwidthMbps < 0.5) {
      quality = 'low';      // 64 kbps - Muy lenta
    } else if (bandwidthMbps < 1.5) {
      quality = 'medium';   // 128 kbps - 3G/4G
    } else if (bandwidthMbps < 3) {
      quality = 'high';     // 192 kbps - 4G LTE
    } else {
      quality = 'hq';       // 320 kbps - WiFi
    }

    console.log(`[BandwidthDetector] Calidad seleccionada: ${quality} (${bandwidthMbps.toFixed(2)} Mbps)`);

    if (quality !== this.currentQuality) {
      this.currentQuality = quality;
      this.notifyListeners(quality, bandwidthMbps);
    }
    
    return quality;
  }

  /**
   * Suscribirse a cambios de calidad
   * @param {Function} callback - Función a ejecutar en cambios
   * @returns {Function} Función para desuscribirse
   */
  subscribe(callback) {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter(l => l !== callback);
    };
  }

  /**
   * Notifica a todos los listeners de cambios de calidad
   */
  notifyListeners(quality, bandwidth) {
    this.listeners.forEach(cb => {
      try {
        cb(quality, bandwidth);
      } catch (error) {
        console.error('[BandwidthDetector] Error en listener:', error);
      }
    });
  }

  /**
   * Inicia el monitoreo continuo de ancho de banda
   * @param {number} interval - Intervalo en ms entre detecciones
   */
  startMonitoring(interval = 15000) {
    if (this.isMonitoring) {
      console.warn('[BandwidthDetector] Monitoreo ya está activo');
      return;
    }

    this.isMonitoring = true;
    
    // Detección inicial
    this.detectBandwidth().then(bandwidth => {
      this.selectQuality(bandwidth);
    });

    // Monitoreo periódico
    this.monitoringInterval = setInterval(async () => {
      try {
        const bandwidth = await this.detectBandwidth();
        this.selectQuality(bandwidth);
      } catch (error) {
        console.error('[BandwidthDetector] Error en monitoreo:', error);
      }
    }, interval);

    console.log(`[BandwidthDetector] Monitoreo iniciado (intervalo: ${interval}ms)`);
  }

  /**
   * Detiene el monitoreo continuo
   */
  stopMonitoring() {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
      this.isMonitoring = false;
      console.log('[BandwidthDetector] Monitoreo detenido');
    }
  }

  /**
   * Obtiene información de debug
   * @returns {Object} Información de debug
   */
  getDebugInfo() {
    return {
      currentQuality: this.currentQuality,
      averageBandwidth: this.getAverageBandwidth().toFixed(2),
      measurements: this.measurements.map(m => m.toFixed(2)),
      listenersCount: this.listeners.length,
      isMonitoring: this.isMonitoring
    };
  }

  /**
   * Resetea todas las mediciones
   */
  reset() {
    this.measurements = [];
    this.currentQuality = 'medium';
    console.log('[BandwidthDetector] Detector reseteado');
  }
}

// Exportar instancia singleton
export default new BandwidthDetector();
