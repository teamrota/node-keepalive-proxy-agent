/* eslint-disable no-console */

const https = require("https");
const util = require("util");

const ProxyAgent = require("../index");

const sleep = util.promisify(setTimeout);

const agent = new ProxyAgent({
  proxy: "http://proxy.stag.rota.com:3128",
  noProxy: "localhost",
  keepAlive: true,
});

https.globalAgent = agent;

const url = "https://httpbin.org/get";

const fetch = async () => {
  https
    .get(url, (res) => {
      let data = [];
      res.on("data", (chunk) => {
        data.push(chunk);
      });

      res.on("end", () => {
        console.log("bytes =", Buffer.concat(data).length);
      });
    })
    .on("error", (err) => {
      console.error("error =", err.message);
    });
};

async function go() {
  for (var i = 0; i < 1000; i++) {
    console.log("Run", i, "at", i * 5);

    for (var x = 0; x < 1; x++) {
      fetch();
    }

    await sleep(15000);
  }
}

setInterval(() => {
  console.log(
    "freeSockets = ",
    Object.entries(agent.freeSockets).map(([k, v]) => k + " -> " + v.length)
  );
}, 1000);

go();
