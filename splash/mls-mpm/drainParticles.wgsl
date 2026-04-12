// drainParticles.wgsl
// Stream-compaction pass: removes particles whose (x,y) falls inside any drain zone.
// Drain zones are in Splash world-space (x, y, width, height).
//
// Particle struct is 80 bytes = 20 x u32, with position at bytes 0-11 (3 x f32).

@group(0) @binding(0) var<storage, read>       inParticles:   array<u32>;
@group(0) @binding(1) var<storage, read_write> outParticles:  array<u32>;
@group(0) @binding(2) var<storage, read_write> counter:       array<atomic<u32>>;
@group(0) @binding(3) var<uniform>             numParticles:  u32;
@group(0) @binding(4) var<storage, read>       drainZones:    array<vec4f>;   // (x, y, width, height) world units
@group(0) @binding(5) var<uniform>             numDrainZones: u32;

const PARTICLE_U32S: u32 = 20u; // 80 bytes / 4 bytes per u32

@compute @workgroup_size(64)
fn drainParticles(@builtin(global_invocation_id) id: vec3u) {
    if (id.x >= numParticles) { return; }

    let base = id.x * PARTICLE_U32S;
    let px = bitcast<f32>(inParticles[base + 0u]);
    let py = bitcast<f32>(inParticles[base + 1u]);

    var inDrain = false;
    for (var z = 0u; z < numDrainZones; z++) {
        let zone = drainZones[z]; // .x=xMin .y=yMin .z=width .w=height
        if (px >= zone.x && px <= zone.x + zone.z &&
            py >= zone.y && py <= zone.y + zone.w) {
            inDrain = true;
            break;
        }
    }

    if (!inDrain) {
        let outIdx = atomicAdd(&counter[0], 1u);
        let outBase = outIdx * PARTICLE_U32S;
        for (var i = 0u; i < PARTICLE_U32S; i++) {
            outParticles[outBase + i] = inParticles[base + i];
        }
    }
}
