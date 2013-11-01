// ==UserScript==
// @name          Stack Exchange spam helper
// @description   filter for the stack exchange real time question viewer,
// @description   aiding in identification and removal of network-wide obvious spam
// @include       http://stackexchange.com/questions?tab=realtime
// @version       1.7.5
// ==/UserScript==

(function(){
  var is = {
    mostlyUppercase : function(str){
      return (str.match(/[A-Z]/g)||[]).length > (str.match(/[a-z]/g)||[]).length;
    }
  }

  localStorage.removeItem("spam-helper-seen_twice");
 
  var ws, wsRefreshTimeout, wsTimeoutSet = Date.now();
  (function wsRefresh(){
    if(ws) ws.close(); // just in case
    ws = new WebSocket("ws://sockets.ny.stackexchange.com");
    ws.onmessage = function(){
      clearTimeout(wsRefreshTimeout);
      wsRefreshTimeout = setTimeout(wsRefresh, 60000);
      wsTimeoutSet = Date.now();
      onmessage.apply(this, arguments);
    }
    ws.onerror = console.log.bind("websocket error");
    ws.onopen = function(){ws.send("155-questions-active")};
    wsRefreshTimeout = setTimeout(wsRefresh, 60000);
  })();

  var css = document.createElement("style");
  document.head.appendChild(css);
  var daily_css = document.createElement("style");
  document.head.appendChild(daily_css);

  (function reset_daily_css(){
    var ms_in_day = 1000 * 60 * 60 * 24;
    daily_css.textContent = "";
    setTimeout(reset_daily_css, ms_in_day - Date.now() % ms_in_day);
    ooflag_sites = {};
  })();
  var seen = {};
  var seen_ary = JSON.parse(localStorage.getItem("spam-helper-seen"))||[];
  seen_ary.forEach(function(x){seen[x] = true});
  seen_ary = JSON.parse(localStorage.getItem("spam-helper-seen_twice"))||[]; //upgrade from v1.2
  seen_ary.forEach(function(x){seen[x] = true});
  var hidden_today = {};
  var ooflag_sites = {};
  var seen_today = {};
  var menu;
  var notification_granted;
  var imgPool = new ElementPool();

  menu_init();
  notification_init();
  window.addEventListener("unload", onbeforeunload);

  function onmessage(e){
    var response = JSON.parse(JSON.parse(e.data).data);
    var title = htmlUnescape(response.titleEncodedFancy);
    var site = getSiteFromApiParam(response.apiSiteParameter).replace(/\./,"-");
    var body = htmlUnescape(response.bodySummary);
    var text = title + " " + body;
    var id = response.id;
    var site_class = "realtime-" + site;
    var classname = site_class + "-" + id;
    
    setTimeout(function(){
      var children = document.getElementById("mainArea").children;
      for(var i = 0; i < children.length; i++){
        if(children[i].getElementsByClassName("spam-helper-site-hider").length) break;
        var match = children[i].className.match(/(realtime-[-a-z]+)-\d+/);
        if(!match) break;
        var site_class = match[1];
        var hider = imgPool.get(function(){
          var hider = document.createElement("img");
          hider.src = "https://raw.github.com/honnza/se-spam-helper/master/no-flag.png";
          hider.title = "I'm out of spam flags for today here";
          hider.className = "spam-helper-site-hider";
          hider.style.cursor = "pointer";
          return hider;
        });
        hider.onclick = function(site_class){
          daily_css.textContent += "." + site_class + " {display: none}\n";
          ooflag_sites[site_class] = true;
        }.bind(null, site_class);

        children[i].getElementsByClassName("hot-question-site-icon")[0].appendChild(hider);
        children[i].classList.add(site_class);
      }
    }, 0);

    seen_today[classname] = true;

    if(!hidden_today[classname]){
      if(seen[classname]){
        css.textContent += "." + classname +
          " {height: 1em; overflow: hidden; padding-top: 0; padding-bottom: 0}\n";
        hidden_today[classname] = true;
      }else{
        if(/\b(asshole|crap|damn|fag|fuck|shit|whore)s?\b/.test(text)){
          css.textContent += "." + classname + " {background-color: #FBB}\n";
          notify("Potentially offensive message detected");
        }else if(/(?:[^a-z ] *){9,}/i.test(title)
          || is.mostlyUppercase(title)
          || /\b(vs?|live|watch|free|online|download|nike|training|dress|fashion|buy|here is|porn)\b/i.test(title)
        ){
          css.textContent += "." + classname + " {background-color: #FCC}\n";
          notify("Highly suspicious message detected");
        }
        seen[classname] = true;
      }
    }

    function notify(message){
      if(!ooflag_sites[site_class]){
        var notification = new Notification(message, {
          icon: getImageUrl(site),
          body: title + "\n" + body
        })
        notification.onclick = function(){
          open(response.url);
        };
      }
    };
  };

  function menu_init(){
    menu = document.createElement("ul");
    menu.id = "spam-helper-menu";

    var a = document.createElement("a");
    a.href = "#";
    a.id = "spam-helper-menu-a";
    a.textContent = "spam helper";
    a.onclick = function(){
      if(menu.parentElement){
        document.body.removeChild(menu);
      }else{
        document.body.appendChild(menu);
        menu.style.top = a.offsetTop + 2 * a.offsetHeight + "px";
        menu.style.left = a.offsetLeft + "px";
      }
    };

    var top_li = document.createElement("li");
 
    top_li.appendChild(a);

    var top_ul = document.getElementById("top").firstElementChild;
    top_ul.insertBefore(top_li, top_ul.firstChild);

    css.textContent +=
      "#spam-helper-menu      {display: block; position: absolute}" +
      "#spam-helper-menu > li {display: block; width: 150px; color: white; " +
      "   background:rgba(0, 0, 0, 0) url('//cdn.sstatic.net/stackexchange/img/bg-hatchlines.png') " +
      "   repeat-x top left;}";
  }

  function notification_init(){
    notification_granted = JSON.parse(localStorage.getItem("spam-helper-notification_granted")) || false;
    var cb = document.createElement("input");
    cb.type = "checkbox"
    cb.checked = notification_granted;
    cb.onchange = function(){
      if(cb.checked){
        Notification.requestPermission(function(permission){
          notification_granted = (permission == "granted");
          localStorage.setItem("spam-helper-notification_granted", notification_granted);
        });
      }else{
        notification_granted = false;
        localStorage.setItem("spam-helper-notification_granted", false);
      }
    };

    var label = document.createElement("label");
    label.textContent = "enable notifications";
    label.insertBefore(cb, label.firstChild);
    
    var li = document.createElement("li");
    li.appendChild(label);

    menu.appendChild(li);
  }

  function onbeforeunload(){
    console.log('unloading');
    localStorage.removeItem("spam-helper-seen_twice"); //upgrade from v1.2
    try{
      var seen_ary = Object.keys(seen);
      var seen_twice_ary = Object.keys(seen_twice);
      localStorage.setItem("spam-helper-seen", JSON.stringify(seen_ary));
    }catch(ex){
      console.log('unloading failed');
      seen_ary = seen_ary.filter(function(x){return seen_today[x]});
      localStorage.setItem("spam-helper-seen", JSON.stringify(seen_ary));
      console.log('pruned data');
    }
  };

  function ElementPool(){
    var queue = [];
    return {
      constructor: ElementPool,
      get: function(func){
        var r
        for(var i = 0; i < queue.length; i++){
          if(!document.contains(queue[i])){
            r = queue.splice(i,1)[0];
            break;
          }
        }
        r = r || func();
        queue.push(r);
        return r;
      }
    }
  }

  function getSiteFromApiParam(site){
    var exceptions = {
      "mathoverflow.net":"mathoverflow"
    }
    return exceptions[site] || site;
  }
  function getImageUrl(site){
    var exceptions = {
      "answers-onstartups":"onstartups"
    }
    site = exceptions[site] || site;
    site = site.replace(/^meta\-(.*)/, "$1meta");
    return "//cdn.sstatic.net/" + site + "/img/icon-48.png";
  }

  function htmlUnescape(html){
    return $("<div>").html(html).text();
  }
})()
