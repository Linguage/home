(() => {
window.LinguistaWidgets = {};
const libraryRecords = [{"date": "Aug 25", "name": "Terence Tao", "topic": "mathematics"}, {"date": "Nov 04", "name": "Alexandre Grothendieck", "topic": "收获与播种"}, {"date": "Feb 11", "name": "Paul Everitt", "topic": "规格驱动开发"}, {"date": "May 18", "name": "Jack Wotherspoon", "topic": "Gemini CLI"}, {"date": "Aug 25", "name": "Elie Schoppik", "topic": "Agent Skills with Anthropic"}];
function borrowingMarkup(){
 const rows=libraryRecords.map(row=>`<span class="borrow-row"><span class="borrow-date">${row.date}</span><span class="borrow-name" title="${row.name}">${row.name}</span><span class="borrow-topic" title="${row.topic}">${row.topic}</span></span>`).join('');
 return `<span class="borrow-card"><span class="borrow-header"><span class="borrow-title">BORROWING RECORD</span><span class="borrow-cols"><span>DATE DUE</span><span>ISSUED TO</span><span>THEME</span></span></span><span class="borrow-window"><span class="borrow-rows"><span class="borrow-set">${rows}</span><span class="borrow-set" aria-hidden="true">${rows}</span></span></span></span>`;
}
window.LinguistaWidgets.library = host => {
 const back=host.dataset.initialBack==='true';
 host.innerHTML=`<button class="library-turn" type="button" data-back="${back}" aria-pressed="${back}"><span class="library-turn-inner"><img class="library-face library-front" src="./assets/identities/library-campus-front.svg" alt="Library 蓝色象牙塔与大学建筑群借阅卡"><span class="library-face library-back">${borrowingMarkup()}</span></span></button>`;
 const button=host.querySelector('.library-turn');
 function sync(){const on=button.dataset.back==='true';button.setAttribute('aria-pressed',String(on));button.setAttribute('aria-label',on?'Library 借阅记录背面，翻至建筑群正面':'Library 建筑群正面，翻至借阅记录背面');host.querySelector('.library-front').setAttribute('aria-hidden',String(on));host.querySelector('.library-back').setAttribute('aria-hidden',String(!on));}
 button.addEventListener('click',()=>{button.dataset.back=String(button.dataset.back!=='true');sync()});sync();
};

window.LinguistaWidgets.alpaca = (host, hostIndex = 0, modules = []) => {
 const covers = {notes:'essay',readings:'readings',topics:'topics',prompts:'prompts'};
 const alpacaPages = [{title:'AlpacaNotes',href:'https://linguista.cn/alpacanotes/',kind:'home',cover:'./assets/identities/alpaca-covers/home.svg'}, ...modules.map(item => {
   const kind = covers[item.key.replace('alpaca-','')] || 'notes';
   return {title:item.title,href:item.href,kind,cover:`./assets/identities/alpaca-covers/${kind}.svg`};
 })];
 const arrow='<svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 10 4-4 4 4"/></svg>';
 host.innerHTML=`<div class="ap-device"><img class="ap-shell" src="./assets/identities/alpaca-device.svg" alt=""><div class="ap-display"><div class="ap-status"><span class="ap-status-name">Linguista</span><span class="ap-status-index"></span></div><div class="ap-screen-body"><div class="ap-menu" role="listbox" tabindex="0" aria-label="AlpacaNotes 专辑栏目">${alpacaPages.map((page,i)=>`<button type="button" class="ap-item" role="option" tabindex="-1" id="ap-${hostIndex}-${i}" data-index="${i}" aria-selected="false"><span>${page.title}</span><span class="ap-chevron" aria-hidden="true">›</span></button>`).join('')}</div><div class="ap-album"><a class="ap-cover-link" target="_blank" rel="noopener"><img class="ap-cover" alt=""></a></div></div></div><div class="ap-wheel"><div class="ap-ring" tabindex="0" role="slider" aria-label="AlpacaNotes 模块滚轮" aria-valuemin="1" aria-valuemax="${alpacaPages.length}"><span class="ap-indicator"></span></div><button class="ap-direction ap-up" type="button" aria-label="上一页">${arrow}</button><button class="ap-direction ap-right" type="button" aria-label="下一页">${arrow.replace('<svg ','<svg style="transform:rotate(90deg)" ')}</button><button class="ap-direction ap-down" type="button" aria-label="下一页">${arrow.replace('<svg ','<svg style="transform:rotate(180deg)" ')}</button><button class="ap-direction ap-left" type="button" aria-label="上一页">${arrow.replace('<svg ','<svg style="transform:rotate(-90deg)" ')}</button><a class="ap-select" target="_blank" rel="noopener"></a></div><span class="ap-announcement" aria-live="polite" aria-atomic="true"></span></div>`;
 let index=0,angle=0,wheelSum=0,lastWheel=0,drag=null;
 const ring=host.querySelector('.ap-ring'),display=host.querySelector('.ap-display'),menu=host.querySelector('.ap-menu'),select=host.querySelector('.ap-select');
 function render(announce=true){const page=alpacaPages[index];display.dataset.kind=page.kind;const cover=host.querySelector('.ap-cover');cover.src=page.cover;cover.alt=page.title+' 专辑封面';host.querySelector('.ap-cover-link').href=page.href;host.querySelector('.ap-cover-link').setAttribute('aria-label',`进入 ${page.title}`);host.querySelector('.ap-status-index').textContent=`${index+1}/${alpacaPages.length}`;select.href=page.href;select.setAttribute('aria-label',`进入 ${page.title}`);ring.setAttribute('aria-valuenow',String(index+1));ring.setAttribute('aria-valuetext',page.title);menu.setAttribute('aria-activedescendant',`ap-${hostIndex}-${index}`);host.querySelectorAll('.ap-item').forEach((item,i)=>item.setAttribute('aria-selected',String(i===index)));if(announce)host.querySelector('.ap-announcement').textContent=page.title;}
 host.querySelectorAll('.ap-item').forEach(item=>item.addEventListener('click',()=>{index=Number(item.dataset.index);render();menu.focus({preventScroll:true})}));
 function step(delta){index=(index+delta+alpacaPages.length)%alpacaPages.length;render();}
 function rotate(delta){angle+=delta;ring.style.setProperty('--angle',angle+'deg');}
 host.querySelectorAll('.ap-direction').forEach(button=>button.addEventListener('click',()=>{const delta=button.matches('.ap-up,.ap-left')?-1:1;rotate(delta*45);step(delta)}));
 host.querySelector('.ap-wheel').addEventListener('wheel',event=>{event.preventDefault();const now=performance.now();if(now-lastWheel>180)wheelSum=0;lastWheel=now;const unit=event.deltaMode===1?16:event.deltaMode===2?160:1;const delta=(Math.abs(event.deltaY)>=Math.abs(event.deltaX)?event.deltaY:event.deltaX)*unit;wheelSum+=delta;rotate(delta*.2);if(Math.abs(wheelSum)>=40){step(Math.sign(wheelSum));wheelSum=0;}},{passive:false});
 const navigateKey=event=>{if(['ArrowUp','ArrowLeft','ArrowDown','ArrowRight','Home','End'].includes(event.key)){event.preventDefault();if(event.key==='Home'){index=0;render()}else if(event.key==='End'){index=alpacaPages.length-1;render()}else{const delta=['ArrowUp','ArrowLeft'].includes(event.key)?-1:1;rotate(delta*45);step(delta)}}};ring.addEventListener('keydown',navigateKey);menu.addEventListener('keydown',event=>{navigateKey(event);if(event.key==='Enter'){event.preventDefault();select.click()}});
 const pointerAngle=event=>{const r=ring.getBoundingClientRect();return Math.atan2(event.clientY-r.y-r.height/2,event.clientX-r.x-r.width/2)*180/Math.PI};
 ring.addEventListener('pointerdown',event=>{if(event.button!==0)return;ring.focus({preventScroll:true});ring.setPointerCapture(event.pointerId);drag={id:event.pointerId,previous:pointerAngle(event),sum:0};});
 ring.addEventListener('pointermove',event=>{if(!drag||drag.id!==event.pointerId)return;const current=pointerAngle(event);const delta=((current-drag.previous+540)%360)-180;drag.previous=current;drag.sum+=delta;rotate(delta);while(Math.abs(drag.sum)>=45){const direction=Math.sign(drag.sum);step(direction);drag.sum-=direction*45;}});
 for(const type of ['pointerup','pointercancel','lostpointercapture'])ring.addEventListener(type,()=>{drag=null});
 render(false);
};

})();
