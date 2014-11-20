// ==UserScript==
// @name          Stack Exchange spam helper
// @description   filter for the stack exchange real time question viewer,
// @description   aiding in identification and removal of network-wide obvious spam
// @include       http://stackexchange.com/questions?tab=realtime
// @version       4
// ==/UserScript==

var QUEUE_TIMEOUT = 12 * 60 * 60 * 1000;
var WEBSOCKET_TIMEOUT = 6 * 60 * 1000;

var ws, wsRefreshTimeout;
(function wsRefresh(){
  //refresh the official stream
  StackExchange.realtime.init("ws://qa.sockets.stackexchange.com");
  //establish our own socket
  wsRefreshTimeout = setTimeout(wsRefresh, 30000);
  ws = new WebSocket("ws://qa.sockets.stackexchange.com");
  ws.onmessage = function(){
    clearTimeout(wsRefreshTimeout);
    wsRefreshTimeout = setTimeout(wsRefresh, WEBSOCKET_TIMEOUT);
    onMessage.apply(this, arguments);
  };
  ws.onerror = function(){
    console.log.apply(console, ["console.error"].concat(arguments));
    $("#mainArea").load(location.href + " #mainArea", scrapePage);
  };
  ws.onopen = function(){
    ws.send("155-questions-active");
    for(var site in siteWebsocketIDs){
      if(siteWebsocketIDs[site]){
        ws.send(siteWebsocketIDs[site] + "-questions-active");
      }
    }
  };
})();

function onMessage(e){
  var response = JSON.parse(e.data);
  var data = response.data && JSON.parse(response.data);
  if(response.action === "hb"){
    ws.send("hb");
  // } else if(response.action === "155-questions-active"){
  //     onQuestionActive(parseRealtimeSocket(data));
  // } else if(response.action.match(/\d+-questions-active/)){
  //     scrapePerSiteQuestion(data.body, sitesByWebsocketID[data.siteid]);
  } else {
      console.log("unknown response type: %s in %o", response.action, response);
  }
}   