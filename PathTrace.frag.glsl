precision highp float;
varying vec2 uv;
/*
#define SPHERE_COUNT	1
//uniform vec16	Spheres[SPHERE_COUNT];

void main()
{
	float3 Colour = float3(0,0,0);
	gl_FragColor = float4( Colour, 1 );
}
*/

#define M_PI 3.1415926535897932384626433832795
#define BOUNCES	4
#define SAMPLES 8
#define MAX_SPHERES	2
#define MAX_PLANES	5

uniform float4 ViewportPx;
uniform float random_seed;

/* camera attributes are provided by application */
uniform vec3 CameraWorldPos;
uniform vec3 camera_lower_left_corner;
uniform vec3 camera_horizontal;
uniform vec3 camera_vertical;
uniform float camera_lens_radius;
uniform float Time;// = 0;

struct Ray {
	vec3 origin;
	vec3 direction;
};

const int mat_refract = 4;
const int mat_dielectric = 3;
const int mat_metal = 2;
const int mat_lambert = 1;

struct Material
{
	vec3 albedo;
	float fuzz;
	float ref_idx;
	
	/* scatter function can be:
	 1 = lambert
	 2 = metal
	 3 = dielectric
	 */
	int scatter_function;
	float Light;
};

struct HitRecord
{
	float Distance;
	vec3 Position;
	vec3 ExitPosition;
	vec3 normal;
	Material mat;
};
/*
struct Sphere {
	vec3 center;
	float radius;
	Material mat;
};
*/
Material floor_Material = Material(vec3(0.2, 0.4,0.8), 0.0, 0.0, mat_lambert, 0);
Material gray_metal = Material(vec3(0.6, 0.6, 0.8), 0.0001, 0.0, mat_metal, 0);
Material gold_metal = Material(vec3(0.8, 0.6, 0.2), 0.0001, 0.0, mat_metal, 0);
Material dielectric = Material(vec3(0),                0.0, 1.5, mat_dielectric, 0);
Material lambert    = Material(vec3(0.8, 0.8, 0.0),    0.0, 0.0, mat_lambert, 0);

uniform bool Sky_SpotLight;// = false;
uniform vec3 Sky_LightColour;// = vec3(0.9,0.7,0.6);

uniform mat4 Spheres[MAX_SPHERES];
uniform mat4 Planes[MAX_PLANES];



/* returns a varying number between 0 and 1 */
float drand48(vec2 co)
{
	return 2 * fract(sin(dot(co.xy, vec2(12.9898,78.233))) * 43758.5453) - 1;
}

vec3 random_in_unit_disk(vec2 co) {
	vec3 p;
	int n = 0;
	do {
		p = vec3(drand48(co.xy), drand48(co.yx), 0);
		n++;
	} while (dot(p,p) >= 1.0 && n < 3);
	return p;
}

float squared_length(vec3 v) {
	return v.x*v.x + v.y*v.y + v.z*v.z;
}

vec3 random_in_unit_sphere(vec3 p)
{
	int n = 0;
	do {
		p = vec3(drand48(p.xy), drand48(p.zy), drand48(p.xz));
		n++;
	} while(squared_length(p) >= 1.0 && n < 3);
	return p;
}

bool lambertian_scatter(in Material mat, in Ray r, in HitRecord hit, out vec3 attenuation, out Ray scattered)
{
	vec3 target = hit.Position + hit.normal + random_in_unit_sphere(hit.Position);
	scattered = Ray(hit.Position, target - hit.Position);
	attenuation = mat.albedo;
	return true;
}
/*
vec3 reflect(in vec3 v, in vec3 n)
{
	return v - 2 * dot(v, n) * n;
}
*/

