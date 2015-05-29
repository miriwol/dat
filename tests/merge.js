var os = require('os')
var path = require('path')
var test = require('tape')
var spawn = require('tape-spawn')
var through = require('through2')
var parallel = require('run-parallel')
var ndjson = require('ndjson')
var helpers = require('./helpers')

var tmp = os.tmpdir()
var dat = path.resolve(__dirname + '/../cli.js')
var hashes, diff

var csvs = {
  a: path.resolve(__dirname + '/fixtures/a.csv'),
  b: path.resolve(__dirname + '/fixtures/b.csv'),
  c: path.resolve(__dirname + '/fixtures/c.csv')
}

var dat1 = path.join(tmp, 'dat-1')
var dat2 = path.join(tmp, 'dat-2')

helpers.twodats(dat1, dat2)
helpers.conflict(dat1, dat2, 'merge-test', csvs)

test('dat1 forks', function (t) {
  var st = spawn(t, dat + ' forks', {cwd: dat1})
  st.stderr.empty()
  st.stdout.match(function match (output) {
    var ok = output.length === 130 // 32bit hash 2 in hex (64) x2 (128) + 2 newlines (130)
    if (ok) hashes = output.split('\n')
    return ok
  })
  st.end()
})

test('dat1 diff', function (t) {
  var st = spawn(t, dat + ' diff ' + hashes.join(' '), {cwd: dat1})
  st.stderr.empty()
  st.stdout.match(function match (output) {
    try {
      diff = JSON.parse(output)
    } catch (e) {
      return false
    }
    if (diff.versions[0].value.name === 'Max' && diff.versions[1].value.name === 'MAX') return true
  })
  st.end()
})

test('dat1 merge', function (t) {
  var diff = spawn(t, dat + ' diff ' + hashes.join(' '), {cwd: dat1, end: false})
  var merge = spawn(t, dat + ' merge ' + hashes.join(' ') + ' --stdin', {cwd: dat1, end: false})

  diff.stdout.stream
    .pipe(ndjson.parse())
    .pipe(through.obj(function (obj, enc, next) {
      next(null, obj.versions[0])
    }))
    .pipe(ndjson.serialize())
    .pipe(merge.stdin)

  diff.stderr.empty()
  merge.stdout.empty()
  merge.stderr.match(/Merged/)

  parallel([merge.end.bind(merge), diff.end.bind(diff)], function () {
    t.end()
  })
})

test('verify merge version', function (t) {
  var st = spawn(t, dat + ' export -d merge-test', {cwd: dat1})

  st.stderr.empty()
  st.stdout.match(function match (output) {
    try {
      output = JSON.parse(output)
      return output.name === 'MAX'
    } catch (e) {
      return false
    }
  })

  st.end()
})
