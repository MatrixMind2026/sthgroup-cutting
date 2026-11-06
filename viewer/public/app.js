/* STHGroup Viewer: standalone demo, no desktop APIs or production data. */
'use strict';
const $ = id => document.getElementById(id);
const icons = {
 cube:'<path d="m12 3 9 5-9 5-9-5 9-5Zm-9 5v9l9 5 9-5V8M12 13v9M7.5 5.5l9 5"/>',
 cut:'<path d="M4 9V4h5m6 0h5v5m0 6v5h-5m-6 0H4v-5M9 4v16m0-8h11"/>',
 list:'<path d="M7 3h10l3 3v15H4V3h3Zm1 5h8M8 12h8m-8 4h6"/>',
 folder:'<path d="M3 7V5h6l3 3h9v12H3V7Z"/>',
 reset:'<path d="M4 9a8 8 0 1 1 0 7M4 4v5h5"/>',
 layers:'<path d="m12 3 10 5-10 5L2 8l10-5Zm-9 9 9 5 9-5m-18 5 9 5 9-5"/>',
 chevron:'<path d="m6 9 6 6 6-6"/>',
 eye:'<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
 download:'<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>'
};
function icon(name){return `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${icons[name]||icons.cube}</svg>`;}
document.querySelectorAll('[data-icon]').forEach(el=>el.innerHTML=icon(el.dataset.icon));
document.querySelector('.tabs').setAttribute('role','tablist');
const modules=[
 {id:'all',name:'Всё изделие',count:'8 мод.',description:'Демонстрационная угловая кухня',dimensions:'3200 × 2400 × 2200 мм'},
 {id:'base',name:'Нижние модули',count:'4',description:'Корпус ЛДСП 16 мм · фасады «Дуб натуральный»',dimensions:'Высота корпуса 720 мм · глубина 560 мм'},
 {id:'upper',name:'Верхние модули',count:'3',description:'Корпус ЛДСП 16 мм · фасады «Графит матовый»',dimensions:'Высота 720 мм · глубина 320 мм'},
 {id:'tall',name:'Пенал с техникой',count:'1',description:'Пенал с нишей для духового шкафа',dimensions:'600 × 600 × 2200 мм'},
 {id:'counter',name:'Столешница',count:'2 части',description:'Декор «Серый камень» · толщина 38 мм',dimensions:'Глубина 620 мм'},
];
let selectModel=()=>{},fitModel=()=>{},toggleFacades=()=>{};
$('parts').innerHTML=modules.map(m=>`<button data-part="${m.id}" class="${m.id==='all'?'active':''}" aria-pressed="${m.id==='all'}">${icon(m.id==='counter'?'layers':'cube')}<span>${m.name}</span><span>${m.count}</span></button>`).join('');
function showPart(id){const m=modules.find(p=>p.id===id)||modules[0];document.querySelectorAll('[data-part]').forEach(el=>{const yes=el.dataset.part===m.id;el.classList.toggle('active',yes);el.setAttribute('aria-pressed',String(yes));});$('part-info').replaceChildren();const title=document.createElement('strong');title.textContent=m.name;const d=document.createElement('div');d.textContent=m.description;const size=document.createElement('div');size.textContent=m.dimensions;$('part-info').append(title,d,size);$('selected-label').textContent=m.id==='all'?'Выберите элемент модели':m.name;selectModel(m.id);}
document.querySelectorAll('[data-part]').forEach(el=>el.addEventListener('click',()=>showPart(el.dataset.part)));
$('reset-view').addEventListener('click',()=>fitModel());
$('facades').addEventListener('click',()=>{const hidden=$('facades').getAttribute('aria-pressed')!=='true';$('facades').setAttribute('aria-pressed',String(hidden));$('facades').lastElementChild.textContent=hidden?'Показать фасады':'Скрыть фасады';toggleFacades(hidden);});
showPart('all');

function setTab(id,update=true){if(!['model','product','status'].includes(id))id='model';document.querySelectorAll('[role=tabpanel]').forEach(el=>el.hidden=el.id!==id);document.querySelectorAll('[data-tab]').forEach(el=>{const active=el.dataset.tab===id;el.setAttribute('aria-selected',String(active));el.tabIndex=active?0:-1;});if(update)history.replaceState(null,'','#'+id);if(id==='model')window.dispatchEvent(new Event('resize'));}
document.querySelectorAll('[data-tab]').forEach((btn,i,all)=>{btn.addEventListener('click',()=>setTab(btn.dataset.tab));btn.addEventListener('keydown',e=>{let next;if(e.key==='ArrowRight')next=(i+1)%all.length;if(e.key==='ArrowLeft')next=(i+all.length-1)%all.length;if(e.key==='Home')next=0;if(e.key==='End')next=all.length-1;if(next!==undefined){e.preventDefault();setTab(all[next].dataset.tab);all[next].focus();}});});
window.addEventListener('hashchange',()=>setTab(location.hash.slice(1),false));

