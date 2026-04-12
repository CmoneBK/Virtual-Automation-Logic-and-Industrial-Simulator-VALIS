/// <reference types="@webgpu/types" />
import { mat4 } from 'wgpu-matrix'
import { mlsmpmParticleStructSize, MLSMPMSimulator } from './mls-mpm/mls-mpm'
import { renderUniformsViews, renderUniformsValues } from './camera'
import { FluidRenderer } from './render/fluidRender'

export interface SplashEngineAPI {
    /** Add fluid particles at canvas pixel position (x,y) with given pixel radius */
    addFluid(x: number, y: number, radiusPx: number, count?: number): void;
    /** Upload a new solid grid from VALIS solidGrid (100×75 pre-downsampled) */
    updateSolidGrid(cells: Uint8Array): void;
    /** Remove up to n particles — used by despawners */
    drain(n: number): void;
    /**
     * Density-based drain for a despawner zone (canvas pixel rect).
     * Removes particles proportional to what fraction of the active area the zone covers,
     * scaled by current particle count — so throughput matches fluid density.
     */
    drainZone(xPx: number, yPx: number, wPx: number, hPx: number): void;
    /** Current live particle count */
    getParticleCount(): number;
    /** Pause or resume the simulation */
    setPaused(paused: boolean): void;
    /** Destroy and free GPU resources */
    destroy(): void;
}

/**
 * Create and start the Splash WebGPU fluid engine on the given canvas.
 * The canvas should cover the VALIS factory area (e.g. 4000×3000 px).
 * canvasW/canvasH are the VALIS virtual canvas dimensions in pixels.
 */
