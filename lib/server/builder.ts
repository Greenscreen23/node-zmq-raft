/* 
 *  Copyright (c) 2016-2019 Rafał Michalski <royal@yeondir.com>
 */
"use strict";

const isArray = Array.isArray;

import path from 'path';
import fs from 'fs';
import { Z_BEST_COMPRESSION } from 'zlib';
import debugFactory from 'debug';
const debug = debugFactory('zmq-raft:builder');
import { ZmqRaft, FileLog, RaftPersistence, BroadcastStateMachine } from '.';
import { fsutil, helpers } from '../utils';
import WebMonitor from './webmonitor';

const defaultOptions = exports.defaultOptions = {
    /* required */
  // id: "local"
    secret: ""
  , peers: [
      {id: "local", url: "tcp://127.0.0.1:8047"}
  ]
  , data: {
      /* required */
      path: "raft" /* full path to raft base directory */
    , raft: "raft.pers" /* filename in data.path */
    , log: "log" /* directory name in data.path */
    , snapshot: "snap" /* filename in data.path */
    , state: "state.pers" /* filename in data.path */
    , compact: {
        /* optional */
        install: "compact/snap.new"
      , watch: false
      , state:
      {
          /* used by logcompaction */
          // path: "../example/passthrough_state"
          options: {
            compressionLevel: Z_BEST_COMPRESSION
            // unzipSnapshot: true
          }
        }
      }
    /* optional */
    , appendIdToPath: false
    }
  , router: {
      /* optional */
      // bind: "tcp://*:8047"
  }
  , broadcast: {
      /* required for default broadcast state */
      url: "tcp://127.0.0.1:8048"
      /* optional */
      // bind: "tcp://*:8048"
      // broadcastHeartbeatInterval: BROADCAST_HEARTBEAT_INTERVAL
  }
  , listeners: {
      error: null
    , config: null
    , state: (state, currentTerm) => {
        debug('raft-state: %s term: %s', state, currentTerm);
      }
    , close: () => {
        debug('raft closed');
      }
  }
  , factory: {
      persistence: createRaftPersistence
    , log: createFileLog
    , state: createBroadcastStateMachine
  }
  , webmonitor: {
      enable: false,
      host: "localhost",
      port: 8050,
      proto: null, // if null taken from bind.proto
      bind: {
        proto: "http",
        host: "::", // if null taken from ../host
        port: null, // if null taken from ../port
        // ca: "path/to/ca.pem",
        // cert: "path/to/cert.pem",
        // key: "path/to/key.pem",
        // pfx: "path/to/cert.pfx",
      }
  }
  , console: {
      client: {
        // highwatermark: 2,
        // timeout: 500,
        // serverElectionGraceDelay: 300,
        heartbeat: 5000
    }
    , subscriber: {
      // broadcastTimeout: 1000,
      // highwatermark: 2,
      // timeout: 500,
      // serverElectionGraceDelay: 300,
    }
  }
  , preventSpiralElections: true
  /* optional */
  //, label: "Cluster label"
  //, electionTimeoutMin: ELECTION_TIMEOUT_MIN
  //, electionTimeoutMax: ELECTION_TIMEOUT_MAX
  //, rpcTimeout: RPC_TIMEOUT
  //, appendEntriesHeartbeatInterval: APPEND_ENTRIES_HEARTBEAT_INTERVAL
  //, appendEntriesRpcTimeoutMin: APPEND_ENTRIES_RPC_TIMEOUT_MIN
  //, appendEntriesRpcTimeoutMax: APPEND_ENTRIES_RPC_TIMEOUT_MAX
  //, maxLogEntryDataSize: MAX_LOG_ENTRY_DATA_SIZE
  //, peerMsgDataSize: PEER_MSG_DATA_SIZE
  //, requestEntriesHighWatermak: REQUEST_ENTRIES_HIGH_WATERMARK
  //, requestEntriesTtl: REQUEST_ENTRIES_TTL
  //, requestEntriesPipelines: REQUEST_ENTRIES_PIPELINES
  //, requestEntriesEntrySizeLimitPipeline: REQUEST_ENTRIES_ENTRY_SIZE_LIMIT_PIPELINE
  //, requestEntriesSnapshotPipelines: REQUEST_ENTRIES_SNAPSHOT_PIPELINES
  //, requestIdTtlAcceptMargin: REQUEST_ID_TTL_ACCEPT_MARGIN
  //, requestIdTtl: DEFAULT_REQUEST_ID_TTL
  //, indexFileCapacity: DEFAULT_CAPACITY
  //, requestIdCacheMax: null
};

