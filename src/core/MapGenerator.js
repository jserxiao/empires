import { TERRAIN, ROAD, RESOURCE_DEFS, TILE_IMAGES, BUILDING_DEFS, BUILDING_TYPE, UNIT_TYPE, UNIT_DEFS, TEAM } from '../core/constants.js'

export class PerlinNoise {
  constructor(seed = Math.random() * 65536) {
    this.grad3 = [[1,1,0],[-1,1,0],[1,-1,0],[-1,-1,0],[1,0,1],[-1,0,1],[1,0,-1],[-1,0,-1],[0,1,1],[0,-1,1],[0,1,-1],[0,-1,-1]]
    this.p = []; const rng = this.seedRng(seed)
    for (let i = 0; i < 256; i++) this.p[i] = i
    for (let i = 255; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [this.p[i], this.p[j]] = [this.p[j], this.p[i]] }
    this.perm = new Array(512); for (let i = 0; i < 512; i++) this.perm[i] = this.p[i & 255]
  }
  seedRng(seed) { let s = seed; return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646 } }
  dot(g, x, y) { return g[0] * x + g[1] * y }
  noise(xin, yin) {
    const F2 = 0.5 * (Math.sqrt(3) - 1), G2 = (3 - Math.sqrt(3)) / 6
    const s = (xin + yin) * F2; const i = Math.floor(xin + s), j = Math.floor(yin + s)
    const t = (i + j) * G2; const x0 = xin - (i - t), y0 = yin - (j - t)
    let i1, j1; if (x0 > y0) { i1 = 1; j1 = 0 } else { i1 = 0; j1 = 1 }
    const x1 = x0 - i1 + G2, y1 = y0 - j1 + G2, x2 = x0 - 1 + 2 * G2, y2 = y0 - 1 + 2 * G2
    const ii = i & 255, jj = j & 255
    const gi0 = this.perm[ii + this.perm[jj]] % 12, gi1 = this.perm[ii + i1 + this.perm[jj + j1]] % 12, gi2 = this.perm[ii + 1 + this.perm[jj + 1]] % 12
    let n0 = 0, n1 = 0, n2 = 0
    let t0 = 0.5 - x0 * x0 - y0 * y0; if (t0 >= 0) { t0 *= t0; n0 = t0 * t0 * this.dot(this.grad3[gi0], x0, y0) }
    let t1 = 0.5 - x1 * x1 - y1 * y1; if (t1 >= 0) { t1 *= t1; n1 = t1 * t1 * this.dot(this.grad3[gi1], x1, y1) }
    let t2 = 0.5 - x2 * x2 - y2 * y2; if (t2 >= 0) { t2 *= t2; n2 = t2 * t2 * this.dot(this.grad3[gi2], x2, y2) }
    return 70 * (n0 + n1 + n2)
  }
  octaveNoise(x, y, oct = 4, per = 0.5) {
    let total = 0, freq = 1, amp = 1, maxV = 0
    for (let i = 0; i < oct; i++) { total += this.noise(x * freq, y * freq) * amp; maxV += amp; amp *= per; freq *= 2 }
    return total / maxV
  }
}

function determineRoadType(roads, x, y, cols, rows) {
  const t = y > 0 && roads[y-1][x], b = y < rows-1 && roads[y+1][x], l = x > 0 && roads[y][x-1], r = x < cols-1 && roads[y][x+1]
  const c = (t?1:0)+(b?1:0)+(l?1:0)+(r?1:0)
  if (c===4) return ROAD.CROSS
  if (c===3) { if(!t) return ROAD.T_TOP; if(!b) return ROAD.T_BOTTOM; if(!l) return ROAD.T_LEFT; return ROAD.T_RIGHT }
  if (c===2) { if(t&&b) return ROAD.VERTICAL; if(l&&r) return ROAD.HORIZONTAL; if(t&&l) return ROAD.CORNER_TL; if(t&&r) return ROAD.CORNER_TR; if(b&&l) return ROAD.CORNER_BL; if(b&&r) return ROAD.CORNER_BR }
  if (c===1) { if(t||b) return ROAD.VERTICAL; return ROAD.HORIZONTAL }
  return ROAD.HORIZONTAL
}

