var http = require('http')
var ping = require('net-ping')
var schedule = require('node-schedule')
var getmac = require('getmac').getMac
var localip = require('local-ip')
var interface = 'ens33'

var hname = process.argv[2]
var hport = process.argv[3]

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
	mac: null,
	ip_local: null
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

var j = schedule.scheduleJob('* 0,5,10,15,20,25,30,35,40,45,50,55 * * * *', function(){
	var data = {
		ip_local: null,
		ip_remote: null,
		rtt: null
	}

	var req = new http.ClientRequest({
		hostname: hname,
		port: hport,
		path: '/report',
		method: 'POST'
	})

	var reqGet = new http.ClientRequest({
		hostname: hname,
		port: hport,
		path: '/list'
	})

	var session = ping.createSession()

	function getLatency(target, data, callback){
		session.pingHost(target, function(error, target, sent, rcvd){
			data.ip_remote = target
			var ms = rcvd - sent
			if(error)
				data.rtt = -1
			else{
				data.rtt = ms
			}
			localip(interface, function(error, lip){
				data.ip_local = lip
				callback(data)
			})		
		})
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

//	getLatency('8.8.8.8', data, function(data){
//		req.end(JSON.stringify(data), function(){
//			console.log(data)
//		})
//	})
})

