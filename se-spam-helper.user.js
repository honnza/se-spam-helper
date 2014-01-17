// ==UserScript==
// @name          Stack Exchange spam helper
// @description   filter for the stack exchange real time question viewer,
// @description   aiding in identification and removal of network-wide obvious spam
// @include       http://stackexchange.com/questions?tab=realtime
// @version       2.0
// ==/UserScript==

(function(){
  var ws, wsRefreshTimeout, wsTimeoutSet = Date.now();
  (function wsRefresh(){
    if(ws) ws.close(); // just in case
    ws = new WebSocket("ws://sockets.ny.stackexchange.com");
    ws.onmessage = location.reload.bind(location);
    ws.onerror = console.log.bind(console, "websocket error");
    ws.onopen = function(){ws.send("155-questions-active")};
    wsRefreshTimeout = setTimeout(wsRefresh, 60000);
  })();

})()