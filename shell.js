const EventEmitter = require('events').EventEmitter;
const addpre = require('./range').addPrefix;

const errors = require('level-errors');
const debug = require('debug')('sublevel:shell');


function isFunction (f) {
  return 'function' === typeof f
}

function isString (s) {
  return 'string' === typeof s
}

function isObject (o) {
  return o && 'object' === typeof o
}

const version = require('./package.json').version;

var sublevel = module.exports = function (nut, prefix, createStream, options) {

  const emitter = new EventEmitter();
  emitter.sublevels = {};
  emitter.options = options;
  emitter.version = version;
  emitter.methods = {};

  prefix = prefix || [];

  function errback (err) { if (err) emitter.emit('error', err) }

  createStream = createStream || function (e) { return e };

  function mergeOpts(opts) {
    var o = {};
    if(options)
      for(var k1 in options)
        if(options[k1] != undefined)o[k1] = options[k1];
    if(opts)
      for(var k2 in opts)
        if(opts[k2] != undefined) o[k2] = opts[k2];
    return o
  }

  emitter.put = function (key, value, opts, cb) {
    if('function' === typeof opts) { cb = opts; opts = {} }
    if(!cb) cb = errback;

    //debug('sublevel put', key, value);
    nut.apply([{
      key: key,
      value: value,
      prefix: prefix.slice(),
      type: 'put'
    }], mergeOpts(opts), function (err) {
      if(!err) { emitter.emit('put', key, value); cb(null) }
      if(err) return cb(err)
    })
  };

  emitter.prefix = function () {
    return prefix.slice()
  };

  emitter.del = function (key, opts, cb) {
    if('function' === typeof opts) { cb = opts; opts = {} }
    if(!cb) cb = errback;

    nut.apply([{ key: key, prefix: prefix.slice(), type: 'del'}], mergeOpts(opts), function (err) {
      if(!err) { emitter.emit('del', key); cb(null) }
      if(err) return cb(err)
    })
  };

  emitter.batch = function (ops, opts, cb) {
    if('function' === typeof opts) { cb = opts; opts = {} }
    if(!cb) cb = errback;

    ops = ops.map(function (op) {
      return {
        key:           op.key,
        value:         op.value,
        prefix:        op.prefix || prefix,
        keyEncoding:   op.keyEncoding,    // *
        valueEncoding: op.valueEncoding,  // * (TODO: encodings on sublevel)
        type:          op.type
      }
    });

    //debug('sublevel batch', ops);
    nut.apply(ops, mergeOpts(opts), function (err) {
      if(!err) { emitter.emit('batch', ops); cb(null) }
      if(err) return cb(err)
    })
  };

  emitter.get = function (key, opts, cb) {
    if('function' === typeof opts) {cb = opts; opts = {}}
    nut.get(key, prefix, mergeOpts(opts), function (err, value) {
      if(err) {
        debug('not found', key.toString('hex'));
        cb(new errors.NotFoundError('Key not found in database', err));
      }
      else {
        //debug('found', key.toString('hex'), value);
        cb(null, value)
      }
    })
  };

  emitter.clone = function(opts) {
    return sublevel(nut, prefix, createStream, mergeOpts(opts))
  };

  emitter.sublevel = function (name, opts) {
    return emitter.sublevels[name] =
      emitter.sublevels[name] || sublevel(nut, prefix.concat(name), createStream, mergeOpts(opts))
  };

  emitter.pre = function (key, hook) {
    if(isFunction(key)) return nut.pre([prefix], key);
    if(isString(key)) return nut.pre([prefix, key], hook);
    if(isObject(key)) return nut.pre(addpre(prefix, key), hook);

    throw new Error('not implemented yet')
  };

  emitter.post = function (key, hook) {
    if(isFunction(key)) return nut.post([prefix], key);
    if(isString(key))   return nut.post([prefix, key], hook);
    if(isObject(key))   return nut.post(addpre(prefix, key), hook);

    //TODO: handle ranges, needed for level-live-stream, etc.
    throw new Error('not implemented yet')
  };

  emitter.readStream =
  emitter.createReadStream = function (opts) {
    opts = mergeOpts(opts);
    opts.prefix = prefix;
    var stream;
    var it = nut.iterator(opts, function (err, it) {
      stream.setIterator(it)
    });

    stream = createStream(opts, nut.createDecoder(opts));
    if(it) stream.setIterator(it);

    return stream
  };

  emitter.valueStream =
  emitter.createValueStream = function (opts) {
    opts = opts || {};
    opts.values = true;
    opts.keys = false;
    return emitter.createReadStream(opts)
  };

  emitter.keyStream =
  emitter.createKeyStream = function (opts) {
    opts = opts || {};
    opts.values = false;
    opts.keys = true;
    return emitter.createReadStream(opts)
  };

  emitter.close = function (cb) {
    //TODO: deregister all hooks
    cb = cb || function () {};
    if (!prefix.length) nut.close(cb);
    else process.nextTick(cb)
  };

  emitter.isOpen = nut.isOpen;
  emitter.isClosed = nut.isClosed;
  emitter.location = nut.location;

  return emitter

};
