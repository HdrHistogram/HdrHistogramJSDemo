importScripts("lib/pako.min.js", "lib/hdrhistogram.umd.js");

let allTags = [];
let ignoredMetrics = {};

let accumulatedHistograms = {};

function appendDataSeries(histo, name, dataSeries) {
  var series;
  var seriesCount;
  if (dataSeries.length == 0) {
    series = [["X", name]];
    seriesCount = 1;
  } else {
    series = dataSeries;
    series[0].push(name);
    seriesCount = series[0].length - 1;
  }

  var lines = histo.split("\n");

  var seriesIndex = 1;
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].trim();
    var values = line.trim().split(/[ ]+/);

    if (line[0] != "#" && values.length == 4) {
      var y = parseFloat(values[0]);
      var x = parseFloat(values[3]);

      if (!isNaN(x) && !isNaN(y)) {
        if (seriesIndex >= series.length) {
          series.push([x]);
        }

        while (series[seriesIndex].length < seriesCount) {
          series[seriesIndex].push(null);
        }

        series[seriesIndex].push(y);
        seriesIndex++;
      }
    }
  }

  while (seriesIndex < series.length) {
    series[seriesIndex].push(null);
    seriesIndex++;
  }

  return series;
}

function parseLog(begin = new Date(0), end = new Date(8640000000000000)) {
  const beginParsing = performance.now();

  const reader = new hdr.HistogramLogReader(logFileContent, 16, true);

  if (allTags.length === 0) {
    allTags = hdr.listTags(logFileContent);
  }
  const tags = hdr
    .listTags(logFileContent)
    .filter((tag) => !ignoredMetrics[tag]);

  let latestMaxValues = {};
  tags.forEach((tag) => {
    if (accumulatedHistograms[tag]) {
      accumulatedHistograms[tag].reset();
    } else {
      accumulatedHistograms[tag] = hdr.build({
        useWebAssembly: true,
        bitBucketSize: 64,
      });
    }
  });

  let histogram;
  const rows = [];
  let latestTimeStampMsec;

  while ((histogram = reader.nextIntervalHistogram()) != null) {
    if (!latestTimeStampMsec) {
      latestTimeStampMsec = histogram.startTimeStampMsec;
    }
    if (latestTimeStampMsec != histogram.startTimeStampMsec) {
      const row = [latestTimeStampMsec];
      tags.forEach((tag) => {
        row.push(latestMaxValues[tag]);
      });
      rows.push(row);
      //latestMaxValues = {}
      latestTimeStampMsec = histogram.startTimeStampMsec;
    }
    const histogramDate = new Date(histogram.startTimeStampMsec);
    if (begin <= histogramDate && histogramDate <= end) {
      accumulatedHistograms[histogram.tag].add(histogram);
      latestMaxValues[histogram.tag] = histogram.maxValue;
    }
    histogram.destroy();
  }

  if (Object.keys(latestMaxValues).length > 0) {
    const row = [latestTimeStampMsec];
    tags.forEach((tag) => {
      row.push(latestMaxValues[tag]);
    });
    rows.push(row);
  }

  let dataSeries = [];
  let errorRaised = false;
  tags
    .filter((tag) => accumulatedHistograms[tag].maxValue !== 0)
    .map((tag) => {
      try {
        return [tag, accumulatedHistograms[tag].outputPercentileDistribution()];
      } catch (error) {
        return [tag, false];
      }
    })
    .forEach(([tag, output]) => {
      if (output) {
        dataSeries = appendDataSeries(output, tag, dataSeries);
      } else {
        errorRaised = true;
      }
    });

  const endParsing = performance.now();
  console.log("Process logFileContent in ", endParsing - beginParsing, "ms");

  return {
    tags,
    dataSeries,
    maxDataRows: rows,
    errorRaised,
  };
}

let logFileContent;

const handleNewLogFile = (eventData) => {
  Object.values(accumulatedHistograms).forEach((histogram) =>
    histogram.destroy()
  );
  accumulatedHistograms = {};
  ignoredMetrics = {};
  allTags = [];
  logFileContent = eventData.content;
  const data = parseLog();
  postMessage({
    type: "newFileData",
    data,
  });
};

const handleChangeRange = ({ start, end }) => {
  const data = parseLog(new Date(start), new Date(end));
  postMessage({
    type: "rangeData",
    data,
  });
};

const handleToggleMetric = (tag) => {
  ignoredMetrics[tag] = !ignoredMetrics[tag];
  const data = parseLog();
  postMessage({
    type: "fullFileData",
    data,
  });
};

onmessage = ({ data }) => {
  switch (data.type) {
    case "init":
      hdr.initWebAssembly().then(() => postMessage({ type: "webWorkerReady" }));
      break;
    case "newLogFile":
      handleNewLogFile(data);
      break;
    case "changeRange":
      handleChangeRange(data);
      break;
    case "toggleMetric":
      handleToggleMetric(data.tag);
      break;
    default:
      console.log("Unknown event", { data });
  }
};
