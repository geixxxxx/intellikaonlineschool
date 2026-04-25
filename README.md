# Intellika Tutor Platform

Intellika is a ready-to-publish JavaScript project for tutors. It includes:

- dashboard with student and revenue overview
- student CRM with profiles and balances
- homework review board
- student portals
- lesson calendar

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

## Project structure

```text
.
├── app.js
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

- Data is currently stored in `localStorage`.
- For production with real users, the next step is connecting a backend such as Firebase, Supabase or a custom API.
