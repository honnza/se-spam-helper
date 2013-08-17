// ==UserScript==
// @name          Stack Exchange spam helper
// @description   filter for the stack exchange real time question viewer,
// @description   aiding in identification and removal of network-wide obvious spam
// @match         http://stackexchange.com/questions?tab=realtime
// @version       1.1
// ==/UserScript==


(function(){
  var ws = new WebSocket("ws://sockets.ny.stackexchange.com");
  ws.onmessage = onmessage;
  ws.onopen = function(){ws.send("155-questions-active")};

  var css = document.createElement("style");
  document.head.appendChild(css);

  var seen = {};
  var seen_ary = JSON.parse(localStorage.getItem("spam-helper-seen"))||[];
  seen_ary.forEach(function(x){seen[x] = true});
  var seen_twice = {};
  var seen_twice_ary = JSON.parse(localStorage.getItem("spam-helper-seen_twice"))||[];
  seen_twice_ary.forEach(function(x){seen_twice[x] = true});
  
  var seen_today = {};
  window.addEventListener("unload", onbeforeunload);

  function onmessage(e){
    var response = JSON.parse(JSON.parse(e.data).data);
    var title = response.titleEncodedFancy;
    var site = response.apiSiteParameter.replace(/\./,"-");
    var body = response.bodySummary;
    var text = title + " " + body;
    var id = response.id;
    var classname = "realtime-" + site + "-" + id;
    
    seen_today[classname] = 1;

    if(!seen_twice[classname]){
      if(seen[classname]){
        css.textContent += "." + classname +
          " {height: 1em; overflow: hidden; padding-top: 0; padding-bottom: 0}\n";
        seen_twice[classname] = 1;
      }else{
        if(/[^a-z0-9\s]{6}/i.test(title)){
          css.textContent += "." + classname + " {background-color: #FCC}\n";
        }
        seen[classname] = 1;
      }
    }
  };

  function onbeforeunload(){
    console.log('unloading');
    try{
      var seen_ary = Object.keys(seen).filter(function(x){return !seen_twice[x]});
      var seen_twice_ary = Object.keys(seen_twice);
      localStorage.setItem("spam-helper-seen", JSON.stringify(seen_ary));
      localStorage.setItem("spam-helper-seen_twice", JSON.stringify(seen_twice_ary));
    }catch(ex){
      console.log('unloading failed');
      seen_ary = seen_ary.filter(function(x){return seen_today[x]});
      seen_twice_ary = seen_twice_ary.filter(function(x){return seen_today[x]});
      localStorage.setItem("spam-helper-seen", JSON.stringify(seen_ary));
      localStorage.setItem("spam-helper-seen_twice", JSON.stringify(seen_twice_ary));
      console.log('pruned data');
    }
  };
})();
