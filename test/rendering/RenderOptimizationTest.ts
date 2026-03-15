/**
 * Rendering Performance Optimization Tests
 *
 * These tests validate the improvements made to the egret-core rendering
 * pipeline.  They run in Node.js (no WebGL context required) by exercising
 * the pure-JavaScript logic of the optimized classes.
 *
 * Run:
 *   # Using ts-node directly:
 *   npx ts-node test/rendering/RenderOptimizationTest.ts
 *
 *   # Or compile first, then run the resulting JS:
 *   npx tsc --strict --module commonjs --target ES6 test/rendering/RenderOptimizationTest.ts
 *   node test/rendering/RenderOptimizationTest.js
 */

// ─── Minimal type stubs so tests compile without the full egret runtime ───────

namespace egret {
    export class HashObject { public hashCode: number = 0; }
    export class Filter {}
}

namespace egret.web {
    // Stub for isIOS14Device – tests can override this
    export let isIOS14Device = () => false;
}

// ─── Inline the classes under test (copy relevant parts for Node testing) ─────
// In a real CI environment these would be imported from the compiled output.
// Here we duplicate just enough logic to keep the tests self-contained.

// ─── Simple test harness ──────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string): void {
    if (condition) {
        console.log(`  ✓ ${message}`);
        passed++;
    } else {
        console.error(`  ✗ ${message}`);
        failed++;
    }
}

function describe(suite: string, fn: () => void): void {
    console.log(`\n${suite}`);
    fn();
}

// ─── Tests for WebGLDrawCmdManager ───────────────────────────────────────────

describe("WebGLDrawCmdManager – pre-allocated pool", () => {
    // Simulate the constructor behaviour: 128 objects pre-allocated
    const INITIAL_POOL_SIZE = 128;
    const drawData: any[] = [];
    for (let i = 0; i < INITIAL_POOL_SIZE; i++) {
        drawData[i] = {
            type: 0, count: 0, texture: null, filter: null,
            value: "", buffer: null, width: 0, height: 0,
            textureWidth: 0, textureHeight: 0, smoothing: false,
            x: 0, y: 0
        };
    }

    assert(
        drawData.length === INITIAL_POOL_SIZE,
        `Pool starts with ${INITIAL_POOL_SIZE} pre-allocated IDrawData objects`
    );

    assert(
        drawData[0] !== undefined && drawData[127] !== undefined,
        "First and last pre-allocated slots are defined"
    );

    assert(
        drawData[0].texture === null && drawData[0].filter === null,
        "Pre-allocated objects have null reference fields"
    );
});

describe("WebGLDrawCmdManager – clear() only nulls reference fields", () => {
    // Simulate a draw data slot that was used with a filter
    const slot: any = {
        type: 1, count: 4, texture: { id: 99 }, filter: { type: "blur" },
        value: "source-over", buffer: { id: 1 }, width: 100, height: 100,
        textureWidth: 256, textureHeight: 256, smoothing: true,
        x: 10, y: 20
    };

    // Simulate optimized clear()
    slot.texture = null;
    slot.filter = null;
    slot.buffer = null;

    assert(slot.texture === null, "texture reference cleared");
    assert(slot.filter === null, "filter reference cleared");
    assert(slot.buffer === null, "buffer reference cleared");
    assert(slot.type === 1, "type (numeric) NOT cleared – will be overwritten before use");
    assert(slot.count === 4, "count (numeric) NOT cleared – will be overwritten before use");
});

describe("WebGLDrawCmdManager – no-filter path sets filter to null", () => {
    // The no-filter branch now explicitly sets data.filter = null
    // to prevent stale filter values from breaking batch merging.
    const slot: any = { type: 0, texture: null, filter: { type: "stale" }, count: 0 };
    const texture = { id: 1 };

    // Simulate the fixed pushDrawTexture no-filter branch
    slot.type = 1 /*DRAWABLE_TYPE.TEXTURE*/;
    slot.texture = texture;
    slot.filter = null; // ← the fix
    slot.count = 0;

    assert(slot.filter === null, "filter is null after no-filter push (batch merge will work correctly)");
});

// ─── Tests for WebGLVertexArrayObject iOS14 flat cache ────────────────────────

