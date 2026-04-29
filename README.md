# Text Particles Animation

Hero-style animation where thousands of particles converge into readable text, then react smoothly to mouse movement.

## Tech

- WebGL-first approach (WebGL2) for performance
- Canvas rendering (no DOM particles)
- TypeScript + Vite

## Quick start

```bash
npm install
npm run dev
```

The dev server serves `index.html` with a fullscreen canvas and a top-right controls overlay stub.

## Scripts

```bash
# Start the local dev server (Vite)
npm run dev

# TypeScript typecheck (no emit)
npm run typecheck

# Production build (typecheck + Vite build)
npm run build

# Alias for `npm run build`
npm test

# Serve the production build output locally (Vite preview)
npm run preview
```

## Angular integration

This repo includes a minimal Angular component at `src/angular/TextParticlesCanvasComponent.ts` (`selector: text-particles-canvas`) that mounts `ParticleTextApp` on `ngAfterViewInit` and disposes it on `ngOnDestroy`.

There is no Angular workspace/CLI config here (no `angular.json` app); to use the component, import it into your existing Angular project and let your Angular build system handle compilation/serving.

