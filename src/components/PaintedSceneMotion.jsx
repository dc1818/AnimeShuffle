import { useEffect, useRef } from "react";

// Coordinates are authored against the paintings, before responsive cover cropping.
// Only these regions move; the camera, architecture and surrounding pixels stay fixed.
const FRAGMENT = `
precision mediump float;
uniform sampler2D artwork;
uniform vec2 viewport;
uniform float time;
uniform int scene;
varying vec2 screen;
float region(vec2 p, vec2 center, vec2 radius) {
  return 1.0-smoothstep(.65,1.0,length((p-center)/radius));
}
void main() {
  vec2 p=screen;
  float aspect=viewport.x/viewport.y;
  float imageAspect=1672.0/941.0;
  if(aspect>imageAspect) p.y=(p.y-.5)*imageAspect/aspect+.5;
  else p.x=(p.x-.5)*aspect/imageAspect+.5;
  vec2 q=p;
  float light=0.0;
  if(scene==0) {
    // River below the bridge; banks and bridge excluded.
    float width=mix(.18,.37,clamp((p.y-.68)/.32,0.0,1.0));
    float water=smoothstep(.67,.72,p.y)*(1.0-smoothstep(width-.035,width,abs(p.x-.53)));
    q.x+=water*.006*sin(p.y*155.0-time*2.7);
    q.y+=water*.002*sin(p.x*95.0+time*1.8);
    // Blossom clusters, avoiding the large tree trunks and houses.
    float leaves=max(region(p,vec2(.29,.16),vec2(.22,.17)),region(p,vec2(.78,.14),vec2(.19,.16)));
    q.x+=leaves*.004*sin(time*1.5+p.y*18.0);
    q.y+=leaves*.002*sin(time*1.8+p.x*22.0);
  } else if(scene==1) {
    float water=region(p,vec2(.705,.547),vec2(.19,.055));
    q.x+=water*.004*sin(p.y*240.0-time*2.0);
    // Actual lanterns/windows: vary their painted light, not random specks.
    light=region(p,vec2(.18,.265),vec2(.013,.025))
      +region(p,vec2(.095,.505),vec2(.016,.025))
      +region(p,vec2(.12,.645),vec2(.018,.025))
      +region(p,vec2(.44,.77),vec2(.045,.05))
      +region(p,vec2(.80,.89),vec2(.025,.04));
  } else if(scene==2) {
    float falls=region(p,vec2(.63,.565),vec2(.027,.06));
    q.y+=falls*.009*sin(p.y*130.0-time*4.0);
    q.x+=falls*.0015*sin(p.y*200.0-time*3.0);
    float mist=region(p,vec2(.46,.77),vec2(.21,.09));
    q.x+=mist*.006*sin(time*.65+p.y*14.0);
    light=region(p,vec2(.94,.53),vec2(.016,.035));
  } else if(scene==3) {
    // Planetary cloud bands. The cruiser, dock, moon and planet limb stay still.
    float clouds=region(p,vec2(.76,.39),vec2(.19,.25));
    q.x+=clouds*.005*sin(time*.5+p.y*12.0);
    q.y+=clouds*.002*sin(time*.6+p.x*18.0);
    light=region(p,vec2(.158,.461),vec2(.025,.014));
  } else {
    // Waterfalls inside the painted island edges; no movement of the islands.
    float falls=max(region(p,vec2(.451,.525),vec2(.013,.105)),
      region(p,vec2(.659,.52),vec2(.014,.085)));
    falls=max(falls,region(p,vec2(.911,.585),vec2(.014,.06)));
    q.y+=falls*.012*sin(p.y*160.0-time*4.8);
    q.x+=falls*.0015*sin(p.y*230.0-time*3.0);
    float clouds=region(p,vec2(.73,.87),vec2(.16,.12));
    q.x+=clouds*.007*sin(time*.65+p.y*14.0);
    float leaves=region(p,vec2(.035,.30),vec2(.035,.12));
    q.x+=leaves*.004*sin(time*1.7+p.y*20.0);
  }
  vec4 color=texture2D(artwork,q);
  // Brighten the existing colored light, without adding dots or changing geometry.
  color.rgb*=1.0+light*(.18+.18*sin(time*2.3)+.06*sin(time*7.1));
  gl_FragColor=color;
}`;
const VERTEX = `attribute vec2 position; varying vec2 screen;
void main(){screen=vec2((position.x+1.0)*.5,(1.0-position.y)*.5);gl_Position=vec4(position,0.,1.);}`;
const SCENES = ["sakura", "skyline", "mountains", "orbit", "skyislands"];

