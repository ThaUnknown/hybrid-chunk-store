/* eslint-env browser */
const FSAccessChunkStore = require('fs-access-chunk-store')
const IDBChunkStore = require('idb-chunk-store')
const MemoryChunkStore = require('memory-chunk-store')

const isChrome = !!window.chrome

class HybridChunkStore {
  constructor (chunkLength, opts = {}) {
    this.chunkLength = Number(chunkLength)
    if (!this.chunkLength) throw new Error('First argument must be a chunk length')

    this.fallbackStore = null
    this.stores = []
    this.chunks = []

    this.registration = navigator.storage.estimate().then(estimate => {
      if ('getDirectory' in navigator.storage) {
        this.stores.fsa = new FSAccessChunkStore(this.chunkLength, opts)
        if (opts.rootDir) {
        // lets hope the user isn't stupid enough to specify a directory with barely any storage, forgive me tech support people
          this.fallbackStore = this.stores.fsa
        } else {
          this._mapStore(estimate.quota - estimate.usage, this.stores.fsa)
        }
      } else {
        this.stores.idb = new IDBChunkStore(this.chunkLength, opts)
        if (isChrome && estimate.quota === 2147483648) {
        // WAH. https://i.kym-cdn.com/entries/icons/original/000/027/528/519.png
          this.fallbackStore = this.stores.idb
        } else {
          this._mapStore(estimate.quota - estimate.usage, this.stores.fsa)
        }
      }
      // ideally this should be blob store, some1 make one pls
      if (!this.fallbackStore) this.stores.mem = this.fallbackStore = new MemoryChunkStore(this.chunkLength, opts)
    })
  }

  _mapStore (length, store) {
    this.chunks[Math.floor(length / this.chunkLength) - 1] = store
    this.chunks.fill(store)
  }

  async get (index, opts, cb = () => {}) {
    await this.registration
    if (!this.chunks[index]) {
      this.fallbackStore.get(index - this.chunks.length, opts, cb)
    } else {
      this.chunks[index].get(index, opts, cb)
    }
  }

  async put (index, buf, cb = () => {}) {
    await this.registration
    if (!this.chunks[index]) {
      this.fallbackStore.put(index - this.chunks.length, buf, cb)
    } else {
      this.chunks[index].put(index, buf, cb)
    }
  }

  close (cb = () => {}) {
    for (const store of Object.entries(this.stores)) store.destroy(cb)
  }

  destroy (cb = () => {}) {
    for (const store of Object.entries(this.stores)) store.close(cb)
  }
}

module.exports = HybridChunkStore