const createOptions = exports.createOptions = createOptionsFactory(defaultOptions);

function createFileLog(options) {
  const raftdir = options.data.path
      , logdir = path.join(raftdir, options.data.log)
      , snapfile = path.join(raftdir, options.data.snapshot)
      , { indexFileCapacity
        , requestIdTtl
        , requestIdCacheMax } = options;

  if (indexFileCapacity !== undefined) debug('index file capacity: %j', indexFileCapacity);
  if (requestIdTtl !== undefined) debug('request ID TTL: %s ms',
                                        requestIdTtl == null ? 'unlimited' : requestIdTtl);
  if (requestIdCacheMax !== undefined) debug('request ID hwmark: %s',
                                        requestIdCacheMax == null ? 'none' : requestIdCacheMax);

  return new FileLog(logdir, snapfile, {indexFileCapacity, requestIdTtl, requestIdCacheMax});
}

function createRaftPersistence(options) {
  const raftdir = options.data.path
      , filename = path.join(raftdir, options.data.raft);

  return new RaftPersistence(filename, options.peers);
}

function createBroadcastStateMachine(options) {
  const raftdir = options.data.path
      , url = options.broadcast.url
      , filename = path.join(raftdir, options.data.state)
      , broadcastHeartbeatInterval = options.broadcast.broadcastHeartbeatInterval;

  if (broadcastHeartbeatInterval !== undefined) debug('broadcast heartbeat interval: %j ms', broadcastHeartbeatInterval);

  return new BroadcastStateMachine(filename, url, {
    secret: options.secret,
    bindUrl: options.broadcast.bind,
    broadcastHeartbeatInterval
  });
}

