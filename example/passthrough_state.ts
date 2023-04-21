import assert from 'assert';
import fs from 'fs';
import { PassThrough } from 'stream';
import { createGzip, createUnzip, Z_NO_COMPRESSION, Z_BEST_COMPRESSION } from 'zlib';
import { StateMachineBase } from '../lib/api';
import { LOG_ENTRY_TYPE_STATE, readers } from '../lib/common/log_entry';
import debugFactory from 'debug';
const debug = debugFactory('zmq-raft:passthrough-state');

class PassThroughState extends StateMachineBase {

  constructor(options = {}) {
    super();
    const compressionLevel = this.compressionLevel = options.compressionLevel >>> 0;
    var unzipSnapshot = options.unzipSnapshot;
    this.unzipSnapshot = typeof unzipSnapshot === 'boolean' ? unzipSnapshot
                                                            : compressionLevel !== Z_NO_COMPRESSION;
    if (compressionLevel === Z_NO_COMPRESSION) {
      debug('creating passthrough-state with no compression');
      this.snapshotReadStream = new PassThrough();
    }
    else {
      debug('creating passthrough-state with compression level: %s', compressionLevel);
      this.snapshotReadStream = createGzip({level: compressionLevel});
    }
    this.snapshotReadStream.on('error', err => this.error(err));
    this[Symbol.for('setReady')]();
  }

  close() {
    var writeStream = this.snapshotReadStream;
    this.snapshotReadStream = null;
    if (!writeStream) return Promise.resolve();
    return new Promise<void>((resolve, reject) => {
      writeStream.on('error', reject).end(resolve);
    });
  }

  applyEntries(entries, nextIndex, currentTerm, snapshot) {
    assert(Array.isArray(entries))
    assert(nextIndex > this.lastApplied);
    assert(snapshot && nextIndex === snapshot.logIndex + 1 || !snapshot && nextIndex === this.lastApplied + 1);

    const writeStream = this.snapshotReadStream;

    var promise;

    if (snapshot) {
      promise = new Promise<void>((resolve, reject) => {
        this.on('error', reject);
        var snapshotStream = snapshot.createDataReadStream().on('error', reject);
        if (this.unzipSnapshot) {
          debug('unzipping snapshot before applying');
          snapshotStream = snapshotStream.pipe(createUnzip()).on('error', reject);
        }
        snapshotStream.on('end', () => {
          this.removeListener('error', reject);
          resolve();
        })
        .pipe(writeStream, {end: false});
      });
    }
    else {
      promise = Promise.resolve();
    }

    return promise.then(() => {
      var res = true
        , lastApplied = this.lastApplied = nextIndex + entries.length - 1;

      entries.forEach((entry, index) => {
        if (readTypeOf(entry) === LOG_ENTRY_TYPE_STATE) {
          res = writeStream.write(readDataOf(entry));
        }
      });
      if (res) {
        return this.lastApplied = lastApplied;
      }
      else {
        return new Promise<void>((resolve, reject) => {
          this.on('error', reject);
          writeStream.once('drain', () => {
            this.removeListener('error', reject);
            resolve(this.lastApplied = lastApplied);
          });
        });
      }
    });
  }

}

export default PassThroughState;