function findPathFast(map, x0, y0, x1, y1, cols, rows) {
  const h = (ax,ay) => Math.abs(ax-x1)+Math.abs(ay-y1), maxN = cols*rows
  const oX=new Int32Array(maxN),oY=new Int32Array(maxN),oF=new Float32Array(maxN)
  let oH=0,oT=0; const cFX=new Int32Array(maxN),cFY=new Int32Array(maxN)
  const gS=new Float32Array(maxN).fill(Infinity), cl=new Uint8Array(maxN), idx=(x,y)=>y*cols+x
  oX[oT]=x0;oY[oT]=y0;oF[oT]=h(x0,y0);oT++;gS[idx(x0,y0)]=0
  while(oH<oT){let bi=oH;for(let i=oH+1;i<oT;i++)if(oF[i]<oF[bi])bi=i
    if(bi!==oH){let t=oX[oH];oX[oH]=oX[bi];oX[bi]=t;t=oY[oH];oY[oH]=oY[bi];oY[bi]=t;t=oF[oH];oF[oH]=oF[bi];oF[bi]=t}
    const cx=oX[oH],cy=oY[oH];oH++;const ci=idx(cx,cy);if(cl[ci])continue;cl[ci]=1
    if(cx===x1&&cy===y1){const p=[];let px=x1,py=y1;while(px!==x0||py!==y0){p.push({x:px,y:py});const pi=idx(px,py);px=cFX[pi];py=cFY[pi]}p.push({x:x0,y:y0});p.reverse();return p}
    for(const[nx,ny]of[[cx+1,cy],[cx-1,cy],[cx,cy+1],[cx,cy-1]]){if(nx<0||nx>=cols||ny<0||ny>=rows)continue;const ni=idx(nx,ny);if(cl[ni])continue
      let cost=1;const tile=map[ny][nx];if(tile.terrain===TERRAIN.DEEP_WATER)cost=100;else if(tile.terrain===TERRAIN.MOUNTAIN)cost=5;else if(tile.terrain===TERRAIN.FOREST)cost=2
      const tG=gS[ci]+cost;if(tG<gS[ni]){cFX[ni]=cx;cFY[ni]=cy;gS[ni]=tG;if(oT<maxN){oX[oT]=nx;oY[oT]=ny;oF[oT]=tG+h(nx,ny);oT++}}}}
  return[]
}

function curvedPath(map,x0,y0,x1,y1,cols,rows,ba){const d=Math.sqrt((x1-x0)**2+(y1-y0)**2);if(d<30)return findPathFast(map,x0,y0,x1,y1,cols,rows)
  const mx=(x0+x1)/2,my=(y0+y1)/2,dx=x1-x0,dy=y1-y0,len=Math.sqrt(dx*dx+dy*dy)||1,px=-dy/len,py=dx/len,off=ba*d*0.3
  const cx1=mx+px*off,cy1=my+py*off,steps=Math.max(3,Math.floor(d/40)),wps=[]
  for(let i=1;i<steps;i++){const t=i/steps;wps.push({x:Math.max(0,Math.min(cols-1,Math.round((1-t)*(1-t)*x0+2*(1-t)*t*cx1+t*t*x1))),y:Math.max(0,Math.min(rows-1,Math.round((1-t)*(1-t)*y0+2*(1-t)*t*cy1+t*t*y1)))})}
  const fp=[];let pX=x0,pY=y0;for(const wp of wps){const s=findPathFast(map,pX,pY,wp.x,wp.y,cols,rows);if(!s.length)return findPathFast(map,x0,y0,x1,y1,cols,rows);for(let i=0;i<s.length-1;i++)fp.push(s[i]);pX=wp.x;pY=wp.y}
  const ls=findPathFast(map,pX,pY,x1,y1,cols,rows);if(!ls.length)return findPathFast(map,x0,y0,x1,y1,cols,rows);for(const p of ls)fp.push(p);return fp}

