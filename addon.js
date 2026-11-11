/* Eldrasia add-on: ตรวจหาส่วนที่ถูก Gemini บล็อก + ตัดพื้นหลังตัวละครอัตโนมัติ + ล้างแคชแอป + สลับโมเดลสำรองเมื่อโควตาเต็ม */
(function(){
'use strict';
var W = window;
if(W.EldAddon) return;
function $(id){ return document.getElementById(id); }

/* ================= ตัดพื้นหลังตัวละคร (พื้นหลังสีเดียว/เกือบเดียว) ================= */
function cutCfg(){ try { return Object.assign({ auto:true, tol:'40' }, JSON.parse(localStorage.getItem('eld_cut') || '{}')); } catch(e){ return { auto:true, tol:'40' }; } }
function tolVal(){ return parseInt(cutCfg().tol, 10) || 40; }

/* d = Uint8ClampedArray RGBA, คืน true ถ้าตัดสำเร็จ */
function cutCore(d, w, h, tol){
  var N = w * h, i, p, bs = [], step = Math.max(1, Math.floor((w + h) / 200));
  for(i = 0; i < w; i += step){ bs.push(i, (h - 1) * w + i); }
  for(i = 0; i < h; i += step){ bs.push(i * w, i * w + w - 1); }
  var tr = 0; bs.forEach(function(q){ if(d[q*4+3] < 250) tr++; });
  if(tr > bs.length * 0.5) return false;                      /* โปร่งใสอยู่แล้ว */
  var rs = [], gs = [], bl = [];
  bs.forEach(function(q){ rs.push(d[q*4]); gs.push(d[q*4+1]); bl.push(d[q*4+2]); });
  var med = function(a){ a.sort(function(u, v){ return u - v; }); return a[a.length >> 1]; };
  var R = med(rs), G = med(gs), B = med(bl);
  var dist = function(q){ var a = d[q*4] - R, b = d[q*4+1] - G, c = d[q*4+2] - B; return Math.sqrt(a*a + b*b + c*c); };
  var near = 0; bs.forEach(function(q){ if(dist(q) <= tol * 1.6) near++; });
  if(near < bs.length * 0.6) return false;                    /* พื้นหลังไม่ใช่สีเดียว */
  var bg = new Uint8Array(N), st = new Int32Array(N), sp = 0;
  var push = function(q){ if(!bg[q] && dist(q) <= tol){ bg[q] = 1; st[sp++] = q; } };
  for(i = 0; i < w; i++){ push(i); push((h - 1) * w + i); }
  for(i = 0; i < h; i++){ push(i * w); push(i * w + w - 1); }
  while(sp){
    p = st[--sp]; var px = p % w;
    if(px > 0) push(p - 1); if(px < w - 1) push(p + 1); if(p >= w) push(p - w); if(p < N - w) push(p + w);
  }
  var cnt = 0; for(i = 0; i < N; i++) if(bg[i]) cnt++;
  if(cnt < N * 0.02 || cnt > N * 0.09 * 10) return false;    /* ไม่มีอะไรให้ตัด หรือกินตัวละครไปด้วย */
  var soft = tol * 1.8;
  for(i = 0; i < N; i++){
    if(bg[i]){ d[i*4+3] = 0; continue; }
    var nb = (i % w > 0 && bg[i-1]) || (i % w < w - 1 && bg[i+1]) || (i >= w && bg[i-w]) || (i < N - w && bg[i+w]);
    if(nb){ var dd = dist(i); if(dd < soft) d[i*4+3] = Math.round(255 * Math.max(0, dd - tol) / (soft - tol)); }
  }
  return true;
}
function cutBg(src, tol){
  return new Promise(function(res){
    var im = new Image();
    im.onload = function(){
      var w = im.width, h = im.height, c = document.createElement('canvas'); c.width = w; c.height = h;
      var x = c.getContext('2d', { willReadFrequently:true }); x.drawImage(im, 0, 0);
      var id; try { id = x.getImageData(0, 0, w, h); } catch(e){ res(null); return; }
      if(!cutCore(id.data, w, h, tol)){ res(null); return; }
      x.putImageData(id, 0, 0);
      var u = c.toDataURL('image/webp', .92); res(u.indexOf('data:image/webp') === 0 ? u : c.toDataURL('image/png'));
    };
    im.onerror = function(){ res(null); }; im.src = src;
  });
}
function toast(t){
  var d = document.createElement('div');
  d.style.cssText = 'position:fixed;left:50%;bottom:90px;transform:translateX(-50%);z-index:60;background:rgba(13,11,20,.95);border:1px solid #e8b867;color:#f0ecf5;padding:8px 16px;border-radius:12px;font-size:.9em;max-width:90%;text-align:center';
  d.textContent = t; document.body.appendChild(d); setTimeout(function(){ d.remove(); }, 3200);
}

W.removeBlackBg = function(src){ return cutBg(src, tolVal()).then(function(r){ return r || src; }); };

var _pick = W.pickImage;
W.pickImage = function(cb, maxSize, quality){
  if(maxSize === 768 && cutCfg().auto){
    return _pick(function(d){
      cutBg(d, tolVal()).then(function(r){
        toast(r ? '✂️ ตัดพื้นหลังให้แล้ว' : 'ไม่พบพื้นหลังสีเดียว/ภาพโปร่งใสอยู่แล้ว ใช้รูปเดิม');
        cb(r || d);
      });
    }, maxSize, quality);
  }
  return _pick(cb, maxSize, quality);
};
var _rc = W.renderCast;
W.renderCast = function(){
  _rc();
  var b = $('dCut');
  if(b){ b.textContent = '✂️ ตัดพื้นหลังรูปตัวละครนี้ทั้งหมด (เฉพาะรูปที่ยังไม่โปร่งใส)'; }
};

/* ================= ตรวจหาส่วนที่ถูก Gemini บล็อก ================= */
async function diagBlock0(){
  if(W.closeModal) W.closeModal('toolsModal');
  if(W.cfg.provider !== 'gemini'){ alert('ตัวตรวจใช้ได้เมื่อเลือก Gemini เป็น AI เล่าเรื่อง'); return; }
  if(!W.cfg.gemKey){ alert('ยังไม่ได้ใส่ Gemini API Key'); return; }
  if(!W.gemCall || !W.relBlock || !W.worldBlock){ alert('index.html ของคุณเป็นเวอร์ชันเก่ากว่าที่ตัวตรวจต้องใช้ (ไม่มี gemCall/worldBlock) กรุณาใช้ไฟล์ล่าสุด'); return; }
  var body = $('diagBody'), show = function(h){ body.innerHTML = h; };
  W.openModal('diagModal'); show('<div class="empty">กำลังตรวจ... ส่งคำขอสั้นๆ หลายครั้ง (ใช้โควตาน้อยมาก)</div>');
  var lvl = (/gemini-(3|4)/.test(W.cfg.gemModel) && W.thinkBad !== W.cfg.gemModel) ? 'low' : '';
  var probe = [{ role:'user', content:'เริ่มเกม' }];
  var test = async function(sp, msgs){
    try {
      var d = await W.gemCall(sp, msgs, lvl, 48);
      if(d.error && lvl && /think|level/i.test(W.errMsg(d))) d = await W.gemCall(sp, msgs, '', 48);
      if(d.error) return { s:'err', m:W.errMsg(d) };
      var br = d.promptFeedback && d.promptFeedback.blockReason;
      if(br) return { s:'block', m:'พรอมต์ถูกบล็อก: ' + br };
      var c = d.candidates && d.candidates[0], fr = c && c.finishReason;
      if(fr && !/^(STOP|MAX_TOKENS)$/.test(fr)) return { s:'block', m:'คำตอบถูกบล็อก: ' + fr };
      return { s:'ok', m:'' };
    } catch(e){ return { s:'err', m:e.message }; }
  };
  var pool = async function(items, fn, n){
    var out = new Array(items.length), idx = 0;
    var worker = async function(){ while(idx < items.length){ var k = idx++; out[k] = await fn(items[k]); } };
    var ws = []; for(var i = 0; i < n; i++) ws.push(worker()); await Promise.all(ws); return out;
  };
  var E = W.esc;

  var base = await test('คุณคือผู้เล่าเรื่องในเกมแฟนตาซี', probe);
  if(base.s !== 'ok'){ show('<div class="board-q"><b>ข้อความพื้นฐานยังไม่ผ่าน</b><small>' + E(base.m) + '<br>ปัญหาอยู่ที่ API Key / ชื่อโมเดล / โควตา ไม่ใช่พรอมต์ของเกม</small></div>'); return; }

  var fm = W.buildMsgs(); if(!fm.length || fm[fm.length - 1].role !== 'user') fm.push(probe[0]);
  var full = await test(W.buildSystem(), fm);
  if(full.s === 'ok'){
    show('<div class="board-q"><b>✅ ตอนนี้ชุดพรอมต์เต็มส่งผ่านแล้ว</b><small>ถ้ายังเจอ error เป็นบางครั้ง แปลว่าคำตอบที่ AI เขียนออกมาถูกบล็อกตอนสร้าง ให้กด เครื่องมือ > สร้างคำตอบล่าสุดใหม่</small></div>'); return;
  }
  if(full.s === 'err'){ show('<div class="board-q"><b>⚠️ ตรวจไม่สำเร็จ</b><small>' + E(full.m) + '</small></div>'); return; }

  var secs = [];
  var addSecs = function(prefix, text){ text.split(/\n(?=\d+\.\s)/).forEach(function(p){ p = p.trim(); if(p) secs.push({ n:prefix + p.split('\n')[0].slice(0, 46), t:p }); }); };
  addSecs('พรอมต์หลัก: ', W.getPrompt()); addSecs('แท็กระบบ: ', W.TAGS);
  if(W.cfg.lore.trim()) secs.push({ n:'Lorebook', t:W.cfg.lore });
  if(W.mem) secs.push({ n:'ความจำเรื่องราว', t:W.mem });
  if(W.rules.trim()) secs.push({ n:'กฎที่เรียนรู้', t:W.rules });
  Object.keys(W.npcs).forEach(function(n){ var p = W.npcs[n]; if(p.persona || p.look) secs.push({ n:'ตัวละคร: ' + n, t:n + ' | นิสัย: ' + (p.persona || '-') + ' | ลักษณะ: ' + (p.look || '-') }); });
  secs.push({ n:'สถานะ/ความสัมพันธ์/โลก', t:W.relBlock() + W.worldBlock() });

  show('<div class="empty">ชุดเต็มโดนบล็อก (' + E(full.m) + ') กำลังไล่หาทีละส่วน 0/' + secs.length + '</div>');
  var done = 0;
  var rs = await pool(secs, async function(s){ var r = await test(s.t, probe); done++; show('<div class="empty">ไล่หาทีละส่วน ' + done + '/' + secs.length + '</div>'); return r; }, 3);
  var bad = [], errs = 0;
  secs.forEach(function(s, i){ if(rs[i].s === 'block') bad.push({ s:s, r:rs[i] }); else if(rs[i].s === 'err') errs++; });

  var html = '<div class="board-q"><b>ผลตรวจ</b><small>ชุดเต็ม: ❌ ' + E(full.m) + '<br>ตรวจ ' + secs.length + ' ส่วน โดนบล็อก ' + bad.length + ' ส่วน' + (errs ? ' · ตรวจไม่สำเร็จ ' + errs + ' (อาจติดลิมิตคำขอ รอสักครู่แล้วลองใหม่)' : '') + '</small></div>';
  if(!bad.length){
    html += '<div class="board-q"><small>ไม่มีส่วนไหนโดนบล็อกเดี่ยวๆ แปลว่าเกิดจากหลายส่วนรวมกัน หรือจากคำตอบที่ AI เขียนเอง ลองลดจำนวนประวัติที่ส่ง (ตั้งค่า &gt; 12) ล้างความจำเรื่องราวในตั้งค่า หรือกดสร้างใหม่</small></div>';
  }
  for(var bi = 0; bi < bad.length; bi++){
    var b = bad[bi], lines = b.s.t.split('\n').map(function(x){ return x.trim(); }).filter(function(x){ return x.length > 8; }).slice(0, 40);
    var lr = lines.length > 1 ? await pool(lines, function(l){ return test(l, probe); }, 3) : [];
    var hits = lines.filter(function(l, i){ return lr[i] && lr[i].s === 'block'; });
    html += '<div class="board-q"><b>❌ ' + E(b.s.n) + '</b><small>' + E(b.r.m) + '</small>';
    if(hits.length){ hits.forEach(function(l){ html += '<small style="color:#ffb3a8">• ' + E(l.slice(0, 160)) + '</small>'; }); }
    else if(lines.length > 1){ html += '<small>ไม่มีบรรทัดไหนโดนเดี่ยวๆ ตัวกรองอ่านทั้งส่วนรวมกัน</small>'; }
    html += '</div>';
  }
  html += '<div class="note">ตัวกรองนี้เป็นของ Google ปรับจากหน้าเว็บไม่ได้ ส่วนที่ขึ้นสีแดงคือส่วนที่ต้องแก้หรือเอาออกในตั้งค่า ถ้าต้องการเนื้อหาที่ Gemini ไม่รับ ให้เปลี่ยนไปใช้ผู้ให้บริการอื่นแทน</div>';
  show(html);
}
async function diagBlock(){
  W.EldNoFb = true;
  try { await diagBlock0(); } finally { W.EldNoFb = false; }
}

/* ================= ล้างแคชแอป (ไม่ลบเซฟ) ================= */
async function clearAppCache(){
  if(W.closeModal) W.closeModal('toolsModal');
  if(!confirm('ล้างแคชของแอปแล้วโหลดหน้าใหม่? (ตัวละคร ประวัติ และเซฟไม่ถูกลบ)')) return;
  try {
    var rs = await navigator.serviceWorker.getRegistrations(); for(var i = 0; i < rs.length; i++) await rs[i].unregister();
    var ks = await caches.keys(); for(var j = 0; j < ks.length; j++) await caches.delete(ks[j]);
  } catch(e){}
  location.reload();
}

/* ================= สลับโมเดล Gemini อัตโนมัติเมื่อโควตาเต็ม/เซิร์ฟเวอร์ไม่ว่าง ================= */
var FB_DEFAULT = 'gemini-3.8-flash, gemini-3.6-flash, gemini-2.5-flash, gemini-2.5-flash-lite, gemini-2.0-flash';
function fbList(){ var v = localStorage.getItem('eld_fb'); if(v === null) v = FB_DEFAULT; return v.split(',').map(function(x){ return x.trim(); }).filter(Boolean); }
function isQuota(d){ return !!(d && d.error && (d.error.code === 429 || d.error.code === 503 || /RESOURCE_EXHAUSTED|UNAVAILABLE|quota|rate limit|overloaded/i.test(JSON.stringify(d.error)))); }
var _gc = W.gemCall, fbChain = Promise.resolve();
if(_gc){
  W.gemCall = async function(sp, msgs, level, maxOut){
    var first = await _gc(sp, msgs, level, maxOut);
    if(W.EldNoFb || !isQuota(first)) return first;
    /* เข้าคิวทีละงาน และอัปเดตชื่อโมเดลที่ใช้งานจริงในตั้งค่าทันทีเมื่อสลับสำเร็จ */
    var run = async function(){
      var orig = W.cfg.gemModel, list = fbList().filter(function(m){ return m !== orig; });
      for(var i = 0; i < list.length; i++){
        W.cfg.gemModel = list[i];
        var d2 = await _gc(sp, msgs, /gemini-(3|4)/.test(list[i]) ? level : '', maxOut);
        if(!d2.error){
          if(W.updateActiveModelUI) W.updateActiveModelUI('gemini', list[i]);
          try { localStorage.setItem('eld_cfg', JSON.stringify(W.cfg)); } catch(e){}
          toast('⚠️ ' + orig + ' โควตาเต็ม/ใช้ไม่ได้ สลับไปใช้ ' + list[i] + ' (อัปเดตในตั้งค่าแล้ว)');
          return d2;
        }
      }
      W.cfg.gemModel = orig;
      return first;
    };
    var p = fbChain.then(run, run); fbChain = p.catch(function(){}); return p;
  };
}
function injectFb(){
  var st = document.querySelector('#settings .sheet'), hs = st ? st.querySelectorAll('h4') : [], anchor = null;
  for(var i = 0; i < hs.length; i++){ if(hs[i].textContent.indexOf('สร้างภาพ') >= 0) anchor = hs[i]; }
  if(!anchor) return;
  var box = document.createElement('div');
  box.innerHTML = '<h4>สำรองโมเดล Gemini (เมื่อโควตาเต็ม)</h4><label>ชื่อโมเดลสำรอง คั่นด้วยจุลภาค ระบบลองตามลำดับเมื่อโควตาของโมเดลหลักหมด (แต่ละโมเดลมีโควตาแยกกัน)</label><input type="text" id="fbList" autocomplete="off"><div class="note">โมเดลรุ่นเก่ากว่าอาจเขียนได้แย่กว่า ถ้าชื่อไม่ตรงจะขึ้น error 404 ให้เช็กชื่อที่ถูกต้องจากหน้า Rate Limit ใน Google AI Studio</div>';
  anchor.parentNode.insertBefore(box, anchor);
  var inp = $('fbList'); inp.value = fbList().join(', ');
  inp.onchange = function(){ localStorage.setItem('eld_fb', inp.value); };
}

/* ================= ฉีดปุ่ม/หน้าต่างเข้า UI เดิม ================= */
function inject(){
  var m = document.createElement('div'); m.id = 'diagModal'; m.className = 'modal';
  m.onclick = function(e){ if(e.target === m) W.closeModal('diagModal'); };
  m.innerHTML = '<div class="sheet"><h3>🔍 ตรวจหาส่วนที่ถูกบล็อก</h3><div id="diagBody"></div><button class="btn" onclick="closeModal(\'diagModal\')">ปิด</button></div>';
  document.body.appendChild(m);

  var tools = document.querySelector('#toolsModal .sheet');
  if(tools){
    var last = tools.lastElementChild;
    [['🔍 ตรวจหาส่วนที่ถูก Gemini บล็อก', diagBlock], ['♻️ ล้างแคชแอป (ไม่ลบเซฟ)', clearAppCache]].forEach(function(x){
      var b = document.createElement('button'); b.className = 'btn grey'; b.textContent = x[0]; b.onclick = x[1]; tools.insertBefore(b, last);
    });
  }
  var st = document.querySelector('#settings .sheet'), hs = st ? st.querySelectorAll('h4') : [], anchor = null;
  for(var i = 0; i < hs.length; i++){ if(hs[i].textContent.indexOf('สร้างภาพ') >= 0) anchor = hs[i]; }
  if(anchor){
    var box = document.createElement('div'), c = cutCfg();
    box.innerHTML = '<h4>ตัดพื้นหลังตัวละคร</h4>' +
      '<label class="chk"><input type="checkbox" id="cutAuto"> ตัดพื้นหลังอัตโนมัติเมื่ออัปรูปตัวละคร</label>' +
      '<label>ความไวในการตัด</label><select id="cutTol"><option value="24">ต่ำ (ตัดเฉพาะสีใกล้เคียงพื้นหลังมาก)</option><option value="40">กลาง</option><option value="60">สูง (ตัดกว้างขึ้น ระวังกินขอบตัวละคร)</option></select>' +
      '<div class="note">ใช้ได้กับรูปที่พื้นหลังเป็นสีเดียว (ขาว ดำ เขียว ฯลฯ) ถ้าพื้นหลังเป็นฉากซับซ้อน ระบบจะใช้รูปเดิม ควรใช้รูป PNG โปร่งใสแทน</div>';
    anchor.parentNode.insertBefore(box, anchor);
    var save = function(){ localStorage.setItem('eld_cut', JSON.stringify({ auto:$('cutAuto').checked, tol:$('cutTol').value })); };
    $('cutAuto').checked = c.auto; $('cutTol').value = String(c.tol);
    $('cutAuto').onchange = save; $('cutTol').onchange = save;
  }
  injectFb();
}
inject();
W.EldAddon = { cutCore:cutCore, cutBg:cutBg, diagBlock:diagBlock };
})();
