process.on('uncaughtException', function (err) {
  console.error(err);
});

var http = require('http');
var ip = require('ip');
var Promise = require('bluebird');
var sqlite3 = require('sqlite3').verbose();
var child_process = require('child_process');
var db = new sqlite3.Database('main.db');

function macToLong(mac) {
  return parseInt('0x' + mac.split(':').join(''));
}

function checkElements(obj, keys) {
  var result = true;
  keys.forEach(function(key) {
    if(typeof(obj[key]) == 'undefined' || obj[key] === '' || obj[key] === null) {
      console.log('bad value for key', key);
      result = false;
      return;
    }
  });
  return result;
}

db.serialize(function() {
  db.run("CREATE TABLE IF NOT EXISTS device (mac INTEGER, ip INTEGER, ip_pub INTEGER, active INTEGER, ctime INTEGER)");
  db.run("CREATE TABLE IF NOT EXISTS report (ip_from INTEGER, ip_to INTEGER, rtt INTEGER, ctime TEXT)");
});

const PORT = process.env.PORT || 3000;

//We need a function which handles requests and send response
function handleRequest(req, res){
  console.log('incoming connection', req.connection.remoteAddress, req.url);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  try {
    if(req.method == 'POST') {
      new Promise(function(resolve, reject) {
        var body = '';
        req.on('data', function (data) {
          body += data;
        });
        req.on('end', function () {
          console.log("Body: " + body);
          resolve(body);
        });
      }).then(function(body) {
        return JSON.parse(body);
      }).then(function(body) {
        switch(req.url) {
          case '/reg':
            if(!checkElements(body, ['mac', 'ip_local'])) {
              throw 'missing elements';
            }
            new Promise(function(resolve, reject) {
              db.run('UPDATE `device` SET `active` = 0 WHERE `active` = 1 AND `ip` = ?', ip.toLong(body.ip_local), function(err) {
                if(err) {
                  console.log(err, 'refresh error');
                }
                resolve();
              });
            }).then(function() {
              db.run('INSERT INTO `device` (`mac`, `ip`, `ip_pub`, `active`, `ctime`) VALUES (?, ?, ?, ?, ?)', macToLong(body.mac), ip.toLong(body.ip_local), ip.toLong(req.connection.remoteAddress), 1, Math.abs(new Date()), function(err) {
                if(err) {
                  console.log(err, 'reg error');
                }
                console.log('reg ok');
                res.end('ok');
              });
            });
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
                console.log(row);
                return new Promise.all([
                  new Promise(function(resolve, reject) {
                    db.run('INSERT INTO report `ip_from`, `ip_to`, `rtt`, `ctime` VALUES (?, ?, ?, ?)', ip.toLong(body.ip_local), ip.toLong(body.ip_remote), row.rtt, row.ts, function(err) {
                      if(!err) {
                        resolve();
                      }
                    });
                  }),
                  new Promise(function(resolve, reject) {
                    var aws_cmd = 'aws cloudwatch put-metric-data --metric-name Latency --namespace NasaFinal --dimensions From=' + body.ip_local + ',To=' + body.ip_remote + ' --timestamp ' + row.ts + ' --value ' + row.rtt + ' --unit Milliseconds';
                    child_process.exec(aws_cmd, function(error, stdout, stderr) {
                      if(!error) {
                        resolve();
                      }
                    });
                  })
                ]);
              }));
            }).then(function() {
              res.end('ok');
            });
        }
      });
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
            rows = rows.map(function(row) {
              return ip.fromLong(row.ip);
            })
            console.log(rows);
            return res.end(JSON.stringify(rows));
          });
      }
    }
//    res.statusCode = 404;
//    res.end();
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