vec3 Slerp(vec3 p0, vec3 p1, float t)
{
	float dotp = dot(normalize(p0), normalize(p1));
	if ((dotp > 0.9999) || (dotp<-0.9999))
	{
		if (t<=0.5)
			return p0;
		return p1;
	}
	float theta = acos(dotp);
	vec3 P = ((p0*sin((1-t)*theta) + p1*sin(t*theta)) / sin(theta));
	return P;
}

bool RefractionScatter(in Material mat, in Ray r, in HitRecord hit, out vec3 attenuation, out Ray scattered)
{
	//	for glass, this needs to know how thick the surface of what we hit was, so we know where the "other side" of the hit is
	//	and have the ray come out there
	float RefractionScalar = 0.66;	//	for chromatic abberation, use r=0.65 g=0.66 b=0.67
	vec3 Refracted = refract( normalize(r.direction), normalize(hit.normal), RefractionScalar );
	vec3 Reflected = reflect(normalize(r.direction), normalize(hit.normal) );
	//	perfect, so should make it essentially invisible
	//vec3 Refracted = normalize(r.direction);
	
	//	0..1 are we at perpendicular
	float EdgeDot = (1.0-abs(dot(normalize(r.direction),hit.normal)));
	/*
	EdgeDot=1.0-EdgeDot;
	EdgeDot*=EdgeDot;
	EdgeDot=1.0-EdgeDot;
	*/
	Refracted = Slerp( Refracted, Reflected, EdgeDot );
	
	//	gr: this scatter needs changing for this case
	scattered = Ray( hit.ExitPosition, Refracted + mat.fuzz * random_in_unit_sphere(hit.ExitPosition));
	//scattered = Ray( hit.ExitPosition, Refracted );
	
	//	gr: this attenuation is where we can add chromatic abberation...
	//		kinda need to spawn 3 rays out
	attenuation = mat.albedo;
	//attenuation = vec3(1,1,1);
	
	//	allow odd direction
	//return (dot(scattered.direction, hit.normal) > 0);
	return true;
}

bool metal_scatter(in Material mat, in Ray r, in HitRecord hit, out vec3 attenuation, out Ray scattered)
{
	vec3 reflected = reflect(normalize(r.direction), hit.normal);
	scattered = Ray(hit.Position, reflected + mat.fuzz * random_in_unit_sphere(hit.Position));
	attenuation = mat.albedo;
	return (dot(scattered.direction, hit.normal) > 0);
}

float schlick(in float cosine, in float ref_idx) {
	float r0 = (1 - ref_idx) / (1 + ref_idx);
	r0 = r0 * r0;
	return r0 + (1 - r0) * pow((1 - cosine), 5);
}

bool refract(in vec3 v, in vec3 n, in float ni_over_nt, out vec3 refracted) {
	vec3 uv = normalize(v);
	float dt = dot(uv, n);
	float discriminant = 1.0 - ni_over_nt * ni_over_nt * (1 - dt * dt);
	if (discriminant > 0) {
		refracted = ni_over_nt * (uv - n * dt) - n * sqrt(discriminant);
		return true;
	} else {
		return false;
	}
}

bool dielectric_scatter(in Material mat, in Ray r, in HitRecord hit, out vec3 attenuation, out Ray scattered) {
	vec3 outward_normal;
	vec3 reflected = reflect(r.direction, hit.normal);
	float ni_over_nt;
	attenuation = vec3(1.0, 1.0, 1.0);
	vec3 refracted;
	float reflect_prob;
	float cosine;
	if (dot(r.direction, hit.normal) > 0) {
		outward_normal = - hit.normal;
		ni_over_nt = mat.ref_idx;
		cosine = mat.ref_idx * dot(r.direction, hit.normal) / length(r.direction);
	} else {
		outward_normal = hit.normal;
		ni_over_nt = 1.0 / mat.ref_idx;
		cosine = - dot(r.direction, hit.normal) / length(r.direction);
	}
	if (refract(r.direction, outward_normal, ni_over_nt, refracted)) {
		reflect_prob = schlick(cosine, mat.ref_idx);
	} else {
		reflect_prob = 1.0;
	}
	
	if (drand48(r.direction.xy) < reflect_prob) {
		scattered = Ray(hit.Position, reflected);
	} else {
		scattered = Ray(hit.Position, refracted);
	}
	return true;
}

