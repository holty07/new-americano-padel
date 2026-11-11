# Americano Padel

A React application for building fair Americano padel schedules with full partner coverage and balanced rests, then tracking points.

## Live Demo

The app is deployed on **GitHub Pages** at:

**https://holty07.github.io/new-americano-padel/**

## Deployment

This project is automatically deployed to GitHub Pages using GitHub Actions. The workflow (`.github/workflows/deploy.yml`):

- Triggers on every push to the `main` branch
- Installs dependencies, builds the app with `npm run build`
- Publishes the `./dist` folder to GitHub Pages using the `peaceiris/actions-gh-pages` action

The built static files are in the `dist/` directory after running `npm run build`.

## Local Development

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) to view the app locally.

## Available Scripts

- `npm run dev` — Start development server
- `npm run build` — Build for production
- `npm run preview` — Preview the production build locally
- `npm run typecheck` — Check TypeScript types