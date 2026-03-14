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

namespace egret {

    /**
     * A generic typed object pool that reuses instances to reduce GC pressure.
     *
     * Objects are created lazily by a factory function and returned to the pool
     * via `release()`.  The pool imposes an optional maximum size to avoid
     * unbounded memory growth.
     *
     * Example – pooling temporary Point objects:
     * ```typescript
     * const pointPool = new egret.RenderObjectPool<egret.Point>(
     *     () => new egret.Point(),
     *     64          // cap at 64 pooled instances
     * );
     *
     * let p = pointPool.obtain();
     * p.setTo(10, 20);
     * // ... use p ...
     * pointPool.release(p);
     * ```
     *
     * @version Egret 5.4.1
     * @platform Web,Native
     */
    export class RenderObjectPool<T> {

        private _pool: T[] = [];
        private _factory: () => T;
        private _maxSize: number;

        /**
         * Creates a new pool.
         * @param factory   Function called to create a fresh object when the pool
         *                  is empty.
         * @param maxSize   Maximum number of objects retained in the pool.
         *                  Excess released objects are discarded.  Default: 256.
         */
        public constructor(factory: () => T, maxSize: number = 256) {
            this._factory = factory;
            this._maxSize = maxSize;
        }

        /**
         * Obtains an object from the pool.  If the pool is empty a new instance
         * is created via the factory function.
         */
        public obtain(): T {
            return this._pool.length > 0 ? this._pool.pop() : this._factory();
        }

        /**
         * Returns an object to the pool for future reuse.
         * Objects exceeding `maxSize` are silently dropped.
         * @param obj The object to recycle.
         */
        public release(obj: T): void {
            if (!obj) { return; }
            if (this._pool.length < this._maxSize) {
                this._pool.push(obj);
            }
        }

        /**
         * Pre-warms the pool by creating `count` objects up-front.
         * Call during application startup to avoid allocation spikes later.
         * @param count Number of objects to pre-allocate.
         */
        public prewarm(count: number): void {
            const limit = Math.min(count, this._maxSize);
            for (let i = this._pool.length; i < limit; i++) {
                this._pool.push(this._factory());
            }
        }

        /** Current number of objects sitting in the pool. */
        public get size(): number {
            return this._pool.length;
        }

        /** Empties the pool and discards all pooled objects. */
        public clear(): void {
            this._pool.length = 0;
        }
    }
}
