/**
 * @license
 * SPDX-License-Identifier: Apache-2.5
 */

import React, { useEffect, useState } from 'react';
import backgroundImage from '../assets/login-bg.jpg';
import logoImage from '../assets/dilg-logo.png';
import { FcGoogle } from 'react-icons/fc';
import {
  Lock,
  User,
  ShieldCheck,
  Briefcase,
  KeyRound,
  Eye,
  EyeOff,
  Building,
  Info,
  ChevronRight,
  Sparkles,
  Smartphone,
  ArrowLeft,
  Mail,
  MapPin,
  UserPlus
} from 'lucide-react';

export default function LoginView({ onLogin, onRequestPasswordReset, mobileOnly = false }) {
  const [isRegister, setIsRegister] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState('supervisor');
  const [emailInput, setEmailInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorText, setErrorText] = useState('');
  const [successText, setSuccessText] = useState('');
  const [googleError, setGoogleError] = useState('');
  const [registeredUsers, setRegisteredUsers] = useState([]);

  useEffect(() => {
    const handleGoogleMessage = (event) => {
      const data = event.data;
      if (!data || typeof data !== 'object') return;

      if (data.type === 'google-login-success') {
        const user = data.user;
        if (user) {
          if (mobileOnly && (user.accessLevel || 'employee').toString().trim().toLowerCase() !== 'employee') {
            setGoogleError('Only employee accounts can use the mobile app.');
            return;
          }
          onLogin(user.accessLevel || 'employee', user, data.token);
        }
      }

      if (data.type === 'google-login-failure') {
        setGoogleError(data.error || 'Google sign-in failed.');
      }
    };

    window.addEventListener('message', handleGoogleMessage);
    return () => window.removeEventListener('message', handleGoogleMessage);
  }, [onLogin]);

  const handleGoogleLogin = () => {
    setGoogleError('');
    const width = 500;
    const height = 650;
    const left = window.screenX + (window.innerWidth - width) / 2;
    const top = window.screenY + (window.innerHeight - height) / 2;
    const googleUrl = `/api/auth/google/url${mobileOnly ? '?mobile=1' : ''}`;
    const popup = window.open(
      googleUrl,
      'GoogleSignIn',
      `width=${width},height=${height},left=${left},top=${top}`
    );

    if (!popup) {
      setGoogleError('Popup blocked. Allow popups to continue with Google.');
    }
  };

  // Registration Form State
  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regPhone, setRegPhone] = useState('');
  const [regRole, setRegRole] = useState('');
  const [regOffice, setRegOffice] = useState('');
  const [regRegion, setRegRegion] = useState('DILG Region IV-B - MIMAROPA');
  const [showRegPassword, setShowRegPassword] = useState(false);
  const [passwordStrength, setPasswordStrength] = useState('');

  // Preset configuration structures
  const PRESET_PROFILES = {
    employee: {
      name: "Lara Montiano",
      email: "laramontiano@dilg.gov.ph",
      role: "Local Government Operations Officer II",
      office: "Marinduque Provincial Office",
      region: "DILG Region IV-B - MIMAROPA",
      employeeId: "DILG-2026-7689",
      phoneNumber: "0939 374 9823"
    },
    supervisor: {
      name: "German F. Yap, CESO V",
      email: "german.yap@dilg.gov.ph",
      role: "Provincial Director",
      office: "Marinduque Provincial Office",
      region: "DILG Region IV-B - MIMAROPA",
      employeeId: "DILG-1998-0241",
      phoneNumber: "+63 918 842 1290"
    },
    hr_admin: {
      name: "Patricia Anne Ortiz",
      email: "patricia.ortiz@dilg.gov.ph",
      role: "HR Administrative Officer V",
      office: "Provincial Administrative Section",
      region: "DILG Region IV-B - MIMAROPA",
      employeeId: "DILG-2015-4421",
      phoneNumber: "+63 920 334 5512"
    }
  };

  const handleSelectPreset = (role) => {
    setSelectedPreset(role);
    setEmailInput('');
    setPasswordInput('');
    setErrorText('');
  };

  const handleFormSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setErrorText('');
    setSuccessText('');

    const loginEmail = emailInput.trim().toLowerCase();
    const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
    const roleLabel = mobileOnly || isMobile ? 'employee' : selectedPreset;

    try {
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: loginEmail,
          password: passwordInput,
          role: roleLabel,
          platform: mobileOnly ? 'mobile' : 'web'
        })
      });

      const text = await response.text();
      let result;
      try {
        result = text ? JSON.parse(text) : {};
      } catch (parseError) {
        result = { error: text };
      }

      setSubmitting(false);

      if (!response.ok) {
        const message = result.error || result.message || response.statusText || 'Login failed. Please verify your credentials.';
        setErrorText(message);
        return;
      }

      const user = result.user || {};
      onLogin(roleLabel, user, result.token);
    } catch (err) {
      setSubmitting(false);
      console.error('Login request failed:', err);
      setErrorText('Login failed. Please check your network connection and try again.');
    }
  };

  const handleRegisterSubmit = (e) => {
    e.preventDefault();
    if (!regName || !regEmail || !regPassword || !regRole || !regOffice || !regRegion || !regPhone) {
      setErrorText('Please fill out all registration fields.');
      return;
    }
    setSubmitting(true);
    setErrorText('');
    setSuccessText('');

    const newProfile = {
      name: regName,
      email: regEmail,
      role: regRole,
      office: regOffice,
      region: regRegion,
      employeeId: `DILG-2026-${Math.floor(1000 + Math.random() * 9000)}`,
      phoneNumber: regPhone,
      password: regPassword,
      accessLevel: 'employee'
    };

    setTimeout(async () => {
      setSubmitting(false);

      // Send registration to backend so it persists in MongoDB
      try {
        const response = await fetch('/api/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newProfile)
        });

        let result;
        const text = await response.text();
        if (text) {
          try {
            result = JSON.parse(text);
          } catch (parseError) {
            result = { error: text };
          }
        } else {
          result = {};
        }

        if (!response.ok) {
          throw new Error(result.error || response.statusText || 'Failed to save to backend');
        }

        const updatedUsers = [...registeredUsers, newProfile];
        setRegisteredUsers(updatedUsers);

        // Pre-fill login credentials
        setEmailInput(regEmail);
        setPasswordInput(regPassword);

        // Notify user and redirect to login
        setSuccessText('Account created successfully! You can now log in.');
        setIsRegister(false);
      } catch (err) {
        console.error('Backend registration failed:', err);
        setErrorText(`Registration failed: ${err.message}`);
      }
    }, 1200);
  };

  return (
    <div 
      className="min-h-screen text-slate-100 flex flex-col justify-between items-center relative overflow-hidden select-none font-sans id-login-portal-root"
      style={{
        backgroundImage: `url(${backgroundImage})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat'
      }}
    >
      {/* Background Image Overlay removed to keep only the picture visible */}
      <div className="absolute inset-0 bg-transparent z-0 pointer-events-none"></div>
      
      {/* Visual Accents & Lights */}
      <div className="absolute top-[-30%] left-[-20%] w-[600px] h-[600px] bg-blue-900/20 blur-[150px] rounded-full pointer-events-none z-0"></div>
      <div className="absolute bottom-[-30%] right-[-20%] w-[600px] h-[600px] bg-indigo-950/30 blur-[150px] rounded-full pointer-events-none z-0"></div>
      
      {/* Decorative yellow strip */}
      <div className="w-full h-1.5 bg-yellow-400 z-10 shrink-0"></div>

      {/* Main Form Center Wrapper */}
      <div className="w-full max-w-4xl px-4 py-8 flex-1 flex flex-col items-center gap-8 relative z-10">
        
        {/* Emblem & Portal Label */}
        <div className="w-full max-w-3xl space-y-4">
          <div className="flex items-center justify-center gap-3.5">
            <div className="w-18 h-18 rounded-full bg-white p-1 shadow-md flex items-center justify-center shrink-0 overflow-hidden">
              <img src={logoImage} alt="DILG logo" className="w-full h-full object-contain" />
            </div>

            <div className="text-left">
              <span className="text-[10px] text-yellow-400 font-extrabold tracking-widest block uppercase">DEPARTMENT OF THE INTERIOR AND LOCAL GOVERNMENT</span>
              <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight uppercase leading-none mt-1">
                <span className="[text-shadow:1px_1px_2px_rgba(0,0,0,0.75)]">DILG</span> <span className="text-blue-600 font-black [text-shadow:1px_1px_2px_rgba(0,0,0,0.75)]">WORKMATE</span>
              </h1>
              <p className="mt-1 text-[9px] font-black uppercase tracking-[0.28em] text-white/90">COMPANION SYSTEM</p>
            </div>
          </div>
        </div>

        {/* Mobile-only employee login flow. No role selection step on mobile. */}
        <div className="md:hidden mt-8 mb-16 w-full max-w-sm self-center rounded-3xl bg-white p-5 text-slate-800 shadow-xl">
          {isRegister ? (
            <form onSubmit={handleRegisterSubmit} className="space-y-4">
              <button type="button" onClick={() => { setIsRegister(false); setErrorText(''); setSuccessText(''); }} className="inline-flex items-center gap-1 text-xs font-bold text-slate-500 hover:text-indigo-600"><ArrowLeft className="h-4 w-4" /> Back to login</button>
              <div><span className="text-[10px] font-extrabold uppercase tracking-widest text-indigo-600">Employee registration</span><h2 className="mt-1 flex items-center gap-2 text-xl font-black text-slate-900"><UserPlus className="h-5 w-5 text-indigo-600" /> Registration Details</h2><p className="mt-1 text-xs text-slate-500">Input your assignment details below to create your account.</p></div>
              <div className="space-y-3">
                <label className="block text-[10px] font-extrabold uppercase tracking-widest text-slate-500">Full Name<input type="text" required value={regName} onChange={(e) => setRegName(e.target.value)} placeholder="Full Name" className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs font-bold normal-case tracking-normal text-slate-800 focus:border-indigo-500 focus:bg-white focus:outline-none" /></label>
                <label className="block text-[10px] font-extrabold uppercase tracking-widest text-slate-500">Select Department<select required value={regOffice} onChange={(e) => setRegOffice(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs font-bold normal-case tracking-normal text-slate-800 focus:border-indigo-500 focus:bg-white focus:outline-none"><option value="" disabled>Select Department</option><option>Marinduque Provincial Office</option><option>Provincial Administrative Section</option><option>Boac Municipal Operations Office</option><option>Mogpog Municipal Operations Office</option><option>Santa Cruz Municipal Operations Office</option><option>Gasan Municipal Operations Office</option></select></label>
                <label className="block text-[10px] font-extrabold uppercase tracking-widest text-slate-500">Select Position<select required value={regRole} onChange={(e) => setRegRole(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs font-bold normal-case tracking-normal text-slate-800 focus:border-indigo-500 focus:bg-white focus:outline-none"><option value="" disabled>Select Position</option><option>Local Government Operations Officer II</option><option>Local Government Operations Officer V</option><option>Administrative Officer V</option><option>Administrative Assistant III</option><option>Program Manager</option></select></label>
                <div className="grid grid-cols-2 gap-3"><label className="block text-[10px] font-extrabold uppercase tracking-widest text-slate-500">Account Role<input readOnly value="Employee" className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-100 p-3 text-xs font-bold normal-case tracking-normal text-slate-500" /></label><label className="block text-[10px] font-extrabold uppercase tracking-widest text-slate-500">Region<input readOnly value={regRegion} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-100 p-3 text-xs font-bold normal-case tracking-normal text-slate-500" /></label></div>
                <label className="block text-[10px] font-extrabold uppercase tracking-widest text-slate-500">Enter your email<input type="email" required value={regEmail} onChange={(e) => setRegEmail(e.target.value)} placeholder="Enter your email" className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs font-bold normal-case tracking-normal text-slate-800 focus:border-indigo-500 focus:bg-white focus:outline-none" /></label>
                <label className="block text-[10px] font-extrabold uppercase tracking-widest text-slate-500">Mobile Phone Number<input type="text" required value={regPhone} onChange={(e) => setRegPhone(e.target.value)} placeholder="+63 9XX XXX XXXX" className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs font-bold normal-case tracking-normal text-slate-800 focus:border-indigo-500 focus:bg-white focus:outline-none" /></label>
                <label className="block text-[10px] font-extrabold uppercase tracking-widest text-slate-500">Create a password<input type={showRegPassword ? 'text' : 'password'} required value={regPassword} onChange={(e) => { const value = e.target.value; setRegPassword(value); const score = [/.{10,}/, /[A-Z]/, /[a-z]/, /[0-9]/, /[^A-Za-z0-9]/].reduce((acc, test) => acc + (test.test(value) ? 1 : 0), 0); setPasswordStrength(score >= 5 ? 'Strong password' : score >= 3 ? 'Good, add one more symbol or number' : 'Use 10+ chars with upper, lower, numbers, symbols'); }} placeholder="Create a password" className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs font-bold normal-case tracking-normal text-slate-800 focus:border-indigo-500 focus:bg-white focus:outline-none" />{regPassword && <span className="mt-1 block text-[10px] normal-case tracking-normal text-indigo-600">{passwordStrength}</span>}</label>
              </div>
              {errorText && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs font-bold text-red-600">{errorText}</div>}
              <button type="submit" disabled={submitting} className="w-full rounded-2xl bg-indigo-600 px-4 py-3.5 text-xs font-extrabold text-white shadow-lg disabled:opacity-60">{submitting ? 'Registering...' : 'Sign Up'}</button>
              <button type="button" onClick={() => { setIsRegister(false); setErrorText(''); setSuccessText(''); }} className="block w-full text-center text-[11px] font-bold text-indigo-600">Have an account? Log In here.</button>
            </form>
          ) : (
            <form onSubmit={handleFormSubmit} className="space-y-5">
              <div>
                <h2 className="flex items-center gap-2 whitespace-nowrap text-lg font-black text-slate-900"><Lock className="h-5 w-5 shrink-0 text-indigo-600" /> Official DILG Employee Log In</h2>
                <p className="mt-1 text-xs text-slate-500">Log in using your official DILG Government Email credentials.</p>
              </div>
              <label className="block space-y-1.5 text-xs font-bold text-slate-600"><span className="text-[10px] uppercase tracking-widest text-slate-500">DILG Email Address</span><span className="relative block"><User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input type="email" required value={emailInput} onChange={(e) => setEmailInput(e.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 pl-10 text-xs font-bold text-slate-800 focus:border-indigo-500 focus:bg-white focus:outline-none" /></span></label>
              <label className="block space-y-1.5 text-xs font-bold text-slate-600"><span className="text-[10px] uppercase tracking-widest text-slate-500">Password</span><span className="relative block"><Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input type={showPassword ? 'text' : 'password'} required value={passwordInput} onChange={(e) => setPasswordInput(e.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 pl-10 pr-10 text-xs font-bold text-slate-800 focus:border-indigo-500 focus:bg-white focus:outline-none" /><button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">{showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button></span></label>
              <div className="flex items-center justify-between pt-1">
                <label className="flex items-center gap-2 text-[10px] font-bold text-slate-600">
                  <input type="checkbox" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} className="h-3 w-3 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" />
                  Remember me
                </label>
                <button type="button" onClick={onRequestPasswordReset} className="text-[10px] font-bold text-indigo-600">Forgot password?</button>
              </div>
              {errorText && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs font-bold text-red-600">{errorText}</div>}
              {successText && <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs font-bold text-emerald-600">{successText}</div>}
              <button type="submit" disabled={submitting} className="flex w-full items-center justify-center rounded-2xl bg-indigo-600 px-4 py-3.5 text-xs font-extrabold text-white shadow-lg disabled:opacity-60">{submitting ? 'Loading...' : 'Log In'}</button>
              <div className="flex items-center gap-3"><span className="h-px flex-1 bg-slate-200" /><span className="text-[10px] font-bold uppercase text-slate-400">or</span><span className="h-px flex-1 bg-slate-200" /></div>
              <button type="button" onClick={handleGoogleLogin} className="flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs font-bold text-slate-700"><FcGoogle className="h-4 w-4" /> Continue with Google</button>
              {googleError && <p className="text-center text-[10px] font-semibold text-red-600">{googleError}</p>}
              <button type="button" onClick={() => { setIsRegister(true); setErrorText(''); setSuccessText(''); }} className="block w-full text-center text-[11px] font-bold text-slate-500">Don't have an account? <span className="text-indigo-600">Sign up</span></button>
            </form>
          )}
        </div>

        {/* Desktop web login card: unchanged role selector and login form. */}
        <div className="hidden md:block bg-white border border-slate-200 rounded-3xl overflow-hidden w-full max-w-3xl shadow-xl">
          
          {!isRegister ? (
            <div className="grid grid-cols-1 md:grid-cols-12">
              {/* Left panel: Mode select option card */}
              <div className="md:col-span-5 bg-slate-50 p-6 sm:p-8 flex flex-col justify-between border-b md:border-b-0 md:border-r border-slate-200 space-y-6">
                <div className="space-y-4">
                  <div>
                    <h3 className="font-extrabold text-slate-900 text-base tracking-tight mt-1">Choose Your Role</h3>
                    <p className="text-[11px] text-slate-500 font-medium leading-relaxed mt-1">
                      Configure the portal to customize the dashboard based on your assigned access level.
                    </p>
                  </div>

                  {/* Mode Options deck */}
                  <div className="space-y-3 pt-2">
                    {[
                      {
                        id: 'supervisor',
                        title: '1. Supervisor',
                        subtitle: 'Approving Officer desk review',
                        icon: ShieldCheck,
                        color: 'text-amber-700 bg-amber-50 border-amber-100'
                      },
                      {
                        id: 'hr_admin',
                        title: '2. HR / Admin',
                        subtitle: 'Overall records & logs audit',
                        icon: Briefcase,
                        color: 'text-indigo-600 bg-indigo-50 border-indigo-100'
                      }
                    ].map((preset) => {
                      const Icon = preset.icon;
                      const isSelected = selectedPreset === preset.id;
                      
                      return (
                        <button
                          key={preset.id}
                          type="button"
                          onClick={() => handleSelectPreset(preset.id)}
                          className={`w-full p-3.5 rounded-2xl border flex items-center justify-between text-left cursor-pointer transition-all duration-200 ${
                            isSelected 
                              ? 'border-indigo-600 bg-indigo-50/80 ring-2 ring-indigo-500/15' 
                              : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                          }`}
                        >
                          <div className="flex gap-3 items-center min-w-0">
                            <div className={`w-9 h-9 rounded-xl flex items-center justify-center border shrink-0 ${preset.color}`}>
                              <Icon className="w-5 h-5" />
                            </div>
                            <div className="min-w-0">
                              <p className="font-extrabold text-xs text-slate-800">{preset.title}</p>
                              <p className="text-[10px] text-slate-500 truncate">{preset.subtitle}</p>
                            </div>
                          </div>
                          
                          {isSelected && (
                            <div className="w-2 h-2 rounded-full bg-indigo-600 shrink-0"></div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

              </div>

              {/* Right panel: Authentication Credential login box */}
              <form
                onSubmit={handleFormSubmit}
                className="md:col-span-7 p-6 sm:p-8 flex flex-col justify-between space-y-6 bg-white"
              >
                
                <div className="space-y-6">
                  {/* Title header */}
                  <div className="space-y-1">
                    <h2 className="font-extrabold text-lg tracking-tight text-slate-900 flex items-center gap-2">
                      <Lock className="w-5 h-5 text-indigo-600" />
                      <span>Official DILG Employee Log In</span>
                    </h2>
                    <p className="text-xs text-slate-500 font-medium">
                      Log in using your official DILG Government Email credentials.
                    </p>
                  </div>

                  {/* Standard Login Fields */}
                  <div className="space-y-4">
                    {/* Email Address */}
                    <div className="space-y-1.5 text-xs">
                      <label className="text-[10px] uppercase font-extrabold tracking-widest text-slate-500 block">DILG Email Address</label>
                      <div className="relative">
                        <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input
                          type="email"
                          required
                          value={emailInput}
                          onChange={(e) => setEmailInput(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 pl-10 text-xs font-bold text-slate-800 placeholder-slate-400 focus:outline-indigo-500 focus:bg-white"
                          placeholder=""
                        />
                      </div>
                    </div>

                    {/* Password */}
                    <div className="space-y-1.5 text-xs">
                      <label className="text-[10px] uppercase font-extrabold tracking-widest text-slate-500 block">Password</label>
                      <div className="relative">
                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input
                          type={showPassword ? 'text' : 'password'}
                          required
                          value={passwordInput}
                          onChange={(e) => setPasswordInput(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 pl-10 pr-10 text-xs font-bold text-slate-800 placeholder-slate-400 focus:outline-indigo-500 focus:bg-white"
                          placeholder=""
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer border-0 bg-transparent"
                        >
                          {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                      <div className="flex items-center justify-between pt-3">
                        <label className="flex items-center gap-2 text-[10px] font-bold text-slate-600 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={rememberMe}
                            onChange={(e) => setRememberMe(e.target.checked)}
                            className="w-3 h-3 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                          />
                          Remember me
                        </label>
                        <button
                          type="button"
                          onClick={onRequestPasswordReset}
                          className="text-[10px] text-indigo-600 hover:underline font-bold bg-transparent border-0 cursor-pointer"
                        >
                          Forgot password?
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Success notifications */}
                  {successText && (
                    <div className="text-emerald-600 text-xs font-bold bg-emerald-50 p-3 rounded-lg border border-emerald-200">
                      {successText}
                    </div>
                  )}

                  {/* Error notifications */}
                  {errorText && (
                    <div className="text-red-600 text-xs font-bold bg-red-50 p-3 rounded-lg border border-red-200">
                      {errorText}
                    </div>
                  )}
                </div>

                <div className="space-y-4 pt-4">
                  {/* Submit Auth Access Button */}
                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-extrabold rounded-2xl py-3.5 px-4 text-xs transition-colors duration-200 cursor-pointer flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/15 border-0"
                  >
                    {submitting ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                        <span>Loading...</span>
                      </>
                    ) : (
                      <>
                        <span>Log In</span>
                      </>
                    )}
                  </button>

                  <div className="flex items-center gap-3 my-3">
                    <div className="h-px flex-1 bg-slate-200"></div>
                    <span className="text-[10px] uppercase font-bold tracking-widest text-slate-400">or</span>
                    <div className="h-px flex-1 bg-slate-200"></div>
                  </div>

                  <button
                    type="button"
                    onClick={handleGoogleLogin}
                    className="w-full bg-white text-slate-700 font-bold rounded-2xl py-3 px-4 text-xs border border-slate-200 hover:bg-slate-50 transition-colors duration-200 flex items-center justify-center gap-2 shadow-sm"
                  >
                    <FcGoogle className="h-4 w-4" />
                    <span>Continue with Google</span>
                  </button>

                  {googleError && (
                    <div className="text-[10px] text-red-600 font-semibold mt-2 text-center">
                      {googleError}
                    </div>
                  )}

                  {selectedPreset === 'employee' && (
                    <div className="text-center">
                      <button
                        type="button"
                        onClick={() => { setIsRegister(true); setErrorText(''); setSuccessText(''); }}
                        className="text-xs text-slate-500 bg-transparent border-0 cursor-pointer mx-auto"
                      >
                        Don't have an account? <span className="text-indigo-600">Sign up</span>
                      </button>
                    </div>
                  )}
                </div>

              </form>
            </div>
          ) : (
            // REGISTRATION MODE SCREEN
            <div className="grid grid-cols-1 md:grid-cols-12 bg-white">
              {/* Left panel: Info Panel for Sign-Up */}
              <div className="md:col-span-4 bg-slate-50 p-6 sm:p-8 flex flex-col justify-between border-b md:border-b-0 md:border-r border-slate-200 space-y-6">
                <div className="space-y-4">
                  <button
                    type="button"
                    onClick={() => { setIsRegister(false); setErrorText(''); }}
                    className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-indigo-600 bg-transparent border-0 cursor-pointer font-bold select-none"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    <span>Back to Login</span>
                  </button>

                  <div className="pt-2">
                    <span className="text-[10px] text-indigo-600 font-extrabold uppercase tracking-widest block">Officer Signup</span>
                    <h3 className="font-extrabold text-slate-900 text-base tracking-tight mt-1">Sign Up</h3>
                    <p className="text-[11px] text-slate-500 font-medium leading-relaxed mt-2">
                      Complete your registration to securely access DTR logs, travel orders, and leave requests.
                    </p>
                  </div>
                </div>
              </div>

              {/* Right panel: Registration Form fields */}
              <form onSubmit={handleRegisterSubmit} className="md:col-span-8 p-6 sm:p-8 flex flex-col justify-between space-y-6 bg-white">
                
                <div className="space-y-5">
                  <div className="space-y-1">
                    <h2 className="font-extrabold text-lg tracking-tight text-slate-900 flex items-center gap-2">
                      <UserPlus className="w-5 h-5 text-indigo-600" />
                      <span>Registration Details</span>
                    </h2>
                    <p className="text-xs text-slate-500 font-medium">Input your assignment details below to create your account.</p>
                  </div>

                  {/* Simplified DILG registration form */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Full Name */}
                    <div className="space-y-1.5 text-xs">
                      <label className="text-[9.5px] uppercase font-extrabold tracking-widest text-slate-500 block">Full Name</label>
                      <div className="relative">
                        <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input
                          type="text"
                          required
                          value={regName}
                          onChange={(e) => setRegName(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 pl-9 text-xs font-bold text-slate-800 focus:outline-indigo-500 focus:bg-white"
                          placeholder="Full Name"
                        />
                      </div>
                    </div>

                    {/* Department */}
                    <div className="space-y-1.5 text-xs">
                      <label className="text-[9.5px] uppercase font-extrabold tracking-widest text-slate-500 block">Select Department</label>
                      <div className="relative">
                        <Building className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <select
                          required
                          value={regOffice}
                          onChange={(e) => setRegOffice(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 pl-9 text-xs font-bold text-slate-800 focus:outline-indigo-500 cursor-pointer focus:bg-white"
                        >
                          <option value="" disabled>Select Department</option>
                          <option value="Marinduque Provincial Office">Marinduque Provincial Office</option>
                          <option value="Provincial Administrative Section">Provincial Administrative Section</option>
                          <option value="Boac Municipal Operations Office">Boac Municipal Operations Office</option>
                          <option value="Mogpog Municipal Operations Office">Mogpog Municipal Operations Office</option>
                          <option value="Santa Cruz Municipal Operations Office">Santa Cruz Municipal Operations Office</option>
                          <option value="Gasan Municipal Operations Office">Gasan Municipal Operations Office</option>
                          <option value="Buenavista Municipal Operations Office">Buenavista Municipal Operations Office</option>
                          <option value="Torrijos Municipal Operations Office">Torrijos Municipal Operations Office</option>
                        </select>
                      </div>
                    </div>

                    {/* Position */}
                    <div className="space-y-1.5 text-xs">
                      <label className="text-[9.5px] uppercase font-extrabold tracking-widest text-slate-500 block">Select Position</label>
                      <div className="relative">
                        <Briefcase className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <select
                          required
                          value={regRole}
                          onChange={(e) => setRegRole(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 pl-9 text-xs font-bold text-slate-800 focus:outline-indigo-500 cursor-pointer focus:bg-white"
                        >
                          <option value="" disabled>Select Position</option>
                          <option value="Local Government Operations Officer II">Local Government Operations Officer II</option>
                          <option value="Local Government Operations Officer V">Local Government Operations Officer V</option>
                          <option value="Local Government Operations Officer VI">Local Government Operations Officer VI</option>
                          <option value="Administrative Officer V">Administrative Officer V</option>
                          <option value="Administrative Assistant III">Administrative Assistant III</option>
                          <option value="Program Manager">Program Manager</option>
                        </select>
                      </div>
                    </div>

                    {/* Fixed Employee Role */}
                    <div className="space-y-1.5 text-xs">
                      <label className="text-[9.5px] uppercase font-extrabold tracking-widest text-slate-500 block">Account Role</label>
                      <div className="relative">
                        <ShieldCheck className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input
                          type="text"
                          readOnly
                          value="Employee"
                          className="w-full bg-slate-100 border border-slate-200 rounded-xl p-2.5 pl-9 text-xs font-bold text-slate-500 focus:outline-none cursor-not-allowed"
                        />
                      </div>
                    </div>

                    {/* Email Address */}
                    <div className="space-y-1.5 text-xs">
                      <label className="text-[9.5px] uppercase font-extrabold tracking-widest text-slate-500 block">Enter your email</label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input
                          type="email"
                          required
                          value={regEmail}
                          onChange={(e) => setRegEmail(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 pl-9 text-xs font-bold text-slate-800 focus:outline-indigo-500 focus:bg-white"
                          placeholder="Enter your email"
                        />
                      </div>
                    </div>

                    {/* Mobile Phone Number */}
                    <div className="space-y-1.5 text-xs">
                      <label className="text-[9.5px] uppercase font-extrabold tracking-widest text-slate-500 block">Mobile Phone Number</label>
                      <div className="relative">
                        <Smartphone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input
                          type="text"
                          required
                          value={regPhone}
                          onChange={(e) => setRegPhone(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 pl-9 text-xs font-bold text-slate-800 focus:outline-indigo-500 focus:bg-white"
                          placeholder="+63 9XX XXX XXXX"
                        />
                      </div>
                    </div>

                    {/* Region (fixed) */}
                    <div className="space-y-1.5 text-xs">
                      <label className="text-[9.5px] uppercase font-extrabold tracking-widest text-slate-500 block">Region</label>
                      <div className="relative">
                        <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input
                          type="text"
                          readOnly
                          value={regRegion}
                          className="w-full bg-slate-100 border border-slate-200 rounded-xl p-2.5 pl-9 text-xs font-bold text-slate-500 focus:outline-none cursor-not-allowed"
                        />
                      </div>
                    </div>

                    {/* Password */}
                    <div className="space-y-1.5 text-xs">
                      <label className="text-[9.5px] uppercase font-extrabold tracking-widest text-slate-500 block">Create a password</label>
                      <div className="relative">
                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input
                          type={showRegPassword ? 'text' : 'password'}
                          required
                          value={regPassword}
                          onChange={(e) => {
                            const value = e.target.value;
                            setRegPassword(value);
                            const score = [/.{10,}/, /[A-Z]/, /[a-z]/, /[0-9]/, /[^A-Za-z0-9]/].reduce(
                              (acc, test) => acc + (test.test(value) ? 1 : 0),
                              0
                            );
                            setPasswordStrength(
                              score >= 5
                                ? 'Strong password'
                                : score >= 3
                                ? 'Good, add one more symbol or number'
                                : 'Use 10+ chars with upper, lower, numbers, symbols'
                            );
                          }}
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 pl-9 pr-10 text-xs font-bold text-slate-800 focus:outline-indigo-500 focus:bg-white"
                          placeholder="Create a password"
                        />
                        <button
                          type="button"
                          onClick={() => setShowRegPassword(!showRegPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer border-0 bg-transparent"
                        >
                          {showRegPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                      {regPassword && (
                        <p className={`text-[10px] ${passwordStrength.includes('Strong') ? 'text-emerald-600' : passwordStrength.includes('Good') ? 'text-amber-600' : 'text-rose-600'} font-semibold mt-2`}>
                          {passwordStrength}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Error alerts */}
                  {errorText && (
                    <div className="text-red-600 text-xs font-bold bg-red-50 p-3 rounded-lg border border-red-200">
                      {errorText}
                    </div>
                  )}

                </div>

                <div className="space-y-4 pt-4">
                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full bg-blue-600 hover:bg-blue-500 text-white font-extrabold rounded-2xl py-3.5 px-4 text-xs uppercase transition-colors duration-200 cursor-pointer flex items-center justify-center gap-2 shadow-lg shadow-blue-600/15 border-0"
                  >
                    {submitting ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                        <span>Registering secure digital workspace profile...</span>
                      </>
                    ) : (
                      <>
                        <span>Sign Up</span>
                      </>
                    )}
                  </button>

                  <div className="text-center">
                    <button
                      type="button"
                      onClick={() => { setIsRegister(false); setErrorText(''); setSuccessText(''); }}
                      className="text-xs text-indigo-600 hover:text-indigo-500 hover:underline font-bold bg-transparent border-0 cursor-pointer"
                    >
                      Have an account? Log In here.
                    </button>
                  </div>
                </div>

              </form>
            </div>
          )}

        </div>

      </div>

      {/* Footer Branding Trademark */}
      <footer className="w-full text-center py-5 max-md:py-3 text-[10px] max-md:text-[8px] text-slate-500 font-semibold border-t border-slate-200 bg-slate-100/50 z-10 shrink-0">
        <p className="px-2 max-md:whitespace-nowrap">© 2026 Department of the Interior and Local Government. All Rights Reserved.</p>
      </footer>

    </div>
  );
}