function generateRoads(map,cols,rows,seed){const perlin=new PerlinNoise(seed+88888),rng=perlin.seedRng(seed+99999)
  const roads=Array(rows).fill(null).map(()=>Array(cols).fill(false)),towns=[];const numT=Math.min(5,Math.floor(cols*rows/25000)+2);let att=0
  while(towns.length<numT&&att<500){att++;const tx=Math.floor(rng()*cols),ty=Math.floor(rng()*rows)
    if(map[ty][tx].terrain===TERRAIN.GRASS||map[ty][tx].terrain===TERRAIN.EMPTY){let close=false;for(const t of towns)if(Math.sqrt((t.x-tx)**2+(t.y-ty)**2)<60){close=true;break}if(!close)towns.push({x:tx,y:ty})}}
  for(let i=0;i<towns.length;i++)for(let j=i+1;j<towns.length;j++){const bn=perlin.noise(i*3.7+seed,j*2.3+seed),ba=bn>0?1:-1
    const path=curvedPath(map,towns[i].x,towns[i].y,towns[j].x,towns[j].y,cols,rows,ba)
    for(const p of path)if(p.x>=0&&p.x<cols&&p.y>=0&&p.y<rows){const tile=map[p.y][p.x];if(tile.terrain===TERRAIN.GRASS||tile.terrain===TERRAIN.EMPTY||tile.terrain===TERRAIN.FOREST)roads[p.y][p.x]=true}}
  const rt=Array(rows).fill(null).map(()=>Array(cols).fill(ROAD.NONE));for(let y=0;y<rows;y++)for(let x=0;x<cols;x++)if(roads[y][x])rt[y][x]=determineRoadType(roads,x,y,cols,rows)
  return{roadTypes:rt,towns}}

function placeResources(map,cols,rows,seed){const rng=new PerlinNoise(seed+55555).seedRng(seed+66666),tN=new PerlinNoise(seed+11111),sN=new PerlinNoise(seed+22222),dN=new PerlinNoise(seed+33333)
  for(let y=0;y<rows;y++)for(let x=0;x<cols;x++){const tile=map[y][x],nx=x/cols,ny=y/rows
    if(tile.terrain===TERRAIN.EMPTY){if(rng()<0.015)tile.resource={key:'berry',amount:RESOURCE_DEFS.berry.amount}}
    else if(tile.terrain===TERRAIN.GRASS){const tv=tN.octaveNoise(nx*6,ny*6,3,.5);if(tv>0.4){const r=rng();if(r<0.30)tile.resource={key:'pine_tree',amount:RESOURCE_DEFS.pine_tree.amount};else if(r<0.45)tile.resource={key:'berry',amount:RESOURCE_DEFS.berry.amount}}else if(tv<0.05){const r=rng();if(r<0.04)tile.resource={key:'stone_cluster',amount:RESOURCE_DEFS.stone_cluster.amount};else if(r<0.07)tile.resource={key:'gold_cluster',amount:RESOURCE_DEFS.gold_cluster.amount}}}
    else if(tile.terrain===TERRAIN.FOREST){const tv=tN.octaveNoise(nx*8,ny*8,2,.5);if(tv>0.3){const r=rng();if(r<0.85)tile.resource={key:'pine_tree',amount:RESOURCE_DEFS.pine_tree.amount}}}
    else if(tile.terrain===TERRAIN.SAND){const dv=dN.octaveNoise(nx*7+50,ny*7+50,3,.5);if(dv>0.3){const r=rng();if(r<0.15)tile.resource={key:'dirt_2',amount:RESOURCE_DEFS.dirt_2.amount};else if(r<0.28)tile.resource={key:'dirt_3',amount:RESOURCE_DEFS.dirt_3.amount}}
      const sv=sN.octaveNoise(nx*7,ny*7,3,.5);if(sv>0.35&&!tile.resource){const r=rng();if(r<0.08)tile.resource={key:'stone_cluster',amount:RESOURCE_DEFS.stone_cluster.amount};else if(r<0.13)tile.resource={key:'gold_cluster',amount:RESOURCE_DEFS.gold_cluster.amount}}}
    else if(tile.terrain===TERRAIN.MOUNTAIN){const sv=sN.octaveNoise(nx*5,ny*5,2,.5);if(sv>0.15){const r=rng();if(r<0.15)tile.resource={key:'gold_cluster',amount:RESOURCE_DEFS.gold_cluster.amount};else if(r<0.4)tile.resource={key:'stone_cluster',amount:RESOURCE_DEFS.stone_cluster.amount}}}}}

