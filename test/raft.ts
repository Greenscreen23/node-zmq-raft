"use strict";

import assert from 'assert';
import os from 'os';
import fs from 'fs';
import path from 'path';
import dns from 'dns';
import cluster from 'cluster';
import util from 'util';
import colors from 'colors/safe';
import mkdirp from 'mkdirp';
import Raft from '../lib/server/raft';
import FileLog from '../lib/server/filelog';
import BroadcastStateMachine from '../lib/server/broadcast_state_machine';
import RaftPersistence from '../lib/server/raft_persistence';
const tmpdir = path.resolve(__dirname, '..', 'tmp');

const argv = process.argv.slice(2);

if (argv.length > 2) {
  var hosts = argv;
}
else {
  var [numpeers, id]: any = argv;
}

numpeers>>>=0
id>>>=0

var port = (Number(process.env.PORT) || 8000) & 0xffff;
var dir;

resolve().then(host => {
  if (hosts && hosts.length) {
    return Promise.all([host].concat(hosts.map(host => resolve(host))));
  }
  else return [host];
}).then(([me, ...peers]) => {
  if (peers.length === 0) {
    dir = path.join(tmpdir, (id + 100).toString().substr(1));
    return (id) => {
      return {id: (id + 100).toString().substr(1), url: `tcp://${me}:${port+id}`, pub: {url:`tcp://${me}:${port+100+id}`}};
    };
  }
  else if (peers.includes(me)) {
    numpeers = peers.length;
    id = peers.indexOf(me) + 1;
    dir = path.join(tmpdir, '00');
    return (id) => {
      return {id: (id + 100).toString().substr(1),
              url: `tcp://${peers[id - 1]}:${port}`,
              bindUrl: `tcp://*:${port}`,
              pub: {
                url:`tcp://${peers[id - 1]}:${port+100}`,
                bindUrl:`tcp://*:${port+100}`
              }};
    };
  }
  else throw new Error('peers without us');
}).then(genpeer => {
  assert(numpeers > 0 && numpeers <= 100);
  assert(id > 0 && id <= numpeers);

  var options: any = {secret: process.env.SECRET || 'kiełbasa'};
  var me: any = genpeer(id);
  var myId = me.id;
  var peers = [];
  for(let i = 0; i < numpeers; ++i) peers.push(genpeer(i + 1));

  for(let peer of peers) {
    let url = peer.url;
    if (peer.id === myId) {
      console.log(colors.green(`${peer.id}: ${url}`));
    }
    else
      console.log(`${colors.cyan(peer.id)}: ${colors.grey(url)}`);
  }

  console.log(`directory: ${colors.magenta(dir)}`);
  mkdirp.sync(dir);

  var persistence: any = new RaftPersistence(path.join(dir, 'raft.pers'), peers);
  var log: any = new FileLog(path.join(dir, 'log'), path.join(dir, 'snap'));
  if (me.pub.bindUrl) options.bindUrl = me.pub.bindUrl;
  var stateMachine: any = new BroadcastStateMachine(path.join(dir, 'state.pers'), me.pub.url, options);

  return Promise.all([log.ready(),stateMachine.ready(),persistence.ready()]).then(() => {
    var promises = [];
    if (log.firstIndex > stateMachine.lastApplied + 1) {
      console.warn(colors.yellow("UPDATING STATE MACHINE: %s -> %s"), stateMachine.lastApplied, log.firstIndex - 1);
      promises.push(stateMachine.rotate({lastApplied: log.firstIndex - 1}));
    }
    else promises.push(stateMachine.rotate({}));
    if (log.lastTerm > persistence.currentTerm) {
      console.warn(colors.yellow("UPDATING CURRENT TERM: %s -> %s"), persistence.currentTerm, log.lastTerm);
      promises.push(persistence.rotate({currentTerm: log.lastTerm}));
    }
    else promises.push(persistence.rotate({}));
    return Promise.all(promises);
  }).then(() => {
    if (me.bindUrl) options.bindUrl = me.bindUrl;
    var raft = new Raft(myId, persistence, log, stateMachine, options);

    raft.on('error', err => {
      console.warn(colors.bgRed("RAFT ERROR"));
      console.warn(err.stack);
      process.exit();
    });
    raft.on('state', (state, currentTerm) => {
      console.log('state: %s term: %s', state, currentTerm);
    });

    return Promise.all([raft.ready()]).then(raft => {
      console.log(colors.rainbow('WEEEHAAA!'));
      // console.log(raft);
    });
  });
}).catch(err => {
  console.warn("FATAL ERROR");
  console.warn(err.stack)
});



function resolve(hostname?) {
  return new Promise<any>((resolve, reject) => {
    dns.lookup(hostname || os.hostname(), (err, address, family) => {
      if (err) return reject(err);
      resolve(family == 4 ? address : `[${address}]`);
    });
  });
}
