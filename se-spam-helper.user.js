// ==UserScript==
// @name          Stack Exchange spam helper
// @description   filter for the stack exchange real time question viewer,
// @description   aiding in identification and removal of network-wide obvious spam
// @include       http://stackexchange.com/questions?tab=realtime
// @version       2.0
// ==/UserScript==

/* global Notification, GM_xmlhttpRequest */
/* jshint loopfunc:true, jquery:true */

(function(){
  if(/^1\.7/.test($.fn.jquery)) $.Deferred.prototype.then = $.Deferred.prototype.pipe;
  var is = {
    mostlyUppercase : function(str){
      return (str.match(/[A-Z]/g)||[]).length > (str.match(/[a-z]/g)||[]).length;
    }   
  };
  var QUEUE_TIMEOUT = 60 * 1000;

  var ws, wsRefreshTimeout;
  var wsRefresh =  location.reload.bind(location);
  ws = new WebSocket("ws://sockets.ny.stackexchange.com");
  ws.onmessage = function(){
    clearTimeout(wsRefreshTimeout);
    wsRefreshTimeout = setTimeout(wsRefresh, 60000);
    onMessage.apply(this, arguments);
  };
  ws.onerror = console.log.bind(console, "websocket error: ");
  ws.onopen = function(){ws.send("155-questions-active");};
  wsRefreshTimeout = setTimeout(wsRefresh, 60000);

  var css = document.createElement("style");
  document.head.appendChild(css);
  var daily_css = document.createElement("style");
  document.head.appendChild(daily_css);

  var ms_in_day = 1000 * 60 * 60 * 24;
  function msUntilMidnight(){return ms_in_day - Date.now() % ms_in_day;}
  (function reset_daily_css(){
    daily_css.textContent = "";
    setTimeout(reset_daily_css, msUntilMidnight);
    ooflagSites = {};
  })();
  var menu;
  var notification_granted;
  var imgPool = new ElementPool();
  
  var notifiedOf = {}, notifiedOfToday = {};
  var ooflagSites = {};

  menu_init();
  notification_init();
  window.addEventListener("unload", onbeforeunload);
  
  function onMessage(e){
    var response = JSON.parse(e.data);
    switch(response.action){
      case "hb":
        ws.send("hb");
        break;
      case "155-questions-active":
        onQuestionActive(JSON.parse(response.data));
        break;
      default:
        console.log("unknown response type: " + response.action + " in " + response);
    }
  }
  var questionQueue = {};
  function onQuestionActive(data){
    var site = data.apiSiteParameter;
    var id = data.id;
    var queue = questionQueue[site] = questionQueue[site] || {site:site, questions:{}};
    if(queue.timeout) clearTimeout(queue.timeout);
    if(!queue.questions[id]) queue.length++;
    queue.questions[id] = data;
    if(queue.length >= 100){
      flushQuestionQueue(queue);
    }else{
      queue.timeout = setTimeout(onQuestionQueueTimeout.bind(null, queue), QUEUE_TIMEOUT);
    }
    checkQuestion(data);
    hiderInstall();
  }
  
  var onQuestionQueueTimeout = flushQuestionQueue;
  function flushQuestionQueue(queue){
    queue.timeout = null;
    var ids = Object.keys(queue.questions).join("/");
    seApiCall("questions", ids, "answers", {filter:"!)dTxllc-oIEtawmy", site:queue.site})
    .then(function(answers){
      answers.forEach(function(answer){
        checkAnswer(queue.questions[answer.question_id], answer);
      });
    });
  }
  
  var checkAnswer = checkPost, checkQuestion = checkPost;
  function checkPost(question, answer){
    var title = htmlUnescape(question.titleEncodedFancy);
    var site = question.apiSiteParameter;
    var site_class = "realtime-" + siteToClass(question.apiSiteParameter);
    var classname = site_class + "-" + question.id;
    var q_body = htmlUnescape(question.bodySummary);
    var a_body = $("<div/>", {html: answer.body});
    var text = answer ? a_body.text() : title + "\n" + q_body;
    var id = answer ? answer.answer_id : question.id;  
    if(!notifiedOf[site]) notifiedOf[site] = {};
    if(!notifiedOf[site][id]){
      if(/\b(asshole|crap|damn|fag|fuck|idiot|shit|whore)s?\b/.test(text) ||
         /(?:[^a-z ] *){9,}/i.test(title) ||
         is.mostlyUppercase(text) ||
         !answer && (
          is.mostlyUppercase(title) ||
          /\b(vs?|l[ae]|live|watch|free|cheap|online|download|nike|training|dress|fashion|buy|here is|porn)\b/i.test(title)
        ) ||
         answer && a_body.is(":has(a)");
      ){
        css.textContent += "." + classname + " {background-color: #FCC}\n";
        notify(site, title, (answer ? "A - " : "Q - ") +
                            (answer ? a_body.text() : q_body), question.url);
      }
      notifiedOf[site][id] = true;
      if(!notifiedOfToday[site]) notifiedOfToday[site] = {};
      notifiedOfToday[site][id] = true;
    }
  }
  
  function hiderInstall(){
    var children = document.getElementById("mainArea").children;
    for(var i = 0; i < children.length; i++){
      if(children[i].getElementsByClassName("spam-helper-site-hider").length) break;
      var match = children[i].className.match(/(realtime-[-a-z]+)-\d+/);
      if(!match) break;
      var siteClass = match[1];
      var hider = imgPool.get(function(){
        var hider = document.createElement("img");
        hider.src = "https://raw.github.com/honnza/se-spam-helper/master/no-flag.png";
        hider.title = "I'm out of spam flags for today here";
        hider.className = "spam-helper-site-hider";
        hider.style.cursor = "pointer";
        return hider;
      });
      hider.onclick = function(siteClass){
        daily_css.textContent += "." + siteClass + " {display: none}\n";
        ooflagSites[siteClass] = true;
      }.bind(null, siteClass);

      children[i].getElementsByClassName("hot-question-site-icon")[0].appendChild(hider);
      children[i].classList.add(siteClass);
    }
  }
  
  function notify(site, title, body, url){
    if(!ooflagSites[site]){
      var notification = new Notification(title, {
        icon: classToImageUrl(siteToClass(site)),
        body: title + "\n" + body
      });
      notification.onclick = function(){
        open(url);
      };
    }
  }

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
    cb.type = "checkbox";
    cb.checked = notification_granted;
    cb.onchange = function(){
      if(cb.checked){
        Notification.requestPermission(function(permission){
          notification_granted = (permission === "granted");
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
        var r;
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
    };
  }
  
  var apiQueue = new Mutex();
  function seApiCall(){
    var options = [].pop.call(arguments);
    var responseDeferred = $.Deferred();
    var results = []; 
    (function getPage(page){ 
      apiQueue.enqueue(function(){
        var apiQueueDeferred = $.Deferred();
        options.pagesize = 100;
        options.page = page;
        console.log("fired request");
        GM_xmlhttpRequest({
          method: "GET",
          url: "http://api.stackexchange.com/2.2/" + arguments.join('/') + "?" + $.param(options),
          onload: function(response) {
            console.log("got response, remaining quota: " + response.quota);
            response = JSON.parse(response);
            [].push.apply(results, response.items);
            if(response.hasMore){
              console.log("need more pages");
              getPage(page + 1);
            }else{            
              responseDeferred.resolve(results);
            }
            if(!response.quota){
              alert ("I'm out of API quota!");
              setTimeout(function(){apiQueueDeferred.resolve();}, msUntilMidnight());
            }else if(response.backoff){
              console.log("got backoff! " + response.backoff);
              setTimeout(function(){apiQueueDeferred.resolve();}, response.backoff * 1000);
            }else{
              apiQueueDeferred.resolve();
            }
          }
        });
        return apiQueueDeferred.promise();
      });
    })(1);
    return responseDeferred.promise();
  }
  
  function Mutex(){
    var mutex = {
      lock: $.Deferred().resolve(),
      enqueue: function(func){
        mutex.lock = mutex.lock.then(func, func);
      }                
    };
    return mutex;
  }
  
    function siteToClass(site){
    var exceptions = {
      "mathoverflow.net":"mathoverflow"
    };
    return exceptions[site] || site.replace(/\./, '-');
  }
  function classToImageUrl(site){
    var exceptions = {
      "answers-onstartups":"onstartups"
    };
    site = exceptions[site] || site;
    site = site.replace(/^meta\-(.*)/, "$1meta");
    return "//cdn.sstatic.net/" + site + "/img/icon-48.png";
  }

  function htmlUnescape(html){
    return $("<div>").html(html).text();
  }
})();