export const build = function build(options) {
  debug('building raft server');

  try {
    options = createOptions(options);

    if (!isNonEmptyString(options.id)) {
      throw new Error("raft builder: id must be a non-empty string");
    }
    if ('string' !== typeof options.secret) {
      throw new Error("raft builder: secret must be a string");
    }
    if (!isNonEmptyString(options.data.path)) {
      throw new Error("raft builder: data.path must be a non-empty string");
    }
    if (options.peers.length === 0) {
      throw new Error("raft builder: initial peers must be non-empty");
    }
    if (options.router.bind !== undefined && !isNonEmptyString(options.router.bind)) {
      throw new Error("raft builder: router.bind must be a non-empty string");
    }
    if (options.data.appendIdToPath) {
      options.data.path = path.join(options.data.path, options.id);
    }
    if (options.label != null && !isNonEmptyString(options.label)) {
      throw new Error("raft builder: label if defined must be a non-empty string");
    }
  } catch(err) {
    return Promise.reject(err);
  }

  debug('ensuring directory data.path: %j', options.data.path);
  return mkdirp(options.data.path).then(() => {

    debug('initializing persistence');
    const persistence = options.factory.persistence(options);

    debug('initializing log');
    const log = options.factory.log(options);

    debug('initializing state machine');
    const stateMachine = options.factory.state(options);

    const logPromise = options.data.compact.watch
                     ? log.ready()
                       .then(log => log.watchInstallSnapshot(path.join(options.data.path, options.data.compact.install)))
                       .then(() => log)
                     : log.ready();

    return Promise.all([
        persistence.ready()
      , logPromise
      , stateMachine.ready()
      ]);
  })

  .then(([persistence, log, stateMachine]) => {

    const updatePersist = {};
    // if (!peersEquals(persistence.peers, peers)) {
    //   debug('updating peers in persistence');
    //   updatePersist.peers = peers;
    // }

    if (persistence.currentTerm < log.lastTerm) {
      debug("updating raft current term to log's last term: %s -> %s", persistence.currentTerm, log.lastTerm);
      updatePersist.currentTerm = log.lastTerm;
    }

    if (persistence.peersUpdateRequest != null && persistence.peersIndex == null) {
      let peersIndex = log.getRid(persistence.peersUpdateRequest);
      if (peersIndex !== undefined) {
        debug("confirming peersIndex: %s of: [%s] in persistence", peersIndex, persistence.peersUpdateRequest);
        updatePersist.peersIndex = peersIndex;
      }
    }

    if (Object.keys(updatePersist).length !== 0) {
      return persistence.rotate(updatePersist).then(() => [persistence, log, stateMachine]);
    }
    else return [persistence, log, stateMachine];
  })

  .then(([persistence, log, stateMachine]) => {
    if (log.firstIndex > stateMachine.lastApplied + 1) {
      debug("feeding state machine with a snapshot: %s -> %s term: %s", stateMachine.lastApplied, log.snapshot.logIndex, persistence.currentTerm);
      return log.feedStateMachine(stateMachine, log.snapshot.logIndex, persistence.currentTerm)
                .then(() => [persistence, log, stateMachine]);
    }
    else return [persistence, log, stateMachine];
  })

  .then(([persistence, log, stateMachine]) => {

    const { id, secret, label
          , electionTimeoutMin, electionTimeoutMax
          , rpcTimeout
          , appendEntriesHeartbeatInterval
          , appendEntriesRpcTimeoutMin, appendEntriesRpcTimeoutMax
          , maxLogEntryDataSize
          , peerMsgDataSize
          , requestIdTtlAcceptMargin
          , requestEntriesHighWatermak
          , requestEntriesTtl
          , requestEntriesPipelines
          , requestEntriesEntrySizeLimitPipeline
          , requestEntriesSnapshotPipelines
          , preventSpiralElections
          , router: {bind}
          , webmonitor
          } = options;

    if (label != null) debug('cluster label: %j', label);

    debug('initializing raft peer: %j', id);

    if (electionTimeoutMin !== undefined) debug('election timeout min.: %j ms', electionTimeoutMin);
    if (electionTimeoutMax !== undefined) debug('election timeout max.: %j ms', electionTimeoutMax);
    if (rpcTimeout !== undefined) debug('rpc timeout: %j ms', rpcTimeout);
    if (appendEntriesHeartbeatInterval !== undefined) debug('append entries heartbeat interval: %j ms', appendEntriesHeartbeatInterval);
    if (appendEntriesRpcTimeoutMin !== undefined) debug('append entries rpc timeout min: %j ms', appendEntriesRpcTimeoutMin);
    if (appendEntriesRpcTimeoutMax !== undefined) debug('append entries rpc timeout max: %j ms', appendEntriesRpcTimeoutMax);
    if (maxLogEntryDataSize !== undefined) debug('maxmimum log entry date size: %j bytes', maxLogEntryDataSize);
    if (peerMsgDataSize !== undefined) debug('peer message data size: %j bytes', peerMsgDataSize);
    if (requestIdTtlAcceptMargin !== undefined) debug('request ID TTL accept margin: %j ms', requestIdTtlAcceptMargin);
    if (requestEntriesHighWatermak !== undefined) debug('request entries high watermark: %j', requestEntriesHighWatermak);
    if (requestEntriesTtl !== undefined) debug('request entries TTL: %j ms', requestEntriesTtl);
    if (requestEntriesPipelines !== undefined) debug('request entries pipelines: %j', requestEntriesPipelines);
    if (requestEntriesEntrySizeLimitPipeline !== undefined) debug('request entries entry size limit pipeline: %j bytes', requestEntriesEntrySizeLimitPipeline);
    if (requestEntriesSnapshotPipelines !== undefined) debug('request entries snapshot pipelines: %j', requestEntriesSnapshotPipelines);
    if (preventSpiralElections !== undefined) debug('prevent spiral elections: %j', preventSpiralElections);

    const raft = new ZmqRaft(id, persistence, log, stateMachine,
                              { bindUrl: bind, secret
                              , electionTimeoutMin, electionTimeoutMax
                              , rpcTimeout
                              , appendEntriesHeartbeatInterval
                              , appendEntriesRpcTimeoutMin, appendEntriesRpcTimeoutMax
                              , maxLogEntryDataSize
                              , peerMsgDataSize
                              , requestIdTtlAcceptMargin
                              , requestEntriesHighWatermak
                              , requestEntriesTtl
                              , requestEntriesPipelines
                              , requestEntriesEntrySizeLimitPipeline
                              , requestEntriesSnapshotPipelines
                              , preventSpiralElections
                              });
    /* assign optional label */
    if (label) raft.label = label;

    for(let event of Object.keys(options.listeners)) {
      const handler = options.listeners[event];
      if ('function' === typeof handler) {
        raft.on(event, handler);
      }
    }

    let ready = raft.ready();

    if (webmonitor.enable) {
      delete webmonitor.enable;
      try {
        for(let key of ["ca", "cert", "key", "pfx"]) {
          let filename = webmonitor.bind[key];
          if ('string' === typeof filename && filename.length !== 0 && filename.match(/^.*$/)) {
            let filepath = path.resolve(options.data.path, filename);
            debug("loading webmonitor.bind.%s from \"%s\"", key, filepath);
            webmonitor.bind[key] = fs.readFileSync(filepath);
          }
        }
        raft.webmonitor = new WebMonitor(raft, webmonitor);
      } catch(err) {
        ready = ready.then(() => raft.close()).then(() => {
          throw err;
        });
      }
    }

    return ready;
  });

};
