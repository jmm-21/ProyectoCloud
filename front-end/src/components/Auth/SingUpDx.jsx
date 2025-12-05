import React, { useContext } from 'react';
import { Dialog, DialogTitle, DialogContent, DialogActions, Button, Grid, Divider, Typography } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { RegisterContext } from '../../context/RegisterContext';
import signupFan from '../../assets/images/icon-fans.svg';
import signupBand from '../../assets/images/icon-artists.svg';
import signupLabel from '../../assets/images/icon-labels.svg';

const SignUpDialog = ({ open, handleClose }) => {
  const { setRegisterType } = useContext(RegisterContext);
  const navigate = useNavigate();

  const handleRegisterClick = (type) => {
    setRegisterType(type);
    handleClose();
    navigate('/register');
  };

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      fullWidth
      maxWidth="sm"
      PaperProps={{
        sx: {
          display: 'flex',
          flexDirection: 'column',
          maxHeight: 'calc(100vh - 32px)'
        }
      }}
    >
      <DialogTitle 
        sx={{ 
          display: 'flex', 
          justifyContent: 'center', 
          alignItems: 'center', 
          fontSize: '24px', 
          fontWeight: 'bold'
        }}
      >
        Create your Undersounds account
      </DialogTitle>
      <DialogContent sx={{ flex: '1 1 auto', p: 2 }}>
        <Grid container spacing={2} sx={{ backgroundColor: '#FFFFFF', p: 2 }}>
          <Grid item xs={12}>
            <Grid container spacing={2}>
              <Grid item xs={6}>
                <img 
                  src={signupFan} 
                  alt="SignUp Fan Logo" 
                  style={{ height: '140px', borderRadius: '8px' }} // reduce height if necessary
                />
              </Grid>
              <Grid item xs={6}>
                <Button 
                  sx={{ 
                    mt: 2, 
                    p: 2, 
                    width: '100%', 
                    height: '30%', 
                    backgroundColor: '#FFFFFF', 
                    color: '#3bb1ce', 
                    borderColor: '#3bb1ce', 
                    borderWidth: 2 
                  }}
                  variant="outlined"  
                  onClick={() => handleRegisterClick('fan')}
                >
                  Sign up as a Fan
                </Button>
                <Typography variant="body2" sx={{ mt: 1 }}>
                  Sign up as a fan to follow your favorite artists and discover new music.
                </Typography>
              </Grid>
            </Grid>
          </Grid>
          <Divider sx={{ width: '100%', my: 2, backgroundColor: 'grey' }} />
          <Grid item xs={12}>
            <Grid container spacing={2}>
              <Grid item xs={6}>
                <img 
                  src={signupBand}
                  alt="SignUp Band Logo" 
                  style={{ height: '140px', borderRadius: '8px' }} 
                />
              </Grid>
              <Grid item xs={6}>
                <Button 
                  sx={{ 
                    mt: 2, 
                    p: 2, 
                    width: '100%', 
                    height: '30%', 
                    backgroundColor: '#FFFFFF', 
                    color: '#619728', 
                    borderColor: '#b9eb87', 
                    borderWidth: 2 
                  }}
                  variant="outlined" 
                  fullWidth 
                  onClick={() => handleRegisterClick('band')}
                >
                  Sign up as a Band
                </Button>
                <Typography variant="body2" sx={{ mt: 1 }}>
                  Sign up as a band to share your music and connect with your fans.
                </Typography>
              </Grid>
            </Grid>
          </Grid>
          <Divider sx={{ width: '100%', my: 2, backgroundColor: 'grey' }} />
          <Grid item xs={12}>
            <Grid container spacing={2}>
              <Grid item xs={6}>
                <img 
                  src={signupLabel} 
                  alt="SignUp Label Logo" 
                  style={{ height: '140px', borderRadius: '8px' }} 
                />
              </Grid>
              <Grid item xs={6}>
                <Button 
                  sx={{ 
                    mt: 2, 
                    p: 2, 
                    width: '100%', 
                    height: '30%', 
                    backgroundColor: '#FFFFFF', 
                    color: '#9911ff', 
                    borderColor: '#9911ff', 
                    borderWidth: 2 
                  }}
                  variant="outlined" 
                  fullWidth 
                  onClick={() => handleRegisterClick('label')}
                >
                  Sign up as a Record Label
                </Button>
                <Typography variant="body2" sx={{ mt: 1 }}>
                  Sign up as a record label to manage your artists and releases.
                </Typography>
              </Grid>
            </Grid>
          </Grid>
        </Grid>
      </DialogContent>
    </Dialog>
  );
};

export default SignUpDialog;