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

### Minimal usage example

1. Import the component into an Angular module:

```ts
import { NgModule } from "@angular/core";
import { BrowserModule } from "@angular/platform-browser";
import { TextParticlesCanvasComponent } from "text-particles-animation/src/angular/TextParticlesCanvasComponent";

@NgModule({
  // If you already have a BrowserModule in your app, keep just the component declaration.
  imports: [BrowserModule],
  declarations: [TextParticlesCanvasComponent],
  exports: [TextParticlesCanvasComponent],
})
export class TextParticlesModule {}
```

2. Use it in a template:

```html
<text-particles-canvas
  [params]="{
    texts: ['HELLO', 'WORLD'],
    textIndex: 0,
    particleCount: 12000,
    mouseRadius: 120,
    mouseForce: 0.9,
    springStrength: 0.06,
    damping: 0.82,
    aliveNoiseAmplitude: 0.35,
    aliveNoiseFrequency: 0.9,
    textSwitchMode: 'auto',
    textSwitchIntervalMs: 2400
  }"
></text-particles-canvas>
```

3. Provide the `params` object from your component class (optional; you can inline it like above):

```ts
import { Component } from "@angular/core";
import { ParticleTextParams } from "text-particles-animation/src/lib/params";

@Component({
  selector: "app-demo",
  template: `<text-particles-canvas [params]="params"></text-particles-canvas>`,
})
export class AppDemoComponent {
  params: Partial<ParticleTextParams> = {
    texts: ["HELLO", "WORLD"],
    textIndex: 0,
    particleCount: 12000,
    mouseRadius: 120,
    mouseForce: 0.9,
    springStrength: 0.06,
    damping: 0.82,
    aliveNoiseAmplitude: 0.35,
    aliveNoiseFrequency: 0.9,
    textSwitchMode: "auto",
    textSwitchIntervalMs: 2400,
  };
}
```

