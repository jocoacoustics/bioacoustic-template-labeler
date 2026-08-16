'use strict';
(function(global){
  const anchors={
    magma:[[0,[0,0,4]],[.18,[45,17,95]],[.38,[116,30,116]],[.58,[181,54,122]],[.78,[246,113,92]],[1,[252,253,191]]],
    inferno:[[0,[0,0,4]],[.2,[66,10,104]],[.4,[147,38,103]],[.6,[221,81,58]],[.8,[252,165,10]],[1,[252,255,164]]],
    plasma:[[0,[13,8,135]],[.2,[106,0,168]],[.4,[177,42,144]],[.6,[225,100,98]],[.8,[252,166,54]],[1,[240,249,33]]],
    viridis:[[0,[68,1,84]],[.2,[59,82,139]],[.4,[33,145,140]],[.6,[94,201,98]],[.8,[170,220,50]],[1,[253,231,37]]],
    cividis:[[0,[0,32,77]],[.2,[37,71,106]],[.4,[85,104,116]],[.6,[139,137,116]],[.8,[194,175,105]],[1,[255,234,70]]],
    turbo:[[0,[48,18,59]],[.16,[50,96,209]],[.33,[25,190,196]],[.5,[91,252,89]],[.66,[238,208,45]],[.83,[245,87,25]],[1,[122,4,3]]],
    hot:[[0,[0,0,0]],[.33,[230,0,0]],[.66,[255,210,0]],[1,[255,255,255]]],
    // Magma clara: variante afinada para lectura científica sobre fondo marfil.
    magma_light:[[0,[255,254,250]],[.08,[255,248,237]],[.18,[253,225,196]],[.34,[246,166,127]],[.50,[222,100,132]],[.66,[177,61,128]],[.82,[105,36,112]],[.94,[54,22,88]],[1,[19,11,49]]],
    // Magma invertida: variante clara más cercana a la LUT invertida canónica.
    magma_r:[[0,[255,255,255]],[.10,[255,246,232]],[.28,[249,177,126]],[.48,[215,88,126]],[.67,[145,48,125]],[.84,[72,24,105]],[1,[8,5,28]]]
  };
  const clamp=x=>Math.max(0,Math.min(1,x));
  function interpolate(points,t){t=clamp(t);for(let i=1;i<points.length;i++){if(t<=points[i][0]){const [a,ca]=points[i-1],[b,cb]=points[i],u=(t-a)/Math.max(1e-9,b-a);return ca.map((v,j)=>Math.round(v+(cb[j]-v)*u));}}return points[points.length-1][1].slice();}
  function color(name,t){
    t=clamp(t);
    if(name==='gray'){const v=Math.round(t*255);return[v,v,v];}
    if(name==='gray_r'){const v=Math.round((1-t)*255);return[v,v,v];}
    if(anchors[name]) return interpolate(anchors[name],t);
    if(name && name.endsWith('_r')){
      const base=name.slice(0,-2);
      if(anchors[base]) return interpolate(anchors[base],1-t);
    }
    return interpolate(anchors.magma,t);
  }
  global.V45_COLORMAPS={color,names:['magma_light','magma_r','magma','inferno_r','inferno','plasma_r','plasma','viridis_r','viridis','cividis','turbo','hot','gray','gray_r']};
})(window);
