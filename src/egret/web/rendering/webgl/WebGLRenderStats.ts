//////////////////////////////////////////////////////////////////////////////////////
//
//  Copyright (c) 2014-present, Egret Technology.
//  All rights reserved.
//  Redistribution and use in source and binary forms, with or without
//  modification, are permitted provided that the following conditions are met:
//
//     * Redistributions of source code must retain the above copyright
//       notice, this list of conditions and the following disclaimer.
//     * Redistributions in binary form must reproduce the above copyright
//       notice, this list of conditions and the following disclaimer in the
//       documentation and/or other materials provided with the distribution.
//     * Neither the name of the Egret nor the
//       names of its contributors may be used to endorse or promote products
//       derived from this software without specific prior written permission.
//
//  THIS SOFTWARE IS PROVIDED BY EGRET AND CONTRIBUTORS "AS IS" AND ANY EXPRESS
//  OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES
//  OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED.
//  IN NO EVENT SHALL EGRET AND CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT,
//  INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
//  LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;LOSS OF USE, DATA,
//  OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF
//  LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING
//  NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE,
//  EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
//
//////////////////////////////////////////////////////////////////////////////////////

namespace egret.web {

    /**
     * WebGL rendering performance statistics.
     *
     * Tracks per-frame metrics such as draw calls, GPU batches, vertex count, and
     * frames per second. Developers can use this class to measure rendering
     * performance without modifying any existing interfaces.
     *
     * Usage:
     * ```typescript
     * // Enable collection (disabled by default to avoid overhead)
     * egret.web.WebGLRenderStats.instance.enabled = true;
     *
     * // In your ENTER_FRAME handler:
     * let stats = egret.web.WebGLRenderStats.instance;
     * console.log("FPS:", stats.fps.toFixed(1));
     * console.log("Draw calls:", stats.drawCallCount);
     * console.log("Batches:", stats.batchCount);
     * console.log("Vertices:", stats.vertexCount);
     * ```
     *
     * @version Egret 5.4.1
     * @platform Web
     */
    export class WebGLRenderStats {

        // ─── Singleton ────────────────────────────────────────────────────────────

        private static _instance: WebGLRenderStats = null;

        /**
         * Returns the global WebGLRenderStats singleton.
         */
        public static get instance(): WebGLRenderStats {
            if (!WebGLRenderStats._instance) {
                WebGLRenderStats._instance = new WebGLRenderStats();
            }
            return WebGLRenderStats._instance;
        }

        // ─── Configuration ────────────────────────────────────────────────────────

        /**
         * Whether stats collection is active.
         * Set to `true` to start collecting metrics.
         * Default: `false` (no overhead when disabled).
         */
        public enabled: boolean = false;

        // ─── Per-frame counters (read after endFrame()) ───────────────────────────

        /**
         * Number of WebGL `drawElements` calls issued in the most recently
         * completed frame.  Lower is better.
         */
        public drawCallCount: number = 0;

        /**
         * Number of render batches flushed to the GPU in the most recently
         * completed frame.  Each flush of `$drawWebGL` counts as one batch.
         */
        public batchCount: number = 0;

        /**
         * Total number of vertices submitted to the GPU in the most recently
         * completed frame.
         */
        public vertexCount: number = 0;

        /**
         * Wall-clock time (milliseconds) spent inside `$drawWebGL` during the
         * most recently completed frame.  Does not include application logic time.
         */
        public renderTime: number = 0;

        /**
         * Smoothed frames-per-second computed as an exponential moving average
         * over `fpsSmoothingFactor` frames.
         */
        public fps: number = 0;

        /**
         * EMA smoothing factor for FPS (range 0–1).
         * Smaller value → slower/smoother response; larger value → faster response.
         * Default: 0.1 (approximately 10-frame smoothing window).
         */
        public fpsSmoothingFactor: number = 0.1;

        // ─── Private accumulators ─────────────────────────────────────────────────

        private _frameDrawCalls: number = 0;
        private _frameBatches: number = 0;
        private _frameVertices: number = 0;
        private _frameRenderTime: number = 0;
        private _batchStartTime: number = 0;
        private _frameStartTime: number = 0;
        private _lastFrameEndTime: number = 0;

        private constructor() {}

        // ─── Public API ───────────────────────────────────────────────────────────

        /**
         * Call once at the very beginning of each frame (before any rendering).
         * Resets per-frame accumulators.
         */
        public beginFrame(): void {
            if (!this.enabled) { return; }
            this._frameDrawCalls = 0;
            this._frameBatches = 0;
            this._frameVertices = 0;
            this._frameRenderTime = 0;
            this._frameStartTime = WebGLRenderStats._now();
        }

        /**
         * Call once at the very end of each frame (after all rendering).
         * Copies accumulators into the public properties and updates FPS.
         */
        public endFrame(): void {
            if (!this.enabled) { return; }
            const now = WebGLRenderStats._now();
            this.drawCallCount = this._frameDrawCalls;
            this.batchCount = this._frameBatches;
            this.vertexCount = this._frameVertices;
            this.renderTime = this._frameRenderTime;

            // EMA-smoothed FPS
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

        /**
         * Called by `WebGLRenderContext.$drawWebGL` at the start of a GPU batch.
         * @internal
         */
        public _beginBatch(): void {
            if (!this.enabled) { return; }
            this._batchStartTime = WebGLRenderStats._now();
            this._frameBatches++;
        }

        /**
         * Called by `WebGLRenderContext.$drawWebGL` for each draw call within a batch.
         * @param vertexCount Number of vertices issued in this draw call.
         * @internal
         */
        public _recordDrawCall(vertexCount: number): void {
            if (!this.enabled) { return; }
            this._frameDrawCalls++;
            this._frameVertices += vertexCount;
        }

        /**
         * Called by `WebGLRenderContext.$drawWebGL` at the end of a GPU batch.
         * @internal
         */
        public _endBatch(): void {
            if (!this.enabled) { return; }
            this._frameRenderTime += WebGLRenderStats._now() - this._batchStartTime;
        }

        /**
         * Resets all statistics to zero and restarts FPS averaging.
         */
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
            this._batchStartTime = 0;
            this._frameStartTime = 0;
            this._lastFrameEndTime = 0;
        }

        // ─── Internal helpers ─────────────────────────────────────────────────────

        /**
         * Returns the current high-resolution timestamp in milliseconds.
         * Falls back to `Date.now()` when `performance` is unavailable.
         */
        private static _now(): number {
            if (typeof performance !== "undefined" && performance.now) {
                return performance.now();
            }
            return Date.now();
        }
    }
}