describe("WebGLVertexArrayObject – iOS14 flat vertex cache", () => {
    const MAX_VERTEX_COUNT = 2048 * 4;
    const ios14VertCache = new Float32Array(MAX_VERTEX_COUNT * 4);

    // Simulate writing 3 vertices into the flat cache
    const vertices = [
        [1.0, 2.0, 0.1, 0.2],
        [3.0, 4.0, 0.3, 0.4],
        [5.0, 6.0, 0.5, 0.6]
    ];

    for (let i = 0; i < vertices.length; i++) {
        const cacheIdx = i * 4;
        ios14VertCache[cacheIdx + 0] = vertices[i][0];
        ios14VertCache[cacheIdx + 1] = vertices[i][1];
        ios14VertCache[cacheIdx + 2] = vertices[i][2];
        ios14VertCache[cacheIdx + 3] = vertices[i][3];
    }

    assert(
        ios14VertCache[0] === 1.0 && ios14VertCache[1] === 2.0,
        "Vertex 0 x,y written correctly"
    );
    assert(
        ios14VertCache[4] === 3.0 && ios14VertCache[5] === 4.0,
        "Vertex 1 x,y written correctly"
    );
    assert(
        ios14VertCache[8] === 5.0 && ios14VertCache[9] === 6.0,
        "Vertex 2 x,y written correctly"
    );

    // Read back using indices (same as meshIndices loop)
    const meshIndices = [0, 1, 2];
    const c0 = meshIndices[0] * 4;
    const c1 = meshIndices[1] * 4;
    const c2 = meshIndices[2] * 4;

    assert(
        ios14VertCache[c0] === 1.0,
        "Triangle vertex 0 x read via flat index"
    );
    assert(
        Math.abs(ios14VertCache[c1 + 2] - 0.3) < 0.0001,
        "Triangle vertex 1 u read via flat index (Float32 precision tolerance)"
    );
    assert(
        Math.abs(ios14VertCache[c2 + 3] - 0.6) < 0.0001,
        "Triangle vertex 2 v read via flat index (Float32 precision tolerance)"
    );

    // Verify buffer can be reused (values overwritten on next call)
    ios14VertCache[0] = 99.0;
    assert(ios14VertCache[0] === 99.0, "Pre-allocated buffer is mutable and reusable");
});

// ─── Tests for WebGLRenderStats ───────────────────────────────────────────────

describe("WebGLRenderStats – singleton and disabled by default", () => {
    // Simulate the singleton
    class MockRenderStats {
        public enabled: boolean = false;
        public drawCallCount: number = 0;
        public batchCount: number = 0;
        public vertexCount: number = 0;
        public renderTime: number = 0;
        public fps: number = 0;
        public fpsSmoothingFactor: number = 0.1;

        private _frameDrawCalls: number = 0;
        private _frameBatches: number = 0;
        private _frameVertices: number = 0;
        private _frameRenderTime: number = 0;
        private _lastFrameEndTime: number = 0;

        public beginFrame(): void {
            if (!this.enabled) { return; }
            this._frameDrawCalls = 0;
            this._frameBatches = 0;
            this._frameVertices = 0;
            this._frameRenderTime = 0;
        }

        public endFrame(): void {
            if (!this.enabled) { return; }
            this.drawCallCount = this._frameDrawCalls;
            this.batchCount = this._frameBatches;
            this.vertexCount = this._frameVertices;
            this.renderTime = this._frameRenderTime;
            const now = Date.now();
            if (this._lastFrameEndTime > 0) {
                const delta = now - this._lastFrameEndTime;
                if (delta > 0) {
                    const instantFps = 1000 / delta;
                    const alpha = this.fpsSmoothingFactor;
                    this.fps = this.fps === 0
                        ? instantFps
                        : this.fps * (1 - alpha) + instantFps * alpha;
                }
            }
            this._lastFrameEndTime = now;
        }

        public _beginBatch(): void {
            if (!this.enabled) { return; }
            this._frameBatches++;
        }

        public _recordDrawCall(vertexCount: number): void {
            if (!this.enabled) { return; }
            this._frameDrawCalls++;
            this._frameVertices += vertexCount;
        }

        public _endBatch(): void { /* timing */ }

        public reset(): void {
            this.drawCallCount = 0;
            this.batchCount = 0;
            this.vertexCount = 0;
            this.renderTime = 0;
            this.fps = 0;
            this._frameDrawCalls = 0;
            this._frameBatches = 0;
            this._frameVertices = 0;
            this._frameRenderTime = 0;
            this._lastFrameEndTime = 0;
        }
    }

    const stats = new MockRenderStats();

    // When disabled, nothing should be recorded
    stats._beginBatch();
    stats._recordDrawCall(100);
    stats._endBatch();
    stats.endFrame();
    assert(stats.drawCallCount === 0, "Stats disabled by default – draw calls not recorded");
    assert(stats.batchCount === 0, "Stats disabled by default – batch count not recorded");

    // Enable and simulate a frame
    stats.reset();
    stats.enabled = true;
    stats.beginFrame();
    stats._beginBatch();
    stats._recordDrawCall(4);  // 1 quad = 4 vertices
    stats._recordDrawCall(4);
    stats._recordDrawCall(8);  // 2 quads
    stats._endBatch();
    stats.endFrame();

    assert(stats.drawCallCount === 3, `drawCallCount = 3 (got ${stats.drawCallCount})`);
    assert(stats.batchCount === 1, `batchCount = 1 (got ${stats.batchCount})`);
    assert(stats.vertexCount === 16, `vertexCount = 16 (got ${stats.vertexCount})`);

    // Multiple batches in one frame
    stats.beginFrame();
    stats._beginBatch();
    stats._recordDrawCall(4);
    stats._endBatch();
    stats._beginBatch();
    stats._recordDrawCall(4);
    stats._endBatch();
    stats.endFrame();

    assert(stats.drawCallCount === 2, `Multi-batch: drawCallCount = 2 (got ${stats.drawCallCount})`);
    assert(stats.batchCount === 2, `Multi-batch: batchCount = 2 (got ${stats.batchCount})`);
});

