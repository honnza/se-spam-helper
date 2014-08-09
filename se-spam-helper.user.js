// ==UserScript==
// @name          Stack Exchange spam helper
// @description   filter for the stack exchange real time question viewer,
// @description   aiding in identification and removal of network-wide obvious spam
// @include       http://stackexchange.com/questions?tab=realtime
// @version       2.7
// ==/UserScript==

/* global unsafeWindow, GM_xmlhttpRequest */
/* jshint loopfunc:true, jquery:true */

(function(window){
  var $ = window.$;
  var Notification = window.Notification;
  var StackExchange = window.StackExchange;
  debugger;
  var is = {
    mostlyUppercase : function(str){
      return (str.match(/[A-Z]/g)||[]).length > (str.match(/[a-z]/g)||[]).length;
    }   
  };
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
  var siteWebsocketIDs = {};
  var sitesByWebsocketID = {};

  var onQuestionQueueTimeout = flushQuestionQueue;
  var checkAnswer = checkPost, checkQuestion = checkPost;

  menu_init();
  notification_init();
  window.addEventListener("unload", onbeforeunload);
  scrapePage();
  
  function onMessage(e){
    var response = JSON.parse(e.data);
    var data = response.data && JSON.parse(response.data);
    if(response.action === "hb"){
      ws.send("hb");
    } else if(response.action === "155-questions-active"){
        onQuestionActive(data);
    } else if(response.action.match(/\d+-questions-active/)){
        scrapePerSiteQuestion(data.body, data.siteid);
    } else {
        console.log("unknown response type: %s in %o", response.action, response);
    }
  }
  
  function scrapePage(){
    $(".realtime-question:visible").each(function(){
      var qLink = this.querySelector("a.realtime-question-url");
      onQuestionActive({
        apiSiteParameter: hostNameToSiteName(qLink.hostname),
        id: qLink.href.match(/\/questions\/(\d+)\//)[1],
        titleEncodedFancy: $("h2", this).html().trim(),
        bodySummary: undefined
      });
    });
    hiderInstall();
  }
  
  function scrapePerSiteQuestion(html, siteId){
    var question = new DOMParser().parseFromString(html, "text/html")
      .getElementsByClassName("question-summary")[0];
    var qLink = question.querySelector("a.question-hyperlink");
    onQuestionActive({
      apiSiteParameter: sitesByWebsocketID[siteId],
      id: question.id.split("-").pop(),
      titleEncodedFancy: $("h3 a", question).html().trim(),
      bodySummary: $(".excerpt", question).text().trim(),
      url: qLink.href
    });
  }
  
  function checkSiteHasSocket(site){
    if(siteWebsocketIDs[site] === undefined){
      siteWebsocketIDs[site] = false; // prevent double fetching
      console.log("unknown ID for %s", site);
      GM_xmlhttpRequest({
        method: "GET",
        url: "http://" + siteNameToHostName(site),
        ontimeout: checkSiteHasSocket.bind(null, site),
        onerror: function(response) {
          console.log(response);
          checkSiteHasSocket(site); // retry
        },
        onload: function(response){
          var scripts = (new DOMParser())
            .parseFromString(response.response, "text/html")
            .head.querySelectorAll("script:not([src])");
          [].forEach.call(scripts, function(script){
            var match = /StackExchange\.realtime\.subscribeToActiveQuestions\(["']?(\d+)/.exec(script.innerHTML);
            if(match){
              siteWebsocketIDs[site] = match[1];
              sitesByWebsocketID[match[1]] = site;
            }  
          });
          if(siteWebsocketIDs[site]){
            console.log("the ID for %s is %o", site, siteWebsocketIDs[site]);
            ws.send(siteWebsocketIDs[site] + "-questions-active");
          } else {
            console.log("could not find the ID for %s", site);
          }
        }
      });
    }
  }
  
  function onQuestionActive(data){
    var site = data.apiSiteParameter;
    checkQuestion(data);
    hiderInstall();
    checkSiteHasSocket(site);
    questionQueuePush(data);
  }
  
  function questionQueuePush(data){
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
    .then(function(response){      
      response.items.forEach(function(answer){
        checkAnswer(questions[answer.question_id], answer);
      });
      if(response.partial){
        var requeue = ids.slice(ids.indexOf(response.items.pop().question_id));
        console.log("requeueing %d questions", requeue.length);
        requeue.forEach(function(id){
          questionQueuePush(questions[id]);
        });
      }
    });
  }
  
  function checkPost(question, answer){
    var title = htmlUnescape(question.titleEncodedFancy);
    var site = question.apiSiteParameter;
    var host = siteNameToHostName(site);
    var site_class = "realtime-" + siteToClass(site);
    var classname = site_class + "-" + question.id;
    var q_body = question.bodySummary ? htmlUnescape(question.bodySummary) : "";
    var a_body; if(answer) a_body = $("<div/>", {html: answer.body});
    var text = answer ? a_body.text() : title + "\n" + q_body;
    var id = answer ? answer.answer_id : question.id;  
    if(!notifiedOf[site]) notifiedOf[site] = {};
    if(!notifiedOf[site][id]){
      if(/\b(ass(hole)?|bitch|crap|damn|fag|fuck|idiot|motherfucker|nigga|shit(hole)?|whore)e?s?\b/.test(text) ||
         is.mostlyUppercase(text) ||
         /\w+@(\w+\.)+\w{2,}/.test(text.replace(/\s/,'')) ||
         !answer && (
           site == "meta" || site == "drupal" ||
           /(?:[^a-hj-np-z ] *){9,}/i.test(title) ||
           is.mostlyUppercase(title) ||
           /\b(vs?|l[ae]|live|watch|free|cheap|online|best|nike|buy|here is|porn|packers|movers|slim|concord|black magic|vashikaran|baba(ji)?|\d+s|kgl)\b/i.test(title)
        )
      ){
        css.textContent += "." + classname + " {background-color: #FCC}\n";
        notify(site, title, (answer ? "A - " : "Q - ") + (answer ? a_body.text() : q_body),
               ["http:/", host, (answer ? "a" : "q"), id].join("/"));
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
  function seApiCall(/* path..., options */){
    var path = [].slice.call(arguments);
    var options = path.pop();
    var partialOk = options.partialOk;
    delete options.partialOk;
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
            if(response.has_more && !partialOk){
              console.log("need more pages");
              getPage(page + 1);
            }else{            
              console.log("collected " + results.length + " results");
              responseDeferred.resolve({items: results, partial: !!response.has_more});
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
      "meta": "stackexchangemeta",
      "pt-stackoverflow":"br",
    };
    site = exceptions[site] || site;
    site = site.replace(/^meta\-(.*)/, "$1meta"); //TODO: is this outdated?
    return "//cdn.sstatic.net/" + site + "/img/icon-48.png";
  }
  
  function hostNameToSiteName(host){
    var match;
    if((match = host.match(/(\w+)\.stackexchange\.com/))) return match[1];
    if((match = host.match(/(\w+)\.com/))) return match[1];
    return host;
  }
  
  function siteNameToHostName(site){
    var SLDSites = ["askubuntu", "stackapps", "superuser", "serverfault", "stackoverflow", "pt.stackoverflow"];
    if(SLDSites.indexOf(site) !== -1) return site + ".com";
    else if(site.indexOf(".") !== -1) return site;
    else return site + ".stackexchange.com";
  }

  function htmlUnescape(html){
    return $("<div>").html(html).text();
  }
})(unsafeWindow || window);
