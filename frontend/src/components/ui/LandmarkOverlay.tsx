import { useRef, useEffect, useCallback, useState } from 'react';

interface LandmarkOverlayProps {
  landmarks: number[][] | null;
  videoEl: HTMLVideoElement | null;
  enabled: boolean;
}

const PNP_INDICES = new Set([1, 152, 33, 263, 61, 291]);
const PNP_COLOR = '#FB923C';
const MESH_COLOR = 'rgba(56, 189, 248, 0.4)';
const FULL_MESH_COLOR = 'rgba(56, 189, 248, 0.15)';
const IRIS_COLOR = 'rgba(52, 211, 153, 0.7)';

const FACE_OVAL = [
  10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288,
  397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136,
  172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109, 10,
];

const L_EYE = [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246, 33];
const R_EYE = [362, 382, 381, 380, 374, 373, 390, 249, 263, 466, 388, 387, 386, 385, 384, 398, 362];
const L_BROW = [46, 53, 52, 65, 55];
const R_BROW = [276, 283, 282, 295, 285];
const NOSE = [168, 6, 197, 195, 5, 4, 1, 19, 94, 2];
const NOSE_BOTTOM = [98, 97, 2, 326, 327];
const LIPS_OUTER = [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291, 409, 270, 269, 267, 0, 37, 39, 40, 185, 61];
const LIPS_INNER = [78, 191, 80, 81, 82, 13, 312, 311, 310, 415, 308, 324, 318, 402, 317, 14, 87, 178, 88, 95, 78];

const CONTOURS: number[][] = [
  FACE_OVAL, L_EYE, R_EYE, L_BROW, R_BROW, NOSE, NOSE_BOTTOM, LIPS_OUTER, LIPS_INNER,
];

