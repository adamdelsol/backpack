import cluster from "cluster";
import os from "os";

import { processQueue } from "./worker";
const workers: { [workerPid: string]: any } = {},
  count = os.cpus().length;

function spawn() {
  const worker = cluster.fork();
  workers[worker.pid] = worker;
  return worker;
}

if (cluster.isMaster) {
  for (let i = 0; i < count; i++) {
    spawn();
  }
  cluster.on("death", function (worker: any) {
    console.log("worker " + worker.pid + " died. spawning a new process...");
    delete workers[worker.pid];
    spawn();
  });
} else {
  (async () => {
    const x = 0;
    while (x < 1) {
      // Run always
      await processQueue();
    }
  })();
}

process.on("uncaughtException", function (err) {
  console.log("Caught exception: " + err);
});
