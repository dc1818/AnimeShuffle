/** Browsers expose no universal hardware-acceleration switch. Fail closed when
 * an accelerated renderer cannot be verified; never collect/send renderer data. */
export function supportsBackgroundMotion(doc = document) {
  let gl;
  try {
    const canvas = doc.createElement("canvas");
    gl = canvas.getContext("webgl", {
      failIfMajorPerformanceCaveat: true,
      antialias: false,
      depth: false,
      stencil: false,
    });
    if (!gl) return false;
    const info = gl.getExtension("WEBGL_debug_renderer_info");
    if (!info) return false;
    const renderer = String(
      gl.getParameter(info.UNMASKED_RENDERER_WEBGL) || "",
    );
    return (
      !!renderer &&
      !/swiftshader|llvmpipe|softpipe|software|basic render|warp\b/i.test(
        renderer,
      )
    );
  } catch {
    return false;
  } finally {
    try {
      gl?.getExtension("WEBGL_lose_context")?.loseContext();
    } catch {}
  }
}
