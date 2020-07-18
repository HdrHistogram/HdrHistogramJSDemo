const worker = new Worker("logparser.worker.js");

class WorkerMediator extends EventTarget {
  constructor(worker) {
    super();
    worker.onmessage = ({ data }) => {
      switch (data.type) {
        case "webWorkerReady":
          this.ready = true;
          this.dispatchEvent(new Event("ready"));
          break;
        case "newFileData":
        case "fullFileData":
        case "rangeData":
          const dataEvent = new Event(data.type);
          dataEvent.data = data.data;
          dataEvent.data.histogram = google.visualization.arrayToDataTable(
            data.data.dataSeries
          );
          dataEvent.data.maxDataRows.forEach((row) => {
            row[0] = new Date(row[0]);
          });
          this.dispatchEvent(dataEvent);
          break;
        default:
          console.log("Unknown web worker event", { data });
      }
    };
    worker.postMessage({ type: "init" });
  }

  newLogFile(content) {
    worker.postMessage({
      type: "newLogFile",
      content,
    });
  }

  changeRange(start, end) {
    worker.postMessage({
      type: "changeRange",
      start: start.getTime(),
      end: end.getTime(),
    });
  }

  toggleMetric(tag) {
    worker.postMessage({
      type: "toggleMetric",
      tag,
    });
  }

  registerReadyCb(cb) {
    if (this.ready) {
      cb();
    } else {
      this.addEventListener("ready", cb);
    }
  }

  registerNewFileDataCb(cb) {
    this.addEventListener("newFileData", cb);
  }

  registerFullFileDataCb(cb) {
    this.addEventListener("fullFileData", cb);
  }

  registerRangeDataCb(cb) {
    this.addEventListener("rangeData", cb);
  }
}

const mediator = new WorkerMediator(worker);
