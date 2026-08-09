(() => {
  const game=document.getElementById('game'), ctx=game.getContext('2d');
  const map=document.getElementById('map'), mctx=map.getContext('2d');
  const stage=document.getElementById('stage'), overlay=document.getElementById('overlay');
  const timerEl=document.getElementById('timer'), hud=document.getElementById('hud');

  const COLORS=[
    {name:'Ruby',color:'#ff3b5c'},
    {name:'Azure',color:'#3ea0ff'},
    {name:'Lime',color:'#70e35a'},
    {name:'Gold',color:'#ffd23f'}
  ];

  const WORLD_W=1800, WORLD_H=1500;
  const TRACK_HALF=92, R=17;
  const GRAVITY=240, AIR_DRAG=0.22;
  const WALL_RESTITUTION=0.66, BALL_RESTITUTION=0.90, PEG_RESTITUTION=0.80;
  const TANGENTIAL_FRICTION=0.988;
  const STALL_SECONDS=8, RACE_CAP=48;

  let W=0,H=0,DPR=1,MW=0,MH=0,MDPR=1;
  let path=[], totalLength=0, walls=[], pegs=[], funnels=[];
  let marbles=[], finishOrder=[];
  let state='idle', startTime=0,lastTime=0,raf=0,raceToken=0;
  let camX=0,camY=0,camAngle=0,camS=0;

  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const rnd=(a,b)=>a+Math.random()*(b-a);

  function addPoint(x,y){
    const prev=path[path.length-1];
    const s=prev ? prev.s+Math.hypot(x-prev.x,y-prev.y) : 0;
    path.push({x,y,s});
  }
  function addLine(x1,y1,x2,y2,step=34){
    const d=Math.hypot(x2-x1,y2-y1), n=Math.max(1,Math.ceil(d/step));
    for(let i=path.length?1:0;i<=n;i++){
      const t=i/n; addPoint(x1+(x2-x1)*t,y1+(y2-y1)*t);
    }
  }
  function addArc(cx,cy,r,a0,a1,step=0.10){
    const n=Math.max(8,Math.ceil(Math.abs(a1-a0)/step));
    for(let i=1;i<=n;i++){
      const t=i/n,a=a0+(a1-a0)*t;
      addPoint(cx+r*Math.cos(a),cy+r*Math.sin(a));
    }
  }

  function buildCourse(){
    path=[]; walls=[]; pegs=[]; funnels=[];

    addLine(260,170,260,1120);
    addArc(500,1120,240,Math.PI,0);
    addLine(740,1120,740,360);
    addArc(980,360,240,-Math.PI,0);
    addLine(1220,360,1220,1110);
    addArc(1460,1110,240,Math.PI,0);
    addLine(1700,1110,1700,470);

    totalLength=path[path.length-1].s;

    const left=[], right=[];
    for(let i=0;i<path.length;i++){
      const a=path[Math.max(0,i-1)], b=path[Math.min(path.length-1,i+1)];
      const dx=b.x-a.x,dy=b.y-a.y,L=Math.hypot(dx,dy)||1;
      const nx=-dy/L,ny=dx/L;
      left.push({x:path[i].x+nx*TRACK_HALF,y:path[i].y+ny*TRACK_HALF});
      right.push({x:path[i].x-nx*TRACK_HALF,y:path[i].y-ny*TRACK_HALF});
    }
    for(let i=1;i<path.length;i++){
      walls.push({a:left[i-1],b:left[i],s0:path[i-1].s,s1:path[i].s});
      walls.push({a:right[i-1],b:right[i],s0:path[i-1].s,s1:path[i].s});
    }

    [820,1620,3150,4700].forEach((s,k)=>{
      if(s>totalLength-300)return;
      const q=pointAtS(s), t=tangentAtS(s), nx=-t.y,ny=t.x;
      if(k%2===0){
        pegs.push({x:q.x+nx*38,y:q.y+ny*38,r:22,s});
        pegs.push({x:q.x-nx*42+t.x*58,y:q.y-ny*42+t.y*58,r:22,s:s+58});
      }else{
        pegs.push({x:q.x,y:q.y,r:29,s});
      }
    });

    [2380,3950].forEach(s=>{
      if(s<totalLength-250){
        const q=pointAtS(s);
        funnels.push({x:q.x,y:q.y,r:78,zone:145,s});
      }
    });
  }

  function pointAtS(s){
    s=clamp(s,0,totalLength);
    let lo=1;
    while(lo<path.length && path[lo].s<s)lo++;
    lo=Math.min(lo,path.length-1);
    const a=path[lo-1],b=path[lo],span=b.s-a.s||1,t=(s-a.s)/span;
    return {x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t};
  }
  function tangentAtIndex(i){
    const a=path[Math.max(0,i-1)],b=path[Math.min(path.length-1,i+1)];
    const dx=b.x-a.x,dy=b.y-a.y,L=Math.hypot(dx,dy)||1;
    return {x:dx/L,y:dy/L};
  }
  function tangentAtS(s){
    let i=1;
    while(i<path.length && path[i].s<s)i++;
    return tangentAtIndex(Math.min(path.length-1,i));
  }

  function nearestTrack(m){
    const start=Math.max(0,(m.segIndex||0)-14), end=Math.min(path.length-2,(m.segIndex||0)+22);
    let best={d2:Infinity,index:m.segIndex||0,t:0,x:path[0].x,y:path[0].y,s:0};
    for(let i=start;i<=end;i++){
      const a=path[i],b=path[i+1],abx=b.x-a.x,aby=b.y-a.y,den=abx*abx+aby*aby||1;
      const t=clamp(((m.x-a.x)*abx+(m.y-a.y)*aby)/den,0,1);
      const x=a.x+abx*t,y=a.y+aby*t,dx=m.x-x,dy=m.y-y,d2=dx*dx+dy*dy;
      if(d2<best.d2)best={d2,index:i,t,x,y,s:a.s+(b.s-a.s)*t};
    }
    m.segIndex=best.index;
    m.progress=best.s;
    return best;
  }

  function closestPointOnSegment(px,py,ax,ay,bx,by){
    const abx=bx-ax,aby=by-ay,den=abx*abx+aby*aby||1;
    const t=clamp(((px-ax)*abx+(py-ay)*aby)/den,0,1);
    return {x:ax+abx*t,y:ay+aby*t};
  }

  function collideWall(m,w){
    if(Math.abs(((w.s0+w.s1)/2)-m.progress)>330)return;
    const q=closestPointOnSegment(m.x,m.y,w.a.x,w.a.y,w.b.x,w.b.y);
    let dx=m.x-q.x,dy=m.y-q.y,d=Math.hypot(dx,dy);
    if(d>=R)return;
    if(d<0.001){
      const sx=w.b.x-w.a.x,sy=w.b.y-w.a.y;dx=-sy;dy=sx;d=Math.hypot(dx,dy)||1;
    }
    const nx=dx/d,ny=dy/d,pen=R-d;
    m.x+=nx*(pen+.25);m.y+=ny*(pen+.25);
    const vn=m.vx*nx+m.vy*ny;
    if(vn<0){
      m.vx-=(1+WALL_RESTITUTION)*vn*nx;
      m.vy-=(1+WALL_RESTITUTION)*vn*ny;
      const tx=-ny,ty=nx,vt=m.vx*tx+m.vy*ty;
      m.vx-=vt*(1-TANGENTIAL_FRICTION)*tx;
      m.vy-=vt*(1-TANGENTIAL_FRICTION)*ty;
      m.omega+=vt/R*.16;
    }
  }

  function collidePeg(m,p){
    if(Math.abs(p.s-m.progress)>260)return;
    let dx=m.x-p.x,dy=m.y-p.y,d=Math.hypot(dx,dy),minD=R+p.r;
    if(d>=minD)return;
    if(d<.001){dx=1;dy=0;d=1}
    const nx=dx/d,ny=dy/d,pen=minD-d;
    m.x+=nx*(pen+.2);m.y+=ny*(pen+.2);
    const vn=m.vx*nx+m.vy*ny;
    if(vn<0){
      m.vx-=(1+PEG_RESTITUTION)*vn*nx;
      m.vy-=(1+PEG_RESTITUTION)*vn*ny;
    }
  }

  function collideBalls(a,b){
    if(Math.abs(a.progress-b.progress)>120)return;
    let dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy);
    if(d>=R*2)return;
    if(d<.001){dx=1;dy=0;d=1}
    const nx=dx/d,ny=dy/d,pen=R*2-d;
    a.x-=nx*pen*.5;a.y-=ny*pen*.5;b.x+=nx*pen*.5;b.y+=ny*pen*.5;
    const rvx=b.vx-a.vx,rvy=b.vy-a.vy,rel=rvx*nx+rvy*ny;
    if(rel>=0)return;
    const j=-(1+BALL_RESTITUTION)*rel/2;
    a.vx-=j*nx;a.vy-=j*ny;b.vx+=j*nx;b.vy+=j*ny;
  }

  function applyFunnel(m,dt){
    for(const f of funnels){
      if(Math.abs(m.progress-f.s)>220)continue;
      const dx=f.x-m.x,dy=f.y-m.y,d=Math.hypot(dx,dy)||1;
      if(d<f.zone){
        const strength=GRAVITY*1.75*(1-d/f.zone*.45);
        m.vx+=dx/d*strength*dt;
        m.vy+=dy/d*strength*dt;
        if(d<f.r*.26){
          const t=tangentAtS(f.s+95);
          m.vx+=t.x*GRAVITY*.72*dt;
          m.vy+=t.y*GRAVITY*.72*dt;
        }
      }
    }
  }

  function physicsStep(dt,elapsed){
    const damping=Math.exp(-AIR_DRAG*dt);
    for(const m of marbles){
      if(m.finished)continue;

      const near=nearestTrack(m);
      const t=tangentAtIndex(near.index);

      m.vx+=t.x*GRAVITY*dt;
      m.vy+=t.y*GRAVITY*dt;
      applyFunnel(m,dt);

      m.vx*=damping;m.vy*=damping;
      m.x+=m.vx*dt;m.y+=m.vy*dt;

      nearestTrack(m);
      const speed=Math.hypot(m.vx,m.vy);
      m.omega+=(speed/R-m.omega)*Math.min(1,dt*5);
      m.angle+=m.omega*dt;

      for(let pass=0;pass<2;pass++){
        for(const w of walls)collideWall(m,w);
        for(const p of pegs)collidePeg(m,p);
      }
      nearestTrack(m);
    }

    for(let pass=0;pass<2;pass++){
      for(let i=0;i<marbles.length;i++)for(let j=i+1;j<marbles.length;j++){
        if(!marbles[i].finished&&!marbles[j].finished)collideBalls(marbles[i],marbles[j]);
      }
    }

    for(let i=0;i<marbles.length;i++){
      const m=marbles[i];
      if(m.finished)continue;
      if(m.progress>=totalLength-55){
        m.finished=true;m.finishTime=elapsed;finishOrder.push(i);continue;
      }
      if(m.progress>m.lastProgress+35){
        m.lastProgress=m.progress;m.lastProgressAt=elapsed;
      }else if(elapsed-m.lastProgressAt>STALL_SECONDS && Math.hypot(m.vx,m.vy)<44){
        m.finished=true;m.dnf=true;m.finishTime=elapsed;
      }
      if(elapsed>=RACE_CAP&&!m.finished){m.finished=true;m.dnf=true;m.finishTime=elapsed}
    }

    const active=marbles.filter(m=>!m.finished).sort((a,b)=>b.progress-a.progress);
    active.forEach((m,k)=>m.rank=finishOrder.length+k+1);
    marbles.filter(m=>m.finished&&!m.dnf).forEach((m)=>m.rank=finishOrder.indexOf(marbles.indexOf(m))+1);
    updateHud();
    if(marbles.every(m=>m.finished))endRace();
  }

  function leader(){
    const active=marbles.filter(m=>!m.finished);
    if(active.length)return active.reduce((a,b)=>b.progress>a.progress?b:a);
    return marbles.reduce((a,b)=>b.progress>a.progress?b:a);
  }

  function updateCamera(){
    const lead=leader();
    const t=tangentAtS(lead.progress);
    const targetX=lead.x-t.x*250, targetY=lead.y-t.y*250;
    const targetAngle=Math.atan2(t.y,t.x);
    camX+=(targetX-camX)*.09;camY+=(targetY-camY)*.09;
    let da=((targetAngle-camAngle+Math.PI)%(Math.PI*2))-Math.PI;
    camAngle+=da*.075;
    camS+=(lead.progress-camS)*.10;
  }

  function project(x,y,s){
    const fx=Math.cos(camAngle),fy=Math.sin(camAngle),rx=-fy,ry=fx;
    const dx=x-camX,dy=y-camY;
    const forward=dx*fx+dy*fy,lateral=dx*rx+dy*ry;
    const view=980,u=clamp(forward/view,0,1);
    const horizon=H*.18,bottom=H*1.02;
    const sy=bottom-(bottom-horizon)*Math.pow(u,.78);
    const perspective=1.18-.98*Math.pow(u,.88);
    const sx=W/2+lateral*perspective*(W/760);
    return {x:sx,y:sy,scale:perspective*(W/760),visible:forward>-120&&forward<view+150,forward};
  }

  function drawCourse(){
    ctx.clearRect(0,0,W,H);
    const sky=ctx.createLinearGradient(0,0,0,H);
    sky.addColorStop(0,'#17223e');sky.addColorStop(.52,'#10182d');sky.addColorStop(1,'#070b14');
    ctx.fillStyle=sky;ctx.fillRect(0,0,W,H);

    updateCamera();

    const pts=[];
    for(const p of path){
      if(p.s<camS-260||p.s>camS+1220)continue;
      const pr=project(p.x,p.y,p.s);
      if(pr.visible)pts.push({p,pr});
    }

    if(pts.length>2){
      const left=[],right=[];
      for(const o of pts){
        const t=tangentAtS(o.p.s),nx=-t.y,ny=t.x;
        left.push(project(o.p.x+nx*TRACK_HALF,o.p.y+ny*TRACK_HALF,o.p.s));
        right.push(project(o.p.x-nx*TRACK_HALF,o.p.y-ny*TRACK_HALF,o.p.s));
      }
      ctx.beginPath();ctx.moveTo(left[0].x,left[0].y);
      left.slice(1).forEach(p=>ctx.lineTo(p.x,p.y));
      for(let i=right.length-1;i>=0;i--)ctx.lineTo(right[i].x,right[i].y);
      ctx.closePath();ctx.fillStyle='#283147';ctx.fill();

      for(const edge of [left,right]){
        ctx.beginPath();ctx.moveTo(edge[0].x,edge[0].y);
        edge.slice(1).forEach(p=>ctx.lineTo(p.x,p.y));
        ctx.strokeStyle='#9aa7bf';ctx.lineWidth=7;ctx.lineJoin='round';ctx.stroke();
        ctx.strokeStyle='#4d5a70';ctx.lineWidth=3;ctx.stroke();
      }
    }

    for(const f of funnels){
      if(Math.abs(f.s-camS)>1100)continue;
      const p=project(f.x,f.y,f.s);if(!p.visible)continue;
      const rr=Math.max(7,f.r*p.scale);
      const g=ctx.createRadialGradient(p.x,p.y,rr*.12,p.x,p.y,rr);
      g.addColorStop(0,'#101521');g.addColorStop(.35,'#4a5367');g.addColorStop(1,'#9da8bb');
      ctx.fillStyle=g;ctx.beginPath();ctx.arc(p.x,p.y,rr,0,Math.PI*2);ctx.fill();
      ctx.strokeStyle='#d7deea';ctx.lineWidth=Math.max(2,4*p.scale);ctx.stroke();
      ctx.fillStyle='#080b11';ctx.beginPath();ctx.arc(p.x,p.y,rr*.19,0,Math.PI*2);ctx.fill();
    }

    for(const peg of pegs){
      if(Math.abs(peg.s-camS)>1050)continue;
      const p=project(peg.x,peg.y,peg.s);if(!p.visible)continue;
      const rr=Math.max(3,peg.r*p.scale);
      ctx.fillStyle='#d7a141';ctx.beginPath();ctx.arc(p.x,p.y,rr,0,Math.PI*2);ctx.fill();
      ctx.fillStyle='#fff5';ctx.beginPath();ctx.arc(p.x-rr*.3,p.y-rr*.33,rr*.25,0,Math.PI*2);ctx.fill();
    }

    for(let s=Math.ceil((camS-100)/360)*360;s<camS+1150;s+=360){
      if(s<0||s>totalLength)continue;
      const q=pointAtS(s),t=tangentAtS(s),nx=-t.y,ny=t.x;
      for(const side of [-1,1]){
        const p=project(q.x+nx*TRACK_HALF*side,q.y+ny*TRACK_HALF*side,s);
        if(!p.visible)continue;
        ctx.strokeStyle='#455167';ctx.lineWidth=Math.max(2,6*p.scale);
        ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(p.x,p.y+Math.max(18,65*p.scale));ctx.stroke();
      }
    }

    const fq=pointAtS(totalLength-40),ft=tangentAtS(totalLength-40),fn={x:-ft.y,y:ft.x};
    const l=project(fq.x+fn.x*(TRACK_HALF-8),fq.y+fn.y*(TRACK_HALF-8),totalLength-40);
    const r=project(fq.x-fn.x*(TRACK_HALF-8),fq.y-fn.y*(TRACK_HALF-8),totalLength-40);
    if(l.visible||r.visible){
      for(let i=0;i<12;i++){
        const a=i/12,b=(i+1)/12;
        ctx.strokeStyle=i%2?'#fff':'#111';ctx.lineWidth=Math.max(4,9*((l.scale+r.scale)/2));
        ctx.beginPath();ctx.moveTo(l.x+(r.x-l.x)*a,l.y+(r.y-l.y)*a);ctx.lineTo(l.x+(r.x-l.x)*b,l.y+(r.y-l.y)*b);ctx.stroke();
      }
    }
  }

  function drawMarble(m){
    const p=project(m.x,m.y,m.progress);if(!p.visible)return;
    const r=Math.max(4,R*p.scale*1.3);
    ctx.save();ctx.translate(p.x,p.y);ctx.rotate(m.angle);
    ctx.shadowColor='#000b';ctx.shadowBlur=Math.max(3,r*.45);ctx.shadowOffsetY=Math.max(2,r*.3);
    const g=ctx.createRadialGradient(-r*.35,-r*.4,2,0,0,r);
    g.addColorStop(0,'#fff');g.addColorStop(.18,m.color);g.addColorStop(1,'#111');
    ctx.fillStyle=g;ctx.beginPath();ctx.arc(0,0,r,0,Math.PI*2);ctx.fill();ctx.shadowColor='transparent';
    ctx.strokeStyle='#ffffff90';ctx.lineWidth=Math.max(1.5,r*.13);
    ctx.beginPath();ctx.arc(0,0,r*.6,-1.2,1.15);ctx.stroke();ctx.restore();
  }

  function drawMinimap(){
    mctx.clearRect(0,0,MW,MH);mctx.fillStyle='#090e1b';mctx.fillRect(0,0,MW,MH);
    const pad=10,sx=(MW-pad*2)/WORLD_W,sy=(MH-pad*2)/WORLD_H,scale=Math.min(sx,sy);
    const ox=(MW-WORLD_W*scale)/2,oy=(MH-WORLD_H*scale)/2;
    mctx.beginPath();
    path.forEach((p,i)=>{const x=ox+p.x*scale,y=oy+p.y*scale;i?mctx.lineTo(x,y):mctx.moveTo(x,y)});
    mctx.strokeStyle='#77849e';mctx.lineWidth=Math.max(3,TRACK_HALF*2*scale);mctx.stroke();
    mctx.strokeStyle='#252d43';mctx.lineWidth=Math.max(2,(TRACK_HALF*2-18)*scale);mctx.stroke();

    for(const f of funnels){
      mctx.fillStyle='#b9c3d744';mctx.beginPath();mctx.arc(ox+f.x*scale,oy+f.y*scale,Math.max(3,f.r*scale),0,Math.PI*2);mctx.fill();
    }
    for(const m of marbles){
      mctx.fillStyle=m.color;mctx.beginPath();mctx.arc(ox+m.x*scale,oy+m.y*scale,4,0,Math.PI*2);mctx.fill();
      mctx.strokeStyle='#fff';mctx.lineWidth=1;mctx.stroke();
    }
  }

  function makeHud(){
    hud.innerHTML='';
    COLORS.forEach((m,i)=>{
      const row=document.createElement('div');row.className='row';
      row.innerHTML=`<span class="dot" style="background:${m.color}"></span><span class="name">${m.name}</span><span class="place" id="p${i}">${i+1}</span>`;
      hud.appendChild(row);
    });
  }
  const ordinal=n=>n===1?'1st':n===2?'2nd':n===3?'3rd':'4th';
  function updateHud(){
    marbles.forEach((m,i)=>{
      const el=document.getElementById('p'+i),row=el?.closest('.row');if(!el)return;
      row?.classList.toggle('finished',m.finished&&!m.dnf);row?.classList.toggle('dnf',m.dnf);
      el.classList.toggle('finished',m.finished&&!m.dnf);el.classList.toggle('dnf',m.dnf);
      if(m.dnf)el.textContent='DNF';
      else if(m.finished)el.textContent=`FINISHED • ${ordinal(finishOrder.indexOf(i)+1)}`;
      else el.textContent=ordinal(m.rank);
    });
  }

  function resetMarbles(){
    finishOrder=[];
    const q=pointAtS(45),t=tangentAtS(45),nx=-t.y,ny=t.x;
    marbles=COLORS.map((m,i)=>({
      ...m,x:q.x+nx*(i-1.5)*38,y:q.y+ny*(i-1.5)*38,vx:0,vy:0,
      angle:rnd(0,Math.PI*2),omega:0,finished:false,dnf:false,finishTime:null,rank:i+1,
      progress:45,segIndex:1,lastProgress:45,lastProgressAt:0
    }));
    const lead=marbles[0];camX=lead.x-t.x*250;camY=lead.y-t.y*250;camAngle=Math.atan2(t.y,t.x);camS=45;
    timerEl.textContent='00.0';updateHud();draw();
  }

  function resize(){
    const r=stage.getBoundingClientRect();W=Math.max(320,Math.floor(r.width));H=Math.max(360,Math.floor(r.height));
    DPR=Math.min(devicePixelRatio||1,2);game.width=W*DPR;game.height=H*DPR;ctx.setTransform(DPR,0,0,DPR,0,0);
    const mr=map.getBoundingClientRect();MW=Math.max(80,Math.floor(mr.width));MH=Math.max(100,Math.floor(mr.height));
    MDPR=Math.min(devicePixelRatio||1,2);map.width=MW*MDPR;map.height=MH*MDPR;mctx.setTransform(MDPR,0,0,MDPR,0,0);draw();
  }

  function draw(){if(!marbles.length)return;drawCourse();[...marbles].sort((a,b)=>a.progress-b.progress).forEach(drawMarble);drawMinimap()}

  function frame(now){
    if(state!=='racing')return;
    const elapsed=(now-startTime)/1000;timerEl.textContent=elapsed.toFixed(1).padStart(4,'0');
    const dt=Math.min(.035,(now-lastTime)/1000||.016);lastTime=now;
    const sub=5,h=dt/sub;for(let i=0;i<sub;i++)physicsStep(h,elapsed);
    draw();if(state==='racing')raf=requestAnimationFrame(frame);
  }

  function showStartCard(){
    overlay.style.display='flex';
    overlay.innerHTML='<div class="card"><h2>Ready to Race?</h2><p>Four marbles are released together and gravity does the rest.</p><button id="startBtn">START RACE</button></div>';
    document.getElementById('startBtn').addEventListener('click',startRace);
  }
  function resetRace(){
    raceToken++;cancelAnimationFrame(raf);state='idle';resetMarbles();showStartCard();
  }
  async function startRace(){
    if(state==='countdown'||state==='racing')return;
    const token=++raceToken;resetMarbles();state='countdown';overlay.style.display='flex';
    for(let n=3;n>=1;n--){if(token!==raceToken)return;overlay.innerHTML=`<div class="countdown">${n}</div>`;await new Promise(r=>setTimeout(r,650))}
    if(token!==raceToken)return;overlay.innerHTML='<div class="countdown">GO!</div>';await new Promise(r=>setTimeout(r,380));
    if(token!==raceToken)return;overlay.style.display='none';state='racing';startTime=performance.now();lastTime=startTime;
    marbles.forEach(m=>m.lastProgressAt=0);raf=requestAnimationFrame(frame);
  }
  function endRace(){
    state='done';cancelAnimationFrame(raf);draw();
    const winnerIndex=finishOrder[0],winner=winnerIndex!==undefined?marbles[winnerIndex]:null;
    const finalTime=Math.max(...marbles.map(m=>m.finishTime||0)),dnfs=marbles.filter(m=>m.dnf).length;
    timerEl.textContent=finalTime.toFixed(1);overlay.style.display='flex';
    overlay.innerHTML=`<div class="card"><h2>${winner?`<span class="winner">${winner.name}</span> Wins!`:'Race Over'}</h2><p>${winner?`Winning time: <strong>${winner.finishTime.toFixed(1)}s</strong><br>`:''}${dnfs?`${dnfs} marble${dnfs===1?'':'s'} recorded a DNF.`:'All four marbles finished.'}</p><button id="againBtn">RACE AGAIN</button></div>`;
    document.getElementById('againBtn').addEventListener('click',startRace);
  }

  document.getElementById('resetBtn').addEventListener('click',resetRace);
  addEventListener('resize',resize);
  buildCourse();makeHud();resetMarbles();showStartCard();resize();
})();