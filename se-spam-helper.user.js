// ==UserScript==
// @name          Stack Exchange spam helper
// @description   filter for the stack exchange real time question viewer,
// @description   aiding in identification and removal of network-wide obvious spam
// @match         http://stackexchange.com/questions?tab=realtime
// @version       1.2.1
// ==/UserScript==

(function(){
  var ws = new WebSocket("ws://sockets.ny.stackexchange.com");
  ws.onmessage = onmessage;
  ws.onopen = function(){ws.send("155-questions-active")};

  var css = document.createElement("style");
  document.head.appendChild(css);
  var daily_css = document.createElement("style");
  document.head.appendChild(daily_css);

  (function reset_daily_css(){
    var ms_in_day = 1000 * 60 * 60 * 24;
    daily_css.textContent = "";
    setTimeout(reset_daily_css, ms_in_day - Date.now() % ms_in_day);
  })();
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
    
    setTimeout(function(){
      var children = document.getElementById("mainArea").children;
      for(var i = 0; i < children.length; i++){
        if(children[i].getElementsByClassName("spam-helper-site-hider").length) break;
        var match = children[i].className.match(/(realtime-[-a-z]+)-\d+/);
        if(!match) break;
        var site_class = match[1];
        var hider = document.createElement("img");
        hider.src = "https://raw.github.com/honnza/se-spam-helper/master/no-flag.png";
        hider.title = "I'm out of spam flags for today here";
        hider.onclick = function(site_class){
          daily_css.textContent += "." + site_class + " {display: none}\n";
        }.bind(null, site_class);
        hider.className = "spam-helper-site-hider";
        hider.style.cursor = "pointer";

        children[i].getElementsByClassName("hot-question-site-icon")[0].appendChild(hider);
        children[i].classList.add(site_class);
      }
    }, 0);

    seen_today[classname] = true;

    if(!seen_twice[classname]){
      if(seen[classname]){
        css.textContent += "." + classname +
          " {height: 1em; overflow: hidden; padding-top: 0; padding-bottom: 0}\n";
        seen_twice[classname] = true;
      }else{
        //if(/[^a-z0-9\s]{6}/i.test(title)){
        //  css.textContent += "." + classname + " {background-color: #FCC}\n";
        //}else if(/live stream/i.test(title)){
        //  css.textContent += "." + classname + " {background-color: #FEE}\n";
        //}

        if(/\bvs\b/i.test(title) && /\blive\b/.test(title)){
          css.textContent += "." + classname + " {background-color: #FCC}\n";
        }
        seen[classname] = true;
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
})()