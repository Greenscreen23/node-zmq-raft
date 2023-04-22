/* 
 *  Copyright (c) 2016-2017 Rafał Michalski <royal@yeondir.com>
 */
"use strict";

const isArray = Array.isArray;
const { mergeMaps, majorityOf, parsePeers } = require('../utils/helpers');

/**
 *  ClusterConfiguration is a class to control peer membership, transition of peer membership and voting.
 *
 *  new ClusterConfiguration(myPeerId, [[]]|{old:[], new:[]})
 *
 *  @property {string} peerId
 *
 *  @property {boolean} isTransitional
 *  @property {boolean} isSoleMaster
 *
 *  @property {Map} ocluster
 *  @property {Map} ncluster
 *
 *  @property {number} majority
 *  @property {number} ncMajority
 *
 *  @property {Set} voted
 *  @property {Set} ncVoted
 *  @property {number} votes
 *  @property {number} ncVotes
 *
 *  @property {Map} peers (a single/joint config peers map without myPeerId) - safe to be shared
 *
 *  @property {Array} configAry -> (a single/joint config peers array)
**/
class ClusterConfiguration {
	public peerId: any;
	public peers: any;
	public voted: any;
	public votes: any;
	public ncVoted: any;
	public ncVotes: any;
	public ocluster: any;
	public ncluster: any;
	public ncMajority: any;
	public majority: any;
	public configAry: any;

  /**
   * creates a new ClusterConfiguration instance
   *
   * cfg may be an array of peer descriptors or object with properties "old" and "new"
   * containing arrays with old and new peer descriptors
   *
   * @param {string} myPeerId
   * @param {Array|Object} cfg
   * @return {ClusterConfiguration}
  **/
  constructor(myPeerId, cfg) {
    this.peerId = myPeerId;
    this.peers = new Map();
    this.voted = new Set();
    this.votes = 0;
    this.ncVoted = new Set();
    this.ncVotes = 0;
    this.replace(cfg);
  }

  /**
   * checks if peerId is a member of the cluster
   *
   * @param {string} peerId
   * @return {boolean}
  **/
  isMember(peerId) {
    return this.ocluster.has(peerId) || this.ncluster.has(peerId);
  }

  /**
   * gets url of peerId or undefined
   *
   * @param {string} peerId
   * @return {string|undefined}
  **/
  getUrl(peerId) {
    return this.ocluster.get(peerId) || this.ncluster.get(peerId);
  }

  /**
   * @property {boolean} isTransitional
  **/
  get isTransitional() {
    return this.ncMajority !== 0;
  }

  /**
   * @property {boolean} isSoleMaster
  **/
  get isSoleMaster() {
    return this.peers.size === 0;
  }

  /**
   * converts ClusterConfiguration instance to an array or plain object
   *
   * @return {Array|Object}
  **/
  serialize() {
    var ocluster = Array.from(this.ocluster)
      , ncluster = this.ncluster;

    return ncluster.size === 0 ? ocluster
                               : {old: ocluster, new: Array.from(ncluster)};
  }

  /**
   * converts ClusterConfiguration new cluster configuration to an array
   *
   * @return {Array}
  **/
  serializeNC() {
    return Array.from(this.ncluster);
  }

  /**
   * replaces current config with the new config
   *
   * cfg may be an array of peer descriptors or object with properties "old" and "new"
   * containing arrays with old and new peer descriptors
   *
   * @param {Array|Object} cfg
  **/
  replace(cfg) {
    if (isArray(cfg)) {
      this.ocluster = parsePeers(cfg);
      this.ncluster = new Map();
      this.majority = majorityOf(this.ocluster.size);
      this.ncMajority = 0;
    }
    else if (cfg === null || 'object' !== typeof cfg || !isArray(cfg.old) || !isArray(cfg.new)) {
      throw new TypeError('ClusterConfiguration: argument parsing error');
    }
    else {
      this.ocluster = parsePeers(cfg.old);
      this.ncluster = parsePeers(cfg.new, this.ocluster);
      this.majority = majorityOf(this.ocluster.size);
      this.ncMajority = majorityOf(this.ncluster.size);
    }
    this._updatePeers();
  }

