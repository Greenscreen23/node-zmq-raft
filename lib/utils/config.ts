"use strict";

import path from 'path';
import { readFile } from './fsutil';
import { createOptions } from '../server/builder';
import debugFactory from 'debug';
import * as jsyaml from 'js-yaml';
import * as hjson from 'hjson';
import * as toml from 'toml';

const debug = debugFactory('config');

export const readConfig = function readConfig(configFile, namespace) {
  return Promise.resolve(configFile ? loadConfig(configFile) : {raft: {}})
                .then(config => createOptions(getDeepProperty(config, namespace)));
};

function loadConfig(configFile) {
  debug('reading config: %s', configFile);
  var parse;
  switch(path.extname(configFile).toLowerCase()) {
    case '.yaml':
    case '.yml':
      parse = jsyaml.safeLoad; break;
    case '.json':
      parse = JSON.parse; break;
    case '.hjson':
      parse = hjson.parse; break;
    case '.toml':
      parse = toml.parse; break;
    // case '.js':
    //   return require(path.resolve(configFile));
    default:
      throw new Error("Unrecognized config file type. Use one of: yaml, json, hjson, toml, js");
  }
  return readFile(configFile, 'utf8').then(parse);
}

function getDeepProperty(config, namespace) {
  if (namespace === undefined) {
    namespace = 'raft';
  }
  else if (!namespace) {
    return config;
  }
  config = namespace.split('.')
                    .reduce((cfg, prop) => cfg && cfg[prop], config);
  if (config === null || 'object' !== typeof config) {
    throw new Error("There is no such configuration namespace: " + namespace);
  }

  return config;
}