const MESH_EDGES: [number, number][] = [
  [1,2],[1,5],[2,3],[2,8],[2,32],[3,4],[4,5],[5,6],[6,7],[7,8],[8,9],[9,10],
  [10,11],[10,152],[11,12],[12,13],[13,14],[14,15],[15,16],[16,17],[17,18],[18,19],
  [19,20],[20,21],[21,22],[22,23],[23,24],[24,25],[25,26],[26,27],[27,28],[28,29],
  [29,30],[30,31],[31,32],[32,33],[33,34],[33,246],[34,35],[35,36],[36,37],[37,38],
  [37,39],[38,39],[39,40],[40,41],[41,42],[42,43],[43,44],[44,45],[45,46],[46,47],
  [47,48],[48,49],[49,50],[50,51],[51,52],[52,53],[53,54],[54,55],[55,56],[56,57],
  [57,58],[58,59],[59,60],[60,61],[61,62],[61,146],[62,63],[63,64],[64,65],[65,66],
  [66,67],[67,68],[68,69],[69,70],[70,71],[71,72],[72,73],[73,74],[74,75],[75,76],
  [76,77],[77,78],[78,79],[78,191],[79,80],[80,81],[81,82],[82,83],[83,84],[84,85],
  [85,86],[86,87],[87,88],[88,89],[89,90],[90,91],[91,92],[92,93],[93,94],[94,95],
  [95,96],[96,97],[97,98],[97,326],[98,99],[99,100],[100,101],[101,102],[102,103],
  [103,104],[104,105],[105,106],[106,107],[107,108],[108,109],[109,110],[110,111],
  [111,112],[112,113],[113,114],[114,115],[115,116],[116,117],[117,118],[118,119],
  [119,120],[120,121],[121,122],[122,123],[123,124],[124,125],[125,126],[126,127],
  [127,128],[128,129],[129,130],[130,131],[131,132],[132,133],[133,134],[133,173],
  [134,135],[135,136],[136,137],[137,138],[138,139],[139,140],[140,141],[141,142],
  [142,143],[143,144],[144,145],[145,146],[146,147],[147,148],[148,149],[149,150],
  [150,151],[151,152],[152,153],[153,154],[154,155],[155,156],[156,157],[157,158],
  [158,159],[159,160],[160,161],[161,162],[162,163],[163,164],[164,165],[165,166],
  [166,167],[167,168],[168,169],[169,170],[170,171],[171,172],[172,173],[173,174],
  [174,175],[175,176],[176,177],[177,178],[178,179],[179,180],[180,181],[181,182],
  [182,183],[183,184],[184,185],[185,186],[186,187],[187,188],[188,189],[189,190],
  [190,191],[191,192],[192,193],[193,194],[194,195],[195,196],[196,197],[197,198],
  [198,199],[199,200],[200,201],[201,202],[202,203],[203,204],[204,205],[205,206],
  [206,207],[207,208],[208,209],[209,210],[210,211],[211,212],[212,213],[213,214],
  [214,215],[215,216],[216,217],[217,218],[218,219],[219,220],[220,221],[221,222],
  [222,223],[223,224],[224,225],[225,226],[226,227],[227,228],[228,229],[229,230],
  [230,231],[231,232],[232,233],[233,234],[234,235],[235,236],[236,237],[237,238],
  [238,239],[239,240],[240,241],[241,242],[242,243],[243,244],[244,245],[245,246],
  [246,247],[247,248],[248,249],[249,250],[250,251],[251,252],[252,253],[253,254],
  [254,255],[255,256],[256,257],[257,258],[258,259],[259,260],[260,261],[261,262],
  [262,263],[263,264],[264,265],[265,266],[266,267],[267,268],[268,269],[269,270],
  [270,271],[271,272],[272,273],[273,274],[274,275],[275,276],[276,277],[277,278],
  [278,279],[279,280],[280,281],[281,282],[282,283],[283,284],[284,285],[285,286],
  [286,287],[287,288],[288,289],[289,290],[290,291],[291,292],[292,293],[293,294],
  [294,295],[295,296],[296,297],[297,298],[298,299],[299,300],[300,301],[301,302],
  [302,303],[303,304],[304,305],[305,306],[306,307],[307,308],[308,309],[309,310],
  [310,311],[311,312],[312,313],[313,314],[314,315],[315,316],[316,317],[317,318],
  [318,319],[319,320],[320,321],[321,322],[322,323],[323,324],[324,325],[325,326],
  [326,327],[327,328],[328,329],[329,330],[330,331],[331,332],[332,333],[333,334],
  [334,335],[335,336],[336,337],[337,338],[338,339],[339,340],[340,341],[341,342],
  [342,343],[343,344],[344,345],[345,346],[346,347],[347,348],[348,349],[349,350],
  [350,351],[351,352],[352,353],[353,354],[354,355],[355,356],[356,357],[357,358],
  [358,359],[359,360],[360,361],[361,362],[362,363],[363,364],[364,365],[365,366],
  [366,367],[367,368],[368,369],[369,370],[370,371],[371,372],[372,373],[373,374],
  [374,375],[375,376],[376,377],[377,378],[378,379],[379,380],[380,381],[381,382],
  [382,383],[383,384],[384,385],[385,386],[386,387],[387,388],[388,389],[389,390],
  [390,391],[391,392],[392,393],[393,394],[394,395],[395,396],[396,397],[397,398],
  [398,399],[399,400],[400,401],[401,402],[402,403],[403,404],[404,405],[405,406],
  [406,407],[407,408],[408,409],[409,410],[410,411],[411,412],[412,413],[413,414],
  [414,415],[415,416],[416,417],[417,418],[418,419],[419,420],[420,421],[421,422],
  [422,423],[423,424],[424,425],[425,426],[426,427],[427,428],[428,429],[429,430],
  [430,431],[431,432],[432,433],[433,434],[434,435],[435,436],[436,437],[437,438],
  [438,439],[439,440],[440,441],[441,442],[442,443],[443,444],[444,445],[445,446],
  [446,447],[447,448],[448,449],[449,450],[450,451],[451,452],[452,453],[453,454],
  [454,455],[455,456],[456,457],[457,458],[458,459],[459,460],[460,461],[461,462],
  [462,463],[463,464],[464,465],[465,466],[466,467],
];

function drawPolyline(
  ctx: CanvasRenderingContext2D,
  lms: number[][],
  indices: number[],
  w: number,
  h: number,
  color: string,
  lineWidth: number,
) {
  if (indices.length < 2) return;
  ctx.beginPath();
  const [sx, sy] = lms[indices[0]];
  ctx.moveTo(sx * w, sy * h);
  for (let i = 1; i < indices.length; i++) {
    const [x, y] = lms[indices[i]];
    ctx.lineTo(x * w, y * h);
  }
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.stroke();
}

