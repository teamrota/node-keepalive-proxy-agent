const https = require('https')
const pem = require('pem')
const myproxy = require('proxy')

function startserver (PORT) {
  return new Promise((resolve) => {
    pem.createCertificate({days: 1, selfSigned: true}, function (err, keys) {
      let server = https.createServer({key: keys.serviceKey, cert: keys.certificate}, function (req, res) {
        res.end(':' + req.url + ':')
      }).listen(PORT)
      resolve(server)
    })
  })
}

function startproxy (PORT, auth) {
  let p = myproxy()
  if (auth) {
    p.authenticate = function (req, fn) {
      fn(null, req.headers['proxy-authorization'] === 'Basic Ym9iOmFsaWNl') // user bob password alice
    }
  }
  p.listen(PORT)
  return p
}

let servers = []

async function start() {
  servers.push(await startserver(8443))
  servers.push(await startserver(8444))
  servers.push(startproxy(3128))
  servers.push(startproxy(3129, true))
}

async function stop () {
  servers[0].close()
  servers[1].close()
  servers[2].close()
  servers[3].close()
}

module.exports = {
  start: start,
  stop: stop
}
/*
if (require.main === module) {
  start()
  console.log(`
Server1 listening on https://localhost:8443
Server2 listening on https://localhost:8444
Proxy1 listening on http://localhost:3128
Proxy2 listening on http://localhost:3129 Authentication "bob:alice"

Get https://localhost:8443/quit to exit process

curl -k https://localhost:8443
curl -k https://localhost:8444
curl -k --proxy localhost:3128 https://localhost:8443
curl -k --proxy-basic --proxy-user bob:alice --proxy localhost:3129 https://localhost:8443
curl -k --proxy-basic --proxy-user WRONG:PASSWORD --proxy localhost:3129 https://localhost:8443

`)
}
*/