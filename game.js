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

  const TRACK_HALF=92, R=17;
  const GRAVITY=150, AIR_DRAG=0.18;
  const WALL_RESTITUTION=0.70, BALL_RESTITUTION=0.91, PEG_RESTITUTION=0.93;
  const STALL_SECONDS=10;

  const COURSES=[
    {
      name:'Rolling Hills',
      blurb:'Long flowing descent • 2 funnels • Peg fields',
      points:[[220,150],[260,520],[430,920],[760,1160],[1110,1090],[1330,820],[1280,470],[1050,230],[1370,120],[1760,270],[1980,610],[1890,980],[1560,1240],[1190,1370],[820,1260],[520,1040],[310,1270],[430,1620],[810,1780],[1260,1740],[1650,1550],[2070,1650],[2360,1900]],
      pegs:[.12,.29,.47,.72,.88], funnels:[.38,.64]
    },
    {
      name:'Hairpin Valley',
      blurb:'Long natural switchbacks • 3 funnels',
      points:[[200,140],[220,620],[390,1060],[720,1280],[1110,1240],[1380,1020],[1420,690],[1210,430],[850,350],[720,110],[1130,90],[1510,250],[1730,590],[1680,940],[1420,1180],[1090,1360],[720,1410],[420,1240],[260,1510],[410,1810],[800,1940],[1220,1870],[1560,1640],[1900,1740],[2210,1980],[2460,1760]],
      pegs:[.16,.34,.58,.79], funnels:[.27,.51,.73]
    },
    {
      name:'Twister Run',
      blurb:'Long S-curves • Dense traffic • 3 funnels',
      points:[[220,150],[410,430],[760,580],[1090,470],[1270,190],[1580,180],[1850,390],[1910,720],[1700,990],[1360,1110],[980,1040],[690,850],[420,1050],[390,1390],[650,1620],[1010,1690],[1330,1530],[1610,1320],[1920,1390],[2200,1630],[2350,1940],[2140,2180],[1770,2240],[1420,2100],[1100,2240],[760,2170],[500,1950]],
      pegs:[.10,.22,.39,.55,.69,.86], funnels:[.31,.60,.77]
    },
    {
      name:'Grand Descent',
      blurb:'Fast wide sweepers • 2 large funnels',
      points:[[180,150],[330,430],[620,650],[960,720],[1290,610],[1580,360],[1890,390],[2100,650],[2050,980],[1770,1230],[1410,1370],[1040,1340],[700,1160],[390,1260],[260,1580],[460,1850],[800,2000],[1190,1980],[1510,1810],[1830,1880],[2140,2090],[2420,1980],[2580,1710],[2500,1430],[2260,1260],[2460,1040],[2700,1170]],
      pegs:[.18,.42,.70,.88], funnels:[.34,.66], funnelSize:1.18
    },
    {
      name:'Chaos Circuit',
      blurb:'Longest technical course • 4 funnels • Heavy traffic',
      points:[[220,150],[260,430],[520,620],[850,540],[1010,270],[1320,190],[1590,370],[1570,690],[1300,860],[970,900],[710,1120],[390,1080],[260,1360],[470,1600],[820,1650],[1110,1480],[1370,1290],[1670,1410],[1900,1690],[2210,1760],[2450,1560],[2500,1250],[2260,1060],[1990,1160],[1770,980],[1940,720],[2240,670],[2500,850],[2710,1110],[2820,1430],[2690,1740],[2380,1970],[2030,2070],[1650,2010],[1320,2180],[960,2240],[620,2100]],
      pegs:[.09,.19,.33,.46,.61,.75,.90], funnels:[.25,.43,.68,.82]
    }
  ];

  let W=0,H=0,DPR=1,MW=0,MH=0,MDPR=1;
  let path=[],totalLength=0,walls=[],pegs=[],funnels=[],trackMesh={left:[],right:[]},bounds={minX:0,minY:0,maxX:1,maxY:1};
  let marbles=[],finishOrder=[],selectedCourse=0;
  let state='idle',startTime=0,lastTime=0,raf=0,raceToken=0;
  let camX=0,camY=0,camAngle=0,camS=0,camLeaderId=0,camHeight=250;
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
      const dist=Math.hypot(p2[0]-p1[0],p2[1]-p1[1]),n=Math.max(12,Math.ceil(dist/22));
      for(let j=0;j<n;j++) raw.push(catmull(p0,p1,p2,p3,j/n));
    }
    raw.push({x:control.at(-1)[0],y:control.at(-1)[1]});
    path=[];let s=0;
    raw.forEach((p,i)=>{
      if(i)s+=Math.hypot(p.x-raw[i-1].x,p.y-raw[i-1].y);
      path.push({x:p.x,y:p.y,s});
    });
    totalLength=s;
  }

  function pointAtS(s){
    s=clamp(s,0,totalLength);
    let lo=1;while(lo<path.length&&path[lo].s<s)lo++;
    lo=Math.min(lo,path.length-1);
    const a=path[lo-1],b=path[lo],span=b.s-a.s||1,t=(s-a.s)/span;
    return {x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t};
  }

  function smoothTangentAtS(s,span=105){
    const a=pointAtS(clamp(s-span,0,totalLength)),b=pointAtS(clamp(s+span,0,totalLength));
    const dx=b.x-a.x,dy=b.y-a.y,L=Math.hypot(dx,dy)||1;
    return {x:dx/L,y:dy/L};
  }

  function tangentAtIndex(i){
    const a=path[Math.max(0,i-3)],b=path[Math.min(path.length-1,i+3)];
    const dx=b.x-a.x,dy=b.y-a.y,L=Math.hypot(dx,dy)||1;
    return {x:dx/L,y:dy/L};
  }

  function buildCourse(){
    const c=COURSES[selectedCourse];
    buildPath(c.points);
    walls=[];pegs=[];funnels=[];

    const left=[],right=[];
    for(let i=0;i<path.length;i++){
      const t=tangentAtIndex(i),nx=-t.y,ny=t.x;
      left.push({x:path[i].x+nx*TRACK_HALF,y:path[i].y+ny*TRACK_HALF});
      right.push({x:path[i].x-nx*TRACK_HALF,y:path[i].y-ny*TRACK_HALF});
    }
    for(let i=1;i<path.length;i++){
      walls.push({a:left[i-1],b:left[i],s0:path[i-1].s,s1:path[i].s});
      walls.push({a:right[i-1],b:right[i],s0:path[i-1].s,s1:path[i].s});
    }
    trackMesh={left,right};

    c.pegs.forEach((frac,k)=>{
      const s=totalLength*frac,q=pointAtS(s),t=smoothTangentAtS(s,50),nx=-t.y,ny=t.x;
      if(k%2===0){
        const side=(k%4===0)?1:-1;
        pegs.push({
          x:q.x+nx*TRACK_HALF*side,
          y:q.y+ny*TRACK_HALF*side,
          r:9,s,wallMounted:true
        });
        pegs.push({
          x:q.x-nx*26*side+t.x*82,
          y:q.y-ny*26*side+t.y*82,
          r:10,s:s+82
        });
      } else {
        pegs.push({x:q.x,y:q.y,r:12,s});
      }
    });

    c.funnels.forEach((frac,i)=>{
      const s=totalLength*frac,q=pointAtS(s),t=smoothTangentAtS(s,70),nx=-t.y,ny=t.x;
      const scale=c.funnelSize||1, outerR=150*scale, holeR=30*scale;
      const side=i%2===0?1:-1;
      const offset=46*side;
      funnels.push({
        id:i,s,
        x:q.x+nx*offset,y:q.y+ny*offset,
        outerR,holeR,
        tx:t.x,ty:t.y,nx,ny
      });
    });

    const xs=path.map(p=>p.x),ys=path.map(p=>p.y);
    funnels.forEach(f=>{xs.push(f.x-f.outerR,f.x+f.outerR);ys.push(f.y-f.outerR,f.y+f.outerR)});
    bounds={minX:Math.min(...xs)-150,maxX:Math.max(...xs)+150,minY:Math.min(...ys)-150,maxY:Math.max(...ys)+150};
  }

  function nearestTrack(m){
    const start=Math.max(0,(m.segIndex||0)-26),end=Math.min(path.length-2,(m.segIndex||0)+34);
    let best={d2:Infinity,index:m.segIndex||0,s:m.progress||0,x:path[0].x,y:path[0].y};
    for(let i=start;i<=end;i++){
      const a=path[i],b=path[i+1],abx=b.x-a.x,aby=b.y-a.y,den=abx*abx+aby*aby||1;
      const tt=clamp(((m.x-a.x)*abx+(m.y-a.y)*aby)/den,0,1);
      const x=a.x+abx*tt,y=a.y+aby*tt,dx=m.x-x,dy=m.y-y,d2=dx*dx+dy*dy;
      if(d2<best.d2)best={d2,index:i,x,y,s:a.s+(b.s-a.s)*tt};
    }
    m.segIndex=best.index;m.progress=best.s;return best;
  }

  function closestPointOnSegment(px,py,ax,ay,bx,by){
    const abx=bx-ax,aby=by-ay,den=abx*abx+aby*aby||1;
    const tt=clamp(((px-ax)*abx+(py-ay)*aby)/den,0,1);
    return {x:ax+abx*tt,y:ay+aby*tt};
  }

  function collideWall(m,w){
    if(m.funnel||Math.abs(((w.s0+w.s1)/2)-m.progress)>330)return;
    const q=closestPointOnSegment(m.x,m.y,w.a.x,w.a.y,w.b.x,w.b.y);
    let dx=m.x-q.x,dy=m.y-q.y,d=Math.hypot(dx,dy);
    if(d>=R)return;
    if(d<.001){const sx=w.b.x-w.a.x,sy=w.b.y-w.a.y;dx=-sy;dy=sx;d=Math.hypot(dx,dy)||1}
    const nx=dx/d,ny=dy/d,pen=R-d;
    m.x+=nx*(pen+.2);m.y+=ny*(pen+.2);
    const vn=m.vx*nx+m.vy*ny;
    if(vn<0){m.vx-=(1+WALL_RESTITUTION)*vn*nx;m.vy-=(1+WALL_RESTITUTION)*vn*ny}
  }

  function collidePeg(m,p){
    if(m.funnel||Math.abs(p.s-m.progress)>250)return;
    let dx=m.x-p.x,dy=m.y-p.y,d=Math.hypot(dx,dy),minD=R+p.r;
    if(d>=minD)return;
    if(d<.001){dx=1;dy=0;d=1}
    const nx=dx/d,ny=dy/d,pen=minD-d;
    m.x+=nx*(pen+.2);m.y+=ny*(pen+.2);
    const vn=m.vx*nx+m.vy*ny;
    if(vn<0){m.vx-=(1+PEG_RESTITUTION)*vn*nx;m.vy-=(1+PEG_RESTITUTION)*vn*ny}
  }

  function ensureAudio(){
    if(!audioCtx)audioCtx=new(window.AudioContext||window.webkitAudioContext)();
    if(audioCtx.state==='suspended')audioCtx.resume();
  }

  function playClink(impact,pairKey){
    if(!audioCtx)return;
    const now=audioCtx.currentTime,last=lastClink.get(pairKey)||-1;
    if(now-last<.055)return;
    lastClink.set(pairKey,now);
    const gain=audioCtx.createGain(),o1=audioCtx.createOscillator(),o2=audioCtx.createOscillator();
    const vol=clamp(impact/420,.015,.085);
    gain.gain.setValueAtTime(vol,now);
    gain.gain.exponentialRampToValueAtTime(.0001,now+.055);
    o1.type='sine';o2.type='sine';
    o1.frequency.setValueAtTime(1450+rnd(-130,130),now);
    o2.frequency.setValueAtTime(2350+rnd(-180,180),now);
    o1.frequency.exponentialRampToValueAtTime(1150,now+.05);
    o2.frequency.exponentialRampToValueAtTime(1850,now+.045);
    o1.connect(gain);o2.connect(gain);gain.connect(audioCtx.destination);
    o1.start(now);o2.start(now);o1.stop(now+.06);o2.stop(now+.055);
  }

  function collideBalls(a,b){
    const sameFunnel=a.funnel&&b.funnel&&a.funnel.id===b.funnel.id;
    if(!sameFunnel&&!a.funnel&&!b.funnel&&Math.abs(a.progress-b.progress)>135)return;
    if((a.funnel&&!b.funnel)||(b.funnel&&!a.funnel))return;

    let dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy);
    if(d>=R*2)return;
    if(d<.001){dx=1;dy=0;d=1}
    const nx=dx/d,ny=dy/d,pen=R*2-d;
    a.x-=nx*pen*.5;a.y-=ny*pen*.5;b.x+=nx*pen*.5;b.y+=ny*pen*.5;

    const rvx=b.vx-a.vx,rvy=b.vy-a.vy,rel=rvx*nx+rvy*ny;
    if(rel>=0)return;
    const impact=-rel,j=-(1+BALL_RESTITUTION)*rel/2;
    a.vx-=j*nx;a.vy-=j*ny;b.vx+=j*nx;b.vy+=j*ny;
    playClink(impact,[a.id,b.id].sort().join('-'));
  }

  function maybeEnterFunnel(m){
    if(m.funnel||m.finished)return;
    for(const f of funnels){
      if(m.usedFunnels.has(f.id)||Math.abs(m.progress-f.s)>185)continue;
      const dx=m.x-f.x,dy=m.y-f.y,d=Math.hypot(dx,dy);
      if(d<=f.outerR-R*.65){
        m.funnel={id:f.id,f};
        return;
      }
    }
  }

  function updateFunnel(m,dt){
    const f=m.funnel.f;
    let dx=m.x-f.x,dy=m.y-f.y,d=Math.hypot(dx,dy)||1;
    let rx=dx/d,ry=dy/d;

    const bowlOmega2=18.0;
    m.vx+=-dx*bowlOmega2*dt;
    m.vy+=-dy*bowlOmega2*dt;

    const damping=Math.exp(-.085*dt);
    m.vx*=damping;m.vy*=damping;

    m.x+=m.vx*dt;m.y+=m.vy*dt;

    dx=m.x-f.x;dy=m.y-f.y;d=Math.hypot(dx,dy)||1;rx=dx/d;ry=dy/d;

    const rim=f.outerR-R;
    if(d>rim){
      const pen=d-rim;
      m.x-=rx*pen;m.y-=ry*pen;
      const vn=m.vx*rx+m.vy*ry;
      if(vn>0){
        m.vx-=(1+0.78)*vn*rx;
        m.vy-=(1+0.78)*vn*ry;
      }
    }

    m.progress=f.s+clamp((f.outerR-d)/f.outerR,0,1)*110;

    if(d<f.holeR+R*.28){
      const exitS=Math.min(totalLength-70,f.s+155);
      const q=pointAtS(exitS),t=smoothTangentAtS(exitS,65);
      const exitSpeed=Math.max(190,Math.hypot(m.vx,m.vy)*.92);
      m.x=q.x;m.y=q.y;
      m.vx=t.x*exitSpeed;m.vy=t.y*exitSpeed;
      m.progress=exitS;
      m.usedFunnels.add(f.id);
      m.funnel=null;
      nearestTrack(m);
    }
  }

  function physicsStep(dt,elapsed){
    const damping=Math.exp(-AIR_DRAG*dt);

    for(const m of marbles){
      if(m.finished)continue;

      if(m.funnel){
        updateFunnel(m,dt);
      }else{
        const near=nearestTrack(m),t=tangentAtIndex(near.index);
        m.vx+=t.x*GRAVITY*dt;m.vy+=t.y*GRAVITY*dt;
        m.vx*=damping;m.vy*=damping;
        m.x+=m.vx*dt;m.y+=m.vy*dt;
        nearestTrack(m);
        maybeEnterFunnel(m);
        if(!m.funnel){
          for(let pass=0;pass<2;pass++){
            for(const w of walls)collideWall(m,w);
            for(const p of pegs)collidePeg(m,p);
          }
          nearestTrack(m);
          maybeEnterFunnel(m);
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
      if(m.progress>=totalLength-58){
        m.finished=true;m.finishTime=elapsed;finishOrder.push(i);continue;
      }
      if(m.progress>m.lastProgress+34){
        m.lastProgress=m.progress;m.lastProgressAt=elapsed;
      }else if(elapsed-m.lastProgressAt>STALL_SECONDS&&Math.hypot(m.vx,m.vy)<40&&!m.funnel){
        m.finished=true;m.dnf=true;m.finishTime=elapsed;
      }
    }

    const active=marbles.filter(m=>!m.finished).sort((a,b)=>b.progress-a.progress);
    active.forEach((m,k)=>m.rank=finishOrder.length+k+1);
    updateHud();
    if(marbles.every(m=>m.finished))endRace();
  }

  function currentLeader(){
    const active=marbles.filter(m=>!m.finished);
    if(!active.length)return marbles.reduce((a,b)=>b.progress>a.progress?b:a);
    const actual=active.reduce((a,b)=>b.progress>a.progress?b:a),locked=active.find(m=>m.id===camLeaderId);
    if(!locked||actual.progress>locked.progress+30)camLeaderId=actual.id;
    return active.find(m=>m.id===camLeaderId)||actual;
  }

  function updateCamera(){
    const lead=currentLeader();
    const active=marbles.filter(m=>!m.finished);
    const leaderS=lead.progress;
    const activeProgress=active.map(m=>m.progress);
    const tailS=activeProgress.length?Math.min(...activeProgress):leaderS;
    const packSpread=clamp(leaderS-tailS,0,900);
    const framingBack=clamp(packSpread*.22,0,170);
    const focusS=clamp(leaderS-framingBack,0,totalLength);

    const lookFrom=pointAtS(clamp(focusS-80,0,totalLength));
    const lookTo=pointAtS(clamp(focusS+430,0,totalLength));
    const ldx=lookTo.x-lookFrom.x,ldy=lookTo.y-lookFrom.y;
    const LL=Math.hypot(ldx,ldy)||1;
    const t={x:ldx/LL,y:ldy/LL};

    const centre=pointAtS(focusS);
    const cameraBack=300+clamp(packSpread*.12,0,95);
    const targetX=centre.x-t.x*cameraBack;
    const targetY=centre.y-t.y*cameraBack;
    const targetAngle=Math.atan2(t.y,t.x);
    const targetHeight=250+clamp(packSpread*.16,0,110);

    camX+=(targetX-camX)*.024;
    camY+=(targetY-camY)*.024;
    camHeight+=(targetHeight-camHeight)*.022;

    let da=((targetAngle-camAngle+Math.PI*3)%(Math.PI*2))-Math.PI;
    da=clamp(da,-.0085,.0085);
    camAngle+=da;
    camS+=(focusS-camS)*.032;
  }

  function project(x,y){
    const fx=Math.cos(camAngle),fy=Math.sin(camAngle);
    const rx=-fy,ry=fx;
    const dx=x-camX,dy=y-camY;

    const forward=dx*fx+dy*fy;
    const lateral=dx*rx+dy*ry;

    const near=150;
    const depth=Math.max(24,forward+near);
    const focal=H*.82;
    const scale=focal/depth;

    const horizon=H*.18;
    const screenX=W*.5+lateral*scale;
    const screenY=horizon+(camHeight*scale);

    return {
      x:screenX,
      y:screenY,
      scale:scale,
      visible:forward>-120&&forward<1450&&screenY>-120&&screenY<H+180,
      forward
    };
  }

  function drawFinishLine(){
    const s=totalLength-55,q=pointAtS(s),t=smoothTangentAtS(s,55),nx=-t.y,ny=t.x;
    const l=project(q.x+nx*(TRACK_HALF-7),q.y+ny*(TRACK_HALF-7));
    const r=project(q.x-nx*(TRACK_HALF-7),q.y-ny*(TRACK_HALF-7));
    if(!l.visible&&!r.visible)return;

    const cells=12;
    for(let i=0;i<cells;i++){
      const a=i/cells,b=(i+1)/cells;
      const x1=l.x+(r.x-l.x)*a,y1=l.y+(r.y-l.y)*a;
      const x2=l.x+(r.x-l.x)*b,y2=l.y+(r.y-l.y)*b;
      ctx.strokeStyle=i%2?'#fff':'#111';
      ctx.lineWidth=Math.max(5,12*((l.scale+r.scale)/2));
      ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();
    }
    const midX=(l.x+r.x)/2,midY=(l.y+r.y)/2;
    ctx.fillStyle='#fff';ctx.font=`900 ${Math.max(10,16*((l.scale+r.scale)/2))}px system-ui`;
    ctx.textAlign='center';ctx.fillText('FINISH',midX,midY-12);
  }

  function drawCourse(){
    ctx.clearRect(0,0,W,H);
    const sky=ctx.createLinearGradient(0,0,0,H);
    sky.addColorStop(0,'#17223e');sky.addColorStop(.55,'#10182d');sky.addColorStop(1,'#070b14');
    ctx.fillStyle=sky;ctx.fillRect(0,0,W,H);
    updateCamera();

    const indices=[];
    for(let i=0;i<path.length;i++){
      if(path[i].s>camS-320&&path[i].s<camS+1320)indices.push(i);
    }
    if(indices.length>2){
      const left=indices.map(i=>project(trackMesh.left[i].x,trackMesh.left[i].y));
      const right=indices.map(i=>project(trackMesh.right[i].x,trackMesh.right[i].y));
      ctx.beginPath();ctx.moveTo(left[0].x,left[0].y);left.slice(1).forEach(p=>ctx.lineTo(p.x,p.y));
      for(let i=right.length-1;i>=0;i--)ctx.lineTo(right[i].x,right[i].y);
      ctx.closePath();
      const trackGrad=ctx.createLinearGradient(0,H*.15,0,H);
      trackGrad.addColorStop(0,'#323b52');trackGrad.addColorStop(1,'#20283a');
      ctx.fillStyle=trackGrad;ctx.fill();
      [left,right].forEach(edge=>{
        ctx.beginPath();ctx.moveTo(edge[0].x,edge[0].y);edge.slice(1).forEach(p=>ctx.lineTo(p.x,p.y));
        ctx.strokeStyle='#a9b5cb';ctx.lineWidth=8;ctx.lineJoin='round';ctx.lineCap='round';ctx.stroke();
        ctx.strokeStyle='#526078';ctx.lineWidth=3;ctx.stroke();
      });
    }

    funnels.forEach(f=>{
      if(Math.abs(f.s-camS)>1200)return;
      const p=project(f.x,f.y);if(!p.visible)return;
      const rr=Math.max(8,f.outerR*p.scale),g=ctx.createRadialGradient(p.x,p.y,rr*.10,p.x,p.y,rr);
      g.addColorStop(0,'#090c12');g.addColorStop(.16,'#303849');g.addColorStop(.72,'#7c879b');g.addColorStop(1,'#b6c0d1');
      ctx.fillStyle=g;ctx.beginPath();ctx.arc(p.x,p.y,rr,0,Math.PI*2);ctx.fill();
      ctx.strokeStyle='#dbe2ed';ctx.lineWidth=Math.max(2,4*p.scale);ctx.stroke();
      ctx.fillStyle='#05070b';ctx.beginPath();ctx.arc(p.x,p.y,Math.max(3,f.holeR*p.scale),0,Math.PI*2);ctx.fill();
    });

    pegs.forEach(peg=>{
      if(Math.abs(peg.s-camS)>1150)return;
      const p=project(peg.x,peg.y);if(!p.visible)return;
      const rr=Math.max(3,peg.r*p.scale);
      ctx.fillStyle='#d7a141';ctx.beginPath();ctx.arc(p.x,p.y,rr,0,Math.PI*2);ctx.fill();
      ctx.fillStyle='#fff5';ctx.beginPath();ctx.arc(p.x-rr*.3,p.y-rr*.33,rr*.25,0,Math.PI*2);ctx.fill();
    });

    for(let s=Math.ceil((camS-100)/420)*420;s<camS+1200;s+=420){
      if(s<0||s>totalLength)continue;
      const q=pointAtS(s),t=smoothTangentAtS(s,75),nx=-t.y,ny=t.x;
      [-1,1].forEach(side=>{
        const p=project(q.x+nx*TRACK_HALF*side,q.y+ny*TRACK_HALF*side);
        if(!p.visible)return;
        ctx.strokeStyle='#455167';ctx.lineWidth=Math.max(2,6*p.scale);
        ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(p.x,p.y+Math.max(18,65*p.scale));ctx.stroke();
      });
    }

    drawFinishLine();
  }

  function drawMarble(m){
    const p=project(m.x,m.y);if(!p.visible)return;
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
    const bw=bounds.maxX-bounds.minX,bh=bounds.maxY-bounds.minY,scale=Math.min((MW-18)/bw,(MH-18)/bh);
    const ox=(MW-bw*scale)/2-bounds.minX*scale,oy=(MH-bh*scale)/2-bounds.minY*scale;

    mctx.beginPath();path.forEach((p,i)=>i?mctx.lineTo(ox+p.x*scale,oy+p.y*scale):mctx.moveTo(ox+p.x*scale,oy+p.y*scale));
    mctx.strokeStyle='#77849e';mctx.lineWidth=Math.max(3,TRACK_HALF*2*scale);mctx.stroke();
    mctx.strokeStyle='#252d43';mctx.lineWidth=Math.max(2,(TRACK_HALF*2-18)*scale);mctx.stroke();

    funnels.forEach(f=>{
      mctx.fillStyle='#bbc6da66';mctx.beginPath();mctx.arc(ox+f.x*scale,oy+f.y*scale,Math.max(3,f.outerR*scale),0,Math.PI*2);mctx.fill();
    });

    const fs=totalLength-55,fq=pointAtS(fs),ft=smoothTangentAtS(fs,50),fnx=-ft.y,fny=ft.x;
    mctx.strokeStyle='#fff';mctx.lineWidth=2;
    mctx.beginPath();
    mctx.moveTo(ox+(fq.x+fnx*TRACK_HALF)*scale,oy+(fq.y+fny*TRACK_HALF)*scale);
    mctx.lineTo(ox+(fq.x-fnx*TRACK_HALF)*scale,oy+(fq.y-fny*TRACK_HALF)*scale);
    mctx.stroke();

    marbles.forEach(m=>{
      mctx.fillStyle=m.color;mctx.beginPath();mctx.arc(ox+m.x*scale,oy+m.y*scale,4,0,Math.PI*2);mctx.fill();
      mctx.strokeStyle='#fff';mctx.lineWidth=1;mctx.stroke();
    });
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
    finishOrder=[];lastClink.clear();
    const q=pointAtS(45),t=smoothTangentAtS(45,50),nx=-t.y,ny=t.x;
    marbles=COLORS.map((m,i)=>({
      ...m,id:i,
      x:q.x+nx*(i-1.5)*38,y:q.y+ny*(i-1.5)*38,
      vx:0,vy:0,angle:rnd(0,Math.PI*2),omega:0,
      finished:false,dnf:false,finishTime:null,rank:i+1,
      progress:45,segIndex:1,lastProgress:45,lastProgressAt:0,
      usedFunnels:new Set(),funnel:null
    }));
    camLeaderId=0;camX=q.x-t.x*300;camY=q.y-t.y*300;camAngle=Math.atan2(t.y,t.x);camS=45;camHeight=250;
    timerEl.textContent='00.0';updateHud();draw();
  }

  function resize(){
    const r=stage.getBoundingClientRect();W=Math.max(320,Math.floor(r.width));H=Math.max(360,Math.floor(r.height));
    DPR=Math.min(devicePixelRatio||1,2);game.width=W*DPR;game.height=H*DPR;ctx.setTransform(DPR,0,0,DPR,0,0);
    const mr=map.getBoundingClientRect();MW=Math.max(80,Math.floor(mr.width));MH=Math.max(100,Math.floor(mr.height));
    MDPR=Math.min(devicePixelRatio||1,2);map.width=MW*MDPR;map.height=MH*MDPR;mctx.setTransform(MDPR,0,0,MDPR,0,0);
    draw();
  }

  function draw(){
    if(!marbles.length)return;
    drawCourse();
    [...marbles].sort((a,b)=>a.progress-b.progress).forEach(drawMarble);
    drawMinimap();
  }

  function frame(now){
    if(state!=='racing')return;
    const elapsed=(now-startTime)/1000;timerEl.textContent=elapsed.toFixed(1).padStart(4,'0');
    const dt=Math.min(.035,(now-lastTime)/1000||.016);lastTime=now;
    const sub=6,h=dt/sub;
    for(let i=0;i<sub;i++)physicsStep(h,elapsed);
    draw();
    if(state==='racing')raf=requestAnimationFrame(frame);
  }

  function showStartCard(){
    overlay.style.display='flex';
    overlay.innerHTML=`<div class="card courseCard">
      <h2>Choose a Course</h2>
      <div class="courseGrid">
        ${COURSES.map((c,i)=>`<button class="courseChoice ${i===selectedCourse?'selected':''}" data-course="${i}"><strong>${c.name}</strong><span>${c.blurb}</span></button>`).join('')}
      </div>
      <button id="startBtn">START RACE</button>
    </div>`;
    overlay.querySelectorAll('.courseChoice').forEach(btn=>btn.addEventListener('click',()=>{
      selectedCourse=Number(btn.dataset.course);
      buildCourse();resetMarbles();showStartCard();
    }));
    document.getElementById('startBtn').addEventListener('click',()=>{ensureAudio();startRace()});
  }

  function resetRace(){
    raceToken++;cancelAnimationFrame(raf);state='idle';
    buildCourse();resetMarbles();showStartCard();
  }

  async function startRace(){
    if(state==='countdown'||state==='racing')return;
    ensureAudio();
    const token=++raceToken;resetMarbles();state='countdown';overlay.style.display='flex';
    for(let n=3;n>=1;n--){
      if(token!==raceToken)return;
      overlay.innerHTML=`<div class="countdown">${n}</div>`;
      await new Promise(r=>setTimeout(r,650));
    }
    if(token!==raceToken)return;
    overlay.innerHTML='<div class="countdown">GO!</div>';
    await new Promise(r=>setTimeout(r,380));
    if(token!==raceToken)return;
    overlay.style.display='none';state='racing';startTime=performance.now();lastTime=startTime;
    marbles.forEach(m=>m.lastProgressAt=0);
    raf=requestAnimationFrame(frame);
  }

  function endRace(){
    state='done';cancelAnimationFrame(raf);draw();
    const winnerIndex=finishOrder[0],winner=winnerIndex!==undefined?marbles[winnerIndex]:null;
    const finalTime=Math.max(...marbles.map(m=>m.finishTime||0)),dnfs=marbles.filter(m=>m.dnf).length;
    timerEl.textContent=finalTime.toFixed(1);overlay.style.display='flex';
    overlay.innerHTML=`<div class="card"><h2>${winner?`<span class="winner">${winner.name}</span> Wins!`:'Race Over'}</h2><p>${COURSES[selectedCourse].name}<br>${winner?`Winning time: <strong>${winner.finishTime.toFixed(1)}s</strong><br>`:''}${dnfs?`${dnfs} marble${dnfs===1?'':'s'} recorded a DNF.`:'All four marbles finished.'}</p><button id="againBtn">RACE AGAIN</button></div>`;
    document.getElementById('againBtn').addEventListener('click',()=>showStartCard());
  }

  document.getElementById('resetBtn').addEventListener('click',resetRace);
  addEventListener('resize',resize);
  buildCourse();makeHud();resetMarbles();showStartCard();resize();
})();