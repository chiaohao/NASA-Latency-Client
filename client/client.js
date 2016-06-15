process.on('uncaughtException', function (err) {
  console.error(err)
})
var http = require('http')
var ping = require('net-ping')
var schedule = require('node-schedule')
var getmac = require('getmac').getMac
var localip = require('local-ip')
var interface = process.argv[2]

var hname = process.argv[3]
var hport = process.argv[4]

//process.argv.forEach(function(a){
//	console.log(a)
//})

var reqReg = new http.ClientRequest({
	hostname: hname,
	port: hport,
	path: '/reg',
	method: 'POST'
})

var dataReg = {
	"mac": null,
	"ip_local": null
}

function reg(dataReg, callback){
	getmac(function(error, macAddr){
		dataReg.mac = macAddr
		localip(interface, function(error, lip){
			dataReg.ip_local = lip
			callback(dataReg)
		})
	})
}

reg(dataReg, function(dataReg){
	reqReg.end(JSON.stringify(dataReg), function(){
			console.log(dataReg)
	})
})

var j = schedule.scheduleJob('52 * * * * *', function(){
	var data = {
		"ip_local": null,
		"ip_remote": null,
		"data": []
	}

	var req = new http.ClientRequest({
		hostname: hname,
		port: hport,
		path: '/report',
		method: 'POST'
	})

	var reqGet = {
		hostname: hname,
		port: hport,
		path: '/list'
	}

	var session = ping.createSession()

	function getLatency(target, data, callback){
		for(var i=0;i<10;i++){
			session.pingHost(target, function(error, target, sent, rcvd){
				data.ip_remote = target.ip
				var ms = rcvd - sent

				var pingData = {
					"rtt": null,
					"ts": sent
				}

				if(error)
					pingData.rtt = -1
				else
					pingData.rtt = ms
				data.data.push(pingData)

				localip(interface, function(error, lip){
					data.ip_local = lip
				})
			})
		}


		setTimeout(function(){
			callback(data
		)}, 10000)
	}

	function getList(reqGet, data){
		http.get(reqGet, function(res){
			res.on('data', function(targetsString){
				var targets = JSON.parse(targetsString)
				targets.forEach(function(target){
					getLatency(target, data, function(data){
						req.end(JSON.stringify(data), function(){
							console.log(data)
						})
					})
				})
			})
		})
	}
	getList(reqGet, data)
//	getLatency('8.8.8.8', data, function(data){
//		req.end(JSON.stringify(data), function(){
//			console.log(data)
//		})
//	})
})
