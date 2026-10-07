import React, { useState } from 'react';
import backgroundImage from '../assets/login-bg.jpg';
import logoImage from '../assets/dilg-logo.png';
const GoogleIcon = () => (
  <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
  </svg>
);
import { KeyRound, Eye, EyeOff, Mail, ArrowLeft, Lock, ExternalLink, UserCog } from 'lucide-react';

// Google's own page for recovering a Google account. WorkMate never resets a Google password.
// In the phone app, links to other sites open in the phone's browser.
const GOOGLE_ACCOUNT_RECOVERY_URL = 'https://accounts.google.com/signin/recovery';

export default function PasswordResetView({ mode, token, onBackToLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorText, setErrorText] = useState('');
  const [successText, setSuccessText] = useState('');
  // DILG email accounts are reset by HR instead of by email (see "Request password reset from HR").
  const [contactHrText, setContactHrText] = useState('');
  const [hrRequesting, setHrRequesting] = useState(false);
  const [hrMessage, setHrMessage] = useState(null); // { text, error }

  const isApplyMode = mode === 'apply';

  // Asks HR to reset the password, for someone who cannot use an emailed reset link. HR
  // confirms who they are before giving them a temporary password.
  const handleHrRequest = async () => {
    setHrMessage(null);
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      setHrMessage({ text: 'Enter your email address above first.', error: true });
      return;
    }
    setHrRequesting(true);
    try {
      const response = await fetch('/api/password-reset-hr-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: normalizedEmail })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result.error || 'Your request could not be sent. Please visit or call the HR office.');
      }
      setHrMessage({ text: result.message || 'Your request was sent to the HR Administrator.' });
    } catch (error) {
      setHrMessage({ text: error.message || 'Your request could not be sent. Please visit or call the HR office.', error: true });
    } finally {
      setHrRequesting(false);
    }
  };

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

        setSuccessText(result.message || 'Your password has been reset. You can now log in with your new password.');
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
          setSuccessText(result.message || 'If that email has an account, we sent it an email with what to do next.');
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
                : 'Signed up with the form? Enter your account\'s email address and we will email you a link to set a new password. DILG (@dilg.gov.ph) accounts are reset by your HR Administrator.'}
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

              {/* Shown to everyone, so the page never reveals which emails use Google sign-in.
                  A Google-only account that asks for a reset is also emailed this link. */}
              {!isApplyMode && (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="flex items-center gap-2 text-xs font-black text-slate-800"><GoogleIcon /> Signed up with Continue with Google?</p>
                  <p className="mt-1.5 text-xs font-semibold text-slate-600">
                    This account uses Google Sign-In. Your password is managed by Google. Please use Google Account Recovery to reset your Google password.
                  </p>
                  <a
                    href={GOOGLE_ACCOUNT_RECOVERY_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-3 inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-xs font-extrabold text-slate-800 hover:bg-slate-100"
                  >
                    Recover Google Account <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                  <p className="mt-2 text-[11px] font-semibold text-slate-500">
                    After recovering your Google account, come back and choose Continue with Google to log in.
                  </p>
                </div>
              )}

              {!isApplyMode && (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="flex items-center gap-2 text-xs font-black text-slate-800"><UserCog className="h-4 w-4 shrink-0 text-indigo-600" /> Can't open your email, or have a DILG (@dilg.gov.ph) account?</p>
                  <p className="mt-1.5 text-xs font-semibold text-slate-600">
                    Ask HR to reset your password. Enter your email address above, then tap the button. HR will confirm it is you and give you a temporary password in person or by phone.
                  </p>
                  <button
                    type="button"
                    onClick={handleHrRequest}
                    disabled={hrRequesting}
                    className="mt-3 inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-xs font-extrabold text-slate-800 hover:bg-slate-100 disabled:opacity-60"
                  >
                    {hrRequesting ? 'Sending...' : 'Request password reset from HR'}
                  </button>
                  {hrMessage && (
                    <p role={hrMessage.error ? 'alert' : 'status'} className={`mt-3 rounded-lg border p-3 text-xs font-bold ${hrMessage.error ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>
                      {hrMessage.text}
                    </p>
                  )}
                </div>
              )}

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
