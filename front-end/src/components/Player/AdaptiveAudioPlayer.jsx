import React, { useEffect, useState, useRef } from 'react';
import {
  Box,
  Typography,
  Button,
  CircularProgress,
  LinearProgress,
  Stack,
  Chip,
  Tooltip,
  Card,
  CardContent
} from '@mui/material';
import BandwidthDetector from '../../services/bandwidthDetector';

/**
 * Componente AdaptiveAudioPlayer
 * Reproductor de audio con streaming adaptativo
 * Ajusta automáticamente la calidad según el ancho de banda disponible
 */
const AdaptiveAudioPlayer = ({ track, isPlaying, onPlayPause, volume = 1.0 }) => {
  const audioRef = useRef(new Audio());
  const [streamInfo, setStreamInfo] = useState(null);
  const [currentQuality, setCurrentQuality] = useState('medium');
  const [bandwidth, setBandwidth] = useState(null);
  const [bufferedPercent, setBufferedPercent] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [autoQuality, setAutoQuality] = useState(true);
  const [error, setError] = useState(null);
  const qualityChangeTimeoutRef = useRef(null);

  /**
   * Cargar información de streaming cuando cambia el track
   */
  useEffect(() => {
    if (!track) return;

    const loadStreamInfo = async () => {
      try {
        setError(null);
        setIsLoading(true);
        
        const response = await fetch(
          `/api/streaming/track/${track.id}/info`
        );
        
        if (!response.ok) {
          throw new Error(`Error ${response.status} loading stream info`);
        }

        const data = await response.json();
        
        if (data.success) {
          setStreamInfo(data.track);
          setCurrentQuality('medium');
          setError(null);
        } else {
          throw new Error(data.error || 'Failed to load stream info');
        }
      } catch (error) {
        console.error('[AdaptiveAudioPlayer] Error loading stream info:', error);
        setError(error.message);
        setStreamInfo(null);
      } finally {
        setIsLoading(false);
      }
    };

    loadStreamInfo();

    return () => {
      if (qualityChangeTimeoutRef.current) {
        clearTimeout(qualityChangeTimeoutRef.current);
      }
    };
  }, [track?.id]);

  /**
   * Detector de ancho de banda y selección automática de calidad
   */
  useEffect(() => {
    if (!streamInfo) return;

    const handleQualityChange = (quality, bw) => {
      setBandwidth(bw.toFixed(2));
      
      if (autoQuality && streamInfo.streamVariants[quality]) {
        // Esperar un poco antes de cambiar calidad para evitar cambios frecuentes
        if (qualityChangeTimeoutRef.current) {
          clearTimeout(qualityChangeTimeoutRef.current);
        }

        qualityChangeTimeoutRef.current = setTimeout(() => {
          if (quality !== currentQuality) {
            changeQuality(quality);
          }
        }, 3000); // Esperar 3 segundos antes de cambiar
      }
    };

    const unsubscribe = BandwidthDetector.subscribe(handleQualityChange);

    // Detección inicial de ancho de banda
    BandwidthDetector.detectBandwidth().then(bw => {
      setBandwidth(bw.toFixed(2));
      const quality = BandwidthDetector.selectQuality(bw);
      if (streamInfo.streamVariants[quality]) {
        setCurrentQuality(quality);
      }
    });

    return () => {
      unsubscribe();
      if (qualityChangeTimeoutRef.current) {
        clearTimeout(qualityChangeTimeoutRef.current);
      }
    };
  }, [streamInfo, autoQuality]);

  /**
   * Actualizar volumen del audio
   */
  useEffect(() => {
    audioRef.current.volume = Math.max(0, Math.min(1, volume || 0.5));
  }, [volume]);

  /**
   * Cambiar calidad de streaming
   */
  const changeQuality = (quality) => {
    if (!streamInfo?.streamVariants[quality]) {
      console.warn(`[AdaptiveAudioPlayer] Calidad no disponible: ${quality}`);
      return;
    }

    const currentTimeValue = audioRef.current.currentTime;
    const wasPlaying = !audioRef.current.paused;

    console.log(`[AdaptiveAudioPlayer] Cambiando a ${quality} (${currentTimeValue}s)`);

    // Cambiar la fuente
    audioRef.current.src = streamInfo.streamVariants[quality].url;
    audioRef.current.currentTime = currentTimeValue;

    if (wasPlaying) {
      audioRef.current.play().catch(e => {
        console.error('[AdaptiveAudioPlayer] Error al reproducir después de cambio de calidad:', e);
      });
    }

    setCurrentQuality(quality);
    setError(null);
  };

  /**
   * Monitorear progreso del buffer
   */
  useEffect(() => {
    const audio = audioRef.current;
    
    const handleProgress = () => {
      if (audio.buffered.length > 0) {
        const bufferedEnd = audio.buffered.end(audio.buffered.length - 1);
        const percent = audio.duration ? (bufferedEnd / audio.duration) * 100 : 0;
        setBufferedPercent(Math.min(100, percent));
      }
    };

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
    };

    const handleLoadedMetadata = () => {
      setDuration(audio.duration);
      setIsLoading(false);
    };

    const handleCanPlay = () => {
      setIsLoading(false);
      setError(null);
    };

    const handleWaiting = () => {
      setIsLoading(true);
    };

    const handleError = (e) => {
      const errorMsg = `Error de reproducción: ${audio.error?.message || 'Unknown error'}`;
      console.error('[AdaptiveAudioPlayer]', errorMsg);
      setError(errorMsg);
    };

    audio.addEventListener('progress', handleProgress);
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('canplay', handleCanPlay);
    audio.addEventListener('waiting', handleWaiting);
    audio.addEventListener('error', handleError);

    return () => {
      audio.removeEventListener('progress', handleProgress);
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('canplay', handleCanPlay);
      audio.removeEventListener('waiting', handleWaiting);
      audio.removeEventListener('error', handleError);
    };
  }, []);

  /**
   * Controlar reproducción
   */
  useEffect(() => {
    if (!streamInfo || !currentQuality) return;

    const audio = audioRef.current;
    
    if (isPlaying) {
      audio.play().catch(e => {
        console.error('[AdaptiveAudioPlayer] Error al reproducir:', e);
      });
    } else {
      audio.pause();
    }
  }, [isPlaying, streamInfo, currentQuality]);

  /**
   * Formatear tiempo en MM:SS
   */
  const formatTime = (seconds) => {
    if (!seconds || isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  /**
   * Obtener color según calidad
   */
  const getQualityColor = (quality) => {
    const colors = {
      low: 'warning',
      medium: 'info',
      high: 'success',
      hq: 'primary'
    };
    return colors[quality] || 'default';
  };

  /**
   * Renderizar estado vacío
   */
  if (!track) {
    return (
      <Card sx={{ maxWidth: '600px', mx: 'auto', mt: 2 }}>
        <CardContent>
          <Typography color="textSecondary" align="center">
            Selecciona una canción para reproducir
          </Typography>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card sx={{ maxWidth: '600px', mx: 'auto', mt: 2 }}>
      <CardContent>
        <audio ref={audioRef} crossOrigin="anonymous" />

        {/* Track Info */}
        <Box sx={{ mb: 2 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 'bold' }}>
            {track?.title || 'No track selected'}
          </Typography>
          <Typography variant="caption" color="textSecondary">
            Por: {track?.artist || 'Unknown'}
          </Typography>
        </Box>

        {/* Error Display */}
        {error && (
          <Box sx={{ mb: 2, p: 1.5, backgroundColor: '#ffebee', borderRadius: 1 }}>
            <Typography variant="caption" sx={{ color: '#c62828' }}>
              ⚠️ {error}
            </Typography>
          </Box>
        )}

        {/* Streaming Info */}
        {streamInfo && (
          <Box sx={{ mb: 2, p: 1.5, backgroundColor: '#f5f5f5', borderRadius: 1 }}>
            {/* Status Chips */}
            <Stack direction="row" spacing={1} sx={{ mb: 1.5, flexWrap: 'wrap' }}>
              <Chip
                label={`${currentQuality.toUpperCase()}`}
                color={getQualityColor(currentQuality)}
                size="small"
                variant="outlined"
              />
              <Chip
                label={`${bandwidth || '0'} Mbps`}
                size="small"
                variant="outlined"
              />
              <Tooltip title={autoQuality ? 'Cambio automático habilitado' : 'Cambio automático deshabilitado'}>
                <Chip
                  label={autoQuality ? 'Auto ON' : 'Auto OFF'}
                  onClick={() => setAutoQuality(!autoQuality)}
                  size="small"
                  color={autoQuality ? 'primary' : 'default'}
                  variant={autoQuality ? 'filled' : 'outlined'}
                />
              </Tooltip>
            </Stack>

            {/* Buffer Progress */}
            <Box sx={{ mb: 1.5 }}>
              <Typography variant="caption" sx={{ fontSize: '0.7rem', color: '#666' }}>
                Buffer: {Math.round(bufferedPercent)}%
              </Typography>
              <LinearProgress
                variant="determinate"
                value={bufferedPercent}
                sx={{
                  height: 6,
                  backgroundColor: '#e0e0e0',
                  borderRadius: 1,
                  '& .MuiLinearProgress-bar': {
                    backgroundColor: '#1DA0C3'
                  }
                }}
              />
            </Box>

            {/* Quality Selector */}
            <Box sx={{ mb: 1.5 }}>
              <Typography variant="caption" sx={{ fontSize: '0.7rem', display: 'block', mb: 0.5 }}>
                Calidad disponible:
              </Typography>
              <Stack direction="row" spacing={0.5} sx={{ flexWrap: 'wrap' }}>
                {Object.entries(streamInfo.streamVariants || {}).map(([quality, info]) => (
                  <Tooltip key={quality} title={`${info.bitrate} - ${info.description}`}>
                    <Button
                      size="small"
                      variant={currentQuality === quality ? 'contained' : 'outlined'}
                      onClick={() => changeQuality(quality)}
                      sx={{
                        fontSize: '0.65rem',
                        py: 0.25,
                        px: 0.75,
                        minWidth: 'auto',
                        textTransform: 'uppercase'
                      }}
                    >
                      {quality}
                    </Button>
                  </Tooltip>
                ))}
              </Stack>
            </Box>

            {/* File Size Info */}
            <Box sx={{ mb: 1 }}>
              <Typography variant="caption" sx={{ fontSize: '0.65rem', color: '#999' }}>
                Tamaño actual: {streamInfo.streamVariants[currentQuality]?.fileSize 
                  ? (streamInfo.streamVariants[currentQuality].fileSize / 1024 / 1024).toFixed(1) + ' MB'
                  : 'N/A'}
              </Typography>
            </Box>
          </Box>
        )}

        {/* Time Display */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1.5 }}>
          <Typography variant="caption">
            {formatTime(currentTime)}
          </Typography>
          <Typography variant="caption">
            {formatTime(duration)}
          </Typography>
        </Box>

        {/* Loading Indicator */}
        {isLoading && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
            <CircularProgress size={20} />
            <Typography variant="caption">Buffering...</Typography>
          </Box>
        )}

        {/* Debug Info (solo en desarrollo) */}
        {process.env.NODE_ENV === 'development' && streamInfo && (
          <Box sx={{ mt: 2, p: 1, backgroundColor: '#f0f0f0', borderRadius: 1, fontSize: '0.7rem' }}>
            <Typography variant="caption" sx={{ display: 'block', color: '#666' }}>
              DEBUG: {track.id} | Variantes: {Object.keys(streamInfo.streamVariants || {}).length}
            </Typography>
          </Box>
        )}
      </CardContent>
    </Card>
  );
};

export default AdaptiveAudioPlayer;