bool dispatch_scatter(in Ray r, HitRecord hit, out vec3 attenuation, out Ray scattered)
{
	if(hit.mat.scatter_function == mat_dielectric)
	{
		return dielectric_scatter(hit.mat, r, hit, attenuation, scattered);
	}
	else if (hit.mat.scatter_function == mat_metal)
	{
		return metal_scatter(hit.mat, r, hit, attenuation, scattered);
	}
	else if (hit.mat.scatter_function == mat_refract)
	{
		return RefractionScatter(hit.mat, r, hit, attenuation, scattered);
	}
	else
	{
		return lambertian_scatter(hit.mat, r, hit, attenuation, scattered);
	}
}

Ray get_ray(float s, float t)
{
	vec3 rd = camera_lens_radius * random_in_unit_disk(vec2(s,t));
	//vec3 rd = vec3(s,t,0);
	vec3 offset = vec3(s * rd.x, t * rd.y, 0);
	return Ray(CameraWorldPos + offset, camera_lower_left_corner + s * camera_horizontal + t * camera_vertical - CameraWorldPos - offset);
}

vec3 point_at_parameter(Ray r,float t) {
	return r.origin + t * r.direction;
}

vec3 GetSphereCenter(mat4 Sphere)
{
	return Sphere[0].xyz;
}

float GetSphereRadius(mat4 Sphere)
{
	return Sphere[0].w;
}

float3 GetSphereDiffuse(mat4 Sphere)
{
	return Sphere[1].xyz;
}

bool GetSphereGlass(mat4 Sphere)
{
	return Sphere[1].w > 0.5;
}

float GetSphereFuzz(mat4 Sphere)
{
	return Sphere[2].x;
}

float GetSphereLight(mat4 Sphere)
{
	return Sphere[2].y;
}

Material GetSphereMaterial(mat4 Sphere)
{
	bool IsGlass = GetSphereGlass(Sphere);
	float3 Diffuse = GetSphereDiffuse(Sphere);
	Material mat = gold_metal;
	mat.albedo = Diffuse;
	//mat.scatter_function = mat_dielectric;
	mat.scatter_function = IsGlass ? mat_refract : mat_metal;
	mat.fuzz = GetSphereFuzz(Sphere);
	mat.Light = GetSphereLight(Sphere);
	return mat;
}



vec3 GetPlaneNormal(mat4 Sphere)
{
	return GetSphereCenter( Sphere );
}

float GetPlaneOffset(mat4 Sphere)
{
	return GetSphereRadius(Sphere);
}

Material GetPlaneMaterial(mat4 Sphere)
{
	bool IsGlass = GetSphereGlass(Sphere);
	float3 Diffuse = GetSphereDiffuse(Sphere);
	Material mat = floor_Material;
	mat.albedo = Diffuse;
	//mat.scatter_function = mat_dielectric;
	mat.scatter_function = IsGlass ? mat_metal : mat_lambert;
	mat.fuzz = GetSphereFuzz(Sphere);
	mat.Light = GetSphereLight(Sphere);
	return mat;
}

