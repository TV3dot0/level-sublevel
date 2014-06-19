var EventEmitter = require('events').EventEmitter
var range = require('../range')
var pull = require('pull-stream')
var compare = require('../range').compare

var next = 'undefined' === typeof setImmediate ? setTimeout : setImmediate

var I = 0

function insert (ary, op) {
  for(var i in ary) {
    var c = compare(ary[i].key, op.key)
    if(c === 0)
      return op.type === 'del' ? ary.splice(i, 1) : ary[i] = op
    else if(c > 0)
      return ary.splice(i, 0, op)
  }
  ary.push(op)
}

function get (ary, key) {
  for(var i in ary)
    if(compare(ary[i].key, key) === 0)
      return ary[i].value
  return null
}

module.exports = function () {
  if(process.env.FOR_REAL) {
    var db = require('level-test')()('test-level-sublevel_' + I++)
    db.iterator = db.db.iterator
    return db
  }

  var emitter = new EventEmitter()
  var data = emitter.data = []

  emitter.batch = function (ops, opts, cb) {
    ops.forEach(function (op) {
      insert(data, op)
//      if(op.type === 'del')
//        delete data[op.key]
//      else
//        data[op.key] = op.value
    })
    next(function () {
      emitter.emit('post', ops); cb()
    })
  }

  emitter.get = function (key, cb) {
    var value = get(data, key)
    next(function () {
      if(!value) cb(new Error('404'))
      else       cb(null, value)
    })
  }

  emitter.db = {}
  emitter.db.iterator = function (opts) {
    var values = data.filter(function (v) {
      return range(opts, v.key)
    }).map(function (op) {
      return {key: op.key, value: op.value}
    })
    if(opts.reverse) values.reverse()

    var stream = pull.values(values)

    return {
      next: function (cb) {
        stream(null, function (err, d) {
          cb(err, d && d.key, d && d.value)
        })
      },
      end: function (cb) {
        stream(true, cb)
      }
    }
  }

  return emitter
}
