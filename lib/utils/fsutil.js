/*
 *  Copyright (c) 2016 Rafał Michalski <royal@yeondir.com>
 */
"use strict";

/*
  Promisify only what we need in a way we need.
*/

import fs from 'fs';

import { dirname } from 'path';
import * as mkdirpLib from 'mkdirp';
import parallel from '../utils/parallel';
import debugFactory from 'debug';
const debug = debugFactory('zmq-raft:fsutils');

if (!fs.constants.O_DIRECTORY) debug("OS does not support directory syncing with fsync");

/* resolves to dirfd only on supported OS'es, otherwise a no-op resolves to null */
export const openDir = function(path) {
  if (!fs.constants.O_DIRECTORY) return Promise.resolve(null);
  return open(path, fs.constants.O_DIRECTORY|fs.constants.O_RDONLY);
};

/* close directory opened with openDir for syncing */
export const closeDir = function(dirfd) {
  if (!fs.constants.O_DIRECTORY) return Promise.resolve();
  return close(dirfd);
};

export function fsyncDirFileCloseDir(dirfd, fd) {
  return parallel((cb1, cb2) => {
    fs.fsync(fd, cb1); /* ensure file durability, well, sort of */
    if (fs.constants.O_DIRECTORY) {
      /* ensure directory durability */
      /* well, too bad for windows this is unreplaceable, let's hope for FlushFileBuffers to sync it all */
      fs.fsync(dirfd, cb2);
    }
    else {
      cb2();
    }
  })
  .then(() => fs.constants.O_DIRECTORY && close(dirfd));
};

export function renameSyncDir(oldPath, newPath) {
  if (!fs.constants.O_DIRECTORY) return rename(oldPath, newPath);
  var oldDir = dirname(oldPath);
  var newDir = dirname(newPath);
  if (oldDir === newDir) {
    return open(oldDir, fs.constants.O_DIRECTORY|fs.constants.O_RDONLY)
    .then(dirfd => {
      return rename(oldPath, newPath)
      .then(() => fsync(dirfd)).then(() => close(dirfd))
    });
  } else {
    return Promise.all([
      open(oldDir, fs.constants.O_DIRECTORY|fs.constants.O_RDONLY),
      open(newDir, fs.constants.O_DIRECTORY|fs.constants.O_RDONLY)
    ]).then(dirfds => rename(oldPath, newPath)
      .then(() => Promise.all([
        fsync(dirfds[0]).then(() => close(dirfds[0])),
        fsync(dirfds[1]).then(() => close(dirfds[1]))
      ]))
    );
  }
};

export function write(fd, buffer, offset, length, position) {
  return new Promise((resolve, reject) => {
    fs.write(fd, buffer, offset, length, position, (err, bytesWritten) => {
      if (err) return reject(err);
      if (bytesWritten !== length) return reject(new Error("bytesWritten mismatch"));
      resolve(bytesWritten);
    });
  });
};

export function read(fd, buffer, offset, length, position) {
  return new Promise((resolve, reject) => {
    fs.read(fd, buffer, offset, length, position, (err, bytesRead) => {
      if (err) return reject(err);
      if (bytesRead !== length) return reject(new Error("bytesRead <> expected"));
      resolve(bytesRead);
    });
  });
};

export function open(path, flags, mode?) {
  return new Promise((resolve, reject) => {
    fs.open(path, flags, mode, (err, fd) => {
      if (err) return reject(err);
      resolve(fd);
    });
  });
};

export function close(fd) {
  return new Promise<void>((resolve, reject) => {
    fs.close(fd, err => {
      if (err) return reject(err);
      resolve();
    });
  });
};

export function ftruncate(fd, length) {
  return new Promise<void>((resolve, reject) => {
    fs.ftruncate(fd, length, err => {
      if (err) return reject(err);
      resolve();
    });
  });
};

export function fdatasync(fd) {
  return new Promise<void>((resolve, reject) => {
    fs.fdatasync(fd, err => {
      if (err) return reject(err);
      resolve();
    });
  });
};

export function fsync(fd) {
  return new Promise<void>((resolve, reject) => {
    fs.fsync(fd, err => {
      if (err) return reject(err);
      resolve();
    });
  });
};

export function fstat(fd) {
  return new Promise((resolve, reject) => {
    fs.fstat(fd, (err, stat) => {
      if (err) return reject(err);
      resolve(stat);
    });
  });
};

export function stat(path) {
  return new Promise((resolve, reject) => {
    fs.stat(path, (err, stat) => {
      if (err) return reject(err);
      resolve(stat);
    });
  });
};

export function rename(oldPath, newPath) {
  return new Promise<void>((resolve, reject) => {
    fs.rename(oldPath, newPath, err => {
      if (err) return reject(err);
      resolve();
    });
  });
};

export function link(srcPath, dstPath) {
  return new Promise<void>((resolve, reject) => {
    fs.link(srcPath, dstPath, err => {
      if (err) return reject(err);
      resolve();
    });
  });
};

export const mkdirp = mkdirpLib;

export function readdir(path, opts) {
  return new Promise((resolve, reject) => {
    fs.readdir(path, opts, (err, files) => {
      if (err) return reject(err);
      resolve(files);
    });
  });
};

export function readFile(path, opts) {
  return new Promise((resolve, reject) => {
    fs.readFile(path, opts, (err, data) => {
      if (err) return reject(err);
      resolve(data);
    });
  });
};

export function writeFile(path, data, opts, callback) {
  return new Promise<void>((resolve, reject) => {
    fs.writeFile(path, data, opts, (err) => {
      if (err) return reject(err);
      resolve();
    });
  });
};

export function unlink(path) {
  return new Promise<void>((resolve, reject) => {
    fs.unlink(path, err => {
      if (err) return reject(err);
      resolve();
    });
  });
};

export function access(path, mode) {
  return new Promise<void>((resolve, reject) => {
    fs.access(path, mode, err => {
      if (err) return reject(err);
      resolve();
    });
  });
};
