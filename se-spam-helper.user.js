// ==UserScript==
// @name          Stack Exchange spam helper
// @description   filter for the stack exchange real time question viewer,
// @description   aiding in identification and removal of network-wide obvious spam
// @match         http://stackexchange.com/questions?tab=realtime
// @version       1.0
// ==/UserScript==


var ws = new WebSocket("ws://sockets.ny.stackexchange.com");
ws.onmessage = onmessage;
ws.onopen = function(){ws.send("155-questions-active")};

var css = document.createElement("style");
document.head.appendChild(css);

var seen = {};
var seen_twice = {};

function onmessage(e){
  var response = JSON.parse(JSON.parse(e.data).data);
  var title = response.titleEncodedFancy;
  var site = response.apiSiteParameter;
  var body = response.bodySummary;
  var text = title + " " + body;
  var id = response.id;
  var classname = "realtime-" + site + "-" + id;
    
  if(!seen_twice[classname]){
    if(seen[classname]){
      css.textContent += "." + classname + " p {display: none}\n";
      seen_twice[classname] = true;
    }else{
      if(/[^a-z0-9\s]{4}/i.test(title)){
        css.textContent += "." + classname + " {background-color: #FCC}\n";
      }
      seen[classname] = true;
    }
  }
};
