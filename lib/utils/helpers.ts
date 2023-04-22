/*
 *  Copyright (c) 2016-2018 Rafał Michalski <royal@yeondir.com>
 */
"use strict";

const isArray = Array.isArray
    , random = Math.random
    , toString = {}.toString;

import { parse as parseUrl } from 'url';
import { isIP } from 'net';
import assert from 'assert';

/* a mischievous place where non strong typed languages live */

/**
 * Validates if all own property keys of the provided `constants` object have defined
 * value and are of type `type`.
 *
 * @param {Object} constants
 * @param {string} type
 * @param {bool} [checkNonFalsy]
 * @return {Object} constants for passing through
**/
export const assertConstantsDefined = function(constants, type, checkNonFalsy) {
  for(var name in constants) {
    if (constants.hasOwnProperty(name)) {
      assert(constants[name] !== undefined, "missing constant: " + name);
      assert(type === typeof constants[name], "bad constant type: " + name + " - " + typeof constants[name]);
      if (checkNonFalsy) {
        assert(!!constants[name], "falsy constant: " + name);
      }
    }
  }
  return constants;
};

/**
 * Creates function that randomize integer number between two provided values (inclusive).
 *
 * `min` and `max` arguments may be swapped
 *
 * @param {number} min
 * @param {number} max
 * @return {Function}
**/
export const createRangeRandomizer = function(v0, v1) {
  if (!Number.isFinite(v0) || !Number.isFinite(v1)) throw new TypeError('arguments must be numbers');
  v0 >>= 0;
  v1 >>= 0;
  const min = Math.min(v0, v1);
  const range = Math.max(v0, v1) - min + 1;
  return function() {
    return (random() * range + min)>>0;
  };
};

const defineProperty = Object.defineProperty;
const constDescriptor = { value: undefined, enumerable: true, configurable: false, writable: false };
/**
 * Defines constant property on provided object.
 *
 * @param {Object} target
 * @param {string} property
 * @param {*} value
 * @return value
**/
export const defineConst = function(target, property, value) {
  constDescriptor.value = value;
  defineProperty(target, property, constDescriptor);
  return value;
};

/**
 * Returns a promise that resolves after `timeout` milliseconds.
 *
 * `result` argument will be resolved
 *
 * @param {number} timeout
 * @param {*} [result]
 * @return {Promise}
**/
export const delay = function(timeout, result) {
  return new Promise((resolve, reject) => setTimeout(resolve, timeout, result));
};

const spaces = (" ").repeat(256);
/**
 * Returns string padded to size with optional padder.
 *
 * @param {string} input
 * @param {number} size
 * @param {string} [padder]
 * @return {string}
**/
export const lpad = function(input, size, padder) {
  var strlen = input.length;
  size >>= 0;
  if (strlen >= size) return input;
  if ('string' !== typeof padder) {
    padder = (padder !== undefined ? String(padder) : spaces);
  }
  var padlen = padder.length;
  if (size > padlen) {
    padder = padder.repeat((size + padlen - 1) / padlen >>> 0);
  }
  return padder.substring(0, size - strlen) + input;
}

/**
 * @property {Regexp} regexp that does not match anything.
**/
export const matchNothingPattern = /^[^\u0000-\uffff]+$/;

export const validatePeerUrlFormat = validatePeerUrlFormat;

function validatePeerUrlFormat(peer) {
  assert(isNonEmptyString(peer), "peer url must be a non empty string");
  var url = parseUrl(peer)
    , port = url.port|0;
  assert.strictEqual(url.protocol, "tcp:", "peer url protocol must be tcp:");
  assert.strictEqual(url.auth, null, "peer url must have no auth");
  assert(url.path === null || (url.path === '/' && !peer.endsWith('/')), "peer url must have no path");
  assert.strictEqual(url.hash, null, "peer url must have no hash");
  assert(port > 0 && port < 0x10000, "peer url port must be in range 1-65535");
  assert.notStrictEqual(url.hostname, "0.0.0.0", "peer url must not be a placeholder address");
  assert.notStrictEqual(url.hostname, "::", "peer url must not be a placeholder address");
  assert(!!isIP(url.hostname), "peer url must have a valid ip address in hostname");
  return url;
}

