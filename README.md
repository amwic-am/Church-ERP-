# Church ERP demo

A church and Sunday school administration platform built with React, TypeScript, Vite, Tailwind CSS, and Supabase. The interface includes Amharic and English support.

## Getting started

1. Install dependencies with `npm install`.
2. Copy `.env.example` to `.env.local` and add your Supabase project URL and public anon key.
3. Start the development server with `npm run dev`.

Run `npm run build` to type-check and create a production build.

## Deploy to Cloudflare Workers

The Wrangler configuration serves the built `dist` directory and supports client-side routes. Build before deploying:

```sh
npm run build
npx wrangler deploy
```
