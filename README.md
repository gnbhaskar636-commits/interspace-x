# MissionForge

MissionForge is a browser-based spacecraft engineering laboratory. Assemble a
vehicle, review its engineering telemetry, and run mission simulations.

## Run locally

Requirements: Node.js 20 or newer.

```sh
npm ci
npm run dev
```

## Validate and build

```sh
npm test
npm run build
npm run preview
```

## Deploy to GitHub Pages

Before the first deployment, set **Settings → Pages → Build and deployment →
Source** to **GitHub Actions**, and set **Settings → Actions → General →
Workflow permissions** to **Read and write permissions**. The workflow itself
limits its token to the permissions required to build and publish. The
`Deploy to GitHub Pages` workflow then builds the app and publishes it whenever
changes are pushed to `main`. It can also be started manually from the
repository's **Actions** tab. The Pages site is served from the repository
subpath:
`https://gnbhaskar636-commits.github.io/interspace-x/`.
