/* eslint-env browser */
import FSAccessChunkStore from 'fsa-chunk-store'
import IDBChunkStore from 'idb-chunk-store'
import MemoryChunkStore from 'memory-chunk-store'
import CacheChunkStore from 'cache-chunk-store'

const isChrome = !!window.chrome

export default class HybridChunkStore {
  constructor (chunkLength, opts = {}) {
    this.chunkLength = Number(chunkLength)
    if (!this.chunkLength) throw new Error('First argument must be a chunk length')

    this.length = Number(opts.length) || Infinity

    this.fallbackStore = null
    this.chunkCount = null
    this.stores = []
    this.chunks = []

    // this is kinda stupid, first it makes the fallback store, then the main store
    // creates a store limited by targetLength, then uses memory as fallback/overflow
    const _mapStore = (TargetStore, targetLength) => {
      const newOpts = opts
      if (targetLength && targetLength < this.length) {
        this.chunkCount = Math.floor(targetLength / this.chunkLength)
        const newLength = this.chunkCount * this.chunkLength
        newOpts.length = this.length - newLength
        // ideally this should be blob store, some1 make one pls
        this.fallbackStore = new MemoryChunkStore(this.chunkLength, newOpts)
        this.stores.push(this.fallbackStore)
        newOpts.length = newLength
      }
      const store = new CacheChunkStore(new TargetStore(this.chunkLength, newOpts), { max: opts.max || 20 })
      this.stores.push(store)
      if (this.chunkCount) {
        this.chunks[this.chunkCount - 1] = store
        this.chunks.fill(store)
      } else {
        this.fallbackStore = store
      }
    }

    this.registration = navigator.storage.estimate().then(estimate => {
      // use less than available
      const remaining = estimate.quota - estimate.usage - Math.max(Number(opts.reserved) || 0, 16777216)
      if ('getDirectory' in navigator.storage) {
        // lets hope the user isn't stupid enough to specify a directory with barely any storage, forgive me tech support people
        _mapStore(FSAccessChunkStore, !(opts.rootDir) && remaining)
      } else {
        // WAH. https://i.kym-cdn.com/entries/icons/original/000/027/528/519.png
        _mapStore(IDBChunkStore, !(isChrome && estimate.quota === 2147483648) && remaining)
      }
    })
  }

  get (index, opts, cb) {
    this.registration.then(() => {
      if (!this.chunks[index]) {
        this.fallbackStore.get(index - this.chunkCount, opts, cb)
      } else {
        this.chunks[index].get(index, opts, cb)
      }
    })
  }

  put (index, buf, cb) {
    this.registration.then(() => {
      if (!this.chunks[index]) {
        this.fallbackStore.put(index - this.chunkCount, buf, cb)
      } else {
        this.chunks[index].put(index, buf, cb)
      }
    })
  }

  close (cb = () => {}) {
    const promises = []
    for (const store of this.stores) {
      promises.push(new Promise(resolve => store.close(resolve)))
    }
    Promise.all(promises).then(values => {
      values = values.filter(value => value)
      cb(values.length > 1 ? values : values[0])
    })
  }

  destroy (cb = () => {}) {
    const promises = []
    for (const store of this.stores) {
      promises.push(new Promise(resolve => store.destroy(resolve)))
    }
    Promise.all(promises).then(values => {
      values = values.filter(value => value)
      cb(values.length > 1 ? values : values[0])
    })
  }
}
