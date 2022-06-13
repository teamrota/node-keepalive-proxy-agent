const https = require("https");
const net = require("net");
const url = require("url");

class ProxyAgent extends https.Agent {
  constructor(options) {
    options = options || {};
    if (options.proxy === undefined) {
      let u = null;
      if (process.env.HTTPS_PROXY !== undefined) {
        u = new url.URL(process.env.HTTPS_PROXY);
      }
      if (process.env.https_proxy !== undefined) {
        u = new url.URL(process.env.https_proxy);
      }
      if (u) {
        options.proxy = { hostname: u.hostname, port: u.port };
      }
    } else if (typeof options.proxy === "string") {
      options.proxy = new url.URL(options.proxy);
    }

    if (options.noProxy === undefined) {
      if (process.env.NO_PROXY !== undefined) {
        options.noProxy = process.env.NO_PROXY.split(",");
      }
    } else if (typeof options.noProxy === "string") {
      options.noProxy = options.noProxy.split(",");
    }

    if (options.keepAlive === undefined) {
      options.keepAlive = true;
    }

    if (options.keepAlive) {
      if (options.keepAliveMsecs === undefined) options.keepAliveMsecs = 1000;
      if (options.timeout === undefined) options.timeout = 15000;
      if (options.maxSockets === undefined) options.maxSockets = 64;
      if (options.maxTotalSockets === undefined) options.maxTotalSockets = 256;
    }

    super(options);

    if (options.maxAge === undefined) {
      this.maxAge = 30000;
    } else {
      this.maxAge = options.maxAge;
    }

    this.socketCreationTime = new WeakMap();
  }

  addRequest(req, options, port, localAddress) {
    for (let i = 0; i < this.maxSockets; i++) {
      try {
        return super.addRequest(req, options, port, localAddress);
      } catch (e) {
        if (e.message === "Bad Socket" || e.message === "Old Socket") {
          // wil be evicted, so loop
        } else {
          throw e;
        }
      }
    }

    throw new Error("Unable to create working socket");
  }

  reuseSocket(socket, req) {
    if (
      socket.destroyed ||
      socket.readyState !== "open" ||
      !socket.writable ||
      !socket.readable
    ) {
      try {
        socket.destroy();
      } catch {
        // ignore destroy errors
      }

      throw new Error("Bad Socket");
    }

    // check age since creation has not exceeded max

    if (
      Date.now() - this.socketCreationTime.get(socket._parent) >
      this.maxAge
    ) {
      try {
        socket.destroy();
      } catch {
        // ignore destroy errors
      }

      throw new Error("Old Socket");
    }

    super.reuseSocket(socket, req);
  }

  createConnectionHttpsAfterHttp(options, cb) {
    const proxySocket = net.createConnection({
      host: options.proxy.hostname || options.proxy.host,
      port: +options.proxy.port,
    });

    proxySocket.setKeepAlive(true, options.proxySocket);

    this.socketCreationTime.set(proxySocket, Date.now());

    const errorListener = (error) => {
      proxySocket.destroy();
      cb(error);
    };

    proxySocket.once("error", errorListener);

    let host = options.hostname;
    if (!host) host = options.host;

    let response = "";
    const dataListener = (data) => {
      response += data.toString();

      if (response.indexOf("\r\n\r\n") < 0) {
        return; // headers not yet received, wait
      }

      proxySocket.removeListener("error", errorListener);
      proxySocket.removeListener("data", dataListener);

      const m = response.match(/^HTTP\/1.\d (\d*)/);
      if (m == null || m[1] == null) {
        proxySocket.destroy();
        return cb(new Error(response.trim()));
      } else if (m[1] !== "200") {
        proxySocket.destroy();
        return cb(new Error(`${m[0]} connecting to ${host}:${options.port}`));
      }

      options.socket = proxySocket; // tell super to use our proxy socket
      cb(null, super.createConnection(options));
    };

    proxySocket.on("data", dataListener);

    let cmd = "CONNECT " + host + ":" + options.port + " HTTP/1.1\r\n";
    if (options.proxy.auth) {
      const auth = Buffer.from(options.proxy.auth).toString("base64");
      cmd += "Proxy-Authorization: Basic " + auth + "\r\n";
    }
    cmd += "\r\n";

    proxySocket.write(cmd);
  }

  createConnection(options, cb) {
    if (options.proxy) {
      if (options.noProxy.find((suffix) => options.hostname.endsWith(suffix))) {
        cb(null, super.createConnection(options));
      } else {
        this.createConnectionHttpsAfterHttp(options, cb);
      }
    } else {
      cb(null, super.createConnection(options));
    }
  }
}

module.exports = ProxyAgent;
