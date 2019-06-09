
const hooks = require('./hooks');
const ltgt = require('ltgt');

const preCodecOptions = {
  keyEncoding: 'utf8',
  valueEncoding: 'json',
  asBuffer: false
};

const codecOptions = {
  keyEncoding: 'utf8',
  valueEncoding: 'json',
  asBuffer: false
};


function isFunction (f) {
  return 'function' === typeof f
}

function getPrefix (db) {
  if(db == null) return db;
  if(isFunction(db.prefix)) return db.prefix();
  return db
}

function has(obj, name) {
  return Object.hasOwnProperty.call(obj, name)
}

function clone (_obj) {
  var obj = {};
  for(var k in _obj)
    obj[k] = _obj[k]
  return obj
}

module.exports = function (db, precodec, codec, compare) {
  var prehooks = hooks(compare);
  var posthooks = hooks(compare);
  var waiting = [], ready = false;

  function encodePrefix(prefix, key, opts1, opts2) {
    const encoded = precodec.encodeKey([ prefix, codec.encodeKey(key) ], preCodecOptions);
    return encoded;
  }

  function decodePrefix(data) {
    const decoded = precodec.decodeKey(data)
    return decoded;
  }

  function addEncodings(op, prefix) {
    if(prefix && prefix.options) {
      op.keyEncoding = op.keyEncoding || prefix.options.keyEncoding;
      op.valueEncoding = op.valueEncoding || prefix.options.valueEncoding;
    }
    return op
  }

  function start () {
    ready = true;
    while(waiting.length)
      waiting.shift()()
  }

  if(isFunction(db.isOpen)) {
    if(db.isOpen())
      ready = true;
    else
      db.open(start)
  } else {
    db.open(start)
  }

  return {
    location: db.location,
    apply: function (ops, opts, cb) {
      //apply prehooks here.
      for(var i = 0; i < ops.length; i++) {
        var op = ops[i];

        function add(op) {
          if(op === false) return delete ops[i];
          ops.push(op)
        }

        addEncodings(op, op.prefix);
        op.prefix = getPrefix(op.prefix);
        prehooks.trigger([op.prefix, op.key], [op, add, ops])
      }

      opts = opts || {};

      if('object' !== typeof opts) throw new Error('opts must be object, was:'+ opts);

      if('function' === typeof opts) {cb = opts; opts = {}}

      if(ops.length)
        (db.db || db).batch(
          ops.map(function (op) {
            const stateId = db.db.db.location.split('/').slice(-1)[0];
            const ret = {
              key: encodePrefix(op.prefix, op.key, opts, op),
              value: op.type !== 'del' ? codec.encodeValue(op.value) : undefined,
              type: op.type || (op.value === undefined ? 'del' : 'put')
            };
            //if (ret.type && ret.type === 'put' && ret.value && ret.value.type === 'put')
              //console.log(stateId, ret);
            return ret
          }),
          opts,
          function (err) {
              if(err) return cb(err);
            ops.forEach(function (op) {
              posthooks.trigger([op.prefix, op.key], [op])
            });
            cb()
          }
        );
      else
        cb()
    },
    get: function (key, prefix, opts, cb) {
      const stateId = db && db.db && db.db.db ? db.db.db.location.split('/').slice(-1)[0]: '<unknown loc>';
      console.log('*** nut get', stateId, prefix, key.toString('hex'));
      opts.asBuffer = codec.valueAsBuffer(opts);
      return (db.db || db).get(
        encodePrefix(prefix, key, preCodecOptions),
        codecOptions,
        function (err, value) {
          if(err) cb(err);
          else    {
            if (typeof value === 'object' && value.hasOwnProperty('data'))
              cb(null, Buffer.from(value.data));
            else {
              const decoded = codec.decodeValue(value);
              if (decoded instanceof Buffer) {
                cb(null, decoded);
              } else if (typeof decoded === 'object' && decoded.hasOwnProperty('data')) {
                cb(null, Buffer.from(decoded));
              } else {
                cb(null, decoded)
              }
            }
          }
        }
      )
    },
    pre: prehooks.add,
    post: posthooks.add,
    createDecoder: function (opts) {
      //console.log('*** nut decoder opts', opts);
      if(opts.keys !== false && opts.values !== false)
        return function (key, value) {
          return {
            key: codec.decodeKey(precodec.decodeKey(key, preCodecOptions)[1]),
            value: codec.decodeValue(value, opts)
          }
        };
      if(opts.values !== false)
        return function (_, value) {
          return codec.decodeValue(value, opts)
        };
      if(opts.keys !== false)
        return function (key) {
          return codec.decodeKey(precodec.decodeKey(key, preCodecOptions)[1])
        };
      return function () {}
    },
    isOpen: function isOpen() {
      if (db.db && isFunction(db.db.isOpen))
        return db.db.isOpen();

      return db.isOpen()
    },
    isClosed: function isClosed() {
      if (db.db && isFunction(db.db.isClosed))
        return db.db.isClosed();

      return db.isClosed()
    },
    close: function close (cb) {
      return db.close(cb)
    },
    iterator: function (_opts, cb) {
      //console.log('**** nut iterator', _opts);
      var opts = clone(_opts || {});
      var prefix = _opts.prefix || [];

      function encodeKey(key) {
        return encodePrefix(prefix, key, preCodecOptions, {})
      }

      ltgt.toLtgt(_opts, opts, encodeKey, precodec.lowerBound, precodec.upperBound);

      // if these legacy values are in the options, remove them

      opts.prefix = null;

      //************************************************
      //hard coded defaults, for now...
      //TODO: pull defaults and encoding out of levelup.
      //opts.keyAsBuffer = opts.valueAsBuffer = false
      //************************************************
      opts.keyAsBuffer = precodec.keyAsBuffer(opts);
      opts.valueAsBuffer = codec.valueAsBuffer(opts);

      //this is vital, otherwise limit: undefined will
      //create an empty stream.
      if ('number' !== typeof opts.limit)
        opts.limit = -1;


      function wrapIterator (iterator) {
        return {
          next: function (cb) {
            return iterator.next(cb)
          },
          end: function (cb) {
            iterator.end(cb)
          }
        }
      }

      if(ready)
        return wrapIterator((db.db || db).iterator(opts));
      else
        waiting.push(function () {
          cb(null, wrapIterator((db.db || db).iterator(opts)))
        })

    }
  }

};
