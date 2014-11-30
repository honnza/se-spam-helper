var http = require("http");

var QUEUE_TIMEOUT = 12 * 60 * 60 * 1000;
var WEBSOCKET_TIMEOUT = 6 * 60 * 1000;

var ws, wsRefreshTimeout;
(function wsRefresh(){
  //establish our own socket
  wsRefreshTimeout = setTimeout(wsRefresh, 30000);
  ws = new WebSocket("ws://qa.sockets.stackexchange.com");
  ws.onmessage = function(){
    clearTimeout(wsRefreshTimeout);
    wsRefreshTimeout = setTimeout(wsRefresh, WEBSOCKET_TIMEOUT);
    onWsMessage.apply(this, arguments);
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

var siteWebsocketIDs = {}; 

function onWsMessage(e){
  var response = JSON.parse(e.data);
  var data = response.data && JSON.parse(response.data);
  if(response.action === "hb"){
    ws.send("hb");
  } else if(response.action === "155-questions-active"){
    onQuestionActive(parseRealtimeSocket(data));
  // } else if(response.action.match(/\d+-questions-active/)){
  //   scrapePerSiteQuestion(data.body, sitesByWebsocketID[data.siteid]);
  } else {
    console.log("unknown response type: %s in %o", response.action, response);
  }
}   

function onQuestionActive(e){
  http.get(e.link, console.log.bind(console))
}

function parseRealtimeSocket(wsData){
  return{
    body: wsData.bodySummary,
    link: wsData.url,
    site: wsData.apiSiteParameter,
    tags: wsData.tags,
    title: htmlUnescape(wsData.titleEncodedFancy),
    question_id: wsData.id,
  };
}

function htmlUnescape(html){
  return new DOMParser().parseFromString(html, "text/html")
                        .body.textContent.trim();
}