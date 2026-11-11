# AeroMind frontend

The React and TypeScript web client for the [AeroMind Maintenance Suite](../README.md).

## Run locally

From this directory:

```bash
npm ci
```

Create a `.env.local` file:

```dotenv
VITE_API_URL=http://127.0.0.1:8000
```

Start the Vite development server:

```bash
npm run dev
```

Create a production build with:

```bash
npm run build
```

The API base URL is configured through `VITE_API_URL`. The deployed Render Static Site uses the public FastAPI service URL. See the root README for architecture, demo limitations, data notes, and deployment configuration.

## Preview

- [Open the live AeroMind demo](https://aeromind-maintenance-suite.onrender.com/)
- [Open the API documentation](https://aeromind-koqx.onrender.com/docs)

The live dashboard uses cached predictions for simulated NASA C-MAPSS data. It is a hackathon prototype and does not perform live aircraft monitoring.
