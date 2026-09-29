# 💼 DILG WorkMate

An automated, full-stack personnel operations and validation portal for **DILG Marinduque Provincial Office**. 
DILG WorkMate simplifies administrative workflows, dynamic digital signature placement, daily time record logging, and official leave/travel coordination in real-time.

---

## 🛠️ Tech Stack & Architecture

- **Frontend:** React with Vite, styled elegantly with Tailwind CSS and enhanced with `motion` transitions.
- **Backend:** Node.js + Express with an organized Model-Controller-Route design pattern.
- **Database:** MongoDB Atlas via Mongoose, no local JSON fallback.
- **Icons:** Modern responsive iconography powered by `lucide-react`.

---

## 📂 Project Directory Structure

```bash
dilg-workmate/
├── backend/
│   ├── src/
│   │   ├── config/
│   │   ├── controllers/
│   │   ├── middleware/
│   │   ├── models/
│   │   ├── routes/
│   │   └── index.js
│   └── data/
├── frontend/
│   └── package.json          # thin wrapper for root scripts
├── src/
│   ├── components/
│   ├── App.jsx
│   ├── main.jsx
│   └── index.css
├── public/
├── scripts/
├── package.json
├── vite.config.ts
└── README.md
```

---

## 🚦 Getting Started

1. **Install Dependencies:**
   ```bash
   npm install
   ```

2. **Run in Development Mode:**
   ```bash
   npm run dev
   ```
   This starts the backend (default port `5000`) and Vite frontend. Open the `Local` URL printed by Vite. If port `5173` is already in use, Vite chooses another one (for example, `5174`). The Vite proxy sends `/api` requests to `http://localhost:5000` by default; set `BACKEND_URL` if the backend uses another address. If the browser or terminal reports `ECONNREFUSED` for `/api` requests, make sure the backend is running and that `BACKEND_URL` points to it. Google sign-in returns to the active local frontend automatically; the Google OAuth client's authorized redirect URI must include `http://localhost:5000/api/auth/google/callback`.

3. **Build & Execute Standalone Production Bundle:**
   ```bash
   npm run build
   npm run start
   ```

---

## Deploy to Vercel

The root Vercel configuration builds the Vite frontend into `dist`; requests under `/api/*` are handled by the serverless function in `api/[...path].js`.

1. Import the repository into Vercel and keep the project root set to the repository root. Use `npx vite build` as the build command and `dist` as the output directory; these are also declared in `vercel.json`.
2. Add `MONGO_URI` (or `MONGODB_URI`) and a strong `JWT_SECRET` in the Vercel project environment variables. Use a MongoDB Atlas database user with only the permissions this application needs, and configure Atlas Network Access so Vercel can reach the cluster. Vercel deployments use dynamic egress IPs; use a supported static-egress option or configure Atlas access accordingly.
3. For the `https://dilg-workmate.vercel.app` production URL, set these Vercel Production variables:
   ```text
   FRONTEND_URL=https://dilg-workmate.vercel.app
   GOOGLE_REDIRECT_URI=https://dilg-workmate.vercel.app/api/auth/google/callback
   WEBAUTHN_RP_ID=dilg-workmate.vercel.app
   ```
   Add the exact `GOOGLE_REDIRECT_URI` above to **Authorized redirect URIs** for the same Google Web OAuth client whose ID is in `GOOGLE_CLIENT_ID`. Also set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in Vercel; do not expose the secret as a frontend variable. If the production domain changes, update these values and the Google OAuth client together.
4. Add OAuth, email, or SMS variables only when enabling those integrations. The backend reads `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM`, `FRONTEND_URL`, `UNISMS_API_KEY`, `UNISMS_API_URL`, `UNISMS_SENDER_ID`, and `UNISMS_WEBHOOK_SECRET`. Incoming SMS replies are rejected until `UNISMS_WEBHOOK_SECRET` is set to the same value configured in UniSMS. When UniSMS is configured, employees with a phone number receive an SMS confirmation after each Time In and Time Out. A Time In after `OFFICE_START_TIME` (Manila time, 24-hour `HH:MM`, default `08:00`) is marked late. This attendance verification flow does not require AWS.
5. Deploy from the Vercel dashboard or run `vercel --prod` from the repository root.

Do not commit `.env` files or put secrets in frontend variables. Default supervisor and HR accounts are only seeded when `SEED_DEFAULT_ACCOUNTS=true` and both `DEFAULT_SUPERVISOR_PASSWORD` and `DEFAULT_HR_ADMIN_PASSWORD` are set to unique passwords of at least 12 characters. Remove these seed variables after initial provisioning and rotate any existing credentials before exposing the deployment publicly.

