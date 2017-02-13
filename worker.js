
self.onmessage = function(e) {
  var tripInMicoSec = Math.round((performance.now() - e.data) * 1000)
  self.postMessage(tripInMicoSec);
}