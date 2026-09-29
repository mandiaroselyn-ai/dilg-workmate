import React, { useState } from 'react';
import backgroundImage from '../assets/login-bg.jpg';
import logoImage from '../assets/dilg-logo.png';
import { KeyRound, Eye, EyeOff, Mail, ArrowLeft, Lock } from 'lucide-react';

export default function PasswordResetView({ mode, token, onBackToLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorText, setErrorText] = useState('');
  const [successText, setSuccessText] = useState('');
  // DILG email accounts are reset by HR instead of by email.
  const [contactHrText, setContactHrText] = useState('');

  const isApplyMode = mode === 'apply';

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setErrorText('');
    setSuccessText('');
    setContactHrText('');

    try {
      if (isApplyMode) {
        if (!password || !confirmPassword) {
          throw new Error('Please enter both password fields.');
        }
        if (password !== confirmPassword) {
          throw new Error('Passwords do not match.');
        }

        const response = await fetch('/api/password-reset', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, password })
        });

        const result = await response.json();
        if (!response.ok) {
          throw new Error(result.error || result.message || 'Unable to reset password.');
        }

        setSuccessText(result.message || 'Your password has been reset successfully.');
        setPassword('');
        setConfirmPassword('');
      } else {
        if (!email) {
          throw new Error('Please enter your email address.');
        }

        const normalizedEmail = email.trim().toLowerCase();
        const response = await fetch('/api/password-reset-request', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: normalizedEmail })
        });

        const result = await response.json();
        if (!response.ok) {
          throw new Error(result.error || result.message || 'Unable to send reset link.');
        }

        if (result.contactHr) {
          setContactHrText(result.message || 'Please contact your HR Administrator to reset your password.');
        } else {
          setSuccessText(result.message || 'If that email exists, a reset link has been sent.');
          setEmail('');
        }
      }
    } catch (error) {
      setErrorText(error.message || 'Something went wrong.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="min-h-screen text-slate-100 flex flex-col justify-center items-center relative overflow-hidden select-none font-sans"
      style={{
        backgroundImage: `url(${backgroundImage})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat'
      }}
    >
      <div className="absolute inset-0 bg-slate-950/50 z-0 pointer-events-none"></div>
      <div className="w-full max-w-2xl px-4 py-8 relative z-10">
        <div className="bg-white/95 border border-slate-200 rounded-3xl shadow-2xl overflow-hidden">
          <div className="p-6 sm:p-8">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-14 h-14 rounded-full bg-slate-100 p-3 shadow-sm">
                <img src={logoImage} alt="DILG logo" className="w-full h-full object-contain" />
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-widest text-indigo-600 font-extrabold">DILG WorkMate</p>
                <h1 className="text-2xl font-black text-slate-900">{isApplyMode ? 'Reset Password' : 'Forgot Password'}</h1>
              </div>
            </div>

            <p className="text-sm text-slate-600 mb-6">
              {isApplyMode
                ? 'Enter your new password below to complete the reset process.'
                : 'Enter your email address. Gmail and other personal email accounts get a reset link in their inbox. DILG (@dilg.gov.ph) accounts are reset by your HR Administrator.'}
            </p>

            <form onSubmit={handleSubmit} className="space-y-5">
              {isApplyMode ? (
                <>
                  <div className="space-y-1.5 text-xs">
                    <label className="uppercase tracking-widest text-slate-500 font-bold">New Password</label>
                    <div className="relative">
                      <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 pl-10 text-xs font-bold text-slate-800 focus:outline-indigo-500 focus:bg-white"
                        placeholder="New password"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                  <div className="space-y-1.5 text-xs">
                    <label className="uppercase tracking-widest text-slate-500 font-bold">Confirm Password</label>
                    <div className="relative">
                      <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <input
                        type={showConfirmPassword ? 'text' : 'password'}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 pl-10 text-xs font-bold text-slate-800 focus:outline-indigo-500 focus:bg-white"
                        placeholder="Confirm new password"
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                      >
                        {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <div className="space-y-1.5 text-xs">
                  <label className="uppercase tracking-widest text-slate-500 font-bold">Email Address</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 pl-10 text-xs font-bold text-slate-800 focus:outline-indigo-500 focus:bg-white"
                      placeholder="your email address"
                    />
                  </div>
                </div>
              )}

              {contactHrText && (
                <div className="text-amber-900 text-xs font-bold bg-amber-50 p-3 rounded-lg border border-amber-200">
                  {contactHrText}
                </div>
              )}
              {successText && (
                <div className="text-emerald-700 text-xs font-bold bg-emerald-50 p-3 rounded-lg border border-emerald-200">
                  {successText}
                </div>
              )}
              {errorText && (
                <div className="text-red-700 text-xs font-bold bg-red-50 p-3 rounded-lg border border-red-200">
                  {errorText}
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-extrabold rounded-2xl py-3.5 text-xs transition-colors duration-200 disabled:opacity-60"
              >
                {submitting ? 'Processing...' : isApplyMode ? 'Update Password' : 'Send Reset Link'}
              </button>

              <div className="text-center pt-2">
                <button
                  type="button"
                  onClick={onBackToLogin}
                  className="text-xs text-slate-600 hover:text-slate-800 hover:underline font-bold"
                >
                  <ArrowLeft className="inline w-3.5 h-3.5 mr-1" />
                  Back to login
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
