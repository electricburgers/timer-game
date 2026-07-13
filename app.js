"use strict";

/* ---------- constants (seconds) ---------- */
var BLUE_AT   = 900;    // 15:00 -> blue
var GREEN_AT  = 1200;   // 20:00 -> green / on-pace floor
var YELLOW_AT = 1800;   // 30:00 -> yellow / on-pace ceiling
var PACE_LOW  = 1200;   // under 20:00 = Too Fast
var PACE_HIGH = 1800;   // over 30:00 = Too Slow
var TOTAL_ROUNDS = 4;
var LS_KEY = "triviaHostTimer.v1";
var SET_KEY = "triviaHostTimer.settings.v1";

/* ---------- persisted state ----------
   Two independent clocks share one run/pause state:
     • round  -> resets to 0 on Stop & Log
     • game   -> the session clock; keeps running across logs            */
var state = {
  displayedRound: 1,
  roundLog: [],          // {round, sec, pace, notes}
  timerState: "idle",    // idle | running | paused  (drives BOTH clocks)
  roundAccumMs: 0,
  roundAnchor: 0,        // epoch ms when round clock last set running
  gameAccumMs: 0,
  gameAnchor: 0,         // epoch ms when game clock last set running
  gameComplete: false
};
var showSummary = false;

/* ---------- settings (persisted separately) ---------- */
var settings = { light:false, fs:1, colorblind:false };

/* ---------- transient (not persisted) ---------- */
var qDurationSec = 180;
var qEndEpoch = 0;
var qRemainMs = 0;       // when paused: ms remaining (negative once overflowing)
var qState = "idle";     // idle | running | paused

var bDurationSec = 600;
var bEndEpoch = 0;
var bState = "idle";     // idle | running

/* ---------- element refs ---------- */
function $(id){ return document.getElementById(id); }
var el = {
  gameTime:$("gameTime"),
  summaryBtn:$("summaryBtn"), clearBtn:$("clearBtn"),
  timers:$("timers"), summary:$("summary"),
  roundTime:$("roundTime"), runBtn:$("runBtn"), stopBtn:$("stopBtn"),
  resetBtn:$("resetBtn"),
  zoneBreak:$("zoneBreak"),
  qTime:$("qTime"), qToggle:$("qToggle"), qMin:$("qMin"),
  qStart:$("qStart"), qReset:$("qReset"),
  bTime:$("bTime"), bMin:$("bMin"), bStart:$("bStart"), bReset:$("bReset"),
  log:$("log"),
  // settings
  gear:$("gear"), settingsBack:$("settingsBack"), settingsClose:$("settingsClose"),
  themeToggle:$("themeToggle"), themeSub:$("themeSub"),
  cbToggle:$("cbToggle"), cbSub:$("cbSub"),
  fsRange:$("fsRange"), fsVal:$("fsVal"), fsReset:$("fsReset"),
  // round detail (compact log column, phone widths)
  roundBack:$("roundBack"), roundClose:$("roundClose"),
  roundModalTitle:$("roundModalTitle"), roundModalTime:$("roundModalTime"),
  roundModalBadge:$("roundModalBadge"), roundModalNotes:$("roundModalNotes")
};

// Matches the CSS max-width:600px breakpoint that hides the inline notes
// field in #colLog — only open the tap-to-edit modal when that's in effect,
// so wide screens keep editing notes inline exactly as before.
var COMPACT_LOG_MQ = window.matchMedia("(max-width:600px)");