export function LandmarkOverlay({ landmarks, videoEl, enabled }: LandmarkOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const [fullMesh, setFullMesh] = useState(false);
  const toggleKey = 'landmark-fullmesh';

  useEffect(() => {
    const saved = sessionStorage.getItem(toggleKey);
    if (saved) setFullMesh(saved === 'true');
  }, []);

  const toggleMesh = useCallback(() => {
    setFullMesh((v) => {
      const next = !v;
      sessionStorage.setItem(toggleKey, String(next));
      return next;
    });
  }, []);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !videoEl || !landmarks || landmarks.length < 50) {
      rafRef.current = requestAnimationFrame(draw);
      return;
    }

    const rect = videoEl.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const w = Math.round(rect.width * dpr);
    const h = Math.round(rect.height * dpr);

    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, w, h);

    if (fullMesh) {
      for (const [i, j] of MESH_EDGES) {
        if (i < landmarks.length && j < landmarks.length) {
          const [x1, y1] = landmarks[i];
          const [x2, y2] = landmarks[j];
          ctx.beginPath();
          ctx.moveTo(x1 * w, y1 * h);
          ctx.lineTo(x2 * w, y2 * h);
          ctx.strokeStyle = FULL_MESH_COLOR;
          ctx.lineWidth = 0.5;
          ctx.stroke();
        }
      }
    }

    for (const contour of CONTOURS) {
      drawPolyline(ctx, landmarks, contour, w, h, MESH_COLOR, fullMesh ? 0.8 : 1);
    }

    for (let i = 0; i < landmarks.length; i++) {
      const [x, y] = landmarks[i];
      const px = x * w;
      const py = y * h;
      if (PNP_INDICES.has(i)) {
        ctx.beginPath();
        ctx.arc(px, py, 4, 0, Math.PI * 2);
        ctx.fillStyle = PNP_COLOR;
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      } else if (!fullMesh) {
        ctx.fillStyle = MESH_COLOR;
        ctx.fillRect(px - 0.5, py - 0.5, 1, 1);
      }
    }

    if (landmarks.length >= 478) {
      for (let i = 468; i <= 477; i++) {
        const [x, y] = landmarks[i];
        ctx.beginPath();
        ctx.arc(x * w, y * h, 2, 0, Math.PI * 2);
        ctx.fillStyle = IRIS_COLOR;
        ctx.fill();
      }
    }

    rafRef.current = requestAnimationFrame(draw);
  }, [landmarks, videoEl, fullMesh]);

  useEffect(() => {
    if (!enabled) {
      cancelAnimationFrame(rafRef.current);
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
      return;
    }

    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [enabled, draw]);

  useEffect(() => {
    if (!videoEl || !canvasRef.current) return;
    const ro = new ResizeObserver(() => {
      if (!videoEl || !canvasRef.current) return;
      const dpr = window.devicePixelRatio || 1;
      const rect = videoEl.getBoundingClientRect();
      canvasRef.current.width = Math.round(rect.width * dpr);
      canvasRef.current.height = Math.round(rect.height * dpr);
      canvasRef.current.style.width = `${rect.width}px`;
      canvasRef.current.style.height = `${rect.height}px`;
    });
    ro.observe(videoEl);
    return () => ro.disconnect();
  }, [videoEl]);

  return (
    <>
      <canvas
        ref={canvasRef}
        className="pointer-events-none absolute inset-0 z-10"
        aria-hidden="true"
      />
      <button
        onClick={(e) => { e.stopPropagation(); toggleMesh(); }}
        className="absolute bottom-2 right-2 z-20 rounded-md bg-black/40 px-2 py-0.5 font-mono text-[9px] text-text-muted hover:text-text-secondary transition-colors"
        title={fullMesh ? 'Switch to minimal overlay' : 'Switch to full mesh overlay'}
      >
        {fullMesh ? 'mesh:full' : 'mesh:min'}
      </button>
    </>
  );
}
