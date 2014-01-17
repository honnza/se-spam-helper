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
    ws.onerror = console.log.bind(console, "websocket error: ");
    ws.onopen = function(){ws.send("155-questions-active")};
    wsRefreshTimeout = setTimeout(wsRefresh, 60000);
  })();

//

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

//

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
})()