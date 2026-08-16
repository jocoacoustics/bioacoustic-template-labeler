'use strict';
let samples=null,sampleRate=0,duration=0;
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
function percentile(a,p){if(!a.length)return -100;a.sort((x,y)=>x-y);return a[Math.max(0,Math.min(a.length-1,Math.floor(p*(a.length-1))))];}
function fft(re,im){const n=re.length;let j=0;for(let i=1;i<n;i++){let bit=n>>1;for(;j&bit;bit>>=1)j^=bit;j^=bit;if(i<j){let x=re[i];re[i]=re[j];re[j]=x;x=im[i];im[i]=im[j];im[j]=x;}}for(let len=2;len<=n;len<<=1){const ang=-2*Math.PI/len,wlr=Math.cos(ang),wli=Math.sin(ang);for(let i=0;i<n;i+=len){let wr=1,wi=0;for(let k=0;k<len/2;k++){const ur=re[i+k],ui=im[i+k],vr=re[i+k+len/2]*wr-im[i+k+len/2]*wi,vi=re[i+k+len/2]*wi+im[i+k+len/2]*wr;re[i+k]=ur+vr;im[i+k]=ui+vi;re[i+k+len/2]=ur-vr;im[i+k+len/2]=ui-vi;const nwr=wr*wlr-wi*wli;wi=wr*wli+wi*wlr;wr=nwr;}}}}
function analyze(msg){
 const start=Math.max(0,msg.start),end=Math.min(duration,Math.max(start+1e-6,msg.end));
 const cols=Math.max(8,Math.floor(msg.cols)),nfft=Math.max(256,Math.floor(msg.nfft)),nbins=nfft/2+1;
 const q={rapida:2,media:4,alta:8,ultra:14}[msg.quality]||8;
 const s0=Math.floor(start*sampleRate),s1=Math.min(samples.length,Math.ceil(end*sampleRate)),usable=Math.max(nfft,s1-s0);
 const desired=Math.max(cols,Math.round(cols*q)),minHop=Math.max(1,Math.floor(nfft/16)),hop=Math.max(minHop,Math.floor(Math.max(1,usable-nfft)/Math.max(1,desired-1)));
 const mags=new Float32Array(cols*nbins),seen=new Uint8Array(cols),win=new Float32Array(nfft);for(let i=0;i<nfft;i++)win[i]=.5-.5*Math.cos(2*Math.PI*i/(nfft-1));
 const re=new Float32Array(nfft),im=new Float32Array(nfft);let frames=0;const totalFrames=Math.max(1,Math.ceil(Math.max(1,usable-nfft)/hop)+1);
 function one(pos,col){re.fill(0);im.fill(0);for(let i=0;i<nfft;i++)re[i]=(samples[pos+i]||0)*win[i];fft(re,im);const off=col*nbins;for(let b=0;b<nbins;b++){const mag=Math.hypot(re[b],im[b]);if(mag>mags[off+b])mags[off+b]=mag;}seen[col]=1;}
 const last=Math.max(s0,Math.min(samples.length-nfft,s1-nfft));
 for(let pos=s0;pos<=last;pos+=hop){const center=(pos+nfft*.5)/sampleRate,col=clamp(Math.floor((center-start)/(end-start)*cols),0,cols-1);one(pos,col);frames++;if(msg.overview&&frames%Math.max(1,Math.floor(totalFrames/4))===0)postMessage({type:'progress',epoch:msg.epoch,text:'Construyendo vista general... '+Math.min(99,Math.round(frames/totalFrames*100))+'%'});}
 for(let c=0;c<cols;c++)if(!seen[c]){const centerSample=Math.floor((start+(c+.5)/cols*(end-start))*sampleRate-nfft/2);one(clamp(centerSample,0,Math.max(0,samples.length-nfft)),c);}
 const db=new Float32Array(cols*nbins);for(let i=0;i<mags.length;i++)db[i]=20*Math.log10(mags[i]/nfft+1e-12);
 const vals=[],stride=Math.max(1,Math.floor(db.length/120000));for(let i=0;i<db.length;i+=stride)vals.push(db[i]);const vmin=percentile(vals,.04),vmax=percentile(vals,.995);
 postMessage({type:'result',id:msg.id,key:msg.key,epoch:msg.epoch,start,end,cols,rows:nbins,nfft,vmin,vmax,pps:cols/(end-start),overview:!!msg.overview,db:db.buffer},[db.buffer]);
}
onmessage=e=>{const m=e.data;if(m.type==='init'){samples=new Float32Array(m.samples);sampleRate=m.sampleRate;duration=m.duration;postMessage({type:'ready'});}else if(m.type==='analyze'){try{analyze(m);}catch(err){postMessage({type:'error',id:m.id,key:m.key,epoch:m.epoch,message:String(err&&err.stack||err)});}}};