  /**
   * joins current config with the new config returning transitional config
   *
   * returns null if join was impossible (current config was transitional)
   *
   * @param {Array} cfg
   * @return {Object|null}
  **/
  join(cfg) {
    if (this.ncMajority !== 0) return null;
    var ocluster = this.ocluster
      , ncluster = Array.from(parsePeers(cfg, ocluster));

    ocluster = Array.from(ocluster);
    if (ocluster.length === ncluster.length) {
      if (ncluster.every((pair, idx) => ocluster[idx][0] === pair[0])) {
        throw new Error("no change in cluster membership");
      }
    }
    return {old: ocluster, new: ncluster};
  }

  /**
   * clear voting metadata
  **/
  votingStart() {
    this.voted.clear();
    this.ncVoted.clear();
    this.votes = 0;
    this.ncVotes = 0;
  }

  /**
   * add vote from a peer
   *
   * @param {string} peerId
   * @param {boolean} voteGranted
  **/
  vote(peerId, voteGranted) {
    var voted = this.voted;
    if (this.ocluster.has(peerId)) {
      if (!voted.has(peerId)) {
        voted.add(peerId);
        if (voteGranted) ++this.votes;
      }
    }
    if (this.ncluster.has(peerId)) {
      voted = this.ncVoted;
      if (!voted.has(peerId)) {
        voted.add(peerId);
        if (voteGranted) ++this.ncVotes;
      }
    }
  }

  /**
   * has majority already voted
   *
   * @return {boolean}
  **/
  majorityHasVoted() {
    return this.voted.size >= this.majority && this.ncVoted.size >= this.ncMajority;
  }

  /**
   * has voting been won
   *
   * @return {boolean}
  **/
  hasWonVoting() {
    return this.votes >= this.majority && this.ncVotes >= this.ncMajority;
  }

  /**
   * is majority of peers' match index larger or equal to logIndex
   *
   * @param {number} logIndex
   * @param {Map} matchIndex peerId -> matchIndex
   * @return {boolean}
  **/
  majorityHasLogIndex(logIndex, matchIndex) {
    var majority = this.majority
      , ncMajority = this.ncMajority
      , ocluster = this.ocluster
      , ncluster = this.ncluster
      , peerId = this.peerId;

    /* assuming me has logIndex in log */
    if (ocluster.has(peerId)) --majority;
    if (ncluster.has(peerId)) --ncMajority;
    if (majority <= 0 && ncMajority <= 0) return true;

    for(peerId of this.peers.keys()) {
      if (matchIndex.get(peerId) >= logIndex) {
        if (ocluster.has(peerId)) --majority;
        if (ncluster.has(peerId)) --ncMajority;
        if (majority <= 0 && ncMajority <= 0) return true;
      }
    }

    return false;
  }

  /**
   * create map from current other peers using factory function
   *
   * @param {Function} factory
   * @return {Map}
  **/
  createOtherPeersMap(factory) {
    return this.updateOtherPeersMap(new Map(), factory);
  }

  /**
   * remove keys not found in other peers, reorder map content and fill missing keys with value
   *
   * @param {Map} map
   * @param {*} value
   * @return {Map}
  **/
  resetOtherPeersMap(map, value) {
    var peerId
      , peers = this.peers;

    for(peerId of peers.keys()) {
      let upd = map.get(peerId);
      if (!map.delete(peerId)) upd = value;
      map.set(peerId, upd);
    }

    for(peerId of map.keys()) {
      if (!peers.has(peerId)) map.delete(peerId);
    }

    return map;
  }

  /**
   * update map content with current other peers
   *
   * if factory is null or not provided it will only delete elements and not create new ones
   *
   * @param {Map} map
   * @param {Function|null} factory (peerUrl, peerId) => {*}
   * @param {Function} [destructor] (value, peerId) => {void}
   * @return {Map}
  **/
  updateOtherPeersMap(map, factory, destructor?) {
    var peers = this.peers
      , peerId;

    for(peerId of map.keys()) {
      if (!peers.has(peerId)) {
        destructor && destructor(map.get(peerId), peerId);
        map.delete(peerId);
      }
    }

    if ('function' === typeof factory) {
      for(peerId of peers.keys()) {
        if (!map.has(peerId)) {
          map.set(peerId, factory(peers.get(peerId), peerId));
        }
      }
    }

    return map;
  }

  /**
   * updates peers
   *
   * used internally
  **/
  _updatePeers() {
    var peers = this.peers;
    peers.clear();
    mergeMaps(peers, this.ocluster, this.ncluster);
    this.configAry = Array.from(peers);
    peers.delete(this.peerId);
  }

}

ClusterConfiguration.prototype.toJSON = ClusterConfiguration.prototype.serialize;

exports = module.exports = ClusterConfiguration;
