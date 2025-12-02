import React, { useState, useRef, useEffect } from 'react';
import PropTypes from 'prop-types';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import OutlinedInput from '@mui/material/OutlinedInput';
import TextField from '@mui/material/TextField';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import { authService } from '../../services/authService';
import jwtDecode from 'jwt-decode';

function ForgotPassword({ open, handleClose }) {
  const [step, setStep] = useState(1);
  const [email, setEmail] = useState('');
  const [otpValues, setOtpValues] = useState(Array(6).fill(''));
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [otpToken, setOtpToken] = useState('');
  const [message, setMessage] = useState('');
  const inputRefs = useRef([]);

  // Effect that resets states when the dialog closes
  useEffect(() => {
    if (!open) {
      setStep(1);
      setEmail('');
      setOtpValues(Array(6).fill(''));
      setNewPassword('');
      setConfirmPassword('');
      setMessage('');
      setOtpToken('');
    }
  }, [open]);

  // Step 1: Request OTP
  const handleRequestOtp = async (e) => {
    e.preventDefault();
    try {
      const { message, otpToken } = await authService.forgotPassword(email);
      setMessage(message);
      setOtpToken(otpToken);
      setStep(2);
    } catch (error) {
      setMessage(error.response?.data.error || 'Error requesting OTP');
    }
  };

  // Step 2: Verify OTP locally (comparing the entered value with the decoded token)
  const handleVerifyOtp = (e) => {
    e.preventDefault();
    const otp = otpValues.join('');
    try {
      const decoded = jwtDecode(otpToken);
      if (decoded.otp === otp && decoded.email === email) {
        setMessage('');
        setStep(3);
      } else {
        setMessage('The entered OTP code is incorrect');
      }
    } catch (error) {
      setMessage('Error verifying OTP');
    }
  };

  // Handle changes in each OTP box
  const handleOtpChange = (e, index) => {
    const { value } = e.target;
    if (value.length > 1) return;
    const newOtp = [...otpValues];
    newOtp[index] = value;
    setOtpValues(newOtp);
    if (value && index < 5) {
      inputRefs.current[index + 1].focus();
    }
  };

  // Allows deleting with backspace
  const handleOtpKeyDown = (e, index) => {
    if (e.key === 'Backspace' && otpValues[index] === '' && index > 0) {
      inputRefs.current[index - 1].focus();
    }
  };

  // Step 3: Reset password
  const handleResetPassword = async (e) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setMessage('Passwords do not match');
      return;
    }
    const otp = otpValues.join('');
    try {
      const response = await authService.resetPassword(email, otp, newPassword, otpToken);
      setMessage(response.message || 'Password updated successfully');
      setTimeout(() => {
        handleClose();
        // Reinitialize states after closing the dialog
        setStep(1);
        setEmail('');
        setOtpValues(Array(6).fill(''));
        setNewPassword('');
        setConfirmPassword('');
        setMessage('');
        setOtpToken('');
      }, 750);
    } catch (error) {
      setMessage(error.response?.data.error || 'Error resetting password');
    }
  };

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      slotProps={{
        paper: {
          component: 'form',
          onSubmit:
            step === 1 ? handleRequestOtp :
            step === 2 ? handleVerifyOtp :
            handleResetPassword,
          sx: { backgroundImage: 'none' }
        }
      }}
    >
      <DialogTitle>
        {step === 1 && 'Recover your password'}
        {step === 2 && 'Enter the OTP code'}
        {step === 3 && 'Reset your password'}
      </DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, width: '100%' }}>
        {message && <Alert severity="info">{message}</Alert>}
        {step === 1 && (
          <>
            <DialogContentText>
              Enter your email address and we will send you an OTP code to reset your password.
            </DialogContentText>
            <OutlinedInput
              autoFocus
              required
              margin="dense"
              id="email"
              name="email"
              placeholder="Email address"
              type="email"
              fullWidth
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </>
        )}
        {step === 2 && (
          <>
            <DialogContentText>
              Enter the OTP code you received. Each box represents a digit.
            </DialogContentText>
            <Box sx={{ display: 'flex', gap: 1, justifyContent: 'center' }}>
              {otpValues.map((value, index) => (
                <OutlinedInput
                  key={index}
                  inputProps={{
                    maxLength: 1,
                    style: { textAlign: 'center', fontSize: '20px', width: '40px' }
                  }}
                  value={value}
                  onChange={(e) => handleOtpChange(e, index)}
                  onKeyDown={(e) => handleOtpKeyDown(e, index)}
                  inputRef={(el) => (inputRefs.current[index] = el)}
                  required
                />
              ))}
            </Box>
          </>
        )}
        {step === 3 && (
          <>
            <DialogContentText sx={{ mb: 2 }}>
              Enter your new password and confirm it.
            </DialogContentText>
            <TextField
              required
              fullWidth
              type="password"
              label="New password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
            <TextField
              required
              fullWidth
              type="password"
              label="Confirm password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
          </>
        )}
      </DialogContent>
      <DialogActions sx={{ pb: 3, px: 3 }}>
        <Button onClick={handleClose}>Cancel</Button>
        <Button variant="contained" type="submit">
          {step === 1 && 'Send Code'}
          {step === 2 && 'Verify OTP'}
          {step === 3 && 'Reset'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

ForgotPassword.propTypes = {
  open: PropTypes.bool.isRequired,
  handleClose: PropTypes.func.isRequired,
};

export default ForgotPassword;