export async function createSplashEngine(
    canvas: HTMLCanvasElement,
    canvasW: number = 4000,
    canvasH: number = 3000
): Promise<SplashEngineAPI> {
    if (!navigator.gpu) throw new Error('WebGPU not supported');

    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) throw new Error('WebGPU adapter not available');
    const device = await adapter.requestDevice();

    // Use a resolution scale to avoid extreme texture sizes
    // Splash renders at a downscaled resolution; CSS makes it fill the canvas
    const scale = 0.5;
    canvas.width = Math.round(canvasW * scale);
    canvas.height = Math.round(canvasH * scale);

    const context = canvas.getContext('webgpu') as GPUCanvasContext;
    if (!context) throw new Error('Could not get WebGPU context');

    const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
    context.configure({ device, format: presentationFormat, alphaMode: 'premultiplied' });

    // 2× world-unit scale: 1 world unit = 20 CSS px (vs old 40 CSS px).
    // Sphere CSS radius = renderRadius × ACTIVE_Y/canvasH → 0.25 × 20 = 5 CSS px.
    // Same 40px spawn radius = 2 world units, same visual blob size as original.
    const BOX_X = 204, BOX_Y = 154, BOX_Z = 4;
    const ACTIVE_X = BOX_X - 4, ACTIVE_Y = BOX_Y - 4; // 200×150 — visible area
    const initBoxSize = [BOX_X, BOX_Y, BOX_Z];
    const maxParticleCount = 200000;
    const maxGridCount = BOX_X * BOX_Y * BOX_Z; // 125664
    const fixedPointMultiplier = 1e7;
    const mlsmpmRadius = 0.5;             // sphere radius in world units (half a grid cell)
    const mlsmpmDiameter = 2 * mlsmpmRadius;
    const fov = 60 * Math.PI / 180;

    // Shared buffers
    const particleBuffer = device.createBuffer({
        size: mlsmpmParticleStructSize * maxParticleCount,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    const posvelBuffer = device.createBuffer({
        size: 32 * maxParticleCount,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    const renderUniformBuffer = device.createBuffer({
        size: renderUniformsValues.byteLength,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    const initBoxSizeBuffer = device.createBuffer({
        size: 12,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    // Depth map texture
    const depthMapTexture = device.createTexture({
        size: [canvas.width, canvas.height],
        format: 'r32float',
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    });

    // Density grid (for volumetric rendering mode)
    const densityGridSizeX = BOX_X, densityGridSizeY = BOX_Y;
    const densityGridSizeZ = Math.ceil(BOX_Z / 128) * 128;
    const densityGridSize = [densityGridSizeX, densityGridSizeY, densityGridSizeZ];
    const densityGridBuffer = device.createBuffer({
        size: 4 * densityGridSizeX * densityGridSizeY * densityGridSizeZ,
        usage: GPUBufferUsage.STORAGE,
    });
    const castedDensityGridBuffer = device.createBuffer({
        size: 2 * densityGridSizeX * densityGridSizeY * densityGridSizeZ,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
    });
    const densityGridSizeBuffer = device.createBuffer({
        size: 12,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(densityGridSizeBuffer, 0, new Float32Array(densityGridSize));
    const densityGridTexture = device.createTexture({
        size: [densityGridSizeZ, densityGridSizeY, densityGridSizeX],
        format: 'r16float',
        dimension: '3d',
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });

    // Minimal cubemap (1×1 per face, neutral grey)
    const cubemapTexture = device.createTexture({
        dimension: '2d',
        size: [1, 1, 6],
        format: 'rgba8unorm',
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
    });
    const grey = new Uint8Array([200, 200, 200, 255]); // neutral grey env — drops look glassy, pools tint from absorption
    for (let i = 0; i < 6; i++) {
        device.queue.writeTexture({ texture: cubemapTexture, origin: [0, 0, i] }, grey, { bytesPerRow: 4 }, [1, 1]);
    }
    const cubemapTextureView = cubemapTexture.createView({ dimension: 'cube' });

    device.queue.writeBuffer(initBoxSizeBuffer, 0, new Float32Array(initBoxSize));

    const simulator = new MLSMPMSimulator(
        particleBuffer, posvelBuffer, renderUniformBuffer,
        densityGridBuffer, castedDensityGridBuffer,
        initBoxSizeBuffer, densityGridSizeBuffer,
        device, depthMapTexture.createView(), canvas,
        maxGridCount, maxParticleCount, fixedPointMultiplier, mlsmpmDiameter
    );

    // renderRadius = 1.1 × physics radius → surface layers have lower density (~3/wu³)
    // than bulk fluid. At density 3, spacing ≈ 6.9 GPU px. Need sphere diameter > spacing.
    // 1.1 × 0.5 × 2 × 10 = 11 GPU px > 6.9 px → no gaps on thin surfaces.
    const renderRadius = mlsmpmRadius * 1.1;

    const renderer = new FluidRenderer(
        renderUniformBuffer, posvelBuffer, densityGridSizeBuffer, initBoxSizeBuffer,
        device,
        depthMapTexture.createView(), cubemapTextureView, densityGridTexture.createView(),
        canvas,
        presentationFormat,
        renderRadius, fov, fixedPointMultiplier
    );

    // Camera targets the center of the ACTIVE zone (inner 100×75) so the 2-unit
    // boundary margin falls outside the visible canvas on all sides.
    const aspect = canvas.width / canvas.height;
    const projection = mat4.perspective(fov, aspect, 0.1, 500);
    renderUniformsViews.projectionMatrix.set(projection);
    renderUniformsViews.invProjectionMatrix.set(mat4.inverse(projection));

    const target = [BOX_X / 2, BOX_Y / 2, BOX_Z / 2]; // center of full box = center of active zone
    const camDist = (ACTIVE_Y / 2) / Math.tan(fov / 2); // distance so active height (75) fills canvas
    const eyePos = [BOX_X / 2, BOX_Y / 2, BOX_Z / 2 + camDist];
    const view = mat4.lookAt(eyePos, target, [0, 1, 0]);
    renderUniformsViews.viewMatrix.set(view);
    renderUniformsViews.invViewMatrix.set(mat4.inverse(view));
    renderUniformsViews.texelSize.set([1.0 / canvas.width, 1.0 / canvas.height]);
    renderUniformsViews.sphereSize.set([renderRadius * 2]);
    device.queue.writeBuffer(renderUniformBuffer, 0, renderUniformsValues);

    simulator.reset(initBoxSize, 0); // start empty, VALIS adds fluid

    let running = true;
    let destroyed = false;

    function frame() {
        if (destroyed) return;

        if (running) {
            renderUniformsViews.texelSize.set([1.0 / canvas.width, 1.0 / canvas.height]);
            renderUniformsViews.sphereSize.set([renderRadius * 2]);
            device.queue.writeBuffer(renderUniformBuffer, 0, renderUniformsValues);

            const cmd = device.createCommandEncoder();
            // 3 substeps per frame at dt=0.4 (original Splash cadence)
            for (let s = 0; s < 3; s++) {
                simulator.execute(
                    cmd,
                    [0, 0],
                    [0, 0],
                    0,
                    false,
                    0.4,
                    true,
                    densityGridSize
                );
            }
            // Position-based drain: remove particles inside despawner zones
            const hasDrain = simulator._drainZoneQueue.length > 0;
            if (hasDrain) {
                simulator.runDrain(cmd);
                simulator.runCopyPosition(cmd); // refresh posvelBuffer with compacted order
            }
            renderer.execute(context, cmd, simulator.numParticles, false, [140/255, 220/255, 240/255], 0.7);
            device.queue.submit([cmd.finish()]);
            if (hasDrain) simulator.scheduleCounterReadback();
        }

        requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);

    return {
        addFluid(x: number, y: number, radiusPx: number, count: number = 500) {
            const nx = x / canvasW;
            const ny = y / canvasH;
            const nr = radiusPx / canvasW;
            simulator.addParticles(nx, ny, nr, count, initBoxSize);
        },

        updateSolidGrid(cells: Uint8Array) {
            simulator.updateSolidGrid(cells);
        },

        drain(n: number) {
            if (n > 0 && simulator.numParticles > 0) {
                simulator.changeNumParticles(Math.max(0, simulator.numParticles - n));
            }
        },

        drainZone(xPx: number, yPx: number, wPx: number, hPx: number) {
            if (simulator.numParticles <= 0) return;
            // Convert CSS pixel rect → Splash world-space rect
            // World X: MARGIN + (px/canvasW) * ACTIVE_X
            // World Y: MARGIN + (1 - py/canvasH) * ACTIVE_Y  (Y-flip: VALIS Y-down → Splash Y-up)
            const MARGIN = 2;
            const wxMin = MARGIN + (xPx / canvasW) * ACTIVE_X;
            const wxMax = MARGIN + ((xPx + wPx) / canvasW) * ACTIVE_X;
            const wyMin = MARGIN + (1 - (yPx + hPx) / canvasH) * ACTIVE_Y;
            const wyMax = MARGIN + (1 - yPx / canvasH) * ACTIVE_Y;
            simulator.queueDrainZone(wxMin, wyMin, wxMax - wxMin, wyMax - wyMin);
        },

        getParticleCount(): number {
            return simulator.numParticles;
        },

        setPaused(paused: boolean) {
            running = !paused;
        },

        destroy() {
            destroyed = true;
            device.destroy();
        },
    };
}
