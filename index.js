/* eslint-env browser */
const FSAccessChunkStore = require('fs-access-chunk-store')
const IDBChunkStore = require('idb-chunk-store')
const MemoryChunkStore = require('memory-chunk-store')
const CacheChunkStore = require('cache-chunk-store')

const isChrome = !!window.chrome

class HybridChunkStore {
  constructor (chunkLength, opts = {}) {
    this.chunkLength = Number(chunkLength)
    this.length = opts.length
    this.opts = opts
    if (!this.chunkLength) throw new Error('First argument must be a chunk length')

    this.fallbackStore = null
    this.chunkCount = null
    this.stores = []
    this.chunks = []

    this.registration = navigator.storage.estimate().then(estimate => {
      // use less than available
      const remaining = estimate.quota - estimate.usage - Math.max(Number(opts.reserved) || 0, 16777216)
      if ('getDirectory' in navigator.storage) {
        // lets hope the user isn't stupid enough to specify a directory with barely any storage, forgive me tech support people
        this._mapStore(FSAccessChunkStore, !(opts.rootDir) && remaining)
      } else {
        // WAH. https://i.kym-cdn.com/entries/icons/original/000/027/528/519.png
        this._mapStore(IDBChunkStore, !(isChrome && estimate.quota === 2147483648) && remaining)
      }
    })
  }

  // this is kinda stupid, first it makes the fallback store, then the main store
  // creates a store limited by targetLength, then uses memory as fallback/overflow
  _mapStore (TargetStore, targetLenght) {
    const newOpts = this.opts
    console.log(targetLenght < this.length, targetLenght, this.length)
    if (targetLenght && targetLenght < this.length) {
      this.chunkCount = Math.floor(targetLenght / this.chunkLength)
      const newLenght = this.chunkCount * this.chunkLength
      newOpts.length = this.length - newLenght
      // ideally this should be blob store, some1 make one pls
      this.fallbackStore = new MemoryChunkStore(this.chunkLength, newOpts)
      this.stores.push(this.fallbackStore)
      newOpts.length = newLenght
    }
    const store = new CacheChunkStore(new TargetStore(this.chunkLength, newOpts), { max: this.opts.max })
    this.stores.push(store)
    if (this.chunkCount) {
      this.chunks[this.chunkCount - 1] = store
      this.chunks.fill(store)
    } else {
      this.fallbackStore = store
    }
  }

  get (index, opts, cb = () => {}) {
    this.registration.then(() => {
      if (!this.chunks[index]) {
        this.fallbackStore.get(index - this.chunkCount, opts, cb)
        console.log(this.fallbackStore, index)
      } else {
        this.chunks[index].get(index, opts, cb)
        console.log(this.chunks[index], index)
      }
    })
  }

  put (index, buf, cb = () => {}) {
    this.registration.then(() => {
      if (!this.chunks[index]) {
        this.fallbackStore.put(index - this.chunkCount, buf, cb)
      } else {
        this.chunks[index].put(index, buf, cb)
      }
    })
  }

  close (cb = () => {}) {
    for (const store of this.stores) store.destroy(cb)
  }

  destroy (cb = () => {}) {
    for (const store of this.stores) store.close(cb)
  }
}

module.exports = HybridChunkStore