let _uidC=0
function placeTC(map,tx,ty,team){map[ty][tx].structure={type:BUILDING_TYPE.TOWN_CENTER,team,part:'top'};map[ty][tx].resource=null
  map[ty+1][tx].structure={type:BUILDING_TYPE.TOWN_CENTER,team,part:'bottom'};map[ty+1][tx].resource=null
  const mf=UNIT_DEFS[UNIT_TYPE.MALE_FARMER];map[ty][tx+1].units=[{id:++_uidC,type:UNIT_TYPE.MALE_FARMER,name:mf.name,team,hp:mf.maxHp,maxHp:mf.maxHp}];map[ty][tx+1].resource=null
  const ff=UNIT_DEFS[UNIT_TYPE.FEMALE_FARMER];map[ty+1][tx+1].units=[{id:++_uidC,type:UNIT_TYPE.FEMALE_FARMER,name:ff.name,team,hp:ff.maxHp,maxHp:ff.maxHp}];map[ty+1][tx+1].resource=null}

function findTL(map,cols,rows){const m=5;for(let y=m;y<rows-m-1;y++)for(let x=m;x<cols-m-1;x++){const il=t=>t===TERRAIN.GRASS||t===TERRAIN.EMPTY;if(il(map[y][x].terrain)&&il(map[y][x+1].terrain)&&il(map[y+1][x].terrain)&&il(map[y+1][x+1].terrain))return{x,y}}return null}

function findEnemyStart(map,cols,rows,ps){const m=5;for(let y=rows-m-2;y>=m;y--)for(let x=cols-m-2;x>=m;x--){if(ps&&Math.sqrt((x-ps.x)**2+(y-ps.y)**2)<100)continue;const il=t=>t===TERRAIN.GRASS||t===TERRAIN.EMPTY;if(il(map[y][x].terrain)&&il(map[y]?.[x+1]?.terrain)&&il(map[y+1]?.[x]?.terrain)&&il(map[y+1]?.[x+1]?.terrain))return{x,y}}return null}

export function generateMap(cols,rows,seed){const p1=new PerlinNoise(seed),p2=new PerlinNoise(seed+12345);_uidC=0
  const map=[],cx=cols/2,cy=rows/2
  for(let y=0;y<rows;y++){const row=[];for(let x=0;x<cols;x++){const nx=x/cols,ny=y/rows
    let el=p1.octaveNoise(nx*3,ny*3,5,.5);const dx=(x-cx)/cx,dy=(y-cy)/cy,dfc=Math.sqrt(dx*dx+dy*dy),nd=p2.octaveNoise(nx*2.5,ny*2.5,3,.5)*.18,dd=dfc+nd,sr=.32,sf=.08
    if(dd<sr)el-=(1-dd/sr)*1.2;else if(dd<sr+sf){const t=(dd-sr)/sf;el-=(1-t)*.3}
    const in2=p2.octaveNoise(nx*8+100,ny*8+100,2,.5);if(dd>sr-.05&&dd<sr+.1&&in2>.5)el+=(in2-.5)*.5
    let terrain;if(el<-.08)terrain=TERRAIN.DEEP_WATER;else if(el<.02)terrain=TERRAIN.SAND;else if(el<.30)terrain=TERRAIN.EMPTY;else if(el<.50)terrain=TERRAIN.GRASS;else if(el<.70)terrain=TERRAIN.FOREST;else terrain=TERRAIN.MOUNTAIN
    row.push({x,y,terrain,elevation:el,resource:null,tileImage:TILE_IMAGES[terrain],road:ROAD.NONE,structure:null,units:[]})}
    map.push(row)}
  const{roadTypes,towns}=generateRoads(map,cols,rows,seed);for(let y=0;y<rows;y++)for(let x=0;x<cols;x++)map[y][x].road=roadTypes[y][x]
  placeResources(map,cols,rows,seed)
  const ps=findTL(map,cols,rows);if(ps)placeTC(map,ps.x,ps.y,TEAM.PLAYER)
  const es=findEnemyStart(map,cols,rows,ps);if(es)placeTC(map,es.x,es.y,TEAM.ENEMY)
  return{map,towns}}
