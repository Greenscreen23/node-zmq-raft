/*
 *  Copyright (c) 2017 Rafał Michalski <royal@yeondir.com>
 */
"use strict";

import { stat, open, close } from '../utils/fsutil';
import { TokenFile, TOKEN_HEADER_SIZE } from '../utils/tokenfile';

export const FTYPE_DIRECTORY    = Symbol('directory')
    , FTYPE_FILE         = Symbol('file')
    , FTYPE_INDEXFILE    = Symbol('file:index')
    , FTYPE_SNAPSHOTFILE = Symbol('file:snapshot');

export const detect = function detect(file) {
  return stat(file)
  .then(stat => {
    if (stat.isDirectory()) return [FTYPE_DIRECTORY, stat];
    else if (!stat.isFile()) {
      throw new Error("provided file is not a driectory or regular file");
    }

    return open(file, 'r').then(fd => {
      var tokenfile = new TokenFile(fd, 0);
      return Promise.all([
        tokenfile.findToken('RLOG', 0, TOKEN_HEADER_SIZE),
        tokenfile.findToken('SNAP', 0, TOKEN_HEADER_SIZE)
      ])
      .then(([rlog, snap]) => {
        if (rlog) return [FTYPE_INDEXFILE, stat, tokenfile];
        else if (snap) return [FTYPE_SNAPSHOTFILE, stat, tokenfile];
        else return [FTYPE_FILE, stat, fd];
      })
      .catch(err => close(fd).then(() => { throw err; }));
    });
  });
};
