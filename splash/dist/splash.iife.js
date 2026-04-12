var SplashValis=function(Re){"use strict";var Xn=Object.defineProperty;var Wn=(Re,Oe,qe)=>Oe in Re?Xn(Re,Oe,{enumerable:!0,configurable:!0,writable:!0,value:qe}):Re[Oe]=qe;var B=(Re,Oe,qe)=>Wn(Re,typeof Oe!="symbol"?Oe+"":Oe,qe);function Oe(p,v){return class extends p{constructor(...G){super(...G),v(this)}}}const qe=Oe(Array,p=>p.fill(0));let k=1e-6;function an(p){function v(e=0,o=0){const n=new p(2);return e!==void 0&&(n[0]=e,o!==void 0&&(n[1]=o)),n}const G=v;function F(e,o,n){const r=n??new p(2);return r[0]=e,r[1]=o,r}function T(e,o){const n=o??new p(2);return n[0]=Math.ceil(e[0]),n[1]=Math.ceil(e[1]),n}function z(e,o){const n=o??new p(2);return n[0]=Math.floor(e[0]),n[1]=Math.floor(e[1]),n}function N(e,o){const n=o??new p(2);return n[0]=Math.round(e[0]),n[1]=Math.round(e[1]),n}function $(e,o=0,n=1,r){const u=r??new p(2);return u[0]=Math.min(n,Math.max(o,e[0])),u[1]=Math.min(n,Math.max(o,e[1])),u}function b(e,o,n){const r=n??new p(2);return r[0]=e[0]+o[0],r[1]=e[1]+o[1],r}function M(e,o,n,r){const u=r??new p(2);return u[0]=e[0]+o[0]*n,u[1]=e[1]+o[1]*n,u}function O(e,o){const n=e[0],r=e[1],u=o[0],x=o[1],m=Math.sqrt(n*n+r*r),c=Math.sqrt(u*u+x*x),a=m*c,h=a&&Y(e,o)/a;return Math.acos(h)}function X(e,o,n){const r=n??new p(2);return r[0]=e[0]-o[0],r[1]=e[1]-o[1],r}const W=X;function Q(e,o){return Math.abs(e[0]-o[0])<k&&Math.abs(e[1]-o[1])<k}function te(e,o){return e[0]===o[0]&&e[1]===o[1]}function re(e,o,n,r){const u=r??new p(2);return u[0]=e[0]+n*(o[0]-e[0]),u[1]=e[1]+n*(o[1]-e[1]),u}function ie(e,o,n,r){const u=r??new p(2);return u[0]=e[0]+n[0]*(o[0]-e[0]),u[1]=e[1]+n[1]*(o[1]-e[1]),u}function ee(e,o,n){const r=n??new p(2);return r[0]=Math.max(e[0],o[0]),r[1]=Math.max(e[1],o[1]),r}function H(e,o,n){const r=n??new p(2);return r[0]=Math.min(e[0],o[0]),r[1]=Math.min(e[1],o[1]),r}function L(e,o,n){const r=n??new p(2);return r[0]=e[0]*o,r[1]=e[1]*o,r}const ne=L;function se(e,o,n){const r=n??new p(2);return r[0]=e[0]/o,r[1]=e[1]/o,r}function J(e,o){const n=o??new p(2);return n[0]=1/e[0],n[1]=1/e[1],n}const K=J;function E(e,o,n){const r=n??new p(3),u=e[0]*o[1]-e[1]*o[0];return r[0]=0,r[1]=0,r[2]=u,r}function Y(e,o){return e[0]*o[0]+e[1]*o[1]}function Z(e){const o=e[0],n=e[1];return Math.sqrt(o*o+n*n)}const ce=Z;function A(e){const o=e[0],n=e[1];return o*o+n*n}const j=A;function R(e,o){const n=e[0]-o[0],r=e[1]-o[1];return Math.sqrt(n*n+r*r)}const xe=R;function le(e,o){const n=e[0]-o[0],r=e[1]-o[1];return n*n+r*r}const ye=le;function fe(e,o){const n=o??new p(2),r=e[0],u=e[1],x=Math.sqrt(r*r+u*u);return x>1e-5?(n[0]=r/x,n[1]=u/x):(n[0]=0,n[1]=0),n}function Ge(e,o){const n=o??new p(2);return n[0]=-e[0],n[1]=-e[1],n}function I(e,o){const n=o??new p(2);return n[0]=e[0],n[1]=e[1],n}const ae=I;function ue(e,o,n){const r=n??new p(2);return r[0]=e[0]*o[0],r[1]=e[1]*o[1],r}const ge=ue;function de(e,o,n){const r=n??new p(2);return r[0]=e[0]/o[0],r[1]=e[1]/o[1],r}const me=de;function we(e=1,o){const n=o??new p(2),r=Math.random()*2*Math.PI;return n[0]=Math.cos(r)*e,n[1]=Math.sin(r)*e,n}function i(e){const o=e??new p(2);return o[0]=0,o[1]=0,o}function d(e,o,n){const r=n??new p(2),u=e[0],x=e[1];return r[0]=u*o[0]+x*o[4]+o[12],r[1]=u*o[1]+x*o[5]+o[13],r}function t(e,o,n){const r=n??new p(2),u=e[0],x=e[1];return r[0]=o[0]*u+o[4]*x+o[8],r[1]=o[1]*u+o[5]*x+o[9],r}function s(e,o,n,r){const u=r??new p(2),x=e[0]-o[0],m=e[1]-o[1],c=Math.sin(n),a=Math.cos(n);return u[0]=x*a-m*c+o[0],u[1]=x*c+m*a+o[1],u}function l(e,o,n){const r=n??new p(2);return fe(e,r),L(r,o,r)}function f(e,o,n){const r=n??new p(2);return Z(e)>o?l(e,o,r):I(e,r)}function w(e,o,n){const r=n??new p(2);return re(e,o,.5,r)}return{create:v,fromValues:G,set:F,ceil:T,floor:z,round:N,clamp:$,add:b,addScaled:M,angle:O,subtract:X,sub:W,equalsApproximately:Q,equals:te,lerp:re,lerpV:ie,max:ee,min:H,mulScalar:L,scale:ne,divScalar:se,inverse:J,invert:K,cross:E,dot:Y,length:Z,len:ce,lengthSq:A,lenSq:j,distance:R,dist:xe,distanceSq:le,distSq:ye,normalize:fe,negate:Ge,copy:I,clone:ae,multiply:ue,mul:ge,divide:de,div:me,random:we,zero:i,transformMat4:d,transformMat3:t,rotate:s,setLength:l,truncate:f,midpoint:w}}const Qe=new Map;function Je(p){let v=Qe.get(p);return v||(v=an(p),Qe.set(p,v)),v}function ln(p){function v(c,a,h){const g=new p(3);return c!==void 0&&(g[0]=c,a!==void 0&&(g[1]=a,h!==void 0&&(g[2]=h))),g}const G=v;function F(c,a,h,g){const y=g??new p(3);return y[0]=c,y[1]=a,y[2]=h,y}function T(c,a){const h=a??new p(3);return h[0]=Math.ceil(c[0]),h[1]=Math.ceil(c[1]),h[2]=Math.ceil(c[2]),h}function z(c,a){const h=a??new p(3);return h[0]=Math.floor(c[0]),h[1]=Math.floor(c[1]),h[2]=Math.floor(c[2]),h}function N(c,a){const h=a??new p(3);return h[0]=Math.round(c[0]),h[1]=Math.round(c[1]),h[2]=Math.round(c[2]),h}function $(c,a=0,h=1,g){const y=g??new p(3);return y[0]=Math.min(h,Math.max(a,c[0])),y[1]=Math.min(h,Math.max(a,c[1])),y[2]=Math.min(h,Math.max(a,c[2])),y}function b(c,a,h){const g=h??new p(3);return g[0]=c[0]+a[0],g[1]=c[1]+a[1],g[2]=c[2]+a[2],g}function M(c,a,h,g){const y=g??new p(3);return y[0]=c[0]+a[0]*h,y[1]=c[1]+a[1]*h,y[2]=c[2]+a[2]*h,y}function O(c,a){const h=c[0],g=c[1],y=c[2],P=a[0],D=a[1],_=a[2],U=Math.sqrt(h*h+g*g+y*y),S=Math.sqrt(P*P+D*D+_*_),V=U*S,q=V&&Y(c,a)/V;return Math.acos(q)}function X(c,a,h){const g=h??new p(3);return g[0]=c[0]-a[0],g[1]=c[1]-a[1],g[2]=c[2]-a[2],g}const W=X;function Q(c,a){return Math.abs(c[0]-a[0])<k&&Math.abs(c[1]-a[1])<k&&Math.abs(c[2]-a[2])<k}function te(c,a){return c[0]===a[0]&&c[1]===a[1]&&c[2]===a[2]}function re(c,a,h,g){const y=g??new p(3);return y[0]=c[0]+h*(a[0]-c[0]),y[1]=c[1]+h*(a[1]-c[1]),y[2]=c[2]+h*(a[2]-c[2]),y}function ie(c,a,h,g){const y=g??new p(3);return y[0]=c[0]+h[0]*(a[0]-c[0]),y[1]=c[1]+h[1]*(a[1]-c[1]),y[2]=c[2]+h[2]*(a[2]-c[2]),y}function ee(c,a,h){const g=h??new p(3);return g[0]=Math.max(c[0],a[0]),g[1]=Math.max(c[1],a[1]),g[2]=Math.max(c[2],a[2]),g}function H(c,a,h){const g=h??new p(3);return g[0]=Math.min(c[0],a[0]),g[1]=Math.min(c[1],a[1]),g[2]=Math.min(c[2],a[2]),g}function L(c,a,h){const g=h??new p(3);return g[0]=c[0]*a,g[1]=c[1]*a,g[2]=c[2]*a,g}const ne=L;function se(c,a,h){const g=h??new p(3);return g[0]=c[0]/a,g[1]=c[1]/a,g[2]=c[2]/a,g}function J(c,a){const h=a??new p(3);return h[0]=1/c[0],h[1]=1/c[1],h[2]=1/c[2],h}const K=J;function E(c,a,h){const g=h??new p(3),y=c[2]*a[0]-c[0]*a[2],P=c[0]*a[1]-c[1]*a[0];return g[0]=c[1]*a[2]-c[2]*a[1],g[1]=y,g[2]=P,g}function Y(c,a){return c[0]*a[0]+c[1]*a[1]+c[2]*a[2]}function Z(c){const a=c[0],h=c[1],g=c[2];return Math.sqrt(a*a+h*h+g*g)}const ce=Z;function A(c){const a=c[0],h=c[1],g=c[2];return a*a+h*h+g*g}const j=A;function R(c,a){const h=c[0]-a[0],g=c[1]-a[1],y=c[2]-a[2];return Math.sqrt(h*h+g*g+y*y)}const xe=R;function le(c,a){const h=c[0]-a[0],g=c[1]-a[1],y=c[2]-a[2];return h*h+g*g+y*y}const ye=le;function fe(c,a){const h=a??new p(3),g=c[0],y=c[1],P=c[2],D=Math.sqrt(g*g+y*y+P*P);return D>1e-5?(h[0]=g/D,h[1]=y/D,h[2]=P/D):(h[0]=0,h[1]=0,h[2]=0),h}function Ge(c,a){const h=a??new p(3);return h[0]=-c[0],h[1]=-c[1],h[2]=-c[2],h}function I(c,a){const h=a??new p(3);return h[0]=c[0],h[1]=c[1],h[2]=c[2],h}const ae=I;function ue(c,a,h){const g=h??new p(3);return g[0]=c[0]*a[0],g[1]=c[1]*a[1],g[2]=c[2]*a[2],g}const ge=ue;function de(c,a,h){const g=h??new p(3);return g[0]=c[0]/a[0],g[1]=c[1]/a[1],g[2]=c[2]/a[2],g}const me=de;function we(c=1,a){const h=a??new p(3),g=Math.random()*2*Math.PI,y=Math.random()*2-1,P=Math.sqrt(1-y*y)*c;return h[0]=Math.cos(g)*P,h[1]=Math.sin(g)*P,h[2]=y*c,h}function i(c){const a=c??new p(3);return a[0]=0,a[1]=0,a[2]=0,a}function d(c,a,h){const g=h??new p(3),y=c[0],P=c[1],D=c[2],_=a[3]*y+a[7]*P+a[11]*D+a[15]||1;return g[0]=(a[0]*y+a[4]*P+a[8]*D+a[12])/_,g[1]=(a[1]*y+a[5]*P+a[9]*D+a[13])/_,g[2]=(a[2]*y+a[6]*P+a[10]*D+a[14])/_,g}function t(c,a,h){const g=h??new p(3),y=c[0],P=c[1],D=c[2];return g[0]=y*a[0]+P*a[4]+D*a[8],g[1]=y*a[1]+P*a[5]+D*a[9],g[2]=y*a[2]+P*a[6]+D*a[10],g}function s(c,a,h){const g=h??new p(3),y=c[0],P=c[1],D=c[2];return g[0]=y*a[0]+P*a[4]+D*a[8],g[1]=y*a[1]+P*a[5]+D*a[9],g[2]=y*a[2]+P*a[6]+D*a[10],g}function l(c,a,h){const g=h??new p(3),y=a[0],P=a[1],D=a[2],_=a[3]*2,U=c[0],S=c[1],V=c[2],q=P*V-D*S,C=D*U-y*V,oe=y*S-P*U;return g[0]=U+q*_+(P*oe-D*C)*2,g[1]=S+C*_+(D*q-y*oe)*2,g[2]=V+oe*_+(y*C-P*q)*2,g}function f(c,a){const h=a??new p(3);return h[0]=c[12],h[1]=c[13],h[2]=c[14],h}function w(c,a,h){const g=h??new p(3),y=a*4;return g[0]=c[y+0],g[1]=c[y+1],g[2]=c[y+2],g}function e(c,a){const h=a??new p(3),g=c[0],y=c[1],P=c[2],D=c[4],_=c[5],U=c[6],S=c[8],V=c[9],q=c[10];return h[0]=Math.sqrt(g*g+y*y+P*P),h[1]=Math.sqrt(D*D+_*_+U*U),h[2]=Math.sqrt(S*S+V*V+q*q),h}function o(c,a,h,g){const y=g??new p(3),P=[],D=[];return P[0]=c[0]-a[0],P[1]=c[1]-a[1],P[2]=c[2]-a[2],D[0]=P[0],D[1]=P[1]*Math.cos(h)-P[2]*Math.sin(h),D[2]=P[1]*Math.sin(h)+P[2]*Math.cos(h),y[0]=D[0]+a[0],y[1]=D[1]+a[1],y[2]=D[2]+a[2],y}function n(c,a,h,g){const y=g??new p(3),P=[],D=[];return P[0]=c[0]-a[0],P[1]=c[1]-a[1],P[2]=c[2]-a[2],D[0]=P[2]*Math.sin(h)+P[0]*Math.cos(h),D[1]=P[1],D[2]=P[2]*Math.cos(h)-P[0]*Math.sin(h),y[0]=D[0]+a[0],y[1]=D[1]+a[1],y[2]=D[2]+a[2],y}function r(c,a,h,g){const y=g??new p(3),P=[],D=[];return P[0]=c[0]-a[0],P[1]=c[1]-a[1],P[2]=c[2]-a[2],D[0]=P[0]*Math.cos(h)-P[1]*Math.sin(h),D[1]=P[0]*Math.sin(h)+P[1]*Math.cos(h),D[2]=P[2],y[0]=D[0]+a[0],y[1]=D[1]+a[1],y[2]=D[2]+a[2],y}function u(c,a,h){const g=h??new p(3);return fe(c,g),L(g,a,g)}function x(c,a,h){const g=h??new p(3);return Z(c)>a?u(c,a,g):I(c,g)}function m(c,a,h){const g=h??new p(3);return re(c,a,.5,g)}return{create:v,fromValues:G,set:F,ceil:T,floor:z,round:N,clamp:$,add:b,addScaled:M,angle:O,subtract:X,sub:W,equalsApproximately:Q,equals:te,lerp:re,lerpV:ie,max:ee,min:H,mulScalar:L,scale:ne,divScalar:se,inverse:J,invert:K,cross:E,dot:Y,length:Z,len:ce,lengthSq:A,lenSq:j,distance:R,dist:xe,distanceSq:le,distSq:ye,normalize:fe,negate:Ge,copy:I,clone:ae,multiply:ue,mul:ge,divide:de,div:me,random:we,zero:i,transformMat4:d,transformMat4Upper3x3:t,transformMat3:s,transformQuat:l,getTranslation:f,getAxis:w,getScaling:e,rotateX:o,rotateY:n,rotateZ:r,setLength:u,truncate:x,midpoint:m}}const Ke=new Map;function Xe(p){let v=Ke.get(p);return v||(v=ln(p),Ke.set(p,v)),v}function fn(p){const v=Je(p),G=Xe(p);function F(i,d,t,s,l,f,w,e,o){const n=new p(12);return n[3]=0,n[7]=0,n[11]=0,i!==void 0&&(n[0]=i,d!==void 0&&(n[1]=d,t!==void 0&&(n[2]=t,s!==void 0&&(n[4]=s,l!==void 0&&(n[5]=l,f!==void 0&&(n[6]=f,w!==void 0&&(n[8]=w,e!==void 0&&(n[9]=e,o!==void 0&&(n[10]=o))))))))),n}function T(i,d,t,s,l,f,w,e,o,n){const r=n??new p(12);return r[0]=i,r[1]=d,r[2]=t,r[3]=0,r[4]=s,r[5]=l,r[6]=f,r[7]=0,r[8]=w,r[9]=e,r[10]=o,r[11]=0,r}function z(i,d){const t=d??new p(12);return t[0]=i[0],t[1]=i[1],t[2]=i[2],t[3]=0,t[4]=i[4],t[5]=i[5],t[6]=i[6],t[7]=0,t[8]=i[8],t[9]=i[9],t[10]=i[10],t[11]=0,t}function N(i,d){const t=d??new p(12),s=i[0],l=i[1],f=i[2],w=i[3],e=s+s,o=l+l,n=f+f,r=s*e,u=l*e,x=l*o,m=f*e,c=f*o,a=f*n,h=w*e,g=w*o,y=w*n;return t[0]=1-x-a,t[1]=u+y,t[2]=m-g,t[3]=0,t[4]=u-y,t[5]=1-r-a,t[6]=c+h,t[7]=0,t[8]=m+g,t[9]=c-h,t[10]=1-r-x,t[11]=0,t}function $(i,d){const t=d??new p(12);return t[0]=-i[0],t[1]=-i[1],t[2]=-i[2],t[4]=-i[4],t[5]=-i[5],t[6]=-i[6],t[8]=-i[8],t[9]=-i[9],t[10]=-i[10],t}function b(i,d){const t=d??new p(12);return t[0]=i[0],t[1]=i[1],t[2]=i[2],t[4]=i[4],t[5]=i[5],t[6]=i[6],t[8]=i[8],t[9]=i[9],t[10]=i[10],t}const M=b;function O(i,d){return Math.abs(i[0]-d[0])<k&&Math.abs(i[1]-d[1])<k&&Math.abs(i[2]-d[2])<k&&Math.abs(i[4]-d[4])<k&&Math.abs(i[5]-d[5])<k&&Math.abs(i[6]-d[6])<k&&Math.abs(i[8]-d[8])<k&&Math.abs(i[9]-d[9])<k&&Math.abs(i[10]-d[10])<k}function X(i,d){return i[0]===d[0]&&i[1]===d[1]&&i[2]===d[2]&&i[4]===d[4]&&i[5]===d[5]&&i[6]===d[6]&&i[8]===d[8]&&i[9]===d[9]&&i[10]===d[10]}function W(i){const d=i??new p(12);return d[0]=1,d[1]=0,d[2]=0,d[4]=0,d[5]=1,d[6]=0,d[8]=0,d[9]=0,d[10]=1,d}function Q(i,d){const t=d??new p(12);if(t===i){let x;return x=i[1],i[1]=i[4],i[4]=x,x=i[2],i[2]=i[8],i[8]=x,x=i[6],i[6]=i[9],i[9]=x,t}const s=i[0*4+0],l=i[0*4+1],f=i[0*4+2],w=i[1*4+0],e=i[1*4+1],o=i[1*4+2],n=i[2*4+0],r=i[2*4+1],u=i[2*4+2];return t[0]=s,t[1]=w,t[2]=n,t[4]=l,t[5]=e,t[6]=r,t[8]=f,t[9]=o,t[10]=u,t}function te(i,d){const t=d??new p(12),s=i[0*4+0],l=i[0*4+1],f=i[0*4+2],w=i[1*4+0],e=i[1*4+1],o=i[1*4+2],n=i[2*4+0],r=i[2*4+1],u=i[2*4+2],x=u*e-o*r,m=-u*w+o*n,c=r*w-e*n,a=1/(s*x+l*m+f*c);return t[0]=x*a,t[1]=(-u*l+f*r)*a,t[2]=(o*l-f*e)*a,t[4]=m*a,t[5]=(u*s-f*n)*a,t[6]=(-o*s+f*w)*a,t[8]=c*a,t[9]=(-r*s+l*n)*a,t[10]=(e*s-l*w)*a,t}function re(i){const d=i[0],t=i[0*4+1],s=i[0*4+2],l=i[1*4+0],f=i[1*4+1],w=i[1*4+2],e=i[2*4+0],o=i[2*4+1],n=i[2*4+2];return d*(f*n-o*w)-l*(t*n-o*s)+e*(t*w-f*s)}const ie=te;function ee(i,d,t){const s=t??new p(12),l=i[0],f=i[1],w=i[2],e=i[4],o=i[5],n=i[6],r=i[8],u=i[9],x=i[10],m=d[0],c=d[1],a=d[2],h=d[4],g=d[5],y=d[6],P=d[8],D=d[9],_=d[10];return s[0]=l*m+e*c+r*a,s[1]=f*m+o*c+u*a,s[2]=w*m+n*c+x*a,s[4]=l*h+e*g+r*y,s[5]=f*h+o*g+u*y,s[6]=w*h+n*g+x*y,s[8]=l*P+e*D+r*_,s[9]=f*P+o*D+u*_,s[10]=w*P+n*D+x*_,s}const H=ee;function L(i,d,t){const s=t??W();return i!==s&&(s[0]=i[0],s[1]=i[1],s[2]=i[2],s[4]=i[4],s[5]=i[5],s[6]=i[6]),s[8]=d[0],s[9]=d[1],s[10]=1,s}function ne(i,d){const t=d??v.create();return t[0]=i[8],t[1]=i[9],t}function se(i,d,t){const s=t??v.create(),l=d*4;return s[0]=i[l+0],s[1]=i[l+1],s}function J(i,d,t,s){const l=s===i?i:b(i,s),f=t*4;return l[f+0]=d[0],l[f+1]=d[1],l}function K(i,d){const t=d??v.create(),s=i[0],l=i[1],f=i[4],w=i[5];return t[0]=Math.sqrt(s*s+l*l),t[1]=Math.sqrt(f*f+w*w),t}function E(i,d){const t=d??G.create(),s=i[0],l=i[1],f=i[2],w=i[4],e=i[5],o=i[6],n=i[8],r=i[9],u=i[10];return t[0]=Math.sqrt(s*s+l*l+f*f),t[1]=Math.sqrt(w*w+e*e+o*o),t[2]=Math.sqrt(n*n+r*r+u*u),t}function Y(i,d){const t=d??new p(12);return t[0]=1,t[1]=0,t[2]=0,t[4]=0,t[5]=1,t[6]=0,t[8]=i[0],t[9]=i[1],t[10]=1,t}function Z(i,d,t){const s=t??new p(12),l=d[0],f=d[1],w=i[0],e=i[1],o=i[2],n=i[1*4+0],r=i[1*4+1],u=i[1*4+2],x=i[2*4+0],m=i[2*4+1],c=i[2*4+2];return i!==s&&(s[0]=w,s[1]=e,s[2]=o,s[4]=n,s[5]=r,s[6]=u),s[8]=w*l+n*f+x,s[9]=e*l+r*f+m,s[10]=o*l+u*f+c,s}function ce(i,d){const t=d??new p(12),s=Math.cos(i),l=Math.sin(i);return t[0]=s,t[1]=l,t[2]=0,t[4]=-l,t[5]=s,t[6]=0,t[8]=0,t[9]=0,t[10]=1,t}function A(i,d,t){const s=t??new p(12),l=i[0*4+0],f=i[0*4+1],w=i[0*4+2],e=i[1*4+0],o=i[1*4+1],n=i[1*4+2],r=Math.cos(d),u=Math.sin(d);return s[0]=r*l+u*e,s[1]=r*f+u*o,s[2]=r*w+u*n,s[4]=r*e-u*l,s[5]=r*o-u*f,s[6]=r*n-u*w,i!==s&&(s[8]=i[8],s[9]=i[9],s[10]=i[10]),s}function j(i,d){const t=d??new p(12),s=Math.cos(i),l=Math.sin(i);return t[0]=1,t[1]=0,t[2]=0,t[4]=0,t[5]=s,t[6]=l,t[8]=0,t[9]=-l,t[10]=s,t}function R(i,d,t){const s=t??new p(12),l=i[4],f=i[5],w=i[6],e=i[8],o=i[9],n=i[10],r=Math.cos(d),u=Math.sin(d);return s[4]=r*l+u*e,s[5]=r*f+u*o,s[6]=r*w+u*n,s[8]=r*e-u*l,s[9]=r*o-u*f,s[10]=r*n-u*w,i!==s&&(s[0]=i[0],s[1]=i[1],s[2]=i[2]),s}function xe(i,d){const t=d??new p(12),s=Math.cos(i),l=Math.sin(i);return t[0]=s,t[1]=0,t[2]=-l,t[4]=0,t[5]=1,t[6]=0,t[8]=l,t[9]=0,t[10]=s,t}function le(i,d,t){const s=t??new p(12),l=i[0*4+0],f=i[0*4+1],w=i[0*4+2],e=i[2*4+0],o=i[2*4+1],n=i[2*4+2],r=Math.cos(d),u=Math.sin(d);return s[0]=r*l-u*e,s[1]=r*f-u*o,s[2]=r*w-u*n,s[8]=r*e+u*l,s[9]=r*o+u*f,s[10]=r*n+u*w,i!==s&&(s[4]=i[4],s[5]=i[5],s[6]=i[6]),s}const ye=ce,fe=A;function Ge(i,d){const t=d??new p(12);return t[0]=i[0],t[1]=0,t[2]=0,t[4]=0,t[5]=i[1],t[6]=0,t[8]=0,t[9]=0,t[10]=1,t}function I(i,d,t){const s=t??new p(12),l=d[0],f=d[1];return s[0]=l*i[0],s[1]=l*i[1],s[2]=l*i[2],s[4]=f*i[4],s[5]=f*i[5],s[6]=f*i[6],i!==s&&(s[8]=i[8],s[9]=i[9],s[10]=i[10]),s}function ae(i,d){const t=d??new p(12);return t[0]=i[0],t[1]=0,t[2]=0,t[4]=0,t[5]=i[1],t[6]=0,t[8]=0,t[9]=0,t[10]=i[2],t}function ue(i,d,t){const s=t??new p(12),l=d[0],f=d[1],w=d[2];return s[0]=l*i[0],s[1]=l*i[1],s[2]=l*i[2],s[4]=f*i[4],s[5]=f*i[5],s[6]=f*i[6],s[8]=w*i[8],s[9]=w*i[9],s[10]=w*i[10],s}function ge(i,d){const t=d??new p(12);return t[0]=i,t[1]=0,t[2]=0,t[4]=0,t[5]=i,t[6]=0,t[8]=0,t[9]=0,t[10]=1,t}function de(i,d,t){const s=t??new p(12);return s[0]=d*i[0],s[1]=d*i[1],s[2]=d*i[2],s[4]=d*i[4],s[5]=d*i[5],s[6]=d*i[6],i!==s&&(s[8]=i[8],s[9]=i[9],s[10]=i[10]),s}function me(i,d){const t=d??new p(12);return t[0]=i,t[1]=0,t[2]=0,t[4]=0,t[5]=i,t[6]=0,t[8]=0,t[9]=0,t[10]=i,t}function we(i,d,t){const s=t??new p(12);return s[0]=d*i[0],s[1]=d*i[1],s[2]=d*i[2],s[4]=d*i[4],s[5]=d*i[5],s[6]=d*i[6],s[8]=d*i[8],s[9]=d*i[9],s[10]=d*i[10],s}return{clone:M,create:F,set:T,fromMat4:z,fromQuat:N,negate:$,copy:b,equalsApproximately:O,equals:X,identity:W,transpose:Q,inverse:te,invert:ie,determinant:re,mul:H,multiply:ee,setTranslation:L,getTranslation:ne,getAxis:se,setAxis:J,getScaling:K,get3DScaling:E,translation:Y,translate:Z,rotation:ce,rotate:A,rotationX:j,rotateX:R,rotationY:xe,rotateY:le,rotationZ:ye,rotateZ:fe,scaling:Ge,scale:I,uniformScaling:ge,uniformScale:de,scaling3D:ae,scale3D:ue,uniformScaling3D:me,uniformScale3D:we}}const en=new Map;function dn(p){let v=en.get(p);return v||(v=fn(p),en.set(p,v)),v}function pn(p){const v=Xe(p);function G(e,o,n,r,u,x,m,c,a,h,g,y,P,D,_,U){const S=new p(16);return e!==void 0&&(S[0]=e,o!==void 0&&(S[1]=o,n!==void 0&&(S[2]=n,r!==void 0&&(S[3]=r,u!==void 0&&(S[4]=u,x!==void 0&&(S[5]=x,m!==void 0&&(S[6]=m,c!==void 0&&(S[7]=c,a!==void 0&&(S[8]=a,h!==void 0&&(S[9]=h,g!==void 0&&(S[10]=g,y!==void 0&&(S[11]=y,P!==void 0&&(S[12]=P,D!==void 0&&(S[13]=D,_!==void 0&&(S[14]=_,U!==void 0&&(S[15]=U)))))))))))))))),S}function F(e,o,n,r,u,x,m,c,a,h,g,y,P,D,_,U,S){const V=S??new p(16);return V[0]=e,V[1]=o,V[2]=n,V[3]=r,V[4]=u,V[5]=x,V[6]=m,V[7]=c,V[8]=a,V[9]=h,V[10]=g,V[11]=y,V[12]=P,V[13]=D,V[14]=_,V[15]=U,V}function T(e,o){const n=o??new p(16);return n[0]=e[0],n[1]=e[1],n[2]=e[2],n[3]=0,n[4]=e[4],n[5]=e[5],n[6]=e[6],n[7]=0,n[8]=e[8],n[9]=e[9],n[10]=e[10],n[11]=0,n[12]=0,n[13]=0,n[14]=0,n[15]=1,n}function z(e,o){const n=o??new p(16),r=e[0],u=e[1],x=e[2],m=e[3],c=r+r,a=u+u,h=x+x,g=r*c,y=u*c,P=u*a,D=x*c,_=x*a,U=x*h,S=m*c,V=m*a,q=m*h;return n[0]=1-P-U,n[1]=y+q,n[2]=D-V,n[3]=0,n[4]=y-q,n[5]=1-g-U,n[6]=_+S,n[7]=0,n[8]=D+V,n[9]=_-S,n[10]=1-g-P,n[11]=0,n[12]=0,n[13]=0,n[14]=0,n[15]=1,n}function N(e,o){const n=o??new p(16);return n[0]=-e[0],n[1]=-e[1],n[2]=-e[2],n[3]=-e[3],n[4]=-e[4],n[5]=-e[5],n[6]=-e[6],n[7]=-e[7],n[8]=-e[8],n[9]=-e[9],n[10]=-e[10],n[11]=-e[11],n[12]=-e[12],n[13]=-e[13],n[14]=-e[14],n[15]=-e[15],n}function $(e,o){const n=o??new p(16);return n[0]=e[0],n[1]=e[1],n[2]=e[2],n[3]=e[3],n[4]=e[4],n[5]=e[5],n[6]=e[6],n[7]=e[7],n[8]=e[8],n[9]=e[9],n[10]=e[10],n[11]=e[11],n[12]=e[12],n[13]=e[13],n[14]=e[14],n[15]=e[15],n}const b=$;function M(e,o){return Math.abs(e[0]-o[0])<k&&Math.abs(e[1]-o[1])<k&&Math.abs(e[2]-o[2])<k&&Math.abs(e[3]-o[3])<k&&Math.abs(e[4]-o[4])<k&&Math.abs(e[5]-o[5])<k&&Math.abs(e[6]-o[6])<k&&Math.abs(e[7]-o[7])<k&&Math.abs(e[8]-o[8])<k&&Math.abs(e[9]-o[9])<k&&Math.abs(e[10]-o[10])<k&&Math.abs(e[11]-o[11])<k&&Math.abs(e[12]-o[12])<k&&Math.abs(e[13]-o[13])<k&&Math.abs(e[14]-o[14])<k&&Math.abs(e[15]-o[15])<k}function O(e,o){return e[0]===o[0]&&e[1]===o[1]&&e[2]===o[2]&&e[3]===o[3]&&e[4]===o[4]&&e[5]===o[5]&&e[6]===o[6]&&e[7]===o[7]&&e[8]===o[8]&&e[9]===o[9]&&e[10]===o[10]&&e[11]===o[11]&&e[12]===o[12]&&e[13]===o[13]&&e[14]===o[14]&&e[15]===o[15]}function X(e){const o=e??new p(16);return o[0]=1,o[1]=0,o[2]=0,o[3]=0,o[4]=0,o[5]=1,o[6]=0,o[7]=0,o[8]=0,o[9]=0,o[10]=1,o[11]=0,o[12]=0,o[13]=0,o[14]=0,o[15]=1,o}function W(e,o){const n=o??new p(16);if(n===e){let C;return C=e[1],e[1]=e[4],e[4]=C,C=e[2],e[2]=e[8],e[8]=C,C=e[3],e[3]=e[12],e[12]=C,C=e[6],e[6]=e[9],e[9]=C,C=e[7],e[7]=e[13],e[13]=C,C=e[11],e[11]=e[14],e[14]=C,n}const r=e[0*4+0],u=e[0*4+1],x=e[0*4+2],m=e[0*4+3],c=e[1*4+0],a=e[1*4+1],h=e[1*4+2],g=e[1*4+3],y=e[2*4+0],P=e[2*4+1],D=e[2*4+2],_=e[2*4+3],U=e[3*4+0],S=e[3*4+1],V=e[3*4+2],q=e[3*4+3];return n[0]=r,n[1]=c,n[2]=y,n[3]=U,n[4]=u,n[5]=a,n[6]=P,n[7]=S,n[8]=x,n[9]=h,n[10]=D,n[11]=V,n[12]=m,n[13]=g,n[14]=_,n[15]=q,n}function Q(e,o){const n=o??new p(16),r=e[0*4+0],u=e[0*4+1],x=e[0*4+2],m=e[0*4+3],c=e[1*4+0],a=e[1*4+1],h=e[1*4+2],g=e[1*4+3],y=e[2*4+0],P=e[2*4+1],D=e[2*4+2],_=e[2*4+3],U=e[3*4+0],S=e[3*4+1],V=e[3*4+2],q=e[3*4+3],C=D*q,oe=V*_,pe=h*q,he=V*g,ve=h*_,Pe=D*g,De=x*q,Me=V*m,ze=x*_,be=D*m,Te=x*g,Se=h*m,_e=y*S,Ve=U*P,Ue=c*S,Fe=U*a,Ie=c*P,Ee=y*a,Ye=r*S,Ce=U*u,Ne=r*P,He=y*u,Ze=r*a,je=c*u,sn=C*a+he*P+ve*S-(oe*a+pe*P+Pe*S),on=oe*u+De*P+be*S-(C*u+Me*P+ze*S),cn=pe*u+Me*a+Te*S-(he*u+De*a+Se*S),un=Pe*u+ze*a+Se*P-(ve*u+be*a+Te*P),Be=1/(r*sn+c*on+y*cn+U*un);return n[0]=Be*sn,n[1]=Be*on,n[2]=Be*cn,n[3]=Be*un,n[4]=Be*(oe*c+pe*y+Pe*U-(C*c+he*y+ve*U)),n[5]=Be*(C*r+Me*y+ze*U-(oe*r+De*y+be*U)),n[6]=Be*(he*r+De*c+Se*U-(pe*r+Me*c+Te*U)),n[7]=Be*(ve*r+be*c+Te*y-(Pe*r+ze*c+Se*y)),n[8]=Be*(_e*g+Fe*_+Ie*q-(Ve*g+Ue*_+Ee*q)),n[9]=Be*(Ve*m+Ye*_+He*q-(_e*m+Ce*_+Ne*q)),n[10]=Be*(Ue*m+Ce*g+Ze*q-(Fe*m+Ye*g+je*q)),n[11]=Be*(Ee*m+Ne*g+je*_-(Ie*m+He*g+Ze*_)),n[12]=Be*(Ue*D+Ee*V+Ve*h-(Ie*V+_e*h+Fe*D)),n[13]=Be*(Ne*V+_e*x+Ce*D-(Ye*D+He*V+Ve*x)),n[14]=Be*(Ye*h+je*V+Fe*x-(Ze*V+Ue*x+Ce*h)),n[15]=Be*(Ze*D+Ie*x+He*h-(Ne*h+je*D+Ee*x)),n}function te(e){const o=e[0],n=e[0*4+1],r=e[0*4+2],u=e[0*4+3],x=e[1*4+0],m=e[1*4+1],c=e[1*4+2],a=e[1*4+3],h=e[2*4+0],g=e[2*4+1],y=e[2*4+2],P=e[2*4+3],D=e[3*4+0],_=e[3*4+1],U=e[3*4+2],S=e[3*4+3],V=y*S,q=U*P,C=c*S,oe=U*a,pe=c*P,he=y*a,ve=r*S,Pe=U*u,De=r*P,Me=y*u,ze=r*a,be=c*u,Te=V*m+oe*g+pe*_-(q*m+C*g+he*_),Se=q*n+ve*g+Me*_-(V*n+Pe*g+De*_),_e=C*n+Pe*m+ze*_-(oe*n+ve*m+be*_),Ve=he*n+De*m+be*g-(pe*n+Me*m+ze*g);return o*Te+x*Se+h*_e+D*Ve}const re=Q;function ie(e,o,n){const r=n??new p(16),u=e[0],x=e[1],m=e[2],c=e[3],a=e[4],h=e[5],g=e[6],y=e[7],P=e[8],D=e[9],_=e[10],U=e[11],S=e[12],V=e[13],q=e[14],C=e[15],oe=o[0],pe=o[1],he=o[2],ve=o[3],Pe=o[4],De=o[5],Me=o[6],ze=o[7],be=o[8],Te=o[9],Se=o[10],_e=o[11],Ve=o[12],Ue=o[13],Fe=o[14],Ie=o[15];return r[0]=u*oe+a*pe+P*he+S*ve,r[1]=x*oe+h*pe+D*he+V*ve,r[2]=m*oe+g*pe+_*he+q*ve,r[3]=c*oe+y*pe+U*he+C*ve,r[4]=u*Pe+a*De+P*Me+S*ze,r[5]=x*Pe+h*De+D*Me+V*ze,r[6]=m*Pe+g*De+_*Me+q*ze,r[7]=c*Pe+y*De+U*Me+C*ze,r[8]=u*be+a*Te+P*Se+S*_e,r[9]=x*be+h*Te+D*Se+V*_e,r[10]=m*be+g*Te+_*Se+q*_e,r[11]=c*be+y*Te+U*Se+C*_e,r[12]=u*Ve+a*Ue+P*Fe+S*Ie,r[13]=x*Ve+h*Ue+D*Fe+V*Ie,r[14]=m*Ve+g*Ue+_*Fe+q*Ie,r[15]=c*Ve+y*Ue+U*Fe+C*Ie,r}const ee=ie;function H(e,o,n){const r=n??X();return e!==r&&(r[0]=e[0],r[1]=e[1],r[2]=e[2],r[3]=e[3],r[4]=e[4],r[5]=e[5],r[6]=e[6],r[7]=e[7],r[8]=e[8],r[9]=e[9],r[10]=e[10],r[11]=e[11]),r[12]=o[0],r[13]=o[1],r[14]=o[2],r[15]=1,r}function L(e,o){const n=o??v.create();return n[0]=e[12],n[1]=e[13],n[2]=e[14],n}function ne(e,o,n){const r=n??v.create(),u=o*4;return r[0]=e[u+0],r[1]=e[u+1],r[2]=e[u+2],r}function se(e,o,n,r){const u=r===e?r:$(e,r),x=n*4;return u[x+0]=o[0],u[x+1]=o[1],u[x+2]=o[2],u}function J(e,o){const n=o??v.create(),r=e[0],u=e[1],x=e[2],m=e[4],c=e[5],a=e[6],h=e[8],g=e[9],y=e[10];return n[0]=Math.sqrt(r*r+u*u+x*x),n[1]=Math.sqrt(m*m+c*c+a*a),n[2]=Math.sqrt(h*h+g*g+y*y),n}function K(e,o,n,r,u){const x=u??new p(16),m=Math.tan(Math.PI*.5-.5*e);if(x[0]=m/o,x[1]=0,x[2]=0,x[3]=0,x[4]=0,x[5]=m,x[6]=0,x[7]=0,x[8]=0,x[9]=0,x[11]=-1,x[12]=0,x[13]=0,x[15]=0,Number.isFinite(r)){const c=1/(n-r);x[10]=r*c,x[14]=r*n*c}else x[10]=-1,x[14]=-n;return x}function E(e,o,n,r=1/0,u){const x=u??new p(16),m=1/Math.tan(e*.5);if(x[0]=m/o,x[1]=0,x[2]=0,x[3]=0,x[4]=0,x[5]=m,x[6]=0,x[7]=0,x[8]=0,x[9]=0,x[11]=-1,x[12]=0,x[13]=0,x[15]=0,r===1/0)x[10]=0,x[14]=n;else{const c=1/(r-n);x[10]=n*c,x[14]=r*n*c}return x}function Y(e,o,n,r,u,x,m){const c=m??new p(16);return c[0]=2/(o-e),c[1]=0,c[2]=0,c[3]=0,c[4]=0,c[5]=2/(r-n),c[6]=0,c[7]=0,c[8]=0,c[9]=0,c[10]=1/(u-x),c[11]=0,c[12]=(o+e)/(e-o),c[13]=(r+n)/(n-r),c[14]=u/(u-x),c[15]=1,c}function Z(e,o,n,r,u,x,m){const c=m??new p(16),a=o-e,h=r-n,g=u-x;return c[0]=2*u/a,c[1]=0,c[2]=0,c[3]=0,c[4]=0,c[5]=2*u/h,c[6]=0,c[7]=0,c[8]=(e+o)/a,c[9]=(r+n)/h,c[10]=x/g,c[11]=-1,c[12]=0,c[13]=0,c[14]=u*x/g,c[15]=0,c}function ce(e,o,n,r,u,x=1/0,m){const c=m??new p(16),a=o-e,h=r-n;if(c[0]=2*u/a,c[1]=0,c[2]=0,c[3]=0,c[4]=0,c[5]=2*u/h,c[6]=0,c[7]=0,c[8]=(e+o)/a,c[9]=(r+n)/h,c[11]=-1,c[12]=0,c[13]=0,c[15]=0,x===1/0)c[10]=0,c[14]=u;else{const g=1/(x-u);c[10]=u*g,c[14]=x*u*g}return c}const A=v.create(),j=v.create(),R=v.create();function xe(e,o,n,r){const u=r??new p(16);return v.normalize(v.subtract(o,e,R),R),v.normalize(v.cross(n,R,A),A),v.normalize(v.cross(R,A,j),j),u[0]=A[0],u[1]=A[1],u[2]=A[2],u[3]=0,u[4]=j[0],u[5]=j[1],u[6]=j[2],u[7]=0,u[8]=R[0],u[9]=R[1],u[10]=R[2],u[11]=0,u[12]=e[0],u[13]=e[1],u[14]=e[2],u[15]=1,u}function le(e,o,n,r){const u=r??new p(16);return v.normalize(v.subtract(e,o,R),R),v.normalize(v.cross(n,R,A),A),v.normalize(v.cross(R,A,j),j),u[0]=A[0],u[1]=A[1],u[2]=A[2],u[3]=0,u[4]=j[0],u[5]=j[1],u[6]=j[2],u[7]=0,u[8]=R[0],u[9]=R[1],u[10]=R[2],u[11]=0,u[12]=e[0],u[13]=e[1],u[14]=e[2],u[15]=1,u}function ye(e,o,n,r){const u=r??new p(16);return v.normalize(v.subtract(e,o,R),R),v.normalize(v.cross(n,R,A),A),v.normalize(v.cross(R,A,j),j),u[0]=A[0],u[1]=j[0],u[2]=R[0],u[3]=0,u[4]=A[1],u[5]=j[1],u[6]=R[1],u[7]=0,u[8]=A[2],u[9]=j[2],u[10]=R[2],u[11]=0,u[12]=-(A[0]*e[0]+A[1]*e[1]+A[2]*e[2]),u[13]=-(j[0]*e[0]+j[1]*e[1]+j[2]*e[2]),u[14]=-(R[0]*e[0]+R[1]*e[1]+R[2]*e[2]),u[15]=1,u}function fe(e,o){const n=o??new p(16);return n[0]=1,n[1]=0,n[2]=0,n[3]=0,n[4]=0,n[5]=1,n[6]=0,n[7]=0,n[8]=0,n[9]=0,n[10]=1,n[11]=0,n[12]=e[0],n[13]=e[1],n[14]=e[2],n[15]=1,n}function Ge(e,o,n){const r=n??new p(16),u=o[0],x=o[1],m=o[2],c=e[0],a=e[1],h=e[2],g=e[3],y=e[1*4+0],P=e[1*4+1],D=e[1*4+2],_=e[1*4+3],U=e[2*4+0],S=e[2*4+1],V=e[2*4+2],q=e[2*4+3],C=e[3*4+0],oe=e[3*4+1],pe=e[3*4+2],he=e[3*4+3];return e!==r&&(r[0]=c,r[1]=a,r[2]=h,r[3]=g,r[4]=y,r[5]=P,r[6]=D,r[7]=_,r[8]=U,r[9]=S,r[10]=V,r[11]=q),r[12]=c*u+y*x+U*m+C,r[13]=a*u+P*x+S*m+oe,r[14]=h*u+D*x+V*m+pe,r[15]=g*u+_*x+q*m+he,r}function I(e,o){const n=o??new p(16),r=Math.cos(e),u=Math.sin(e);return n[0]=1,n[1]=0,n[2]=0,n[3]=0,n[4]=0,n[5]=r,n[6]=u,n[7]=0,n[8]=0,n[9]=-u,n[10]=r,n[11]=0,n[12]=0,n[13]=0,n[14]=0,n[15]=1,n}function ae(e,o,n){const r=n??new p(16),u=e[4],x=e[5],m=e[6],c=e[7],a=e[8],h=e[9],g=e[10],y=e[11],P=Math.cos(o),D=Math.sin(o);return r[4]=P*u+D*a,r[5]=P*x+D*h,r[6]=P*m+D*g,r[7]=P*c+D*y,r[8]=P*a-D*u,r[9]=P*h-D*x,r[10]=P*g-D*m,r[11]=P*y-D*c,e!==r&&(r[0]=e[0],r[1]=e[1],r[2]=e[2],r[3]=e[3],r[12]=e[12],r[13]=e[13],r[14]=e[14],r[15]=e[15]),r}function ue(e,o){const n=o??new p(16),r=Math.cos(e),u=Math.sin(e);return n[0]=r,n[1]=0,n[2]=-u,n[3]=0,n[4]=0,n[5]=1,n[6]=0,n[7]=0,n[8]=u,n[9]=0,n[10]=r,n[11]=0,n[12]=0,n[13]=0,n[14]=0,n[15]=1,n}function ge(e,o,n){const r=n??new p(16),u=e[0*4+0],x=e[0*4+1],m=e[0*4+2],c=e[0*4+3],a=e[2*4+0],h=e[2*4+1],g=e[2*4+2],y=e[2*4+3],P=Math.cos(o),D=Math.sin(o);return r[0]=P*u-D*a,r[1]=P*x-D*h,r[2]=P*m-D*g,r[3]=P*c-D*y,r[8]=P*a+D*u,r[9]=P*h+D*x,r[10]=P*g+D*m,r[11]=P*y+D*c,e!==r&&(r[4]=e[4],r[5]=e[5],r[6]=e[6],r[7]=e[7],r[12]=e[12],r[13]=e[13],r[14]=e[14],r[15]=e[15]),r}function de(e,o){const n=o??new p(16),r=Math.cos(e),u=Math.sin(e);return n[0]=r,n[1]=u,n[2]=0,n[3]=0,n[4]=-u,n[5]=r,n[6]=0,n[7]=0,n[8]=0,n[9]=0,n[10]=1,n[11]=0,n[12]=0,n[13]=0,n[14]=0,n[15]=1,n}function me(e,o,n){const r=n??new p(16),u=e[0*4+0],x=e[0*4+1],m=e[0*4+2],c=e[0*4+3],a=e[1*4+0],h=e[1*4+1],g=e[1*4+2],y=e[1*4+3],P=Math.cos(o),D=Math.sin(o);return r[0]=P*u+D*a,r[1]=P*x+D*h,r[2]=P*m+D*g,r[3]=P*c+D*y,r[4]=P*a-D*u,r[5]=P*h-D*x,r[6]=P*g-D*m,r[7]=P*y-D*c,e!==r&&(r[8]=e[8],r[9]=e[9],r[10]=e[10],r[11]=e[11],r[12]=e[12],r[13]=e[13],r[14]=e[14],r[15]=e[15]),r}function we(e,o,n){const r=n??new p(16);let u=e[0],x=e[1],m=e[2];const c=Math.sqrt(u*u+x*x+m*m);u/=c,x/=c,m/=c;const a=u*u,h=x*x,g=m*m,y=Math.cos(o),P=Math.sin(o),D=1-y;return r[0]=a+(1-a)*y,r[1]=u*x*D+m*P,r[2]=u*m*D-x*P,r[3]=0,r[4]=u*x*D-m*P,r[5]=h+(1-h)*y,r[6]=x*m*D+u*P,r[7]=0,r[8]=u*m*D+x*P,r[9]=x*m*D-u*P,r[10]=g+(1-g)*y,r[11]=0,r[12]=0,r[13]=0,r[14]=0,r[15]=1,r}const i=we;function d(e,o,n,r){const u=r??new p(16);let x=o[0],m=o[1],c=o[2];const a=Math.sqrt(x*x+m*m+c*c);x/=a,m/=a,c/=a;const h=x*x,g=m*m,y=c*c,P=Math.cos(n),D=Math.sin(n),_=1-P,U=h+(1-h)*P,S=x*m*_+c*D,V=x*c*_-m*D,q=x*m*_-c*D,C=g+(1-g)*P,oe=m*c*_+x*D,pe=x*c*_+m*D,he=m*c*_-x*D,ve=y+(1-y)*P,Pe=e[0],De=e[1],Me=e[2],ze=e[3],be=e[4],Te=e[5],Se=e[6],_e=e[7],Ve=e[8],Ue=e[9],Fe=e[10],Ie=e[11];return u[0]=U*Pe+S*be+V*Ve,u[1]=U*De+S*Te+V*Ue,u[2]=U*Me+S*Se+V*Fe,u[3]=U*ze+S*_e+V*Ie,u[4]=q*Pe+C*be+oe*Ve,u[5]=q*De+C*Te+oe*Ue,u[6]=q*Me+C*Se+oe*Fe,u[7]=q*ze+C*_e+oe*Ie,u[8]=pe*Pe+he*be+ve*Ve,u[9]=pe*De+he*Te+ve*Ue,u[10]=pe*Me+he*Se+ve*Fe,u[11]=pe*ze+he*_e+ve*Ie,e!==u&&(u[12]=e[12],u[13]=e[13],u[14]=e[14],u[15]=e[15]),u}const t=d;function s(e,o){const n=o??new p(16);return n[0]=e[0],n[1]=0,n[2]=0,n[3]=0,n[4]=0,n[5]=e[1],n[6]=0,n[7]=0,n[8]=0,n[9]=0,n[10]=e[2],n[11]=0,n[12]=0,n[13]=0,n[14]=0,n[15]=1,n}function l(e,o,n){const r=n??new p(16),u=o[0],x=o[1],m=o[2];return r[0]=u*e[0],r[1]=u*e[1],r[2]=u*e[2],r[3]=u*e[3],r[4]=x*e[4],r[5]=x*e[5],r[6]=x*e[6],r[7]=x*e[7],r[8]=m*e[8],r[9]=m*e[9],r[10]=m*e[10],r[11]=m*e[11],e!==r&&(r[12]=e[12],r[13]=e[13],r[14]=e[14],r[15]=e[15]),r}function f(e,o){const n=o??new p(16);return n[0]=e,n[1]=0,n[2]=0,n[3]=0,n[4]=0,n[5]=e,n[6]=0,n[7]=0,n[8]=0,n[9]=0,n[10]=e,n[11]=0,n[12]=0,n[13]=0,n[14]=0,n[15]=1,n}function w(e,o,n){const r=n??new p(16);return r[0]=o*e[0],r[1]=o*e[1],r[2]=o*e[2],r[3]=o*e[3],r[4]=o*e[4],r[5]=o*e[5],r[6]=o*e[6],r[7]=o*e[7],r[8]=o*e[8],r[9]=o*e[9],r[10]=o*e[10],r[11]=o*e[11],e!==r&&(r[12]=e[12],r[13]=e[13],r[14]=e[14],r[15]=e[15]),r}return{create:G,set:F,fromMat3:T,fromQuat:z,negate:N,copy:$,clone:b,equalsApproximately:M,equals:O,identity:X,transpose:W,inverse:Q,determinant:te,invert:re,multiply:ie,mul:ee,setTranslation:H,getTranslation:L,getAxis:ne,setAxis:se,getScaling:J,perspective:K,perspectiveReverseZ:E,ortho:Y,frustum:Z,frustumReverseZ:ce,aim:xe,cameraAim:le,lookAt:ye,translation:fe,translate:Ge,rotationX:I,rotateX:ae,rotationY:ue,rotateY:ge,rotationZ:de,rotateZ:me,axisRotation:we,rotation:i,axisRotate:d,rotate:t,scaling:s,scale:l,uniformScaling:f,uniformScale:w}}const nn=new Map;function hn(p){let v=nn.get(p);return v||(v=pn(p),nn.set(p,v)),v}function xn(p){const v=Xe(p);function G(i,d,t,s){const l=new p(4);return i!==void 0&&(l[0]=i,d!==void 0&&(l[1]=d,t!==void 0&&(l[2]=t,s!==void 0&&(l[3]=s)))),l}const F=G;function T(i,d,t,s,l){const f=l??new p(4);return f[0]=i,f[1]=d,f[2]=t,f[3]=s,f}function z(i,d,t){const s=t??new p(4),l=d*.5,f=Math.sin(l);return s[0]=f*i[0],s[1]=f*i[1],s[2]=f*i[2],s[3]=Math.cos(l),s}function N(i,d){const t=d??v.create(3),s=Math.acos(i[3])*2,l=Math.sin(s*.5);return l>k?(t[0]=i[0]/l,t[1]=i[1]/l,t[2]=i[2]/l):(t[0]=1,t[1]=0,t[2]=0),{angle:s,axis:t}}function $(i,d){const t=Z(i,d);return Math.acos(2*t*t-1)}function b(i,d,t){const s=t??new p(4),l=i[0],f=i[1],w=i[2],e=i[3],o=d[0],n=d[1],r=d[2],u=d[3];return s[0]=l*u+e*o+f*r-w*n,s[1]=f*u+e*n+w*o-l*r,s[2]=w*u+e*r+l*n-f*o,s[3]=e*u-l*o-f*n-w*r,s}const M=b;function O(i,d,t){const s=t??new p(4),l=d*.5,f=i[0],w=i[1],e=i[2],o=i[3],n=Math.sin(l),r=Math.cos(l);return s[0]=f*r+o*n,s[1]=w*r+e*n,s[2]=e*r-w*n,s[3]=o*r-f*n,s}function X(i,d,t){const s=t??new p(4),l=d*.5,f=i[0],w=i[1],e=i[2],o=i[3],n=Math.sin(l),r=Math.cos(l);return s[0]=f*r-e*n,s[1]=w*r+o*n,s[2]=e*r+f*n,s[3]=o*r-w*n,s}function W(i,d,t){const s=t??new p(4),l=d*.5,f=i[0],w=i[1],e=i[2],o=i[3],n=Math.sin(l),r=Math.cos(l);return s[0]=f*r+w*n,s[1]=w*r-f*n,s[2]=e*r+o*n,s[3]=o*r-e*n,s}function Q(i,d,t,s){const l=s??new p(4),f=i[0],w=i[1],e=i[2],o=i[3];let n=d[0],r=d[1],u=d[2],x=d[3],m=f*n+w*r+e*u+o*x;m<0&&(m=-m,n=-n,r=-r,u=-u,x=-x);let c,a;if(1-m>k){const h=Math.acos(m),g=Math.sin(h);c=Math.sin((1-t)*h)/g,a=Math.sin(t*h)/g}else c=1-t,a=t;return l[0]=c*f+a*n,l[1]=c*w+a*r,l[2]=c*e+a*u,l[3]=c*o+a*x,l}function te(i,d){const t=d??new p(4),s=i[0],l=i[1],f=i[2],w=i[3],e=s*s+l*l+f*f+w*w,o=e?1/e:0;return t[0]=-s*o,t[1]=-l*o,t[2]=-f*o,t[3]=w*o,t}function re(i,d){const t=d??new p(4);return t[0]=-i[0],t[1]=-i[1],t[2]=-i[2],t[3]=i[3],t}function ie(i,d){const t=d??new p(4),s=i[0]+i[5]+i[10];if(s>0){const l=Math.sqrt(s+1);t[3]=.5*l;const f=.5/l;t[0]=(i[6]-i[9])*f,t[1]=(i[8]-i[2])*f,t[2]=(i[1]-i[4])*f}else{let l=0;i[5]>i[0]&&(l=1),i[10]>i[l*4+l]&&(l=2);const f=(l+1)%3,w=(l+2)%3,e=Math.sqrt(i[l*4+l]-i[f*4+f]-i[w*4+w]+1);t[l]=.5*e;const o=.5/e;t[3]=(i[f*4+w]-i[w*4+f])*o,t[f]=(i[f*4+l]+i[l*4+f])*o,t[w]=(i[w*4+l]+i[l*4+w])*o}return t}function ee(i,d,t,s,l){const f=l??new p(4),w=i*.5,e=d*.5,o=t*.5,n=Math.sin(w),r=Math.cos(w),u=Math.sin(e),x=Math.cos(e),m=Math.sin(o),c=Math.cos(o);switch(s){case"xyz":f[0]=n*x*c+r*u*m,f[1]=r*u*c-n*x*m,f[2]=r*x*m+n*u*c,f[3]=r*x*c-n*u*m;break;case"xzy":f[0]=n*x*c-r*u*m,f[1]=r*u*c-n*x*m,f[2]=r*x*m+n*u*c,f[3]=r*x*c+n*u*m;break;case"yxz":f[0]=n*x*c+r*u*m,f[1]=r*u*c-n*x*m,f[2]=r*x*m-n*u*c,f[3]=r*x*c+n*u*m;break;case"yzx":f[0]=n*x*c+r*u*m,f[1]=r*u*c+n*x*m,f[2]=r*x*m-n*u*c,f[3]=r*x*c-n*u*m;break;case"zxy":f[0]=n*x*c-r*u*m,f[1]=r*u*c+n*x*m,f[2]=r*x*m+n*u*c,f[3]=r*x*c-n*u*m;break;case"zyx":f[0]=n*x*c-r*u*m,f[1]=r*u*c+n*x*m,f[2]=r*x*m-n*u*c,f[3]=r*x*c+n*u*m;break;default:throw new Error(`Unknown rotation order: ${s}`)}return f}function H(i,d){const t=d??new p(4);return t[0]=i[0],t[1]=i[1],t[2]=i[2],t[3]=i[3],t}const L=H;function ne(i,d,t){const s=t??new p(4);return s[0]=i[0]+d[0],s[1]=i[1]+d[1],s[2]=i[2]+d[2],s[3]=i[3]+d[3],s}function se(i,d,t){const s=t??new p(4);return s[0]=i[0]-d[0],s[1]=i[1]-d[1],s[2]=i[2]-d[2],s[3]=i[3]-d[3],s}const J=se;function K(i,d,t){const s=t??new p(4);return s[0]=i[0]*d,s[1]=i[1]*d,s[2]=i[2]*d,s[3]=i[3]*d,s}const E=K;function Y(i,d,t){const s=t??new p(4);return s[0]=i[0]/d,s[1]=i[1]/d,s[2]=i[2]/d,s[3]=i[3]/d,s}function Z(i,d){return i[0]*d[0]+i[1]*d[1]+i[2]*d[2]+i[3]*d[3]}function ce(i,d,t,s){const l=s??new p(4);return l[0]=i[0]+t*(d[0]-i[0]),l[1]=i[1]+t*(d[1]-i[1]),l[2]=i[2]+t*(d[2]-i[2]),l[3]=i[3]+t*(d[3]-i[3]),l}function A(i){const d=i[0],t=i[1],s=i[2],l=i[3];return Math.sqrt(d*d+t*t+s*s+l*l)}const j=A;function R(i){const d=i[0],t=i[1],s=i[2],l=i[3];return d*d+t*t+s*s+l*l}const xe=R;function le(i,d){const t=d??new p(4),s=i[0],l=i[1],f=i[2],w=i[3],e=Math.sqrt(s*s+l*l+f*f+w*w);return e>1e-5?(t[0]=s/e,t[1]=l/e,t[2]=f/e,t[3]=w/e):(t[0]=0,t[1]=0,t[2]=0,t[3]=1),t}function ye(i,d){return Math.abs(i[0]-d[0])<k&&Math.abs(i[1]-d[1])<k&&Math.abs(i[2]-d[2])<k&&Math.abs(i[3]-d[3])<k}function fe(i,d){return i[0]===d[0]&&i[1]===d[1]&&i[2]===d[2]&&i[3]===d[3]}function Ge(i){const d=i??new p(4);return d[0]=0,d[1]=0,d[2]=0,d[3]=1,d}const I=v.create(),ae=v.create(),ue=v.create();function ge(i,d,t){const s=t??new p(4),l=v.dot(i,d);return l<-.999999?(v.cross(ae,i,I),v.len(I)<1e-6&&v.cross(ue,i,I),v.normalize(I,I),z(I,Math.PI,s),s):l>.999999?(s[0]=0,s[1]=0,s[2]=0,s[3]=1,s):(v.cross(i,d,I),s[0]=I[0],s[1]=I[1],s[2]=I[2],s[3]=1+l,le(s,s))}const de=new p(4),me=new p(4);function we(i,d,t,s,l,f){const w=f??new p(4);return Q(i,s,l,de),Q(d,t,l,me),Q(de,me,2*l*(1-l),w),w}return{create:G,fromValues:F,set:T,fromAxisAngle:z,toAxisAngle:N,angle:$,multiply:b,mul:M,rotateX:O,rotateY:X,rotateZ:W,slerp:Q,inverse:te,conjugate:re,fromMat:ie,fromEuler:ee,copy:H,clone:L,add:ne,subtract:se,sub:J,mulScalar:K,scale:E,divScalar:Y,dot:Z,lerp:ce,length:A,len:j,lengthSq:R,lenSq:xe,normalize:le,equalsApproximately:ye,equals:fe,identity:Ge,rotationTo:ge,sqlerp:we}}const tn=new Map;function gn(p){let v=tn.get(p);return v||(v=xn(p),tn.set(p,v)),v}function wn(p){function v(t,s,l,f){const w=new p(4);return t!==void 0&&(w[0]=t,s!==void 0&&(w[1]=s,l!==void 0&&(w[2]=l,f!==void 0&&(w[3]=f)))),w}const G=v;function F(t,s,l,f,w){const e=w??new p(4);return e[0]=t,e[1]=s,e[2]=l,e[3]=f,e}function T(t,s){const l=s??new p(4);return l[0]=Math.ceil(t[0]),l[1]=Math.ceil(t[1]),l[2]=Math.ceil(t[2]),l[3]=Math.ceil(t[3]),l}function z(t,s){const l=s??new p(4);return l[0]=Math.floor(t[0]),l[1]=Math.floor(t[1]),l[2]=Math.floor(t[2]),l[3]=Math.floor(t[3]),l}function N(t,s){const l=s??new p(4);return l[0]=Math.round(t[0]),l[1]=Math.round(t[1]),l[2]=Math.round(t[2]),l[3]=Math.round(t[3]),l}function $(t,s=0,l=1,f){const w=f??new p(4);return w[0]=Math.min(l,Math.max(s,t[0])),w[1]=Math.min(l,Math.max(s,t[1])),w[2]=Math.min(l,Math.max(s,t[2])),w[3]=Math.min(l,Math.max(s,t[3])),w}function b(t,s,l){const f=l??new p(4);return f[0]=t[0]+s[0],f[1]=t[1]+s[1],f[2]=t[2]+s[2],f[3]=t[3]+s[3],f}function M(t,s,l,f){const w=f??new p(4);return w[0]=t[0]+s[0]*l,w[1]=t[1]+s[1]*l,w[2]=t[2]+s[2]*l,w[3]=t[3]+s[3]*l,w}function O(t,s,l){const f=l??new p(4);return f[0]=t[0]-s[0],f[1]=t[1]-s[1],f[2]=t[2]-s[2],f[3]=t[3]-s[3],f}const X=O;function W(t,s){return Math.abs(t[0]-s[0])<k&&Math.abs(t[1]-s[1])<k&&Math.abs(t[2]-s[2])<k&&Math.abs(t[3]-s[3])<k}function Q(t,s){return t[0]===s[0]&&t[1]===s[1]&&t[2]===s[2]&&t[3]===s[3]}function te(t,s,l,f){const w=f??new p(4);return w[0]=t[0]+l*(s[0]-t[0]),w[1]=t[1]+l*(s[1]-t[1]),w[2]=t[2]+l*(s[2]-t[2]),w[3]=t[3]+l*(s[3]-t[3]),w}function re(t,s,l,f){const w=f??new p(4);return w[0]=t[0]+l[0]*(s[0]-t[0]),w[1]=t[1]+l[1]*(s[1]-t[1]),w[2]=t[2]+l[2]*(s[2]-t[2]),w[3]=t[3]+l[3]*(s[3]-t[3]),w}function ie(t,s,l){const f=l??new p(4);return f[0]=Math.max(t[0],s[0]),f[1]=Math.max(t[1],s[1]),f[2]=Math.max(t[2],s[2]),f[3]=Math.max(t[3],s[3]),f}function ee(t,s,l){const f=l??new p(4);return f[0]=Math.min(t[0],s[0]),f[1]=Math.min(t[1],s[1]),f[2]=Math.min(t[2],s[2]),f[3]=Math.min(t[3],s[3]),f}function H(t,s,l){const f=l??new p(4);return f[0]=t[0]*s,f[1]=t[1]*s,f[2]=t[2]*s,f[3]=t[3]*s,f}const L=H;function ne(t,s,l){const f=l??new p(4);return f[0]=t[0]/s,f[1]=t[1]/s,f[2]=t[2]/s,f[3]=t[3]/s,f}function se(t,s){const l=s??new p(4);return l[0]=1/t[0],l[1]=1/t[1],l[2]=1/t[2],l[3]=1/t[3],l}const J=se;function K(t,s){return t[0]*s[0]+t[1]*s[1]+t[2]*s[2]+t[3]*s[3]}function E(t){const s=t[0],l=t[1],f=t[2],w=t[3];return Math.sqrt(s*s+l*l+f*f+w*w)}const Y=E;function Z(t){const s=t[0],l=t[1],f=t[2],w=t[3];return s*s+l*l+f*f+w*w}const ce=Z;function A(t,s){const l=t[0]-s[0],f=t[1]-s[1],w=t[2]-s[2],e=t[3]-s[3];return Math.sqrt(l*l+f*f+w*w+e*e)}const j=A;function R(t,s){const l=t[0]-s[0],f=t[1]-s[1],w=t[2]-s[2],e=t[3]-s[3];return l*l+f*f+w*w+e*e}const xe=R;function le(t,s){const l=s??new p(4),f=t[0],w=t[1],e=t[2],o=t[3],n=Math.sqrt(f*f+w*w+e*e+o*o);return n>1e-5?(l[0]=f/n,l[1]=w/n,l[2]=e/n,l[3]=o/n):(l[0]=0,l[1]=0,l[2]=0,l[3]=0),l}function ye(t,s){const l=s??new p(4);return l[0]=-t[0],l[1]=-t[1],l[2]=-t[2],l[3]=-t[3],l}function fe(t,s){const l=s??new p(4);return l[0]=t[0],l[1]=t[1],l[2]=t[2],l[3]=t[3],l}const Ge=fe;function I(t,s,l){const f=l??new p(4);return f[0]=t[0]*s[0],f[1]=t[1]*s[1],f[2]=t[2]*s[2],f[3]=t[3]*s[3],f}const ae=I;function ue(t,s,l){const f=l??new p(4);return f[0]=t[0]/s[0],f[1]=t[1]/s[1],f[2]=t[2]/s[2],f[3]=t[3]/s[3],f}const ge=ue;function de(t){const s=t??new p(4);return s[0]=0,s[1]=0,s[2]=0,s[3]=0,s}function me(t,s,l){const f=l??new p(4),w=t[0],e=t[1],o=t[2],n=t[3];return f[0]=s[0]*w+s[4]*e+s[8]*o+s[12]*n,f[1]=s[1]*w+s[5]*e+s[9]*o+s[13]*n,f[2]=s[2]*w+s[6]*e+s[10]*o+s[14]*n,f[3]=s[3]*w+s[7]*e+s[11]*o+s[15]*n,f}function we(t,s,l){const f=l??new p(4);return le(t,f),H(f,s,f)}function i(t,s,l){const f=l??new p(4);return E(t)>s?we(t,s,f):fe(t,f)}function d(t,s,l){const f=l??new p(4);return te(t,s,.5,f)}return{create:v,fromValues:G,set:F,ceil:T,floor:z,round:N,clamp:$,add:b,addScaled:M,subtract:O,sub:X,equalsApproximately:W,equals:Q,lerp:te,lerpV:re,max:ie,min:ee,mulScalar:H,scale:L,divScalar:ne,inverse:se,invert:J,dot:K,length:E,len:Y,lengthSq:Z,lenSq:ce,distance:A,dist:j,distanceSq:R,distSq:xe,normalize:le,negate:ye,copy:fe,clone:Ge,multiply:I,mul:ae,divide:ue,div:ge,zero:de,transformMat4:me,setLength:we,truncate:i,midpoint:d}}const rn=new Map;function vn(p){let v=rn.get(p);return v||(v=wn(p),rn.set(p,v)),v}function $e(p,v,G,F,T,z){return{mat3:dn(p),mat4:hn(v),quat:gn(G),vec2:Je(F),vec3:Xe(T),vec4:vn(z)}}const{mat3:En,mat4:We,quat:Yn,vec2:Cn,vec3:Nn,vec4:Hn}=$e(Float32Array,Float32Array,Float32Array,Float32Array,Float32Array,Float32Array);$e(Float64Array,Float64Array,Float64Array,Float64Array,Float64Array,Float64Array),$e(qe,Array,Array,Array,Array,Array);var yn=`struct Cell {\r
    vx: i32, \r
    vy: i32, \r
    vz: i32, \r
    mass: i32, \r
}

@group(0) @binding(0) var<storage, read_write> cells: array<Cell>;

@compute @workgroup_size(64)\r
fn clearGrid(@builtin(global_invocation_id) id: vec3<u32>) {\r
    if (id.x < arrayLength(&cells)) {\r
        cells[id.x].mass = 0;\r
        cells[id.x].vx = 0;\r
        cells[id.x].vy = 0;\r
        cells[id.x].vz = 0;\r
    }\r
}`,mn=`struct Particle {\r
    position: vec3f, \r
    v: vec3f, \r
    C: mat3x3f, \r
}\r
struct Cell {\r
    vx: atomic<i32>, \r
    vy: atomic<i32>, \r
    vz: atomic<i32>, \r
    mass: atomic<i32>, \r
}

override fixedPointMultiplier: f32; 

fn encodeFixedPoint(floatingPoint: f32) -> i32 {\r
	return i32(floatingPoint * fixedPointMultiplier);\r
}

@group(0) @binding(0) var<storage, read> particles: array<Particle>;\r
@group(0) @binding(1) var<storage, read_write> cells: array<Cell>;\r
@group(0) @binding(2) var<uniform> initBoxSize: vec3f;\r
@group(0) @binding(3) var<uniform> numParticles: u32;

@compute @workgroup_size(64)\r
fn p2g_1(@builtin(global_invocation_id) id: vec3<u32>) {\r
    if (id.x < numParticles) {\r
        var weights: array<vec3f, 3>;

        let particle = particles[id.x];\r
        let cellIndex: vec3f = floor(particle.position);\r
        let cellDiff: vec3f = particle.position - (cellIndex + 0.5f);\r
        weights[0] = 0.5f * (0.5f - cellDiff) * (0.5f - cellDiff);\r
        weights[1] = 0.75f - cellDiff * cellDiff;\r
        weights[2] = 0.5f * (0.5f + cellDiff) * (0.5f + cellDiff);

        let C: mat3x3f = particle.C;

        for (var gx = 0; gx < 3; gx++) {\r
            for (var gy = 0; gy < 3; gy++) {\r
                for (var gz = 0; gz < 3; gz++) {\r
                    let weight: f32 = weights[gx].x * weights[gy].y * weights[gz].z;\r
                    let cellX: vec3f = vec3f(\r
                            cellIndex.x + f32(gx) - 1., \r
                            cellIndex.y + f32(gy) - 1.,\r
                            cellIndex.z + f32(gz) - 1.  \r
                        );\r
                    let cellDist = (cellX + 0.5f) - particle.position;

                    let Q: vec3f = C * cellDist;

                    let massContrib: f32 = weight * 1.0; 
                    let velContrib: vec3f = massContrib * (particle.v + Q);\r
                    let cellIndex1D: i32 = \r
                        i32(cellX.x) * i32(initBoxSize.y) * i32(initBoxSize.z) + \r
                        i32(cellX.y) * i32(initBoxSize.z) + \r
                        i32(cellX.z);\r
                    atomicAdd(&cells[cellIndex1D].mass, encodeFixedPoint(massContrib));\r
                    atomicAdd(&cells[cellIndex1D].vx, encodeFixedPoint(velContrib.x));\r
                    atomicAdd(&cells[cellIndex1D].vy, encodeFixedPoint(velContrib.y));\r
                    atomicAdd(&cells[cellIndex1D].vz, encodeFixedPoint(velContrib.z));\r
                }\r
            }\r
        }\r
    }\r
}`,Pn=`struct Particle {\r
    position: vec3f, \r
    v: vec3f, \r
    C: mat3x3f, \r
}\r
struct Cell {\r
    vx: atomic<i32>, \r
    vy: atomic<i32>, \r
    vz: atomic<i32>, \r
    mass: i32, \r
}

override fixedPointMultiplier: f32; \r
override fixedPointMultiplierInverse: f32; \r
override stiffness: f32;\r
override restDensity: f32;\r
override dynamicViscosity: f32;

fn encodeFixedPoint(floatingPoint: f32) -> i32 {\r
	return i32(floatingPoint * fixedPointMultiplier);\r
}\r
fn decodeFixedPoint(fixedPoint: i32) -> f32 {\r
	return f32(fixedPoint) * fixedPointMultiplierInverse;\r
}

@group(0) @binding(0) var<storage, read> particles: array<Particle>;\r
@group(0) @binding(1) var<storage, read_write> cells: array<Cell>;\r
@group(0) @binding(2) var<uniform> initBoxSize: vec3f;\r
@group(0) @binding(3) var<uniform> numParticles: u32;\r
@group(0) @binding(4) var<storage, read_write> densities: array<f32>;\r
@group(0) @binding(5) var<uniform> dt: f32;

@compute @workgroup_size(64)\r
fn p2g_2(@builtin(global_invocation_id) id: vec3<u32>) {\r
    if (id.x < numParticles) {\r
        var weights: array<vec3f, 3>;

        let particle = particles[id.x];\r
        let cellIndex: vec3f = floor(particle.position);\r
        let cellDiff: vec3f = particle.position - (cellIndex + 0.5f);\r
        weights[0] = 0.5f * (0.5f - cellDiff) * (0.5f - cellDiff);\r
        weights[1] = 0.75f - cellDiff * cellDiff;\r
        weights[2] = 0.5f * (0.5f + cellDiff) * (0.5f + cellDiff);

        var density: f32 = 0.;\r
        for (var gx = 0; gx < 3; gx++) {\r
            for (var gy = 0; gy < 3; gy++) {    \r
                for (var gz = 0; gz < 3; gz++) {\r
                    let weight: f32 = weights[gx].x * weights[gy].y * weights[gz].z;\r
                    let cellX: vec3f = vec3f(\r
                            cellIndex.x + f32(gx) - 1., \r
                            cellIndex.y + f32(gy) - 1.,\r
                            cellIndex.z + f32(gz) - 1.  \r
                        );\r
                    let cellIndex1D: i32 = \r
                        i32(cellX.x) * i32(initBoxSize.y) * i32(initBoxSize.z) + \r
                        i32(cellX.y) * i32(initBoxSize.z) + \r
                        i32(cellX.z);\r
                    density += decodeFixedPoint(cells[cellIndex1D].mass) * weight;\r
                }\r
            }\r
        }

        let volume: f32 = 1.0 / density; 
        densities[id.x] = density;

        let pressure: f32 = max(-0.0, stiffness * (pow(density / restDensity, 1.) - 1));

        var stress: mat3x3f = mat3x3f(-pressure, 0, 0, 0, -pressure, 0, 0, 0, -pressure);\r
        let dudv: mat3x3f = particle.C;\r
        let strain: mat3x3f = dudv + transpose(dudv);\r
        stress += dynamicViscosity * strain;

        let eq_16_term0 = -volume * 4 * stress * dt;

        for (var gx = 0; gx < 3; gx++) {\r
            for (var gy = 0; gy < 3; gy++) {\r
                for (var gz = 0; gz < 3; gz++) {\r
                    let weight: f32 = weights[gx].x * weights[gy].y * weights[gz].z;\r
                    let cellX: vec3f = vec3f(\r
                            cellIndex.x + f32(gx) - 1., \r
                            cellIndex.y + f32(gy) - 1.,\r
                            cellIndex.z + f32(gz) - 1.  \r
                        );\r
                    let cellDist = (cellX + 0.5f) - particle.position;\r
                    let cellIndex1D: i32 = \r
                        i32(cellX.x) * i32(initBoxSize.y) * i32(initBoxSize.z) + \r
                        i32(cellX.y) * i32(initBoxSize.z) + \r
                        i32(cellX.z);\r
                    let momentum: vec3f = eq_16_term0 * weight * cellDist;\r
                    atomicAdd(&cells[cellIndex1D].vx, encodeFixedPoint(momentum.x));\r
                    atomicAdd(&cells[cellIndex1D].vy, encodeFixedPoint(momentum.y));\r
                    atomicAdd(&cells[cellIndex1D].vz, encodeFixedPoint(momentum.z));\r
                }\r
            }\r
        }\r
    }\r
}`,Dn=`struct Cell {\r
    vx: i32, \r
    vy: i32, \r
    vz: i32, \r
    mass: i32, \r
}\r
struct RenderUniforms {\r
    texelSize: vec2f, \r
    sphereSize: f32, \r
    invProjectionMatrix: mat4x4f, \r
    projectionMatrix: mat4x4f, \r
    viewMatrix: mat4x4f, \r
    invViewMatrix: mat4x4f, \r
}\r
struct MouseInfo {\r
    screenSize: vec2f, \r
    mouseCoord : vec2f, \r
    mouseVel : vec2f, \r
    mouseRadius: f32, \r
}

override fixedPointMultiplier: f32; \r
override fixedPointMultiplierInverse: f32; 

@group(0) @binding(0) var<storage, read_write> cells: array<Cell>;\r
@group(0) @binding(1) var<uniform> realBoxSize: vec3f;\r
@group(0) @binding(2) var<uniform> initBoxSize: vec3f;\r
@group(0) @binding(3) var<uniform> uniforms: RenderUniforms;\r
@group(0) @binding(4) var depthTexture: texture_2d<f32>;\r
@group(0) @binding(5) var<uniform> mouseInfo: MouseInfo;\r
@group(0) @binding(6) var<uniform> dt: f32;\r
@group(0) @binding(7) var solidTex: texture_2d<u32>; 

fn encodeFixedPoint(floatingPoint: f32) -> i32 {\r
	return i32(floatingPoint * fixedPointMultiplier);\r
}\r
fn decodeFixedPoint(fixedPoint: i32) -> f32 {\r
	return f32(fixedPoint) * fixedPointMultiplierInverse;\r
}

fn computeViewPosFromUVDepth(tex_coord: vec2f, depth: f32) -> vec3f {\r
    var ndc: vec4f = vec4f(tex_coord.x * 2.0 - 1.0, 1.0 - 2.0 * tex_coord.y, 0.0, 1.0);\r
    ndc.z = -uniforms.projectionMatrix[2].z + uniforms.projectionMatrix[3].z / depth;\r
    ndc.w = 1.0;

    var eye_pos: vec4f = uniforms.invProjectionMatrix * ndc;

    return eye_pos.xyz / eye_pos.w;\r
}

fn getViewPosFromTexCoord(tex_coord: vec2f, iuv: vec2f) -> vec3f {\r
    var depth: f32 = abs(textureLoad(depthTexture, vec2u(iuv), 0).x);\r
    return computeViewPosFromUVDepth(tex_coord, depth);\r
}

@compute @workgroup_size(64)\r
fn updateGrid(@builtin(global_invocation_id) id: vec3<u32>) {\r
    if (id.x < arrayLength(&cells)) { 
        let uv: vec2f = mouseInfo.mouseCoord;\r
        let iuv = uv * mouseInfo.screenSize;\r
        let depth: f32 = abs(textureLoad(depthTexture, vec2u(iuv), 0).x);\r
        var mouseCellIndex: u32 = 1000000000; 
        var cellSquareDistToMouse: f32 = 1e9;\r
        var forceDir = vec3f(0.);

        if (depth < 1e4) {\r
            let mouseViewPos = getViewPosFromTexCoord(uv, iuv);\r
            let mouseWorldPos = uniforms.invViewMatrix * vec4f(mouseViewPos, 1.); 
            let mouseCellPos: vec3i = vec3i(floor(mouseWorldPos).xyz);\r
            mouseCellIndex =    u32(mouseCellPos.x) * u32(initBoxSize.y) * u32(initBoxSize.z) + \r
                                u32(mouseCellPos.y) * u32(initBoxSize.z) + \r
                                u32(mouseCellPos.z);\r
            let center = realBoxSize / 2;\r
            forceDir = select(vec3f(0.), (uniforms.invViewMatrix * vec4f(mouseInfo.mouseVel, 0.0, 0)).xyz, dot(mouseInfo.mouseVel, mouseInfo.mouseVel) > 0.);\r
            var x: f32 = f32(i32(id.x) / i32(initBoxSize.z) / i32(initBoxSize.y));\r
            var y: f32 = f32((i32(id.x) / i32(initBoxSize.z)) % i32(initBoxSize.y));\r
            var z: f32 = f32(i32(id.x) % i32(initBoxSize.z));\r
            let cellPos = vec3f(x, y, z);\r
            let diff = floor(mouseWorldPos).xyz - cellPos;\r
            cellSquareDistToMouse = dot(diff, diff);\r
        }

        let dt = dt;\r
        let r = mouseInfo.mouseRadius;

        if (cells[id.x].mass > 0) { 
            var floatV: vec3f = vec3f(\r
                decodeFixedPoint(cells[id.x].vx), \r
                decodeFixedPoint(cells[id.x].vy), \r
                decodeFixedPoint(cells[id.x].vz)\r
            );\r
            floatV /= decodeFixedPoint(cells[id.x].mass);

            let strength = smoothstep(r*r, 0., cellSquareDistToMouse) * 0.2;   \r
            cells[id.x].vx = encodeFixedPoint(floatV.x + strength * forceDir.x); \r
            cells[id.x].vy = encodeFixedPoint(floatV.y + strength * forceDir.y - 0.80 * dt);\r
            cells[id.x].vz = encodeFixedPoint(floatV.z + strength * forceDir.z); 

            var x: i32 = i32(id.x) / i32(initBoxSize.z) / i32(initBoxSize.y);\r
            var y: i32 = (i32(id.x) / i32(initBoxSize.z)) % i32(initBoxSize.y);\r
            var z: i32 = i32(id.x) % i32(initBoxSize.z);\r
            if (x < 2 || x > i32(ceil(realBoxSize.x) - 3)) { cells[id.x].vx = 0; }\r
            if (y < 2 || y > i32(ceil(realBoxSize.y) - 3)) { cells[id.x].vy = 0; }\r
            if (z < 2 || z > i32(ceil(realBoxSize.z) - 3)) { cells[id.x].vz = 0; }

            
            
            let isSolid = textureLoad(solidTex, vec2u(u32(x), u32(y)), 0).r;\r
            if (isSolid != 0u) {\r
                
                let sl = select(1u, textureLoad(solidTex, vec2u(u32(x - 1), u32(y)), 0).r, x > 0);\r
                let sr = select(1u, textureLoad(solidTex, vec2u(u32(x + 1), u32(y)), 0).r, x < 203);\r
                let sd = select(1u, textureLoad(solidTex, vec2u(u32(x), u32(y - 1)), 0).r, y > 0);\r
                let su = select(1u, textureLoad(solidTex, vec2u(u32(x), u32(y + 1)), 0).r, y < 153);

                
                
                let nx = select(-1., 0., sl != 0u) + select(1., 0., sr != 0u);\r
                let ny = select(-1., 0., sd != 0u) + select(1., 0., su != 0u);\r
                let nLen = sqrt(nx * nx + ny * ny);

                if (nLen > 0.001) {\r
                    
                    let nxn = nx / nLen;\r
                    let nyn = ny / nLen;\r
                    let cvx = decodeFixedPoint(cells[id.x].vx);\r
                    let cvy = decodeFixedPoint(cells[id.x].vy);\r
                    let vn = cvx * nxn + cvy * nyn;\r
                    if (vn < 0.) {\r
                        cells[id.x].vx = encodeFixedPoint(cvx - vn * nxn);\r
                        cells[id.x].vy = encodeFixedPoint(cvy - vn * nyn);\r
                    }\r
                    cells[id.x].vz = 0;\r
                } else {\r
                    
                    cells[id.x].vx = 0;\r
                    cells[id.x].vy = 0;\r
                    cells[id.x].vz = 0;\r
                }\r
            }

            
            
            
            
            if (isSolid == 0u && y > 0) {\r
                let solidBelow = textureLoad(solidTex, vec2u(u32(x), u32(y - 1)), 0).r;\r
                if (solidBelow != 0u) {\r
                    let cvy = decodeFixedPoint(cells[id.x].vy);\r
                    if (cvy < 0.) {\r
                        cells[id.x].vy = 0;\r
                    }\r
                }\r
            }\r
        }\r
    }\r
}`,Mn=`struct Particle {\r
    position: vec3f, \r
    v: vec3f, \r
    C: mat3x3f, \r
}\r
struct Cell {\r
    vx: i32, \r
    vy: i32, \r
    vz: i32, \r
    mass: i32, \r
}

override fixedPointMultiplierInverse: f32;

@group(0) @binding(0) var<storage, read_write> particles: array<Particle>;\r
@group(0) @binding(1) var<storage, read> cells: array<Cell>;\r
@group(0) @binding(2) var<uniform> realBoxSize: vec3f;\r
@group(0) @binding(3) var<uniform> initBoxSize: vec3f;\r
@group(0) @binding(4) var<uniform> numParticles: u32;\r
@group(0) @binding(5) var<uniform> dt: f32;\r
@group(0) @binding(6) var solidTex: texture_2d<u32>;

fn decodeFixedPoint(fixedPoint: i32) -> f32 {\r
	return f32(fixedPoint) * fixedPointMultiplierInverse;\r
}

@compute @workgroup_size(64)\r
fn g2p(@builtin(global_invocation_id) id: vec3<u32>) {\r
    if (id.x < numParticles) {\r
        particles[id.x].v = vec3f(0.);\r
        var weights: array<vec3f, 3>;

        let particle = particles[id.x];\r
        let cellIndex: vec3f = floor(particle.position);\r
        let cellDiff: vec3f = particle.position - (cellIndex + 0.5f);\r
        weights[0] = 0.5f * (0.5f - cellDiff) * (0.5f - cellDiff);\r
        weights[1] = 0.75f - cellDiff * cellDiff;\r
        weights[2] = 0.5f * (0.5f + cellDiff) * (0.5f + cellDiff);

        var B: mat3x3f = mat3x3f(vec3f(0.), vec3f(0.), vec3f(0.));\r
        for (var gx = 0; gx < 3; gx++) {\r
            for (var gy = 0; gy < 3; gy++) {\r
                for (var gz = 0; gz < 3; gz++) {\r
                    let weight: f32 = weights[gx].x * weights[gy].y * weights[gz].z;\r
                    let cellX: vec3f = vec3f(\r
                        cellIndex.x + f32(gx) - 1., \r
                        cellIndex.y + f32(gy) - 1.,\r
                        cellIndex.z + f32(gz) - 1.  \r
                    );\r
                    let cellDist: vec3f = (cellX + 0.5f) - particle.position;\r
                    let cellIndex1D: i32 = \r
                        i32(cellX.x) * i32(initBoxSize.y) * i32(initBoxSize.z) + \r
                        i32(cellX.y) * i32(initBoxSize.z) + \r
                        i32(cellX.z);\r
                    let weighted_velocity: vec3f = vec3f(\r
                        decodeFixedPoint(cells[cellIndex1D].vx), \r
                        decodeFixedPoint(cells[cellIndex1D].vy), \r
                        decodeFixedPoint(cells[cellIndex1D].vz)\r
                    ) * weight;\r
                    let term: mat3x3f = mat3x3f(\r
                        weighted_velocity * cellDist.x, \r
                        weighted_velocity * cellDist.y, \r
                        weighted_velocity * cellDist.z\r
                    );

                    B += term;

                    particles[id.x].v += weighted_velocity;\r
                }\r
            }\r
        }

        particles[id.x].C = B * 4.0f;\r
        particles[id.x].position += particles[id.x].v * dt;\r
        particles[id.x].position = vec3f(\r
            clamp(particles[id.x].position.x, 1., realBoxSize.x - 2.),\r
            clamp(particles[id.x].position.y, 1., realBoxSize.y - 2.),\r
            clamp(particles[id.x].position.z, 1., realBoxSize.z - 2.)\r
        );

        
        
        
        let solidX = u32(clamp(i32(floor(particles[id.x].position.x)), 0, 203));\r
        let solidY = u32(clamp(i32(floor(particles[id.x].position.y)), 0, 153));\r
        let sv = particles[id.x].v;\r
        if (textureLoad(solidTex, vec2u(solidX, solidY), 0).r != 0u) {\r
            if (abs(sv.y) >= abs(sv.x)) {\r
                
                if (sv.y <= 0.) {\r
                    particles[id.x].position.y = f32(solidY) + 1.001; 
                    particles[id.x].v.y = max(sv.y, 0.);\r
                } else {\r
                    particles[id.x].position.y = f32(solidY) - 0.001; 
                    particles[id.x].v.y = min(sv.y, 0.);\r
                }\r
            } else {\r
                
                if (sv.x > 0.) {\r
                    particles[id.x].position.x = f32(solidX) + 1.001; 
                    particles[id.x].v.x = max(sv.x, 0.);\r
                } else {\r
                    particles[id.x].position.x = f32(solidX) - 0.001; 
                    particles[id.x].v.x = min(sv.x, 0.);\r
                }\r
            }\r
        }

        let center = vec3f(realBoxSize.x / 2, realBoxSize.y / 2, realBoxSize.z / 2);\r
        let dist = center - particles[id.x].position;\r
        let dirToOrigin = normalize(dist);\r
        var rForce = vec3f(0);

        \r
        let k = 2.0;\r
        let wallStiffness = 1.0;\r
        let x_n: vec3f = particles[id.x].position + particles[id.x].v * dt * k;\r
        let wallMin: vec3f = vec3f(3.);\r
        let wallMax: vec3f = realBoxSize - 4.;\r
        if (x_n.x < wallMin.x) { particles[id.x].v.x += wallStiffness * (wallMin.x - x_n.x); }\r
        if (x_n.x > wallMax.x) { particles[id.x].v.x += wallStiffness * (wallMax.x - x_n.x); }\r
        if (x_n.y < wallMin.y) { particles[id.x].v.y += wallStiffness * (wallMin.y - x_n.y); }\r
        if (x_n.y > wallMax.y) { particles[id.x].v.y += wallStiffness * (wallMax.y - x_n.y); }\r
        if (x_n.z < wallMin.z) { particles[id.x].v.z += wallStiffness * (wallMin.z - x_n.z); }\r
        if (x_n.z > wallMax.z) { particles[id.x].v.z += wallStiffness * (wallMax.z - x_n.z); }\r
    }\r
}`,zn=`struct Particle {\r
    position: vec3f, \r
    v: vec3f, \r
    C: mat3x3f, \r
}

struct PosVel {\r
    position: vec3f, \r
    v: vec3f, \r
}

@group(0) @binding(0) var<storage, read> particles: array<Particle>;\r
@group(0) @binding(1) var<storage, read_write> posvel: array<PosVel>;\r
@group(0) @binding(2) var<uniform> numParticles: u32;

@compute @workgroup_size(64)\r
fn copyPosition(@builtin(global_invocation_id) id: vec3<u32>) {\r
    if (id.x < numParticles) { \r
        posvel[id.x].position = particles[id.x].position;\r
        posvel[id.x].v = particles[id.x].v;\r
    }\r
}`,bn=`@group(0) @binding(0) var<storage, read> particles: array<Particle>;\r
@group(0) @binding(1) var<storage, read> densities: array<f32>;\r
@group(0) @binding(2) var<uniform> numParticles: u32;\r
@group(0) @binding(3) var<storage, read_write> densityGrid: array<atomic<i32>>;\r
@group(0) @binding(4) var<uniform> densityGridSize: vec3f;

struct Particle {\r
    position: vec3f, \r
    v: vec3f, \r
    C: mat3x3f, \r
}

override densityFixedPointMultiplier: f32; 

fn encodeFixedPoint(floatingPoint: f32) -> i32 {\r
	return i32(floatingPoint * densityFixedPointMultiplier);\r
}

@compute @workgroup_size(64)\r
fn p2gDensity(@builtin(global_invocation_id) id: vec3<u32>) {\r
    if (id.x < numParticles) {\r
        var weights: array<vec3f, 3>;\r
        let particle = particles[id.x];\r
        let cellIndex: vec3f = floor(particle.position);\r
        let cellDiff: vec3f = particle.position - (cellIndex + 0.5f);\r
        weights[0] = 0.5f * (0.5f - cellDiff) * (0.5f - cellDiff);\r
        weights[1] = 0.75f - cellDiff * cellDiff;\r
        weights[2] = 0.5f * (0.5f + cellDiff) * (0.5f + cellDiff);

        for (var gx = 0; gx < 3; gx++) {\r
            for (var gy = 0; gy < 3; gy++) {\r
                for (var gz = 0; gz < 3; gz++) {\r
                    let weight: f32 = weights[gx].x * weights[gy].y * weights[gz].z;\r
                    let cellX: vec3f = vec3f(\r
                            cellIndex.x + f32(gx) - 1., \r
                            cellIndex.y + f32(gy) - 1.,\r
                            cellIndex.z + f32(gz) - 1.  \r
                        );\r
                    let cellIndex1D: i32 = \r
                        i32(cellX.x) * i32(densityGridSize.y) * i32(densityGridSize.z) + \r
                        i32(cellX.y) * i32(densityGridSize.z) + \r
                        i32(cellX.z);\r
                    atomicAdd(&densityGrid[cellIndex1D], encodeFixedPoint(densities[id.x] * weight));\r
                }\r
            }\r
        }\r
    }\r
}`,Bn=`@group(0) @binding(0) var<storage, read_write> densityGrid: array<i32>;\r
@group(0) @binding(1) var<storage, read_write> castedDensityGrid: array<i32>;

@compute @workgroup_size(64)\r
fn clearDensityGrid(@builtin(global_invocation_id) id: vec3<u32>) {\r
    if (id.x < arrayLength(&castedDensityGrid)) {\r
        densityGrid[2 * id.x] = 0;\r
        densityGrid[2 * id.x + 1] = 0;\r
        castedDensityGrid[id.x] = 0;\r
    }\r
}`,Gn=`@group(0) @binding(0) var<storage, read> densityGrid: array<i32>;\r
@group(0) @binding(1) var<storage, read_write> castedDensityGrid: array<u32>;

override fixedPointMultiplierInverse: f32; 

fn decodeFixedPoint(fixedPoint: i32) -> f32 {\r
	return f32(fixedPoint) * fixedPointMultiplierInverse;\r
}

@compute @workgroup_size(64)\r
fn clearDensityGrid(@builtin(global_invocation_id) id: vec3<u32>) {\r
    if (id.x < arrayLength(&castedDensityGrid)) {\r
        let d0: f32 = decodeFixedPoint(densityGrid[2 * id.x]);\r
        let d1: f32 = decodeFixedPoint(densityGrid[2 * id.x + 1]);\r
        
        
        let d01: u32 = pack2x16float(vec2f(d0, d1));\r
        castedDensityGrid[id.x] = d01;\r
    }\r
}`,Tn=`@group(0) @binding(0) var<storage, read>       inParticles:   array<u32>;
@group(0) @binding(1) var<storage, read_write> outParticles:  array<u32>;
@group(0) @binding(2) var<storage, read_write> counter:       array<atomic<u32>>;
@group(0) @binding(3) var<uniform>             numParticles:  u32;
@group(0) @binding(4) var<storage, read>       drainZones:    array<vec4f>;   
@group(0) @binding(5) var<uniform>             numDrainZones: u32;

const PARTICLE_U32S: u32 = 20u; 

@compute @workgroup_size(64)
fn drainParticles(@builtin(global_invocation_id) id: vec3u) {
    if (id.x >= numParticles) { return; }

    let base = id.x * PARTICLE_U32S;
    let px = bitcast<f32>(inParticles[base + 0u]);
    let py = bitcast<f32>(inParticles[base + 1u]);

    var inDrain = false;
    for (var z = 0u; z < numDrainZones; z++) {
        let zone = drainZones[z]; 
        if (px >= zone.x && px <= zone.x + zone.z &&
            py >= zone.y && py <= zone.y + zone.w) {
            inDrain = true;
            break;
        }
    }

    if (!inDrain) {
        let outIdx = atomicAdd(&counter[0], 1u);
        let outBase = outIdx * PARTICLE_U32S;
        for (var i = 0u; i < PARTICLE_U32S; i++) {
            outParticles[outBase + i] = inParticles[base + i];
        }
    }
}`;const Ae=80;class Sn{constructor(v,G,F,T,z,N,$,b,M,O,X,W,Q,te){B(this,"cellStructSize",16);B(this,"realBoxSizeBuffer");B(this,"numParticlesBuffer");B(this,"densityBuffer");B(this,"mouseInfoUniformBuffer");B(this,"sphereRadiusBuffer");B(this,"initBoxSizeBuffer");B(this,"numParticles",0);B(this,"gridCount",0);B(this,"maxGridCount",0);B(this,"maxParticleCount",0);B(this,"densityGridCount",0);B(this,"clearGridPipeline");B(this,"clearDensityGridPipeline");B(this,"castDensityGridPipeline");B(this,"p2g1Pipeline");B(this,"p2g2Pipeline");B(this,"p2gDensityPipeline");B(this,"updateGridPipeline");B(this,"g2pPipeline");B(this,"copyPositionPipeline");B(this,"drainPipeline");B(this,"clearGridBindGroup");B(this,"clearDensityGridBindGroup");B(this,"castDensityGridBindGroup");B(this,"p2g1BindGroup");B(this,"p2g2BindGroup");B(this,"p2gDensityBindGroup");B(this,"updateGridBindGroup");B(this,"g2pBindGroup");B(this,"copyPositionBindGroup");B(this,"drainBindGroup");B(this,"particleBuffer");B(this,"dtBuffer");B(this,"densityGridBuffer");B(this,"drainZonesBuffer");B(this,"drainZonesCountBuffer");B(this,"drainCounterBuffer");B(this,"drainOutputBuffer");B(this,"drainStagingBuffer");B(this,"_drainZoneQueue",[]);B(this,"device");B(this,"solidTexture");B(this,"solidTextureSampler");B(this,"renderDiameter");B(this,"frameCount");B(this,"spawned");B(this,"mouseInfoValues",new ArrayBuffer(32));B(this,"mouseInfoViews",{screenSize:new Float32Array(this.mouseInfoValues,0,2),mouseCoord:new Float32Array(this.mouseInfoValues,8,2),mouseVel:new Float32Array(this.mouseInfoValues,16,2),mouseRadius:new Float32Array(this.mouseInfoValues,24,1)});B(this,"restDensity");this.device=b,this.renderDiameter=te,this.frameCount=0,this.spawned=!1,this.numParticles=0,this.maxGridCount=X,this.maxParticleCount=W,this.initBoxSizeBuffer=N;const re=b.createShaderModule({code:yn}),ie=b.createShaderModule({code:Bn}),ee=b.createShaderModule({code:Gn}),H=b.createShaderModule({code:mn}),L=b.createShaderModule({code:Pn}),ne=b.createShaderModule({code:bn}),se=b.createShaderModule({code:Dn}),J=b.createShaderModule({code:Mn}),K=b.createShaderModule({code:zn});this.restDensity=8;const E={stiffness:40,restDensity:this.restDensity,dynamicViscosity:.05,fixedPointMultiplier:Q,fixedPointMultiplierInverse:1/Q};this.clearGridPipeline=b.createComputePipeline({label:"clear grid pipeline",layout:"auto",compute:{module:re}}),this.clearDensityGridPipeline=b.createComputePipeline({label:"clear density grid pipeline",layout:"auto",compute:{module:ie}}),this.castDensityGridPipeline=b.createComputePipeline({label:"cast density grid pipeline",layout:"auto",compute:{module:ee,constants:{fixedPointMultiplierInverse:E.fixedPointMultiplierInverse}}}),this.p2g1Pipeline=b.createComputePipeline({label:"p2g 1 pipeline",layout:"auto",compute:{module:H,constants:{fixedPointMultiplier:E.fixedPointMultiplier}}}),this.p2g2Pipeline=b.createComputePipeline({label:"p2g 2 pipeline",layout:"auto",compute:{module:L,constants:{fixedPointMultiplier:E.fixedPointMultiplier,fixedPointMultiplierInverse:E.fixedPointMultiplierInverse,stiffness:E.stiffness,restDensity:E.restDensity,dynamicViscosity:E.dynamicViscosity}}}),this.p2gDensityPipeline=b.createComputePipeline({label:"p2g density pipeline",layout:"auto",compute:{module:ne,constants:{densityFixedPointMultiplier:E.fixedPointMultiplier}}}),this.updateGridPipeline=b.createComputePipeline({label:"update grid pipeline",layout:"auto",compute:{module:se,constants:{fixedPointMultiplier:E.fixedPointMultiplier,fixedPointMultiplierInverse:E.fixedPointMultiplierInverse}}}),this.g2pPipeline=b.createComputePipeline({label:"g2p pipeline",layout:"auto",compute:{module:J,constants:{fixedPointMultiplierInverse:E.fixedPointMultiplierInverse}}}),this.copyPositionPipeline=b.createComputePipeline({label:"copy position pipeline",layout:"auto",compute:{module:K}}),this.drainPipeline=b.createComputePipeline({label:"drain particles pipeline",layout:"auto",compute:{module:b.createShaderModule({code:Tn})}});const Y=b.createBuffer({label:"cells buffer",size:this.cellStructSize*X,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST});this.densityBuffer=b.createBuffer({label:"density buffer",size:4*W,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST}),this.realBoxSizeBuffer=b.createBuffer({label:"real box size buffer",size:12,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST}),this.numParticlesBuffer=b.createBuffer({label:"number of particles buffer",size:4,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST}),this.mouseInfoUniformBuffer=b.createBuffer({label:"mouse info buffer",size:this.mouseInfoValues.byteLength,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST}),this.sphereRadiusBuffer=b.createBuffer({label:"sphere radius buffer",size:4,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST}),this.dtBuffer=b.createBuffer({label:"dt buffer",size:4,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});const Z=32;this.drainZonesBuffer=b.createBuffer({label:"drain zones buffer",size:16*Z,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST}),this.drainZonesCountBuffer=b.createBuffer({label:"drain zones count buffer",size:4,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST}),this.drainCounterBuffer=b.createBuffer({label:"drain counter buffer",size:4,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC|GPUBufferUsage.COPY_DST}),this.drainOutputBuffer=b.createBuffer({label:"drain output buffer",size:Ae*W,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC}),this.drainStagingBuffer=b.createBuffer({label:"drain staging buffer",size:4,usage:GPUBufferUsage.MAP_READ|GPUBufferUsage.COPY_DST}),this.mouseInfoViews.screenSize.set([O.width,O.height]),this.device.queue.writeBuffer(this.mouseInfoUniformBuffer,0,this.mouseInfoValues),this.solidTexture=b.createTexture({label:"valis solid grid texture",size:[204,154],format:"r8uint",usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST});const ce=new Uint8Array(204*154);b.queue.writeTexture({texture:this.solidTexture},ce,{bytesPerRow:204},[204,154]),this.clearGridBindGroup=b.createBindGroup({layout:this.clearGridPipeline.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:Y}}]}),this.clearDensityGridBindGroup=b.createBindGroup({layout:this.clearDensityGridPipeline.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:T}},{binding:1,resource:{buffer:z}}]}),this.castDensityGridBindGroup=b.createBindGroup({layout:this.castDensityGridPipeline.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:T}},{binding:1,resource:{buffer:z}}]}),this.p2g1BindGroup=b.createBindGroup({layout:this.p2g1Pipeline.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:v}},{binding:1,resource:{buffer:Y}},{binding:2,resource:{buffer:N}},{binding:3,resource:{buffer:this.numParticlesBuffer}}]}),this.p2g2BindGroup=b.createBindGroup({layout:this.p2g2Pipeline.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:v}},{binding:1,resource:{buffer:Y}},{binding:2,resource:{buffer:N}},{binding:3,resource:{buffer:this.numParticlesBuffer}},{binding:4,resource:{buffer:this.densityBuffer}},{binding:5,resource:{buffer:this.dtBuffer}}]}),this.p2gDensityBindGroup=b.createBindGroup({layout:this.p2gDensityPipeline.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:v}},{binding:1,resource:{buffer:this.densityBuffer}},{binding:2,resource:{buffer:this.numParticlesBuffer}},{binding:3,resource:{buffer:T}},{binding:4,resource:{buffer:$}}]}),this.updateGridBindGroup=b.createBindGroup({layout:this.updateGridPipeline.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:Y}},{binding:1,resource:{buffer:this.realBoxSizeBuffer}},{binding:2,resource:{buffer:N}},{binding:3,resource:{buffer:F}},{binding:4,resource:M},{binding:5,resource:{buffer:this.mouseInfoUniformBuffer}},{binding:6,resource:{buffer:this.dtBuffer}},{binding:7,resource:this.solidTexture.createView()}]}),this.g2pBindGroup=b.createBindGroup({layout:this.g2pPipeline.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:v}},{binding:1,resource:{buffer:Y}},{binding:2,resource:{buffer:this.realBoxSizeBuffer}},{binding:3,resource:{buffer:N}},{binding:4,resource:{buffer:this.numParticlesBuffer}},{binding:5,resource:{buffer:this.dtBuffer}},{binding:6,resource:this.solidTexture.createView()}]}),this.copyPositionBindGroup=b.createBindGroup({layout:this.copyPositionPipeline.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:v}},{binding:1,resource:{buffer:G}},{binding:2,resource:{buffer:this.numParticlesBuffer}}]}),this.drainBindGroup=b.createBindGroup({layout:this.drainPipeline.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:v}},{binding:1,resource:{buffer:this.drainOutputBuffer}},{binding:2,resource:{buffer:this.drainCounterBuffer}},{binding:3,resource:{buffer:this.numParticlesBuffer}},{binding:4,resource:{buffer:this.drainZonesBuffer}},{binding:5,resource:{buffer:this.drainZonesCountBuffer}}]}),this.particleBuffer=v,this.densityGridBuffer=T}initDambreak(v,G){let F=new ArrayBuffer(Ae*this.maxParticleCount);const T=.9;this.numParticles=0,v[0]/2,v[0]/2,v[2]/2;for(let b=3;b<v[1]*.8&&this.numParticles<G;b+=T)for(let M=v[0]*.25;M<v[0]-4&&this.numParticles<G;M+=T)for(let O=3;O<v[2]/2&&this.numParticles<G;O+=T){const X=Ae*this.numParticles,W={position:new Float32Array(F,X+0,3),v:new Float32Array(F,X+16,3),C:new Float32Array(F,X+32,12)},Q=.5*Math.random();W.position.set([M+Q,b+Q,O+Q]),this.numParticles++}console.log(this.numParticles),this.numParticles<G&&console.log("warning: actual number of particles is smaller than the specified number. make bounding box larger.");let z=new ArrayBuffer(Ae*this.numParticles);const N=new Uint8Array(F),$=new Uint8Array(z);return $.set(N.subarray(0,$.length)),z}reset(v,G){if(this.gridCount=Math.ceil(v[0])*Math.ceil(v[1])*Math.ceil(v[2]),this.gridCount>this.maxGridCount)throw new Error("gridCount should be equal to or less than maxGridCount");this.densityGridCount=this.gridCount;const F=new Float32Array(v);this.device.queue.writeBuffer(this.initBoxSizeBuffer,0,F),this.frameCount=0;let T=this.initDambreak(v,G);this.device.queue.writeBuffer(this.particleBuffer,0,T),this.changeBoxSize(v),this.changeNumParticles(this.numParticles)}execute(v,G,F,T,z,N,$,b){const M=v.beginComputePass();this.mouseInfoViews.mouseCoord.set([G[0],G[1]]),this.mouseInfoViews.mouseVel.set([F[0],F[1]]),this.mouseInfoViews.mouseRadius.set([T]),this.device.queue.writeBuffer(this.mouseInfoUniformBuffer,0,this.mouseInfoValues);const O=new Float32Array([N]);if(this.device.queue.writeBuffer(this.dtBuffer,0,O),z){if($)for(let W=0;W<1;W++)M.setBindGroup(0,this.clearGridBindGroup),M.setPipeline(this.clearGridPipeline),M.dispatchWorkgroups(Math.ceil(this.gridCount/64)),M.setBindGroup(0,this.p2g1BindGroup),M.setPipeline(this.p2g1Pipeline),M.dispatchWorkgroups(Math.ceil(this.numParticles/64)),M.setBindGroup(0,this.p2g2BindGroup),M.setPipeline(this.p2g2Pipeline),M.dispatchWorkgroups(Math.ceil(this.numParticles/64)),M.setBindGroup(0,this.updateGridBindGroup),M.setPipeline(this.updateGridPipeline),M.dispatchWorkgroups(Math.ceil(this.gridCount/64)),M.setBindGroup(0,this.g2pBindGroup),M.setPipeline(this.g2pPipeline),M.dispatchWorkgroups(Math.ceil(this.numParticles/64));let X=b[0]*b[1]*b[2];M.setBindGroup(0,this.clearDensityGridBindGroup),M.setPipeline(this.clearDensityGridPipeline),M.dispatchWorkgroups(Math.ceil(X/2/64)),M.setBindGroup(0,this.p2gDensityBindGroup),M.setPipeline(this.p2gDensityPipeline),M.dispatchWorkgroups(Math.ceil(this.numParticles/64)),M.setBindGroup(0,this.castDensityGridBindGroup),M.setPipeline(this.castDensityGridPipeline),M.dispatchWorkgroups(Math.ceil(X/2/64)),M.setBindGroup(0,this.copyPositionBindGroup),M.setPipeline(this.copyPositionPipeline),M.dispatchWorkgroups(Math.ceil(this.numParticles/64))}else if($){for(let X=0;X<1;X++)M.setBindGroup(0,this.clearGridBindGroup),M.setPipeline(this.clearGridPipeline),M.dispatchWorkgroups(Math.ceil(this.gridCount/64)),M.setBindGroup(0,this.p2g1BindGroup),M.setPipeline(this.p2g1Pipeline),M.dispatchWorkgroups(Math.ceil(this.numParticles/64)),M.setBindGroup(0,this.p2g2BindGroup),M.setPipeline(this.p2g2Pipeline),M.dispatchWorkgroups(Math.ceil(this.numParticles/64)),M.setBindGroup(0,this.updateGridBindGroup),M.setPipeline(this.updateGridPipeline),M.dispatchWorkgroups(Math.ceil(this.gridCount/64)),M.setBindGroup(0,this.g2pBindGroup),M.setPipeline(this.g2pPipeline),M.dispatchWorkgroups(Math.ceil(this.numParticles/64));M.setBindGroup(0,this.copyPositionBindGroup),M.setPipeline(this.copyPositionPipeline),M.dispatchWorkgroups(Math.ceil(this.numParticles/64))}M.end(),this.frameCount++}changeBoxSize(v){const G=new Float32Array(v);this.device.queue.writeBuffer(this.realBoxSizeBuffer,0,G)}changeNumParticles(v){const G=new Int32Array([v]);this.device.queue.writeBuffer(this.numParticlesBuffer,0,G),this.numParticles=v}updateSolidGrid(v){this.device.queue.writeTexture({texture:this.solidTexture},v,{bytesPerRow:204},[204,154])}queueDrainZone(v,G,F,T){this._drainZoneQueue.push(v,G,F,T)}runDrain(v){const G=this._drainZoneQueue.length/4;if(G===0||this.numParticles===0){this._drainZoneQueue.length=0;return}this.device.queue.writeBuffer(this.drainCounterBuffer,0,new Uint32Array([0])),this.device.queue.writeBuffer(this.drainZonesBuffer,0,new Float32Array(this._drainZoneQueue)),this.device.queue.writeBuffer(this.drainZonesCountBuffer,0,new Uint32Array([G])),this._drainZoneQueue.length=0;const F=v.beginComputePass({label:"drain pass"});F.setBindGroup(0,this.drainBindGroup),F.setPipeline(this.drainPipeline),F.dispatchWorkgroups(Math.ceil(this.numParticles/64)),F.end(),v.copyBufferToBuffer(this.drainOutputBuffer,0,this.particleBuffer,0,Ae*this.maxParticleCount),v.copyBufferToBuffer(this.drainCounterBuffer,0,this.numParticlesBuffer,0,4),v.copyBufferToBuffer(this.drainCounterBuffer,0,this.drainStagingBuffer,0,4)}runCopyPosition(v){const G=v.beginComputePass({label:"post-drain copyPosition"});G.setBindGroup(0,this.copyPositionBindGroup),G.setPipeline(this.copyPositionPipeline),G.dispatchWorkgroups(Math.ceil(this.numParticles/64)),G.end()}scheduleCounterReadback(){this.drainStagingBuffer.mapState==="unmapped"&&this.drainStagingBuffer.mapAsync(GPUMapMode.READ).then(()=>{const v=new Uint32Array(this.drainStagingBuffer.getMappedRange())[0];this.drainStagingBuffer.unmap(),this.numParticles=v}).catch(()=>{})}addParticles(v,G,F,T,z){if(this.numParticles+T>this.maxParticleCount&&(T=this.maxParticleCount-this.numParticles),T<=0)return;const N=2,$=N+v*(z[0]-2*N),b=N+(1-G)*(z[1]-2*N),M=z[2]/2,O=F*z[0],X=new ArrayBuffer(Ae*T);let W=0;for(let te=0;W<T&&te<T*4;te++){const re=(Math.random()*2-1)*O,ie=(Math.random()*2-1)*O,ee=(Math.random()*2-1)*O*.5;if(re*re+ie*ie>O*O)continue;const H=Ae*W;new Float32Array(X,H,3).set([Math.max(2,Math.min(z[0]-2,$+re)),Math.max(2,Math.min(z[1]-2,b+ie)),Math.max(1,Math.min(z[2]-1,M+ee))]),W++}const Q=Ae*this.numParticles;this.device.queue.writeBuffer(this.particleBuffer,Q,X,0,Ae*W),this.changeNumParticles(this.numParticles+W)}}const ke=new ArrayBuffer(272),Le={texelSize:new Float32Array(ke,0,2),sphereSize:new Float32Array(ke,8,2),invProjectionMatrix:new Float32Array(ke,16,16),projectionMatrix:new Float32Array(ke,80,16),viewMatrix:new Float32Array(ke,144,16),invViewMatrix:new Float32Array(ke,208,16)};var _n=`@group(0) @binding(1) var depthTexture: texture_2d<f32>;\r
@group(0) @binding(2) var<uniform> uniforms: FilterUniforms;

struct FragmentInput {\r
    @location(0) uv: vec2f,  \r
    @location(1) iuv: vec2f\r
}

override projectedParticleConstant: f32; \r
override maxFilterSize: f32;\r
override blur2D: u32;

struct FilterUniforms {\r
    blurDir: vec2f,\r
}

@fragment\r
fn fs(input: FragmentInput) -> @location(0) vec4f {\r
    let depth: f32 = abs(textureLoad(depthTexture, vec2u(input.iuv), 0).r);

    if (depth >= 1e4) {\r
        return vec4f(vec3f(depth), 1.);\r
    }

    let filterSize: i32 = min(i32(maxFilterSize), i32(ceil(projectedParticleConstant / depth)));

    let sigma: f32 = f32(filterSize) / 2.0; \r
    let sigmaSquareInv: f32 = 1.0 / (2.0 * sigma * sigma);

    let mu = 3. * 0.6; 
    let depthThreshold = 10.0 * 0.6;

    let higherDepthBound = depth + mu;

    var sum: f32 = depth;\r
    var wsum: f32 = 1.0;\r
    
    if (blur2D == 0) {\r
        var sum2 = vec2f(0, 0);\r
        var wsum2 = vec2f(0, 0);\r
        var depthThresholdLowX = depth - depthThreshold;\r
        var depthThresholdHighX = depth + depthThreshold;\r
        var depthThresholdLowY = depth - depthThreshold;\r
        var depthThresholdHighY = depth + depthThreshold;\r
        for (var r: i32 = 1; r <= filterSize; r++) {\r
            var gaussianWeight: f32 = exp(-f32(r * r) * sigmaSquareInv);\r
            var sampledDepthX: f32 = abs(textureLoad(depthTexture, vec2u(input.iuv - vec2f(f32(r)) * uniforms.blurDir), 0).r);\r
            var sampledDepthY: f32 = abs(textureLoad(depthTexture, vec2u(input.iuv + vec2f(f32(r)) * uniforms.blurDir), 0).r);

            var w = vec2f(gaussianWeight);

            if (sampledDepthX < depthThresholdLowX) {\r
                w.x = 0.;\r
                w.y = 0.; \r
            } else {\r
                if (sampledDepthX > depthThresholdHighX) {\r
                    sampledDepthX = higherDepthBound;\r
                } else {\r
                    depthThresholdLowX = min(depthThresholdLowX, sampledDepthX - depthThreshold);\r
                    depthThresholdHighX = max(depthThresholdHighX, sampledDepthX + depthThreshold);\r
                }\r
            }

            if (sampledDepthY < depthThresholdLowY) {\r
                w.x = 0.;\r
                w.y = 0.; \r
            } else {\r
                if (sampledDepthY > depthThresholdHighY) {\r
                    sampledDepthY = higherDepthBound;\r
                } else {\r
                    depthThresholdLowY = min(depthThresholdLowY, sampledDepthY - depthThreshold);\r
                    depthThresholdHighY = max(depthThresholdHighY, sampledDepthY + depthThreshold);\r
                }\r
            }

            sum2 += vec2f(sampledDepthX, sampledDepthY) * w;\r
            wsum2 += w;\r
        }\r
        sum += sum2.x + sum2.y;\r
        wsum += wsum2.x + wsum2.y;\r
    } else {\r
        let filterSize2D = 2;\r
        var depthThresholdLow = depth - depthThreshold;\r
        var depthThresholdHigh = depth + depthThreshold;\r
        var sum4 = vec4f(0.);\r
        var wsum4 = vec4f(0.);\r
        for (var r: i32 = 1; r <= filterSize2D; r++) {\r
            for (var i: i32 = 0; i < 2 * r; i++) {\r
                let gaussianWeight = exp((-f32(r*r) + f32((r-i) * (r-i))) * sigmaSquareInv);

                var sampledDepthX: f32 = abs(textureLoad(depthTexture, vec2u(input.iuv - vec2f(f32(r), f32(r-i))), 0).r);\r
                var sampledDepthY: f32 = abs(textureLoad(depthTexture, vec2u(input.iuv + vec2f(f32(r), f32(r-i))), 0).r);\r
                var sampledDepthZ: f32 = abs(textureLoad(depthTexture, vec2u(input.iuv - vec2f(f32(r-i), f32(r))), 0).r);\r
                var sampledDepthW: f32 = abs(textureLoad(depthTexture, vec2u(input.iuv + vec2f(f32(r-i), f32(r))), 0).r);

                var w = vec4f(gaussianWeight);

                if (sampledDepthX < depthThresholdLow) {\r
                    w.x = 0.;\r
                    w.y = 0.; 
                } else {\r
                    if (sampledDepthX > depthThresholdHigh) {\r
                        sampledDepthX = higherDepthBound;\r
                    } else {\r
                        depthThresholdLow = min(depthThresholdLow, sampledDepthX - depthThreshold);\r
                        depthThresholdHigh = max(depthThresholdHigh, sampledDepthX + depthThreshold);\r
                    }\r
                }

                if (sampledDepthY < depthThresholdLow) {\r
                    w.x = 0.;\r
                    w.y = 0.; \r
                } else {\r
                    if (sampledDepthY > depthThresholdHigh) {\r
                        sampledDepthY = higherDepthBound;\r
                    } else {\r
                        depthThresholdLow = min(depthThresholdLow, sampledDepthY - depthThreshold);\r
                        depthThresholdHigh = max(depthThresholdHigh, sampledDepthY + depthThreshold);\r
                    }\r
                }

                if (sampledDepthZ < depthThresholdLow) {\r
                    w.z = 0.;\r
                    w.w = 0.; \r
                } else {\r
                    if (sampledDepthZ > depthThresholdHigh) {\r
                        sampledDepthZ = higherDepthBound;\r
                    } else {\r
                        depthThresholdLow = min(depthThresholdLow, sampledDepthZ - depthThreshold);\r
                        depthThresholdHigh = max(depthThresholdHigh, sampledDepthZ + depthThreshold);\r
                    }\r
                }

                if (sampledDepthW < depthThresholdLow) {\r
                    w.z = 0.;\r
                    w.w = 0.; \r
                } else {\r
                    if (sampledDepthW > depthThresholdHigh) {\r
                        sampledDepthW = higherDepthBound;\r
                    } else {\r
                        depthThresholdLow = min(depthThresholdLow, sampledDepthW - depthThreshold);\r
                        depthThresholdHigh = max(depthThresholdHigh, sampledDepthW + depthThreshold);\r
                    }\r
                }

                sum4 += vec4f(sampledDepthX, sampledDepthY, sampledDepthZ, sampledDepthW) * w;\r
                wsum4 += w;\r
            }\r
        }\r
        sum += sum4.x + sum4.y + sum4.z + sum4.w;\r
        wsum += wsum4.x + wsum4.y + wsum4.z + wsum4.w;\r
    }

    return vec4f(sum / wsum, 0., 0., 1.);\r
}`,Vn=`@group(0) @binding(0) var textureSampler: sampler;\r
@group(0) @binding(1) var depthTexture: texture_2d<f32>;\r
@group(0) @binding(2) var<uniform> uniforms: RenderUniforms;\r
@group(0) @binding(3) var thicknessTexture: texture_2d<f32>;\r
@group(0) @binding(4) var envmapTexture: texture_cube<f32>;\r
@group(0) @binding(5) var bgTexture: texture_2d<f32>;\r
@group(0) @binding(6) var<uniform> diffuseColor: vec3f;\r
@group(0) @binding(7) var<uniform> density: f32;

struct RenderUniforms {\r
    texelSize: vec2f, \r
    sphereSize: f32, \r
    invProjectionMatrix: mat4x4f, \r
    projectionMatrix: mat4x4f, \r
    viewMatrix: mat4x4f, \r
    invViewMatrix: mat4x4f, \r
}

struct FragmentInput {\r
    @location(0) uv: vec2f, \r
    @location(1) iuv: vec2f, \r
}

fn computeViewPosFromUVDepth(texCoord: vec2f, depth: f32) -> vec3f {\r
    var ndc: vec4f = vec4f(texCoord.x * 2.0 - 1.0, 1.0 - 2.0 * texCoord.y, 0.0, 1.0);\r
    ndc.z = -uniforms.projectionMatrix[2].z + uniforms.projectionMatrix[3].z / depth;\r
    ndc.w = 1.0;

    var eye_pos: vec4f = uniforms.invProjectionMatrix * ndc;

    return eye_pos.xyz / eye_pos.w;\r
}

fn getViewPosFromTexCoord(texCoord: vec2f, iuv: vec2f) -> vec3f {\r
    var depth: f32 = abs(textureLoad(depthTexture, vec2u(iuv), 0).x);\r
    return computeViewPosFromUVDepth(texCoord, depth);\r
}

fn gamma(v: vec3f) -> vec3f {\r
    return pow(v, vec3(1.0 / 2.2));\r
}\r
fn invGamma(v: vec3f) -> vec3f {\r
    return pow(v, vec3(2.2));\r
}

fn calcReflactedTexCoord(surfacePosView: vec3f, refractionDirView: vec3f, thickness: f32) -> vec2f {\r
    let refractionStrength = 3.;\r
    let exitPosView: vec3f = surfacePosView + refractionDirView * thickness * refractionStrength;\r
    let exitPosClip: vec4f = uniforms.projectionMatrix * vec4f(exitPosView, 1.);\r
    let exitPosNdc: vec3f = exitPosClip.xyz / exitPosClip.w;\r
    return clamp(vec2f((1. + exitPosNdc.x) / 2., (1. - exitPosNdc.y) / 2.), vec2f(0.), vec2f(1.));\r
}

fn floorColor(surfacePos: vec3f, refractDir: vec3f) -> vec4f {\r
    let t = -surfacePos.y / refractDir.y;\r
    let rayHitPos = surfacePos + t * refractDir;

    let gridSize = 16.0;\r
    let lineThickness = 0.2; 

    let isLineX = abs(fract(rayHitPos.x / gridSize - 0.5) - 0.5) < lineThickness / gridSize;\r
    let isLineZ = abs(fract(rayHitPos.z / gridSize - 0.5) - 0.5) < lineThickness / gridSize;\r
    let isLine = isLineX || isLineZ;

    let boardColor = vec3(0.6); \r
    let lineColor = vec3(0.5); \r
    let finalColor = select(boardColor, lineColor, isLine);

    return vec4f(finalColor, f32(abs(rayHitPos.x) < 3e2 && abs(rayHitPos.z) < 3e2));\r
}

@fragment\r
fn fs(input: FragmentInput) -> @location(0) vec4f {\r
    let depth: f32 = abs(textureLoad(depthTexture, vec2u(input.iuv), 0).r);\r
    var thickness = textureSample(thicknessTexture, textureSampler, input.uv).r;

    if (depth >= 1e4) {\r
        let bgColor: vec3f = textureSampleLevel(bgTexture, textureSampler, input.uv, 0.0).rgb;\r
        return vec4f(bgColor, 0.);\r
    }

    let surfacePosView = computeViewPosFromUVDepth(input.uv, depth);\r
    let surfacePosWorld = (uniforms.invViewMatrix * vec4f(surfacePosView, 1.0)).xyz;\r
    if (surfacePosWorld.y < 2.0) {\r
        let bgColor: vec3f = textureSampleLevel(bgTexture, textureSampler, input.uv, 0.0).rgb;\r
        return vec4f(bgColor, 0.);\r
    }\r
    var ddx: vec3f = getViewPosFromTexCoord(input.uv + vec2f(uniforms.texelSize.x, 0.), input.iuv + vec2f(1.0, 0.0)) - surfacePosView; \r
    var ddy: vec3f = getViewPosFromTexCoord(input.uv + vec2f(0., uniforms.texelSize.y), input.iuv + vec2f(0.0, 1.0)) - surfacePosView; \r
    let ddx2: vec3f = surfacePosView - getViewPosFromTexCoord(input.uv + vec2f(-uniforms.texelSize.x, 0.), input.iuv + vec2f(-1.0, 0.0));\r
    let ddy2: vec3f = surfacePosView - getViewPosFromTexCoord(input.uv + vec2f(0., -uniforms.texelSize.y), input.iuv + vec2f(0.0, -1.0));\r
    let maxDeltaZ = max(max(abs(ddx.z), abs(ddy.z)), max(abs(ddx2.z), abs(ddy2.z)));

    ddx = select(ddx, ddx2, abs(ddx.z) > abs(ddx2.z));\r
    ddy = select(ddy, ddy2, abs(ddy.z) > abs(ddy2.z));

    var normal: vec3f = -normalize(cross(ddx, ddy)); \r
    var rayDirView = normalize(surfacePosView);\r
    var lightDirView = normalize((uniforms.viewMatrix * vec4f(0.2, 0.0, 1, 0.)).xyz);\r
    var H: vec3f        = normalize(lightDirView - rayDirView);\r
    var specular: f32   = pow(max(0.0, dot(H, normal)), 300.);\r
    var diffuse: f32  = max(0.0, dot(lightDirView, normal)) * 1.0;

    var transmittance: vec3f = exp(-density * 10 * thickness * (1.0 - diffuseColor)); \r
    var refractionDirView: vec3f = normalize(refract(rayDirView, normal, 1.0 / 1.333));\r
    var refractionDirWorld: vec3f = normalize((uniforms.invViewMatrix * vec4f(refractionDirView, 0.)).xyz);\r
    var transmitted = pow(textureSampleLevel(envmapTexture, textureSampler, refractionDirWorld, 0.0).rgb, vec3f(2.2));\r
    if (refractionDirWorld.y < 0.) {\r
        let surfacePosWorld = (uniforms.invViewMatrix * vec4f(surfacePosView, 1.)).xyz;\r
        let floor = floorColor(surfacePosWorld, refractionDirWorld);\r
        transmitted = select(transmitted, invGamma(floor.rgb), floor.w > 0.5);\r
    }\r
    var refractionColor: vec3f = transmitted * transmittance;

    let F0 = 0.02;\r
    var fresnelBiased: f32 = clamp(F0 + (1.0 - F0) * pow(1.0 - dot(normal, -rayDirView), 5.0) + 0.0, 0., 1.);\r
    var fresnel: f32 = clamp(F0 + (1.0 - F0) * pow(1.0 - dot(normal, -rayDirView), 5.0), 0., 1.);

    var reflectionDir: vec3f = reflect(rayDirView, normal);\r
    var reflectionDirWorld: vec3f = (uniforms.invViewMatrix * vec4f(reflectionDir, 0.0)).xyz;\r
    var reflectionColor: vec3f = invGamma(select(textureSampleLevel(envmapTexture, textureSampler, reflectionDirWorld, 0.).rgb, vec3f(0.75), reflectionDirWorld.y < 0.)); \r
    fresnel = select(fresnel, 0.1 * fresnel, reflectionDirWorld.y < 0.);\r
    fresnelBiased = select(fresnelBiased, 0.1 * fresnelBiased, reflectionDirWorld.y < 0.);

    var finalColor = 0.0     * specular + mix(refractionColor, reflectionColor, fresnel) + 0. * fresnel;

    return vec4f(gamma(finalColor), 1.0);\r
}`,Un=`struct VertexOutput {\r
  @builtin(position) position : vec4f,\r
  @location(0) uv : vec2f,\r
  @location(1) iuv : vec2f,\r
}

override screenWidth: f32;\r
override screenHeight: f32;

@vertex\r
fn vs(@builtin(vertex_index) vertex_index : u32) -> VertexOutput {\r
    var out: VertexOutput;

    var pos = array(\r
        vec2( 1.0,  1.0),\r
        vec2( 1.0, -1.0),\r
        vec2(-1.0, -1.0),\r
        vec2( 1.0,  1.0),\r
        vec2(-1.0, -1.0),\r
        vec2(-1.0,  1.0),\r
    );

    var uv = array(\r
        vec2(1.0, 0.0),\r
        vec2(1.0, 1.0),\r
        vec2(0.0, 1.0),\r
        vec2(1.0, 0.0),\r
        vec2(0.0, 1.0),\r
        vec2(0.0, 0.0),\r
    );

    out.position = vec4(pos[vertex_index], 0.0, 1.0);\r
    out.uv = uv[vertex_index];\r
    out.iuv = out.uv * vec2f(screenWidth, screenHeight);

    return out;\r
}`,Fn=`struct RenderUniforms {\r
    texelSize: vec2f, \r
    sphereSize: f32, \r
    invProjectionMatrix: mat4x4f, \r
    projectionMatrix: mat4x4f, \r
    viewMatrix: mat4x4f, \r
    invViewMatrix: mat4x4f, \r
}

struct VertexOutput {\r
    @builtin(position) position: vec4f, \r
    @location(0) uv: vec2f, \r
}

struct FragmentInput {\r
    @location(0) uv: vec2f, \r
}

struct PosVel {\r
    position: vec3f, \r
    v: vec3f, \r
}

@group(0) @binding(0) var<storage> particles: array<PosVel>;\r
@group(0) @binding(1) var<uniform> uniforms: RenderUniforms;

@vertex\r
fn vs(    \r
    @builtin(vertex_index) vertex_index: u32, \r
    @builtin(instance_index) instance_index: u32\r
) -> VertexOutput {\r
    var corner_positions = array(\r
        vec2( 0.5,  0.5),\r
        vec2( 0.5, -0.5),\r
        vec2(-0.5, -0.5),\r
        vec2( 0.5,  0.5),\r
        vec2(-0.5, -0.5),\r
        vec2(-0.5,  0.5),\r
    );

    var size = uniforms.sphereSize;\r
    let stretched_position = corner_positions[vertex_index] * size;\r
    let corner = vec3(stretched_position, 0.0);

    let uv = corner_positions[vertex_index] + 0.5;

    let real_position = particles[instance_index].position;\r
    let view_position = (uniforms.viewMatrix * vec4f(real_position, 1.0)).xyz;

    let out_position = uniforms.projectionMatrix * vec4f(view_position + corner, 1.0);

    return VertexOutput(out_position, uv);\r
}

@fragment\r
fn fs(input: FragmentInput) -> @location(0) vec4f {\r
    var normalxy: vec2f = input.uv * 2.0 - 1.0;\r
    var r2: f32 = dot(normalxy, normalxy);\r
    if (r2 > 1.0) {\r
        discard;\r
    }\r
    var thickness: f32 = sqrt(1.0 - r2);\r
    let particle_alpha = 0.05;

    return vec4f(vec3f(particle_alpha * thickness), 1.0);\r
}`,In=`@group(0) @binding(0) var textureSampler: sampler;\r
@group(0) @binding(1) var texture: texture_2d<f32>;\r
@group(0) @binding(2) var<uniform> uniforms: FilterUniforms;\r
@group(0) @binding(3) var<uniform> filterSize: i32;

struct FragmentInput {\r
    @location(0) uv: vec2f,  \r
    @location(1) iuv: vec2f\r
}

struct FilterUniforms {\r
    blurDir: vec2f, \r
}

override thicknessTextureWidth: f32;\r
override thicknessTextureHeight: f32;

@fragment\r
fn fs(input: FragmentInput) -> @location(0) vec4f {\r
    var thickness: f32 = textureSample(texture, textureSampler, input.uv).r;\r
    if (thickness == 0.) {\r
        return vec4f(0., 0., 0., 1.);\r
    }

    var sigma: f32 = f32(filterSize) / 3.0;\r
    var sigmaSquareInv: f32 = 1.0 / (2.0 * sigma * sigma);

    var sum = thickness;\r
    var wsum = 1.;

    let iuv: vec2f = vec2f(thicknessTextureWidth, thicknessTextureHeight) * input.uv;

    for (var x: i32 = 1; x <= filterSize; x++) {\r
        var coords: vec2f = vec2f(f32(x));\r
        var sampledThicknessLeft: f32 = textureLoad(texture, vec2u(iuv - uniforms.blurDir * coords), 0).r;\r
        var sampledThicknessRight: f32 = textureLoad(texture, vec2u(iuv + uniforms.blurDir * coords), 0).r;

        var w: f32 = exp(-f32(x * x) * sigmaSquareInv);

        sum += (sampledThicknessLeft + sampledThicknessRight) * w;\r
        wsum += 2.0 * w;\r
    }

    return vec4f(sum / wsum, 0., 0., 1.);\r
}`,An=`struct VertexOutput {\r
    @builtin(position) position: vec4f, \r
    @location(0) uv: vec2f, \r
    @location(1) viewPosition: vec3f, \r
}

struct FragmentInput {\r
    @location(0) uv: vec2f, \r
    @location(1) viewPosition: vec3f, \r
}

struct FragmentOutput {\r
    
    @location(0) depth: f32, \r
    @builtin(frag_depth) fragDepth: f32, \r
}

struct RenderUniforms {\r
    texelSize: vec2f, \r
    sphereSize: f32, \r
    invProjectionMatrix: mat4x4f, \r
    projectionMatrix: mat4x4f, \r
    viewMatrix: mat4x4f, \r
    invViewMatrix: mat4x4f, \r
}

struct PosVel {\r
    position: vec3f, \r
    v: vec3f, \r
}

@group(0) @binding(0) var<storage> particles: array<PosVel>;\r
@group(0) @binding(1) var<uniform> uniforms: RenderUniforms;

@vertex\r
fn vs(    \r
    @builtin(vertex_index) vertex_index: u32, \r
    @builtin(instance_index) instance_index: u32\r
) -> VertexOutput {\r
    var corner_positions = array(\r
        vec2( 0.5,  0.5),\r
        vec2( 0.5, -0.5),\r
        vec2(-0.5, -0.5),\r
        vec2( 0.5,  0.5),\r
        vec2(-0.5, -0.5),\r
        vec2(-0.5,  0.5),\r
    );

    var size = uniforms.sphereSize;\r
    let stretched_position = corner_positions[vertex_index] * size;\r
    let corner = vec3(stretched_position, 0.0);

    let uv = corner_positions[vertex_index] + 0.5;

    let real_position = particles[instance_index].position;\r
    let view_position = (uniforms.viewMatrix * vec4f(real_position, 1.0)).xyz;

    let out_position = uniforms.projectionMatrix * vec4f(view_position + corner, 1.0);

    return VertexOutput(out_position, uv, view_position);\r
}

@fragment\r
fn fs(input: FragmentInput) -> FragmentOutput {\r
    var out: FragmentOutput;

    var normalxy: vec2f = input.uv * 2.0 - 1.0;\r
    var r2: f32 = dot(normalxy, normalxy);\r
    if (r2 > 1.0) {\r
        discard;\r
    }\r
    var normalz = sqrt(1.0 - r2);\r
    var normal = vec3(normalxy, normalz);

    var radius = uniforms.sphereSize / 2;\r
    var realViewPos: vec4f = vec4f(input.viewPosition + normal * radius, 1.0);\r
    var clipSpacePos: vec4f = uniforms.projectionMatrix * realViewPos;\r
    out.fragDepth = clipSpacePos.z / clipSpacePos.w;\r
    out.depth = realViewPos.z;\r
    return out;\r
}`,Rn=`struct VertexOutput {\r
    @builtin(position) position: vec4f, \r
    @location(0) uv: vec2f, \r
    @location(1) viewPosition: vec3f, \r
    @location(2) speed: f32, \r
}

struct FragmentInput {\r
    @location(0) uv: vec2f, \r
    @location(1) viewPosition: vec3f, \r
    @location(2) speed: f32, \r
}

struct FragmentOutput {\r
    @location(0) depth: f32, \r
    @location(1) color: vec4f, \r
    @builtin(frag_depth) fragDepth: f32, \r
}

struct RenderUniforms {\r
    texelSize: vec2f, \r
    sphereSize: f32, \r
    invProjectionMatrix: mat4x4f, \r
    projectionMatrix: mat4x4f, \r
    viewMatrix: mat4x4f, \r
    invViewMatrix: mat4x4f, \r
}

struct PosVel {\r
    position: vec3f, \r
    v: vec3f, \r
}

@group(0) @binding(0) var<storage> particles: array<PosVel>;\r
@group(0) @binding(1) var<uniform> uniforms: RenderUniforms;

@vertex\r
fn vs(    \r
    @builtin(vertex_index) vertex_index: u32, \r
    @builtin(instance_index) instance_index: u32\r
) -> VertexOutput {\r
    var corner_positions = array(\r
        vec2( 0.5,  0.5),\r
        vec2( 0.5, -0.5),\r
        vec2(-0.5, -0.5),\r
        vec2( 0.5,  0.5),\r
        vec2(-0.5, -0.5),\r
        vec2(-0.5,  0.5),\r
    );

    var size = uniforms.sphereSize;\r
    let stretched_position = corner_positions[vertex_index] * size;\r
    let corner = vec3(stretched_position, 0.0);\r
    let uv = corner_positions[vertex_index] + 0.5;

    let real_position = particles[instance_index].position;\r
    let view_position = (uniforms.viewMatrix * vec4f(real_position, 1.0)).xyz;

    let out_position = uniforms.projectionMatrix * vec4f(view_position + corner, 1.0);

    let speed = length(particles[instance_index].v);\r
    return VertexOutput(out_position, uv, view_position, speed);\r
}

@fragment\r
fn fs(input: FragmentInput) -> FragmentOutput {\r
    var out: FragmentOutput;

    var normalxy: vec2f = input.uv * 2.0 - 1.0;\r
    var r2: f32 = dot(normalxy, normalxy);\r
    if (r2 > 1.0) {\r
        discard;\r
    }\r
    var normalz = sqrt(1.0 - r2);\r
    var normal = vec3(normalxy, normalz);

    var radius = uniforms.sphereSize / 2;\r
    var realViewPos: vec4f = vec4f(input.viewPosition + normal * radius, 1.0);\r
    var clipSpacePos: vec4f = uniforms.projectionMatrix * realViewPos;\r
    out.fragDepth = clipSpacePos.z / clipSpacePos.w;

    out.depth = realViewPos.z;\r
    out.color = vec4f(input.speed, 0, 0, 1.);\r
    return out;\r
}`,On=`@group(0) @binding(0) var envmapTexture: texture_cube<f32>;\r
@group(0) @binding(1) var<uniform> uniforms: RenderUniforms;\r
@group(0) @binding(2) var textureSampler: sampler;

struct RenderUniforms {\r
    texelSize: vec2f, \r
    sphereSize: f32, \r
    invProjectionMatrix: mat4x4f, \r
    projectionMatrix: mat4x4f, \r
    viewMatrix: mat4x4f, \r
    invViewMatrix: mat4x4f, \r
}

struct FragmentInput {\r
    @location(0) uv: vec2f,  \r
    @location(1) iuv: vec2f\r
}

fn computeViewPosFromUVDepth(texCoord: vec2f, depth: f32) -> vec3f {\r
    var ndc: vec4f = vec4f(texCoord.x * 2.0 - 1.0, 1.0 - 2.0 * texCoord.y, 0.0, 1.0);\r
    ndc.z = -uniforms.projectionMatrix[2].z + uniforms.projectionMatrix[3].z / depth;\r
    ndc.w = 1.0;

    var eye_pos: vec4f = uniforms.invProjectionMatrix * ndc;

    return eye_pos.xyz / eye_pos.w;\r
}

fn getCameraPosition() -> vec3f {\r
    return (uniforms.invViewMatrix * vec4(0, 0, 0, 1)).xyz;\r
}

fn rayPlaneIntersection(rayOrigin: vec3f, rayDir: vec3f) -> vec3f {\r
    
    
    

    let t = -rayOrigin.y / rayDir.y;\r
    return rayOrigin + t * rayDir;\r
}

@fragment\r
fn fs(input: FragmentInput) -> @location(0) vec4f {\r
    let cameraPos = getCameraPosition();\r
    let rayDirWorld = normalize((uniforms.invViewMatrix * vec4f(computeViewPosFromUVDepth(input.uv, 1.0), 0.)).xyz); 
    let bgColor = textureSampleLevel(envmapTexture, textureSampler, rayDirWorld, 0.).rgb;\r
    if (abs(rayDirWorld.y) < 1e-6) { 
        return vec4f(bgColor, 1.);\r
    } 

    let t = -cameraPos.y / rayDirWorld.y;\r
    if (t < 0) {\r
        return vec4f(bgColor, 1.);\r
    }\r
    let rayHitPos = cameraPos + t * rayDirWorld;\r
    let gridSize = 16.0;\r
    let lineThickness = 0.2; 

    let isLineX = abs(fract(rayHitPos.x / gridSize - 0.5) - 0.5) < lineThickness / gridSize;\r
    let isLineZ = abs(fract(rayHitPos.z / gridSize - 0.5) - 0.5) < lineThickness / gridSize;\r
    let isLine = isLineX || isLineZ;

    let boardColor = vec3(0.6); \r
    let lineColor = vec3(0.5); \r
    var finalColor = select(boardColor, lineColor, isLine);\r
    finalColor = select(bgColor, finalColor, abs(rayHitPos.x) < 3e2 && abs(rayHitPos.z) < 3e2);\r
    return vec4f(finalColor, 1.);\r
}`,kn=`struct FragmentInput {\r
    @location(0) uv: vec2f,  \r
    @location(1) iuv: vec2f\r
}

struct RenderUniforms {\r
    texelSize: vec2f, \r
    sphereSize: f32, \r
    invProjectionMatrix: mat4x4f, \r
    projectionMatrix: mat4x4f, \r
    viewMatrix: mat4x4f, \r
    invViewMatrix: mat4x4f, \r
}

@group(0) @binding(0) var depthTexture: texture_2d<f32>;\r
@group(0) @binding(1) var densityGridTexture: texture_3d<f32>;\r
@group(0) @binding(2) var<uniform> uniforms: RenderUniforms;\r
@group(0) @binding(3) var<uniform> initBoxSize: vec3f;\r
@group(0) @binding(4) var textureSampler: sampler;\r
@group(0) @binding(5) var bgTexture: texture_2d<f32>;\r
@group(0) @binding(6) var<uniform> densityGridSize: vec3f;

fn computeViewPosFromUVDepth(texCoord: vec2f, depth: f32) -> vec3f {\r
    var ndc: vec4f = vec4f(texCoord.x * 2.0 - 1.0, 1.0 - 2.0 * texCoord.y, 0.0, 1.0);\r
    ndc.z = -uniforms.projectionMatrix[2].z + uniforms.projectionMatrix[3].z / depth;\r
    ndc.w = 1.0;

    var eye_pos: vec4f = uniforms.invProjectionMatrix * ndc;

    return eye_pos.xyz / eye_pos.w;\r
}

fn getViewPosFromTexCoord(texCoord: vec2f, iuv: vec2f) -> vec3f {\r
    var depth: f32 = abs(textureLoad(depthTexture, vec2u(iuv), 0).x);\r
    return computeViewPosFromUVDepth(texCoord, depth);\r
}

fn gamma(v: vec3f) -> vec3f {\r
    return pow(v, vec3(1.0 / 2.2));\r
}

@fragment\r
fn fs(input: FragmentInput) -> @location(0) vec4f {\r
    let depth: f32 = abs(textureLoad(depthTexture, vec2u(input.iuv), 0).r);\r
    if (depth >= 1e4) {\r
        let bgColor: vec3f = textureSampleLevel(bgTexture, textureSampler, input.uv, 0.0).rgb;\r
        return vec4f(bgColor, 0.);\r
    }

    let surfacePosView = computeViewPosFromUVDepth(input.uv, depth);\r
    let rayDirView = normalize(surfacePosView);\r
    var surfacePosWorld = (uniforms.invViewMatrix * vec4f(surfacePosView, 1.)).xyz;\r
    let rayDirWorld = (uniforms.invViewMatrix * vec4f(rayDirView, 0.)).xyz;

    var ddx: vec3f = getViewPosFromTexCoord(input.uv + vec2f(uniforms.texelSize.x, 0.), input.iuv + vec2f(1.0, 0.0)) - surfacePosView; \r
    var ddy: vec3f = getViewPosFromTexCoord(input.uv + vec2f(0., uniforms.texelSize.y), input.iuv + vec2f(0.0, 1.0)) - surfacePosView; \r
    let ddx2: vec3f = surfacePosView - getViewPosFromTexCoord(input.uv + vec2f(-uniforms.texelSize.x, 0.), input.iuv + vec2f(-1.0, 0.0));\r
    let ddy2: vec3f = surfacePosView - getViewPosFromTexCoord(input.uv + vec2f(0., -uniforms.texelSize.y), input.iuv + vec2f(0.0, -1.0));\r
    ddx = select(ddx, ddx2, abs(ddx.z) > abs(ddx2.z));\r
    ddy = select(ddy, ddy2, abs(ddy.z) > abs(ddy2.z));\r
    var normal: vec3f = -normalize(cross(ddx, ddy)); \r
    var normalWorld: vec3f = (uniforms.invViewMatrix * vec4f(normal, 0.)).xyz; 

    var densitySum: f32 = 0.;\r
    var t: f32 = 0.;\r
    let stepSize: f32 = 0.6; \r
    let densityScale: f32 = 0.2; \r
    let lightDirWorld: vec3f = normalize(vec3f(0, 1, 0));

    surfacePosWorld += 1.5 * lightDirWorld; \r
    for (var i = 0; i < 1000; i++) { \r
        let posWorld = surfacePosWorld + t * lightDirWorld;\r
        if (any(posWorld <= vec3f(0.)) || any(posWorld >= initBoxSize - 1)) { \r
            break;\r
        }\r
        let worldCoord: vec3f = posWorld / densityGridSize;\r
        let density: f32 = textureSampleLevel(densityGridTexture, textureSampler, worldCoord.zyx, 0.).r;\r
        densitySum += stepSize * density * densityScale;\r
        t += stepSize;\r
    }\r

    let speed = textureSampleLevel(bgTexture, textureSampler, input.uv, 0.0).r;\r
    let albedo: vec3f = vec3f(0, 70, 250) / 256.;

    let LdotN: f32 = 0.5 * dot(normalWorld, lightDirWorld) + 0.5;\r
    let shadow = exp(-1. * densitySum);

    let H: vec3f        = normalize(lightDirWorld - rayDirWorld);\r
    let specular: f32   = pow(max(0.0, dot(H, normalWorld)), 50.);\r
    let diffuse: f32 = max(dot(normalWorld, lightDirWorld), 0.);\r
    var finalColor = shadow * LdotN * albedo * 1. + 0.1 * diffuse * shadow + 0.3 * specular * shadow;

    return vec4f(gamma(finalColor), 1.); \r
}`;class Ln{constructor(v,G,F,T,z,N,$,b,M,O,X,W,Q){B(this,"depthFilter1DPipeline");B(this,"depthFilter2DPipeline");B(this,"thicknessMapPipeline");B(this,"thicknessFilterPipeline");B(this,"fluidPipeline");B(this,"depthMapPipeline");B(this,"spherePipeline");B(this,"bgColorPipeline");B(this,"densityRaymarchPipeline");B(this,"depthMapTextureView");B(this,"tmpDepthMapTextureView");B(this,"thicknessTextureView");B(this,"tmpThicknessTextureView");B(this,"depthTestTextureView");B(this,"tmpOutputTextureView");B(this,"depthFilter1DBindGroups");B(this,"depthFilter2DBindGroups");B(this,"thicknessMapBindGroup");B(this,"thicknessFilterBindGroups");B(this,"fluidBindGroup");B(this,"depthMapBindGroup");B(this,"sphereBindGroup");B(this,"bgColorBindGroup");B(this,"densityRaymarchBindGroup");B(this,"diffuseColorBuffer");B(this,"colorDensityBuffer");B(this,"densityGridSizeBuffer");B(this,"device");this.device=z;const te=50,re=2*X,ie=35,ee=M.width/2,H=M.height/2,L={screenHeight:M.height,screenWidth:M.width},ne={maxFilterSize:te,projectedParticleConstant:ie*re*.05*(M.height/2)/Math.tan(W/2)},se={thicknessTextureWidth:ee,thicknessTextureHeight:H},J=z.createSampler({magFilter:"linear",minFilter:"linear"}),K=z.createShaderModule({code:Un}),E=z.createShaderModule({code:_n}),Y=z.createShaderModule({code:Vn}),Z=z.createShaderModule({code:An}),ce=z.createShaderModule({code:Rn}),A=z.createShaderModule({code:Fn}),j=z.createShaderModule({code:In}),R=z.createShaderModule({code:On}),xe=z.createShaderModule({code:kn});this.depthMapPipeline=z.createRenderPipeline({label:"depthMap pipeline",layout:"auto",vertex:{module:Z},fragment:{module:Z,targets:[{format:"r32float"}]},primitive:{topology:"triangle-list"},depthStencil:{depthWriteEnabled:!0,depthCompare:"less",format:"depth32float"}}),this.spherePipeline=z.createRenderPipeline({label:"sphere pipeline",layout:"auto",vertex:{module:ce},fragment:{module:ce,targets:[{format:"r32float"},{format:O}]},primitive:{topology:"triangle-list"},depthStencil:{depthWriteEnabled:!0,depthCompare:"less",format:"depth32float"}}),this.depthFilter1DPipeline=z.createRenderPipeline({label:"depth filter pipeline (1d)",layout:"auto",vertex:{module:K,constants:L},fragment:{module:E,constants:{...ne,blur2D:0},targets:[{format:"r32float"}]},primitive:{topology:"triangle-list"}}),this.depthFilter2DPipeline=z.createRenderPipeline({label:"depth filter pipeline (2d)",layout:"auto",vertex:{module:K,constants:L},fragment:{module:E,constants:{...ne,blur2D:1},targets:[{format:"r32float"}]},primitive:{topology:"triangle-list"}}),this.thicknessMapPipeline=z.createRenderPipeline({label:"thickness map pipeline",layout:"auto",vertex:{module:A},fragment:{module:A,targets:[{format:"r16float",writeMask:GPUColorWrite.RED,blend:{color:{operation:"add",srcFactor:"one",dstFactor:"one"},alpha:{operation:"add",srcFactor:"one",dstFactor:"one"}}}]},primitive:{topology:"triangle-list"}}),this.thicknessFilterPipeline=z.createRenderPipeline({label:"thickness filter pipeline",layout:"auto",vertex:{module:K,constants:L},fragment:{module:j,constants:se,targets:[{format:"r16float"}]},primitive:{topology:"triangle-list"}}),this.fluidPipeline=z.createRenderPipeline({label:"fluid rendering pipeline",layout:"auto",vertex:{module:K,constants:L},fragment:{module:Y,targets:[{format:O}]},primitive:{topology:"triangle-list"}}),this.bgColorPipeline=z.createRenderPipeline({label:"bgColor pipeline",layout:"auto",vertex:{module:K,constants:L},fragment:{module:R,targets:[{format:O}]},primitive:{topology:"triangle-list"}}),this.densityRaymarchPipeline=z.createRenderPipeline({label:"density raymarch pipeline",layout:"auto",vertex:{module:K,constants:L},fragment:{module:xe,targets:[{format:O}]}});const le=z.createTexture({label:"temporary depth map texture",size:[M.width,M.height,1],usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.TEXTURE_BINDING,format:"r32float"}),ye=z.createTexture({label:"thickness map texture",size:[ee,H,1],usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.TEXTURE_BINDING,format:"r16float"}),fe=z.createTexture({label:"temporary thickness map texture",size:[ee,H,1],usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.TEXTURE_BINDING,format:"r16float"}),Ge=z.createTexture({size:[M.width,M.height,1],format:"depth32float",usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.TEXTURE_BINDING}),I=z.createTexture({size:[M.width,M.height,1],format:O,usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.TEXTURE_BINDING});this.depthMapTextureView=N,this.tmpDepthMapTextureView=le.createView(),this.thicknessTextureView=ye.createView(),this.tmpThicknessTextureView=fe.createView(),this.depthTestTextureView=Ge.createView(),this.tmpOutputTextureView=I.createView();const ae=z.createBuffer({label:"filter uniform buffer",size:8,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST}),ue=z.createBuffer({label:"filter uniform buffer",size:8,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST}),ge=z.createBuffer({label:"thickness filter size buffer",size:4,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});this.diffuseColorBuffer=z.createBuffer({label:"diffuse color buffer",size:12,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST}),this.colorDensityBuffer=z.createBuffer({label:"color density buffer",size:4,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST}),this.densityGridSizeBuffer=F;let de=new Float32Array([1,0]),me=new Float32Array([0,1]),we=new Int32Array([15]);z.queue.writeBuffer(ae,0,de),z.queue.writeBuffer(ue,0,me),z.queue.writeBuffer(ge,0,we),this.depthFilter1DBindGroups=[],this.depthFilter1DBindGroups=[z.createBindGroup({label:"filterX bind group",layout:this.depthFilter1DPipeline.getBindGroupLayout(0),entries:[{binding:1,resource:this.depthMapTextureView},{binding:2,resource:{buffer:ae}}]}),z.createBindGroup({label:"filterY bind group",layout:this.depthFilter1DPipeline.getBindGroupLayout(0),entries:[{binding:1,resource:this.tmpDepthMapTextureView},{binding:2,resource:{buffer:ue}}]})],this.depthFilter2DBindGroups=[z.createBindGroup({label:"filterX bind group",layout:this.depthFilter2DPipeline.getBindGroupLayout(0),entries:[{binding:1,resource:this.depthMapTextureView},{binding:2,resource:{buffer:ae}}]}),z.createBindGroup({label:"filterY bind group",layout:this.depthFilter2DPipeline.getBindGroupLayout(0),entries:[{binding:1,resource:this.tmpDepthMapTextureView},{binding:2,resource:{buffer:ue}}]})],this.thicknessMapBindGroup=z.createBindGroup({label:"thickness map bind group",layout:this.thicknessMapPipeline.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:G}},{binding:1,resource:{buffer:v}}]}),this.thicknessFilterBindGroups=[],this.thicknessFilterBindGroups=[z.createBindGroup({label:"thickness filterX bind group",layout:this.thicknessFilterPipeline.getBindGroupLayout(0),entries:[{binding:0,resource:J},{binding:1,resource:this.thicknessTextureView},{binding:2,resource:{buffer:ae}},{binding:3,resource:{buffer:ge}}]}),z.createBindGroup({label:"thickness filterY bind group",layout:this.thicknessFilterPipeline.getBindGroupLayout(0),entries:[{binding:0,resource:J},{binding:1,resource:this.tmpThicknessTextureView},{binding:2,resource:{buffer:ue}},{binding:3,resource:{buffer:ge}}]})],this.fluidBindGroup=z.createBindGroup({label:"fluid bind group",layout:this.fluidPipeline.getBindGroupLayout(0),entries:[{binding:0,resource:J},{binding:1,resource:this.depthMapTextureView},{binding:2,resource:{buffer:v}},{binding:3,resource:this.thicknessTextureView},{binding:4,resource:$},{binding:5,resource:this.tmpOutputTextureView},{binding:6,resource:{buffer:this.diffuseColorBuffer}},{binding:7,resource:{buffer:this.colorDensityBuffer}}]}),this.depthMapBindGroup=z.createBindGroup({label:"depthMap bind group",layout:this.depthMapPipeline.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:G}},{binding:1,resource:{buffer:v}}]}),this.bgColorBindGroup=z.createBindGroup({label:"bgColor bind group",layout:this.bgColorPipeline.getBindGroupLayout(0),entries:[{binding:0,resource:$},{binding:1,resource:{buffer:v}},{binding:2,resource:J}]}),this.sphereBindGroup=z.createBindGroup({label:"sphere bind group",layout:this.spherePipeline.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:G}},{binding:1,resource:{buffer:v}}]}),this.densityRaymarchBindGroup=z.createBindGroup({label:"density raymarch bind group",layout:this.densityRaymarchPipeline.getBindGroupLayout(0),entries:[{binding:0,resource:this.depthMapTextureView},{binding:1,resource:b},{binding:2,resource:{buffer:v}},{binding:3,resource:{buffer:T}},{binding:4,resource:J},{binding:5,resource:this.tmpOutputTextureView},{binding:6,resource:{buffer:this.densityGridSizeBuffer}}]}),console.log(this.densityRaymarchPipeline.getBindGroupLayout(0))}execute(v,G,F,T,z,N){const $=new Float32Array(z),b=new Float32Array([N]);this.device.queue.writeBuffer(this.diffuseColorBuffer,0,$),this.device.queue.writeBuffer(this.colorDensityBuffer,0,b);const M=[{colorAttachments:[{view:this.tmpDepthMapTextureView,clearValue:{r:1e6,g:0,b:0,a:1},loadOp:"clear",storeOp:"store"}]},{colorAttachments:[{view:this.depthMapTextureView,clearValue:{r:1e6,g:0,b:0,a:1},loadOp:"clear",storeOp:"store"}]}],O={colorAttachments:[{view:this.thicknessTextureView,clearValue:{r:0,g:0,b:0,a:1},loadOp:"clear",storeOp:"store"}]},X=[{colorAttachments:[{view:this.tmpThicknessTextureView,clearValue:{r:0,g:0,b:0,a:1},loadOp:"clear",storeOp:"store"}]},{colorAttachments:[{view:this.thicknessTextureView,clearValue:{r:0,g:0,b:0,a:1},loadOp:"clear",storeOp:"store"}]}],W={colorAttachments:[{view:this.tmpOutputTextureView,clearValue:{r:0,g:0,b:0,a:0},loadOp:"clear",storeOp:"store"}]},Q={colorAttachments:[{view:v.getCurrentTexture().createView(),clearValue:{r:0,g:0,b:0,a:0},loadOp:"clear",storeOp:"store"}]},te={colorAttachments:[{view:this.depthMapTextureView,clearValue:{r:1e6,g:0,b:0,a:1},loadOp:"clear",storeOp:"store"}],depthStencilAttachment:{view:this.depthTestTextureView,depthClearValue:1,depthLoadOp:"clear",depthStoreOp:"store"}},re={colorAttachments:[{view:this.depthMapTextureView,clearValue:{r:1e6,g:0,b:0,a:1},loadOp:"clear",storeOp:"store"},{view:this.tmpOutputTextureView,loadOp:"load",storeOp:"store"}],depthStencilAttachment:{view:this.depthTestTextureView,depthClearValue:1,depthLoadOp:"clear",depthStoreOp:"store"}},ie={colorAttachments:[{view:v.getCurrentTexture().createView(),clearValue:{r:.7,g:.7,b:.75,a:1},loadOp:"clear",storeOp:"store"}]};if(T){const H=G.beginRenderPass(W);H.setBindGroup(0,this.bgColorBindGroup),H.setPipeline(this.bgColorPipeline),H.draw(6),H.end();const L=G.beginRenderPass(re);L.setBindGroup(0,this.sphereBindGroup),L.setPipeline(this.spherePipeline),L.draw(6,F),L.end();const ne=G.beginRenderPass(ie);ne.setBindGroup(0,this.densityRaymarchBindGroup),ne.setPipeline(this.densityRaymarchPipeline),ne.draw(6),ne.end()}else{const H=G.beginRenderPass(te);H.setBindGroup(0,this.depthMapBindGroup),H.setPipeline(this.depthMapPipeline),H.draw(6,F),H.end();for(var ee=0;ee<2;ee++){const E=G.beginRenderPass(M[0]);E.setBindGroup(0,this.depthFilter1DBindGroups[0]),E.setPipeline(this.depthFilter1DPipeline),E.draw(6),E.end();const Y=G.beginRenderPass(M[1]);Y.setBindGroup(0,this.depthFilter1DBindGroups[1]),Y.setPipeline(this.depthFilter1DPipeline),Y.draw(6),Y.end()}const L=G.beginRenderPass(M[0]);L.setBindGroup(0,this.depthFilter2DBindGroups[0]),L.setPipeline(this.depthFilter2DPipeline),L.draw(6),L.end();const ne=G.beginRenderPass(M[1]);ne.setBindGroup(0,this.depthFilter2DBindGroups[1]),ne.setPipeline(this.depthFilter2DPipeline),ne.draw(6),ne.end();const se=G.beginRenderPass(O);se.setBindGroup(0,this.thicknessMapBindGroup),se.setPipeline(this.thicknessMapPipeline),se.draw(6,F),se.end();for(var ee=0;ee<1;ee++){const Y=G.beginRenderPass(X[0]);Y.setBindGroup(0,this.thicknessFilterBindGroups[0]),Y.setPipeline(this.thicknessFilterPipeline),Y.draw(6),Y.end();const Z=G.beginRenderPass(X[1]);Z.setBindGroup(0,this.thicknessFilterBindGroups[1]),Z.setPipeline(this.thicknessFilterPipeline),Z.draw(6),Z.end()}const J=G.beginRenderPass(W);J.setBindGroup(0,this.bgColorBindGroup),J.setPipeline(this.bgColorPipeline),J.draw(6),J.end();const K=G.beginRenderPass(Q);K.setBindGroup(0,this.fluidBindGroup),K.setPipeline(this.fluidPipeline),K.draw(6),K.end()}}}async function qn(p,v=4e3,G=3e3){if(!navigator.gpu)throw new Error("WebGPU not supported");const F=await navigator.gpu.requestAdapter();if(!F)throw new Error("WebGPU adapter not available");const T=await F.requestDevice(),z=.5;p.width=Math.round(v*z),p.height=Math.round(G*z);const N=p.getContext("webgpu");if(!N)throw new Error("Could not get WebGPU context");const $=navigator.gpu.getPreferredCanvasFormat();N.configure({device:T,format:$,alphaMode:"premultiplied"});const b=204,M=154,O=4,X=b-4,W=M-4,Q=[b,M,O],te=2e5,re=b*M*O,ie=1e7,ee=.5,H=2*ee,L=60*Math.PI/180,ne=T.createBuffer({size:Ae*te,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST}),se=T.createBuffer({size:32*te,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST}),J=T.createBuffer({size:ke.byteLength,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST}),K=T.createBuffer({size:12,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST}),E=T.createTexture({size:[p.width,p.height],format:"r32float",usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.TEXTURE_BINDING}),Y=b,Z=M,ce=Math.ceil(O/128)*128,A=[Y,Z,ce],j=T.createBuffer({size:4*Y*Z*ce,usage:GPUBufferUsage.STORAGE}),R=T.createBuffer({size:2*Y*Z*ce,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC}),xe=T.createBuffer({size:12,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});T.queue.writeBuffer(xe,0,new Float32Array(A));const le=T.createTexture({size:[ce,Z,Y],format:"r16float",dimension:"3d",usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST}),ye=T.createTexture({dimension:"2d",size:[1,1,6],format:"rgba8unorm",usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST|GPUTextureUsage.RENDER_ATTACHMENT}),fe=new Uint8Array([200,200,200,255]);for(let f=0;f<6;f++)T.queue.writeTexture({texture:ye,origin:[0,0,f]},fe,{bytesPerRow:4},[1,1]);const Ge=ye.createView({dimension:"cube"});T.queue.writeBuffer(K,0,new Float32Array(Q));const I=new Sn(ne,se,J,j,R,K,xe,T,E.createView(),p,re,te,ie,H),ae=ee*1.1,ue=new Ln(J,se,xe,K,T,E.createView(),Ge,le.createView(),p,$,ae,L,ie),ge=p.width/p.height,de=We.perspective(L,ge,.1,500);Le.projectionMatrix.set(de),Le.invProjectionMatrix.set(We.inverse(de));const me=[b/2,M/2,O/2],we=W/2/Math.tan(L/2),i=[b/2,M/2,O/2+we],d=We.lookAt(i,me,[0,1,0]);Le.viewMatrix.set(d),Le.invViewMatrix.set(We.inverse(d)),Le.texelSize.set([1/p.width,1/p.height]),Le.sphereSize.set([ae*2]),T.queue.writeBuffer(J,0,ke),I.reset(Q,0);let t=!0,s=!1;function l(){if(!s){if(t){Le.texelSize.set([1/p.width,1/p.height]),Le.sphereSize.set([ae*2]),T.queue.writeBuffer(J,0,ke);const f=T.createCommandEncoder();for(let e=0;e<3;e++)I.execute(f,[0,0],[0,0],0,!1,.4,!0,A);const w=I._drainZoneQueue.length>0;w&&(I.runDrain(f),I.runCopyPosition(f)),ue.execute(N,f,I.numParticles,!1,[.5490196078431373,.8627450980392157,.9411764705882353],.7),T.queue.submit([f.finish()]),w&&I.scheduleCounterReadback()}requestAnimationFrame(l)}}return requestAnimationFrame(l),{addFluid(f,w,e,o=500){const n=f/v,r=w/G,u=e/v;I.addParticles(n,r,u,o,Q)},updateSolidGrid(f){I.updateSolidGrid(f)},drain(f){f>0&&I.numParticles>0&&I.changeNumParticles(Math.max(0,I.numParticles-f))},drainZone(f,w,e,o){if(I.numParticles<=0)return;const n=2,r=n+f/v*X,u=n+(f+e)/v*X,x=n+(1-(w+o)/G)*W,m=n+(1-w/G)*W;I.queueDrainZone(r,x,u-r,m-x)},getParticleCount(){return I.numParticles},setPaused(f){t=!f},destroy(){s=!0,T.destroy()}}}return Re.createSplashEngine=qn,Object.defineProperty(Re,Symbol.toStringTag,{value:"Module"}),Re}({});
