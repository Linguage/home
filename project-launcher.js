import catalog from './project-catalog.js';

export function initProjectLauncher(openApp, syncPlayback) {
  const controls=document.querySelector('.workbench-controls');
  if(!controls)return;
  const button=document.createElement('button');
  button.id='project-launcher';button.type='button';button.setAttribute('aria-label','GitHub 项目与应用');
  button.setAttribute('aria-expanded','false');button.setAttribute('aria-haspopup','dialog');button.setAttribute('aria-controls','project-dialog');
  button.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 .8a11.2 11.2 0 0 0-3.54 21.82c.56.1.77-.24.77-.54v-2.09c-3.13.68-3.79-1.33-3.79-1.33-.51-1.3-1.25-1.65-1.25-1.65-1.02-.7.08-.69.08-.69 1.13.08 1.73 1.16 1.73 1.16 1 1.72 2.63 1.22 3.27.93.1-.73.39-1.22.71-1.5-2.5-.28-5.13-1.25-5.13-5.54 0-1.22.44-2.22 1.15-3-.12-.28-.5-1.42.11-2.96 0 0 .94-.3 3.08 1.15a10.7 10.7 0 0 1 5.6 0c2.14-1.45 3.08-1.15 3.08-1.15.61 1.54.23 2.68.11 2.96.72.78 1.15 1.78 1.15 3 0 4.3-2.64 5.25-5.15 5.53.4.35.76 1.03.76 2.08v3.1c0 .3.2.65.77.54A11.2 11.2 0 0 0 12 .8Z"/></svg>';
  controls.querySelector('.view-switch').before(button);
  for(const slide of document.querySelectorAll('[data-slide]')) {
    const software=slide.querySelector('.read-button');
    const app=catalog.apps.find(app=>app.href===software?.href);
    if(!app?.repository)continue;
    const actions=document.createElement('div');actions.className='app-actions';
    const repository=document.createElement('a');repository.className='app-repository';
    repository.href=app.repository.href;repository.target='_blank';repository.rel='noopener noreferrer';
    repository.setAttribute('aria-label',`GitHub 仓库：Linguage/${app.repository.name}`);
    repository.append(button.querySelector('svg').cloneNode(true));
    const copy=document.createElement('span'),label=document.createElement('span'),name=document.createElement('strong');
    label.textContent='GitHub';name.textContent=app.repository.name;copy.append(label,name);repository.append(copy);
    software.before(actions);actions.append(software,repository);
  }
  const dialog=document.createElement('dialog');dialog.id='project-dialog';dialog.setAttribute('aria-labelledby','project-dialog-title');
  dialog.innerHTML='<header class="project-header"><h2 id="project-dialog-title">项目与应用</h2><button type="button" class="project-close" aria-label="关闭项目窗口">关闭</button></header><div class="project-tabs" role="tablist" aria-label="项目分类"><button type="button" id="projects-tab" role="tab" aria-controls="projects-panel" aria-selected="true">开放项目</button><button type="button" id="apps-tab" role="tab" aria-controls="apps-panel" aria-selected="false" tabindex="-1">已发布应用</button></div><section id="projects-panel" role="tabpanel" aria-labelledby="projects-tab"><ul class="project-list"></ul></section><section id="apps-panel" role="tabpanel" aria-labelledby="apps-tab" hidden><div class="project-apps"></div></section>';
  document.body.append(dialog);
  const list=dialog.querySelector('.project-list');
  for(const repo of [...catalog.repositories].sort((a,b)=>a.name.localeCompare(b.name))) {
    const li=document.createElement('li'),a=document.createElement('a');a.href=repo.href;a.target='_blank';a.rel='noopener noreferrer';
    const title=document.createElement('strong');title.textContent=repo.name;
    a.append(title);li.append(a);list.append(li);
  }
  for(const [index,app] of catalog.apps.entries()) {
    const a=document.createElement('a');a.href=app.href;a.className='project-app';a.title=app.description;
    const mark=document.createElement('span');mark.className='project-app-icon';mark.style.setProperty('--app-hue',String([30,165,205,90,280,350][index%6]));
    if(app.icon){const img=document.createElement('img');img.src=app.icon;img.alt='';mark.append(img);}
    else {mark.classList.add('project-monogram');mark.textContent=app.initials;}
    const label=document.createElement('span');label.textContent=app.title;a.append(mark,label);
    a.addEventListener('click',event=>{
      if(event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
      event.preventDefault();dialog.close();openApp(app.href);
    });
    dialog.querySelector('.project-apps').append(a);
  }
  const tabs=[...dialog.querySelectorAll('[role="tab"]')];
  function selectTab(index,focus=false){
    tabs.forEach((tab,i)=>{tab.setAttribute('aria-selected',String(i===index));tab.tabIndex=i===index?0:-1;dialog.querySelector('#'+tab.getAttribute('aria-controls')).hidden=i!==index;});
    if(focus)tabs[index].focus();
  }
  tabs.forEach((tab,i)=>tab.addEventListener('click',()=>selectTab(i)));
  dialog.querySelector('[role="tablist"]').addEventListener('keydown',event=>{
    if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
    event.preventDefault();selectTab(event.key==='Home'?0:event.key==='End'?1:(tabs.indexOf(document.activeElement)+1)%2,true);
  });
  button.addEventListener('click',()=>{dialog.showModal();syncPlayback();button.setAttribute('aria-expanded','true');tabs.find(t=>t.tabIndex===0).focus();});
  dialog.querySelector('.project-close').addEventListener('click',()=>dialog.close());
  dialog.addEventListener('close',()=>{button.setAttribute('aria-expanded','false');syncPlayback();});
  // Keep global Home shortcuts from closing the card underneath this modal.
  dialog.addEventListener('keydown',event=>event.stopPropagation());
  let outside=false;
  const isOutside=e=>{const b=dialog.getBoundingClientRect();return e.clientX<b.left||e.clientX>b.right||e.clientY<b.top||e.clientY>b.bottom;};
  dialog.addEventListener('pointerdown',event=>{outside=isOutside(event);});
  dialog.addEventListener('click',event=>{if(outside&&isOutside(event))dialog.close();outside=false;});
}