export function PaintedSceneMotion({ mode, active }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!active) return;
    const canvas = ref.current;
    const gl = canvas.getContext("webgl", {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      failIfMajorPerformanceCaveat: true,
    });
    if (!gl) return;
    let frame,
      disposed = false,
      ready = false,
      blocked = false,
      elapsed = 0,
      previous = 0;
    const shaders = [];
    let program, buffer, texture;
    const stop = () => {
      cancelAnimationFrame(frame);
      previous = 0;
    };
    const lost = (event) => {
      event.preventDefault();
      ready = false;
      stop();
      canvas.style.opacity = "0";
    };
    canvas.addEventListener("webglcontextlost", lost);
    try {
      program = gl.createProgram();
      for (const [type, source] of [
        [gl.VERTEX_SHADER, VERTEX],
        [gl.FRAGMENT_SHADER, FRAGMENT],
      ]) {
        const shader = gl.createShader(type);
        shaders.push(shader);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
          throw Error("Scene shader unavailable");
        gl.attachShader(program, shader);
      }
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS))
        throw Error("Scene renderer unavailable");
      gl.useProgram(program);
      buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
        gl.STATIC_DRAW,
      );
      const position = gl.getAttribLocation(program, "position");
      gl.enableVertexAttribArray(position);
      gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
      gl.uniform1i(
        gl.getUniformLocation(program, "scene"),
        SCENES.indexOf(mode),
      );
      const clock = gl.getUniformLocation(program, "time");
      const size = gl.getUniformLocation(program, "viewport");
      const draw = (now) => {
        if (disposed || blocked || !ready) return;
        if (!previous || now - previous >= 1000 / 24) {
          elapsed += previous ? Math.min(now - previous, 100) / 1000 : 0;
          previous = now;
          gl.uniform1f(clock, elapsed);
          gl.drawArrays(gl.TRIANGLES, 0, 6);
          canvas.style.opacity = "1";
        }
        frame = requestAnimationFrame(draw);
      };
      const resize = () => {
        const { width, height } = canvas.getBoundingClientRect();
        // Bound fragment work independently of high-DPI screen resolution.
        const scale = Math.min(1, 1600 / Math.max(width, height));
        canvas.width = Math.max(1, Math.round(width * scale));
        canvas.height = Math.max(1, Math.round(height * scale));
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.uniform2f(size, width || 1, height || 1);
      };
      const observer = new ResizeObserver(resize);
      observer.observe(canvas);
      resize();
      const update = () => {
        blocked = document.hidden || !!document.querySelector("dialog[open]");
        stop();
        if (!blocked && ready && !disposed) frame = requestAnimationFrame(draw);
      };
      const dialogs = new MutationObserver(update);
      dialogs.observe(document.body, {
        subtree: true,
        attributes: true,
        attributeFilter: ["open"],
      });
      document.addEventListener("visibilitychange", update);
      const img = new Image();
      img.onload = () => {
        if (disposed) return;
        texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texImage2D(
          gl.TEXTURE_2D,
          0,
          gl.RGBA,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          img,
        );
        ready = true;
        update();
      };
      img.src = `/backgrounds/${mode}-painted.webp`;
      return () => {
        disposed = true;
        stop();
        observer.disconnect();
        dialogs.disconnect();
        document.removeEventListener("visibilitychange", update);
        canvas.removeEventListener("webglcontextlost", lost);
        canvas.style.opacity = "0";
        if (texture) gl.deleteTexture(texture);
        gl.deleteBuffer(buffer);
        gl.deleteProgram(program);
        shaders.forEach((s) => gl.deleteShader(s));
      };
    } catch {
      // Original painting stays visible if a driver cannot compile the effect.
      canvas.style.opacity = "0";
      if (buffer) gl.deleteBuffer(buffer);
      if (program) gl.deleteProgram(program);
      shaders.forEach((s) => gl.deleteShader(s));
      canvas.removeEventListener("webglcontextlost", lost);
    }
  }, [mode, active]);
  return (
    <canvas ref={ref} className="painted-scene-motion" aria-hidden="true" />
  );
}