/* Check hit between sphere and ray */
bool sphere_hit(mat4 Sphere, Ray r, float t_min, float t_max, out HitRecord hit)
{
	vec3 SphereCenter = GetSphereCenter(Sphere);
	float SphereRadius = GetSphereRadius(Sphere);
	Material SphereMaterial = GetSphereMaterial(Sphere);
	
	//	nearest point on line
	vec3 oc = r.origin - SphereCenter;
	float a = dot(r.direction, r.direction);
	float b = dot(oc, r.direction);
	float c = dot(oc, oc) - SphereRadius * SphereRadius;
	float discriminant = b*b - a*c;
	//	if discriminat is 0, it literally hits the edge (only one intesrection point as they're so close
	//	<0 then miss
	//	so anything over 0 has two intersection points
	if (discriminant > 0)
	{
		//	get enter & exit rays
		//	/a puts it into direction-normalised
		float EnterTime = (-b - sqrt(b*b-a*c)) /a;
		float ExitTime = (-b + sqrt(b*b-a*c)) /a;
		
		//	gr: these if()s check it's in our best-case limit, but this check should be outside
		
		if (EnterTime < t_max && EnterTime > t_min)
		{
			hit.Distance = EnterTime;
			hit.Position = point_at_parameter(r, hit.Distance);
			hit.ExitPosition = point_at_parameter(r, ExitTime);
			
			hit.normal = (hit.Position - SphereCenter) / SphereRadius;
			hit.mat = SphereMaterial;
			return true;
		}

		if (ExitTime < t_max && ExitTime > t_min)
		{
			hit.Distance = ExitTime;
			hit.Position = point_at_parameter(r, hit.Distance);
			hit.ExitPosition = point_at_parameter(r, EnterTime);
			
			hit.normal = (hit.Position - SphereCenter) / SphereRadius;
			hit.mat = SphereMaterial;
			return true;
		}
	}
	return false;
}

float sdPlane( vec3 p, vec4 n )
{
	// n must be normalized
	return dot(p,n.xyz) + n.w;
}

bool plane_hit(mat4 Plane, Ray r, float t_min, float t_max, out HitRecord hit)
{
	vec3 PlaneNormal = GetPlaneNormal(Plane);
	if ( PlaneNormal == vec3(0,0,0) )
		return false;
	float PlaneOffset = GetPlaneOffset(Plane);
	Material PlaneMaterial = GetPlaneMaterial(Plane);
	
	//	https://gist.github.com/doxas/e9a3d006c7d19d2a0047
	float PlaneDistance = -PlaneOffset;
	float Denom = dot( r.direction, PlaneNormal);
	float t = -(dot( r.origin, PlaneNormal) + PlaneDistance) / Denom;

	//	wrong side, enable for 2 sided
	//if ( t <= 0 )		return false;
	
	if (t < t_min || t > t_max)
		return false;
	
	//float t = (-FloorY - r.origin.y) / r.direction.y;
	//if (t < t_min || t > t_max)
	//	return false;
	
	hit.Distance = t;
	hit.Position = point_at_parameter(r, t);
	hit.mat = PlaneMaterial;
	hit.normal = PlaneNormal;
	return true;
}

/* Check all objects in world for hit with ray */
bool world_hit(Ray r, float t_min, float t_max, out HitRecord hit)
{
	HitRecord temp_hit;
	bool hit_anything = false;
	float closest_so_far = t_max;
	
	for (int i = 0; i <MAX_SPHERES; i++)
	{
		if (sphere_hit(Spheres[i], r, t_min, closest_so_far, temp_hit))
		{
			hit_anything = true;
			hit = temp_hit;
			closest_so_far = temp_hit.Distance;
		}
	}
	
	for (int i = 0; i <MAX_PLANES; i++)
	{
		if (plane_hit(Planes[i], r, t_min, closest_so_far, temp_hit))
		{
			hit_anything = true;
			hit = temp_hit;
			closest_so_far = temp_hit.Distance;
		}
	}
	
	return hit_anything;
}


