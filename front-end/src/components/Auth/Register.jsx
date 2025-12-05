import React, { useState, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { RegisterContext } from '../../context/RegisterContext.jsx';
import { register } from '../../services/authService';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CssBaseline from '@mui/material/CssBaseline';
import FormControl from '@mui/material/FormControl';
import FormLabel from '@mui/material/FormLabel';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import Stack from '@mui/material/Stack';
import MuiCard from '@mui/material/Card';
import Alert from '@mui/material/Alert';
import { styled } from '@mui/material/styles';
import AppTheme from '../themes/AuthTheme/AuthTheme.jsx';

const Card = styled(MuiCard)(({ theme }) => ({
  display: 'flex',
  flexDirection: 'column',
  alignSelf: 'center',
  width: '100%',
  padding: theme.spacing(4),
  gap: theme.spacing(2),
  margin: 'auto',
  [theme.breakpoints.up('sm')]: {
    maxWidth: '450px',
  },
  boxShadow:
    'hsla(220, 30%, 5%, 0.05) 0px 5px 15px 0px, hsla(220, 25%, 10%, 0.05) 0px 15px 35px -5px',
  ...theme.applyStyles('dark', {
    boxShadow:
      'hsla(220, 30%, 5%, 0.5) 0px 5px 15px 0px, hsla(220, 25%, 10%, 0.08) 0px 15px 35px -5px',
  }),
}));

const SignUpContainer = styled(Stack)(({ theme }) => ({
  height: 'calc((1 - var(--template-frame-height, 0)) * 100dvh)',
  minHeight: '100%',
  padding: theme.spacing(2),
  [theme.breakpoints.up('sm')]: {
    padding: theme.spacing(4),
  },
  '&::before': {
    content: '""',
    display: 'block',
    position: 'absolute',
    zIndex: -1,
    inset: 0,
    backgroundImage:
      'radial-gradient(ellipse at 50% 50%, hsl(210, 100%, 97%), hsl(0, 0%, 100%))',
    backgroundRepeat: 'no-repeat',
    ...theme.applyStyles('dark', {
      backgroundImage:
        'radial-gradient(at 50% 50%, hsla(210, 100%, 16%, 0.5), hsl(220, 30%, 5%))',
    }),
  },
}));

const Register = (props) => {
  const { registerType } = useContext(RegisterContext);
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
    ...(registerType === 'band' && { bandName: '', genre: '' }),
    ...(registerType === 'label' && { labelName: '', website: '' }),
  });
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    // Email validation with regex
    const emailRegex = /^[\w-.]+@([\w-]+\.)+[\w-]{2,4}$/;
    if (!emailRegex.test(formData.email)) {
      setError('The email address is invalid');
      return;
    }

    try {
      await register(formData);
      navigate('/login');
    } catch (err) {
      setError('An account is already associated with this email');
    }
  };

  return (
    <AppTheme {...props}>
      <CssBaseline enableColorScheme />
      <SignUpContainer direction="column" justifyContent="space-between">
        <Card variant="outlined">
          <Typography
            component="h1"
            variant="h4"
            sx={{ width: '100%', fontSize: 'clamp(2rem, 10vw, 2.15rem)' }}
          >
            Sign up as {registerType.charAt(0).toUpperCase() + registerType.slice(1)}
          </Typography>
          {error && <Alert severity="error">{error}</Alert>}
          <Box
            component="form"
            onSubmit={handleSubmit}
            noValidate
            sx={{
              display: 'flex',
              flexDirection: 'column',
              width: '100%',
              gap: 2,
            }}
          >
            <FormControl>
              <FormLabel htmlFor="username">Username</FormLabel>
              <TextField
                id="username"
                type="text"
                name="username"
                placeholder="Username"
                required
                fullWidth
                variant="outlined"
                value={formData.username}
                onChange={handleChange}
              />
            </FormControl>
            <FormControl>
              <FormLabel htmlFor="email">Email address</FormLabel>
              <TextField
                id="email"
                type="email"
                name="email"
                placeholder="you@email.com"
                autoComplete="email"
                required
                fullWidth
                variant="outlined"
                value={formData.email}
                onChange={handleChange}
              />
            </FormControl>
            <FormControl>
              <FormLabel htmlFor="password">Password</FormLabel>
              <TextField
                name="password"
                placeholder="••••••"
                type="password"
                id="password"
                autoComplete="current-password"
                required
                fullWidth
                variant="outlined"
                value={formData.password}
                onChange={handleChange}
              />
            </FormControl>
            {registerType === 'band' && (
              <>
                <FormControl>
                  <FormLabel htmlFor="bandName">Band name</FormLabel>
                  <TextField
                    id="bandName"
                    type="text"
                    name="bandName"
                    placeholder="Band name"
                    required
                    fullWidth
                    variant="outlined"
                    value={formData.bandName}
                    onChange={handleChange}
                  />
                </FormControl>
                <FormControl>
                  <FormLabel htmlFor="genre">Genre</FormLabel>
                  <TextField
                    id="genre"
                    type="text"
                    name="genre"
                    placeholder="Genre"
                    required
                    fullWidth
                    variant="outlined"
                    value={formData.genre}
                    onChange={handleChange}
                  />
                </FormControl>
              </>
            )}
            {registerType === 'label' && (
              <>
                <FormControl>
                  <FormLabel htmlFor="labelName">Label name</FormLabel>
                  <TextField
                    id="labelName"
                    type="text"
                    name="labelName"
                    placeholder="Label name"
                    required
                    fullWidth
                    variant="outlined"
                    value={formData.labelName}
                    onChange={handleChange}
                  />
                </FormControl>
                <FormControl>
                  <FormLabel htmlFor="website">Website</FormLabel>
                  <TextField
                    id="website"
                    type="text"
                    name="website"
                    placeholder="Website"
                    required
                    fullWidth
                    variant="outlined"
                    value={formData.website}
                    onChange={handleChange}
                  />
                </FormControl>
              </>
            )}
            <Button type="submit" fullWidth variant="contained">
              Sign up
            </Button>
          </Box>
        </Card>
      </SignUpContainer>
    </AppTheme>
  );
};

export default Register;