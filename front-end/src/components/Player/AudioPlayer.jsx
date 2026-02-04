import React, { useEffect, useRef, useContext, useState } from 'react';
import { Box, Slider, IconButton, Typography, CircularProgress, Tooltip } from '@mui/material';
import { useLocation } from 'react-router-dom';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import PauseIcon from '@mui/icons-material/Pause';
import SkipNextIcon from '@mui/icons-material/SkipNext';
import SkipPreviousIcon from '@mui/icons-material/SkipPrevious';
import VolumeUpIcon from '@mui/icons-material/VolumeUp';
import CancelIcon from '@mui/icons-material/Cancel';
import SettingsIcon from '@mui/icons-material/Settings';
import { PlayerContext } from '../../context/PlayerContext';
import axios from 'axios';

const AudioPlayer = () => {
  const { currentTrack, isPlaying, playTrack, pauseTrack, stopTrack, volume, changeVolume } = useContext(PlayerContext);
  const [progress, setProgress] = useState(0);
  const [isVisible, setIsVisible] = useState(true);
  const [duration, setDuration] = useState(0);
  const [quality, setQuality] = useState('medium');
  const [variants, setVariants] = useState(null);
  const [loadingVariants, setLoadingVariants] = useState(false);
  const [bandwidth, setBandwidth] = useState(null);
  const [showQualityMenu, setShowQualityMenu] = useState(false);
  const audioRef = useRef(new Audio());
  const location = useLocation();

  // Stop playback when leaving /album route
  useEffect(() => {
    if (!location.pathname.startsWith('/album')) {
      stopTrack();
      audioRef.current.pause();
      setProgress(0);
    }
  }, [location.pathname, stopTrack]);

  // Detect bandwidth once on mount
  useEffect(() => {
    const testBandwidth = async () => {
      try {
        const startTime = performance.now();
        const testSize = 1024 * 1024; // 1MB
        
        await axios.get(
          `${import.meta.env.VITE_API_URL}/api/streaming/bandwidth-test?size=${testSize}`,
          { withCredentials: true }
        );
        
        const endTime = performance.now();
        const duration = (endTime - startTime) / 1000;
        const mbps = (testSize * 8) / (duration * 1000000);
        
        setBandwidth(mbps);
        
        // Auto-select quality based on bandwidth
        if (mbps >= 8) setQuality('hq');
        else if (mbps >= 5) setQuality('high');
        else if (mbps >= 2) setQuality('medium');
        else setQuality('low');
      } catch (err) {
        console.warn('Bandwidth test failed, using default quality:', err);
        setQuality('medium');
      }
    };

    testBandwidth();
  }, []);

  // Fetch variants when track changes
  useEffect(() => {
    if (currentTrack && currentTrack.id) {
      setLoadingVariants(true);
      const fetchVariants = async () => {
        try {
          console.log('🎵 Fetching variants for track ID:', currentTrack.id);
          const response = await axios.get(
            `${import.meta.env.VITE_API_URL}/api/streaming/track/${currentTrack.id}/info`,
            { withCredentials: true }
          );
          
          console.log('📊 Full Variants response:', response.data.track);
          
          if (response.data.track.streamVariants && Object.keys(response.data.track.streamVariants).length > 0) {
            console.log('✅ Variants found:', Object.entries(response.data.track.streamVariants));
            setVariants(response.data.track.streamVariants);
            
            // Use variant URL if available
            if (response.data.track.streamVariants[quality]) {
              const variantUrl = response.data.track.streamVariants[quality].url;
              const fullUrl = variantUrl.startsWith('http') ? variantUrl : `${import.meta.env.VITE_API_URL}${variantUrl}`;
              console.log('🔊 Setting audio source to variant:', fullUrl);
              audioRef.current.src = fullUrl;
            } else {
              // Fallback to first available variant
              const firstVariant = Object.values(response.data.track.streamVariants)[0];
              if (firstVariant) {
                const variantUrl = firstVariant.url;
                const fullUrl = variantUrl.startsWith('http') ? variantUrl : `${import.meta.env.VITE_API_URL}${variantUrl}`;
                console.log('🔊 Setting audio source to first variant:', fullUrl);
                audioRef.current.src = fullUrl;
              } else if (currentTrack.url) {
                console.log('⚠️ No variants available, using original URL:', currentTrack.url);
                audioRef.current.src = currentTrack.url;
              }
            }
          } else {
            console.warn('⚠️ No streamVariants or empty, using original URL:', currentTrack.url);
            if (currentTrack.url) {
              audioRef.current.src = currentTrack.url;
              setVariants(null);
            }
          }
          
          setProgress(0);
          setDuration(0);
        } catch (err) {
          console.warn('❌ Error fetching variants:', err.message);
          console.log('🔊 Fallback: Using original URL:', currentTrack.url);
          if (currentTrack.url) {
            audioRef.current.src = currentTrack.url;
            setVariants(null);
          }
        } finally {
          setLoadingVariants(false);
        }
      };
      
      fetchVariants();
    }
  }, [currentTrack, quality]);

  // Update audio source when quality changes
  useEffect(() => {
    if (variants && variants[quality]) {
      const variantUrl = variants[quality].url;
      const fullUrl = variantUrl.startsWith('http') ? variantUrl : `${import.meta.env.VITE_API_URL}${variantUrl}`;
      console.log(`🔄 Cambiando a calidad ${quality}: ${fullUrl}`);
      
      audioRef.current.src = fullUrl;
      if (isPlaying) {
        audioRef.current.currentTime = 0;
        audioRef.current.play().catch(err => console.error('Play error:', err));
      }
    }
  }, [quality, variants]);

  // Show player when track is selected
  useEffect(() => {
    if (currentTrack) {
      setIsVisible(true);
    }
  }, [currentTrack]);

  // Update volume
  useEffect(() => {
    audioRef.current.volume = volume;
  }, [volume]);

  // Play or pause
  useEffect(() => {
    if (currentTrack) {
      if (isPlaying) {
        audioRef.current.play().catch(err => console.error('Play error:', err));
      } else {
        audioRef.current.pause();
      }
    }
  }, [isPlaying, currentTrack]);

  // Update progress every 500ms
  useEffect(() => {
    const interval = setInterval(() => {
      if (audioRef.current && isPlaying) {
        setProgress(audioRef.current.currentTime);
      }
    }, 500);
    return () => clearInterval(interval);
  }, [isPlaying]);

  // Handle metadata loaded
  useEffect(() => {
    const audio = audioRef.current;
    
    const handleLoadedMetadata = () => {
      setDuration(audio.duration);
    };

    const handleEnded = () => {
      pauseTrack();
      setProgress(0);
    };

    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('ended', handleEnded);
    };
  }, [pauseTrack]);

  const handleSliderChange = (e, newValue) => {
    audioRef.current.currentTime = newValue;
    setProgress(newValue);
  };

  const formatTime = (seconds) => {
    if (!seconds || isNaN(seconds)) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const handlePlayPause = () => {
    if (isPlaying) {
      pauseTrack();
    } else {
      playTrack(currentTrack);
    }
  };

  const handleSkipNext = () => {
    setProgress(0);
  };

  const handleSkipPrevious = () => {
    audioRef.current.currentTime = 0;
    setProgress(0);
  };

  const handleCancel = () => {
    pauseTrack();
    setIsVisible(false);
  };

  const getQualityColor = (q) => {
    switch (q) {
      case 'low':
        return '#ff9800';
      case 'medium':
        return '#2196f3';
      case 'high':
        return '#4caf50';
      case 'hq':
        return '#f44336';
      default:
        return '#757575';
    }
  };

  const getBandwidthLabel = () => {
    if (!bandwidth) return 'Detectando...';
    return `${bandwidth.toFixed(1)} Mbps`;
  };

  const inReproduction = location.pathname.startsWith('/album');
  const shouldShow = inReproduction && currentTrack && isVisible;

  return (
    <Box
      sx={{
        display: shouldShow ? 'flex' : 'none',
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        height: '90px',
        backgroundColor: '#282828',
        color: 'white',
        alignItems: 'center',
        padding: '0 20px',
        zIndex: 1000,
      }}
    >
      <audio ref={audioRef} />

      {/* Left: Track info */}
      <Box sx={{ display: 'flex', alignItems: 'center', width: '25%' }}>
        <img
          src={currentTrack?.coverImage || '/assets/images/default-cover.jpg'}
          alt={currentTrack?.title}
          style={{ height: '60px', width: '60px', marginRight: '15px', borderRadius: '4px' }}
        />
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 'bold', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {currentTrack?.title}
          </Typography>
          <Typography variant="caption" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {currentTrack?.artist}
          </Typography>
        </Box>
      </Box>

      {/* Center: Controls and progress */}
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '50%' }}>
        <Box sx={{ display: 'flex', alignItems: 'center' }}>
          <IconButton sx={{ color: 'white' }} onClick={handleSkipPrevious} size="small">
            <SkipPreviousIcon fontSize="small" />
          </IconButton>
          <IconButton sx={{ color: 'white' }} onClick={handlePlayPause}>
            {isPlaying ? <PauseIcon fontSize="large" /> : <PlayArrowIcon fontSize="large" />}
          </IconButton>
          <IconButton sx={{ color: 'white' }} onClick={handleSkipNext} size="small">
            <SkipNextIcon fontSize="small" />
          </IconButton>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', width: '100%' }}>
          <Typography variant="caption" sx={{ minWidth: '30px' }}>{formatTime(progress)}</Typography>
          <Slider
            min={0}
            max={duration || 0}
            value={progress}
            onChange={handleSliderChange}
            sx={{ color: 'white', mx: 1 }}
          />
          <Typography variant="caption" sx={{ minWidth: '30px' }}>{formatTime(duration)}</Typography>
        </Box>
      </Box>

      {/* Right: Quality selector, volume, and cancel */}
      <Box sx={{ display: 'flex', alignItems: 'center', width: '25%', justifyContent: 'flex-end', gap: 1 }}>
        {/* Quality selector */}
        {variants && Object.keys(variants).length > 0 && (
          <Tooltip title={`Calidad: ${quality.toUpperCase()}\nAncho de banda: ${getBandwidthLabel()}`}>
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                backgroundColor: getQualityColor(quality),
                padding: '4px 8px',
                borderRadius: '4px',
                cursor: 'pointer',
                '&:hover': { opacity: 0.8 },
              }}
              onClick={() => setShowQualityMenu(!showQualityMenu)}
            >
              {loadingVariants ? (
                <CircularProgress size={16} sx={{ color: 'white', mr: 0.5 }} />
              ) : (
                <SettingsIcon sx={{ fontSize: '16px', mr: 0.5 }} />
              )}
              <Typography variant="caption" sx={{ fontWeight: 'bold', minWidth: '40px' }}>
                {quality.toUpperCase()}
              </Typography>
            </Box>
          </Tooltip>
        )}

        {/* Quality menu */}
        {showQualityMenu && variants && (
          <Box
            sx={{
              position: 'absolute',
              bottom: '100px',
              right: '20px',
              backgroundColor: '#1a1a1a',
              border: '1px solid #444',
              borderRadius: '4px',
              padding: '8px 0',
              zIndex: 1001,
            }}
          >
            {Object.entries(variants).map(([q, info]) => (
              <Box
                key={q}
                onClick={() => {
                  setQuality(q);
                  setShowQualityMenu(false);
                }}
                sx={{
                  padding: '8px 16px',
                  cursor: 'pointer',
                  backgroundColor: quality === q ? getQualityColor(q) : 'transparent',
                  '&:hover': { backgroundColor: getQualityColor(q), opacity: 0.8 },
                }}
              >
                <Typography variant="caption">
                  {q.toUpperCase()} - {info.bitrate}
                </Typography>
              </Box>
            ))}
          </Box>
        )}

        {/* Volume */}
        <VolumeUpIcon sx={{ fontSize: '18px' }} />
        <Slider
          min={0}
          max={1}
          step={0.01}
          value={volume}
          onChange={(e, newValue) => changeVolume(newValue)}
          sx={{ width: '60px', color: 'white' }}
        />

        {/* Cancel */}
        <IconButton sx={{ color: 'white' }} onClick={handleCancel} size="small">
          <CancelIcon fontSize="small" />
        </IconButton>
      </Box>
    </Box>
  );
};

export default AudioPlayer;