$('product-list').innerHTML=modules.slice(1).map(m=>`<article><span>${icon(m.id==='counter'?'layers':'cube')}</span><div><h2>${m.name}</h2><p>${m.description}</p><small>${m.dimensions}</small></div><strong>${m.count}</strong></article>`).join('');

function create3D(){
 const T=window.THREE,host=$('canvas');if(!T)throw Error('Библиотека 3D не загрузилась');
 const renderer=new T.WebGLRenderer({antialias:true,alpha:true,powerPreference:'low-power'});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.setClearColor(0x000000,0);renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.15;renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;host.append(renderer.domElement);renderer.domElement.tabIndex=0;renderer.domElement.setAttribute('aria-label','3D-модель кухни. Стрелки: вращение, плюс и минус: масштаб, Escape: исходный ракурс');
 const scene=new T.Scene(),camera=new T.PerspectiveCamera(38,1,.1,100),target=new T.Vector3(0,1.04,.32);let azimuth=.72,elevation=.3,radius=6.8;
 scene.add(new T.HemisphereLight(0xfff3df,0x444c54,2.5));const key=new T.DirectionalLight(0xffe6bd,3.8);key.position.set(0,5,4);key.castShadow=true;key.shadow.mapSize.set(1024,1024);key.shadow.camera.left=-5;key.shadow.camera.right=5;key.shadow.camera.top=5;key.shadow.camera.bottom=-5;key.shadow.bias=-.0005;scene.add(key);const fill=new T.DirectionalLight(0xd0e5ff,1.4);fill.position.set(-4,2,3);scene.add(fill);
 const group=new T.Group();scene.add(group);const meshes=[],fronts=[];
 function mat(color,roughness=.75){return new T.MeshStandardMaterial({color,roughness,metalness:0});}
 const oak=mat(0xb18552),graphite=mat(0x3c4241),body=mat(0x62615b),stone=mat(0x9e9b8f,.45),black=mat(0x202225,.3),steel=mat(0x9eaaa9,.25);
 // Generated procedural grain is a demo material, not a photographed customer asset.
 const textureCanvas=document.createElement('canvas');textureCanvas.width=128;textureCanvas.height=256;const ctx=textureCanvas.getContext('2d');ctx.fillStyle='#b58a58';ctx.fillRect(0,0,128,256);let seed=41;for(let i=0;i<190;i++){seed=(seed*1664525+1013904223)>>>0;const x=seed%128;ctx.strokeStyle=i%3?'#76523133':'#f7d9ac44';ctx.lineWidth=.5+(i%3)*.4;ctx.beginPath();ctx.moveTo(x,0);ctx.bezierCurveTo(x+5,70,x-3,180,x+1,256);ctx.stroke();}const wood=new T.CanvasTexture(textureCanvas);wood.colorSpace=T.SRGBColorSpace;oak.map=wood;
 function box(w,h,d,x,y,z,material,part,facade=false,parent=group){const mesh=new T.Mesh(new T.BoxGeometry(w,h,d),material.clone());mesh.position.set(x,y,z);mesh.castShadow=true;mesh.receiveShadow=true;mesh.userData.part=part;parent.add(mesh);if(part){meshes.push(mesh);if(facade)fronts.push(mesh);}return mesh;}
 function cabinet(x,z,w,part,upper=false,yaw=0){const g=new T.Group();g.position.set(x,0,z);g.rotation.y=yaw;group.add(g);const h=.72,d=upper?.34:.58,y=upper?1.83:.5;box(w,h,d,0,y,0,body,part,false,g);const front=upper?graphite:oak;const n=upper?1:2;for(let j=0;j<n;j++){const fx=-w/2+(j+.5)*w/n;box(w/n-.012,h-.012,.025,fx,y,d/2+.018,front,part,true,g);box(w/n-.09,.014,.023,fx,y+h/2-.045,d/2+.037,black,part,true,g);}if(!upper){box(w,.035,d+.05,0,.89,.01,stone,'counter',false,g);box(w-.06,.12,.06,0,.08,.18,black,part,false,g);}}
 cabinet(-.7,-.3,.8,'base');cabinet(.11,-.3,.8,'base');cabinet(.92,-.3,.8,'base');cabinet(1.04,.5,.8,'base',false,Math.PI/2);
 cabinet(-.7,-.43,.8,'upper',true);cabinet(.11,-.43,.8,'upper',true);cabinet(.92,-.43,.8,'upper',true);
 box(.62,2.2,.62,-1.44,1.12,-.31,oak,'tall');box(.58,.64,.027,-1.44,.99,.018,black,'tall',true);box(.52,.34,.03,-1.44,1.01,.037,mat(0x171b1c,.15),'tall',true);box(.44,.025,.045,-1.44,1.24,.065,steel,'tall',true);box(.602,.72,.027,-1.44,1.83,.02,oak,'tall',true);box(.602,.56,.027,-1.44,.34,.02,oak,'tall',true);
 box(.8,.012,.4,.1,.92,-.31,black,'counter');for(let i=0;i<4;i++){const ring=new T.Mesh(new T.TorusGeometry(.055,.004,6,32),steel);ring.rotation.x=Math.PI/2;ring.position.set(-.1+(i%2)*.29,.93,-.44+Math.floor(i/2)*.21);group.add(ring);}box(.44,.012,.33,.97,.92,-.3,steel,'counter');
 const floor=new T.Mesh(new T.PlaneGeometry(40,40),new T.ShadowMaterial({color:0x0c0c0c,opacity:.25}));floor.rotation.x=-Math.PI/2;floor.receiveShadow=true;floor.position.y=.01;scene.add(floor);
 const ray=new T.Raycaster(),point=new T.Vector2();let pending=false;function draw(){if(pending)return;pending=true;requestAnimationFrame(()=>{pending=false;const w=host.clientWidth,h=host.clientHeight;if(!w||!h)return;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();const viewRadius=radius*Math.max(1,1/camera.aspect);camera.position.set(target.x+viewRadius*Math.sin(azimuth)*Math.cos(elevation),target.y+viewRadius*Math.sin(elevation),target.z+viewRadius*Math.cos(azimuth)*Math.cos(elevation));camera.lookAt(target);renderer.render(scene,camera);host.dataset.ready='true';});}
 selectModel=id=>{meshes.forEach(m=>{m.material.emissive.setHex(id!=='all'&&m.userData.part===id?0x6f3614:0x000000);m.material.emissiveIntensity=.28;});draw();};fitModel=()=>{azimuth=.72;elevation=.3;radius=6.8;draw();};toggleFacades=hidden=>{fronts.forEach(f=>f.visible=!hidden);draw();};
 const pointers=new Map();let down,dragged=0,pinchDistance=0;const canvas=renderer.domElement;
 function distance(){const p=[...pointers.values()];return p.length===2?Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y):0;}
 canvas.addEventListener('pointerdown',e=>{pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});canvas.setPointerCapture(e.pointerId);down={x:e.clientX,y:e.clientY};dragged=0;pinchDistance=distance();});
 canvas.addEventListener('pointermove',e=>{const prev=pointers.get(e.pointerId);if(!prev)return;pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});dragged+=Math.hypot(e.clientX-prev.x,e.clientY-prev.y);if(pointers.size===2){const d=distance();if(pinchDistance&&d)radius=Math.max(3.8,Math.min(12,radius*pinchDistance/d));pinchDistance=d;}else{azimuth-=(e.clientX-prev.x)*.007;elevation=Math.max(-.02,Math.min(1.1,elevation+(e.clientY-prev.y)*.005));}draw();});
 canvas.addEventListener('pointerup',e=>{const single=pointers.size===1;pointers.delete(e.pointerId);pinchDistance=0;if(single&&down&&dragged<7){const r=canvas.getBoundingClientRect();point.set((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1);ray.setFromCamera(point,camera);const hit=ray.intersectObjects(meshes.filter(m=>m.visible))[0];if(hit)showPart(hit.object.userData.part);}down=null;});canvas.addEventListener('pointercancel',e=>{pointers.delete(e.pointerId);down=null;pinchDistance=0;});
 canvas.addEventListener('wheel',e=>{e.preventDefault();radius=Math.max(3.8,Math.min(12,radius+e.deltaY*.003));draw();},{passive:false});canvas.addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','=','-','Escape'].includes(e.key))return;e.preventDefault();if(e.key==='Escape'){fitModel();return;}if(e.key==='ArrowLeft')azimuth-=.13;if(e.key==='ArrowRight')azimuth+=.13;if(e.key==='ArrowUp')elevation=Math.min(1.1,elevation+.1);if(e.key==='ArrowDown')elevation=Math.max(-.02,elevation-.1);if(['+','='].includes(e.key))radius=Math.max(3.8,radius-.4);if(e.key==='-')radius=Math.min(12,radius+.4);draw();});
 new ResizeObserver(draw).observe(host);window.addEventListener('resize',draw);canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();host.dataset.ready='lost';$('selected-label').textContent='3D временно недоступно. Перезагрузите страницу.';});fitModel();
}
try{create3D();}catch(error){$('canvas').innerHTML='<div class="fallback"><strong>3D-просмотр недоступен в этом браузере</strong><p>Попробуйте браузер с поддержкой WebGL. Состав изделия и статус заказа доступны во вкладках.</p></div>';$('facades').disabled=true;$('reset-view').disabled=true;}
setTab(location.hash.slice(1),false);