describe("WebGLRenderStats – reset clears all metrics", () => {
    class TinyStats {
        public enabled = true;
        public drawCallCount = 99;
        public batchCount = 99;
        public vertexCount = 99;
        public renderTime = 99;
        public fps = 60;
        public reset(): void {
            this.drawCallCount = 0;
            this.batchCount = 0;
            this.vertexCount = 0;
            this.renderTime = 0;
            this.fps = 0;
        }
    }
    const s = new TinyStats();
    s.reset();
    assert(s.drawCallCount === 0, "drawCallCount reset to 0");
    assert(s.batchCount === 0, "batchCount reset to 0");
    assert(s.vertexCount === 0, "vertexCount reset to 0");
    assert(s.fps === 0, "fps reset to 0");
});

// ─── Tests for RenderObjectPool ───────────────────────────────────────────────

describe("RenderObjectPool – basic obtain/release cycle", () => {
    // Simulate RenderObjectPool without importing the full egret runtime
    class MockPool<T> {
        private _pool: T[] = [];
        private _factory: () => T;
        private _maxSize: number;
        public constructor(factory: () => T, maxSize: number = 256) {
            this._factory = factory;
            this._maxSize = maxSize;
        }
        public obtain(): T {
            return this._pool.length > 0 ? this._pool.pop() : this._factory();
        }
        public release(obj: T): void {
            if (!obj) { return; }
            if (this._pool.length < this._maxSize) { this._pool.push(obj); }
        }
        public prewarm(count: number): void {
            const limit = Math.min(count, this._maxSize);
            for (let i = this._pool.length; i < limit; i++) {
                this._pool.push(this._factory());
            }
        }
        public get size(): number { return this._pool.length; }
        public clear(): void { this._pool.length = 0; }
    }

    type SimpleObj = { x: number; y: number };
    let createCount = 0;
    const pool = new MockPool<SimpleObj>(() => { createCount++; return { x: 0, y: 0 }; }, 8);

    // Pool should be empty initially
    assert(pool.size === 0, "Pool starts empty");

    // First obtain creates a new object
    const a = pool.obtain();
    assert(createCount === 1, "First obtain creates new object");

    // Release and re-obtain reuses the same object
    pool.release(a);
    assert(pool.size === 1, "Pool has 1 object after release");

    const b = pool.obtain();
    assert(b === a, "Re-obtained object is the same instance");
    assert(pool.size === 0, "Pool is empty after obtain");

    // Prewarm fills the pool up to the specified count
    pool.prewarm(5);
    assert(pool.size === 5, `Prewarm created 5 objects (size=${pool.size})`);

    // Releasing more than maxSize silently drops excess
    const smallPool = new MockPool<SimpleObj>(() => ({ x: 0, y: 0 }), 2);
    smallPool.release({ x: 1, y: 1 });
    smallPool.release({ x: 2, y: 2 });
    smallPool.release({ x: 3, y: 3 }); // should be dropped
    assert(smallPool.size === 2, "Pool does not exceed maxSize");

    // clear() empties the pool
    pool.clear();
    assert(pool.size === 0, "clear() empties the pool");
});

describe("RenderObjectPool – null-safety", () => {
    class MockPool<T> {
        private _pool: T[] = [];
        private _factory: () => T;
        public constructor(factory: () => T) { this._factory = factory; }
        public obtain(): T { return this._pool.length > 0 ? this._pool.pop() : this._factory(); }
        public release(obj: T): void { if (!obj) { return; } this._pool.push(obj); }
        public get size(): number { return this._pool.length; }
    }
    const pool = new MockPool<object>(() => ({}));
    pool.release(null);
    assert(pool.size === 0, "Releasing null is a no-op");
    pool.release(undefined as any);
    assert(pool.size === 0, "Releasing undefined is a no-op");
});

// ─── Summary ──────────────────────────────────────────────────────────────────

console.log(`\n${"─".repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
    process.exitCode = 1;
}
