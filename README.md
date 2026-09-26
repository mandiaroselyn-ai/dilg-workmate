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
4. Add OAuth, email, SMS, or AWS Rekognition variables only when enabling those integrations. The backend reads `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM`, `FRONTEND_URL`, `UNISMS_API_KEY`, `UNISMS_API_URL`, `UNISMS_SENDER_ID`, and the `AWS_*` face-verification settings.
5. Deploy from the Vercel dashboard or run `vercel --prod` from the repository root.

Do not commit `.env` files or put secrets in frontend variables. Default supervisor and HR accounts are only seeded when `SEED_DEFAULT_ACCOUNTS=true` and both `DEFAULT_SUPERVISOR_PASSWORD` and `DEFAULT_HR_ADMIN_PASSWORD` are set to unique passwords of at least 12 characters. Remove these seed variables after initial provisioning and rotate any existing credentials before exposing the deployment publicly.

### Password Security Maintenance

New and reset passwords are hashed with bcrypt before MongoDB saves them. Run `npm run test:security` to test hashing and safe user responses. Before production use, back up the database, set `MONGODB_URI` in the shell or root `.env`, then run `npm run migrate:passwords` once to hash existing plaintext passwords. The migration skips empty and already-hashed passwords and reports how many records it changed. Initial admin seed passwords must be provided through environment variables, never committed to source control.
