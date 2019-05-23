"use strict";

var nut   = require('./nut')
var shell = require('./shell') //the shell surrounds the nut
//var precodec = require('./codec')
var Codec = require('level-codec')
var merge = require('xtend')

var ReadStream = require('./read-stream')

var sublevel = function (db, options) {
  const allOptions = merge(db.options, options);
  //console.log('sublevel', allOptions);
  //return shell ( nut ( db, precodec, new Codec ), [], ReadStream, opts)
  return shell ( nut ( db, new Codec, new Codec ), [], ReadStream, allOptions)
}

module.exports = function (db, opts) {
  if (typeof db.sublevel === 'function' && typeof db.clone === 'function') return db.clone(opts)
  return sublevel(db, opts)
}
