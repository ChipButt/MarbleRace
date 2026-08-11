(() => {
  const game=document.getElementById('game'),ctx=game.getContext('2d');
  const map=document.getElementById('map'),mctx=map.getContext('2d');
  const stage=document.getElementById('stage'),overlay=document.getElementById('overlay');
  const timerEl=document.getElementById('timer'),hud=document.getElementById('hud');

  const COLORS=[
    {name:'Ruby',color:'#ff3b5c'},
    {name:'Azure',color:'#3ea0ff'},
    {name:'Lime',color:'#70e35a'},
    {name:'Gold',color:'#ffd23f'}
  ];

  const TRACK_HALF=92,R=17;
  const GRAVITY=150,AIR_DRAG=.18;
  const WALL_RESTITUTION=.70,BALL_RESTITUTION=.91,PEG_RESTITUTION=.93;
  const STALL_SECONDS=10;

  const COURSES=[
    {name:'Rolling Hills',blurb:'Long flowing descent • 2 funnels • Peg fields',
      points:[[220,150],[260,520],[430,920],[760,1160],[1110,1090],[1330,820],[1280,470],[1050,230],[1370,120],[1760,270],[1980,610],[1890,980],[1560,1240],[1190,1370],[820,1260],[520,1040],[310,1270],[430,1620],[810,1780],[1260,1740],[1650,1550],[2070,1650],[2360,1900]],
      pegs:[.12,.29,.47,.72,.88],funnels:[.38,.64]},
    {name:'Hairpin Valley',blurb:'Long natural switchbacks • 3 funnels',
      points:[[200,140],[220,620],[390,1060],[720,1280],[1110,1240],[1380,1020],[1420,690],[1210,430],[850,350],[720,110],[1130,90],[1510,250],[1730,590],[1680,940],[1420,1180],[1090,1360],[720,1410],[420,1240],[260,1510],[410,1810],[800,1940],[1220,1870],[1560,1640],[1900,1740],[2210,1980],[2460,1760]],
      pegs:[.16,.34,.58,.79],funnels:[.27,.51,.73]},
    {name:'Twister Run',blurb:'Long S-curves • Dense traffic • 3 funnels',
      points:[[220,150],[410,430],[760,580],[1090,470],[1270,190],[1580,180],[1850,390],[1910,720],[1700,990],[1360,1110],[980,1040],[690,850],[420,1050],[390,1390],[650,1620],[1010,1690],[1330,1530],[1610,1320],[1920,1390],[2200,1630],[2350,1940],[2140,2180],[1770,2240],[1420,2100],[1100,2240],[760,2170],[500,1950]],
      pegs:[.10,.22,.39,.55,.69,.86],funnels:[.31,.60,.77]},
    {name:'Grand Descent',blurb:'Fast wide sweepers • 2 large funnels',
      points:[[180,150],[330,430],[620,650],[960,720],[1290,610],[1580,360],[1890,390],[2100,650],[2050,980],[1770,1230],[1410,1370],[1040,1340],[700,1160],[390,1260],[260,1580],[460,1850],[800,2000],[1190,1980],[1510,1810],[1830,1880],[2140,2090],[2420,1980],[2580,1710],[2500,1430],[2260,1260],[2460,1040],[2700,1170]],
      pegs:[.18,.42,.70,.88],funnels:[.34,.66],funnelSize:1.18},
    {name:'Chaos Circuit',blurb:'Longest technical course • 4 funnels • Heavy traffic',
      points:[[220,150],[260,430],[520,620],[850,540],[1010,270],[1320,190],[1590,370],[1570,690],[1300,860],[970,900],[710,1120],[390,1080],[260,1360],[470,1600],[820,1650],[1110,1480],[1370,1290],[1670,1410],[1900,1690],[2210,1760],[2450,1560],[2500,1250],[2260,1060],[1990,1160],[1770,980],[1940,720],[2240,670],[2500,850],[2710,1110],[2820,1430],[2690,1740],[2380,1970],[2030,2070],[1650,2010],[1320,2180],[960,2240],[620,2100]],
      pegs:[.09,.19,.33,.46,.61,.75,.90],funnels:[.25,.43,.68,.82]}
  ];

  let W=0,H=0,DPR=1,MW=0,MH=0,MDPR=1;
  let path=[],totalLength=0,walls=[],pegs=[],funnels=[],mesh={left:[],right:[]};
  let bounds={minX:0,minY:0,maxX:1,maxY:1};
  let marbles=[],finishOrder=[],selectedCourse=0;
  let state='idle',startTime=0,lastTime=0,raf=0,raceToken=0;
  let camX=0,camY=0,camAngle=0,camS=0,camHeight=250;
  let audioCtx=null,lastClink=new Map();

  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const rnd=(a,b)=>a+Math.random()*(b-a);

  function catmull(p0,p1,p2,p3,t){
    const t2=t*t,t3=t2*t;
    return {
      x:.5*((2*p1[0])+(-p0[0]+p2[0])*t+(2*p0[0]-5*p1[0]+4*p2[0]-p3[0])*t2+(-p0[0]+3*p1[0]-3*p2[0]+p3[0])*t3),
      y:.5*((2*p1[1])+(-p0[1]+p2[1])*t+(2*p0[1]-5*p1[1]+4*p2[1]-p3[1])*t2+(-p0[1]+3*p1[1]-3*p2[1]+p3[1])*t3)
    };
  }

  function buildPath(control){
    const raw=[];
    for(let i=0;i<control.length-1;i++){
      const p0=control[Math.max(0,i-1)],p1=control[i],p2=control[i+1],p3=control[Math.min(control.length-1,i+2)];
      const n=Math.max(12,Math.ceil(Math.hypot(p2[0]-p1[0],p2[1]-p1[1])/22));
      for(let j=0;j<n;j++)raw.push(catmull(p0,p1,p2,p3,j/n));
    }
    raw.push({x:control.at(-1)[0],y:control.at(-1)[1]});
    path=[];let s=0;
    raw.forEach((p,i)=>{if(i)s+=Math.hypot(p.x-raw[i-1].x,p.y-raw[i-1].y);path.push({x:p.x,y:p.y,s})});
    totalLength=s;
  }

  function pointAtS(s){
    s=clamp(s,0,totalLength);
    let i=1;while(i<path.length&&path[i].s<s)i++;
    i=Math.min(i,path.length-1);
    const a=path[i-1],b=path[i],span=b.s-a.s||1,t=(s-a.s)/span;
    return{x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t};
  }

  function tangentAtS(s,span=80){
    const a=pointAtS(clamp(s-span,0,totalLength)),b=pointAtS(clamp(s+span,0,totalLength));
    const dx=b.x-a.x,dy=b.y-a.y,L=Math.hypot(dx,dy)||1;
    return{x:dx/L,y:dy/L};
  }

  function indexAtS(s){
    let i=1;while(i<path.length&&path[i].s<s)i++;
    return Math.min(path.length-1,i);
  }

  function buildCourse(){
    const c=COURSES[selectedCourse];
    buildPath(c.points);
    walls=[];pegs=[];funnels=[];

    const left=[],right=[];
    for(let i=0;i<path.length;i++){
      const t=tangentAtS(path[i].s,48),nx=-t.y,ny=t.x;
      left.push({x:path[i].x+nx*TRACK_HALF,y:path[i].y+ny*TRACK_HALF,s:path[i].s});
      right.push({x:path[i].x-nx*TRACK_HALF,y:path[i].y-ny*TRACK_HALF,s:path[i].s});
    }
    mesh={left,right};
    for(let i=1;i<path.length;i++){
      walls.push({a:left[i-1],b:left[i],s0:path[i-1].s,s1:path[i].s});
      walls.push({a:right[i-1],b:right[i],s0:path[i-1].s,s1:path[i].s});
    }

    c.pegs.forEach((frac,k)=>{
      const s=totalLength*frac,q=pointAtS(s),t=tangentAtS(s,55),nx=-t.y,ny=t.x;
      if(k%2===0){
        const side=k%4===0?1:-1;
        pegs.push({x:q.x+nx*TRACK_HALF*side,y:q.y+ny*TRACK_HALF*side,r:9,s});
        pegs.push({x:q.x-nx*25*side+t.x*80,y:q.y-ny*25*side+t.y*80,r:10,s:s+80});
      }else pegs.push({x:q.x,y:q.y,r:12,s});
    });

    c.funnels.forEach((frac,i)=>{
      const s=totalLength*frac;
      const scale=c.funnelSize||1;
      const outerR=158*scale,holeR=30*scale;
      const entryS=clamp(s-125,80,totalLength-400);
      const exitS=clamp(s+190,entryS+220,totalLength-100);
      const q=pointAtS(entryS),t=tangentAtS(entryS,65),nx=-t.y,ny=t.x;
      const side=i%2===0?1:-1;

      // The course centreline touches the bowl rim tangentially. This is a
      // mandatory full-width mouth, not an optional circle beside the track.
      const bowlX=q.x-nx*side*(outerR-R-4);
      const bowlY=q.y-ny*side*(outerR-R-4);
      const baseAngle=Math.atan2(q.y-bowlY,q.x-bowlX);

      funnels.push({
        id:i,s,entryS,exitS,x:bowlX,y:bowlY,outerR,holeR,side,baseAngle
      });
    });

    const xs=path.map(p=>p.x),ys=path.map(p=>p.y);
    funnels.forEach(f=>{xs.push(f.x-f.outerR,f.x+f.outerR);ys.push(f.y-f.outerR,f.y+f.outerR)});
    bounds={minX:Math.min(...xs)-160,maxX:Math.max(...xs)+160,minY:Math.min(...ys)-160,maxY:Math.max(...ys)+160};
  }

  function nearestTrack(m){
    const around=indexAtS(m.progress||0),start=Math.max(0,around-34),end=Math.min(path.length-2,around+42);
    let best={d2:Infinity,s:m.progress||0,index:around,x:path[around].x,y:path[around].y,lateral:0};
    for(let i=start;i<=end;i++){
      const a=path[i],b=path[i+1],abx=b.x-a.x,aby=b.y-a.y,den=abx*abx+aby*aby||1;
      const tt=clamp(((m.x-a.x)*abx+(m.y-a.y)*aby)/den,0,1);
      const x=a.x+abx*tt,y=a.y+aby*tt,dx=m.x-x,dy=m.y-y,d2=dx*dx+dy*dy;
      if(d2<best.d2){
        const L=Math.hypot(abx,aby)||1,nx=-aby/L,ny=abx/L;
        best={d2,index:i,x,y,s:a.s+(b.s-a.s)*tt,lateral:dx*nx+dy*ny};
      }
    }
    m.progress=best.s;
    return best;
  }

  function closestPoint(px,py,a,b){
    const abx=b.x-a.x,aby=b.y-a.y,den=abx*abx+aby*aby||1;
    const t=clamp(((px-a.x)*abx+(py-a.y)*aby)/den,0,1);
    return{x:a.x+abx*t,y:a.y+aby*t};
  }

  function inFunnelGap(s){
    return funnels.some(f=>s>f.entryS-15&&s<f.exitS+15);
  }

  function collideWall(m,w){
    if(m.funnel||inFunnelGap(m.progress)||Math.abs((w.s0+w.s1)*.5-m.progress)>300)return;
    const q=closestPoint(m.x,m.y,w.a,w.b);
    let dx=m.x-q.x,dy=m.y-q.y,d=Math.hypot(dx,dy);
    if(d>=R)return;
    if(d<.001){const sx=w.b.x-w.a.x,sy=w.b.y-w.a.y;dx=-sy;dy=sx;d=Math.hypot(dx,dy)||1}
    const nx=dx/d,ny=dy/d,pen=R-d;
    m.x+=nx*(pen+.2);m.y+=ny*(pen+.2);
    const vn=m.vx*nx+m.vy*ny;
    if(vn<0){m.vx-=(1+WALL_RESTITUTION)*vn*nx;m.vy-=(1+WALL_RESTITUTION)*vn*ny}
  }

  function collidePeg(m,p){
    if(m.funnel||inFunnelGap(m.progress)||Math.abs(p.s-m.progress)>240)return;
    let dx=m.x-p.x,dy=m.y-p.y,d=Math.hypot(dx,dy),min=R+p.r;
    if(d>=min)return;
    if(d<.001){dx=1;dy=0;d=1}
    const nx=dx/d,ny=dy/d,pen=min-d;
    m.x+=nx*(pen+.2);m.y+=ny*(pen+.2);
    const vn=m.vx*nx+m.vy*ny;
    if(vn<0){m.vx-=(1+PEG_RESTITUTION)*vn*nx;m.vy-=(1+PEG_RESTITUTION)*vn*ny}
  }

  function ensureAudio(){
    if(!audioCtx)audioCtx=new(window.AudioContext||window.webkitAudioContext)();
    if(audioCtx.state==='suspended')audioCtx.resume();
  }

  function playClink(impact,key){
    if(!audioCtx)return;
    const now=audioCtx.currentTime,last=lastClink.get(key)||-1;
    if(now-last<.055)return;
    lastClink.set(key,now);
    const g=audioCtx.createGain(),a=audioCtx.createOscillator(),b=audioCtx.createOscillator();
    g.gain.setValueAtTime(clamp(impact/420,.015,.085),now);
    g.gain.exponentialRampToValueAtTime(.0001,now+.055);
    a.type=b.type='sine';
    a.frequency.setValueAtTime(1450+rnd(-120,120),now);
    b.frequency.setValueAtTime(2350+rnd(-180,180),now);
    a.connect(g);b.connect(g);g.connect(audioCtx.destination);
    a.start(now);b.start(now);a.stop(now+.06);b.stop(now+.055);
  }

  function collideBalls(a,b){
    const sameFunnel=a.funnel&&b.funnel&&a.funnel.id===b.funnel.id;
    if((a.funnel||b.funnel)&&!sameFunnel)return;
    if(!sameFunnel&&Math.abs(a.progress-b.progress)>135)return;
    let dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy);
    if(d>=R*2)return;
    if(d<.001){dx=1;dy=0;d=1}
    const nx=dx/d,ny=dy/d,pen=R*2-d;
    a.x-=nx*pen*.5;a.y-=ny*pen*.5;b.x+=nx*pen*.5;b.y+=ny*pen*.5;
    const rvx=b.vx-a.vx,rvy=b.vy-a.vy,rel=rvx*nx+rvy*ny;
    if(rel>=0)return;
    const impact=-rel,j=-(1+BALL_RESTITUTION)*rel*.5;
    a.vx-=j*nx;a.vy-=j*ny;b.vx+=j*nx;b.vy+=j*ny;
    playClink(impact,[a.id,b.id].sort().join('-'));
  }

  function enterFunnel(m,f,near){
    const lane=clamp(near.lateral/(TRACK_HALF-R),-1,1);

    // Different lateral positions enter at genuinely different places on the rim.
    const angle=f.baseAngle+lane*.26*f.side;
    const rim=f.outerR-R-3;
    m.x=f.x+Math.cos(angle)*rim;
    m.y=f.y+Math.sin(angle)*rim;

    // Keep the marble's actual incoming speed/direction. The tangent mouth
    // changes only the minimum needed to prevent a head-on drain shot.
    const speed=Math.max(120,Math.hypot(m.vx,m.vy));
    const rx=Math.cos(angle),ry=Math.sin(angle);
    const tx=-ry*f.side,ty=rx*f.side;
    const tangential=m.vx*tx+m.vy*ty;
    const radial=m.vx*rx+m.vy*ry;

    const tanSpeed=(Math.abs(tangential)>.35*speed?tangential:Math.sign(tangential||1)*speed*.72);
    const inward=Math.min(radial,-speed*(.10+.13*Math.abs(lane)));

    m.vx=tx*tanSpeed+rx*inward;
    m.vy=ty*tanSpeed+ry*inward;
    m.funnel={id:f.id,f};
    m.progress=f.entryS;
  }

  function checkFunnelEntrance(m,previousProgress,near){
    if(m.funnel)return;
    for(const f of funnels){
      if(m.usedFunnels.has(f.id))continue;
      if(previousProgress<f.entryS&&m.progress>=f.entryS){
        enterFunnel(m,f,near);
        return;
      }
    }
  }

  function updateFunnel(m,dt){
    const f=m.funnel.f;
    let dx=m.x-f.x,dy=m.y-f.y,d=Math.hypot(dx,dy)||1;
    let rx=dx/d,ry=dy/d;

    // Deep bowl: strong radial gravity, with an even steeper inner cone.
    const depthFactor=1+2.2*Math.pow(clamp(1-d/f.outerR,0,1),2);
    const omega2=18.5*depthFactor;
    m.vx-=dx*omega2*dt;
    m.vy-=dy*omega2*dt;

    // Light rolling loss shrinks the orbit without prescribing a spiral.
    const drag=Math.exp(-.095*dt);
    m.vx*=drag;m.vy*=drag;
    m.x+=m.vx*dt;m.y+=m.vy*dt;

    dx=m.x-f.x;dy=m.y-f.y;d=Math.hypot(dx,dy)||1;rx=dx/d;ry=dy/d;

    // Outer lip is a real collision boundary.
    const rim=f.outerR-R;
    if(d>rim){
      const pen=d-rim;
      m.x-=rx*pen;m.y-=ry*pen;
      const vn=m.vx*rx+m.vy*ry;
      if(vn>0){m.vx-=1.78*vn*rx;m.vy-=1.78*vn*ry}
    }

    const radialFraction=clamp(1-d/f.outerR,0,1);
    m.progress=f.entryS+radialFraction*(f.exitS-f.entryS)*.94;

    // Physical drain. If the sphere overlaps it, it falls.
    if(d<f.holeR+R*.30){
      const q=pointAtS(f.exitS),t=tangentAtS(f.exitS,60);
      const speed=Math.max(185,Math.hypot(m.vx,m.vy)*.88);
      m.x=q.x;m.y=q.y;m.vx=t.x*speed;m.vy=t.y*speed;
      m.progress=f.exitS;
      m.usedFunnels.add(f.id);
      m.funnel=null;
    }
  }

  function physicsStep(dt,elapsed){
    const drag=Math.exp(-AIR_DRAG*dt);
    for(const m of marbles){
      if(m.finished)continue;
      if(m.funnel){
        updateFunnel(m,dt);
      }else{
        const previous=m.progress;
        const near=nearestTrack(m);
        const t=tangentAtS(near.s,45);
        m.vx+=t.x*GRAVITY*dt;m.vy+=t.y*GRAVITY*dt;
        m.vx*=drag;m.vy*=drag;
        m.x+=m.vx*dt;m.y+=m.vy*dt;
        const after=nearestTrack(m);
        checkFunnelEntrance(m,previous,after);
        if(!m.funnel){
          for(let pass=0;pass<2;pass++){
            for(const w of walls)collideWall(m,w);
            for(const p of pegs)collidePeg(m,p);
          }
          nearestTrack(m);
        }
      }
      const speed=Math.hypot(m.vx,m.vy);
      m.omega+=(speed/R-m.omega)*Math.min(1,dt*5);
      m.angle+=m.omega*dt;
    }

    for(let pass=0;pass<3;pass++)
      for(let i=0;i<marbles.length;i++)
        for(let j=i+1;j<marbles.length;j++)
          if(!marbles[i].finished&&!marbles[j].finished)collideBalls(marbles[i],marbles[j]);

    for(let i=0;i<marbles.length;i++){
      const m=marbles[i];if(m.finished)continue;
      if(m.progress>=totalLength-58){m.finished=true;m.finishTime=elapsed;finishOrder.push(i);continue}
      if(m.progress>m.lastProgress+34){m.lastProgress=m.progress;m.lastProgressAt=elapsed}
      else if(elapsed-m.lastProgressAt>STALL_SECONDS&&Math.hypot(m.vx,m.vy)<38&&!m.funnel){
        m.finished=true;m.dnf=true;m.finishTime=elapsed;
      }
    }

    const active=marbles.filter(m=>!m.finished).sort((a,b)=>b.progress-a.progress);
    active.forEach((m,k)=>m.rank=finishOrder.length+k+1);
    updateHud();
    if(marbles.every(m=>m.finished))endRace();
  }

  function updateCamera(){
    const active=marbles.filter(m=>!m.finished);if(!active.length)return;
    const lead=active.reduce((a,b)=>b.progress>a.progress?b:a);
    const relevant=active.filter(m=>lead.progress-m.progress<620);

    let wx=0,wy=0,wt=0;
    for(const m of relevant){
      const gap=lead.progress-m.progress,w=m.id===lead.id?3.2:Math.max(.45,1.5-gap/600);
      wx+=m.x*w;wy+=m.y*w;wt+=w;
    }
    const focusX=wx/wt,focusY=wy/wt;
    let targetX,targetY,targetAngle,targetHeight;

    if(lead.funnel){
      const f=lead.funnel.f,t=tangentAtS(f.entryS,100);
      targetAngle=Math.atan2(t.y,t.x);targetX=f.x-t.x*360;targetY=f.y-t.y*360;targetHeight=340;
    }else{
      const t=tangentAtS(lead.progress,100);
      const spread=Math.max(...relevant.map(m=>Math.hypot(m.x-focusX,m.y-focusY)),0);
      targetAngle=Math.atan2(t.y,t.x);
      targetX=focusX-t.x*(295+clamp(spread*.35,0,110));
      targetY=focusY-t.y*(295+clamp(spread*.35,0,110));
      targetHeight=245+clamp(spread*.28,0,105);
    }

    camX+=(targetX-camX)*.06;camY+=(targetY-camY)*.06;camHeight+=(targetHeight-camHeight)*.05;
    let da=((targetAngle-camAngle+Math.PI*3)%(Math.PI*2))-Math.PI;
    const maxTurn=Math.abs(da)>.7?.06:Math.abs(da)>.3?.045:.028;
    camAngle+=clamp(da,-maxTurn,maxTurn);
    camS+=(lead.progress-camS)*.065;
  }

  function project(x,y){
    const fx=Math.cos(camAngle),fy=Math.sin(camAngle),rx=-fy,ry=fx;
    const dx=x-camX,dy=y-camY,forward=dx*fx+dy*fy,lateral=dx*rx+dy*ry;
    const depth=Math.max(24,forward+150),focal=H*.82,scale=focal/depth;
    return{x:W*.5+lateral*scale,y:H*.18+camHeight*scale,scale,
      visible:forward>-140&&forward<1500,forward};
  }

  function drawTrackSegment(s0,s1){
    const idx=[];
    for(let i=0;i<path.length;i++)if(path[i].s>=s0&&path[i].s<=s1)idx.push(i);
    if(idx.length<2)return;
    const left=idx.map(i=>project(mesh.left[i].x,mesh.left[i].y));
    const right=idx.map(i=>project(mesh.right[i].x,mesh.right[i].y));

    ctx.beginPath();ctx.moveTo(left[0].x,left[0].y);left.slice(1).forEach(p=>ctx.lineTo(p.x,p.y));
    for(let i=right.length-1;i>=0;i--)ctx.lineTo(right[i].x,right[i].y);
    ctx.closePath();
    const g=ctx.createLinearGradient(0,H*.12,0,H);g.addColorStop(0,'#333d55');g.addColorStop(1,'#20283a');
    ctx.fillStyle=g;ctx.fill();

    [left,right].forEach(edge=>{
      ctx.beginPath();ctx.moveTo(edge[0].x,edge[0].y);edge.slice(1).forEach(p=>ctx.lineTo(p.x,p.y));
      ctx.strokeStyle='#aab6cb';ctx.lineWidth=8;ctx.lineJoin='round';ctx.lineCap='round';ctx.stroke();
      ctx.strokeStyle='#526078';ctx.lineWidth=3;ctx.stroke();
    });
  }

  function projectedCirclePath(cx,cy,r,steps=64){
    ctx.beginPath();
    for(let i=0;i<=steps;i++){
      const a=i/steps*Math.PI*2;
      const p=project(cx+Math.cos(a)*r,cy+Math.sin(a)*r);
      if(i===0)ctx.moveTo(p.x,p.y);else ctx.lineTo(p.x,p.y);
    }
    ctx.closePath();
  }

  function drawFunnel(f){
    const centre=project(f.x,f.y);
    if(!centre.visible)return;

    // The funnel is built from real world-space circular rings and every point
    // goes through the same perspective projection as the track. It therefore
    // appears as the correct perspective ellipse rather than a face-on circle.
    const rings=[
      [1.00,'#c4cdda'],
      [.88,'#aab5c6'],
      [.76,'#909bad'],
      [.64,'#758194'],
      [.52,'#5b6679'],
      [.40,'#424c5e'],
      [.30,'#303847'],
      [.22,'#232936']
    ];

    for(const [ratio,colour] of rings){
      projectedCirclePath(f.x,f.y,f.outerR*ratio);
      ctx.fillStyle=colour;
      ctx.fill();
    }

    // Subtle projected rim.
    projectedCirclePath(f.x,f.y,f.outerR);
    ctx.strokeStyle='#e2e8f1';
    ctx.lineWidth=3;
    ctx.stroke();

    // Drain uses the same world-space projection.
    projectedCirclePath(f.x,f.y,f.holeR);
    ctx.fillStyle='#05070b';
    ctx.fill();
    ctx.strokeStyle='#151a24';
    ctx.lineWidth=2;
    ctx.stroke();
  }

  function drawFinish(){
    const s=totalLength-55,q=pointAtS(s),t=tangentAtS(s,50),nx=-t.y,ny=t.x;
    const a=project(q.x+nx*(TRACK_HALF-7),q.y+ny*(TRACK_HALF-7));
    const b=project(q.x-nx*(TRACK_HALF-7),q.y-ny*(TRACK_HALF-7));
    for(let i=0;i<12;i++){
      const u=i/12,v=(i+1)/12;
      ctx.strokeStyle=i%2?'#fff':'#111';ctx.lineWidth=Math.max(5,12*(a.scale+b.scale)*.5);
      ctx.beginPath();ctx.moveTo(a.x+(b.x-a.x)*u,a.y+(b.y-a.y)*u);ctx.lineTo(a.x+(b.x-a.x)*v,a.y+(b.y-a.y)*v);ctx.stroke();
    }
  }

  function drawCourse(){
    ctx.clearRect(0,0,W,H);
    const sky=ctx.createLinearGradient(0,0,0,H);sky.addColorStop(0,'#17223e');sky.addColorStop(.55,'#10182d');sky.addColorStop(1,'#070b14');
    ctx.fillStyle=sky;ctx.fillRect(0,0,W,H);
    updateCamera();

    // Draw every nearby track section. Funnels cover only their replaced middle
    // section; inlet/outlet track is redrawn above them.
    drawTrackSegment(Math.max(0,camS-500),Math.min(totalLength,camS+1550));

    funnels.forEach(f=>{if(Math.abs(f.s-camS)<1350)drawFunnel(f)});

    pegs.forEach(p=>{
      if(inFunnelGap(p.s)||Math.abs(p.s-camS)>1200)return;
      const q=project(p.x,p.y);if(!q.visible)return;
      const rr=Math.max(3,p.r*q.scale);
      ctx.fillStyle='#d7a141';ctx.beginPath();ctx.arc(q.x,q.y,rr,0,Math.PI*2);ctx.fill();
      ctx.fillStyle='#fff5';ctx.beginPath();ctx.arc(q.x-rr*.3,q.y-rr*.33,rr*.25,0,Math.PI*2);ctx.fill();
    });

    drawFinish();
  }

  function drawMarble(m){
    const p=project(m.x,m.y);if(!p.visible)return;
    const r=Math.max(4,R*p.scale*1.3);
    ctx.save();ctx.translate(p.x,p.y);ctx.rotate(m.angle);
    ctx.shadowColor='#000b';ctx.shadowBlur=Math.max(3,r*.45);ctx.shadowOffsetY=Math.max(2,r*.3);
    const g=ctx.createRadialGradient(-r*.35,-r*.4,2,0,0,r);
    g.addColorStop(0,'#fff');g.addColorStop(.18,m.color);g.addColorStop(1,'#111');
    ctx.fillStyle=g;ctx.beginPath();ctx.arc(0,0,r,0,Math.PI*2);ctx.fill();ctx.shadowColor='transparent';
    ctx.strokeStyle='#ffffff90';ctx.lineWidth=Math.max(1.5,r*.13);ctx.beginPath();ctx.arc(0,0,r*.6,-1.2,1.15);ctx.stroke();
    ctx.restore();
  }

  function drawMinimap(){
    mctx.clearRect(0,0,MW,MH);mctx.fillStyle='#090e1b';mctx.fillRect(0,0,MW,MH);
    const bw=bounds.maxX-bounds.minX,bh=bounds.maxY-bounds.minY,sc=Math.min((MW-18)/bw,(MH-18)/bh);
    const ox=(MW-bw*sc)/2-bounds.minX*sc,oy=(MH-bh*sc)/2-bounds.minY*sc;
    mctx.beginPath();path.forEach((p,i)=>i?mctx.lineTo(ox+p.x*sc,oy+p.y*sc):mctx.moveTo(ox+p.x*sc,oy+p.y*sc));
    mctx.strokeStyle='#77849e';mctx.lineWidth=Math.max(3,TRACK_HALF*2*sc);mctx.stroke();
    mctx.strokeStyle='#252d43';mctx.lineWidth=Math.max(2,(TRACK_HALF*2-18)*sc);mctx.stroke();
    funnels.forEach(f=>{mctx.fillStyle='#bbc6da66';mctx.beginPath();mctx.arc(ox+f.x*sc,oy+f.y*sc,Math.max(3,f.outerR*sc),0,Math.PI*2);mctx.fill()});
    const fs=totalLength-55,fq=pointAtS(fs),ft=tangentAtS(fs,50),nx=-ft.y,ny=ft.x;
    mctx.strokeStyle='#fff';mctx.lineWidth=2;mctx.beginPath();
    mctx.moveTo(ox+(fq.x+nx*TRACK_HALF)*sc,oy+(fq.y+ny*TRACK_HALF)*sc);
    mctx.lineTo(ox+(fq.x-nx*TRACK_HALF)*sc,oy+(fq.y-ny*TRACK_HALF)*sc);mctx.stroke();
    marbles.forEach(m=>{mctx.fillStyle=m.color;mctx.beginPath();mctx.arc(ox+m.x*sc,oy+m.y*sc,4,0,Math.PI*2);mctx.fill();mctx.strokeStyle='#fff';mctx.lineWidth=1;mctx.stroke()});
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
      if(m.dnf)el.textContent='DNF';
      else if(m.finished)el.textContent=`FINISHED • ${ordinal(finishOrder.indexOf(i)+1)}`;
      else el.textContent=ordinal(m.rank);
    });
  }

  function resetMarbles(){
    finishOrder=[];lastClink.clear();
    const q=pointAtS(45),t=tangentAtS(45,50),nx=-t.y,ny=t.x;
    marbles=COLORS.map((m,i)=>({...m,id:i,x:q.x+nx*(i-1.5)*38,y:q.y+ny*(i-1.5)*38,vx:0,vy:0,
      angle:rnd(0,Math.PI*2),omega:0,finished:false,dnf:false,finishTime:null,rank:i+1,progress:45,
      lastProgress:45,lastProgressAt:0,usedFunnels:new Set(),funnel:null}));
    camX=q.x-t.x*300;camY=q.y-t.y*300;camAngle=Math.atan2(t.y,t.x);camS=45;camHeight=250;
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
    const sub=7,h=dt/sub;for(let i=0;i<sub;i++)physicsStep(h,elapsed);
    draw();if(state==='racing')raf=requestAnimationFrame(frame);
  }

  function showStartCard(){
    overlay.style.display='flex';
    overlay.innerHTML=`<div class="card courseCard"><h2>Choose a Course</h2><div class="courseGrid">
      ${COURSES.map((c,i)=>`<button class="courseChoice ${i===selectedCourse?'selected':''}" data-course="${i}"><strong>${c.name}</strong><span>${c.blurb}</span></button>`).join('')}
      </div><button id="startBtn">START RACE</button></div>`;
    overlay.querySelectorAll('.courseChoice').forEach(b=>b.addEventListener('click',()=>{selectedCourse=Number(b.dataset.course);buildCourse();resetMarbles();showStartCard()}));
    document.getElementById('startBtn').addEventListener('click',()=>{ensureAudio();startRace()});
  }

  function resetRace(){raceToken++;cancelAnimationFrame(raf);state='idle';buildCourse();resetMarbles();showStartCard()}

  async function startRace(){
    if(state==='countdown'||state==='racing')return;
    ensureAudio();const token=++raceToken;resetMarbles();state='countdown';overlay.style.display='flex';
    for(let n=3;n>=1;n--){if(token!==raceToken)return;overlay.innerHTML=`<div class="countdown">${n}</div>`;await new Promise(r=>setTimeout(r,650))}
    if(token!==raceToken)return;overlay.innerHTML='<div class="countdown">GO!</div>';await new Promise(r=>setTimeout(r,380));
    if(token!==raceToken)return;overlay.style.display='none';state='racing';startTime=performance.now();lastTime=startTime;
    marbles.forEach(m=>m.lastProgressAt=0);raf=requestAnimationFrame(frame);
  }

  function endRace(){
    state='done';cancelAnimationFrame(raf);draw();
    const wi=finishOrder[0],winner=wi!==undefined?marbles[wi]:null;
    const final=Math.max(...marbles.map(m=>m.finishTime||0)),dnfs=marbles.filter(m=>m.dnf).length;
    timerEl.textContent=final.toFixed(1);overlay.style.display='flex';
    overlay.innerHTML=`<div class="card"><h2>${winner?`<span class="winner">${winner.name}</span> Wins!`:'Race Over'}</h2><p>${COURSES[selectedCourse].name}<br>${winner?`Winning time: <strong>${winner.finishTime.toFixed(1)}s</strong><br>`:''}${dnfs?`${dnfs} marble${dnfs===1?'':'s'} recorded a DNF.`:'All four marbles finished.'}</p><button id="againBtn">RACE AGAIN</button></div>`;
    document.getElementById('againBtn').addEventListener('click',showStartCard);
  }

  document.getElementById('resetBtn').addEventListener('click',resetRace);
  addEventListener('resize',resize);
  buildCourse();makeHud();resetMarbles();showStartCard();resize();
})();