/**
 * Returns a map consisting of id -> url pairs.
 *
 * Accepts many input formats:
 *
 * - array of url strings, in this instance id will equal to url
 * - array of [id, url] pairs
 * - array of {id, url} objects (one of the property may be missing in this instance id === url)
 *
 * If the oldPeers argument is provided, additionally checks if peers are not conflicting with oldPeers
 *
 * @param {Array} peers
 * @param {Map} [oldPeers]
 * @return {Map}
**/
export const parsePeers = function(peers, oldPeers) {
  if (!isArray(peers))
    throw TypeError('peers must be an array');

  if (oldPeers !== undefined && !isMap(oldPeers))
    throw TypeError('oldPeers must be an array');

  var result = new Map()
    , urls = new Set()
    , oldUrls;

  if (oldPeers !== undefined) oldUrls = new Set(oldPeers.values());

  peers.forEach(peer => {
    var id;

    if ('string' === typeof peer) {
      id = peer;
    }
    else if (isArray(peer)) {
      id = peer[0];
      peer = peer[1];
      if (peer === undefined) peer = id;
    }
    else {
      assert(peer !== null && 'object' === typeof peer, "peer must be an url string or a tuple [id, url] or an object with 'url' and 'id' properties");
      id = peer.id
      if (id === undefined) id = peer.url;
      peer = peer.url;
      if (peer === undefined) peer = id;
    }
    assert(isNonEmptyString(id), "peer id must be a non empty string");
    assert(!result.has(id), "peer id must be unique");
    validatePeerUrlFormat(peer);
    assert(!urls.has(peer), "peer url must be unique");

    if (oldPeers !== undefined) {
      assert((!oldPeers.has(id) && !oldUrls.has(peer))
        || oldPeers.get(id) === peer,
        'new peers must be consistent with current configuration');
    }

    urls.add(peer);
    result.set(id, peer);
  });

  assert(result.size !== 0, "at least one peer must be defined in a cluster");

  return result;
};

const escapeRe = /[-\/\\^$*+?.()|[\]{}]/g;
/**
 * Returns exact match regex pattern.
 *
 * @param {string} input
 * @return {string}
**/
export const regexpEscape = function(input) {
  return input.replace(escapeRe, '\\$&');
};

/**
 * Returns true of the input is a non-empty string
 *
 * @param {*} input
 * @return {boolean}
**/
export const isNonEmptyString = isNonEmptyString;

function isNonEmptyString(input) {
  return 'string' === typeof input && input.length !== 0;
}

/**
 * Calculate majority of the given count
 *
 * @param {number} count
 * @return {number}
**/
export const majorityOf = function(count) {
  return (count >>> 1) + 1;
};


/**
 * Map type check.
 *
 * @param {*} value The value to check.
 * @return Boolean
 */
export const isMap = isMap;

function isMap(value) {
  return toString.call(value) === '[object Map]';
}

const slice = [].slice;

/**
 * Merge maps.
 *
 * Returns target map.
 *
 * @param {Map} target
 * @param {Map} ...sources
 * @return {Map}
**/
export const mergeMaps = function(target) {
  slice.call(arguments, 1)
  .forEach(map => map.forEach((v,k) => target.set(k, v)));
  return target;
};

/**
 * A function factory to create options with a given nested defaults.
 *
 * A returned function throws a TypeError if an option is not a namespace
 * when the default options expect one.
 *
 * @param {Object} defaultOptions
 * @return {Function}
**/
export const createOptionsFactory = function(defaultOptions) {
  return function createOptions(options, defaults) {
    defaults || (defaults = defaultOptions);
    options = Object.assign({}, options);
    for(let name of Object.keys(defaults)) {
      let defval = defaults[name]
        , value = options[name];

      if ('object' === typeof defval && defval !== null && !isArray(defval)) {
        if (value !== undefined &&
              ('object' !== typeof value || value === null || isArray(value))) {
          throw new TypeError(`Expected a namespace: "${name}"`);
        }
        options[name] = createOptions(value, defval);
      }
      else if (value === undefined) {
        options[name] = defval;
      }
    }
    return options;
  };
};

/**
 * Parse named property from given options as integer and validate
 *
 * @param {Object} options
 * @param {string} name
 * @param {number} [min]
 * @param {number} [max]
 * @return {number}
**/
export const validateIntegerOption = function(options, name, min, max) {
  var value = parseInt(options[name])
  if (!Number.isFinite(value)) throw new TypeError(`options.${name} must be an integer value`);
  if (min !== undefined && value < min) throw new TypeError(`options.${name} must be >= ${min}`);
  if (max !== undefined && value > max) throw new TypeError(`options.${name} must be <= ${max}`);
  return value;
};

/**
 * Returns `true` if the num is a power of two in the range of [1, 2^32].
 *
 * @param {number} num
 * @return {bool}
**/
export const isPowerOfTwo32 = function(num) {
  return (num - 1) >>> 0 === (num - 1) && num !== 0 && !(num & (num - 1))
};

/**
 * Returns the next power of two in the range of [1, 2^31]. Otherwise returns 0.
 *
 * @param {number} num
 * @return {number}
**/
export const nextPowerOfTwo32 = function(num) {
  num = num >> 0;
  num--;
  num |= num >> 1;
  num |= num >> 2;
  num |= num >> 4;
  num |= num >> 8;
  num |= num >> 16;
  num++;
  return num;
};
