/////////////
// PRIMITIVES
/////////////

float sdPlane( const in vec3 p ) {
  return p.y;
}

float sdSphere(const in vec3 p, const in float s ) {
    return length(p)-s;
}

float sdBox(const in vec3 p, const in vec3 b ) {
  vec3 d = abs(p) - b;
  return min(max(d.x, max(d.y, d.z)), 0.0) + length(max(d, 0.0));
}

float sdEllipsoid(const in  vec3 p, const in vec3 r ) {
    return (length(p/r) - 1.0) * min(min(r.x, r.y), r.z);
}

float udRoundBox(const in  vec3 p, const in vec3 b, const in float r ) {
  return length(max(abs(p) - b, 0.0)) - r;
}

float sdTorus(const in vec3 p, const in vec2 t ) {
  return length(vec2(length(p.xz) - t.x, p.y)) - t.y;
}

////////////
// OPERATORS
////////////

float opS(const in float d1, const in float d2 ) {
    return max(-d2, d1);
}

vec2 opU(const in vec2 d1, const in vec2 d2) {
  return (d1.x < d2.x) ? d1 : d2;
}

////////////
// HELPERS
////////////

vec2 map(const in vec3 point) {
  %ID_MAP
}

vec2 castRay(const in vec3 ro, const in vec3 rd) {
  float tmin = 1.0;
  float tmax = 200.0;

  float precis = 0.02;
  float t = tmin;
  float m = -1.0;
  for( int i = 0; i < 50; i++ ) {
    vec2 res = map( ro + rd * t );
    if( res.x < precis || t > tmax ) break;
    t += res.x;
    m = res.y;
  }

  if( t > tmax ) m = -1.0;
  return vec2( t, m );
}

vec3 calcNormal(const in vec3 pos) {
  vec3 eps = vec3( 0.001, 0.0, 0.0 );
  vec3 nor = vec3(
      map(pos + eps.xyy).x - map(pos - eps.xyy).x,
      map(pos + eps.yxy).x - map(pos - eps.yxy).x,
      map(pos + eps.yyx).x - map(pos - eps.yyx).x );
  return normalize(nor);
}

vec3 render(const in vec3 ro, const in vec3 rd) {
  vec3 col = vec3(0.5, 0.5, 0.5);
  vec2 res = castRay(ro, rd);
  float t = res.x;
  float m = res.y;

  if( m > 0.0 ) {
    vec3 pos = ro + t * rd;
    vec3 nor = calcNormal( pos );

    vec3 lig = normalize( vec3(-0.6, 0.7, -0.5) );
    col = vec3(0.0);
    col += 1.20 * clamp(dot(nor, lig), 0.0, 1.0) * vec3(1.00, 0.90, 0.60);
    col += 0.30 * clamp(0.5 + 0.5 * nor.y, 0.0, 1.0) * vec3(0.50, 0.70, 1.00);
  }

  return clamp(col, 0.0, 1.0);
}

// https://www.shadertoy.com/view/Xds3zN
vec3 raymarch(const in vec3 origin, const in mat3 view, const in vec2 uv, const in vec2 invSize) {
  vec2 p = -1.0 + 2.0 * uv;
  p.x *= invSize.y / invSize.x;
  vec3 rd = view * normalize(vec3(p, 2.0));
  return render(origin, rd);
}