process.on('uncaughtException', function (err) {
  console.err(err);
});

var http = require('http');
var ip = require('ip');
var Promise = require('bluebird');
var sqlite3 = require('sqlite3').verbose();
var db = new sqlite3.Database('main.db');

function macToLong(mac) {
  return parseInt('0x' + mac.split(':').join(''));
}

function checkElements(obj, keys) {
  keys.forEach(function(key) {
    if(typeof(obj[key]) == 'undefined') {
      return false;
    }
    if(obj[key] === '') {
      return false;
    }
  });
}

db.serialize(function() {
  db.run("CREATE TABLE IF NOT EXISTS device (mac INTEGER, ip INTEGER, ip_pub INTEGER, active INTEGER, cime INTEGER)");
  db.run("CREATE TABLE IF NOT EXISTS report (ip_from INTEGER, ip_to INTEGER, rtt, INTEGER, ctime INTEGER)");
});

const PORT = process.env.PORT || 3000;

//We need a function which handles requests and send response
function handleRequest(req, res){
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  try {
    if(req.method == 'POST') {
      var body = '';
      req.on('data', function (data) {
        body += data;
      });
      req.on('end', function () {
        console.log("Body: " + body);
      });
      body = JSON.parse(body);
      switch(req.url) {
        case '/reg':
          if(!checkElements(body, ['mac', 'ip_local'])) {
            throw 'missing elements';
          }
          new Promise(function(resolve, reject) {
            db.run('UPDATE `device` SET `active` = 0 WHERE `active` = 1 AND `ip` = ?', ip.toLong(body.ip_local), function(err) {
              if(err) throw err;
              resolve();
            });
          }).then(function() {
            db.run('INSERT INTO device `mac`, `ip`, `ip_pub`, `active`, `ctime` VALUES (?, ?, ?, ?)', macToLong(body.mac), ip.toLong(body.ip_local), ip.toLong(req.connection.remoteAddress), 1, Math.abs(new Date()), function(err) {
              res.end('ok');
            });
          });
          return;
        case '/report':
          if(!checkElements(body, ['ip_local', 'ip_remote', 'data'])) {
            throw 'missing elements';
          }
          new Promise(function(resolve, reject) {
            db.get('SELECT `ip` FROM `device` WHERE `active` = 1 AND `ip` = ?', ip.toLong(body.ip_local), function(err, row) {
              if(err || !row) {
                throw 'unregistered client';
              }
              resolve();
            });
          }).then(function() {
            return new Promise.all(body.data.map(function(row) {
              return new Promise(function(resolve, reject) {
                db.run('INSERT INTO report `ip_from`, `ip_to`, `rtt`, `ctime` VALUES (?, ?, ?, ?)', ip.toLong(body.ip_local), row.rtt, row.ts, function(err) {
                  if(!err){
                    resolve();
                  }
                });
              });
            }));
          }).then(function() {
            res.end('ok');
          });
          return;
      }
    } else {
      switch(req.url) {
        case '/':
          res.end('Hello, world!');
          return;
        case '/list':
          db.all('SELECT `ip` FROM `device` WHERE `active` = 1 AND NOT `ip` = ?', req.connection.remoteAddress, function(err, rows) {
            if(err) {
              res.statusCode = 500;
              return res.end(JSON.stringify('error'));
            }
            console.log(rows);
            return res.end(JSON.stringify(rows));
          });
      }
    }
    res.statusCode = 404;
    res.end();
  } catch(e) {
    res.statusCode = 400;
    res.end();
  }
}

//Create a server
var server = http.createServer(handleRequest);

//Lets start our server
server.listen(PORT, function(){
    //Callback triggered when server is successfully listening. Hurray!
    console.log("Server listening on: http://localhost:%s", PORT);
});