/* ---------- helpers ---------- */
function fmt(totalSec){
  totalSec = Math.max(0, Math.floor(totalSec));
  var m = Math.floor(totalSec/60), s = totalSec%60;
  return (m<10?"0":"")+m+":"+(s<10?"0":"")+s;
}
function elapsedRoundMs(){
  return state.roundAccumMs +
    (state.timerState==="running" ? (Date.now()-state.roundAnchor) : 0);
}
function elapsedGameMs(){
  return state.gameAccumMs +
    (state.timerState==="running" ? (Date.now()-state.gameAnchor) : 0);
}
function roundColorClass(sec){
  if(sec>=YELLOW_AT) return "t-yellow";
  if(sec>=GREEN_AT)  return "t-green";
  if(sec>=BLUE_AT)   return "t-blue";
  return "";
}
function paceFor(sec){
  if(sec < PACE_LOW)  return "fast";
  if(sec > PACE_HIGH) return "slow";
  return "on";
}
// Glyphs are shape-coded, not just color-coded (checkmark / down / up
// triangle), so pace reads correctly even without color vision.
var BADGE = {
  on:  {t:"On Pace",  c:"b-on",  e:"\u2713"},   // check
  fast:{t:"Too Fast", c:"b-fast",e:"\u25BC"},   // down triangle (short)
  slow:{t:"Too Slow", c:"b-slow",e:"\u25B2"}    // up triangle (long)
};
function totalLoggedSec(){
  var t=0; for(var i=0;i<state.roundLog.length;i++) t+=state.roundLog[i].sec; return t;
}
function escapeHtml(s){
  return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;")
    .replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

/* ---------- persistence ---------- */
function save(){
  try{ localStorage.setItem(LS_KEY, JSON.stringify(state)); }catch(e){}
}
function load(){
  try{
    var raw = localStorage.getItem(LS_KEY);
    if(!raw) return;
    var s = JSON.parse(raw);
    if(s && typeof s==="object"){
      state.displayedRound = s.displayedRound || 1;
      state.roundLog = Array.isArray(s.roundLog) ? s.roundLog : [];
      // accept old "roundState" key for backward compatibility
      state.timerState = s.timerState || s.roundState || "idle";
      state.roundAccumMs = s.roundAccumMs || 0;
      state.roundAnchor = s.roundAnchor || 0;
      state.gameAccumMs = s.gameAccumMs || 0;
      state.gameAnchor = s.gameAnchor || 0;
      state.gameComplete = !!s.gameComplete;
      // A timer running at save time keeps ticking via its epoch anchors.
      if(state.timerState==="running" && (!state.roundAnchor || !state.gameAnchor)){
        state.timerState="paused";
      }
    }
  }catch(e){}
}

/* ============ SETTINGS ============ */
function applyTheme(light){
  document.body.classList.toggle("light", !!light);
  el.themeToggle.checked = !!light;
  el.themeSub.textContent = light ? "Light mode" : "Dark mode";
}
function applyColorblind(cb){
  document.body.classList.toggle("cb", !!cb);
  el.cbToggle.checked = !!cb;
  el.cbSub.textContent = cb ? "On" : "Off";
}
function applyFs(fs){
  fs = Math.min(1.4, Math.max(0.8, fs || 1));
  document.documentElement.style.setProperty("--fs", String(fs));
  el.fsRange.value = String(fs);
  el.fsVal.textContent = Math.round(fs*100) + "%";
  return fs;
}
function saveSettings(){
  try{ localStorage.setItem(SET_KEY, JSON.stringify(settings)); }catch(e){}
}
function loadSettings(){
  try{
    var raw = localStorage.getItem(SET_KEY);
    if(raw){
      var s = JSON.parse(raw);
      if(s && typeof s==="object"){
        settings.light = !!s.light;
        settings.fs = (typeof s.fs==="number") ? s.fs : 1;
        settings.colorblind = !!s.colorblind;
      }
    }
  }catch(e){}
  applyTheme(settings.light);
  applyColorblind(settings.colorblind);
  settings.fs = applyFs(settings.fs);
}
function openSettings(){ el.settingsBack.classList.add("open"); }
function closeSettings(){ el.settingsBack.classList.remove("open"); }

/* ============ ROUND DETAIL (compact log column) ============
   The phone-width log column hides round #/time/badge details down to a
   single glyph and drops the inline notes field entirely — tapping a row
   opens this modal instead so notes stay editable at any width. */
var roundDetailIndex = -1;
function openRoundDetail(i){
  var e = state.roundLog[i];
  if(!e) return;
  roundDetailIndex = i;
  var b = BADGE[e.pace];
  el.roundModalTitle.textContent = "Round " + e.round;
  el.roundModalTime.textContent = fmt(e.sec);
  el.roundModalBadge.className = "badge " + b.c;
  el.roundModalBadge.textContent = b.e + " " + b.t;
  el.roundModalNotes.value = e.notes;
  el.roundBack.classList.add("open");
  el.roundModalNotes.focus();
}
function closeRoundDetail(){
  el.roundBack.classList.remove("open");
  roundDetailIndex = -1;
}

/* ============ ROUND + SESSION TIMERS ============
   One run/pause control drives both clocks together.                    */
function toggleRun(){
  var now = Date.now();
  if(state.timerState==="running"){            // running -> pause both
    state.roundAccumMs += now - state.roundAnchor;
    state.gameAccumMs  += now - state.gameAnchor;
    state.timerState="paused";
  } else {                                      // idle/paused -> run both
    state.roundAnchor = now;
    state.gameAnchor  = now;
    state.timerState="running";
  }
  save(); renderStructure();
}
// Stop & Log: record the current round, reset ONLY the round clock.
// The session (game) clock is never touched here — it keeps running.
function stopLog(){
  var ms = elapsedRoundMs();
  if(ms < 1000) return; // nothing meaningful to log
  var sec = Math.round(ms/1000);
  state.roundLog.push({
    round: state.displayedRound,
    sec: sec,
    pace: paceFor(sec),
    notes: ""
  });
  // reset the round clock only; if we're running, it restarts ticking now
  state.roundAccumMs = 0;
  state.roundAnchor = (state.timerState==="running") ? Date.now() : 0;
  resetQuestion(); resetBreak();
  if(state.roundLog.length >= TOTAL_ROUNDS){
    state.gameComplete=true;
    showSummary=true;
  } else {
    state.displayedRound = Math.min(TOTAL_ROUNDS, state.displayedRound+1);
  }
  save(); renderStructure();
}
// Reset: scrap the current round's time and start it over at 00:00.
// The session clock keeps going (the time really did elapse).
function resetRound(){
  state.roundAccumMs = 0;
  state.roundAnchor = (state.timerState==="running") ? Date.now() : 0;
  save(); renderStructure();
}

/* ============ QUESTION COUNTDOWN ============ */
/* States the display can be in:
     "normal" -> plain number, no background
     "warn"   -> 1:00 or less remaining: solid number, pulsing YELLOW background
     "over"   -> time's up & overflowing into negative: solid number, pulsing RED background */
function setQClass(phase){
  el.qTime.className = "midtime qtime" +
    (phase==="warn" ? " warn" :
     phase==="over" ? " over" : "");
}
// reflect running/paused state on the question Start + Reset buttons
function renderQuestionControls(){
  el.qStart.textContent =
    qState==="running" ? "Pause" :
    qState==="paused"  ? "Resume" : "Start";
  el.qStart.classList.toggle("primary",   qState !== "running");
  el.qStart.classList.toggle("btn-pause", qState === "running");

  var active = qState !== "idle";
  el.qReset.disabled = !active;
  el.qReset.classList.toggle("btn-reset-active", active);
}
function toggleQuestion(){
  if(qState==="idle"){
    qEndEpoch = Date.now() + qDurationSec*1000;
    qState="running";
  } else if(qState==="paused"){
    qEndEpoch = Date.now() + qRemainMs;
    qState="running";
  } else { // running -> pause
    qRemainMs = qEndEpoch - Date.now();
    qState="paused";
  }
  renderQuestionControls();
}
function resetQuestion(){
  qState="idle"; qEndEpoch=0; qRemainMs=0;
  setQClass("normal");
  el.qTime.textContent = fmt(qDurationSec);
  renderQuestionControls();
}
function setQDuration(sec){
  sec = Math.min(300, Math.max(60, sec));
  qDurationSec = sec;
  el.qMin.value = Math.round(sec/60);
  el.qToggle.textContent = (sec===180) ? "5:00" : "3:00"; // toggles to the other preset
  resetQuestion();
}
function toggleQuestionPreset(){
  setQDuration(qDurationSec===180 ? 300 : 180);
}

/* ============ BREAK TIMER ============ */
function startBreak(){
  if(bState==="running") return;
  bEndEpoch = Date.now() + bDurationSec*1000;
  bState="running";
}
function resetBreak(){
  bState="idle"; bEndEpoch=0;
  el.bTime.textContent = fmt(bDurationSec);
}
function setBreakDuration(min){
  min = Math.min(60, Math.max(1, min));
  bDurationSec = min*60;
  el.bMin.value = min;
  resetBreak();
}

/* ============ CLEAR SESSION ============ */
function clearSession(){
  if(!confirm("Clear all rounds and start a new game night?")) return;
  state = {
    displayedRound:1, roundLog:[],
    timerState:"idle", roundAccumMs:0, roundAnchor:0,
    gameAccumMs:0, gameAnchor:0, gameComplete:false
  };
  showSummary=false;
  resetQuestion(); resetBreak();
  try{ localStorage.removeItem(LS_KEY); }catch(e){}
  renderStructure();
}

/* ============ RENDER ============ */
// renderStructure(): visibility, labels, log, summary — on events only.
function renderStructure(){
  var summaryView = state.gameComplete || showSummary;

  el.timers.style.display = summaryView ? "none" : "";
  el.summary.style.display = summaryView ? "block" : "none";
  el.summaryBtn.textContent = (showSummary && !state.gameComplete) ? "Back to Timers" : "Summary";

  // run button label + color reflects state (drives both clocks)
  el.runBtn.textContent =
    state.timerState==="running" ? "Pause" :
    state.timerState==="paused"  ? "Resume" : "Start";
  el.runBtn.classList.toggle("primary",   state.timerState !== "running");
  el.runBtn.classList.toggle("btn-pause", state.timerState === "running");

  // stop/reset only meaningful with elapsed round time
  var hasTime = elapsedRoundMs() >= 1000;
  el.stopBtn.disabled = !hasTime;
  // reset is disabled at initial 00:00, red when there's time to clear
  el.resetBtn.disabled = !hasTime;
  el.resetBtn.classList.toggle("btn-reset-active", hasTime);

  if(summaryView) buildSummary(); else buildLog();
}

function buildLog(){
  var L = state.roundLog;
  if(L.length===0){
    el.log.innerHTML = '<div class="empty">No rounds logged yet.</div>';
    return;
  }
  var html="";
  for(var i=0;i<L.length;i++){
    var e=L[i], b=BADGE[e.pace];
    // .badgeText is hidden in the compact (phone-width) log column via
    // CSS \u2014 the glyph alone still carries the pace at that size.
    html +=
      '<div class="logitem" data-i="'+i+'">'+
        '<div class="logline">'+
          '<span class="rt">'+
            '<span class="r">R'+e.round+'</span>'+
            '<span class="tm">'+fmt(e.sec)+'</span>'+
          '</span>'+
          '<span class="badge '+b.c+'">'+b.e+'<span class="badgeText"> '+b.t+'</span></span>'+
        '</div>'+
        '<input type="text" data-i="'+i+'" placeholder="notes (e.g. beer round)\u2026" '+
          'value="'+escapeHtml(e.notes)+'">'+
      '</div>';
  }
  el.log.innerHTML = html;
}

function buildSummary(){
  var L = state.roundLog;
  var n = L.length;
  var total = totalLoggedSec();
  var onPace = 0;
  for(var i=0;i<n;i++) if(L[i].pace==="on") onPace++;
  var avg = n ? Math.round(total/n) : 0;

  var verdict;
  if(n===0) verdict="No rounds logged yet.";
  else if(onPace===n) verdict="All "+n+" rounds on pace \u2014 great night!";
  else if(onPace>=n-1) verdict=onPace+" of "+n+" rounds on pace \u2014 good night.";
  else if(onPace>=Math.ceil(n/2)) verdict=onPace+" of "+n+" rounds on pace \u2014 decent night.";
  else verdict=onPace+" of "+n+" rounds on pace \u2014 watch your pacing.";

  var rows="";
  for(i=0;i<n;i++){
    var e=L[i], b=BADGE[e.pace];
    rows +=
      '<div class="sumrow">'+
        '<span class="r">R'+e.round+'</span>'+
        '<span class="tm">'+fmt(e.sec)+'</span>'+
        '<span class="badge '+b.c+'">'+b.e+'<span class="badgeText"> '+b.t+'</span></span>'+
      '</div>';
  }

  var foot = state.gameComplete
    ? '<button class="danger" id="newGameBtn" style="width:100%;margin-top:12px;">Start New Game</button>'
    : '<button id="backBtn" style="width:100%;margin-top:12px;">Back to Timers</button>'+
      '<div class="sumnote">Game in progress \u2014 summary so far.</div>';

  el.summary.innerHTML =
    '<div class="sumhead">'+(state.gameComplete?"Game Complete":"Session Summary")+'</div>'+
    '<div class="sumtotal">'+fmt(total)+'<small>Total Game Time</small></div>'+
    (n? rows : '<div class="empty">No rounds logged yet.</div>')+
    (n? '<div class="sumavg"><span>Average round</span><b>'+fmt(avg)+'</b></div>' : '')+
    '<div class="verdict">'+verdict+'</div>'+
    foot;

  var ng=$("newGameBtn"); if(ng) ng.onclick=clearSession;
  var bk=$("backBtn"); if(bk) bk.onclick=function(){ showSummary=false; renderStructure(); };
}

// tick(): lightweight numeric refresh, runs continuously.
function tick(){
  var rSec = elapsedRoundMs()/1000;
  el.roundTime.textContent = fmt(rSec);
  // keep the .sess sizing/colour classes off the round timer; pace colour only
  el.roundTime.className = "bigtime " + roundColorClass(rSec);
  // session clock: keeps running across logs
  el.gameTime.textContent = fmt(elapsedGameMs()/1000);

  // toggle stop/reset enabled as time crosses 1s (cheap)
  var hasTime = rSec >= 1;
  if(el.stopBtn.disabled === hasTime) el.stopBtn.disabled = !hasTime;
  if(el.resetBtn.disabled === hasTime){
    el.resetBtn.disabled = !hasTime;
    el.resetBtn.classList.toggle("btn-reset-active", hasTime);
  }

  if(qState==="running" || qState==="paused"){
    var qrem = (qState==="running")
      ? Math.ceil((qEndEpoch - Date.now())/1000)
      : Math.ceil(qRemainMs/1000);
    if(qrem > 60){
      // plenty of time left
      el.qTime.textContent = fmt(qrem);
      setQClass("normal");
    } else if(qrem > 0){
      // one-minute warning -> pulsing yellow background
      el.qTime.textContent = fmt(qrem);
      setQClass("warn");
    } else {
      // time's up: keep counting into the negative (host is slow sometimes!)
      el.qTime.textContent = (qrem===0 ? "" : "-") + fmt(-qrem);
      setQClass("over");
    }
  }
  if(bState==="running"){
    var brem = Math.ceil((bEndEpoch - Date.now())/1000);
    if(brem<=0){ bState="idle"; bEndEpoch=0; el.bTime.textContent = fmt(0); }
    else el.bTime.textContent = fmt(brem);
  }
}

/* ============ WAKE LOCK ============ */
var wakeLock = null;
function requestWakeLock(){
  if(!("wakeLock" in navigator)) return;
  navigator.wakeLock.request("screen").then(function(lock){
    wakeLock = lock;
    lock.addEventListener("release", function(){ wakeLock=null; });
  }).catch(function(){ /* silent — e.g. tab not visible */ });
}
document.addEventListener("visibilitychange", function(){
  if(wakeLock===null && document.visibilityState==="visible") requestWakeLock();
});

/* ============ WIRE UP ============ */
el.runBtn.onclick   = toggleRun;
el.stopBtn.onclick  = stopLog;
el.resetBtn.onclick = resetRound;
el.summaryBtn.onclick = function(){ showSummary=!showSummary; renderStructure(); };
el.clearBtn.onclick = clearSession;

el.qStart.onclick = toggleQuestion;
el.qReset.onclick = resetQuestion;
el.qToggle.onclick= toggleQuestionPreset;
el.qMin.onchange  = function(){ setQDuration((parseInt(el.qMin.value,10)||3)*60); };

el.bStart.onclick = startBreak;
el.bReset.onclick = resetBreak;
el.bMin.onchange  = function(){ setBreakDuration(parseInt(el.bMin.value,10)||10); };

// settings
el.gear.onclick = openSettings;
el.settingsClose.onclick = closeSettings;
el.settingsBack.addEventListener("click", function(ev){
  if(ev.target===el.settingsBack) closeSettings();   // click outside the card
});
document.addEventListener("keydown", function(ev){
  if(ev.key==="Escape"){ closeSettings(); closeRoundDetail(); }
});

// round detail modal (compact log column)
el.roundClose.onclick = closeRoundDetail;
el.roundBack.addEventListener("click", function(ev){
  if(ev.target===el.roundBack) closeRoundDetail();
});
el.roundModalNotes.oninput = function(){
  if(roundDetailIndex<0 || !state.roundLog[roundDetailIndex]) return;
  state.roundLog[roundDetailIndex].notes = el.roundModalNotes.value;
  save();
  // keep the (hidden-on-phone, visible-on-wide) inline field in sync too
  var inline = el.log.querySelector('input[data-i="'+roundDetailIndex+'"]');
  if(inline) inline.value = el.roundModalNotes.value;
};
el.log.addEventListener("click", function(ev){
  if(!COMPACT_LOG_MQ.matches) return;          // wide screens edit inline, no modal
  if(ev.target.tagName==="INPUT") return;      // (defensive; the field is display:none here)
  var item = ev.target.closest(".logitem");
  if(!item) return;
  var i = parseInt(item.dataset.i,10);
  if(!isNaN(i)) openRoundDetail(i);
});
el.themeToggle.onchange = function(){
  settings.light = el.themeToggle.checked;
  applyTheme(settings.light);
  saveSettings();
};
el.cbToggle.onchange = function(){
  settings.colorblind = el.cbToggle.checked;
  applyColorblind(settings.colorblind);
  saveSettings();
};
el.fsRange.oninput = function(){
  settings.fs = applyFs(parseFloat(el.fsRange.value));
  saveSettings();
};
el.fsReset.onclick = function(){
  settings.fs = applyFs(1);
  saveSettings();
};

// notes editing via delegation (keeps input focus, no rebuild)
el.log.addEventListener("input", function(ev){
  var t = ev.target;
  if(t && t.tagName==="INPUT" && t.dataset.i!=null){
    var i = parseInt(t.dataset.i,10);
    if(state.roundLog[i]){ state.roundLog[i].notes = t.value; save(); }
  }
});

/* ============ INIT ============ */
loadSettings();
load();
el.qMin.value = Math.round(qDurationSec/60);
el.qToggle.textContent = (qDurationSec===180) ? "5:00" : "3:00";
resetQuestion();
resetBreak();
renderStructure();
requestWakeLock();
setInterval(tick, 200);
tick();
