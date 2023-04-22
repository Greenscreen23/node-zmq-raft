/* 
 *  Copyright (c) 2016-2018 Rafał Michalski <royal@yeondir.com>
 */
"use strict";

const MAX_SAFE_INTEGER = Number.MAX_SAFE_INTEGER;

const path = require('path');

const { ZMQ_LINGER } = require('zeromq');

const { assertConstantsDefined
      , createOptionsFactory
      , validateIntegerOption } = require('../utils/helpers');
const { ZmqSocket } = require('../utils/zmqsocket');

const { FSM_LEADER, BROADCAST_HEARTBEAT_INTERVAL } = require('../common/constants');

assertConstantsDefined({
  BROADCAST_HEARTBEAT_INTERVAL
}, 'number');

assertConstantsDefined({
  FSM_LEADER
}, 'symbol');

const synchronize = require('../utils/synchronize');

const { createFramesProtocol } = require('../protocol');

const stateBroadcastProtocol = createFramesProtocol('StateBroadcast');

const FilePersistence = require('../common/file_persistence');

const REQUEST_URL_MATCH = ('*').charCodeAt(0);

const update$ = Symbol.for('update');

const debug = require('debug')('zmq-raft:broadcast-sm');

const createBroadcastSmOptions = createOptionsFactory({
  secret: ''
, bindUrl: null
, lastApplied: 0
, broadcastHeartbeatInterval: BROADCAST_HEARTBEAT_INTERVAL
});

/**
 * Implements the FilePersistence for state machine data.
 *
 * The properties being stored:
 *
 * - `lastApplied` {number} - a last applied log index to the state machine.
**/
class BroadcastStateMachine extends FilePersistence {
	public url: any;
	public bindUrl: any;
	public broadcastHeartbeatInterval: any;
	public _urlBuf: any;
	public _secretBuf: any;
	public _broadcastInterval: any;
	public _fan: any;
	public on: any;
	public lastApplied: any;
	public send: any;

  /**
   * Creates new instance
   *
   * `filename` should contain path to a filename in some existing directory.
   * `url` should contain a zmq url for a ZMQ_PUB socket.
   *
   *  NOTE: for servers behind NAT `url` must be the PUBLIC address
   *        (visible from outside world) in this instance pass socket
   *        bind address in `options.bindUrl`.
   *
   * `options` may be one of:
   *
   * - `lastApplied` {number}: An initial persistent lastApplied value (default: 0).
   * - `secret` {string}: A string to emit as first frame.
   * - `bindUrl` {string}: An optional url address to bind ZMQ_PUB socket to.
   * - `broadcastHeartbeatInterval` {number}: A broadcast heartbeat interval in milliseconds (default: 500).
   *
   * A new file will be created if `filename` does not exist.
   *
   * @param {string} filename
   * @param {string} url
   * @param {Object} options
   * @return this
  **/
  constructor(filename, url, options) {
    options = createBroadcastSmOptions(options);

    super(filename, {lastApplied: validateIntegerOption(options, 'lastApplied', 0)});

    this.url = url;
    this.bindUrl = options.bindUrl || url;
    debug('url: %s', this.url);

    this.broadcastHeartbeatInterval = validateIntegerOption(options, 'broadcastHeartbeatInterval', 50);
    debug('heartbeat interval: %s ms', this.broadcastHeartbeatInterval);

    this._urlBuf = Buffer.from(url);
    this._secretBuf = Buffer.from(options.secret || '');

    this._broadcastInterval = null;

    var fan = this._fan = new ZmqSocket('pub');
    this._fan.setsockopt(ZMQ_LINGER, 2000);

    /* StateMachineBase api */

    this.on('raft-state', (state, term) => {
      if (state === FSM_LEADER) {
        debug('start heartbeats at term %s with last applied: %s', term, this.lastApplied);
        this._refreshBroadcaster(term);
      }
      else if (this._broadcastInterval !== null) {
        debug('stop heartbeats at term %s with last applied: %s', term, this.lastApplied);
        this._clearBroadcaster();
      }
    });

    this.on('client-request', (reply, msgType) => {
      if (msgType.length === 1 && msgType[0] === REQUEST_URL_MATCH) {
        reply(this._urlBuf);
      }
    });

  }

  /* FilePersistence api */

  [Symbol.for('init')]() {
    return new Promise((resolve, reject) => {
      this._fan.bind(this.bindUrl, err => {
        if (err) return reject(err);
        debug('ready at: %s', this.bindUrl);
        this.send = stateBroadcastProtocol.createSendFunctionFor(this._fan);
        resolve();
      });
    });
  }

  [Symbol.for('apply')]({lastApplied}) {
    if (lastApplied !== undefined) this.lastApplied = lastApplied;
  }

  [Symbol.for('validate')]({lastApplied}, withAllProperties) {
    var data = {};

    if (lastApplied !== undefined) data.lastApplied = validateLastApplied(lastApplied);
    else if (withAllProperties) {
      data.lastApplied = this.lastApplied;
    }

    return data;
  }

  close() {
    clearInterval(this._broadcastInterval);
    this._broadcastInterval = null;
    var fan = this._fan;
    this._fan = null;
    return synchronize(this, () => {
      if (fan) {
        debug('closing');
        this.send = null;
        fan.close();
      }
      return this[Symbol.for('close')]();
    });
  }

  /* StateMachineBase api */

  applyEntries(entries, nextIndex, currentTerm, snapshot) {
    return synchronize(this, () => {
      const lastApplied = this.lastApplied;
      if (nextIndex <= lastApplied
          || (snapshot && nextIndex !== snapshot.logIndex + 1)
          || (!snapshot && nextIndex !== lastApplied + 1)) {
        throw new Error("BroadcastStateMachine: trying to apply entries out of order");
      }
      const numEntries = entries.length;
      const lastIndex = nextIndex + numEntries - 1;
      if (lastIndex === lastApplied) return lastApplied;
      this._pauseBroadcaster();
      return this[update$]({lastApplied: lastIndex}).then(() => {
        if (this.isLeader) {
          debug('broadcasting entries: %s at currentTerm: %s with nextIndex %s', numEntries, currentTerm, nextIndex);
          this.send([this._secretBuf, currentTerm, lastIndex].concat(entries));
          this._refreshBroadcaster(currentTerm);
        }
        return lastIndex;
      });
    });
  }

  /* own api */

  get isLeader() {
    return this._broadcastInterval !== null;
  }

  _refreshBroadcaster(term) {
    if (this._broadcastInterval !== null) {
      clearInterval(this._broadcastInterval);
    }
    this._broadcastInterval = setInterval(() => {
      this.send([this._secretBuf, term, this.lastApplied]);
    }, this.broadcastHeartbeatInterval);
  }

  _pauseBroadcaster() {
    if (this._broadcastInterval !== null) {
      clearInterval(this._broadcastInterval);
    }
  }

  _clearBroadcaster() {
    if (this._broadcastInterval !== null) {
      clearInterval(this._broadcastInterval);
      this._broadcastInterval = null;
    }
  }

}

module.exports = BroadcastStateMachine;

function validateLastApplied(lastApplied) {
  if ('number' !== typeof lastApplied ||
      lastApplied < 0 ||
      lastApplied > MAX_SAFE_INTEGER) throw new Error("BroadcastStateMachine: invalid lastApplied");
  return lastApplied;
}