vec3 DirectLightSample(Ray r)
{
	//	gr: probably should be on each ray
	//	but lets just let the renderer do one
	
	//	get light pos
	//	make this an object, or test all light objects
	vec3 LightPosition = vec3(0,4,0);
	//vec3 ld = sampleLight( r.origin, seed ) - ro;
	vec3 ld = LightPosition - r.origin;
	
	Ray LightRay;
	LightRay.origin = r.origin;
	LightRay.direction = normalize(ld);
	
	//	do we hit any objects?
	HitRecord hit;
	if ( world_hit(LightRay, 0.001, 1.0 / 0.0, hit) )
	{
		if ( hit.Distance < length(ld) )
			return vec3(0,0,0);
	}
	
	float t = 1;
	vec3 BlendedColour = ((1.0-t)*vec3(1.0,1.0,1.0)+t*Sky_LightColour);
	return BlendedColour;
	/*
		
	if( !specularBounce && j < EYEPATHLENGTH-1 && !intersectShadow( ro, nld, length(ld)) ) {
	 
	 float cos_a_max = sqrt(1. - clamp(lightSphere.w * lightSphere.w / dot(lightSphere.xyz-ro, lightSphere.xyz-ro), 0., 1.));
	 float weight = 2. * (1. - cos_a_max);
	 
	 tcol += (fcol * LIGHTCOLOR) * (weight * clamp(dot( nld, normal ), 0., 1.));
	 }
	 }
	 */

}

vec3 color(Ray r)
{
	HitRecord hit;
	vec3 col = vec3(0, 0, 0); /* visible color */
	vec3 total_attenuation = vec3(1.0, 1.0, 1.0); /* reduction of light transmission */
	vec3 Light = vec3(0,0,0);
	float LightSamples = 1;
	

	for (int bounce = 0; bounce < BOUNCES; bounce++)
	{
		/*
		if ( bounce < BOUNCES-1 )
		{
			Light += DirectLightSample(r);
			LightSamples += 1;
		}
		*/
		
		if (world_hit(r, 0.001, 1.0 / 0.0, hit))
		{
			// create a new reflected ray
			Ray scattered;
			vec3 local_attenuation;
			
			if (dispatch_scatter(r, hit, local_attenuation, scattered))
			{
				total_attenuation *= local_attenuation;
				r = scattered;
			}
			else
			{
				total_attenuation *= vec3(0,0,0);
				//col += Light;
			}
			
		}
		else
		{
			// background hit (light source)
			vec3 unit_dir = normalize(r.direction);
			float t = 0.5 * (unit_dir.y + 1.0);
			if ( !Sky_SpotLight )
				t = 1.0;
			vec3 BlendedColour = ((1.0-t)*vec3(1.0,1.0,1.0)+t*Sky_LightColour);
			col = total_attenuation * BlendedColour;
			Light = vec3(0,0,0);
			break;
		}
	}
	
	return col + (Light/LightSamples);
}

void main()
{
	//	gr: this works!
	/*
	float u = uv.x;
	float v = uv.y;
	Ray r = get_ray(u, v);
	vec3 col = color(r);
	gl_FragColor = vec4(col, 1.0);
	//*/
	
	/*
	float Noise = drand48(uv);
	if ( Noise > 0.01 && Noise < 0.99 )
		gl_FragColor = float4( 0,1,0, 1 );
	else
		gl_FragColor = float4( Noise, Noise, Noise, 1 );
	return;
	 */
	
	vec3 col = vec3(0,0,0);
	float u, v;
	Ray r;
	const int nsamples = SAMPLES;
	for (int s = 0; s < nsamples; s++)
	{
		float2 Noise;
		Noise.x = s;
		Noise.y = s;
		Noise.x = drand48( col.xy + Noise );
		Noise.y = drand48( col.xz + Noise );
		Noise -= 0.5;
		Noise /= ViewportPx.zw;
		//Noise = vec2(0,0);
		
		float2 ScreenUv = uv + Noise;
		ScreenUv.y = 1.0 - ScreenUv.y;
		
		r = get_ray( ScreenUv.x, ScreenUv.y );
		col += color(r);
	}
	
	col /= float(nsamples);
	col = vec3(sqrt(col.x),sqrt(col.y),sqrt(col.z));
	
	gl_FragColor = vec4(col, 1.0);
	//*/
}
