# Intellika Tutor Platform

Intellika is a ready-to-publish JavaScript project for tutors. It includes:

- dashboard with student and revenue overview
- student CRM with profiles and balances
- homework review board
- student portals
- lesson calendar
- email/password authentication
- Cloud Firestore database support
- teacher and student roles
- separate student registration by access code
- homework tasks with attached images

## Run locally

Requirements:

- Node.js 18+

Commands:

```bash
npm start
```

The app will open at:

```text
http://localhost:3000
```

## Demo mode and cloud mode

The project supports two modes:

- Demo mode: works immediately after clone and stores data locally
- Firebase mode: uses separate teacher/student registration, login and Cloud Firestore

If `firebase-config.js` still contains placeholder values, the app runs in demo mode.

## Enable Firebase Auth and Firestore

### 1. Create a Firebase project

In Firebase Console:

1. Create a project
2. Add a Web app
3. Copy the web config object

### 2. Enable authentication

In Firebase Console:

1. Open `Authentication`
2. Open `Sign-in method`
3. Enable `Email/Password`

### 3. Enable Cloud Firestore

In Firebase Console:

1. Open `Firestore Database`
2. Create a database
3. Start in production or test mode

### 4. Paste config into the project

Open [firebase-config.js](/Users/yaromirtribunsky/Documents/Codex/2026-04-25/javascript-import-react-usestate-useeffect-from/firebase-config.js) and replace the placeholder values with your Firebase web config, then set:

```js
enabled: true
```

### 5. Apply Firestore rules

Use [firestore.rules](/Users/yaromirtribunsky/Documents/Codex/2026-04-25/javascript-import-react-usestate-useeffect-from/firestore.rules) in Firebase Console under:

`Firestore Database -> Rules`

These rules isolate each tutor's data under their own `users/{uid}` path.
Students can only read the student profile, lessons and homework that are linked to their own `teacherId` and `studentId`.

## Project structure

```text
.
├── app.js
├── firebase-config.js
├── firebase.js
├── firestore.rules
├── index.html
├── package.json
├── server.js
└── styles.css
```

## Publish to GitHub Pages

This project is already configured for GitHub Pages through GitHub Actions.

### 1. Create a GitHub repository

Create a new repository on GitHub and push this folder into the `main` branch.

Example:

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPOSITORY.git
git push -u origin main
```

### 2. Enable GitHub Pages

In your GitHub repository:

1. Open `Settings`
2. Open `Pages`
3. In `Build and deployment`, choose `GitHub Actions`

After that, every push to `main` will redeploy the site automatically.

### 3. Open the published site

GitHub Pages will publish the site at:

```text
https://YOUR_USERNAME.github.io/YOUR_REPOSITORY/
```

If you create a user site repository named `YOUR_USERNAME.github.io`, then the URL will be:

```text
https://YOUR_USERNAME.github.io/
```

## Other deployment options

You can also deploy it as a static site on Netlify, Vercel or Cloudflare Pages, or as a Node app with:

```bash
npm start
```

## Notes

- Without Firebase config, the app uses demo local storage.
- With Firebase config, registration and login use Firebase Authentication and app data uses Cloud Firestore.
