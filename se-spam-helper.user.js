// ==UserScript==
// @name          Stack Exchange spam helper
// @description   filter for the stack exchange real time question viewer,
// @description   aiding in identification and removal of network-wide obvious spam
// @include       http://stackexchange.com/questions?tab=realtime
// @version       2.3
// ==/UserScript==

/* global Notification, GM_xmlhttpRequest */
/* jshint loopfunc:true, jquery:true */

(function(){
  var is = {
    mostlyUppercase : function(str){
      return (str.match(/[A-Z]/g)||[]).length > (str.match(/[a-z]/g)||[]).length;
    }   
  };
  var QUEUE_TIMEOUT = 12 * 60 * 60 * 1000;
  var WEBSOCKET_TIMEOUT = 6 * 60 * 1000;

  var ws, wsRefreshTimeout;
  (function wsRefresh(){
    wsRefreshTimeout = setTimeout(wsRefresh, 30000);
    ws = new WebSocket("ws://sockets.ny.stackexchange.com");
    ws.onmessage = function(){
      clearTimeout(wsRefreshTimeout);
      wsRefreshTimeout = setTimeout(wsRefresh, WEBSOCKET_TIMEOUT);
      onMessage.apply(this, arguments);
    };
    ws.onerror = function(){
      console.log.apply(console, ["console.error"].concat(arguments));
      $("#mainArea").load(location.href + " #mainArea", scrapePage);
    };
    ws.onopen = function(){ws.send("155-questions-active");};
  })();

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
  var questionQueue = {};

  var onQuestionQueueTimeout = flushQuestionQueue;
  var checkAnswer = checkPost, checkQuestion = checkPost;

  menu_init();
  notification_init();
  window.addEventListener("unload", onbeforeunload);
  scrapePage();
  
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
  
  function scrapePage(){
    $(".realtime-question:visible").each(function(){
      var qLink = this.querySelector("a.realtime-question-url");
      onQuestionActive({
        apiSiteParameter: hostNameToSiteName(qLink.hostname),
        id: qLink.href.match(/\/questions\/(\d+)\//)[1],
        titleEncodedFancy: $("h2", this).html().trim(),
        bodySummary: $("p.realtime-body-summary",this).html().trim().replace(/\.{3}$/,""),
        url: qLink.href
      });
    });
  }
  
  function onQuestionActive(data){
    var site = data.apiSiteParameter;
    var id = data.id;
    var queue = questionQueue[site] = questionQueue[site] || {site:site, questions:{}, length:0};
    if(!queue.questions[id]) queue.length++;
    queue.questions[id] = data;
    if(queue.length >= 100){
      flushQuestionQueue(queue);
    }else{
      if(!queue.timeout){
        queue.timeout = setTimeout(onQuestionQueueTimeout.bind(null, queue), QUEUE_TIMEOUT);
      }
    }
    checkQuestion(data);
    hiderInstall();
  }
  
  function flushQuestionQueue(queue){
    var ids = Object.keys(queue.questions);
    var questions = queue.questions;
    queue.length = 0;
    queue.questions = {};
    clearTimeout(queue.timeout);
    queue.timeout = null;
    console.log("requesting answers for " + ids.length + " questions on " + queue.site);
    seApiCall("questions", ids.join(";"), "answers", {filter:"!Icp(Q.D5PTi18OQWD", site:queue.site})
    .then(function(answers){
      answers.forEach(function(answer){
        checkAnswer(questions[answer.question_id], answer);
      });
    });
  }
  
  function checkPost(question, answer){
    var title = htmlUnescape(question.titleEncodedFancy);
    var site = question.apiSiteParameter;
    var site_class = "realtime-" + siteToClass(site);
    var classname = site_class + "-" + question.id;
    var q_body = htmlUnescape(question.bodySummary);
    var a_body; if(answer) a_body = $("<div/>", {html: answer.body});
    var text = answer ? a_body.text() : title + "\n" + q_body;
    var id = answer ? answer.answer_id : question.id;  
    if(!notifiedOf[site]) notifiedOf[site] = {};
    if(!notifiedOf[site][id]){
      if(/\b(asshole|crap|damn|fag|fuck|idiot|shit|whore)s?\b/.test(text) ||
         is.mostlyUppercase(text) ||
         /\w+@(\w+\.)+\w{2,}/.test(text.replace(/\s/,'')) ||
         !answer && (
           /(?:[^a-z ] *){9,}/i.test(title) ||
           is.mostlyUppercase(title) ||
           /\b(vs?|l[ae]|live|watch|free|cheap|online|download|nike|training|dress|fashion|buy|here is|porn|packers|movers)\b/i.test(title)
        )
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
        body: body
      });
      notification.onclick = function(){
        open(url);
      };
    }
  }

  function menu_init(){
    menu = document.createElement("div");
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
    
    var wrapper = document.getElementsByClassName('topbar-wrapper')[0]; 
    var links = document.getElementsByClassName('topbar-links')[0];
    wrapper.insertBefore(menu, links);
	
    css.textContent +=
      "#spam-helper-menu      {display: inline-block; padding-top:7px}" +
      "#spam-helper-menu > span {display: block; width: 150px; color: white}" +
      "#spam-helper-menu > span > input { vertical-align: -2px; }";
  }

  function notification_init(){
    notification_granted = JSON.parse(localStorage.getItem("spam-helper-notification_granted")) || false;
    var cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = notification_granted;
    cb.id = "spamhelpernotificationcb";
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
    label.htmlFor = "spamhelpernotificationcb";
    
    var span = document.createElement("span");
    span.appendChild(cb);
    span.appendChild(label);
	
    menu.appendChild(span);
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
    var path = [].slice.call(arguments);
    var options = path.pop();
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
          url: "http://api.stackexchange.com/2.2/" + path.join('/') + "?" + $.param(options),
          ontimeout: getPage.bind(null, page),
          onerror: function(response) {
            console.log(response);
            getPage(page); // retry
          },
          onload: function(response) {
            response = JSON.parse(response.responseText);
            if(response.error_message) throw response.error_message;
            console.log("got response, remaining quota: " + response.quota_remaining);
            [].push.apply(results, response.items);
            if(response.has_more){
              console.log("need more pages");
              getPage(page + 1);
            }else{            
              console.log("collected " + results.length + " results");
              responseDeferred.resolve(results);
            }
            if(!response.quota_remaining){
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
        //change to `then` when SE upgrades to jQuery 1.8+
        mutex.lock = mutex.lock.pipe(func, func);
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
      "answers-onstartups":"onstartups",
      "pt-stackoverflow":"br",
    };
    site = exceptions[site] || site;
    site = site.replace(/^meta\-(.*)/, "$1meta");
    return "//cdn.sstatic.net/" + site + "/img/icon-48.png";
  }
  
  function hostNameToSiteName(host){
    return host.split(".")[0];
  }

  function htmlUnescape(html){
    return $("<div>").html(html).text();
  }
})();
