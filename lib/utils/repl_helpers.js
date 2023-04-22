/*
 *  Copyright (c) 2016-2018 Rafał Michalski <royal@yeondir.com>
 */
"use strict";

import assert from 'assert';
import colors from 'colors/safe';

const { cyan, green, grey, magenta, red, yellow, bgGreen } = colors;

import ZmqRaftClient from '../client/zmq_raft_client';
import { lpad } from './helpers';

export const listPeers = function listPeers(client) {
  if (!client) {
    console.log(yellow('not connected'));
    return Promise.resolve();
  }
  return client.requestConfig(5000).then(peers => {
    if (!peers.urls) { /* peer client */
      peers.urls = {};
      peers.peers.forEach(([id,url]) => { peers.urls[id]=url; });
    }
    console.log(magenta('Cluster peers:'))
    if (!peers.isLeader) {
      console.log(yellow('(not authoritative answer from: %s)'), client.urls[0]);
    }
    for(let id in peers.urls) {
      let url = peers.urls[id];
      if (id === peers.leaderId) {
        console.log(bgGreen(`${id}: ${url}`));
      }
      else
        console.log(`${cyan(id)}: ${grey(url)}`);
    }
  });
};

export const showInfo = function showInfo(client, id) {
  if (!client) {
    console.log(yellow('not connected'));
    return Promise.resolve();
  }
  var cleanUp, anyPeer = false;
  if (client.peers && client.peers.has(id)) {
    client = new ZmqRaftClient({peers: [[id, client.peers.get(id)]]});
    cleanUp = () => client.close();
    anyPeer = true;
  }
  else if (id) {
    if (!client.peers) {
      console.log(yellow("with the peer-client you may only query the peer you are connected to"));
    }
    else {
      console.log(yellow("unknown id: %s"), id);
    }
    return Promise.resolve();
  }
  else {
    cleanUp = () => {};
  }

  return client.requestLogInfo(anyPeer, 5000)
  .then(({isLeader, leaderId, currentTerm, firstIndex, lastApplied, commitIndex, lastIndex, snapshotSize, pruneIndex}) => {
    // if (!anyPeer) assert(isLeader);
    console.log(grey(`Log information for: "${isLeader ? green(leaderId) : yellow(id||client.urls[0])}"`));
    console.log(`leader:          ${isLeader ? green('yes') : cyan('no')}`);
    console.log(`current term:    ${magenta(lpad(currentTerm, 14))}`);
    console.log(`first log index: ${magenta(lpad(firstIndex, 14))}`);
    console.log(`last applied:    ${magenta(lpad(lastApplied, 14))}`);
    console.log(`commit index:    ${magenta(lpad(commitIndex, 14))}`);
    console.log(`last log index:  ${magenta(lpad(lastIndex, 14))}`);
    console.log(`snapshot size:   ${magenta(lpad(snapshotSize, 14))}`);
    console.log(`prune index:     ${magenta(lpad(pruneIndex, 14))}`);
  })
  .then(cleanUp, err => { cleanUp(); throw err; });
};

export const argToBoolean = function argToBoolean(arg) {
  switch(arg.toLowerCase()) {
  case 'yes':
  case 'y':
  case 'on':
  case '1':
    return true;
  default:
    return false;
  }
};

export function prompt(repl) {
  repl.lineParser && repl.lineParser.reset();
  if (repl.clearBufferedCommand) {
    repl.clearBufferedCommand();
  } else {
    repl.bufferedCommand = '';
  }
  repl.displayPrompt();
};

export const replError = function replError(repl, err) {
  console.warn(red('ERROR'));
  console.warn(err.stack);
  prompt(repl);
};