### Attendance Selfie and Phone Biometric

Time In requires a captured selfie, an HR-approved biometric enrollment, an in-range GPS check, and a valid server-verified biometric assertion. In the Android employee app, the native fingerprint prompt authorizes an Android Keystore P-256 signing key to sign a short-lived server challenge; the matching public key is registered to the signed-in employee and the server validates each signature before issuing the attendance proof. The fingerprint itself never leaves Android. Rebuild and reinstall the Android app after native-module changes. Local release builds (`npm run build:android`) are signed only when `DILG_UPLOAD_STORE_FILE`, `DILG_UPLOAD_STORE_PASSWORD`, `DILG_UPLOAD_KEY_ALIAS`, and `DILG_UPLOAD_KEY_PASSWORD` are set in `~/.gradle/gradle.properties`; otherwise the release APK is left unsigned. Never commit the upload keystore or its passwords. In a regular mobile browser, attendance continues to use WebAuthn/passkeys. Browser registration and authentication challenges are stored independently per attempt and consumed once, so another tab or concurrent request does not overwrite the current fingerprint prompt's challenge. On a local network phone browser, use HTTPS; plain HTTP on a LAN IP is not a secure WebAuthn origin.

The backend locally compares a single face in the attendance selfie against the descriptor created from the approved enrollment selfie; it blocks clock-in when no face is detected, multiple faces are present, the template is unavailable, or the similarity threshold is not met. The initial Euclidean-distance threshold is `0.6` and is not calibrated on agency employees; evaluate false-accept and false-reject rates with consented representative samples before relying on it for employment decisions. This image comparison is **not** a liveness or anti-spoof check: printed photos, screen replays, and other presentation attacks may pass. The phone biometric verifies possession of the registered device key after local fingerprint authorization, not the employee's face.

HR/Admin employee records, account status, biometric enrollment images, and HR review decisions are loaded from and saved to MongoDB. HR-created employee accounts require an initial password, which is hashed before storage; pending accounts must be activated before employees can sign in. Accounts created from the sign-up form start as Pending with a server-assigned employee ID, so HR must review and activate them. Google sign-in only links to an existing, active account with the same verified email; it does not create accounts. The Android app completes Google sign-in with a one-time PKCE code, so rebuild the app after updating the backend.

#### Employee biometric enrollment

From **Profile → Biometric Enrollment**, an employee uploads the front and back of their government ID and captures a face selfie. Once all three images are ready, the app automatically uploads them for HR review; the backend saves the enrollment images and server-computed face descriptor to that employee's MongoDB record and notifies HR/Admin. If an upload fails, use the retry action shown in the enrollment view. Live camera preview requires HTTPS or `localhost`; if preview is unavailable on a mobile browser (for example, when using a LAN address), use **Use Device Camera / Choose Selfie** to capture or select the selfie instead.

#### HR/Admin review

HR/Admin can view enrollment images through the authenticated HR review screen and approve or reject the selected employee's pending submission. Approval requires a server-processed face descriptor; a normal enrollment must also have its required ID and selfie images on file. Rejection requires a reason, and the employee is notified to correct and resubmit. Approval enables the enrollment for attendance face matching. Enrollment images are restricted to authenticated HR review, and face descriptors remain server-side and are excluded from ordinary user responses.

#### Demo sample ID (testing only)

The enrollment screen provides **Use Sample ID (DEMO ONLY)** for workflow testing. It fills the ID image fields with fictional sample cards; the employee must still provide a real enrollment selfie so the server can process a face descriptor. Once the sample ID and selfie fields are complete, the submission is automatically uploaded and clearly marked as a demo enrollment in MongoDB and in the HR review screen. HR/Admin may approve a demo enrollment only to test attendance selfie matching. A demo approval **does not verify identity and must not be treated as approval of a real employee's government ID**. Use genuine employee documents for real identity review. Demo and normal attendance matching use the same face-comparison flow and limitations described above.

Existing HR-approved records without a face descriptor are upgraded from their approved enrollment selfie on their next attendance attempt.

Treat government ID images, enrollment selfies, and attendance selfie records as sensitive personal data; restrict access, use encrypted MongoDB storage and transport, establish an approved retention/deletion schedule and employee notice/consent process, and verify agency privacy/legal requirements before production use.

### Password Security Maintenance

New and reset passwords are hashed with bcrypt before MongoDB saves them. Run `npm run test:security` to test hashing and safe user responses. Before production use, back up the database, set `MONGODB_URI` in the shell or root `.env`, then run `npm run migrate:passwords` once to hash existing plaintext passwords. The migration skips empty and already-hashed passwords and reports how many records it changed. Initial admin seed passwords must be provided through environment variables, never committed to source control.
